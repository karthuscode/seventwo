import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

loadEnvironment('.env.local')
const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Supabase frontend configuration is unavailable.')

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
const password = `QA-${crypto.randomUUID()}-aA1!`

const owner = await registeredClient('owner')
const joiner = await registeredClient('joiner')
const outsider = await registeredClient('outsider')

const ownerUser = await currentUser(owner)
const joinerUser = await currentUser(joiner)
const outsiderUser = await currentUser(outsider)

const first = await createWorkspace(owner, `Release QA ${runId}`)
const second = await createWorkspace(outsider, `Isolation QA ${runId}`)

try {
  assert.equal(await membershipRole(owner, first.workspace.id, ownerUser.id), 'OWNER')
  assert.equal(await linkedPlayerCount(owner, first.workspace.id, ownerUser.id), 1)
  assert.equal(await linkedPlayerCount(outsider, second.workspace.id, outsiderUser.id), 1)

  assert.equal((await roster(outsider, first.workspace.id)).length, 0)
  assert.equal((await roster(owner, second.workspace.id)).length, 0)

  const joined = await invoke(joiner, 'join-workspace', {
    code: first.accessCode,
    nickname: `Joiner ${runId.slice(-8)}`,
  })
  assert.equal(joined.workspace.role, 'PLAYER')
  assert.equal(await membershipRole(joiner, first.workspace.id, joinerUser.id), 'PLAYER')

  const visibleMemberships = await workspaceMemberships(owner, first.workspace.id)
  assert.deepEqual(
    new Set(visibleMemberships.map((membership) => membership.role)),
    new Set(['OWNER', 'PLAYER']),
  )
  assert.equal(visibleMemberships.filter((membership) => membership.user_id === ownerUser.id).length, 1)
  assert.equal((await ownWorkspaceMemberships(owner, ownerUser.id))
    .find((workspace) => workspace.id === first.workspace.id)?.role, 'OWNER')

  const ownerRoster = await roster(owner, first.workspace.id)
  const playerRoster = await roster(joiner, first.workspace.id)
  assert.equal(playerRoster.length, ownerRoster.length)
  assert.ok(playerRoster.length >= 2)

  const joinerPlayer = playerRoster.find((player) => player.user_id === joinerUser.id)
  const ownerPlayer = playerRoster.find((player) => player.user_id === ownerUser.id)
  assert.ok(joinerPlayer)
  assert.ok(ownerPlayer)

  const deniedRosterMutation = await joiner.from('players')
    .update({ nickname: `Denied ${runId}` })
    .eq('id', ownerPlayer.id)
    .select('id')
  assert.equal(deniedRosterMutation.data?.length ?? 0, 0)

  const planId = crypto.randomUUID()
  const optionId = crypto.randomUUID()
  const now = new Date().toISOString()
  assertNoError(await owner.from('event_plans').insert({
    id: planId,
    workspace_id: first.workspace.id,
    title: `Vote QA ${runId}`,
    status: 'VOTING',
    created_by_user_id: ownerUser.id,
    host_user_id: ownerUser.id,
  }))
  assertNoError(await owner.from('plan_options').insert({
    id: optionId,
    workspace_id: first.workspace.id,
    plan_id: planId,
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  }))
  assertNoError(await joiner.from('plan_votes').insert({
    id: crypto.randomUUID(),
    workspace_id: first.workspace.id,
    plan_id: planId,
    option_id: optionId,
    player_id: joinerPlayer.id,
    response: 'AVAILABLE',
    recorded_by_user_id: joinerUser.id,
    updated_at: now,
  }))
  const { data: savedVote, error: savedVoteError } = await joiner.from('plan_votes')
    .select('option_id, player_id, response')
    .eq('option_id', optionId)
    .eq('player_id', joinerPlayer.id)
    .single()
  assertNoError({ error: savedVoteError })
  assert.deepEqual(savedVote, {
    option_id: optionId,
    player_id: joinerPlayer.id,
    response: 'AVAILABLE',
  })

  const deniedProxyVote = await joiner.from('plan_votes').insert({
    id: crypto.randomUUID(),
    workspace_id: first.workspace.id,
    plan_id: planId,
    option_id: optionId,
    player_id: ownerPlayer.id,
    response: 'MAYBE',
    recorded_by_user_id: joinerUser.id,
    updated_at: now,
  })
  assert.ok(deniedProxyVote.error)

  const deniedPlanDelete = await joiner.from('event_plans')
    .delete().eq('id', planId).select('id')
  assert.equal(deniedPlanDelete.data?.length ?? 0, 0)

  const promoted = await owner.from('workspace_members')
    .update({ role: 'HOST' })
    .eq('workspace_id', first.workspace.id)
    .eq('user_id', joinerUser.id)
    .select('role')
    .single()
  assertNoError(promoted)
  assert.equal(await membershipRole(joiner, first.workspace.id, joinerUser.id), 'HOST')
  assert.equal(await membershipRole(owner, first.workspace.id, ownerUser.id), 'OWNER')
  assert.equal((await ownWorkspaceMemberships(owner, ownerUser.id))
    .find((workspace) => workspace.id === first.workspace.id)?.role, 'OWNER')
  assert.equal((await ownWorkspaceMemberships(joiner, joinerUser.id))
    .find((workspace) => workspace.id === first.workspace.id)?.role, 'HOST')

  assertNoError(await owner.from('players').select('id').eq('workspace_id', first.workspace.id))
  assert.equal(await membershipRole(owner, first.workspace.id, ownerUser.id), 'OWNER')

  const operatorPlanDelete = await joiner.from('event_plans')
    .delete().eq('id', planId).select('id').single()
  assertNoError(operatorPlanDelete)

  const rotated = await invoke(owner, 'rotate-workspace-code', {
    workspaceId: first.workspace.id,
  })
  const oldCodeResult = await outsider.functions.invoke('join-workspace', {
    body: { code: first.accessCode, nickname: `Outsider ${runId.slice(-8)}` },
  })
  assert.ok(oldCodeResult.error)
  const outsiderJoin = await invoke(outsider, 'join-workspace', {
    code: rotated.accessCode,
    nickname: `Outsider ${runId.slice(-8)}`,
  })
  assert.equal(outsiderJoin.workspace.role, 'PLAYER')

  const deniedWorkspaceDelete = await joiner.rpc('delete_owned_workspace', {
    target_workspace_id: first.workspace.id,
  })
  assert.ok(deniedWorkspaceDelete.error)

  assertNoError(await owner.rpc('delete_owned_workspace', {
    target_workspace_id: first.workspace.id,
  }))
  assert.equal((await roster(joiner, first.workspace.id)).length, 0)

  assertNoError(await outsider.rpc('delete_owned_workspace', {
    target_workspace_id: second.workspace.id,
  }))

  console.log('Real Supabase release checks passed.')
} catch (error) {
  console.error('Real Supabase release checks failed; temporary QA workspaces were left for inspection.')
  throw error
}

