-- Allow an OWNER to invite either an existing canonical Player or a genuinely
-- new registered Player without auto-creating poker identities at email signup.

alter table public.player_invites
  alter column player_id drop not null;

create or replace function public.redeem_new_player_invite(
  target_invite_id uuid,
  target_user_id uuid,
  target_nickname text
) returns table(workspace_id uuid, player_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  invite_row public.player_invites%rowtype;
  clean_nickname text;
  new_player_id uuid;
  current_role public.workspace_role;
begin
  clean_nickname := trim(target_nickname);
  if length(clean_nickname) < 1 or length(clean_nickname) > 50 then
    raise exception 'Nickname must be 1–50 characters.';
  end if;

  select * into invite_row from public.player_invites
  where id = target_invite_id for update;
  if not found or invite_row.player_id is not null
    or invite_row.redeemed_at is not null or invite_row.expires_at <= now() then
    raise exception 'Invite is invalid or expired.';
  end if;
  if exists (
    select 1 from public.players
    where workspace_id = invite_row.workspace_id and user_id = target_user_id
  ) then
    raise exception 'This account already has a player in the workspace.';
  end if;
  if exists (
    select 1 from public.players
    where workspace_id = invite_row.workspace_id
      and lower(trim(nickname)) = lower(clean_nickname)
  ) then
    raise exception 'A Player with this nickname already exists. Ask the Owner for an invite linked to that profile, or choose a different nickname.';
  end if;

  new_player_id := gen_random_uuid();
  insert into public.players(id, workspace_id, nickname, user_id)
  values (new_player_id, invite_row.workspace_id, clean_nickname, target_user_id);

  select role into current_role from public.workspace_members
  where workspace_id = invite_row.workspace_id and user_id = target_user_id;
  if current_role is null then
    insert into public.workspace_members(workspace_id, user_id, role)
    values (invite_row.workspace_id, target_user_id, 'PLAYER');
  end if;

  update public.player_invites
  set redeemed_at = now(), redeemed_by_user_id = target_user_id
  where id = invite_row.id;

  return query select invite_row.workspace_id, new_player_id;
end;
$$;

revoke all on function public.redeem_new_player_invite(uuid, uuid, text)
  from public, authenticated;
grant execute on function public.redeem_new_player_invite(uuid, uuid, text)
  to service_role;

comment on function public.redeem_new_player_invite(uuid, uuid, text) is
  'Consumes an unbound Player invite and atomically creates one registered canonical Player.';
