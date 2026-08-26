import {
  emptyAppData,
  hasAppData,
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
  WorkspaceAccessResult,
} from '../types/domain'

const LEGACY_STORAGE_KEY = 'poker-session-manager-data-v1'
const WORKSPACES_STORAGE_KEY = 'seventwo-local-workspaces-v2'
export const SELECTED_WORKSPACE_KEY = 'seventwo-selected-workspace-id'
export const LOCAL_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

interface LocalWorkspaceState {
  version: 2
  workspaces: Workspace[]
  dataByWorkspace: Record<string, AppData>
  accessCodes: Record<string, string>
}

export class LocalStorageRepository implements AppRepository {
  readonly kind = 'local' as const

  async listWorkspaces(): Promise<Workspace[]> {
    return this.readState().workspaces
  }

  async createWorkspace(name: string): Promise<WorkspaceAccessResult> {
    const state = this.readState()
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      role: 'OWNER',
    }
    const accessCode = createLocalCode(new Set(Object.values(state.accessCodes)))
    this.writeState({
      ...state,
      workspaces: [...state.workspaces, workspace],
      dataByWorkspace: {
        ...state.dataByWorkspace,
        [workspace.id]: emptyAppData(),
      },
      accessCodes: { ...state.accessCodes, [workspace.id]: accessCode },
    })
    return { workspace, accessCode }
  }

  async joinWorkspace(code: string): Promise<Workspace> {
    if (!/^\d{6}$/.test(code)) {
      throw new Error('Enter exactly six digits.')
    }
    const state = this.readState()
    const workspaceId = Object.entries(state.accessCodes).find(
      ([, savedCode]) => savedCode === code,
    )?.[0]
    const workspace = state.workspaces.find((item) => item.id === workspaceId)
    if (!workspace) throw new Error('Workspace code not found in this local demo.')
    return workspace
  }

  async rotateWorkspaceCode(workspaceId: string): Promise<string> {
    const state = this.readState()
    const workspace = state.workspaces.find((item) => item.id === workspaceId)
    if (!workspace || workspace.role !== 'OWNER') {
      throw new Error('Only a workspace owner can regenerate its code.')
    }
    const accessCode = createLocalCode(new Set(Object.values(state.accessCodes)))
    this.writeState({
      ...state,
      accessCodes: { ...state.accessCodes, [workspaceId]: accessCode },
    })
    return accessCode
  }

  async load(workspaceId: string): Promise<AppData> {
    return this.readState().dataByWorkspace[workspaceId] ?? emptyAppData()
  }

  async loadLegacyData(): Promise<AppData | null> {
    const savedData = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!savedData) return null
    try {
      const data = withWorkspaceId(
        JSON.parse(savedData) as AppData,
        LOCAL_WORKSPACE_ID,
      )
      return hasAppData(data) ? data : null
    } catch {
      return null
    }
  }

  async addPlayer(player: Player): Promise<void> {
    this.updateData(player.workspaceId, (data) => ({
      ...data,
      players: [...data.players, player],
    }))
  }

  async createSession(records: SessionRecords): Promise<void> {
    this.updateData(records.session.workspaceId, (data) => ({
      ...data,
      sessions: [...data.sessions, records.session],
      sessionPlayers: [...data.sessionPlayers, ...records.sessionPlayers],
      transactions: [...data.transactions, ...records.transactions],
    }))
  }

  async addTransaction(transaction: Transaction): Promise<void> {
    this.updateData(transaction.workspaceId, (data) => ({
      ...data,
      transactions: [...data.transactions, transaction],
    }))
  }

  async updateTransaction(transaction: Transaction): Promise<void> {
    this.updateData(transaction.workspaceId, (data) => ({
      ...data,
      transactions: data.transactions.map((item) =>
        item.id === transaction.id ? transaction : item,
      ),
    }))
  }

  async importData(workspaceId: string, data: AppData): Promise<void> {
    this.updateData(workspaceId, () => withWorkspaceId(data, workspaceId))
  }

  private updateData(
    workspaceId: string,
    update: (data: AppData) => AppData,
  ): void {
    const state = this.readState()
    const current = state.dataByWorkspace[workspaceId] ?? emptyAppData()
    this.writeState({
      ...state,
      dataByWorkspace: {
        ...state.dataByWorkspace,
        [workspaceId]: update(current),
      },
    })
  }

  private readState(): LocalWorkspaceState {
    const savedState = window.localStorage.getItem(WORKSPACES_STORAGE_KEY)
    if (savedState) {
      try {
        return JSON.parse(savedState) as LocalWorkspaceState
      } catch {
        // Fall through to the non-destructive legacy migration.
      }
    }

    const migrated = this.migrateLegacyState()
    this.writeState(migrated)
    return migrated
  }

  private migrateLegacyState(): LocalWorkspaceState {
    const savedData = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!savedData) return emptyLocalState()

    try {
      const data = withWorkspaceId(
        JSON.parse(savedData) as AppData,
        LOCAL_WORKSPACE_ID,
      )
      if (!hasAppData(data)) return emptyLocalState()

      const workspace: Workspace = {
        id: LOCAL_WORKSPACE_ID,
        name: 'SevenTwo local game',
        createdAt: new Date(0).toISOString(),
        role: 'OWNER',
      }
      return {
        version: 2,
        workspaces: [workspace],
        dataByWorkspace: { [workspace.id]: data },
        accessCodes: {
          [workspace.id]: createLocalCode(new Set<string>()),
        },
      }
    } catch {
      return emptyLocalState()
    }
  }

  private writeState(state: LocalWorkspaceState): void {
    window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(state))
  }
}

function emptyLocalState(): LocalWorkspaceState {
  return {
    version: 2,
    workspaces: [],
    dataByWorkspace: {},
    accessCodes: {},
  }
}

function createLocalCode(existingCodes: Set<string>): string {
  const codeSpace = 1_000_000
  const randomSpace = 0x1_000_000
  const acceptedRandomSpace = Math.floor(randomSpace / codeSpace) * codeSpace
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const randomBytes = crypto.getRandomValues(new Uint8Array(3))
    const randomValue =
      (randomBytes[0] << 16) | (randomBytes[1] << 8) | randomBytes[2]
    if (randomValue >= acceptedRandomSpace) continue
    const code = (randomValue % codeSpace).toString().padStart(6, '0')
    if (!existingCodes.has(code)) return code
  }
  throw new Error('Unable to generate a unique local workspace code.')
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
