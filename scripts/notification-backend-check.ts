import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

loadEnvironment('.env.local')
const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const dispatchSecret = process.env.NOTIFICATION_DISPATCH_SECRET
if (!url || !anonKey || !dispatchSecret) {
  throw new Error('Supabase and dispatcher test configuration is unavailable.')
}

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
const password = `Push-${crypto.randomUUID()}-aA1!`
const owner = await registeredClient('owner')
const player = await registeredClient('player')
const host = await registeredClient('host')
const outsider = await registeredClient('outsider')
const ownerUser = await currentUser(owner)
const playerUser = await currentUser(player)
const hostUser = await currentUser(host)
const workspace = await createWorkspace(owner, `Push QA ${runId}`)

try {
  await joinWorkspace(player, workspace.accessCode, `Player ${runId.slice(-8)}`)
  await joinWorkspace(host, workspace.accessCode, `Host ${runId.slice(-8)}`)
  assertNoError(await owner.from('workspace_members').update({ role: 'HOST' })
    .eq('workspace_id', workspace.workspace.id).eq('user_id', hostUser.id))

  await setPreferences(owner, ownerUser.id, true, false, true)
  await setPreferences(player, playerUser.id, true, false, true)
  await setPreferences(host, hostUser.id, false, false, true)

  const playerRoster = await roster(owner, workspace.workspace.id)
  const ownerPlayer = requiredPlayer(playerRoster, ownerUser.id)
  const linkedPlayer = requiredPlayer(playerRoster, playerUser.id)
  const linkedHost = requiredPlayer(playerRoster, hostUser.id)

  const endpointA = `https://push.invalid/${runId}/a`
  const endpointB = `https://push.invalid/${runId}/b`
  await registerTestSubscription(player, endpointA)
  await registerTestSubscription(player, endpointA)
  await registerTestSubscription(player, endpointB)
  assert.equal((await ownSubscriptions(player)).length, 2)
  const endpointTakeover = await owner.rpc('register_push_subscription', {
    target_endpoint: endpointA,
    target_p256dh: 'C'.repeat(88),
    target_auth: 'D'.repeat(24),
    target_user_agent: 'Endpoint takeover probe',
  })
  assert.ok(endpointTakeover.error, 'A browser endpoint must not be reassigned to another account.')
  assert.equal((await visibleSubscription(owner, endpointA)).length, 0)
  assert.equal((await visibleSubscription(outsider, endpointA)).length, 0)
  assert.equal((await preferencesFor(owner, playerUser.id)).length, 0)
  assert.equal((await preferencesFor(player, ownerUser.id)).length, 0)
  assertNoError(await player.rpc('disable_push_subscription', { target_endpoint: endpointA }))
  assertNoError(await player.rpc('disable_push_subscription', { target_endpoint: endpointB }))

  const deniedEvent = await player.from('notification_events').insert({
    workspace_id: workspace.workspace.id,
    user_id: playerUser.id,
    category: 'POLLS',
    event_type: 'NEW_POLL',
    plan_id: crypto.randomUUID(),
    logical_key: `forged:${runId}`,
    title: 'Forged',
    body: 'Forged',
    destination: `/plans/${crypto.randomUUID()}`,
  })
  assert.ok(deniedEvent.error)
  const deniedClaim = await player.rpc('claim_notification_events', { target_limit: 25 })
  assert.ok(deniedClaim.error)
  assert.equal(await unauthorizedDispatchStatus(), 401)

  await avoidCronBoundary()
  const planId = crypto.randomUUID()
  const optionA = crypto.randomUUID()
  const optionB = crypto.randomUUID()
  await insertPlan(owner, workspace.workspace.id, ownerUser.id, planId, [
    [optionA, new Date(Date.now() + 4 * 86_400_000).toISOString()],
    [optionB, new Date(Date.now() + 5 * 86_400_000).toISOString()],
  ])
  assert.equal((await dispatch()).claimed, 1, 'Only the enabled non-creator should receive the new Poll event.')
  assert.equal((await dispatch()).claimed, 0, 'New Poll retries must be idempotent.')

  await setPreferences(host, hostUser.id, true, false, true)
  await vote(owner, workspace.workspace.id, planId, optionA, ownerPlayer.id, ownerUser.id, 'AVAILABLE')
  await vote(player, workspace.workspace.id, planId, optionA, linkedPlayer.id, playerUser.id, 'AVAILABLE')
  await vote(host, workspace.workspace.id, planId, optionA, linkedHost.id, hostUser.id, 'AVAILABLE')
  assert.equal((await dispatch()).claimed, 3, 'The 3-player milestone should notify every enabled registered role.')
  assert.equal((await dispatch()).claimed, 0)

  await vote(host, workspace.workspace.id, planId, optionA, linkedHost.id, hostUser.id, 'MAYBE')
  await vote(host, workspace.workspace.id, planId, optionA, linkedHost.id, hostUser.id, 'AVAILABLE')
  assert.equal((await dispatch()).claimed, 0, 'A repeated upward crossing must not resend milestone 3.')

  const guests = await addGuests(owner, workspace.workspace.id, runId, 3)
  for (const guest of guests) {
    await vote(owner, workspace.workspace.id, planId, optionA, guest.id, ownerUser.id, 'AVAILABLE')
  }
  assert.equal((await dispatch()).claimed, 3, 'The 6-player milestone should be emitted once per registered recipient.')
  assert.equal((await dispatch()).claimed, 0)

  await vote(owner, workspace.workspace.id, planId, optionB, ownerPlayer.id, ownerUser.id, 'AVAILABLE')
  await vote(player, workspace.workspace.id, planId, optionB, linkedPlayer.id, playerUser.id, 'AVAILABLE')
  await vote(host, workspace.workspace.id, planId, optionB, linkedHost.id, hostUser.id, 'AVAILABLE')
  assert.equal((await dispatch()).claimed, 3, 'A second timeslot needs its own milestone event.')
  assert.equal((await dispatch()).claimed, 0)

  await vote(host, workspace.workspace.id, planId, optionA, linkedHost.id, hostUser.id, 'MAYBE')
  await setPreferences(player, playerUser.id, true, false, false)
  assertNoError(await owner.from('event_plans').update({
    status: 'CONFIRMED', confirmed_option_id: optionA,
  }).eq('id', planId).eq('workspace_id', workspace.workspace.id))
  assert.equal((await dispatch()).claimed, 1, 'Confirmation must respect Session updates preferences and AVAILABLE votes.')
  assert.equal((await dispatch()).claimed, 0, 'Confirmation retries must be idempotent.')

  await avoidCronBoundary()
  const cronPlanId = crypto.randomUUID()
  await insertPlan(owner, workspace.workspace.id, ownerUser.id, cronPlanId, [
    [crypto.randomUUID(), new Date(Date.now() + 6 * 86_400_000).toISOString()],
  ])
  await waitForCronDispatch()
  assert.equal((await dispatch()).claimed, 0, 'The scheduled Supabase Cron dispatcher must process queued events.')
  assertNoError(await owner.from('event_plans').update({ status: 'CANCELLED' })
    .eq('id', cronPlanId).eq('workspace_id', workspace.workspace.id))

  await setPreferences(owner, ownerUser.id, false, true, true)
  await setPreferences(player, playerUser.id, false, true, false)
  await setPreferences(host, hostUser.id, false, false, true)
  await avoidCronBoundary()
  const reminderPlanId = crypto.randomUUID()
  const nearOptionId = crypto.randomUUID()
  const farOptionId = crypto.randomUUID()
  await insertPlan(owner, workspace.workspace.id, ownerUser.id, reminderPlanId, [
    [nearOptionId, new Date(Date.now() + 2.9 * 60 * 60_000).toISOString()],
    [farOptionId, new Date(Date.now() + 30 * 60 * 60_000).toISOString()],
  ])
  await vote(owner, workspace.workspace.id, reminderPlanId, nearOptionId, ownerPlayer.id, ownerUser.id, 'AVAILABLE')
  await vote(owner, workspace.workspace.id, reminderPlanId, farOptionId, ownerPlayer.id, ownerUser.id, 'AVAILABLE')
  await vote(player, workspace.workspace.id, reminderPlanId, farOptionId, linkedPlayer.id, playerUser.id, 'MAYBE')
  const firstReminderDispatch = await dispatch()
  assert.equal(firstReminderDispatch.enqueued, 2, 'An incomplete enabled voter should receive daily and three-hour reminders.')
  assert.equal(firstReminderDispatch.claimed, 2)
  assert.deepEqual(await dispatch(), emptyDispatchResult(), 'Reminder retries must not duplicate the same local day or timeslot.')

  const confirmedReminderPlanId = crypto.randomUUID()
  const confirmedReminderOptionId = crypto.randomUUID()
  await insertPlan(owner, workspace.workspace.id, ownerUser.id, confirmedReminderPlanId, [
    [confirmedReminderOptionId, new Date(Date.now() + 2.9 * 60 * 60_000).toISOString()],
  ])
  assertNoError(await owner.from('event_plans').update({
    status: 'CONFIRMED', confirmed_option_id: confirmedReminderOptionId,
  }).eq('id', confirmedReminderPlanId).eq('workspace_id', workspace.workspace.id))
  assert.deepEqual(await dispatch(), emptyDispatchResult(), 'Confirmed Plans must not enqueue future voting reminders.')

  assertNoError(await owner.rpc('delete_owned_workspace', {
    target_workspace_id: workspace.workspace.id,
  }))
  console.log('Real Supabase notification checks passed.')
} catch (error) {
  console.error('Notification checks failed; the temporary QA workspace was left for inspection.')
  throw error
}

