import { corsHeaders, handleError, jsonResponse, readJson, RequestError } from '../_shared/http.ts'
import { requireFunctionContext } from '../_shared/supabase.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { admin, user } = await requireFunctionContext(request)
    if (!user.is_anonymous) {
      throw new RequestError(409, 'This SevenTwo identity is already registered.')
    }

    const body = await readJson(request)
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password) throw new RequestError(400, 'Enter your email and password.')
    if (displayName.length < 2 || displayName.length > 24) {
      throw new RequestError(400, 'Username must be 2–24 characters.')
    }
    if (password.length < 8) {
      throw new RequestError(400, 'Password must be at least 8 characters.')
    }

    const { count, error: ownerError } = await admin
      .from('workspace_members')
      .select('workspace_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'OWNER')
    if (ownerError) throw ownerError
    if (!count) {
      throw new RequestError(403, 'Only a legacy guest owner can upgrade workspace ownership.')
    }

    const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    })
    if (authError) {
      const duplicate = /already|duplicate|exists/i.test(authError.message)
      throw new RequestError(duplicate ? 409 : 400, duplicate ? 'An account with this email already exists.' : authError.message)
    }

    const { error: profileError } = await admin.from('user_profiles').upsert({
      user_id: user.id,
      display_name: displayName,
    })
    if (profileError) throw profileError

    return jsonResponse({ upgraded: true })
  } catch (error) {
    return handleError(error)
  }
})
