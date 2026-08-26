import { createContext } from 'react'
import type {
  AppData,
  NewSessionInput,
  NewTransactionInput,
  Player,
  Session,
  UpdateTransactionInput,
  Workspace,
} from '../../types/domain'

export interface AppDataContextValue extends AppData {
  workspace: Workspace
  repositoryKind: 'local' | 'supabase'
  isSaving: boolean
  error: string | null
  canImportLocalData: boolean
  addPlayer: (nickname: string) => Promise<Player>
  createSession: (input: NewSessionInput) => Promise<Session>
  addTransaction: (input: NewTransactionInput) => Promise<void>
  updateTransaction: (input: UpdateTransactionInput) => Promise<void>
  importLocalData: () => Promise<void>
  refresh: () => Promise<void>
  clearError: () => void
}

export const AppDataContext = createContext<AppDataContextValue | null>(null)
