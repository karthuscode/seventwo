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
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : ''
    const currentAttempt = await enforceJoinRateLimit(admin, user.id)

    const playerDigest = await digestPlayerInviteCode(body.code)
    const { data: invite, error: inviteError } = await admin
      .from('player_invites')
      .select('id, workspace_id, player_id, expires_at, redeemed_at')
      .eq('code_digest', playerDigest)
      .maybeSingle()
    if (inviteError) throw inviteError

    if (invite && !invite.redeemed_at && Date.parse(invite.expires_at) > Date.now()) {
      const { data: workspace, error: workspaceError } = await admin
        .from('workspaces').select('id, name, created_at')
        .eq('id', invite.workspace_id).single()
      if (workspaceError) throw workspaceError

      const { data: existingMembership } = await admin
        .from('workspace_members')
        .select('workspace_id')
        .eq('workspace_id', invite.workspace_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (existingMembership) {
        throw new RequestError(409, "You're already a member of this workspace.")
      }

      if (!invite.player_id && !nickname) {
        return jsonResponse({ status: 'NICKNAME_REQUIRED', workspaceName: workspace.name })
      }

      const rpcName = invite.player_id
        ? 'redeem_player_invite'
        : 'redeem_new_player_invite'
      const rpcArguments = invite.player_id
        ? { target_invite_id: invite.id, target_user_id: user.id }
        : {
            target_invite_id: invite.id,
            target_user_id: user.id,
            target_nickname: nickname,
          }
      const { data: redemptionRows, error: redemptionError } = await admin.rpc(
        rpcName,
        rpcArguments,
      )
      if (redemptionError) {
        if (redemptionError.message.includes('already has a player')) {
          throw new RequestError(409, "You're already a member of this workspace.")
        }
        if (redemptionError.message.includes('nickname')) {
          throw new RequestError(409, 'That nickname is already in use.')
        }
        if (redemptionError.message.includes('Invite is invalid or expired')) {
          throw new RequestError(404, 'Invalid or expired invite code.')
        }
        throw redemptionError
      }
      const playerId = redemptionRows?.[0]?.player_id ?? invite.player_id
      const { data: joinedMembership, error: joinedMembershipError } = await admin
        .from('workspace_members').select('role')
        .eq('workspace_id', workspace.id).eq('user_id', user.id).single()
      if (joinedMembershipError) throw joinedMembershipError
      await clearJoinFailures(admin, user.id)
      return jsonResponse({
        status: 'JOINED',
        workspace: {
          id: workspace.id,
          name: workspace.name,
          createdAt: workspace.created_at,
          role: joinedMembership.role,
        },
        playerId,
      })
    }

    await recordJoinFailure(admin, user.id, currentAttempt)
    throw new RequestError(404, 'Invalid or expired invite code.')
  } catch (error) {
    return handleError(error)
  }
})
