import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'

loadEnvironment('.env.local')
const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Supabase frontend configuration is unavailable.')

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
const password = `Discuss-${crypto.randomUUID()}-aA1!`
const owner = await registeredClient('owner')
const host = await registeredClient('host')
const player = await registeredClient('player')
const outsider = await registeredClient('outsider')
const ownerUser = await currentUser(owner)
const hostUser = await currentUser(host)
const playerUser = await currentUser(player)
const outsiderUser = await currentUser(outsider)
const workspace = await createWorkspace(owner, `Discussion QA ${runId}`)
const isolatedWorkspace = await createWorkspace(outsider, `Discussion isolation ${runId}`)

try {
  await joinWorkspace(host, workspace.accessCode, `Host ${runId.slice(-8)}`)
  await joinWorkspace(player, workspace.accessCode, `Player ${runId.slice(-8)}`)
  assertNoError(await owner.from('workspace_members').update({ role: 'HOST' })
    .eq('workspace_id', workspace.workspace.id).eq('user_id', hostUser.id))

  const planId = crypto.randomUUID()
  const optionId = crypto.randomUUID()
  assertNoError(await owner.from('event_plans').insert({
    id: planId,
    workspace_id: workspace.workspace.id,
    title: `Discussion ${runId}`,
    status: 'VOTING',
    created_by_user_id: ownerUser.id,
    host_user_id: hostUser.id,
  }))
  assertNoError(await owner.from('plan_options').insert({
    id: optionId,
    workspace_id: workspace.workspace.id,
    plan_id: planId,
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  }))

  const realtimeInsert = await observeMessageEvent(player, planId, 'INSERT')
  const ownerMessageId = crypto.randomUUID()
  const ownerInsert = await owner.from('plan_messages').insert({
    id: ownerMessageId,
    workspace_id: workspace.workspace.id,
    plan_id: planId,
    user_id: ownerUser.id,
    body: '  Who brings chips?  ',
  }).select('id, body, user_id').single()
  assertNoError(ownerInsert)
  assert.equal(ownerInsert.data?.body, 'Who brings chips?')
  assert.equal((await realtimeInsert.next).id, ownerMessageId)
  realtimeInsert.close()

  assert.equal((await messages(host, planId)).length, 1)
  assert.equal((await messages(player, planId)).length, 1)
  assert.equal((await messages(outsider, planId)).length, 0)

  const outsiderInsert = await outsider.from('plan_messages').insert({
    id: crypto.randomUUID(), workspace_id: workspace.workspace.id, plan_id: planId,
    user_id: outsiderUser.id, body: 'Denied',
  })
  assert.ok(outsiderInsert.error)
  const spoofedInsert = await player.from('plan_messages').insert({
    id: crypto.randomUUID(), workspace_id: workspace.workspace.id, plan_id: planId,
    user_id: ownerUser.id, body: 'Spoofed',
  })
  assert.ok(spoofedInsert.error)
  assert.ok((await player.from('plan_messages').insert({
    id: crypto.randomUUID(), workspace_id: workspace.workspace.id, plan_id: planId,
    user_id: playerUser.id, body: '   ',
  })).error)
  assert.ok((await player.from('plan_messages').insert({
    id: crypto.randomUUID(), workspace_id: workspace.workspace.id, plan_id: planId,
    user_id: playerUser.id, body: 'x'.repeat(501),
  })).error)

  const deniedHostDelete = await host.from('plan_messages').delete()
    .eq('id', ownerMessageId).select('id')
  assertNoError(deniedHostDelete)
  assert.equal(deniedHostDelete.data?.length, 0)
  const deniedPlayerDelete = await player.from('plan_messages').delete()
    .eq('id', ownerMessageId).select('id')
  assertNoError(deniedPlayerDelete)
  assert.equal(deniedPlayerDelete.data?.length, 0)

  const realtimeDelete = await observeMessageEvent(player, planId, 'DELETE')
  const ownDelete = await owner.from('plan_messages').delete()
    .eq('id', ownerMessageId).select('id').single()
  assertNoError(ownDelete)
  assert.equal((await realtimeDelete.next).id, ownerMessageId)
  realtimeDelete.close()

  const hostMessageId = crypto.randomUUID()
  assertNoError(await host.from('plan_messages').insert({
    id: hostMessageId, workspace_id: workspace.workspace.id, plan_id: planId,
    user_id: hostUser.id, body: 'I can host.',
  }))
  const playerMessageId = crypto.randomUUID()
  assertNoError(await player.from('plan_messages').insert({
    id: playerMessageId, workspace_id: workspace.workspace.id, plan_id: planId,
    user_id: playerUser.id, body: 'I will be 15 minutes late.',
  }))
  assert.equal((await messages(owner, planId)).length, 2)
  assertNoError(await owner.from('event_plans').update({
    status: 'CONFIRMED', confirmed_option_id: optionId,
  }).eq('id', planId))
  assert.equal((await messages(player, planId)).length, 2, 'Confirmation must keep Discussion accessible.')

  const updateDenied = await player.from('plan_messages').update({ body: 'Edited' })
    .eq('id', playerMessageId)
  assert.ok(updateDenied.error)
  assert.ok((await player.rpc('cleanup_expired_plan_messages')).error)

  assertNoError(await owner.from('event_plans').delete().eq('id', planId))
  assert.equal((await messages(owner, planId)).length, 0, 'Deleting a Plan must cascade its Discussion.')

  assertNoError(await owner.rpc('delete_owned_workspace', { target_workspace_id: workspace.workspace.id }))
  assertNoError(await outsider.rpc('delete_owned_workspace', { target_workspace_id: isolatedWorkspace.workspace.id }))
  console.log('Real Supabase discussion checks passed.')
} catch (error) {
  console.error('Discussion checks failed; temporary QA workspaces were left for inspection.')
  throw error
}

