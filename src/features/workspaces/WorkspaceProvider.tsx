import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import type { AppRepository } from '../../services/appRepository'
import {
  LocalStorageRepository,
  SELECTED_WORKSPACE_KEY,
} from '../../services/localStorageRepository'
import { supabase } from '../../services/supabaseClient'
import { SupabaseRepository } from '../../services/supabaseRepository'
import type { Workspace } from '../../types/domain'
import { useAuth } from '../../hooks/useAuth'
import {
  WorkspaceContext,
  type RevealedWorkspaceCode,
  type WorkspaceContextValue,
} from './WorkspaceContext'

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { mode, user } = useAuth()
  const repository = useMemo<AppRepository>(() => {
    if (mode === 'supabase' && supabase) return new SupabaseRepository(supabase)
    return new LocalStorageRepository()
  }, [mode])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  )
  const [revealedCode, setRevealedCode] =
    useState<RevealedWorkspaceCode | null>(null)
  const [revealedPlayerInvite, setRevealedPlayerInvite] = useState<WorkspaceContextValue['revealedPlayerInvite']>(null)
  const [joinNotice, setJoinNotice] = useState<WorkspaceContextValue['joinNotice']>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshWorkspaces = useCallback(async () => {
    try {
      const nextWorkspaces = await repository.listWorkspaces()
      const savedWorkspaceId = window.localStorage.getItem(SELECTED_WORKSPACE_KEY)
      const savedWorkspaceExists = nextWorkspaces.some(
        (workspace) => workspace.id === savedWorkspaceId,
      )
      setWorkspaces(nextWorkspaces)
      setSelectedWorkspaceId((current) => {
        if (nextWorkspaces.some((workspace) => workspace.id === current)) {
          return current
        }
        if (savedWorkspaceExists) return savedWorkspaceId
        if (nextWorkspaces.length === 1) return nextWorkspaces[0].id
        return null
      })
      setError(null)
    } catch (caughtError) {
      setError(toMessage(caughtError))
    } finally {
      setIsLoading(false)
    }
  }, [repository])

  useEffect(() => {
    // Workspace membership is loaded from the active external repository.
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshWorkspaces()
  }, [refreshWorkspaces, user?.id])

  function selectWorkspace(workspaceId: string | null) {
    setSelectedWorkspaceId(workspaceId)
    if (workspaceId) {
      window.localStorage.setItem(SELECTED_WORKSPACE_KEY, workspaceId)
    } else {
      window.localStorage.removeItem(SELECTED_WORKSPACE_KEY)
    }
  }

  async function createWorkspace(name: string) {
    const cleanName = name.trim()
    if (!cleanName) throw new Error('Enter a workspace name.')
    setIsSaving(true)
    setError(null)
    try {
      const result = await repository.createWorkspace(cleanName)
      setWorkspaces((current) => upsertWorkspace(current, result.workspace))
      selectWorkspace(result.workspace.id)
      setRevealedCode({
        workspaceId: result.workspace.id,
        workspaceName: result.workspace.name,
        code: result.accessCode,
      })
    } catch (caughtError) {
      setError(toMessage(caughtError))
      throw caughtError
    } finally {
      setIsSaving(false)
    }
  }

  async function joinWorkspace(code: string) {
    const normalizedCode = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(normalizedCode)) {
      throw new Error('Enter exactly six digits.')
    }
    setIsSaving(true)
    setError(null)
    try {
      const workspace = await repository.joinWorkspace(normalizedCode)
      setWorkspaces((current) => upsertWorkspace(current, workspace))
      setJoinNotice({ workspaceName: workspace.name, role: workspace.role })
      selectWorkspace(workspace.id)
    } catch (caughtError) {
      setError(toMessage(caughtError))
      throw caughtError
    } finally {
      setIsSaving(false)
    }
  }

  async function rotateWorkspaceCode(workspaceId: string) {
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (!workspace || workspace.role !== 'OWNER') {
      throw new Error('Only a workspace owner can regenerate its code.')
    }
    setIsSaving(true)
    setError(null)
    try {
      const code = await repository.rotateWorkspaceCode(workspaceId)
      setRevealedCode({
        workspaceId,
        workspaceName: workspace.name,
        code,
      })
    } catch (caughtError) {
      setError(toMessage(caughtError))
      throw caughtError
    } finally {
      setIsSaving(false)
    }
  }

  async function createPlayerInvite(workspaceId: string, playerId?: string) {
    setIsSaving(true)
    setError(null)
    try {
      setRevealedPlayerInvite(await repository.createPlayerInvite(workspaceId, playerId))
    } catch (caughtError) {
      setError(toMessage(caughtError))
      throw caughtError
    } finally {
      setIsSaving(false)
    }
  }

  async function redeemPlayerInvite(code: string) {
    const normalizedCode = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(normalizedCode)) throw new Error('Enter exactly six digits.')
    setIsSaving(true)
    setError(null)
    try {
      const workspace = await repository.redeemPlayerInvite(normalizedCode)
      setWorkspaces((current) => upsertWorkspace(current, workspace))
      selectWorkspace(workspace.id)
    } catch (caughtError) {
      setError(toMessage(caughtError))
      throw caughtError
    } finally {
      setIsSaving(false)
    }
  }

  async function joinWithInviteCode(code: string, nickname?: string) {
    const normalizedCode = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(normalizedCode)) throw new Error('Enter exactly six digits.')
    setIsSaving(true)
    setError(null)
    try {
      const result = await repository.joinWithInviteCode(normalizedCode, nickname)
      if (result.status === 'JOINED') {
        setWorkspaces((current) => upsertWorkspace(current, result.workspace))
        setJoinNotice({
          workspaceName: result.workspace.name,
          role: result.workspace.role,
        })
        selectWorkspace(result.workspace.id)
      }
      return result
    } catch (caughtError) {
      setError(toMessage(caughtError))
      throw caughtError
    } finally {
      setIsSaving(false)
    }
  }

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null

  const value: WorkspaceContextValue = {
    repository,
    workspaces,
    selectedWorkspace,
    revealedCode,
    revealedPlayerInvite,
    joinNotice,
    isLoading,
    isSaving,
    error,
    createWorkspace,
    joinWorkspace,
    selectWorkspace,
    rotateWorkspaceCode,
    createPlayerInvite,
    redeemPlayerInvite,
    joinWithInviteCode,
    clearRevealedCode: () => setRevealedCode(null),
    clearRevealedPlayerInvite: () => setRevealedPlayerInvite(null),
    clearJoinNotice: () => setJoinNotice(null),
    clearError: () => setError(null),
    refreshWorkspaces,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

function upsertWorkspace(
  workspaces: Workspace[],
  workspace: Workspace,
): Workspace[] {
  const withoutWorkspace = workspaces.filter((item) => item.id !== workspace.id)
  return [...withoutWorkspace, workspace].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Workspace operation failed.'
}
