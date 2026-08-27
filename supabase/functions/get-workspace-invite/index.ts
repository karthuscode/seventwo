import { corsHeaders, handleError, jsonResponse, readJson, RequestError } from '../_shared/http.ts'
import { requireFunctionContext } from '../_shared/supabase.ts'
import { deriveWorkspaceCode, digestWorkspaceCode } from '../_shared/workspace-code.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { admin, user } = await requireFunctionContext(request, { registeredOnly: true })
    const body = await readJson(request)
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : ''
    if (!isUuid(workspaceId)) throw new RequestError(400, 'A valid workspace is required.')

    const { data: membership, error: membershipError } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (membership?.role !== 'OWNER') {
      throw new RequestError(403, 'Only the workspace owner can view its invite code.')
    }

    const { data: workspace, error: workspaceError } = await admin
      .from('workspaces')
      .select('invite_code_seed, access_code_digest')
      .eq('id', workspaceId)
      .single()
    if (workspaceError) throw workspaceError
    if (!workspace.invite_code_seed) {
      throw new RequestError(409, 'Rotate the workspace invite code before sharing it.')
    }

    const inviteCode = await deriveWorkspaceCode(workspace.invite_code_seed)
    const digest = await digestWorkspaceCode(inviteCode)
    if (digest !== workspace.access_code_digest) {
      throw new Error('Workspace invite data is inconsistent.')
    }
    return jsonResponse({ workspaceId, inviteCode })
  } catch (error) {
    return handleError(error)
  }
})

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
