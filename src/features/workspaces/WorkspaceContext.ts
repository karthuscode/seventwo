import { createContext } from 'react'
import type { AppRepository } from '../../services/appRepository'
import type { JoinInviteResult, PlayerInviteResult, Workspace } from '../../types/domain'

export interface RevealedWorkspaceCode {
  workspaceId: string
  workspaceName: string
  code: string
}

export interface WorkspaceContextValue {
  repository: AppRepository
  workspaces: Workspace[]
  selectedWorkspace: Workspace | null
  revealedCode: RevealedWorkspaceCode | null
  revealedPlayerInvite: PlayerInviteResult | null
  joinNotice: { workspaceName: string; role: Workspace['role'] } | null
  isLoading: boolean
  isSaving: boolean
  error: string | null
  createWorkspace: (name: string) => Promise<void>
  joinWorkspace: (code: string) => Promise<void>
  selectWorkspace: (workspaceId: string | null) => void
  rotateWorkspaceCode: (workspaceId: string) => Promise<void>
  createPlayerInvite: (workspaceId: string, playerId?: string) => Promise<void>
  redeemPlayerInvite: (code: string) => Promise<void>
  joinWithInviteCode: (code: string, nickname?: string) => Promise<JoinInviteResult>
  clearRevealedCode: () => void
  clearRevealedPlayerInvite: () => void
  clearJoinNotice: () => void
  clearError: () => void
  refreshWorkspaces: () => Promise<void>
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
