import { useContext } from 'react'
import { WorkspaceContext } from '../features/workspaces/WorkspaceContext'

export function useWorkspaces() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspaces must be used within WorkspaceProvider')
  }
  return context
}
