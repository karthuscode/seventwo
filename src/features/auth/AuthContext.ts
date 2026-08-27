import { createContext } from 'react'
import type { User } from '@supabase/supabase-js'

export type AuthMode = 'supabase' | 'local'

export interface AuthContextValue {
  mode: AuthMode
  user: User | null
  isAuthenticated: boolean
  isRegistered: boolean
  isLegacyAnonymous: boolean
  isLoading: boolean
  error: string | null
  retry: () => Promise<void>
  createAccount: (
    email: string,
    displayName: string,
    password: string,
  ) => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  upgradeAnonymousOwnerAccount: (
    email: string,
    displayName: string,
    password: string,
  ) => Promise<void>
  updateDisplayName: (displayName: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
