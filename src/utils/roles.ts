import type { WorkspaceRole } from '../types/domain'

export function canManageWorkspaceRoles(role: WorkspaceRole): boolean {
  return role === 'OWNER'
}

export function canChangeMemberRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  nextRole: WorkspaceRole,
): boolean {
  return (
    actorRole === 'OWNER' &&
    targetRole !== 'OWNER' &&
    (nextRole === 'HOST' || nextRole === 'PLAYER')
  )
}

export function roleLabel(role: WorkspaceRole): string {
  return role
}
