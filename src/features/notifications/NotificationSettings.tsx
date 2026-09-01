import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { useAuth } from '../../hooks/useAuth'
import {
  currentDeviceIsSubscribed,
  defaultNotificationPreferences,
  disablePushNotificationsForDevice,
  enablePushNotifications,
  getPushCapability,
  loadNotificationPreferences,
  refreshCurrentPushSubscription,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '../../services/pushNotifications'

export function NotificationSettings({ eligible }: { eligible: boolean }) {
  const { user } = useAuth()
  const [capability, setCapability] = useState(getPushCapability)
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) return
      try {
        const nextPreferences = await loadNotificationPreferences(user.id)
        let subscribed = false
        const currentCapability = getPushCapability()
        if (eligible && currentCapability.supported && currentCapability.permission === 'granted') {
          subscribed = await refreshCurrentPushSubscription()
        } else if (currentCapability.supported) {
          subscribed = await currentDeviceIsSubscribed()
        }
        if (!cancelled) {
          setPreferences(nextPreferences)
          setIsSubscribed(subscribed)
          setCapability(getPushCapability())
        }
      } catch (caughtError) {
        if (!cancelled) setError(toMessage(caughtError))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [eligible, user])

  async function enable() {
    if (!user) return
    await run(async () => {
      await enablePushNotifications(user.id)
      setCapability(getPushCapability())
      setIsSubscribed(true)
    }, 'Notifications enabled on this device.')
  }

  async function disable() {
    await run(async () => {
      await disablePushNotificationsForDevice()
      setIsSubscribed(false)
    }, 'Notifications disabled on this device.')
  }

  async function toggle(key: keyof NotificationPreferences) {
    if (!user) return
    const next = { ...preferences, [key]: !preferences[key] }
    setPreferences(next)
    await run(
      () => saveNotificationPreferences(user.id, next),
      'Notification preferences updated.',
      () => setPreferences(preferences),
    )
  }

  async function run(action: () => Promise<void>, success: string, rollback?: () => void) {
    setIsSaving(true); setError(''); setMessage('')
    try { await action(); setMessage(success) }
    catch (caughtError) { rollback?.(); setError(toMessage(caughtError)); setCapability(getPushCapability()) }
    finally { setIsSaving(false) }
  }

  const setupBlockedOnIOS = capability.isIOS && !capability.isStandalone
  const permissionDenied = capability.permission === 'denied'
  const canEnable = eligible && capability.configured && capability.supported
    && !setupBlockedOnIOS && !permissionDenied

  return (
    <section className="glass-surface rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label">Notifications</p>
          <p className="mt-2 text-sm text-ink-secondary">
            Push notifications <strong className="text-ink">{isSubscribed ? 'Enabled' : 'Not enabled'}</strong>
          </p>
        </div>
        {isSubscribed ? <span className="rounded-md bg-emerald-400/8 px-2 py-1 text-[9px] font-black tracking-[0.12em] text-positive">ON</span> : null}
      </div>

      {!eligible ? <p className="mt-4 text-sm text-ink-muted">A linked registered Player is required for workspace notifications.</p> : null}
      {eligible && !capability.configured ? <p className="mt-4 text-sm text-warning">Push notifications are not configured for this build.</p> : null}
      {eligible && !capability.supported && !setupBlockedOnIOS ? <p className="mt-4 text-sm text-ink-muted">This browser does not support Web Push.</p> : null}
      {eligible && setupBlockedOnIOS ? (
        <div className="mt-5 space-y-3 text-sm leading-6 text-ink-secondary">
          <p className="font-bold text-ink">Install SevenTwo before enabling notifications</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open SevenTwo in Safari.</li>
            <li>Tap Share, then Add to Home Screen.</li>
            <li>Open SevenTwo from the new Home Screen icon.</li>
            <li>Return to Profile → Notifications.</li>
          </ol>
        </div>
      ) : null}
      {eligible && permissionDenied ? <p className="mt-4 text-sm text-warning">Notifications are blocked. Re-enable them in your browser or system settings.</p> : null}

      {!isLoading && canEnable && !isSubscribed ? <Button className="mt-5" onClick={() => void enable()} disabled={isSaving}>Enable notifications</Button> : null}

      {isSubscribed ? (
        <div className="mt-5 divide-y divide-line/70 border-t border-line/70">
          <PreferenceToggle label="Polls" checked={preferences.pollsEnabled} disabled={isSaving} onToggle={() => void toggle('pollsEnabled')} />
          <PreferenceToggle label="Reminders" checked={preferences.remindersEnabled} disabled={isSaving} onToggle={() => void toggle('remindersEnabled')} />
          <PreferenceToggle label="Session updates" checked={preferences.sessionUpdatesEnabled} disabled={isSaving} onToggle={() => void toggle('sessionUpdatesEnabled')} />
          <button type="button" disabled={isSaving} onClick={() => void disable()} className="mt-4 min-h-11 text-sm font-bold text-ink-muted transition hover:text-ink disabled:opacity-50">Disable on this device</button>
        </div>
      ) : null}
      {message ? <p role="status" className="mt-4 text-sm text-positive">{message}</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-red-300">{error}</p> : null}
    </section>
  )
}

function PreferenceToggle({ label, checked, disabled, onToggle }: { label: string; checked: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2">
      <span className="text-sm font-bold text-ink">{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={`${label} notifications`} disabled={disabled} onClick={onToggle} className={`relative h-7 w-12 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 ${checked ? 'bg-ink' : 'bg-white/10'}`}>
        <span className={`absolute left-1 top-1 size-5 rounded-full transition-transform ${checked ? 'translate-x-5 bg-app-bg' : 'translate-x-0 bg-ink-muted'}`} />
      </button>
    </div>
  )
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Notification setup failed.'
}
