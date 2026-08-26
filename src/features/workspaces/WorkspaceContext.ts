import { createContext } from 'react'
import type { AppRepository } from '../../services/appRepository'
import type { Workspace } from '../../types/domain'

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
  isLoading: boolean
  isSaving: boolean
  error: string | null
  createWorkspace: (name: string) => Promise<void>
  joinWorkspace: (code: string) => Promise<void>
  selectWorkspace: (workspaceId: string | null) => void
  rotateWorkspaceCode: (workspaceId: string) => Promise<void>
  clearRevealedCode: () => void
  clearError: () => void
  refreshWorkspaces: () => Promise<void>
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
