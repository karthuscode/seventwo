import { supabase } from './supabaseClient'
export { isSafeNotificationDestination } from '../utils/notifications'

export interface NotificationPreferences {
  pollsEnabled: boolean
  remindersEnabled: boolean
  sessionUpdatesEnabled: boolean
}

export interface PushCapability {
  configured: boolean
  supported: boolean
  isIOS: boolean
  isStandalone: boolean
  permission: NotificationPermission | 'unsupported'
}

export const defaultNotificationPreferences: NotificationPreferences = {
  pollsEnabled: true,
  remindersEnabled: true,
  sessionUpdatesEnabled: true,
}

// VAPID public keys are designed to be distributed to browsers. The env value
// supports local/staging overrides; production falls back to SevenTwo's public key.
const publicVapidKey = (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined)
  || 'BGgD6qUR9nVtfdeXEFpnGWsvCphpzh-t5Zd6AYJoGF-AdtnTqsz2OYjIkbOpRqZXyG9wK_zJPXIXfyWB_qkmAdk'

export function getPushCapability(): PushCapability {
  const isIOS = isIOSDevice()
  const isStandalone = isStandaloneApp()
  const supported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
  return {
    configured: Boolean(publicVapidKey),
    supported,
    isIOS,
    isStandalone,
    permission: supported ? Notification.permission : 'unsupported',
  }
}

export async function loadNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  if (!supabase) return defaultNotificationPreferences
  const { data, error } = await supabase.from('notification_preferences')
    .select('polls_enabled, reminders_enabled, session_updates_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? {
    pollsEnabled: data.polls_enabled,
    remindersEnabled: data.reminders_enabled,
    sessionUpdatesEnabled: data.session_updates_enabled,
  } : defaultNotificationPreferences
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is required for notifications.')
  const { error } = await supabase.from('notification_preferences').upsert({
    user_id: userId,
    polls_enabled: preferences.pollsEnabled,
    reminders_enabled: preferences.remindersEnabled,
    session_updates_enabled: preferences.sessionUpdatesEnabled,
  })
  if (error) throw error
}

export async function currentDeviceIsSubscribed(): Promise<boolean> {
  if (!getPushCapability().supported) return false
  const registration = await navigator.serviceWorker.ready
  return Boolean(await registration.pushManager.getSubscription())
}

export async function refreshCurrentPushSubscription(): Promise<boolean> {
  if (!supabase || !getPushCapability().supported || Notification.permission !== 'granted') return false
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return false
  await registerSubscription(subscription)
  return true
}

export async function enablePushNotifications(userId: string): Promise<void> {
  const capability = getPushCapability()
  if (!capability.configured) throw new Error('Push notifications are not configured for this build.')
  if (!capability.supported) throw new Error('Web Push is not supported in this browser.')
  if (capability.isIOS && !capability.isStandalone) {
    throw new Error('Add SevenTwo to your Home Screen before enabling notifications.')
  }
  if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked in browser or system settings.')
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicVapidKey!),
  })
  await registerSubscription(subscription)
  await saveNotificationPreferences(userId, await loadNotificationPreferences(userId))
}

export async function disablePushNotificationsForDevice(): Promise<void> {
  if (!supabase || !getPushCapability().supported) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  const unsubscribed = await subscription.unsubscribe()
  if (!unsubscribed) throw new Error('This browser could not disable the push subscription.')
  const { error } = await supabase.rpc('disable_push_subscription', {
    target_endpoint: endpoint,
  })
  if (error) throw error
}

async function registerSubscription(subscription: PushSubscription): Promise<void> {
  if (!supabase) throw new Error('Supabase is required for notifications.')
  const value = subscription.toJSON()
  const p256dh = value.keys?.p256dh
  const auth = value.keys?.auth
  if (!value.endpoint || !p256dh || !auth) throw new Error('The browser returned an incomplete push subscription.')
  const { error } = await supabase.rpc('register_push_subscription', {
    target_endpoint: value.endpoint,
    target_p256dh: p256dh,
    target_auth: auth,
    target_user_agent: navigator.userAgent,
  })
  if (error) throw error
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches
    || navigatorWithStandalone.standalone === true
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}
