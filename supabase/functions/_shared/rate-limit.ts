import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { RequestError } from './http.ts'

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 8

interface AttemptRow {
  user_id: string
  window_started_at: string
  failed_attempts: number
  blocked_until: string | null
}

export async function enforceJoinRateLimit(
  admin: SupabaseClient,
  userId: string,
): Promise<AttemptRow | null> {
  const { data, error } = await admin
    .from('workspace_join_attempts')
    .select('user_id, window_started_at, failed_attempts, blocked_until')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error

  const attempt = data as AttemptRow | null
  if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > Date.now()) {
    throw new RequestError(
      429,
      'Too many attempts. Wait 15 minutes before trying another code.',
    )
  }
  return attempt
}

export async function recordJoinFailure(
  admin: SupabaseClient,
  userId: string,
  current: AttemptRow | null,
): Promise<void> {
  const now = Date.now()
  const withinWindow =
    current && now - Date.parse(current.window_started_at) < WINDOW_MS
  const failedAttempts = withinWindow ? current.failed_attempts + 1 : 1
  const blockedUntil =
    failedAttempts >= MAX_FAILURES
      ? new Date(now + WINDOW_MS).toISOString()
      : null

  const { error } = await admin.from('workspace_join_attempts').upsert({
    user_id: userId,
    window_started_at: withinWindow
      ? current.window_started_at
      : new Date(now).toISOString(),
    failed_attempts: failedAttempts,
    blocked_until: blockedUntil,
    updated_at: new Date(now).toISOString(),
  })
  if (error) throw error
}

export async function clearJoinFailures(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin
    .from('workspace_join_attempts')
    .delete()
    .eq('user_id', userId)
  if (error) throw error
}
