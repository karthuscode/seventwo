import { corsHeaders, handleError, jsonResponse, readJson, RequestError } from '../_shared/http.ts'
import { clearJoinFailures, enforceJoinRateLimit, recordJoinFailure } from '../_shared/rate-limit.ts'
import { requireFunctionContext } from '../_shared/supabase.ts'
import { digestPlayerInviteCode, isWorkspaceCode } from '../_shared/workspace-code.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { admin, user } = await requireFunctionContext(request, { registeredOnly: true })
    const body = await readJson(request)
    if (!isWorkspaceCode(body.code)) throw new RequestError(400, 'Enter exactly six digits.')

    const currentAttempt = await enforceJoinRateLimit(admin, user.id)
    const digest = await digestPlayerInviteCode(body.code)
    const { data: invite, error: inviteError } = await admin
      .from('player_invites').select('id, workspace_id, player_id, expires_at, redeemed_at')
      .eq('code_digest', digest).maybeSingle()
    if (inviteError) throw inviteError
    if (!invite || invite.redeemed_at || Date.parse(invite.expires_at) <= Date.now()) {
      await recordJoinFailure(admin, user.id, currentAttempt)
      throw new RequestError(404, 'Player invite is invalid or expired.')
    }

    const { error: redeemError } = await admin.rpc('redeem_player_invite', {
      target_invite_id: invite.id,
      target_user_id: user.id,
    })
    if (redeemError) throw redeemError

    const [{ data: workspace, error: workspaceError }, { data: player, error: playerError }] = await Promise.all([
      admin.from('workspaces').select('id, name, created_at').eq('id', invite.workspace_id).single(),
      admin.from('players').select('id, nickname').eq('id', invite.player_id).single(),
    ])
    if (workspaceError) throw workspaceError
    if (playerError) throw playerError
    await clearJoinFailures(admin, user.id)

    return jsonResponse({
      workspace: { id: workspace.id, name: workspace.name, createdAt: workspace.created_at, role: 'PLAYER' },
      player: { id: player.id, nickname: player.nickname },
    })
  } catch (error) {
    return handleError(error)
  }
})
