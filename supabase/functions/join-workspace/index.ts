import { corsHeaders, handleError, jsonResponse, readJson, RequestError } from '../_shared/http.ts'
import { clearJoinFailures, enforceJoinRateLimit, recordJoinFailure } from '../_shared/rate-limit.ts'
import { requireFunctionContext } from '../_shared/supabase.ts'
import { digestWorkspaceCode, isWorkspaceCode } from '../_shared/workspace-code.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { admin, user } = await requireFunctionContext(request, { registeredOnly: true })
    const body = await readJson(request)
    if (!isWorkspaceCode(body.code)) throw new RequestError(400, 'Enter exactly six digits.')
    const suppliedNickname = typeof body.nickname === 'string' ? body.nickname.trim() : ''
    const currentAttempt = await enforceJoinRateLimit(admin, user.id)
    const digest = await digestWorkspaceCode(body.code)
    const { data: workspace, error: workspaceError } = await admin
      .from('workspaces')
      .select('id, name, created_at')
      .eq('access_code_digest', digest)
      .maybeSingle()
    if (workspaceError) throw workspaceError
    if (!workspace) {
      await recordJoinFailure(admin, user.id, currentAttempt)
      throw new RequestError(404, 'Invalid workspace invite code.')
    }

    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError) throw profileError
    const defaultNickname = profile?.display_name?.trim()
      || (typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name.trim() : '')
      || user.email?.split('@')[0]
      || ''
    const nickname = suppliedNickname || defaultNickname
    if (!nickname) throw new RequestError(400, 'Enter a poker nickname.')

    const { data: existingPlayer, error: existingPlayerError } = await admin
      .from('players')
      .select('id')
      .eq('workspace_id', workspace.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existingPlayerError) throw existingPlayerError

    if (!existingPlayer) {
      const { data: workspacePlayers, error: nicknameError } = await admin
        .from('players')
        .select('id, nickname')
        .eq('workspace_id', workspace.id)
      if (nicknameError) throw nicknameError
      const normalizedNickname = nickname.trim().toLocaleLowerCase()
      const nicknameMatch = workspacePlayers?.find(
        (player) => player.nickname.trim().toLocaleLowerCase() === normalizedNickname,
      )
      if (nicknameMatch) {
        if (!suppliedNickname) {
          return jsonResponse({ status: 'NICKNAME_REQUIRED', workspaceName: workspace.name })
        }
        throw new RequestError(409, 'That nickname is already in use.')
      }
    }

    const { data: joinRows, error: joinError } = await admin.rpc('join_registered_workspace', {
      target_workspace_id: workspace.id,
      target_user_id: user.id,
      target_nickname: nickname,
    })
    if (joinError) {
      if (/nickname|unique|duplicate/i.test(joinError.message)) {
        throw new RequestError(409, 'That nickname is already in use.')
      }
      throw joinError
    }
    const joined = joinRows?.[0]
    if (!joined) throw new Error('Workspace join returned no data.')

    await clearJoinFailures(admin, user.id)
    return jsonResponse({
      status: 'JOINED',
      workspace: {
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.created_at,
        role: joined.member_role,
      },
      playerId: joined.player_id,
    })
  } catch (error) {
    return handleError(error)
  }
})