async function registeredClient(label: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await client.auth.signUp({
    email: `seventwo-discussion-${label}-${runId}@example.com`,
    password,
    options: { data: { display_name: `${label} ${runId.slice(-8)}` } },
  })
  if (error) throw error
  if (!data.session) throw new Error('Test registration requires email confirmation to be disabled.')
  await client.realtime.setAuth(data.session.access_token)
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

async function messages(client: SupabaseClient, planId: string) {
  const { data, error } = await client.from('plan_messages').select('id, body').eq('plan_id', planId)
  assertNoError({ error })
  return data ?? []
}

async function observeMessageEvent(
  client: SupabaseClient,
  planId: string,
  event: 'INSERT' | 'DELETE',
): Promise<{ next: Promise<{ id: string }>; close: () => void }> {
  let resolveNext: (row: { id: string }) => void = () => undefined
  let rejectNext: (error: Error) => void = () => undefined
  const next = new Promise<{ id: string }>((resolve, reject) => {
    resolveNext = resolve
    rejectNext = reject
  })
  let channel: RealtimeChannel
  const ready = new Promise<void>((resolve, reject) => {
    channel = client.channel(`discussion-qa-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event, schema: 'public', table: 'plan_messages', filter: `plan_id=eq.${planId}`,
      }, (payload) => resolveNext((event === 'INSERT' ? payload.new : payload.old) as { id: string }))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const error = new Error(`Realtime subscription failed: ${status}`)
          reject(error)
          rejectNext(error)
        }
      })
  })
  await Promise.race([
    ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Realtime subscription timed out.')), 12_000)),
  ])
  const timeout = setTimeout(() => rejectNext(new Error(`Realtime ${event.toLowerCase()} was not received.`)), 12_000)
  return {
    next: next.finally(() => clearTimeout(timeout)),
    close: () => { void client.removeChannel(channel) },
  }
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
