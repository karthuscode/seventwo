import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  isSupabaseConfigured,
  supabase,
  supabaseHostEmail,
} from '../../services/supabaseClient'
import { AuthContext, type AuthMode } from './AuthContext'

const LOCAL_ACCESS_KEY = 'seventwo-local-demo-access'

export function AuthProvider({ children }: PropsWithChildren) {
  const mode: AuthMode = isSupabaseConfigured ? 'supabase' : 'local'
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)
  const [localAccess, setLocalAccess] = useState(
    () => window.localStorage.getItem(LOCAL_ACCESS_KEY) === 'true',
  )

  useEffect(() => {
    if (!supabase) return

    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session)
        setIsLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setIsLoading(false)
      },
    )

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const configurationError =
    isSupabaseConfigured && !supabaseHostEmail
      ? 'VITE_SUPABASE_HOST_EMAIL is missing. Add the shared host account email to the environment.'
      : null

  const value = useMemo(
    () => ({
      mode,
      user: (session?.user ?? null) as User | null,
      isAuthenticated: mode === 'supabase' ? Boolean(session) : localAccess,
      isLoading,
      configurationError,
      signIn: async (accessCode: string) => {
        if (!supabase || !supabaseHostEmail) {
          throw new Error(
            configurationError ?? 'Supabase authentication is not configured.',
          )
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: supabaseHostEmail,
          password: accessCode,
        })
        if (error) {
          throw new Error(
            error.message === 'Invalid login credentials'
              ? 'Access code not accepted.'
              : error.message,
          )
        }
      },
      continueLocally: () => {
        window.localStorage.setItem(LOCAL_ACCESS_KEY, 'true')
        setLocalAccess(true)
      },
      signOut: async () => {
        if (supabase) {
          const { error } = await supabase.auth.signOut()
          if (error) throw new Error(error.message)
          setSession(null)
        } else {
          window.localStorage.removeItem(LOCAL_ACCESS_KEY)
          setLocalAccess(false)
        }
      },
    }),
    [configurationError, isLoading, localAccess, mode, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
