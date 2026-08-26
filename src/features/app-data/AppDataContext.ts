import { createContext } from 'react'
import type {
  AppData,
  NewSessionInput,
  NewTransactionInput,
  Player,
  Session,
} from '../../types/domain'

export interface AppDataContextValue extends AppData {
  addPlayer: (nickname: string) => Player
  createSession: (input: NewSessionInput) => Session
  addTransaction: (input: NewTransactionInput) => void
}

export const AppDataContext = createContext<AppDataContextValue | null>(null)
