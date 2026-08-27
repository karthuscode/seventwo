import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'

const CODE_SPACE = 1_000_000
const RANDOM_SPACE = 0x1_000_000
const ACCEPTED_RANDOM_SPACE = Math.floor(RANDOM_SPACE / CODE_SPACE) * CODE_SPACE

export function generateWorkspaceCode(): string {
  const randomBytes = new Uint8Array(3)
  let value: number
  do {
    crypto.getRandomValues(randomBytes)
    value =
      (randomBytes[0] << 16) | (randomBytes[1] << 8) | randomBytes[2]
  } while (value >= ACCEPTED_RANDOM_SPACE)

  return String(value % CODE_SPACE).padStart(6, '0')
}

export async function digestWorkspaceCode(code: string): Promise<string> {
  return digestSecret(code)
}

export async function deriveWorkspaceCode(seed: string): Promise<string> {
  for (let counter = 0; counter < 20; counter += 1) {
    const digest = await digestSecret(`WORKSPACE_INVITE:${seed}:${counter}`)
    const value = Number.parseInt(digest.slice(0, 6), 16)
    if (value < ACCEPTED_RANDOM_SPACE) {
      return String(value % CODE_SPACE).padStart(6, '0')
    }
  }
  throw new Error('Unable to derive a workspace invite code.')
}

export async function digestSecret(value: string): Promise<string> {
  const pepper = Deno.env.get('WORKSPACE_CODE_PEPPER')
  if (!pepper || pepper.length < 32) {
    throw new Error('WORKSPACE_CODE_PEPPER must contain at least 32 characters.')
  }

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export async function digestPlayerInviteCode(code: string): Promise<string> {
  return digestSecret(`PLAYER_INVITE:${code}`)
}

export async function digestAccountTransferToken(token: string): Promise<string> {
  return digestSecret(`ACCOUNT_TRANSFER:${token}`)
}

export function generateTransferToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function generateUniqueWorkspaceCode(
  admin: SupabaseClient,
): Promise<{ accessCode: string; digest: string }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const accessCode = generateWorkspaceCode()
    const digest = await digestWorkspaceCode(accessCode)
    const { data, error } = await admin
      .from('workspaces')
      .select('id')
      .eq('access_code_digest', digest)
      .maybeSingle()

    if (error) throw error
    if (!data) return { accessCode, digest }
  }

  throw new Error('Unable to allocate a unique workspace code.')
}

export async function allocateWorkspaceInvite(
  admin: SupabaseClient,
): Promise<{ accessCode: string; digest: string; seed: string }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const seed = crypto.randomUUID()
    const accessCode = await deriveWorkspaceCode(seed)
    const digest = await digestWorkspaceCode(accessCode)
    const { data, error } = await admin
      .from('workspaces')
      .select('id')
      .eq('access_code_digest', digest)
      .maybeSingle()
    if (error) throw error
    if (!data) return { accessCode, digest, seed }
  }
  throw new Error('Unable to allocate a unique workspace invite code.')
}

export function isWorkspaceCode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value)
}
