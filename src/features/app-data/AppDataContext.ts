import { createContext } from 'react'
import type {
  AppData,
  CashOutInput,
  NewSessionInput,
  NewPlanInput,
  Plan,
  PlanVoteResponse,
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
  updatePlayer: (player: Player) => Promise<void>
  deletePlayer: (playerId: string) => Promise<void>
  createSession: (input: NewSessionInput) => Promise<Session>
  createSessionFromPlan: (input: NewSessionInput & { planId: string }) => Promise<Session>
  finishSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  addPlayerToSession: (input: NewTransactionInput) => Promise<void>
  removeSessionPlayer: (sessionPlayerId: string) => Promise<void>
  saveCashOut: (input: CashOutInput) => Promise<void>
  addTransaction: (input: NewTransactionInput) => Promise<void>
  updateTransaction: (input: UpdateTransactionInput) => Promise<void>
  createPlan: (input: NewPlanInput) => Promise<Plan>
  savePlanVote: (
    planId: string,
    optionId: string,
    playerId: string,
    response: PlanVoteResponse,
  ) => Promise<void>
  confirmPlan: (planId: string, optionId: string, hostUserId: string) => Promise<void>
  updateWorkspaceMemberRole: (userId: string, role: 'HOST' | 'PLAYER') => Promise<void>
  importLocalData: () => Promise<void>
  refresh: () => Promise<void>
  clearError: () => void
}

export const AppDataContext = createContext<AppDataContextValue | null>(null)
