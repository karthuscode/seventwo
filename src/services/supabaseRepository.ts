import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppData,
  Player,
  Session,
  SessionPlayer,
  Transaction,
  Workspace,
  WorkspaceRole,
} from '../types/domain'
import {
  type AppRepository,
  type SessionRecords,
} from './appRepository'

interface WorkspaceRow {
  id: string
  name: string
  created_at: string
}

interface PlayerRow {
  id: string
  workspace_id: string
  nickname: string
  created_at: string
}

interface SessionRow {
  id: string
  workspace_id: string
  name: string
  date: string
  status: Session['status']
  buy_in_amount: number | string
  chips_per_buy_in: number
  currency: Session['currency']
  created_at: string
  finished_at: string | null
}

interface SessionPlayerRow {
  id: string
  workspace_id: string
  session_id: string
  player_id: string
  joined_at: string
  cash_out_chips: number | null
  cash_out_amount: number | string | null
  status: SessionPlayer['status']
}

interface TransactionRow {
  id: string
  workspace_id: string
  session_id: string
  player_id: string
  type: Transaction['type']
  amount: number | string
  chips: number
  payment_method: Transaction['paymentMethod']
  payment_status: Transaction['paymentStatus']
  created_at: string
  updated_at: string
}

export class SupabaseRepository implements AppRepository {
  readonly kind = 'supabase' as const
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async getWorkspace(): Promise<Workspace | null> {
    const { data: membership, error: membershipError } = await this.client
      .from('workspace_members')
      .select('workspace_id, role')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    throwIfError(membershipError)
    if (!membership) return null

    const { data: workspace, error: workspaceError } = await this.client
      .from('workspaces')
      .select('id, name, created_at')
      .eq('id', membership.workspace_id)
      .single()
    throwIfError(workspaceError)

    const row = workspace as WorkspaceRow
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      role: membership.role as WorkspaceRole,
    }
  }

  async load(workspaceId: string): Promise<AppData> {
    const [playersResult, sessionsResult, sessionPlayersResult, transactionsResult] =
      await Promise.all([
        this.client
          .from('players')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at'),
        this.client
          .from('sessions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('date', { ascending: false }),
        this.client
          .from('session_players')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('joined_at'),
        this.client
          .from('transactions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at'),
      ])

    throwIfError(playersResult.error)
    throwIfError(sessionsResult.error)
    throwIfError(sessionPlayersResult.error)
    throwIfError(transactionsResult.error)

    return {
      players: (playersResult.data as PlayerRow[]).map(mapPlayer),
      sessions: (sessionsResult.data as SessionRow[]).map(mapSession),
      sessionPlayers: (sessionPlayersResult.data as SessionPlayerRow[]).map(
        mapSessionPlayer,
      ),
      transactions: (transactionsResult.data as TransactionRow[]).map(
        mapTransaction,
      ),
    }
  }

  async addPlayer(player: Player): Promise<void> {
    const { error } = await this.client.from('players').insert(toPlayerRow(player))
    throwIfError(error)
  }

  async createSession(records: SessionRecords): Promise<void> {
    const { error: sessionError } = await this.client
      .from('sessions')
      .insert(toSessionRow(records.session))
    throwIfError(sessionError)

    try {
      const { error: participantsError } = await this.client
        .from('session_players')
        .insert(records.sessionPlayers.map(toSessionPlayerRow))
      throwIfError(participantsError)

      const { error: transactionsError } = await this.client
        .from('transactions')
        .insert(records.transactions.map(toTransactionRow))
      throwIfError(transactionsError)
    } catch (error) {
      await this.client.from('sessions').delete().eq('id', records.session.id)
      throw error
    }
  }

  async addTransaction(transaction: Transaction): Promise<void> {
    const { error } = await this.client
      .from('transactions')
      .insert(toTransactionRow(transaction))
    throwIfError(error)
  }

  async updateTransaction(transaction: Transaction): Promise<void> {
    const { data, error } = await this.client
      .from('transactions')
      .update({
        amount: transaction.amount,
        chips: transaction.chips,
        payment_method: transaction.paymentMethod,
        payment_status: transaction.paymentStatus,
        updated_at: transaction.updatedAt,
      })
      .eq('id', transaction.id)
      .eq('workspace_id', transaction.workspaceId)
      .select('id')
      .single()
    throwIfError(error)
    if (!data) throw new Error('Transaction could not be updated.')
  }

  async importData(workspaceId: string, data: AppData): Promise<void> {
    const current = await this.load(workspaceId)
    if (
      current.players.length ||
      current.sessions.length ||
      current.sessionPlayers.length ||
      current.transactions.length
    ) {
      throw new Error('Local data can only be imported into an empty workspace.')
    }

    const imported = assignWorkspace(data, workspaceId)
    try {
      if (imported.players.length) {
        const { error } = await this.client
          .from('players')
          .insert(imported.players.map(toPlayerRow))
        throwIfError(error)
      }
      if (imported.sessions.length) {
        const { error } = await this.client
          .from('sessions')
          .insert(imported.sessions.map(toSessionRow))
        throwIfError(error)
      }
      if (imported.sessionPlayers.length) {
        const { error } = await this.client
          .from('session_players')
          .insert(imported.sessionPlayers.map(toSessionPlayerRow))
        throwIfError(error)
      }
      if (imported.transactions.length) {
        const { error } = await this.client
          .from('transactions')
          .insert(imported.transactions.map(toTransactionRow))
        throwIfError(error)
      }
    } catch (error) {
      if (imported.sessions.length) {
        await this.client
          .from('sessions')
          .delete()
          .in('id', imported.sessions.map((session) => session.id))
      }
      if (imported.players.length) {
        await this.client
          .from('players')
          .delete()
          .in('id', imported.players.map((player) => player.id))
      }
      throw error
    }
  }
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

function mapPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    nickname: row.nickname,
    createdAt: row.created_at,
  }
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    date: row.date,
    status: row.status,
    buyInAmount: Number(row.buy_in_amount),
    chipsPerBuyIn: row.chips_per_buy_in,
    currency: row.currency,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }
}

