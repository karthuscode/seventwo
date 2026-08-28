import { createContext } from 'react'
import type { AppRepository } from '../../services/appRepository'
import type { JoinInviteResult, Workspace, WorkspaceInviteResult } from '../../types/domain'

export interface WorkspaceContextValue {
  repository: AppRepository
  workspaces: Workspace[]
  selectedWorkspace: Workspace | null
  workspaceInvite: WorkspaceInviteResult | null
  joinNotice: { workspaceName: string; role: Workspace['role'] } | null
  isLoading: boolean
  isSaving: boolean
  error: string | null
  createWorkspace: (name: string) => Promise<void>
  selectWorkspace: (workspaceId: string | null) => void
  loadWorkspaceInvite: (workspaceId: string) => Promise<void>
  rotateWorkspaceInvite: (workspaceId: string) => Promise<void>
  joinWithInviteCode: (code: string, nickname?: string) => Promise<JoinInviteResult>
  deleteWorkspace: (workspaceId: string) => Promise<void>
  clearWorkspaceInvite: () => void
  clearJoinNotice: () => void
  clearError: () => void
  refreshWorkspaces: () => Promise<void>
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
