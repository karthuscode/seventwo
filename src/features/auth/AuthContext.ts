import { createContext } from 'react'
import type { User } from '@supabase/supabase-js'

export type AuthMode = 'supabase' | 'local'

export interface AuthContextValue {
  mode: AuthMode
  user: User | null
  isAuthenticated: boolean
  isRegistered: boolean
  isLoading: boolean
  error: string | null
  retry: () => Promise<void>
  createAccount: (email: string, displayName: string) => Promise<void>
  signInWithEmail: (email: string) => Promise<void>
  updateDisplayName: (displayName: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