async function registeredClient(label: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await client.auth.signUp({
    email: `seventwo-push-${label}-${runId}@example.com`,
    password,
    options: { data: { display_name: `${label} ${runId.slice(-8)}` } },
  })
  if (error) throw error
  if (!data.session) throw new Error('Test registration requires email confirmation to be disabled.')
  return client
}

async function currentUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw error ?? new Error('Authenticated user unavailable.')
  return data.user
}

async function createWorkspace(client: SupabaseClient, name: string) {
  const { data, error } = await client.functions.invoke('create-workspace', {
    body: { name, requestId: crypto.randomUUID() },
  })
  if (error) throw error
  return data
}

async function joinWorkspace(client: SupabaseClient, code: string, nickname: string) {
  const { data, error } = await client.functions.invoke('join-workspace', {
    body: { code, nickname },
  })
  if (error) throw error
  assert.equal(data.status, 'JOINED')
}

async function setPreferences(client: SupabaseClient, userId: string, polls: boolean, reminders: boolean, sessionUpdates: boolean) {
  assertNoError(await client.from('notification_preferences').upsert({
    user_id: userId,
    polls_enabled: polls,
    reminders_enabled: reminders,
    session_updates_enabled: sessionUpdates,
  }))
}

async function roster(client: SupabaseClient, workspaceId: string) {
  const { data, error } = await client.from('players')
    .select('id, user_id').eq('workspace_id', workspaceId)
  assertNoError({ error })
  return data ?? []
}