function mapSessionPlayer(row: SessionPlayerRow): SessionPlayer {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    playerId: row.player_id,
    joinedAt: row.joined_at,
    cashOutChips: row.cash_out_chips,
    cashOutAmount:
      row.cash_out_amount === null ? null : Number(row.cash_out_amount),
    status: row.status,
  }
}

function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    playerId: row.player_id,
    type: row.type,
    amount: Number(row.amount),
    chips: row.chips,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPlayerRow(player: Player) {
  return {
    id: player.id,
    workspace_id: player.workspaceId,
    nickname: player.nickname,
    created_at: player.createdAt,
  }
}

function toSessionRow(session: Session) {
  return {
    id: session.id,
    workspace_id: session.workspaceId,
    name: session.name,
    date: session.date,
    status: session.status,
    buy_in_amount: session.buyInAmount,
    chips_per_buy_in: session.chipsPerBuyIn,
    currency: session.currency,
    created_at: session.createdAt,
    finished_at: session.finishedAt,
  }
}

function toSessionPlayerRow(sessionPlayer: SessionPlayer) {
  return {
    id: sessionPlayer.id,
    workspace_id: sessionPlayer.workspaceId,
    session_id: sessionPlayer.sessionId,
    player_id: sessionPlayer.playerId,
    joined_at: sessionPlayer.joinedAt,
    cash_out_chips: sessionPlayer.cashOutChips,
    cash_out_amount: sessionPlayer.cashOutAmount,
    status: sessionPlayer.status,
  }
}

function toTransactionRow(transaction: Transaction) {
  return {
    id: transaction.id,
    workspace_id: transaction.workspaceId,
    session_id: transaction.sessionId,
    player_id: transaction.playerId,
    type: transaction.type,
    amount: transaction.amount,
    chips: transaction.chips,
    payment_method: transaction.paymentMethod,
    payment_status: transaction.paymentStatus,
    created_at: transaction.createdAt,
    updated_at: transaction.updatedAt,
  }
}

function assignWorkspace(data: AppData, workspaceId: string): AppData {
  return {
    players: data.players.map((item) => ({ ...item, workspaceId })),
    sessions: data.sessions.map((item) => ({ ...item, workspaceId })),
    sessionPlayers: data.sessionPlayers.map((item) => ({
      ...item,
      workspaceId,
    })),
    transactions: data.transactions.map((item) => ({
      ...item,
      workspaceId,
    })),
  }
}
