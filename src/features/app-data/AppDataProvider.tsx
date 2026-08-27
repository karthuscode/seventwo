import {
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react'
import type {
  AppData,
  CashOutInput,
  NewSessionInput,
  NewPlanInput,
  NewTransactionInput,
  Player,
  Session,
  Transaction,
  PlanVoteResponse,
  UpdateTransactionInput,
} from '../../types/domain'
import {
  emptyAppData,
  hasAppData,
  type SessionRecords,
} from '../../services/appRepository'
import { LocalStorageRepository } from '../../services/localStorageRepository'
import { LOCAL_USER_ID } from '../../services/localStorageRepository'
import { useWorkspaces } from '../../hooks/useWorkspaces'
import { AppDataContext } from './AppDataContext'
import {
  buildPaymentOffsetDraft,
  calculateChipCirculation,
  calculateGrossCashOut,
  calculatePayoutRemaining,
  roundMoney,
  sumMoney,
  toMinorUnits,
} from '../../utils/calculations'
import { isStandardPaymentMethod } from '../../utils/paymentMethods'
import { BrandBackdrop } from '../../components/BrandBackdrop'
import { useAuth } from '../../hooks/useAuth'

export function AppDataProvider({ children }: PropsWithChildren) {
  const { repository, selectedWorkspace: workspace } = useWorkspaces()
  const { user } = useAuth()
  const currentUserId = user?.id ?? LOCAL_USER_ID
  const [data, setData] = useState<AppData>(emptyAppData)
  const [legacyData, setLegacyData] = useState<AppData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!workspace) {
    throw new Error('AppDataProvider requires a selected workspace.')
  }

  const loadData = useCallback(async () => {
    try {
      const nextData = await repository.load(workspace.id)
      setData(nextData)
      setError(null)

      if (repository.kind === 'supabase' && !hasAppData(nextData)) {
        const localData = await new LocalStorageRepository().loadLegacyData()
        setLegacyData(localData)
      } else {
        setLegacyData(null)
      }
    } catch (caughtError) {
      setError(toErrorMessage(caughtError))
    } finally {
      setIsLoading(false)
    }
  }, [repository, workspace.id])

  useEffect(() => {
    // Repository hydration is the external synchronization this effect owns.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadData()
  }, [loadData])

  async function runMutation(action: () => Promise<void>): Promise<void> {
    setIsSaving(true)
    setError(null)
    try {
      await action()
    } catch (caughtError) {
      const normalizedError = normalizeMutationError(caughtError)
      setError(normalizedError.message)
      throw normalizedError
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <DataLoadingScreen />

  const value = {
    ...data,
    workspace,
    repositoryKind: repository.kind,
    isSaving,
    error,
    canImportLocalData: Boolean(legacyData),
    addPlayer: async (nickname: string) => {
      const trimmedNickname = nickname.trim()
      if (!trimmedNickname) throw new Error('Enter a nickname.')
      const player: Player = {
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        nickname: trimmedNickname,
        createdAt: new Date().toISOString(),
        archivedAt: null,
        userId: null,
      }
      ensurePlayerNicknameAvailable(data.players, player.nickname)
      await runMutation(async () => repository.addPlayer(player))
      setData((current) => ({
        ...current,
        players: [...current.players, player],
      }))
      return player
    },
    updatePlayer: async (player: Player) => {
      const currentPlayer = data.players.find((item) => item.id === player.id)
      if (!currentPlayer) throw new Error('Player not found.')
      const updatedPlayer = {
        ...currentPlayer,
        ...player,
        workspaceId: workspace.id,
        nickname: player.nickname.trim(),
      }
      if (!updatedPlayer.nickname) throw new Error('Enter a nickname.')
      ensurePlayerNicknameAvailable(
        data.players,
        updatedPlayer.nickname,
        updatedPlayer.id,
      )
      await runMutation(async () => repository.updatePlayer(updatedPlayer))
      setData((current) => ({
        ...current,
        players: current.players.map((item) =>
          item.id === updatedPlayer.id ? updatedPlayer : item,
        ),
      }))
    },
    deletePlayer: async (playerId: string) => {
      const player = data.players.find((item) => item.id === playerId)
      if (!player) throw new Error('Player not found.')
      const hasHistory =
        data.sessionPlayers.some((item) => item.playerId === playerId) ||
        data.transactions.some((item) => item.playerId === playerId)
      if (hasHistory) {
        throw new Error(
          'This player has session history. Archive the player instead of deleting them.',
        )
      }
      await runMutation(() => repository.deletePlayer(playerId, workspace.id))
      setData((current) => ({
        ...current,
        players: current.players.filter((item) => item.id !== playerId),
      }))
    },
    createSession: async (input: NewSessionInput) => {
      ensurePrimaryPaymentMethod(input.paymentMethod)
      const selectedIds = new Set(input.playerIds)
      if (selectedIds.size !== input.playerIds.length) {
        throw new Error('A player can only be selected once per session.')
      }
      const selectedPlayers = input.playerIds.map((playerId) =>
        data.players.find((player) => player.id === playerId),
      )
      if (
        selectedPlayers.some((player) => !player || Boolean(player.archivedAt))
      ) {
        throw new Error('Only active saved players can join a new session.')
      }
      const now = new Date().toISOString()
      const session: Session = {
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        name: input.name.trim(),
        date: input.date,
        status: 'ACTIVE',
        buyInAmount: input.buyInAmount,
        chipsPerBuyIn: input.chipsPerBuyIn,
        currency: 'RON',
        createdAt: now,
        finishedAt: null,
        hostUserId: input.hostUserId ?? currentUserId,
        planId: input.planId ?? null,
        startsAt: null,
      }
      const records: SessionRecords = {
        session,
        sessionPlayers: input.playerIds.map((playerId) => ({
          id: crypto.randomUUID(),
          workspaceId: workspace.id,
          sessionId: session.id,
          playerId,
          joinedAt: now,
          cashOutChips: null,
          cashOutAmount: null,
          cashedOutAt: null,
          status: 'ACTIVE',
        })),
        transactions: input.playerIds.map((playerId) => ({
          id: crypto.randomUUID(),
          workspaceId: workspace.id,
          sessionId: session.id,
          playerId,
          type: 'BUY_IN',
          amount: session.buyInAmount,
          chips: session.chipsPerBuyIn,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus,
          createdAt: now,
          updatedAt: now,
        })),
      }
      await runMutation(async () => repository.createSession(records))
      setData((current) => ({
        ...current,
        sessions: [...current.sessions, records.session],
        sessionPlayers: [...current.sessionPlayers, ...records.sessionPlayers],
        transactions: [...current.transactions, ...records.transactions],
      }))
      return session
    },
    createSessionFromPlan: async (input: NewSessionInput & { planId: string }) => {
      const plan = data.plans.find((item) => item.id === input.planId)
      if (!plan || plan.status !== 'CONFIRMED' || !plan.confirmedOptionId) {
        throw new Error('A confirmed plan is required.')
      }
      ensurePrimaryPaymentMethod(input.paymentMethod)
      const selectedIds = new Set(input.playerIds)
      if (selectedIds.size !== input.playerIds.length) {
        throw new Error('A player can only be selected once per session.')
      }
      const now = new Date().toISOString()
      const session: Session = {
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        name: input.name.trim(),
        date: input.date,
        status: 'ACTIVE',
        buyInAmount: input.buyInAmount,
        chipsPerBuyIn: input.chipsPerBuyIn,
        currency: 'RON',
        createdAt: now,
        finishedAt: null,
        hostUserId: plan.hostUserId ?? currentUserId,
        planId: plan.id,
        startsAt: data.planOptions.find((option) => option.id === plan.confirmedOptionId)?.startsAt ?? null,
      }
      const records: SessionRecords = {
        session,
        sessionPlayers: input.playerIds.map((playerId) => ({
          id: crypto.randomUUID(), workspaceId: workspace.id, sessionId: session.id,
          playerId, joinedAt: now, cashOutChips: null, cashOutAmount: null,
          cashedOutAt: null, status: 'ACTIVE',
        })),
        transactions: input.playerIds.map((playerId) => ({
          id: crypto.randomUUID(), workspaceId: workspace.id, sessionId: session.id,
          playerId, type: 'BUY_IN', amount: session.buyInAmount,
          chips: session.chipsPerBuyIn, paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus, createdAt: now, updatedAt: now,
        })),
      }
      await runMutation(() => repository.createSessionFromPlan(records))
      setData((current) => ({
        ...current,
        sessions: [...current.sessions, session],
        sessionPlayers: [...current.sessionPlayers, ...records.sessionPlayers],
        transactions: [...current.transactions, ...records.transactions],
        plans: current.plans.map((item) => item.id === plan.id
          ? { ...item, status: 'SESSION_CREATED', updatedAt: now }
          : item),
      }))
      return session
    },
    finishSession: async (sessionId: string) => {
      const session = data.sessions.find((item) => item.id === sessionId)
      if (!session) throw new Error('Session not found.')
      if (session.status === 'FINISHED') return
      const activeParticipants = data.sessionPlayers.filter(
        (item) =>
          item.sessionId === sessionId &&
          (item.status !== 'CASHED_OUT' ||
            item.cashOutChips === null ||
            item.cashOutAmount === null ||
            item.cashedOutAt === null),
      )
      if (activeParticipants.length) {
        const names = activeParticipants.map(
          (participant) =>
            data.players.find((player) => player.id === participant.playerId)
              ?.nickname ?? 'Unknown player',
        )
        throw new Error(
          `${activeParticipants.length} ${activeParticipants.length === 1 ? 'player has' : 'players have'} not been cashed out: ${names.join(', ')}.`,
        )
      }
      const finishedSession = {
        ...session,
        status: 'FINISHED' as const,
        finishedAt: new Date().toISOString(),
      }
      await runMutation(() => repository.updateSession(finishedSession))
      setData((current) => ({
        ...current,
        sessions: current.sessions.map((item) =>
          item.id === sessionId ? finishedSession : item,
        ),
      }))
    },
    deleteSession: async (sessionId: string) => {
      const session = data.sessions.find((item) => item.id === sessionId)
      if (!session) throw new Error('Session not found.')
      await runMutation(() => repository.deleteSession(sessionId, workspace.id))
      setData((current) => ({
        ...current,
        sessions: current.sessions.filter((item) => item.id !== sessionId),
        sessionPlayers: current.sessionPlayers.filter(
          (item) => item.sessionId !== sessionId,
        ),
        transactions: current.transactions.filter(
          (item) => item.sessionId !== sessionId,
        ),
        payoutAllocations: current.payoutAllocations.filter(
          (item) => item.sessionId !== sessionId,
        ),
        paymentOffsets: current.paymentOffsets.filter(
          (item) => item.sessionId !== sessionId,
        ),
      }))
    },
    addPlayerToSession: async (input: NewTransactionInput) => {
      ensurePrimaryPaymentMethod(input.paymentMethod)
      const session = data.sessions.find((item) => item.id === input.sessionId)
      if (!session || session.status !== 'ACTIVE') {
        throw new Error('Only an active session can accept a new player.')
      }
      const player = data.players.find((item) => item.id === input.playerId)
      if (!player || player.archivedAt) {
        throw new Error('Choose an active saved player.')
      }
      if (
        data.sessionPlayers.some(
          (item) =>
            item.sessionId === input.sessionId &&
            item.playerId === input.playerId,
        )
      ) {
        throw new Error('This player is already in the session.')
      }
      const now = new Date().toISOString()
      const sessionPlayer = {
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        sessionId: input.sessionId,
        playerId: input.playerId,
        joinedAt: now,
        cashOutChips: null,
        cashOutAmount: null,
        cashedOutAt: null,
        status: 'ACTIVE' as const,
      }
      const transaction: Transaction = {
        ...input,
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        type: 'BUY_IN',
        createdAt: now,
        updatedAt: now,
      }
      await runMutation(() =>
        repository.addSessionPlayer({ sessionPlayer, transaction }),
      )
      setData((current) => ({
        ...current,
        sessionPlayers: [...current.sessionPlayers, sessionPlayer],
        transactions: [...current.transactions, transaction],
      }))
    },
    removeSessionPlayer: async (sessionPlayerId: string) => {
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
      await runMutation(() =>
        repository.removeSessionPlayer(sessionPlayerId, workspace.id),
      )
      setData((current) => ({
        ...current,
        sessionPlayers: current.sessionPlayers.filter(
          (item) => item.id !== sessionPlayerId,
        ),
        payoutAllocations: current.payoutAllocations.filter(
          (item) => item.sessionPlayerId !== sessionPlayerId,
        ),
        paymentOffsets: current.paymentOffsets.filter(
          (item) => item.sessionPlayerId !== sessionPlayerId,
        ),
      }))
    },
    saveCashOut: async (input: CashOutInput) => {
      const sessionPlayer = data.sessionPlayers.find(
        (item) => item.id === input.sessionPlayerId,
      )
      if (!sessionPlayer) throw new Error('Session player not found.')
      const session = data.sessions.find(
        (item) => item.id === sessionPlayer.sessionId,
      )
      if (!session || session.status !== 'ACTIVE') {
        throw new Error('Cash-out corrections require an active session.')
      }
      if (!Number.isInteger(input.finalChips) || input.finalChips < 0) {
        throw new Error('Final chips must be a whole number of zero or more.')
      }

      const sessionTransactions = data.transactions.filter(
        (item) => item.sessionId === session.id,
      )
      const sessionParticipants = data.sessionPlayers.filter(
        (item) => item.sessionId === session.id,
      )
      const { maximumCashOutChips } = calculateChipCirculation(
        sessionTransactions,
        sessionParticipants,
        sessionPlayer.id,
      )
      if (input.finalChips > maximumCashOutChips) {
        throw new Error(
          `Only ${maximumCashOutChips} chips remain in circulation.`,
        )
      }

      const playerTransactions = data.transactions.filter(
        (item) =>
          item.sessionId === session.id &&
          item.playerId === sessionPlayer.playerId,
      )
      const existingOffsets = data.paymentOffsets.filter(
        (item) => item.sessionPlayerId === sessionPlayer.id,
      )
      const grossCashOut = calculateGrossCashOut(
        input.finalChips,
        session.buyInAmount,
        session.chipsPerBuyIn,
      )
      const offsetDraft = buildPaymentOffsetDraft(
        grossCashOut,
        playerTransactions,
        existingOffsets,
      )
      const pendingOffset = sumMoney(offsetDraft.map((item) => item.amount))
      const netPayout = grossCashOut - pendingOffset
      const payoutMethods = ['CASH', 'CARD', 'OTHER'] as const
      if (
        payoutMethods.some(
          (method) =>
            !Number.isFinite(input.payoutAmounts[method]) ||
            input.payoutAmounts[method] < 0,
        )
      ) {
        throw new Error('Payout amounts cannot be negative.')
      }
      const normalizedPayoutAmounts = {
        CASH: roundMoney(input.payoutAmounts.CASH),
        CARD: roundMoney(input.payoutAmounts.CARD),
        OTHER: roundMoney(input.payoutAmounts.OTHER),
      }
      if (
        toMinorUnits(
          calculatePayoutRemaining(netPayout, normalizedPayoutAmounts),
        ) !== 0
      ) {
        throw new Error('Payout allocations must equal the net payout.')
      }

      const now = new Date().toISOString()
      const updatedSessionPlayer = {
        ...sessionPlayer,
        cashOutChips: input.finalChips,
        cashOutAmount: grossCashOut,
        cashedOutAt: sessionPlayer.cashedOutAt ?? now,
        status: 'CASHED_OUT' as const,
      }
      const existingAllocations = data.payoutAllocations.filter(
        (item) => item.sessionPlayerId === sessionPlayer.id,
      )
      const existingOtherAmount = sumMoney(
        existingAllocations
          .filter((item) => item.paymentMethod === 'OTHER')
          .map((item) => item.amount),
      )
      if (
        toMinorUnits(normalizedPayoutAmounts.OTHER) >
        toMinorUnits(existingOtherAmount)
      ) {
        throw new Error('New payouts can only use Cash or Card.')
      }
      const payoutAllocations = payoutMethods.flatMap((paymentMethod) => {
        const amount = normalizedPayoutAmounts[paymentMethod]
        if (toMinorUnits(amount) === 0) return []
        const existing = existingAllocations.find(
          (item) => item.paymentMethod === paymentMethod,
        )
        return [
          {
            id: existing?.id ?? crypto.randomUUID(),
            workspaceId: workspace.id,
            sessionId: session.id,
            sessionPlayerId: sessionPlayer.id,
            paymentMethod,
            amount,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          },
        ]
      })
      const paymentOffsets = offsetDraft.map((draft) => {
        const existing = existingOffsets.find(
          (item) => item.transactionId === draft.transactionId,
        )
        return {
          id: existing?.id ?? crypto.randomUUID(),
          workspaceId: workspace.id,
          sessionId: session.id,
          sessionPlayerId: sessionPlayer.id,
          transactionId: draft.transactionId,
          amount: draft.amount,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
      })

      await runMutation(() =>
        repository.saveCashOut({
          sessionPlayer: updatedSessionPlayer,
          payoutAllocations,
          paymentOffsets,
        }),
      )
      setData((current) => ({
        ...current,
        sessionPlayers: current.sessionPlayers.map((item) =>
          item.id === sessionPlayer.id ? updatedSessionPlayer : item,
        ),
        payoutAllocations: [
          ...current.payoutAllocations.filter(
            (item) => item.sessionPlayerId !== sessionPlayer.id,
          ),
          ...payoutAllocations,
        ],
        paymentOffsets: [
          ...current.paymentOffsets.filter(
            (item) => item.sessionPlayerId !== sessionPlayer.id,
          ),
          ...paymentOffsets,
        ],
      }))
    },
    addTransaction: async (input: NewTransactionInput) => {
      ensurePrimaryPaymentMethod(input.paymentMethod)
      const session = data.sessions.find((item) => item.id === input.sessionId)
      const participant = data.sessionPlayers.find(
        (item) =>
          item.sessionId === input.sessionId && item.playerId === input.playerId,
      )
      if (!session || session.status !== 'ACTIVE' || !participant) {
        throw new Error('Transactions require an active session participant.')
      }
      if (participant.status === 'CASHED_OUT') {
        throw new Error('Cashed-out players cannot receive another rebuy.')
      }
      const now = new Date().toISOString()
      const transaction: Transaction = {
        ...input,
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        createdAt: now,
        updatedAt: now,
      }
      await runMutation(async () => repository.addTransaction(transaction))
      setData((current) => ({
        ...current,
        transactions: [...current.transactions, transaction],
      }))
    },
    updateTransaction: async (input: UpdateTransactionInput) => {
      const currentTransaction = data.transactions.find(
        (transaction) => transaction.id === input.id,
      )
      if (!currentTransaction) throw new Error('Transaction not found.')
      if (
        input.paymentMethod === 'OTHER' &&
        currentTransaction.paymentMethod !== 'OTHER'
      ) {
        throw new Error('Transactions can only be changed to Cash or Card.')
      }
      const offsetAmount = sumMoney(
        data.paymentOffsets
          .filter((offset) => offset.transactionId === input.id)
          .map((offset) => offset.amount),
      )
      if (toMinorUnits(input.amount) < toMinorUnits(offsetAmount)) {
        throw new Error(
          'The corrected transaction amount cannot be smaller than its cash-out offset.',
        )
      }
      const transaction = {
        ...currentTransaction,
        ...input,
        updatedAt: new Date().toISOString(),
      }
      await runMutation(async () => repository.updateTransaction(transaction))
      setData((current) => ({
        ...current,
        transactions: current.transactions.map((item) =>
          item.id === transaction.id ? transaction : item,
        ),
      }))
    },
    createPlan: async (input: NewPlanInput) => {
      const title = input.title.trim()
      const times = [...new Set(input.startsAt)].sort()
      if (!title) throw new Error('Enter a plan title.')
      if (!times.length) throw new Error('Add at least one possible time.')
      const now = new Date().toISOString()
      const plan = {
        id: crypto.randomUUID(), workspaceId: workspace.id, title,
        status: 'VOTING' as const, createdByUserId: currentUserId,
        hostUserId: input.hostUserId ?? currentUserId, confirmedOptionId: null,
        createdAt: now, updatedAt: now,
      }
      const options = times.map((startsAt) => ({
        id: crypto.randomUUID(), workspaceId: workspace.id, planId: plan.id,
        startsAt, createdAt: now,
      }))
      await runMutation(() => repository.createPlan({ plan, options }))
      setData((current) => ({
        ...current,
        plans: [plan, ...current.plans],
        planOptions: [...current.planOptions, ...options],
      }))
      return plan
    },
    savePlanVote: async (
      planId: string,
      optionId: string,
      playerId: string,
      response: PlanVoteResponse,
    ) => {
      const existing = data.planVotes.find(
        (item) => item.optionId === optionId && item.playerId === playerId,
      )
      const vote = {
        id: existing?.id ?? crypto.randomUUID(), workspaceId: workspace.id,
        planId, optionId, playerId, response, recordedByUserId: currentUserId,
        updatedAt: new Date().toISOString(),
      }
      await runMutation(() => repository.savePlanVote(vote))
      setData((current) => ({
        ...current,
        planVotes: [
          ...current.planVotes.filter(
            (item) => !(item.optionId === optionId && item.playerId === playerId),
          ),
          vote,
        ],
      }))
    },
    confirmPlan: async (planId: string, optionId: string, hostUserId: string) => {
      const currentPlan = data.plans.find((item) => item.id === planId)
      const option = data.planOptions.find(
        (item) => item.id === optionId && item.planId === planId,
      )
      if (!currentPlan || !option) throw new Error('Plan option not found.')
      const plan = {
        ...currentPlan, status: 'CONFIRMED' as const,
        confirmedOptionId: optionId, hostUserId,
        updatedAt: new Date().toISOString(),
      }
      await runMutation(() => repository.confirmPlan(plan))
      setData((current) => ({
        ...current,
        plans: current.plans.map((item) => item.id === planId ? plan : item),
      }))
    },
    updateWorkspaceMemberRole: async (userId: string, role: 'HOST' | 'PLAYER') => {
      const member = data.workspaceMembers.find((item) => item.userId === userId)
      if (!member || member.role === 'OWNER') throw new Error('The workspace owner cannot be changed here.')
      await runMutation(() => repository.updateWorkspaceMemberRole(workspace.id, userId, role))
      setData((current) => ({
        ...current,
        workspaceMembers: current.workspaceMembers.map((item) =>
          item.userId === userId ? { ...item, role } : item,
        ),
      }))
    },
    importLocalData: async () => {
      if (!legacyData) return
      await runMutation(async () => repository.importData(workspace.id, legacyData))
      setData(await repository.load(workspace.id))
      setLegacyData(null)
    },
    refresh: loadData,
    clearError: () => setError(null),
  }

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

function ensurePrimaryPaymentMethod(paymentMethod: Transaction['paymentMethod']) {
  if (!isStandardPaymentMethod(paymentMethod)) {
    throw new Error('New transactions can only use Cash or Card.')
  }
}

function DataLoadingScreen() {
  return (
    <main className="relative flex min-h-svh items-center justify-center bg-app-bg text-ink">
      <BrandBackdrop />
      <div className="relative z-10 text-center">
        <div className="mx-auto size-2 animate-pulse rounded-full bg-ink-secondary" />
        <p className="mt-4 text-sm text-ink-muted">Loading workspace…</p>
      </div>
    </main>
  )
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function normalizeMutationError(error: unknown): Error {
  const message = toErrorMessage(error)
  if (
    message.toLowerCase().includes('players_workspace_nickname_ci_unique') ||
    (message.toLowerCase().includes('duplicate key') &&
      message.toLowerCase().includes('players'))
  ) {
    return new Error('A player with this nickname already exists in this workspace.')
  }
  return error instanceof Error ? error : new Error(message)
}

function ensurePlayerNicknameAvailable(
  players: Player[],
  nickname: string,
  excludedPlayerId?: string,
): void {
  const normalizedNickname = nickname.trim().toLocaleLowerCase()
  if (
    players.some(
      (player) =>
        player.id !== excludedPlayerId &&
        player.nickname.trim().toLocaleLowerCase() === normalizedNickname,
    )
  ) {
    throw new Error('A player with this nickname already exists in this workspace.')
  }
}
