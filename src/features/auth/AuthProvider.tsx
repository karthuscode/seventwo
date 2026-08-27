import { useCallback, useEffect, useState, type PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../../services/supabaseClient'
import { AuthContext, type AuthMode } from './AuthContext'

export function AuthProvider({ children }: PropsWithChildren) {
  const mode: AuthMode = isSupabaseConfigured ? 'supabase' : 'local'
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  const ensureSession = useCallback(async () => {
    if (!supabase) return
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      setSession(data.session)
    } catch (caughtError) {
      setSession(null)
      setError(toMessage(caughtError, 'Unable to start SevenTwo.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    // Auth hydration is the external synchronization this effect owns.
    // oxlint-disable-next-line react/set-state-in-effect
    void ensureSession()
    return () => listener.subscription.unsubscribe()
  }, [ensureSession])

  async function createAccount(email: string, displayName: string, password: string) {
    if (!supabase) throw new Error('Supabase is required for registered accounts.')
    const cleanEmail = email.trim().toLowerCase()
    const cleanName = normalizeDisplayName(displayName)
    validateEmailPassword(cleanEmail, password)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { display_name: cleanName } },
    })
    if (signUpError) throw signUpError
    if (!data.session) {
      throw new Error('Account created, but SevenTwo could not sign you in. Check that email confirmation is disabled.')
    }
    if (!data.user) throw new Error('Account created, but SevenTwo could not load your profile.')
    setSession(data.session)
    await upsertProfile(data.user.id, cleanName)
  }

  async function signInWithPassword(email: string, password: string) {
    if (!supabase) throw new Error('Email sign-in requires Supabase mode.')
    const cleanEmail = email.trim().toLowerCase()
    validateEmailPassword(cleanEmail, password)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })
    if (signInError) throw signInError
    setSession(data.session)
  }

  async function upgradeAnonymousOwnerAccount(
    email: string,
    displayName: string,
    password: string,
  ) {
    if (!supabase || !session?.user.is_anonymous) {
      throw new Error('A legacy guest-owner session is required.')
    }
    const cleanEmail = email.trim().toLowerCase()
    const cleanName = normalizeDisplayName(displayName)
    validateEmailPassword(cleanEmail, password)
    const { error: upgradeError } = await supabase.functions.invoke(
      'upgrade-anonymous-owner',
      { body: { email: cleanEmail, displayName: cleanName, password } },
    )
    if (upgradeError) throw await toFunctionMessage(upgradeError)
    await supabase.auth.signOut({ scope: 'local' })
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })
    if (signInError) throw signInError
    setSession(data.session)
  }

  async function updateDisplayName(displayName: string) {
    if (!supabase || !session || session.user.is_anonymous) throw new Error('Register your SevenTwo identity first.')
    const cleanName = normalizeDisplayName(displayName)
    const { error: authError } = await supabase.auth.updateUser({ data: { display_name: cleanName } })
    if (authError) throw authError
    await upsertProfile(session.user.id, cleanName)
  }

  async function signOut() {
    if (!supabase) return
    setIsLoading(true)
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) throw signOutError
      setSession(null)
    } finally {
      setIsLoading(false)
    }
  }

  const isRegistered = Boolean(session?.user && !session.user.is_anonymous)
  const isLegacyAnonymous = Boolean(session?.user?.is_anonymous)
  const value = {
    mode,
    user: (session?.user ?? null) as User | null,
    isAuthenticated: mode === 'local' || isRegistered,
    isRegistered,
    isLegacyAnonymous,
    isLoading,
    error,
    retry: ensureSession,
    createAccount,
    signInWithPassword,
    upgradeAnonymousOwnerAccount,
    updateDisplayName,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function normalizeDisplayName(displayName: string): string {
  const cleanName = displayName.trim()
  if (cleanName.length < 2 || cleanName.length > 24) {
    throw new Error('Username must be 2–24 characters.')
  }
  return cleanName
}

function validateEmailPassword(email: string, password: string): void {
  if (!email) throw new Error('Enter your email.')
  if (!password) throw new Error('Enter your password.')
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')
}

async function upsertProfile(userId: string, displayName: string): Promise<void> {
  if (!supabase) return
  const { error: profileError } = await supabase.from('user_profiles').upsert({
    user_id: userId,
    display_name: displayName,
  })
  if (profileError) throw profileError
}

async function toFunctionMessage(error: Error & { context?: unknown }): Promise<Error> {
  const response = error.context
  if (response instanceof Response) {
    try {
      const body = (await response.json()) as { error?: unknown }
      if (typeof body.error === 'string') return new Error(body.error)
    } catch {
      // Fall through to the original function error.
    }
  }
  return error
}
