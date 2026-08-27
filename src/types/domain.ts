export type Currency = 'RON'

export type SessionStatus = 'ACTIVE' | 'FINISHED'

export type SessionPlayerStatus = 'ACTIVE' | 'CASHED_OUT'

export type TransactionType = 'BUY_IN' | 'REBUY'

export type PaymentMethod = 'CASH' | 'CARD' | 'OTHER'

export type PaymentStatus = 'RECEIVED' | 'PENDING'

export type WorkspaceRole = 'OWNER' | 'HOST' | 'PLAYER'

export type PlanStatus = 'DRAFT' | 'VOTING' | 'CONFIRMED' | 'SESSION_CREATED' | 'CANCELLED'

export type PlanVoteResponse = 'AVAILABLE' | 'MAYBE' | 'UNAVAILABLE'

export interface UserProfile {
  userId: string
  displayName: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceMember {
  workspaceId: string
  userId: string
  role: WorkspaceRole
  displayName: string | null
  createdAt: string
}

export interface Workspace {
  id: string
  name: string
  createdAt: string
  role: WorkspaceRole
}

export interface WorkspaceAccessResult {
  workspace: Workspace
  accessCode: string
}

export interface Player {
  id: string
  workspaceId: string
  nickname: string
  createdAt: string
  archivedAt: string | null
  userId: string | null
}

export interface Session {
  id: string
  workspaceId: string
  name: string
  date: string
  status: SessionStatus
  buyInAmount: number
  chipsPerBuyIn: number
  currency: Currency
  createdAt: string
  finishedAt: string | null
  hostUserId: string | null
  planId: string | null
  startsAt: string | null
}

export interface Plan {
  id: string
  workspaceId: string
  title: string
  status: PlanStatus
  createdByUserId: string
  hostUserId: string | null
  confirmedOptionId: string | null
  createdAt: string
  updatedAt: string
}

export interface PlanOption {
  id: string
  workspaceId: string
  planId: string
  startsAt: string
  createdAt: string
}

export interface PlanVote {
  id: string
  workspaceId: string
  planId: string
  optionId: string
  playerId: string
  response: PlanVoteResponse
  recordedByUserId: string
  updatedAt: string
}

export interface PlayerInviteResult {
  workspaceId: string
  playerId: string | null
  playerNickname: string | null
  inviteCode: string
  expiresAt: string
}

export type JoinInviteResult =
  | { status: 'JOINED'; workspace: Workspace; playerId?: string }
  | { status: 'NICKNAME_REQUIRED'; workspaceName: string }

export interface SessionPlayer {
  id: string
  workspaceId: string
  sessionId: string
  playerId: string
  joinedAt: string
  cashOutChips: number | null
  cashOutAmount: number | null
  cashedOutAt: string | null
  status: SessionPlayerStatus
}

export interface PayoutAllocation {
  id: string
  workspaceId: string
  sessionId: string
  sessionPlayerId: string
  paymentMethod: PaymentMethod
  amount: number
  createdAt: string
  updatedAt: string
}

export interface PaymentOffset {
  id: string
  workspaceId: string
  sessionId: string
  sessionPlayerId: string
  transactionId: string
  amount: number
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  workspaceId: string
  sessionId: string
  playerId: string
  type: TransactionType
  amount: number
  chips: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  createdAt: string
  updatedAt: string
}

export interface AppData {
  players: Player[]
  sessions: Session[]
  sessionPlayers: SessionPlayer[]
  transactions: Transaction[]
  payoutAllocations: PayoutAllocation[]
  paymentOffsets: PaymentOffset[]
  workspaceMembers: WorkspaceMember[]
  plans: Plan[]
  planOptions: PlanOption[]
  planVotes: PlanVote[]
}

export interface NewSessionInput {
  name: string
  date: string
  buyInAmount: number
  chipsPerBuyIn: number
  playerIds: string[]
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  hostUserId?: string | null
  planId?: string | null
}

export interface NewPlanInput {
  title: string
  startsAt: string[]
  hostUserId: string | null
}

export interface CreateSessionFromPlanInput extends NewSessionInput {
  planId: string
}

export interface CashOutInput {
  sessionPlayerId: string
  finalChips: number
  payoutAmounts: Record<PaymentMethod, number>
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

export interface UpdateTransactionInput {
  id: string
  amount: number
  chips: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
}
