export type Currency = 'RON'

export type SessionStatus = 'ACTIVE' | 'FINISHED'

export type SessionPlayerStatus = 'ACTIVE' | 'CASHED_OUT'

export type TransactionType = 'BUY_IN' | 'REBUY'

export type PaymentMethod = 'CASH' | 'CARD' | 'OTHER'

export type PaymentStatus = 'RECEIVED' | 'PENDING'

export interface Player {
  id: string
  nickname: string
  createdAt: string
}

export interface Session {
  id: string
  name: string
  date: string
  status: SessionStatus
  buyInAmount: number
  chipsPerBuyIn: number
  currency: Currency
  createdAt: string
  finishedAt: string | null
}

export interface SessionPlayer {
  id: string
  sessionId: string
  playerId: string
  joinedAt: string
  cashOutChips: number | null
  cashOutAmount: number | null
  status: SessionPlayerStatus
}

export interface Transaction {
  id: string
  sessionId: string
  playerId: string
  type: TransactionType
  amount: number
  chips: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  createdAt: string
}

export interface AppData {
  players: Player[]
  sessions: Session[]
  sessionPlayers: SessionPlayer[]
  transactions: Transaction[]
}

export interface NewSessionInput {
  name: string
  date: string
  buyInAmount: number
  chipsPerBuyIn: number
  playerIds: string[]
}

export interface NewTransactionInput {
  sessionId: string
  playerId: string
  type: TransactionType
  amount: number
  chips: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
}
