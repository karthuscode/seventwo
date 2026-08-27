import { useCallback, useEffect, useState, type PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../../services/supabaseClient'
import { AuthContext, type AuthMode } from './AuthContext'

const TRANSFER_TOKEN_KEY = 'seventwo-account-transfer-token'

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
      if (data.session) {
        setSession(data.session)
        return
      }
      const { data: anonymousData, error: anonymousError } = await supabase.auth.signInAnonymously()
      if (anonymousError) throw anonymousError
      setSession(anonymousData.session)
    } catch (caughtError) {
      setSession(null)
      setError(toMessage(caughtError, 'Unable to start SevenTwo.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const completePendingTransfer = useCallback(async (nextSession: Session) => {
    if (!supabase || nextSession.user.is_anonymous) return
    const token = window.sessionStorage.getItem(TRANSFER_TOKEN_KEY)
    if (!token) return
    const { error: transferError } = await supabase.functions.invoke('transfer-anonymous-access', {
      body: { mode: 'complete', token },
    })
    if (transferError) {
      setError('Signed in, but anonymous workspace access could not be transferred automatically.')
      return
    }
    window.sessionStorage.removeItem(TRANSFER_TOKEN_KEY)
  }, [])

  useEffect(() => {
    if (!supabase) return
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) window.setTimeout(() => void completePendingTransfer(nextSession), 0)
    })
    // Auth hydration is the external synchronization this effect owns.
    // oxlint-disable-next-line react/set-state-in-effect
    void ensureSession()
    return () => listener.subscription.unsubscribe()
  }, [completePendingTransfer, ensureSession])

  async function createAccount(email: string, displayName: string) {
    if (!supabase || !session?.user.is_anonymous) throw new Error('This SevenTwo identity is already registered.')
    const cleanEmail = email.trim().toLowerCase()
    const cleanName = displayName.trim()
    if (!cleanEmail || !cleanName) throw new Error('Enter your name and email.')
    const { error: updateError } = await supabase.auth.updateUser(
      { email: cleanEmail, data: { display_name: cleanName } },
      { emailRedirectTo: window.location.origin },
    )
    if (updateError) throw updateError
  }

  async function signInWithEmail(email: string) {
    if (!supabase) throw new Error('Email sign-in requires Supabase mode.')
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) throw new Error('Enter your email.')
    if (session?.user.is_anonymous) {
      const { data, error: transferError } = await supabase.functions.invoke('transfer-anonymous-access', {
        body: { mode: 'prepare' },
      })
      if (transferError) throw transferError
      window.sessionStorage.setItem(TRANSFER_TOKEN_KEY, data.token)
    }
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    })
    if (otpError) throw otpError
  }

  async function updateDisplayName(displayName: string) {
    if (!supabase || !session || session.user.is_anonymous) throw new Error('Register your SevenTwo identity first.')
    const cleanName = displayName.trim()
    if (!cleanName) throw new Error('Enter a display name.')
    const { error: authError } = await supabase.auth.updateUser({ data: { display_name: cleanName } })
    if (authError) throw authError
    const { error: profileError } = await supabase.from('user_profiles').upsert({
      user_id: session.user.id,
      display_name: cleanName,
    })
    if (profileError) throw profileError
  }

  async function signOut() {
    if (!supabase) return
    setIsLoading(true)
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) throw signOutError
      const { data, error: anonymousError } = await supabase.auth.signInAnonymously()
      if (anonymousError) throw anonymousError
      setSession(data.session)
    } finally {
      setIsLoading(false)
    }
  }

  const value = {
    mode,
    user: (session?.user ?? null) as User | null,
    isAuthenticated: mode === 'local' || Boolean(session?.user),
    isRegistered: Boolean(session?.user && !session.user.is_anonymous),
    isLoading,
    error,
    retry: ensureSession,
    createAccount,
    signInWithEmail,
    updateDisplayName,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
