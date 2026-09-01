import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import {
  confirmedNotificationRecipients,
  isSafeNotificationDestination,
  isThreeHourReminderDue,
  localDateKey,
  milestoneLogicalKey,
  reachedNotificationMilestones,
} from '../src/utils/notifications.ts'

assert.deepEqual(reachedNotificationMilestones(1), [])
assert.deepEqual(reachedNotificationMilestones(2), [])
assert.deepEqual(reachedNotificationMilestones(3), [3])
assert.deepEqual(reachedNotificationMilestones(5), [3])
assert.deepEqual(reachedNotificationMilestones(6), [3, 6])
assert.notEqual(milestoneLogicalKey('option-a', 3, 'user'), milestoneLogicalKey('option-b', 3, 'user'))
assert.equal(milestoneLogicalKey('option-a', 6, 'user'), milestoneLogicalKey('option-a', 6, 'user'))

assert.equal(isThreeHourReminderDue('2026-09-01T17:00:00Z', '2026-09-01T14:00:00Z'), true)
assert.equal(isThreeHourReminderDue('2026-09-01T17:00:00Z', '2026-09-01T13:59:59Z'), false)
assert.equal(isThreeHourReminderDue('2026-09-01T17:00:00Z', '2026-09-01T17:00:00Z'), false)
assert.equal(localDateKey('2026-01-01T22:30:00Z', 'Europe/Bucharest'), '2026-01-02')
assert.equal(localDateKey('2026-07-01T21:30:00Z', 'Europe/Bucharest'), '2026-07-02')

const recipients = confirmedNotificationRecipients(
  [
    { id: 'available', userId: 'registered-available' },
    { id: 'maybe', userId: 'registered-maybe' },
    { id: 'guest', userId: null },
  ],
  [
    { optionId: 'confirmed', playerId: 'available', response: 'AVAILABLE' },
    { optionId: 'confirmed', playerId: 'maybe', response: 'MAYBE' },
    { optionId: 'confirmed', playerId: 'guest', response: 'AVAILABLE' },
  ],
  'confirmed',
)
assert.deepEqual(recipients, ['registered-available'])
assert.equal(isSafeNotificationDestination('/plans/123e4567-e89b-42d3-a456-426614174000'), true)
assert.equal(isSafeNotificationDestination('https://example.com/plans/123e4567-e89b-42d3-a456-426614174000'), false)
assert.equal(isSafeNotificationDestination('/sessions/123e4567-e89b-42d3-a456-426614174000'), false)

const migration = source('../supabase/migrations/20260904000000_phase5_push_notifications.sql')
assert.match(migration, /unique \(event_id, subscription_id\)/, 'Each logical event must deliver at most once per device.')
assert.match(migration, /logical_key text not null unique/, 'Logical notifications need persistent idempotency.')
assert.match(migration, /'milestone:' \|\| new\.option_id/, 'Milestones must be keyed independently per timeslot.')
assert.match(migration, /'daily_reminder:' \|\| item\.plan_id/, 'Daily reminders need user, plan, and local-date keys.')
assert.match(migration, /'three_hour:' \|\| item\.option_id/, 'Three-hour reminders must be keyed per user and timeslot.')
assert.match(migration, /at time zone workspace\.timezone/, 'Daily scheduling must use the workspace timezone.')
assert.match(migration, /player\.user_id is not null/, 'Confirmation must exclude unregistered Players.')
assert.match(migration, /recipient\.user_id/, 'Recipients must be derived server-side.')
assert.doesNotMatch(migration, /membership\.role in \('OWNER', 'HOST'\)/, 'Notification recipients must not depend on role.')
assert.match(migration, /endpoint text not null unique/, 'Subscription registration must be idempotent by endpoint.')
assert.match(migration, /push_subscriptions_active_user_idx/, 'Multiple active device subscriptions must be supported.')
assert.match(migration, /status = 'PENDING'.*for update skip locked/s, 'Concurrent workers must claim events atomically.')

const worker = source('../public/push-sw.js')
assert.match(worker, /visibilityState === 'visible'/, 'Foreground windows should receive an in-app event.')
assert.match(worker, /SEVENTWO_PUSH/, 'Foreground pushes need one app message.')
assert.match(worker, /notificationclick/, 'Push clicks need deep-link handling.')

await verifyWorkerBehavior(worker)

console.log('Notification checks passed.')

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

async function verifyWorkerBehavior(workerSource: string) {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const messages: unknown[] = []
  const shown: Array<{ title: string; options: Record<string, unknown> }> = []
  const navigations: string[] = []
  let focusCount = 0
  let windows: Array<Record<string, unknown>> = []

  const context = {
    URL,
    Promise,
    JSON,
    self: {
      location: { origin: 'https://seventwo.pages.dev' },
      addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
        listeners.set(type, listener)
      },
      clients: {
        async matchAll() { return windows },
        async openWindow(url: string) { navigations.push(url); return null },
      },
      registration: {
        async showNotification(title: string, options: Record<string, unknown>) {
          shown.push({ title, options })
        },
      },
    },
  }
  runInNewContext(workerSource, context)

  const validDestination = '/plans/123e4567-e89b-42d3-a456-426614174000'
  windows = [{
    visibilityState: 'visible',
    url: 'https://seventwo.pages.dev/',
    postMessage(message: unknown) { messages.push(message) },
  }]
  await emit('push', {
    data: { json: () => ({ title: 'New poker poll', body: 'Vote now.', destination: validDestination }) },
  })
  assert.equal(messages.length, 1, 'Foreground delivery should create one in-app message.')
  assert.equal(shown.length, 0, 'Foreground delivery must not also create an OS notification.')

  windows = []
  await emit('push', {
    data: { json: () => ({ title: 'Poker night confirmed', body: 'Friday at 20:00.', destination: validDestination }) },
  })
  assert.equal(shown.length, 1, 'A background page should receive an OS notification.')
  assert.equal((shown[0].options.data as { destination: string }).destination, validDestination)

  await emit('push', {
    data: { json: () => ({ title: 'Unsafe link', body: 'Fallback.', destination: 'https://evil.example/' }) },
  })
  assert.equal((shown[1].options.data as { destination: string }).destination, '/', 'Unsafe links must fall back to the app root.')

  windows = [{
    visibilityState: 'hidden',
    url: 'https://seventwo.pages.dev/',
    async navigate(url: string) { navigations.push(url) },
    async focus() { focusCount += 1 },
  }]
  await emit('notificationclick', {
    notification: {
      data: { destination: validDestination },
      close() {},
    },
  })
  assert.equal(navigations.at(-1), `https://seventwo.pages.dev${validDestination}`)
  assert.equal(focusCount, 1, 'Notification clicks should focus an existing SevenTwo window.')

  async function emit(type: string, fields: Record<string, unknown>) {
    const listener = listeners.get(type)
    assert.ok(listener, `Missing ${type} listener.`)
    let pending: Promise<unknown> | undefined
    listener({ ...fields, waitUntil(value: Promise<unknown>) { pending = value } })
    await pending
  }
}
