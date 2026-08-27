-- Phase 4 release-candidate correction: one reusable workspace invite,
-- automatic registered Player identities, and owner-controlled identity links.

alter table public.workspaces
  add column if not exists invite_code_seed uuid,
  add column if not exists creation_request_id uuid;

create unique index if not exists workspaces_creation_request_unique
  on public.workspaces(creation_request_id)
  where creation_request_id is not null;

comment on column public.workspaces.invite_code_seed is
  'Server-side seed used with WORKSPACE_CODE_PEPPER to reproduce the active six-digit invite code. It is not the plaintext code.';
comment on column public.workspaces.access_code_digest is
  'HMAC-SHA-256 digest of the active reusable workspace invite code.';
comment on table public.player_invites is
  'Deprecated single-use Phase 4 invite infrastructure retained for rollback compatibility. Normal joins use workspaces.access_code_digest.';

-- A registered account can have only one canonical poker identity per workspace.
create unique index if not exists players_workspace_registered_user_unique
  on public.players(workspace_id, user_id)
  where user_id is not null;

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
  if target_invite_seed is null or target_invite_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Workspace invite data is invalid.';
  end if;
  if target_request_id is null then raise exception 'Workspace request is invalid.'; end if;
  if not exists (
    select 1 from auth.users account
    where account.id = target_user_id
      and coalesce(account.is_anonymous, true) = false
  ) then
    raise exception 'A registered account is required.';
  end if;

  select workspace.id, workspace.created_at, workspace.invite_code_seed
  into new_workspace_id, new_workspace_created_at, target_invite_seed
  from public.workspaces workspace
  join public.workspace_members membership on membership.workspace_id = workspace.id
  where workspace.creation_request_id = target_request_id
    and membership.user_id = target_user_id
    and membership.role = 'OWNER';

  if new_workspace_id is not null then
    select player.id into new_player_id
    from public.players player
    where player.workspace_id = new_workspace_id and player.user_id = target_user_id;
    return query select new_workspace_id, new_workspace_created_at, new_player_id, target_invite_seed;
    return;
  end if;

  insert into public.workspaces(name, access_code_digest, invite_code_seed, creation_request_id)
  values (clean_name, target_invite_digest, target_invite_seed, target_request_id)
  returning id, created_at into new_workspace_id, new_workspace_created_at;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (new_workspace_id, target_user_id, 'OWNER');

  insert into public.players(workspace_id, nickname, user_id)
  values (new_workspace_id, clean_nickname, target_user_id)
  returning id into new_player_id;

  return query select new_workspace_id, new_workspace_created_at, new_player_id, target_invite_seed;
end;
$$;

revoke all on function public.create_registered_workspace(text, uuid, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_registered_workspace(text, uuid, text, uuid, uuid, text)
  to service_role;

create or replace function public.join_registered_workspace(
  target_workspace_id uuid,
  target_user_id uuid,
  target_nickname text
) returns table(member_role public.workspace_role, player_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  clean_nickname text := btrim(target_nickname);
  existing_member_role public.workspace_role;
  linked_player_id uuid;
begin
  if length(clean_nickname) not between 1 and 50 then
    raise exception 'Nickname must be 1–50 characters.';
  end if;
  if not exists (
    select 1 from auth.users account
    where account.id = target_user_id
      and coalesce(account.is_anonymous, true) = false
  ) then
    raise exception 'A registered account is required.';
  end if;
  perform 1 from public.workspaces workspace
  where workspace.id = target_workspace_id for update;
  if not found then raise exception 'Workspace not found.'; end if;

  select player.id into linked_player_id
  from public.players player
  where player.workspace_id = target_workspace_id
    and player.user_id = target_user_id;

  if linked_player_id is null and exists (
    select 1 from public.players player
    where player.workspace_id = target_workspace_id
      and lower(btrim(player.nickname)) = lower(clean_nickname)
  ) then
    raise exception 'That nickname is already in use.';
  end if;

  select membership.role into existing_member_role
  from public.workspace_members membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_user_id;

  if existing_member_role is null then
    existing_member_role := 'PLAYER';
    insert into public.workspace_members(workspace_id, user_id, role)
    values (target_workspace_id, target_user_id, existing_member_role);
  end if;

  if linked_player_id is null then
    insert into public.players(workspace_id, nickname, user_id)
    values (target_workspace_id, clean_nickname, target_user_id)
    returning id into linked_player_id;
  end if;

  return query select existing_member_role, linked_player_id;
end;
$$;

revoke all on function public.join_registered_workspace(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.join_registered_workspace(uuid, uuid, text)
  to service_role;

create or replace function public.link_player_to_registered_member(
  target_workspace_id uuid,
  target_player_id uuid,
  target_user_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only the workspace owner can link Players.';
  end if;
  if not exists (
    select 1 from public.workspace_members membership
    join auth.users account on account.id = membership.user_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = target_user_id
      and coalesce(account.is_anonymous, true) = false
  ) then
    raise exception 'Choose a registered workspace member.';
  end if;
  if exists (
    select 1 from public.players player
    where player.workspace_id = target_workspace_id
      and player.user_id = target_user_id
  ) then
    raise exception 'This member already has a linked Player.';
  end if;

  update public.players
  set user_id = target_user_id
  where id = target_player_id
    and workspace_id = target_workspace_id
    and user_id is null;
  if not found then raise exception 'Unregistered Player not found.'; end if;
end;
$$;

revoke all on function public.link_player_to_registered_member(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.link_player_to_registered_member(uuid, uuid, uuid)
  to authenticated;

-- Every workspace member needs roster names for Plans and the Players view.
drop policy if exists "Operators and linked users view players" on public.players;
drop policy if exists "Members can view players" on public.players;
drop policy if exists "Workspace members view players" on public.players;

create policy "Workspace members view players" on public.players
for select to authenticated
using (public.is_workspace_member(workspace_id));

-- Direct application updates may edit roster fields, but identity linking is
-- forced through the owner-checked function above.
revoke update on public.players from authenticated;
grant update(nickname, archived_at) on public.players to authenticated;

-- Invite material is server-only even though workspace metadata is readable.
revoke select on public.workspaces from authenticated;
grant select(id, name, created_at) on public.workspaces to authenticated;
revoke update on public.workspaces from authenticated;
grant update(name) on public.workspaces to authenticated;

notify pgrst, 'reload schema';
