import { corsHeaders, handleError, jsonResponse, readJson, RequestError } from '../_shared/http.ts'
import { clearJoinFailures, enforceJoinRateLimit, recordJoinFailure } from '../_shared/rate-limit.ts'
import { requireFunctionContext } from '../_shared/supabase.ts'
import { digestWorkspaceCode, isWorkspaceCode } from '../_shared/workspace-code.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  try {
    const { admin, user } = await requireFunctionContext(request)
    const body = await readJson(request)
    if (!isWorkspaceCode(body.code)) {
      throw new RequestError(400, 'Enter exactly six digits.')
    }

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
      throw new RequestError(404, 'Workspace code not recognized.')
    }

    // ignoreDuplicates prevents a returning OWNER from being downgraded to HOST.
    const { error: membershipError } = await admin
      .from('workspace_members')
      .upsert(
        { workspace_id: workspace.id, user_id: user.id, role: 'HOST' },
        { onConflict: 'workspace_id,user_id', ignoreDuplicates: true },
      )
    if (membershipError) throw membershipError

    const { data: membership, error: roleError } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace.id)
      .eq('user_id', user.id)
      .single()
    if (roleError) throw roleError

    await clearJoinFailures(admin, user.id)
    return jsonResponse({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.created_at,
        role: membership.role,
      },
    })
  } catch (error) {
    return handleError(error)
  }
})
