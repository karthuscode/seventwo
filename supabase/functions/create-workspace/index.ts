import { corsHeaders, handleError, jsonResponse, readJson, RequestError } from '../_shared/http.ts'
import { requireFunctionContext } from '../_shared/supabase.ts'
import { allocateWorkspaceInvite, deriveWorkspaceCode } from '../_shared/workspace-code.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  try {
    const { admin, user } = await requireFunctionContext(request, { registeredOnly: true })
    const body = await readJson(request)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 80) {
      throw new RequestError(400, 'Workspace name must be 1–80 characters.')
    }
    const requestId = typeof body.requestId === 'string' ? body.requestId : ''
    if (!isUuid(requestId)) throw new RequestError(400, 'A valid workspace request is required.')

    const displayName = typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name.trim()
      : user.email?.split('@')[0] ?? ''
    if (!displayName) throw new RequestError(400, 'A username is required.')
    const invite = await allocateWorkspaceInvite(admin)
    const { data: rows, error: rpcError } = await admin.rpc('create_registered_workspace', {
      target_name: name,
      target_user_id: user.id,
      target_nickname: displayName,
      target_request_id: requestId,
      target_invite_seed: invite.seed,
      target_invite_digest: invite.digest,
    })
    if (rpcError) throw rpcError
    const workspace = rows?.[0]
    if (!workspace) throw new Error('Workspace creation returned no data.')
    if (!isUuid(workspace.workspace_invite_seed)) {
      throw new Error('Workspace creation returned invalid invite data.')
    }
    const accessCode = await deriveWorkspaceCode(workspace.workspace_invite_seed)

    return jsonResponse({
      workspace: {
        id: workspace.workspace_id,
        name,
        createdAt: workspace.workspace_created_at,
        role: 'OWNER',
      },
      accessCode,
    })
  } catch (error) {
    return handleError(error)
  }
})

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
