import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppData,
  PaymentOffset,
  Plan,
  PlanOption,
  PlanVote,
  Player,
  PlayerInviteResult,
  JoinInviteResult,
  PayoutAllocation,
  Session,
  SessionPlayer,
  Transaction,
  Workspace,
  WorkspaceAccessResult,
  WorkspaceRole,
  WorkspaceMember,
} from '../types/domain'
import {
  type AppRepository,
  type CashOutRecords,
  type SessionPlayerRecords,
  type SessionRecords,
  type PlanRecords,
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
  archived_at: string | null
  user_id: string | null
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
  host_user_id: string | null
  plan_id: string | null
  starts_at: string | null
}

interface PlanRow {
  id: string
  workspace_id: string
  title: string
  status: Plan['status']
  created_by_user_id: string
  host_user_id: string | null
  confirmed_option_id: string | null
  created_at: string
  updated_at: string
}

interface PlanOptionRow {
  id: string
  workspace_id: string
  plan_id: string
  starts_at: string
  created_at: string
}

interface PlanVoteRow {
  id: string
  workspace_id: string
  plan_id: string
  option_id: string
  player_id: string
  response: PlanVote['response']
  recorded_by_user_id: string
  updated_at: string
}

interface SessionPlayerRow {
  id: string
  workspace_id: string
  session_id: string
  player_id: string
  joined_at: string
  cash_out_chips: number | null
  cash_out_amount: number | string | null
  cashed_out_at: string | null
  status: SessionPlayer['status']
}

interface PayoutAllocationRow {
  id: string
  workspace_id: string
  session_id: string
  session_player_id: string
  payment_method: PayoutAllocation['paymentMethod']
  amount: number | string
  created_at: string
  updated_at: string
}

interface PaymentOffsetRow {
  id: string
  workspace_id: string
  session_id: string
  session_player_id: string
  transaction_id: string
  amount: number | string
  created_at: string
  updated_at: string
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

  async listWorkspaces(): Promise<Workspace[]> {
    const { data: memberships, error: membershipError } = await this.client
      .from('workspace_members')
      .select('workspace_id, role')
      .order('created_at', { ascending: true })
    throwIfError(membershipError)
    if (!memberships?.length) return []

    const workspaceIds = memberships.map((membership) => membership.workspace_id)
    const { data: workspaces, error: workspaceError } = await this.client
      .from('workspaces')
      .select('id, name, created_at')
      .in('id', workspaceIds)
    throwIfError(workspaceError)

    const roles = new Map(
      memberships.map((membership) => [
        membership.workspace_id,
        membership.role as WorkspaceRole,
      ]),
    )
    return (workspaces as WorkspaceRow[])
      .map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        role: roles.get(row.id) ?? 'HOST',
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async createWorkspace(name: string): Promise<WorkspaceAccessResult> {
    return this.invokeFunction<WorkspaceAccessResult>('create-workspace', {
      name: name.trim(),
    })
  }

  async joinWorkspace(code: string): Promise<Workspace> {
    const result = await this.invokeFunction<{ workspace: Workspace }>(
      'join-workspace',
      { code },
    )
    return result.workspace
  }

  async rotateWorkspaceCode(workspaceId: string): Promise<string> {
    const result = await this.invokeFunction<{ accessCode: string }>(
      'rotate-workspace-code',
      { workspaceId },
    )
    return result.accessCode
  }

  async createPlayerInvite(
    workspaceId: string,
    playerId?: string,
  ): Promise<PlayerInviteResult> {
    return this.invokeFunction<PlayerInviteResult>(
      'create-player-invite',
      playerId ? { workspaceId, playerId } : { workspaceId },
    )
  }

  async redeemPlayerInvite(code: string): Promise<Workspace> {
    const result = await this.invokeFunction<{ workspace: Workspace }>(
      'redeem-player-invite',
      { code },
    )
    return result.workspace
  }

  async joinWithInviteCode(
    code: string,
    nickname?: string,
  ): Promise<JoinInviteResult> {
    return this.invokeFunction<JoinInviteResult>(
      'redeem-invite-code',
      nickname ? { code, nickname } : { code },
    )
  }

  async load(workspaceId: string): Promise<AppData> {
    const [
      playersResult,
      sessionsResult,
      sessionPlayersResult,
      transactionsResult,
      payoutAllocationsResult,
      paymentOffsetsResult,
      membersResult,
      plansResult,
      planOptionsResult,
      planVotesResult,
    ] = await Promise.all([
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
        this.client
          .from('payout_allocations')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at'),
        this.client
          .from('payment_offsets')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at'),
        this.client
          .from('workspace_members')
          .select('workspace_id, user_id, role, created_at')
          .eq('workspace_id', workspaceId)
          .order('created_at'),
        this.client
          .from('event_plans')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false }),
        this.client
          .from('plan_options')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('starts_at'),
        this.client
          .from('plan_votes')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('updated_at'),
      ])

