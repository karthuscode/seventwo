import { readFileSync } from 'node:fs'
import { canChangeMemberRole, canManageWorkspaceRoles } from '../src/utils/roles.ts'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

assert(canManageWorkspaceRoles('OWNER'), 'OWNER should manage workspace roles.')
assert(!canManageWorkspaceRoles('HOST'), 'HOST must not manage workspace roles.')
assert(!canManageWorkspaceRoles('PLAYER'), 'PLAYER must not manage workspace roles.')

assert(
  canChangeMemberRole('OWNER', 'PLAYER', 'HOST'),
  'OWNER should promote PLAYER to HOST.',
)
assert(
  canChangeMemberRole('OWNER', 'HOST', 'PLAYER'),
  'OWNER should demote HOST to PLAYER.',
)
assert(
  !canChangeMemberRole('OWNER', 'OWNER', 'PLAYER'),
  'OWNER must not be downgraded through normal role controls.',
)
assert(
  !canChangeMemberRole('HOST', 'PLAYER', 'HOST'),
  'HOST must not promote members.',
)
assert(
  !canChangeMemberRole('PLAYER', 'HOST', 'PLAYER'),
  'PLAYER must not manage members.',
)

const redeemInvite = readFileSync(
  new URL('../supabase/functions/redeem-invite-code/index.ts', import.meta.url),
  'utf8',
)
assert(
  redeemInvite.includes('{ registeredOnly: true }'),
  'Normal invite redemption should require a registered account.',
)
assert(
  !redeemInvite.includes('digestWorkspaceCode'),
  'Normal invite redemption must not accept legacy host codes.',
)
assert(
  !redeemInvite.includes("role: 'HOST'"),
  'Normal invite redemption must not grant HOST.',
)

const createWorkspace = readFileSync(
  new URL('../supabase/functions/create-workspace/index.ts', import.meta.url),
  'utf8',
)
assert(
  createWorkspace.includes('{ registeredOnly: true }'),
  'Workspace creation should require a registered account.',
)
assert(
  !createWorkspace.includes('generateUniqueWorkspaceCode'),
  'Workspace creation should not generate normal host access codes.',
)

console.log('Auth and membership checks passed.')
