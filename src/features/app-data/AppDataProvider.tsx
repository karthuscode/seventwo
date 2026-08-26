import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type {
  AppData,
  NewSessionInput,
  NewTransactionInput,
  Player,
  Session,
} from '../../types/domain'
import { LocalStorageRepository } from '../../services/localStorageRepository'
import { AppDataContext } from './AppDataContext'

const repository = new LocalStorageRepository()

export function AppDataProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<AppData>(() => repository.load())

  useEffect(() => {
    repository.save(data)
  }, [data])

  const value = useMemo(
    () => ({
      ...data,
      addPlayer: (nickname: string) => {
        const now = new Date().toISOString()
        const player: Player = {
          id: crypto.randomUUID(),
          nickname: nickname.trim(),
          createdAt: now,
        }
        setData((current) => ({
          ...current,
          players: [...current.players, player],
        }))
        return player
      },
      createSession: (input: NewSessionInput) => {
        const now = new Date().toISOString()
        const session: Session = {
          id: crypto.randomUUID(),
          name: input.name.trim(),
          date: input.date,
          status: 'ACTIVE',
          buyInAmount: input.buyInAmount,
          chipsPerBuyIn: input.chipsPerBuyIn,
          currency: 'RON',
          createdAt: now,
          finishedAt: null,
        }

        setData((current) => {
          const sessionPlayers = input.playerIds.map((playerId) => ({
            id: crypto.randomUUID(),
            sessionId: session.id,
            playerId,
            joinedAt: now,
            cashOutChips: null,
            cashOutAmount: null,
            status: 'ACTIVE' as const,
          }))
          const transactions = input.playerIds.map((playerId) => ({
            id: crypto.randomUUID(),
            sessionId: session.id,
            playerId,
            type: 'BUY_IN' as const,
            amount: session.buyInAmount,
            chips: session.chipsPerBuyIn,
            paymentMethod: 'CASH' as const,
            paymentStatus: 'RECEIVED' as const,
            createdAt: now,
          }))

          return {
            ...current,
            sessions: [...current.sessions, session],
            sessionPlayers: [...current.sessionPlayers, ...sessionPlayers],
            transactions: [...current.transactions, ...transactions],
          }
        })
        return session
      },
      addTransaction: (input: NewTransactionInput) => {
        setData((current) => ({
          ...current,
          transactions: [
            ...current.transactions,
            {
              ...input,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
            },
          ],
        }))
      },
    }),
    [data],
  )

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  )
}
