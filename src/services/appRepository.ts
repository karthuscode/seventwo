import type {
  AppData,
  Player,
  PayoutAllocation,
  PaymentOffset,
  Plan,
  PlanOption,
  PlanVote,
  WorkspaceInviteResult,
  JoinInviteResult,
  Session,
  SessionPlayer,
  Transaction,
  Workspace,
  WorkspaceRole,
  WorkspaceAccessResult,
} from '../types/domain'

export interface SessionRecords {
  session: Session
  sessionPlayers: SessionPlayer[]
  transactions: Transaction[]
}

export interface SessionPlayerRecords {
  sessionPlayer: SessionPlayer
  transaction: Transaction
}

export interface CashOutRecords {
  sessionPlayer: SessionPlayer
  payoutAllocations: PayoutAllocation[]
  paymentOffsets: PaymentOffset[]
}

export interface PlanRecords {
  plan: Plan
  options: PlanOption[]
}

export interface AppRepository {
  readonly kind: 'local' | 'supabase'
  listWorkspaces(): Promise<Workspace[]>
  createWorkspace(name: string): Promise<WorkspaceAccessResult>
  getWorkspaceInvite(workspaceId: string): Promise<WorkspaceInviteResult>
  rotateWorkspaceCode(workspaceId: string): Promise<string>
  joinWithInviteCode(code: string, nickname?: string): Promise<JoinInviteResult>
  load(workspaceId: string): Promise<AppData>
  addPlayer(player: Player): Promise<void>
  updatePlayer(player: Player): Promise<void>
  deletePlayer(playerId: string, workspaceId: string): Promise<void>
  createSession(records: SessionRecords): Promise<void>
  createSessionFromPlan(records: SessionRecords): Promise<void>
  updateSession(session: Session): Promise<void>
  deleteSession(sessionId: string, workspaceId: string): Promise<void>
  addSessionPlayer(records: SessionPlayerRecords): Promise<void>
  removeSessionPlayer(sessionPlayerId: string, workspaceId: string): Promise<void>
  saveCashOut(records: CashOutRecords): Promise<void>
  addTransaction(transaction: Transaction): Promise<void>
  updateTransaction(transaction: Transaction): Promise<void>
  createPlan(records: PlanRecords): Promise<void>
  savePlanVote(vote: PlanVote): Promise<void>
  confirmPlan(plan: Plan): Promise<void>
  deletePlan(planId: string, workspaceId: string): Promise<void>
  deleteWorkspace(workspaceId: string): Promise<void>
  updateWorkspaceMemberRole(
    workspaceId: string,
    userId: string,
    role: Exclude<WorkspaceRole, 'OWNER'>,
  ): Promise<void>
  linkPlayerToMember(workspaceId: string, playerId: string, userId: string): Promise<void>
  importData(workspaceId: string, data: AppData): Promise<void>
}

export function emptyAppData(): AppData {
  return {
    players: [],
    sessions: [],
    sessionPlayers: [],
    transactions: [],
    payoutAllocations: [],
    paymentOffsets: [],
    workspaceMembers: [],
    plans: [],
    planOptions: [],
    planVotes: [],
  }
}

export function hasAppData(data: AppData): boolean {
  return (
    data.players.length > 0 ||
    data.sessions.length > 0 ||
    data.sessionPlayers.length > 0 ||
    data.transactions.length > 0
  )
}
