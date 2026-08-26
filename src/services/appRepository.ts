import type {
  AppData,
  Player,
  Session,
  SessionPlayer,
  Transaction,
  Workspace,
} from '../types/domain'

export interface SessionRecords {
  session: Session
  sessionPlayers: SessionPlayer[]
  transactions: Transaction[]
}

export interface AppRepository {
  readonly kind: 'local' | 'supabase'
  getWorkspace(): Promise<Workspace | null>
  load(workspaceId: string): Promise<AppData>
  addPlayer(player: Player): Promise<void>
  createSession(records: SessionRecords): Promise<void>
  addTransaction(transaction: Transaction): Promise<void>
  updateTransaction(transaction: Transaction): Promise<void>
  importData(workspaceId: string, data: AppData): Promise<void>
}

export function emptyAppData(): AppData {
  return {
    players: [],
    sessions: [],
    sessionPlayers: [],
    transactions: [],
  }
}

export function hasAppData(data: AppData): boolean {
  return (
    data.players.length > 0 ||
    data.sessions.length > 0 ||
    data.sessionPlayers.length > 0 ||
    data.transactions.length > 0
  )
}
