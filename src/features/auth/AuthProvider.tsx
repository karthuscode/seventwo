import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  isSupabaseConfigured,
  supabase,
} from '../../services/supabaseClient'
import { AuthContext, type AuthMode } from './AuthContext'

export function AuthProvider({ children }: PropsWithChildren) {
  const mode: AuthMode = isSupabaseConfigured ? 'supabase' : 'local'
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  const ensureAnonymousSession = useCallback(async () => {
    if (!supabase) return
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError

      if (data.session?.user.is_anonymous) {
        setSession(data.session)
        return
      }

      if (data.session) {
        const { error: signOutError } = await supabase.auth.signOut({
          scope: 'local',
        })
        if (signOutError) throw signOutError
      }

      const { data: anonymousData, error: anonymousError } =
        await supabase.auth.signInAnonymously()
      if (anonymousError) throw anonymousError
      setSession(anonymousData.session)
    } catch (caughtError) {
      setSession(null)
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to create an anonymous SevenTwo session.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession?.user.is_anonymous ? nextSession : null)
      },
    )
    // Anonymous auth session hydration is the external synchronization here.
    // oxlint-disable-next-line react/set-state-in-effect
    void ensureAnonymousSession()

    return () => listener.subscription.unsubscribe()
  }, [ensureAnonymousSession])

  const value = useMemo(
    () => ({
      mode,
      user: (session?.user ?? null) as User | null,
      isAuthenticated: mode === 'local' || Boolean(session?.user.is_anonymous),
      isLoading,
      error,
      retry: ensureAnonymousSession,
    }),
    [ensureAnonymousSession, error, isLoading, mode, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
