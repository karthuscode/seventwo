import {
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react'
import type {
  AppData,
  NewSessionInput,
  NewTransactionInput,
  Player,
  Session,
  Transaction,
  UpdateTransactionInput,
} from '../../types/domain'
import {
  emptyAppData,
  hasAppData,
  type SessionRecords,
} from '../../services/appRepository'
import { LocalStorageRepository } from '../../services/localStorageRepository'
import { useWorkspaces } from '../../hooks/useWorkspaces'
import { AppDataContext } from './AppDataContext'

export function AppDataProvider({ children }: PropsWithChildren) {
  const { repository, selectedWorkspace: workspace } = useWorkspaces()
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
      setError(toErrorMessage(caughtError))
      throw caughtError
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
      const player: Player = {
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        nickname: nickname.trim(),
        createdAt: new Date().toISOString(),
      }
      await runMutation(async () => repository.addPlayer(player))
      setData((current) => ({
        ...current,
        players: [...current.players, player],
      }))
      return player
    },
    createSession: async (input: NewSessionInput) => {
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
          paymentMethod: 'CASH',
          paymentStatus: 'RECEIVED',
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
    addTransaction: async (input: NewTransactionInput) => {
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

function DataLoadingScreen() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-950 text-slate-100">
      <div className="text-center">
        <div className="mx-auto size-8 animate-pulse rounded-full bg-emerald-400" />
        <p className="mt-4 text-sm text-slate-400">Loading workspace…</p>
      </div>
    </main>
  )
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}
