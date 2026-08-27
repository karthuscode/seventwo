import { corsHeaders, handleError, jsonResponse, readJson, RequestError } from '../_shared/http.ts'
import { requireFunctionContext } from '../_shared/supabase.ts'
import { digestPlayerInviteCode, generateWorkspaceCode } from '../_shared/workspace-code.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { admin, user } = await requireFunctionContext(request, { registeredOnly: true })
    const body = await readJson(request)
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : ''
    const playerId = typeof body.playerId === 'string' ? body.playerId : ''
    if (!workspaceId) throw new RequestError(400, 'Choose a workspace.')

    const { data: membership, error: membershipError } = await admin
      .from('workspace_members').select('role')
      .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle()
    if (membershipError) throw membershipError
    if (membership?.role !== 'OWNER') throw new RequestError(403, 'Only the workspace owner can invite a player.')

    let player: { id: string; nickname: string; user_id: string | null } | null = null
    if (playerId) {
      const { data, error: playerError } = await admin
        .from('players').select('id, nickname, user_id')
        .eq('id', playerId).eq('workspace_id', workspaceId).maybeSingle()
      if (playerError) throw playerError
      player = data
      if (!player || player.user_id) throw new RequestError(409, 'Choose an unlinked player identity.')
      await admin.from('player_invites').delete()
        .eq('player_id', playerId).is('redeemed_at', null)
    }

    let inviteCode = ''
    let digest = ''
    for (let attempt = 0; attempt < 20; attempt += 1) {
      inviteCode = generateWorkspaceCode()
      digest = await digestPlayerInviteCode(inviteCode)
      const { data: collision, error } = await admin
        .from('player_invites').select('id').eq('code_digest', digest).maybeSingle()
      if (error) throw error
      if (!collision) break
      inviteCode = ''
    }
    if (!inviteCode) throw new Error('Unable to allocate a player invite code.')

    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const { error: insertError } = await admin.from('player_invites').insert({
      workspace_id: workspaceId,
      player_id: playerId || null,
      code_digest: digest,
      created_by_user_id: user.id,
      expires_at: expiresAt,
    })
    if (insertError) throw insertError

    return jsonResponse({
      workspaceId,
      playerId: playerId || null,
      playerNickname: player?.nickname ?? null,
      inviteCode,
      expiresAt,
    })
  } catch (error) {
    return handleError(error)
  }
})
