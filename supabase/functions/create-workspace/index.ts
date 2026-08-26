import { corsHeaders, handleError, jsonResponse, readJson, RequestError } from '../_shared/http.ts'
import { requireFunctionContext } from '../_shared/supabase.ts'
import { generateUniqueWorkspaceCode } from '../_shared/workspace-code.ts'

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
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 80) {
      throw new RequestError(400, 'Workspace name must be 1–80 characters.')
    }

    const { accessCode, digest } = await generateUniqueWorkspaceCode(admin)
    const { data: workspace, error: workspaceError } = await admin
      .from('workspaces')
      .insert({ name, access_code_digest: digest })
      .select('id, name, created_at')
      .single()
    if (workspaceError) throw workspaceError

    const { error: membershipError } = await admin
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'OWNER',
      })
    if (membershipError) {
      await admin.from('workspaces').delete().eq('id', workspace.id)
      throw membershipError
    }

    return jsonResponse({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.created_at,
        role: 'OWNER',
      },
      accessCode,
    })
  } catch (error) {
    return handleError(error)
  }
})