    throwIfError(playersResult.error)
    throwIfError(sessionsResult.error)
    throwIfError(sessionPlayersResult.error)
    throwIfError(transactionsResult.error)
    throwIfError(payoutAllocationsResult.error)
    throwIfError(paymentOffsetsResult.error)
    throwIfError(membersResult.error)
    throwIfError(plansResult.error)
    throwIfError(planOptionsResult.error)
    throwIfError(planVotesResult.error)

    const rawMembers = (membersResult.data ?? []) as Array<{
      workspace_id: string
      user_id: string
      role: WorkspaceRole
      created_at: string
    }>
    const memberIds = rawMembers.map((item) => item.user_id)
    const profileNames = new Map<string, string>()
    if (memberIds.length) {
      const { data: profiles, error: profilesError } = await this.client
        .from('user_profiles')
        .select('user_id, display_name')
        .in('user_id', memberIds)
      throwIfError(profilesError)
      for (const profile of profiles ?? []) profileNames.set(profile.user_id, profile.display_name)
    }

    return {
      players: (playersResult.data as PlayerRow[]).map(mapPlayer),
      sessions: (sessionsResult.data as SessionRow[]).map(mapSession),
      sessionPlayers: (sessionPlayersResult.data as SessionPlayerRow[]).map(
        mapSessionPlayer,
      ),
      transactions: (transactionsResult.data as TransactionRow[]).map(
        mapTransaction,
      ),
      payoutAllocations: (
        payoutAllocationsResult.data as PayoutAllocationRow[]
      ).map(mapPayoutAllocation),
      paymentOffsets: (paymentOffsetsResult.data as PaymentOffsetRow[]).map(
        mapPaymentOffset,
      ),
      workspaceMembers: rawMembers.map((item): WorkspaceMember => ({
        workspaceId: item.workspace_id,
        userId: item.user_id,
        role: item.role,
        displayName: profileNames.get(item.user_id) ?? null,
        createdAt: item.created_at,
      })),
      plans: (plansResult.data as PlanRow[]).map(mapPlan),
      planOptions: (planOptionsResult.data as PlanOptionRow[]).map(mapPlanOption),
      planVotes: (planVotesResult.data as PlanVoteRow[]).map(mapPlanVote),
    }
  }

  async addPlayer(player: Player): Promise<void> {
    const { error } = await this.client.from('players').insert(toPlayerRow(player))
    throwIfError(error)
  }

  async updatePlayer(player: Player): Promise<void> {
    const { data, error } = await this.client
      .from('players')
      .update({
        nickname: player.nickname,
        archived_at: player.archivedAt,
      })
      .eq('id', player.id)
      .eq('workspace_id', player.workspaceId)
      .select('id')
      .single()
    throwIfError(error)
    if (!data) throw new Error('Player could not be updated.')
  }

  async deletePlayer(playerId: string, workspaceId: string): Promise<void> {
    const [participationResult, transactionResult] = await Promise.all([
      this.client
        .from('session_players')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .eq('workspace_id', workspaceId),
      this.client
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .eq('workspace_id', workspaceId),
    ])
    throwIfError(participationResult.error)
    throwIfError(transactionResult.error)
    if (participationResult.count || transactionResult.count) {
      throw new Error(
        'This player has session history. Archive the player instead of deleting them.',
      )
    }

    const { error } = await this.client
      .from('players')
      .delete()
      .eq('id', playerId)
      .eq('workspace_id', workspaceId)
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

  async createSessionFromPlan(records: SessionRecords): Promise<void> {
    const planId = records.session.planId
    if (!planId) throw new Error('A confirmed plan is required.')
    const { error } = await this.client.rpc('create_session_from_plan', {
      target_workspace_id: records.session.workspaceId,
      target_plan_id: planId,
      session_row: records.session,
      participant_rows: records.sessionPlayers,
      transaction_rows: records.transactions,
    })
    throwIfError(error)
  }

  async updateSession(session: Session): Promise<void> {
    if (session.status === 'FINISHED') {
      const { data: participants, error: participantsError } = await this.client
        .from('session_players')
        .select('status, cash_out_chips, cash_out_amount, cashed_out_at')
        .eq('session_id', session.id)
        .eq('workspace_id', session.workspaceId)
      throwIfError(participantsError)
      if (
        participants?.some(
          (item) =>
            item.status !== 'CASHED_OUT' ||
            item.cash_out_chips === null ||
            item.cash_out_amount === null ||
            item.cashed_out_at === null,
        )
      ) {
        throw new Error('Every participant must be cashed out before finishing.')
      }
    }
    const { data, error } = await this.client
      .from('sessions')
      .update({
        status: session.status,
        finished_at: session.finishedAt,
      })
      .eq('id', session.id)
      .eq('workspace_id', session.workspaceId)
      .select('id')
      .single()
    throwIfError(error)
    if (!data) throw new Error('Session could not be updated.')
  }

  async deleteSession(sessionId: string, workspaceId: string): Promise<void> {
    const { error } = await this.client
      .from('sessions')
      .delete()
      .eq('id', sessionId)
      .eq('workspace_id', workspaceId)
    throwIfError(error)
  }

  async addSessionPlayer(records: SessionPlayerRecords): Promise<void> {
    const { error: participantError } = await this.client
      .from('session_players')
      .insert(toSessionPlayerRow(records.sessionPlayer))
    throwIfError(participantError)

    try {
      const { error: transactionError } = await this.client
        .from('transactions')
        .insert(toTransactionRow(records.transaction))
      throwIfError(transactionError)
    } catch (error) {
      await this.client
        .from('session_players')
        .delete()
        .eq('id', records.sessionPlayer.id)
        .eq('workspace_id', records.sessionPlayer.workspaceId)
      throw error
    }
  }

  async removeSessionPlayer(
    sessionPlayerId: string,
    workspaceId: string,
  ): Promise<void> {
    const { data: sessionPlayer, error: participantError } = await this.client
      .from('session_players')
      .select('session_id, player_id')
      .eq('id', sessionPlayerId)
      .eq('workspace_id', workspaceId)
      .single()
    throwIfError(participantError)
    if (!sessionPlayer) throw new Error('Session player not found.')

    const { data: session, error: sessionError } = await this.client
      .from('sessions')
      .select('status')
      .eq('id', sessionPlayer.session_id)
      .eq('workspace_id', workspaceId)
      .single()
    throwIfError(sessionError)
    if (!session || session.status !== 'ACTIVE') {
      throw new Error('Players can only be removed from an active session.')
    }

    const { count, error: transactionsError } = await this.client
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('session_id', sessionPlayer.session_id)
      .eq('player_id', sessionPlayer.player_id)
    throwIfError(transactionsError)
    if (count) {
      throw new Error(
        'This player already has financial history in the session and cannot be removed.',
      )
    }

    const { error } = await this.client
      .from('session_players')
      .delete()
      .eq('id', sessionPlayerId)
      .eq('workspace_id', workspaceId)
    throwIfError(error)
  }

  async saveCashOut(records: CashOutRecords): Promise<void> {
    const { error } = await this.client.rpc('save_session_player_cash_out', {
      target_workspace_id: records.sessionPlayer.workspaceId,
      target_session_player_id: records.sessionPlayer.id,
      final_chips: records.sessionPlayer.cashOutChips,
      gross_cash_out: records.sessionPlayer.cashOutAmount,
      cash_out_time: records.sessionPlayer.cashedOutAt,
      payout_rows: records.payoutAllocations.map((allocation) => ({
        id: allocation.id,
        paymentMethod: allocation.paymentMethod,
        amount: allocation.amount,
        createdAt: allocation.createdAt,
        updatedAt: allocation.updatedAt,
      })),
      offset_rows: records.paymentOffsets.map((offset) => ({
        id: offset.id,
        transactionId: offset.transactionId,
        amount: offset.amount,
        createdAt: offset.createdAt,
        updatedAt: offset.updatedAt,
      })),
    })
    throwIfError(error)
  }

  async addTransaction(transaction: Transaction): Promise<void> {
    const [sessionResult, participantResult] = await Promise.all([
      this.client
        .from('sessions')
        .select('status')
        .eq('id', transaction.sessionId)
        .eq('workspace_id', transaction.workspaceId)
        .single(),
      this.client
        .from('session_players')
        .select('status')
        .eq('session_id', transaction.sessionId)
        .eq('player_id', transaction.playerId)
        .eq('workspace_id', transaction.workspaceId)
        .single(),
    ])
    throwIfError(sessionResult.error)
    throwIfError(participantResult.error)
    if (
      sessionResult.data?.status !== 'ACTIVE' ||
      participantResult.data?.status !== 'ACTIVE'
    ) {
      throw new Error('Transactions require an active session participant.')
    }
    const { error } = await this.client
      .from('transactions')
      .insert(toTransactionRow(transaction))
    throwIfError(error)
  }

  async updateTransaction(transaction: Transaction): Promise<void> {
    const { data: offsets, error: offsetsError } = await this.client
      .from('payment_offsets')
      .select('amount')
      .eq('transaction_id', transaction.id)
      .eq('workspace_id', transaction.workspaceId)
    throwIfError(offsetsError)
    const offsetAmount = (offsets ?? []).reduce(
      (total, item) => total + Number(item.amount),
      0,
    )
    if (Math.round(transaction.amount * 100) < Math.round(offsetAmount * 100)) {
      throw new Error(
        'The corrected transaction amount cannot be smaller than its cash-out offset.',
      )
    }
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

  async createPlan(records: PlanRecords): Promise<void> {
    const { error: planError } = await this.client
      .from('event_plans').insert(toPlanRow(records.plan))
    throwIfError(planError)
    const { error: optionsError } = await this.client
      .from('plan_options').insert(records.options.map(toPlanOptionRow))
    if (optionsError) {
      await this.client.from('event_plans').delete().eq('id', records.plan.id)
      throwIfError(optionsError)
    }
  }

  async savePlanVote(vote: PlanVote): Promise<void> {
    const { error } = await this.client.from('plan_votes').upsert(toPlanVoteRow(vote), {
      onConflict: 'option_id,player_id',
    })
    throwIfError(error)
  }

  async confirmPlan(plan: Plan): Promise<void> {
    const { error } = await this.client.from('event_plans').update({
      status: plan.status,
      confirmed_option_id: plan.confirmedOptionId,
      host_user_id: plan.hostUserId,
      updated_at: plan.updatedAt,
    }).eq('id', plan.id).eq('workspace_id', plan.workspaceId)
    throwIfError(error)
  }

  async updateWorkspaceMemberRole(
    workspaceId: string,
    userId: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ): Promise<void> {
    const { data, error } = await this.client.from('workspace_members')
      .update({ role }).eq('workspace_id', workspaceId).eq('user_id', userId)
      .neq('role', 'OWNER').select('user_id').single()
    throwIfError(error)
    if (!data) throw new Error('Workspace member could not be updated.')
  }

  async importData(workspaceId: string, data: AppData): Promise<void> {
    const current = await this.load(workspaceId)
    if (
      current.players.length ||
      current.sessions.length ||
      current.sessionPlayers.length ||
      current.transactions.length ||
      current.payoutAllocations.length ||
      current.paymentOffsets.length
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
      if (imported.payoutAllocations.length) {
        const { error } = await this.client
          .from('payout_allocations')
          .insert(imported.payoutAllocations.map(toPayoutAllocationRow))
        throwIfError(error)
      }
      if (imported.paymentOffsets.length) {
        const { error } = await this.client
          .from('payment_offsets')
          .insert(imported.paymentOffsets.map(toPaymentOffsetRow))
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

  private async invokeFunction<T>(
    name: string,
    body: Record<string, string>,
  ): Promise<T> {
    for (let attempt = 0; attempt <= 1; attempt += 1) {
      const { data, error } = await this.client.functions.invoke(name, { body })
      if (!error) return data as T

      if (isTransientFunctionError(error) && attempt === 0) {
        await delay(350)
        continue
      }

      throw await toWorkspaceFunctionError(error)
    }

    throw new Error('SevenTwo could not complete the workspace request.')
  }
}

function isTransientFunctionError(error: unknown): boolean {
  return (
    isFunctionError(error, 'FunctionsFetchError') ||
    isFunctionError(error, 'FunctionsRelayError')
  )
}

async function toWorkspaceFunctionError(error: unknown): Promise<Error> {
  if (isFunctionError(error, 'FunctionsFetchError')) {
    return new Error(
      'Unable to reach the SevenTwo workspace service. Check your connection and try again.',
    )
  }
  if (isFunctionError(error, 'FunctionsRelayError')) {
    return new Error(
      'The SevenTwo workspace service is temporarily unavailable. Try again shortly.',
    )
  }
  if (isFunctionError(error, 'FunctionsHttpError')) {
    const response = error.context
    if (response instanceof Response) {
      const responseMessage = await readFunctionErrorMessage(response)
      if (responseMessage) return new Error(responseMessage)
      if (response.status === 401 || response.status === 403) {
        return new Error('Your SevenTwo session is no longer authorized.')
      }
      if (response.status === 404) {
        return new Error('Invite code not recognized.')
      }
      if (response.status === 429) {
        return new Error(
          'Too many attempts. Wait before trying another invite code.',
        )
      }
      if (response.status >= 500) {
        return new Error(
          'The SevenTwo workspace service encountered a server error.',
        )
      }
    }
  }
  return new Error(
    error instanceof Error
      ? error.message
      : 'SevenTwo could not complete the workspace request.',
  )
}

function isFunctionError(
  error: unknown,
  name: 'FunctionsFetchError' | 'FunctionsRelayError' | 'FunctionsHttpError',
): error is Error & { context?: unknown } {
  return error instanceof Error && error.name === name
}

async function readFunctionErrorMessage(
  response: Response,
): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: unknown }
    return typeof body.error === 'string' ? body.error : undefined
  } catch {
    return undefined
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
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
    archivedAt: row.archived_at,
    userId: row.user_id,
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
    hostUserId: row.host_user_id,
    planId: row.plan_id,
    startsAt: row.starts_at,
  }
}

function mapPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    hostUserId: row.host_user_id,
    confirmedOptionId: row.confirmed_option_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPlanOption(row: PlanOptionRow): PlanOption {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    planId: row.plan_id,
    startsAt: row.starts_at,
    createdAt: row.created_at,
  }
}