function requiredPlayer(players: Array<{ id: string; user_id: string | null }>, userId: string) {
  const player = players.find((item) => item.user_id === userId)
  assert.ok(player)
  return player
}

async function registerTestSubscription(client: SupabaseClient, endpoint: string) {
  assertNoError(await client.rpc('register_push_subscription', {
    target_endpoint: endpoint,
    target_p256dh: 'A'.repeat(88),
    target_auth: 'B'.repeat(24),
    target_user_agent: 'SevenTwo notification QA',
  }))
}

async function ownSubscriptions(client: SupabaseClient) {
  const { data, error } = await client.from('push_subscriptions').select('id')
  assertNoError({ error })
  return data ?? []
}

async function visibleSubscription(client: SupabaseClient, endpoint: string) {
  const { data, error } = await client.from('push_subscriptions').select('id').eq('endpoint', endpoint)
  assertNoError({ error })
  return data ?? []
}

async function preferencesFor(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from('notification_preferences').select('user_id').eq('user_id', userId)
  assertNoError({ error })
  return data ?? []
}

async function insertPlan(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
  planId: string,
  options: Array<[string, string]>,
) {
  assertNoError(await client.from('event_plans').insert({
    id: planId,
    workspace_id: workspaceId,
    title: `Push plan ${runId}`,
    status: 'VOTING',
    created_by_user_id: userId,
    host_user_id: userId,
  }))
  assertNoError(await client.from('plan_options').insert(options.map(([id, startsAt]) => ({
    id, workspace_id: workspaceId, plan_id: planId, starts_at: startsAt,
  }))))
}

async function vote(
  client: SupabaseClient,
  workspaceId: string,
  planId: string,
  optionId: string,
  playerId: string,
  userId: string,
  response: 'AVAILABLE' | 'MAYBE' | 'UNAVAILABLE',
) {
  assertNoError(await client.from('plan_votes').upsert({
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    plan_id: planId,
    option_id: optionId,
    player_id: playerId,
    response,
    recorded_by_user_id: userId,
  }, { onConflict: 'option_id,player_id' }))
}

async function addGuests(client: SupabaseClient, workspaceId: string, suffix: string, count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    nickname: `Guest ${suffix.slice(-8)} ${index + 1}`,
  }))
  const { data, error } = await client.from('players').insert(rows).select('id')
  assertNoError({ error })
  return data ?? []
}

interface DispatchResult {
  enqueued: number
  claimed: number
  sent: number
  cancelled: number
  failed: number
  retried: number
  devices: number
}

async function dispatch(): Promise<DispatchResult> {
  const response = await fetch(`${url}/functions/v1/dispatch-notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SevenTwo-Dispatch-Secret': dispatchSecret!,
    },
    body: '{}',
  })
  if (!response.ok) throw new Error(`Dispatcher returned HTTP ${response.status}.`)
  return response.json()
}

function emptyDispatchResult(): DispatchResult {
  return { enqueued: 0, claimed: 0, sent: 0, cancelled: 0, failed: 0, retried: 0, devices: 0 }
}

async function unauthorizedDispatchStatus(): Promise<number> {
  const response = await fetch(`${url}/functions/v1/dispatch-notifications`, {
    method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
  })
  return response.status
}

async function avoidCronBoundary() {
  const seconds = new Date().getUTCSeconds()
  if (seconds >= 50) await new Promise((resolve) => setTimeout(resolve, (65 - seconds) * 1000))
}

async function waitForCronDispatch() {
  const seconds = new Date().getUTCSeconds()
  await new Promise((resolve) => setTimeout(resolve, (70 - seconds) * 1000))
}

function assertNoError(result: { error: unknown }) {
  if (result.error) throw result.error
}

function loadEnvironment(path: string) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
}
