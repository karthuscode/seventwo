-- Harden registered workspace creation after repairing a partially applied
-- release-candidate migration. Keep invite inputs in unambiguous local
-- variables and repair a missing seed/digest on an idempotent retry.

create or replace function public.create_registered_workspace(
  target_name text,
  target_user_id uuid,
  target_nickname text,
  target_request_id uuid,
  target_invite_seed uuid,
  target_invite_digest text
) returns table(
  workspace_id uuid,
  workspace_created_at timestamptz,
  player_id uuid,
  workspace_invite_seed uuid
)
language plpgsql security definer set search_path = ''
as $$
declare
  clean_name text := btrim(target_name);
  clean_nickname text := btrim(target_nickname);
  requested_invite_seed uuid := target_invite_seed;
  requested_invite_digest text := target_invite_digest;
  resolved_invite_seed uuid;
  new_workspace_id uuid;
  new_workspace_created_at timestamptz;
  new_player_id uuid;
begin
  if length(clean_name) not between 1 and 80 then
    raise exception 'Workspace name must be 1–80 characters.';
  end if;
  if length(clean_nickname) not between 2 and 24 then
    raise exception 'Username must be 2–24 characters.';
  end if;
  if requested_invite_seed is null
    or requested_invite_digest !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Workspace invite data is invalid.';
  end if;
  if target_request_id is null then
    raise exception 'Workspace request is invalid.';
  end if;
  if not exists (
    select 1 from auth.users account
    where account.id = target_user_id
      and coalesce(account.is_anonymous, true) = false
  ) then
    raise exception 'A registered account is required.';
  end if;

  select workspace.id, workspace.created_at, workspace.invite_code_seed
  into new_workspace_id, new_workspace_created_at, resolved_invite_seed
  from public.workspaces workspace
  join public.workspace_members membership
    on membership.workspace_id = workspace.id
  where workspace.creation_request_id = target_request_id
    and membership.user_id = target_user_id
    and membership.role = 'OWNER'
  for update of workspace;

  if new_workspace_id is not null then
    if resolved_invite_seed is null then
      update public.workspaces
      set invite_code_seed = requested_invite_seed,
          access_code_digest = requested_invite_digest
      where id = new_workspace_id
        and invite_code_seed is null
      returning invite_code_seed into resolved_invite_seed;
    end if;

    select player.id into new_player_id
    from public.players player
    where player.workspace_id = new_workspace_id
      and player.user_id = target_user_id;

    if new_player_id is null then
      insert into public.players(workspace_id, nickname, user_id)
      values (new_workspace_id, clean_nickname, target_user_id)
      returning id into new_player_id;
    end if;

    return query
    select
      new_workspace_id,
      new_workspace_created_at,
      new_player_id,
      resolved_invite_seed;
    return;
  end if;

  insert into public.workspaces(
    name,
    access_code_digest,
    invite_code_seed,
    creation_request_id
  ) values (
    clean_name,
    requested_invite_digest,
    requested_invite_seed,
    target_request_id
  )
  returning id, created_at, invite_code_seed
  into new_workspace_id, new_workspace_created_at, resolved_invite_seed;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (new_workspace_id, target_user_id, 'OWNER');

  insert into public.players(workspace_id, nickname, user_id)
  values (new_workspace_id, clean_nickname, target_user_id)
  returning id into new_player_id;

  return query
  select
    new_workspace_id,
    new_workspace_created_at,
    new_player_id,
    resolved_invite_seed;
end;
$$;

revoke all on function public.create_registered_workspace(
  text, uuid, text, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_registered_workspace(
  text, uuid, text, uuid, uuid, text
) to service_role;

notify pgrst, 'reload schema';
