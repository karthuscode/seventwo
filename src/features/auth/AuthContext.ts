import { createContext } from 'react'
import type { User } from '@supabase/supabase-js'

export type AuthMode = 'supabase' | 'local'

export interface AuthContextValue {
  mode: AuthMode
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  configurationError: string | null
  signIn: (accessCode: string) => Promise<void>
  continueLocally: () => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
