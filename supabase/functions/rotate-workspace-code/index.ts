import { corsHeaders, handleError, jsonResponse, readJson, RequestError } from '../_shared/http.ts'
import { requireFunctionContext } from '../_shared/supabase.ts'
import { allocateWorkspaceInvite } from '../_shared/workspace-code.ts'

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
    const workspaceId =
      typeof body.workspaceId === 'string' ? body.workspaceId : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
      throw new RequestError(400, 'A valid workspace is required.')
    }

    const { data: membership, error: membershipError } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (membership?.role !== 'OWNER') {
      throw new RequestError(403, 'Only the workspace owner can rotate its invite code.')
    }

    const { accessCode, digest, seed } = await allocateWorkspaceInvite(admin)
    const { data: updatedWorkspace, error: updateError } = await admin
      .from('workspaces')
      .update({ access_code_digest: digest, invite_code_seed: seed })
      .eq('id', workspaceId)
      .select('id')
      .single()
    if (updateError) throw updateError
    if (!updatedWorkspace) throw new RequestError(404, 'Workspace not found.')

    return jsonResponse({ accessCode })
  } catch (error) {
    return handleError(error)
  }
})