async function registeredClient(label: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await client.auth.signUp({
    email: `seventwo-${label}-${runId}@example.com`,
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
  return invoke(client, 'create-workspace', { name, requestId: crypto.randomUUID() })
}

async function invoke(client: SupabaseClient, name: string, body: object): Promise<any> {
  const { data, error } = await client.functions.invoke(name, { body })
  if (error) throw error
  return data
}

async function membershipRole(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await client.from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()
  assertNoError({ error })
  return data?.role
}

async function roster(client: SupabaseClient, workspaceId: string) {
  const { data, error } = await client.from('players')
    .select('id, nickname, user_id')
    .eq('workspace_id', workspaceId)
    .order('created_at')
  assertNoError({ error })
  return data ?? []
}

async function workspaceMemberships(client: SupabaseClient, workspaceId: string) {
  const { data, error } = await client.from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId)
    .order('created_at')
  assertNoError({ error })
  return data ?? []
}

async function ownWorkspaceMemberships(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId)
    .order('created_at')
  assertNoError({ error })
  return (data ?? []).map((membership) => ({
    id: membership.workspace_id,
    role: membership.role,
  }))
}

async function linkedPlayerCount(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
) {
  const { count, error } = await client.from('players')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
  assertNoError({ error })
  return count ?? 0
}

function assertNoError(result: { error: unknown }) {
  if (result.error) throw result.error
}

function loadEnvironment(path: string) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    process.env[match[1]] = value
  }
}
