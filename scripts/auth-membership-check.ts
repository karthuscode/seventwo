import { readFileSync } from 'node:fs'
import { canChangeMemberRole, canManageWorkspaceRoles } from '../src/utils/roles.ts'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

assert(canManageWorkspaceRoles('OWNER'), 'OWNER should manage workspace roles.')
assert(!canManageWorkspaceRoles('HOST'), 'HOST must not manage workspace roles.')
assert(!canManageWorkspaceRoles('PLAYER'), 'PLAYER must not manage workspace roles.')
assert(canChangeMemberRole('OWNER', 'PLAYER', 'HOST'), 'OWNER should promote PLAYER to HOST.')
assert(canChangeMemberRole('OWNER', 'HOST', 'PLAYER'), 'OWNER should demote HOST to PLAYER.')
assert(!canChangeMemberRole('OWNER', 'OWNER', 'PLAYER'), 'OWNER must remain locked.')
assert(!canChangeMemberRole('HOST', 'PLAYER', 'HOST'), 'HOST must not promote members.')

const repository = source('../src/services/supabaseRepository.ts')
assert(repository.includes("'join-workspace'"), 'The frontend should use the workspace join function.')
assert(repository.includes("'get-workspace-invite'"), 'The frontend should use the workspace invite viewer.')
assert(!repository.includes("'redeem-invite-code'"), 'The frontend must not call the deprecated invite redeemer.')
assert(!repository.includes("'create-player-invite'"), 'The frontend must not create single-use Player invites.')
assert(!repository.includes("roles.get(row.id) ??"), 'Workspace roles must never use a fabricated fallback.')
assert(repository.includes(".from('workspace_members')"), 'Workspace roles must come from workspace_members.')
assert(repository.includes(".eq('user_id', authData.user.id)"), 'Workspace roles must be scoped to the authenticated membership row.')
assert(repository.includes("rpc('delete_owned_workspace'"), 'Workspace deletion must use the owner-checked RPC.')

const joinWorkspace = source('../supabase/functions/join-workspace/index.ts')
assert(joinWorkspace.includes('{ registeredOnly: true }'), 'Workspace joins require a registered account.')
assert(joinWorkspace.includes('digestWorkspaceCode'), 'Workspace joins must use the HMAC digest.')
assert(joinWorkspace.includes("target_nickname: nickname"), 'Workspace joins must create a linked Player.')
assert(!joinWorkspace.includes("role: 'HOST'"), 'Workspace invites must never grant HOST.')

const createWorkspace = source('../supabase/functions/create-workspace/index.ts')
assert(createWorkspace.includes('{ registeredOnly: true }'), 'Workspace creation requires a registered account.')
assert(createWorkspace.includes("admin.rpc('create_registered_workspace'"), 'Workspace creation must be atomic.')
assert(createWorkspace.includes('allocateWorkspaceInvite'), 'Workspace creation must provision the reusable invite.')
assert(createWorkspace.includes('target_request_id: requestId'), 'Workspace creation retries need an idempotency key.')

const migration = source('../supabase/migrations/20260903000000_workspace_creator_player.sql')
assert(migration.includes('players_workspace_registered_user_unique'), 'One linked Player per account/workspace must be enforced.')
assert(migration.includes('workspaces_creation_request_unique'), 'Workspace creation requests must be idempotent.')
assert(migration.includes('link_player_to_registered_member'), 'Historical linking must be owner-controlled.')
assert(migration.includes('Workspace members view players'), 'Members need the roster for Plans and Players.')
assert(migration.includes('revoke update on public.players from authenticated'), 'Direct user-id linking must be blocked.')

const rosterRepair = source('../supabase/migrations/20260903001000_repair_workspace_creator_schema.sql')
assert(rosterRepair.includes('Workspace members view players'), 'Every workspace member must be allowed to read the roster.')
assert(rosterRepair.includes('public.is_workspace_member(workspace_id)'), 'Roster reads must remain workspace-scoped.')

const adminControls = source('../supabase/migrations/20260903003000_release_admin_controls.sql')
assert(adminControls.includes("membership.role = 'OWNER'"), 'Workspace deletion must require OWNER membership.')
assert(adminControls.includes("owner_count <> 1"), 'Workspace deletion must require a sole OWNER.')
assert(adminControls.includes("set_config('seventwo.owner_transfer', 'on', true)"), 'Workspace deletion must explicitly authorize the owner cascade.')

const workspaceProvider = source('../src/features/workspaces/WorkspaceProvider.tsx')
assert(workspaceProvider.includes('canonicalWorkspaces'), 'Join and create results must be refreshed from canonical membership data.')

const appLayout = source('../src/components/AppLayout.tsx')
assert(appLayout.includes("to: '/players', label: 'Players'"), 'PLAYER navigation must expose the roster.')

console.log('Auth and membership checks passed.')

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}
