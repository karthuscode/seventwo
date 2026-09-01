import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import webPush from 'npm:web-push@3.6.7'

interface NotificationEventRow {
  id: string
  user_id: string
  title: string
  body: string
  destination: string
  logical_key: string
  attempts: number
}

interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface DeliveryRow {
  id: string
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'INVALID' | 'FAILED'
  attempts: number
  available_at: string
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok')
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 })

  try {
    const dispatchSecret = requiredSecret('NOTIFICATION_DISPATCH_SECRET')
    if (!constantTimeEqual(request.headers.get('X-SevenTwo-Dispatch-Secret') ?? '', dispatchSecret)) {
      return Response.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    const supabaseUrl = requiredSecret('SUPABASE_URL')
    const serviceRoleKey = requiredSecret('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const body = await readBody(request)

    if (body.configure === true) {
      const { error } = await admin.rpc('configure_notification_dispatch', {
        target_project_url: supabaseUrl,
        target_dispatch_secret: dispatchSecret,
      })
      if (error) throw error
      return Response.json({ configured: true })
    }

    webPush.setVapidDetails(
      'https://seventwo.pages.dev',
      requiredSecret('WEB_PUSH_VAPID_PUBLIC_KEY'),
      requiredSecret('WEB_PUSH_VAPID_PRIVATE_KEY'),
    )

    const { data: enqueued, error: enqueueError } = await admin.rpc(
      'enqueue_due_notification_reminders',
      { target_now: new Date().toISOString() },
    )
    if (enqueueError) throw enqueueError

    const { data: claimed, error: claimError } = await admin.rpc(
      'claim_notification_events',
      { target_limit: 25 },
    )
    if (claimError) throw claimError

    const results = { sent: 0, cancelled: 0, failed: 0, retried: 0, devices: 0 }
    for (const event of (claimed ?? []) as NotificationEventRow[]) {
      await dispatchEvent(admin, event, results)
    }

    return Response.json({ enqueued: Number(enqueued ?? 0), claimed: claimed?.length ?? 0, ...results })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Notification dispatch failed.' }, { status: 500 })
  }
})

async function dispatchEvent(
  admin: SupabaseClient,
  event: NotificationEventRow,
  results: { sent: number; cancelled: number; failed: number; retried: number; devices: number },
) {
  if (!isSafeDestination(event.destination)) {
    await finishEvent(admin, event.id, 'FAILED', 'Unsafe notification destination.')
    results.failed += 1
    return
  }

  const { data: deliverable, error: deliverableError } = await admin.rpc(
    'notification_event_is_deliverable',
    { target_event_id: event.id },
  )
  if (deliverableError) throw deliverableError
  if (!deliverable) {
    await finishEvent(admin, event.id, 'CANCELLED')
    results.cancelled += 1
    return
  }

  const { data, error: subscriptionError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', event.user_id)
    .is('disabled_at', null)
  if (subscriptionError) throw subscriptionError
  const subscriptions = (data ?? []) as PushSubscriptionRow[]
  let needsRetry = false
  let deliveredDevices = 0

  for (const subscription of subscriptions) {
    const delivery = await claimDelivery(admin, event.id, subscription.id)
    if (!delivery) continue
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({
          title: event.title,
          body: event.body,
          destination: event.destination,
          tag: event.logical_key,
        }),
        { TTL: 86_400, urgency: 'normal' },
      )
      await Promise.all([
        admin.from('notification_deliveries').update({
          status: 'SENT', processed_at: new Date().toISOString(), last_error: null,
        }).eq('id', delivery.id),
        admin.from('push_subscriptions').update({
          last_success_at: new Date().toISOString(), disabled_at: null,
        }).eq('id', subscription.id),
      ])
      deliveredDevices += 1
    } catch (error) {
      const statusCode = pushStatusCode(error)
      const message = pushErrorMessage(error)
      if (statusCode === 404 || statusCode === 410) {
        await Promise.all([
          admin.from('push_subscriptions').update({ disabled_at: new Date().toISOString() })
            .eq('id', subscription.id),
          admin.from('notification_deliveries').update({
            status: 'INVALID', processed_at: new Date().toISOString(), last_error: message,
          }).eq('id', delivery.id),
        ])
      } else if (isTemporaryFailure(statusCode) && delivery.attempts < 5) {
        const availableAt = new Date(Date.now() + 5 * 60_000).toISOString()
        await admin.from('notification_deliveries').update({
          status: 'PENDING', available_at: availableAt, last_error: message,
        }).eq('id', delivery.id)
        needsRetry = true
      } else {
        await admin.from('notification_deliveries').update({
          status: 'FAILED', processed_at: new Date().toISOString(), last_error: message,
        }).eq('id', delivery.id)
      }
    }
  }

  results.devices += deliveredDevices
  if (needsRetry && event.attempts < 5) {
    await admin.from('notification_events').update({
      status: 'PENDING',
      available_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      last_error: 'A device delivery will be retried.',
    }).eq('id', event.id)
    results.retried += 1
  } else {
    await finishEvent(admin, event.id, 'SENT')
    results.sent += 1
  }
}

async function claimDelivery(
  admin: SupabaseClient,
  eventId: string,
  subscriptionId: string,
): Promise<DeliveryRow | null> {
  const { data: existing, error: existingError } = await admin
    .from('notification_deliveries')
    .select('id, status, attempts, available_at')
    .eq('event_id', eventId)
    .eq('subscription_id', subscriptionId)
    .maybeSingle()
  if (existingError) throw existingError

  if (existing) {
    const delivery = existing as DeliveryRow
    if (delivery.status !== 'PENDING' || new Date(delivery.available_at).getTime() > Date.now()) {
      return null
    }
    const { data, error } = await admin.from('notification_deliveries').update({
      status: 'PROCESSING', attempts: delivery.attempts + 1,
    }).eq('id', delivery.id).eq('status', 'PENDING')
      .select('id, status, attempts, available_at').maybeSingle()
    if (error) throw error
    return data as DeliveryRow | null
  }

  const { data, error } = await admin.from('notification_deliveries').insert({
    event_id: eventId,
    subscription_id: subscriptionId,
    status: 'PROCESSING',
    attempts: 1,
  }).select('id, status, attempts, available_at').single()
  if (error?.code === '23505') return null
  if (error) throw error
  return data as DeliveryRow
}

async function finishEvent(
  admin: SupabaseClient,
  eventId: string,
  status: 'SENT' | 'CANCELLED' | 'FAILED',
  lastError: string | null = null,
) {
  const { error } = await admin.from('notification_events').update({
    status,
    processed_at: new Date().toISOString(),
    last_error: lastError,
  }).eq('id', eventId)
  if (error) throw error
}

function isSafeDestination(value: string): boolean {
  return /^\/plans\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isTemporaryFailure(statusCode: number): boolean {
  return statusCode === 0 || statusCode === 408 || statusCode === 429 || statusCode >= 500
}

function pushStatusCode(error: unknown): number {
  return typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number((error as { statusCode: unknown }).statusCode) || 0
    : 0
}

function pushErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Web Push delivery failed.'
  return message.slice(0, 500)
}

function requiredSecret(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}
