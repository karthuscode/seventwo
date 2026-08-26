import {
  emptyAppData,
  type AppRepository,
  type SessionRecords,
} from './appRepository'
import type {
  AppData,
  Player,
  Session,
  SessionPlayer,
  Transaction,
  Workspace,
} from '../types/domain'

const STORAGE_KEY = 'poker-session-manager-data-v1'
export const LOCAL_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

const LOCAL_WORKSPACE: Workspace = {
  id: LOCAL_WORKSPACE_ID,
  name: 'Local SevenTwo demo',
  createdAt: new Date(0).toISOString(),
  role: 'OWNER',
}

export class LocalStorageRepository implements AppRepository {
  readonly kind = 'local' as const

  async getWorkspace(): Promise<Workspace> {
    return LOCAL_WORKSPACE
  }

  async load(workspaceId = LOCAL_WORKSPACE_ID): Promise<AppData> {
    return this.read(workspaceId)
  }

  async addPlayer(player: Player): Promise<void> {
    const data = this.read(player.workspaceId)
    this.write({ ...data, players: [...data.players, player] })
  }

  async createSession(records: SessionRecords): Promise<void> {
    const data = this.read(records.session.workspaceId)
    this.write({
      ...data,
      sessions: [...data.sessions, records.session],
      sessionPlayers: [...data.sessionPlayers, ...records.sessionPlayers],
      transactions: [...data.transactions, ...records.transactions],
    })
  }

  async addTransaction(transaction: Transaction): Promise<void> {
    const data = this.read(transaction.workspaceId)
    this.write({
      ...data,
      transactions: [...data.transactions, transaction],
    })
  }

  async updateTransaction(transaction: Transaction): Promise<void> {
    const data = this.read(transaction.workspaceId)
    this.write({
      ...data,
      transactions: data.transactions.map((item) =>
        item.id === transaction.id ? transaction : item,
      ),
    })
  }

  async importData(workspaceId: string, data: AppData): Promise<void> {
    this.write(withWorkspaceId(data, workspaceId))
  }

  private read(workspaceId: string): AppData {
    const savedData = window.localStorage.getItem(STORAGE_KEY)
    if (!savedData) return emptyAppData()

    try {
      return withWorkspaceId(JSON.parse(savedData) as AppData, workspaceId)
    } catch {
      return emptyAppData()
    }
  }

  private write(data: AppData): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }
}

function withWorkspaceId(data: AppData, workspaceId: string): AppData {
  return {
    players: data.players.map((player) => normalizePlayer(player, workspaceId)),
    sessions: data.sessions.map((session) =>
      normalizeSession(session, workspaceId),
    ),
    sessionPlayers: data.sessionPlayers.map((sessionPlayer) =>
      normalizeSessionPlayer(sessionPlayer, workspaceId),
    ),
    transactions: data.transactions.map((transaction) =>
      normalizeTransaction(transaction, workspaceId),
    ),
  }
}

function normalizePlayer(player: Player, workspaceId: string): Player {
  return { ...player, workspaceId }
}

function normalizeSession(session: Session, workspaceId: string): Session {
  return { ...session, workspaceId }
}

function normalizeSessionPlayer(
  sessionPlayer: SessionPlayer,
  workspaceId: string,
): SessionPlayer {
  return { ...sessionPlayer, workspaceId }
}

function normalizeTransaction(
  transaction: Transaction,
  workspaceId: string,
): Transaction {
  return {
    ...transaction,
    workspaceId,
    updatedAt: transaction.updatedAt ?? transaction.createdAt,
  }
}
