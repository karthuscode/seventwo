import {
  createClient,
  type SupabaseClient,
  type User,
} from 'npm:@supabase/supabase-js@2.112.4'
import { RequestError } from './http.ts'

interface FunctionContext {
  admin: SupabaseClient
  user: User
}

export async function requireFunctionContext(
  request: Request,
): Promise<FunctionContext> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    throw new RequestError(401, 'A valid SevenTwo session is required.')
  }

  const supabaseUrl = requiredSecret('SUPABASE_URL')
  const anonKey = requiredSecret('SUPABASE_ANON_KEY')
  const serviceRoleKey = requiredSecret('SUPABASE_SERVICE_ROLE_KEY')
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await userClient.auth.getUser()

  if (error || !data.user) {
    throw new RequestError(401, 'Your SevenTwo session has expired.')
  }
  if (!data.user.is_anonymous) {
    throw new RequestError(403, 'An anonymous SevenTwo session is required.')
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { admin, user: data.user }
}

function requiredSecret(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}
