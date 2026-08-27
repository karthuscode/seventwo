import { corsHeaders, handleError, jsonResponse, readJson, RequestError } from '../_shared/http.ts'
import { requireFunctionContext } from '../_shared/supabase.ts'
import { digestAccountTransferToken, generateTransferToken } from '../_shared/workspace-code.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const body = await readJson(request)
    const mode = body.mode
    if (mode === 'prepare') {
      const { admin, user } = await requireFunctionContext(request)
      if (!user.is_anonymous) throw new RequestError(409, 'This account is already registered.')
      const token = generateTransferToken()
      const digest = await digestAccountTransferToken(token)
      const { error } = await admin.from('account_access_transfers').insert({
        source_user_id: user.id,
        token_digest: digest,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })
      if (error) throw error
      return jsonResponse({ token, expiresInSeconds: 900 })
    }
    if (mode === 'complete') {
      const { admin, user } = await requireFunctionContext(request, { registeredOnly: true })
      const token = typeof body.token === 'string' ? body.token : ''
      if (!/^[0-9a-f]{64}$/.test(token)) throw new RequestError(400, 'Access transfer is invalid or expired.')
      const digest = await digestAccountTransferToken(token)
      const { data: transfer, error: findError } = await admin
        .from('account_access_transfers').select('id, expires_at, completed_at')
        .eq('token_digest', digest).maybeSingle()
      if (findError) throw findError
      if (!transfer || transfer.completed_at || Date.parse(transfer.expires_at) <= Date.now()) {
        throw new RequestError(404, 'Access transfer is invalid or expired.')
      }
      const { error } = await admin.rpc('complete_anonymous_access_transfer', {
        target_transfer_id: transfer.id,
        destination_user_id: user.id,
      })
      if (error) throw error
      return jsonResponse({ completed: true })
    }
    throw new RequestError(400, 'Choose a valid access-transfer action.')
  } catch (error) {
    return handleError(error)
  }
})