function mapPlanVote(row: PlanVoteRow): PlanVote {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    planId: row.plan_id,
    optionId: row.option_id,
    playerId: row.player_id,
    response: row.response,
    recordedByUserId: row.recorded_by_user_id,
    updatedAt: row.updated_at,
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
    cashedOutAt: row.cashed_out_at,
    status: row.status,
  }
}

function mapPayoutAllocation(row: PayoutAllocationRow): PayoutAllocation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    sessionPlayerId: row.session_player_id,
    paymentMethod: row.payment_method,
    amount: Number(row.amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPaymentOffset(row: PaymentOffsetRow): PaymentOffset {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    sessionPlayerId: row.session_player_id,
    transactionId: row.transaction_id,
    amount: Number(row.amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    archived_at: player.archivedAt,
    user_id: player.userId,
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
    host_user_id: session.hostUserId,
    plan_id: session.planId,
    starts_at: session.startsAt,
  }
}

function toPlanRow(plan: Plan) {
  return {
    id: plan.id,
    workspace_id: plan.workspaceId,
    title: plan.title,
    status: plan.status,
    created_by_user_id: plan.createdByUserId,
    host_user_id: plan.hostUserId,
    confirmed_option_id: plan.confirmedOptionId,
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
  }
}

function toPlanOptionRow(option: PlanOption) {
  return {
    id: option.id,
    workspace_id: option.workspaceId,
    plan_id: option.planId,
    starts_at: option.startsAt,
    created_at: option.createdAt,
  }
}

function toPlanVoteRow(vote: PlanVote) {
  return {
    id: vote.id,
    workspace_id: vote.workspaceId,
    plan_id: vote.planId,
    option_id: vote.optionId,
    player_id: vote.playerId,
    response: vote.response,
    recorded_by_user_id: vote.recordedByUserId,
    updated_at: vote.updatedAt,
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
    cashed_out_at: sessionPlayer.cashedOutAt,
    status: sessionPlayer.status,
  }
}

function toPayoutAllocationRow(allocation: PayoutAllocation) {
  return {
    id: allocation.id,
    workspace_id: allocation.workspaceId,
    session_id: allocation.sessionId,
    session_player_id: allocation.sessionPlayerId,
    payment_method: allocation.paymentMethod,
    amount: allocation.amount,
    created_at: allocation.createdAt,
    updated_at: allocation.updatedAt,
  }
}

function toPaymentOffsetRow(offset: PaymentOffset) {
  return {
    id: offset.id,
    workspace_id: offset.workspaceId,
    session_id: offset.sessionId,
    session_player_id: offset.sessionPlayerId,
    transaction_id: offset.transactionId,
    amount: offset.amount,
    created_at: offset.createdAt,
    updated_at: offset.updatedAt,
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
    players: data.players.map((item) => ({ ...item, workspaceId, userId: item.userId ?? null })),
    sessions: data.sessions.map((item) => ({
      ...item,
      workspaceId,
      hostUserId: item.hostUserId ?? null,
      planId: item.planId ?? null,
      startsAt: item.startsAt ?? null,
    })),
    sessionPlayers: data.sessionPlayers.map((item) => ({
      ...item,
      workspaceId,
      cashedOutAt: item.cashedOutAt ?? null,
    })),
    transactions: data.transactions.map((item) => ({
      ...item,
      workspaceId,
    })),
    payoutAllocations: (data.payoutAllocations ?? []).map((item) => ({
      ...item,
      workspaceId,
    })),
    paymentOffsets: (data.paymentOffsets ?? []).map((item) => ({
      ...item,
      workspaceId,
    })),
    workspaceMembers: (data.workspaceMembers ?? []).map((item) => ({ ...item, workspaceId })),
    plans: (data.plans ?? []).map((item) => ({ ...item, workspaceId })),
    planOptions: (data.planOptions ?? []).map((item) => ({ ...item, workspaceId })),
    planVotes: (data.planVotes ?? []).map((item) => ({ ...item, workspaceId })),
  }
}
