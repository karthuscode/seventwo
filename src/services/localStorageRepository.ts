import {
  emptyAppData,
  hasAppData,
  type AppRepository,
  type CashOutRecords,
  type SessionPlayerRecords,
  type SessionRecords,
} from './appRepository'
import type {
  AppData,
  PaymentOffset,
  Player,
  PayoutAllocation,
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
    return withWorkspaceId(
      this.readState().dataByWorkspace[workspaceId] ?? emptyAppData(),
      workspaceId,
    )
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

  async updatePlayer(player: Player): Promise<void> {
    this.updateData(player.workspaceId, (data) => ({
      ...data,
      players: data.players.map((item) =>
        item.id === player.id ? player : item,
      ),
    }))
  }

  async deletePlayer(playerId: string, workspaceId: string): Promise<void> {
    this.updateData(workspaceId, (data) => {
      const hasHistory =
        data.sessionPlayers.some((item) => item.playerId === playerId) ||
        data.transactions.some((item) => item.playerId === playerId)
      if (hasHistory) {
        throw new Error(
          'This player has session history. Archive the player instead of deleting them.',
        )
      }
      return {
        ...data,
        players: data.players.filter((item) => item.id !== playerId),
      }
    })
  }

  async createSession(records: SessionRecords): Promise<void> {
    this.updateData(records.session.workspaceId, (data) => ({
      ...data,
      sessions: [...data.sessions, records.session],
      sessionPlayers: [...data.sessionPlayers, ...records.sessionPlayers],
      transactions: [...data.transactions, ...records.transactions],
    }))
  }

  async updateSession(session: Session): Promise<void> {
    this.updateData(session.workspaceId, (data) => {
      if (
        session.status === 'FINISHED' &&
        data.sessionPlayers.some(
          (item) =>
            item.sessionId === session.id &&
            (item.status !== 'CASHED_OUT' ||
              item.cashOutChips === null ||
              item.cashOutAmount === null ||
              item.cashedOutAt === null),
        )
      ) {
        throw new Error('Every participant must be cashed out before finishing.')
      }
      return {
        ...data,
        sessions: data.sessions.map((item) =>
          item.id === session.id ? session : item,
        ),
      }
    })
  }

  async deleteSession(sessionId: string, workspaceId: string): Promise<void> {
    this.updateData(workspaceId, (data) => ({
      ...data,
      sessions: data.sessions.filter((item) => item.id !== sessionId),
      sessionPlayers: data.sessionPlayers.filter(
        (item) => item.sessionId !== sessionId,
      ),
      transactions: data.transactions.filter(
        (item) => item.sessionId !== sessionId,
      ),
      payoutAllocations: data.payoutAllocations.filter(
        (item) => item.sessionId !== sessionId,
      ),
      paymentOffsets: data.paymentOffsets.filter(
        (item) => item.sessionId !== sessionId,
      ),
    }))
  }

  async addSessionPlayer(records: SessionPlayerRecords): Promise<void> {
    this.updateData(records.sessionPlayer.workspaceId, (data) => ({
      ...data,
      sessionPlayers: [...data.sessionPlayers, records.sessionPlayer],
      transactions: [...data.transactions, records.transaction],
    }))
  }

  async removeSessionPlayer(
    sessionPlayerId: string,
    workspaceId: string,
  ): Promise<void> {
    this.updateData(workspaceId, (data) => {
      const sessionPlayer = data.sessionPlayers.find(
        (item) => item.id === sessionPlayerId,
      )
      if (!sessionPlayer) throw new Error('Session player not found.')
      const session = data.sessions.find(
        (item) => item.id === sessionPlayer.sessionId,
      )
      if (!session || session.status !== 'ACTIVE') {
        throw new Error('Players can only be removed from an active session.')
      }

      const hasTransactions = data.transactions.some(
        (item) =>
          item.sessionId === sessionPlayer.sessionId &&
          item.playerId === sessionPlayer.playerId,
      )
      if (hasTransactions) {
        throw new Error(
          'This player already has financial history in the session and cannot be removed.',
        )
      }

      return {
        ...data,
        sessionPlayers: data.sessionPlayers.filter(
          (item) => item.id !== sessionPlayerId,
        ),
        payoutAllocations: data.payoutAllocations.filter(
          (item) => item.sessionPlayerId !== sessionPlayerId,
        ),
        paymentOffsets: data.paymentOffsets.filter(
          (item) => item.sessionPlayerId !== sessionPlayerId,
        ),
      }
    })
  }

  async saveCashOut(records: CashOutRecords): Promise<void> {
    this.updateData(records.sessionPlayer.workspaceId, (data) => {
      const session = data.sessions.find(
        (item) => item.id === records.sessionPlayer.sessionId,
      )
      if (!session || session.status !== 'ACTIVE') {
        throw new Error('Cash-out corrections require an active session.')
      }
      const grossMinor = Math.round(
        (records.sessionPlayer.cashOutAmount ?? 0) * 100,
      )
      const expectedGrossMinor = Math.round(
        ((records.sessionPlayer.cashOutChips ?? -1) *
          Math.round(session.buyInAmount * 100)) /
          session.chipsPerBuyIn,
      )
      if (
        records.sessionPlayer.cashOutChips === null ||
        records.sessionPlayer.cashOutChips < 0 ||
        grossMinor !== expectedGrossMinor
      ) {
        throw new Error(
          'Gross cash-out does not match the session chip conversion.',
        )
      }
      const issuedChips = data.transactions
        .filter((item) => item.sessionId === records.sessionPlayer.sessionId)
        .reduce((total, item) => total + item.chips, 0)
      const alreadyCashedOutChips = data.sessionPlayers
        .filter(
          (item) =>
            item.sessionId === records.sessionPlayer.sessionId &&
            item.id !== records.sessionPlayer.id &&
            item.status === 'CASHED_OUT',
        )
        .reduce((total, item) => total + (item.cashOutChips ?? 0), 0)
      const maximumCashOutChips = Math.max(
        issuedChips - alreadyCashedOutChips,
        0,
      )
      if (records.sessionPlayer.cashOutChips > maximumCashOutChips) {
        throw new Error(
          `Only ${maximumCashOutChips} chips remain in circulation.`,
        )
      }
      const offsetMinor = records.paymentOffsets.reduce(
        (total, item) => total + Math.round(item.amount * 100),
        0,
      )
      const payoutMinor = records.payoutAllocations.reduce(
        (total, item) => total + Math.round(item.amount * 100),
        0,
      )
      if (offsetMinor > grossMinor || payoutMinor !== grossMinor - offsetMinor) {
        throw new Error('Payout allocations must equal the net payout.')
      }
      const existingOtherPayoutMinor = data.payoutAllocations
        .filter(
          (item) =>
            item.sessionPlayerId === records.sessionPlayer.id &&
            item.paymentMethod === 'OTHER',
        )
        .reduce((total, item) => total + Math.round(item.amount * 100), 0)
      const nextOtherPayoutMinor = records.payoutAllocations
        .filter((item) => item.paymentMethod === 'OTHER')
        .reduce((total, item) => total + Math.round(item.amount * 100), 0)
      if (nextOtherPayoutMinor > existingOtherPayoutMinor) {
        throw new Error('New payouts can only use Cash or Card.')
      }
      if (
        records.paymentOffsets.some((offset) => {
          const transaction = data.transactions.find(
            (item) => item.id === offset.transactionId,
          )
          return (
            !transaction ||
            transaction.sessionId !== records.sessionPlayer.sessionId ||
            transaction.playerId !== records.sessionPlayer.playerId ||
            (transaction.paymentStatus !== 'PENDING' &&
              !data.paymentOffsets.some(
                (item) =>
                  item.transactionId === transaction.id &&
                  item.sessionPlayerId === records.sessionPlayer.id,
              )) ||
            Math.round(offset.amount * 100) <= 0 ||
            Math.round(offset.amount * 100) > Math.round(transaction.amount * 100)
          )
        })
      ) {
        throw new Error('A pending offset does not match this participant ledger.')
      }
      return {
        ...data,
        sessionPlayers: data.sessionPlayers.map((item) =>
          item.id === records.sessionPlayer.id ? records.sessionPlayer : item,
        ),
        payoutAllocations: [
          ...data.payoutAllocations.filter(
            (item) => item.sessionPlayerId !== records.sessionPlayer.id,
          ),
          ...records.payoutAllocations,
        ],
        paymentOffsets: [
          ...data.paymentOffsets.filter(
            (item) => item.sessionPlayerId !== records.sessionPlayer.id,
          ),
          ...records.paymentOffsets,
        ],
      }
    })
  }

  async addTransaction(transaction: Transaction): Promise<void> {
    this.updateData(transaction.workspaceId, (data) => {
      const session = data.sessions.find(
        (item) => item.id === transaction.sessionId,
      )
      const participant = data.sessionPlayers.find(
        (item) =>
          item.sessionId === transaction.sessionId &&
          item.playerId === transaction.playerId,
      )
      if (
        !session ||
        session.status !== 'ACTIVE' ||
        !participant ||
        participant.status !== 'ACTIVE'
      ) {
        throw new Error('Transactions require an active session participant.')
      }
      return {
        ...data,
        transactions: [...data.transactions, transaction],
      }
    })
  }

  async updateTransaction(transaction: Transaction): Promise<void> {
    this.updateData(transaction.workspaceId, (data) => {
      const offsetAmount = data.paymentOffsets
        .filter((item) => item.transactionId === transaction.id)
        .reduce((total, item) => total + item.amount, 0)
      if (Math.round(transaction.amount * 100) < Math.round(offsetAmount * 100)) {
        throw new Error(
          'The corrected transaction amount cannot be smaller than its cash-out offset.',
        )
      }
      return {
        ...data,
        transactions: data.transactions.map((item) =>
          item.id === transaction.id ? transaction : item,
        ),
      }
    })
  }

  async importData(workspaceId: string, data: AppData): Promise<void> {
    this.updateData(workspaceId, () => withWorkspaceId(data, workspaceId))
  }

  private updateData(
    workspaceId: string,
    update: (data: AppData) => AppData,
  ): void {
    const state = this.readState()
    const current = withWorkspaceId(
      state.dataByWorkspace[workspaceId] ?? emptyAppData(),
      workspaceId,
    )
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
    payoutAllocations: (data.payoutAllocations ?? []).map((allocation) =>
      normalizePayoutAllocation(allocation, workspaceId),
    ),
    paymentOffsets: (data.paymentOffsets ?? []).map((offset) =>
      normalizePaymentOffset(offset, workspaceId),
    ),
  }
}

function normalizePlayer(player: Player, workspaceId: string): Player {
  return { ...player, workspaceId, archivedAt: player.archivedAt ?? null }
}

function normalizeSession(session: Session, workspaceId: string): Session {
  return { ...session, workspaceId }
}

function normalizeSessionPlayer(
  sessionPlayer: SessionPlayer,
  workspaceId: string,
): SessionPlayer {
  return {
    ...sessionPlayer,
    workspaceId,
    cashedOutAt: sessionPlayer.cashedOutAt ?? null,
  }
}

function normalizePayoutAllocation(
  allocation: PayoutAllocation,
  workspaceId: string,
): PayoutAllocation {
  return { ...allocation, workspaceId }
}

function normalizePaymentOffset(
  offset: PaymentOffset,
  workspaceId: string,
): PaymentOffset {
  return { ...offset, workspaceId }
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
