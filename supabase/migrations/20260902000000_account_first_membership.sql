-- Phase 4 auth/member refactor: new product flow is account-first.
-- Existing host-code and anonymous-transfer structures remain for legacy data,
-- but new UI and Edge Functions should grant app access through registered
-- email/password accounts and Player invites.

comment on column public.workspaces.access_code_digest is
  'Deprecated legacy host-code digest. New workspace joins use single-use Player invites, then OWNER may promote PLAYER to HOST.';

comment on table public.account_access_transfers is
  'Deprecated magic-link transfer ledger. Existing rows may remain; new anonymous OWNER upgrades use upgrade-anonymous-owner.';

comment on table public.player_invites is
  'Server-only, single-use invitations. Redeeming always grants PLAYER membership; OWNER may later promote PLAYER to HOST.';

create or replace function public.workspace_has_single_owner(target_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (
    select count(*)
    from public.workspace_members membership
    where membership.workspace_id = target_workspace_id
      and membership.role = 'OWNER'
  ) = 1;
$$;

revoke all on function public.workspace_has_single_owner(uuid) from public;
grant execute on function public.workspace_has_single_owner(uuid) to authenticated;
