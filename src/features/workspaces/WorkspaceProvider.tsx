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
  const [workspaceInvite, setWorkspaceInvite] = useState<WorkspaceContextValue['workspaceInvite']>(null)
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
      const canonicalWorkspaces = await repository.listWorkspaces()
      const canonicalWorkspace = canonicalWorkspaces.find(
        (workspace) => workspace.id === result.workspace.id,
      )
      if (!canonicalWorkspace) {
        throw new Error('The new workspace membership could not be verified.')
      }
      setWorkspaces(canonicalWorkspaces)
      if (result.accessCode) {
        setWorkspaceInvite({ workspaceId: result.workspace.id, inviteCode: result.accessCode })
      }
      selectWorkspace(canonicalWorkspace.id)
    } catch (caughtError) {
      setError(toMessage(caughtError))
      throw caughtError
    } finally {
      setIsSaving(false)
    }
  }

  const loadWorkspaceInvite = useCallback(async (workspaceId: string) => {
    setIsSaving(true)
    setError(null)
    try {
      setWorkspaceInvite(await repository.getWorkspaceInvite(workspaceId))
    } catch (caughtError) {
      setError(toMessage(caughtError))
      throw caughtError
    } finally {
      setIsSaving(false)
    }
  }, [repository])

  const rotateWorkspaceInvite = useCallback(async (workspaceId: string) => {
    setIsSaving(true)
    setError(null)
    try {
      const inviteCode = await repository.rotateWorkspaceCode(workspaceId)
      setWorkspaceInvite({ workspaceId, inviteCode })
    } catch (caughtError) {
      setError(toMessage(caughtError))
      throw caughtError
    } finally {
      setIsSaving(false)
    }
  }, [repository])

  const clearWorkspaceInvite = useCallback(() => setWorkspaceInvite(null), [])

  async function joinWithInviteCode(code: string, nickname?: string) {
    const normalizedCode = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(normalizedCode)) throw new Error('Enter exactly six digits.')
    setIsSaving(true)
    setError(null)
    try {
      const result = await repository.joinWithInviteCode(normalizedCode, nickname)
      if (result.status === 'JOINED') {
        const canonicalWorkspaces = await repository.listWorkspaces()
        const canonicalWorkspace = canonicalWorkspaces.find(
          (workspace) => workspace.id === result.workspace.id,
        )
        if (!canonicalWorkspace) {
          throw new Error('The workspace membership could not be verified.')
        }
        setWorkspaces(canonicalWorkspaces)
        setJoinNotice({
          workspaceName: canonicalWorkspace.name,
          role: canonicalWorkspace.role,
        })
        selectWorkspace(canonicalWorkspace.id)
      }
      return result
    } catch (caughtError) {
      setError(toMessage(caughtError))
      throw caughtError
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteWorkspace(workspaceId: string) {
    setIsSaving(true)
    setError(null)
    try {
      await repository.deleteWorkspace(workspaceId)
      setWorkspaces((current) => current.filter((workspace) => workspace.id !== workspaceId))
      if (workspaceInvite?.workspaceId === workspaceId) setWorkspaceInvite(null)
      selectWorkspace(null)
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
    workspaceInvite,
    joinNotice,
    isLoading,
    isSaving,
    error,
    createWorkspace,
    selectWorkspace,
    loadWorkspaceInvite,
    rotateWorkspaceInvite,
    joinWithInviteCode,
    deleteWorkspace,
    clearWorkspaceInvite,
    clearJoinNotice: () => setJoinNotice(null),
    clearError: () => setError(null),
    refreshWorkspaces,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Workspace operation failed.'
}
