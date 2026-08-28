-- Final Phase 4 admin controls. Workspace deletion stays owner-only and
-- happens in one transaction so the owner-protection trigger cannot leave a
-- partially deleted workspace.

create or replace function public.delete_owned_workspace(
  target_workspace_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  owner_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  perform 1
  from public.workspace_members membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = current_user_id
    and membership.role = 'OWNER'
  for update;

  if not found then
    raise exception 'Only the workspace owner can delete this workspace.';
  end if;

  select count(*) into owner_count
  from public.workspace_members membership
  where membership.workspace_id = target_workspace_id
    and membership.role = 'OWNER';

  if owner_count <> 1 then
    raise exception 'Workspace deletion requires one sole owner.';
  end if;

  perform set_config('seventwo.owner_transfer', 'on', true);

  delete from public.workspaces workspace
  where workspace.id = target_workspace_id;

  if not found then
    raise exception 'Workspace not found.';
  end if;
end;
$$;

revoke all on function public.delete_owned_workspace(uuid)
  from public, anon;
grant execute on function public.delete_owned_workspace(uuid)
  to authenticated;

comment on function public.delete_owned_workspace(uuid) is
  'Deletes one workspace and its cascaded data for its sole OWNER without deleting the auth account.';

notify pgrst, 'reload schema';
