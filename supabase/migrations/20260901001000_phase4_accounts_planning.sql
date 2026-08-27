-- Phase 4: recoverable accounts, linked poker identities, role-aware access,
-- secure player invitations, and poker-night planning.

create type public.plan_status as enum (
  'DRAFT', 'VOTING', 'CONFIRMED', 'SESSION_CREATED', 'CANCELLED'
);
create type public.plan_vote_response as enum (
  'AVAILABLE', 'MAYBE', 'UNAVAILABLE'
);

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_display_name_length
    check (length(trim(display_name)) between 1 and 60)
);

alter table public.players
  add column user_id uuid references auth.users(id) on delete set null;
create unique index players_workspace_registered_user_unique
  on public.players(workspace_id, user_id)
  where user_id is not null;
create index players_user_id_idx on public.players(user_id)
  where user_id is not null;

create table public.event_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  status public.plan_status not null default 'VOTING',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  host_user_id uuid references auth.users(id) on delete set null,
  confirmed_option_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_plans_title_length check (length(trim(title)) between 1 and 80),
  constraint event_plans_id_workspace_unique unique (id, workspace_id)
);

create table public.plan_options (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint plan_options_plan_time_unique unique (plan_id, starts_at),
  constraint plan_options_id_workspace_unique unique (id, workspace_id),
  constraint plan_options_id_plan_workspace_unique unique (id, plan_id, workspace_id),
  constraint plan_options_plan_workspace_fkey
    foreign key (plan_id, workspace_id)
    references public.event_plans(id, workspace_id) on delete cascade
);

alter table public.event_plans
  add constraint event_plans_confirmed_option_fkey
  foreign key (confirmed_option_id) references public.plan_options(id)
  on delete restrict;

create table public.plan_votes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  option_id uuid not null,
  player_id uuid not null,
  response public.plan_vote_response not null,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint plan_votes_option_player_unique unique (option_id, player_id),
  constraint plan_votes_plan_workspace_fkey
    foreign key (plan_id, workspace_id)
    references public.event_plans(id, workspace_id) on delete cascade,
  constraint plan_votes_option_plan_workspace_fkey
    foreign key (option_id, plan_id, workspace_id)
    references public.plan_options(id, plan_id, workspace_id) on delete cascade,
  constraint plan_votes_player_workspace_fkey
    foreign key (player_id, workspace_id)
    references public.players(id, workspace_id) on delete cascade
);

create table public.player_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  player_id uuid not null,
  code_digest text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by_user_id uuid references auth.users(id) on delete set null,
  constraint player_invites_digest_format check (code_digest ~ '^[0-9a-f]{64}$'),
  constraint player_invites_player_workspace_fkey
    foreign key (player_id, workspace_id)
    references public.players(id, workspace_id) on delete cascade,
  constraint player_invites_expiry_after_creation check (expires_at > created_at),
  constraint player_invites_redemption_consistent check (
    (redeemed_at is null and redeemed_by_user_id is null)
    or (redeemed_at is not null and redeemed_by_user_id is not null)
  )
);
create unique index player_invites_code_digest_unique on public.player_invites(code_digest);
create unique index player_invites_one_active_per_player
  on public.player_invites(player_id)
  where redeemed_at is null;

create table public.account_access_transfers (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid not null references auth.users(id) on delete cascade,
  token_digest text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  target_user_id uuid references auth.users(id) on delete set null,
  constraint account_access_transfers_digest_format
    check (token_digest ~ '^[0-9a-f]{64}$'),
  constraint account_access_transfers_expiry check (expires_at > created_at)
);

alter table public.sessions
  add column host_user_id uuid references auth.users(id) on delete set null,
  add column plan_id uuid references public.event_plans(id) on delete set null,
  add column starts_at timestamptz;
alter table public.sessions drop constraint sessions_plan_id_fkey;
alter table public.sessions add constraint sessions_plan_workspace_fkey
  foreign key (plan_id, workspace_id)
  references public.event_plans(id, workspace_id) on delete restrict;
create unique index sessions_plan_id_unique on public.sessions(plan_id)
  where plan_id is not null;
create index sessions_host_user_id_idx on public.sessions(host_user_id)
  where host_user_id is not null;

create index event_plans_workspace_status_created_idx
  on public.event_plans(workspace_id, status, created_at desc);
create index plan_options_plan_starts_idx on public.plan_options(plan_id, starts_at);
create index plan_votes_plan_option_idx on public.plan_votes(plan_id, option_id);
create index plan_votes_player_idx on public.plan_votes(player_id);
create index player_invites_active_expiry_idx on public.player_invites(expires_at)
  where redeemed_at is null;
create index account_access_transfers_expiry_idx
  on public.account_access_transfers(expires_at) where completed_at is null;

create or replace function public.workspace_role_for(target_workspace_id uuid)
returns public.workspace_role
language sql stable security definer set search_path = ''
as $$
  select membership.role
  from public.workspace_members membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = (select auth.uid());
$$;

create or replace function public.is_workspace_operator(target_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.workspace_role_for(target_workspace_id) in ('OWNER', 'HOST'), false);
$$;

create or replace function public.is_linked_player(
  target_workspace_id uuid,
  target_player_id uuid
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.players player
    where player.id = target_player_id
      and player.workspace_id = target_workspace_id
      and player.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_record_plan_vote(
  target_workspace_id uuid,
  target_player_id uuid
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.players player
    where player.id = target_player_id
      and player.workspace_id = target_workspace_id
      and (
        player.user_id = (select auth.uid())
        or (player.user_id is null and public.is_workspace_operator(target_workspace_id))
      )
  );
$$;

create or replace function public.shares_workspace_with(target_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs
      on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = target_user_id
  );
$$;

revoke all on function public.workspace_role_for(uuid) from public;
revoke all on function public.is_workspace_operator(uuid) from public;
revoke all on function public.is_linked_player(uuid, uuid) from public;
revoke all on function public.can_record_plan_vote(uuid, uuid) from public;
revoke all on function public.shares_workspace_with(uuid) from public;
grant execute on function public.workspace_role_for(uuid) to authenticated;
grant execute on function public.is_workspace_operator(uuid) to authenticated;
grant execute on function public.is_linked_player(uuid, uuid) to authenticated;
grant execute on function public.can_record_plan_vote(uuid, uuid) to authenticated;
grant execute on function public.shares_workspace_with(uuid) to authenticated;

create or replace function public.set_phase4_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;
create trigger user_profiles_set_updated_at before update on public.user_profiles
for each row execute function public.set_phase4_updated_at();
create trigger event_plans_set_updated_at before update on public.event_plans
for each row execute function public.set_phase4_updated_at();
create trigger plan_votes_set_updated_at before update on public.plan_votes
for each row execute function public.set_phase4_updated_at();

create or replace function public.ensure_registered_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, true) = false then
    insert into public.user_profiles(user_id, display_name)
    values (
      new.id,
      left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        split_part(coalesce(new.email, 'SevenTwo player'), '@', 1)), 60)
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger auth_user_ensure_registered_profile
after insert or update of is_anonymous, email on auth.users
for each row execute function public.ensure_registered_profile();

insert into public.user_profiles(user_id, display_name)
select
  existing.id,
  left(coalesce(nullif(trim(existing.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(existing.email, 'SevenTwo player'), '@', 1)), 60)
from auth.users existing
where coalesce(existing.is_anonymous, true) = false
on conflict (user_id) do nothing;

create or replace function public.validate_plan_references()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.host_user_id is not null and not exists (
    select 1 from public.workspace_members membership
    where membership.workspace_id = new.workspace_id
      and membership.user_id = new.host_user_id
      and membership.role in ('OWNER', 'HOST')
  ) then raise exception 'Plan host must be a workspace owner or host.'; end if;
  if new.confirmed_option_id is not null and not exists (
    select 1 from public.plan_options option
    where option.id = new.confirmed_option_id
      and option.plan_id = new.id
      and option.workspace_id = new.workspace_id
  ) then raise exception 'Confirmed option must belong to the plan.'; end if;
  return new;
end;
$$;
create trigger event_plans_validate_references before insert or update
on public.event_plans for each row execute function public.validate_plan_references();

create or replace function public.validate_session_host()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.host_user_id is not null and not exists (
    select 1 from public.workspace_members membership
    where membership.workspace_id = new.workspace_id
      and membership.user_id = new.host_user_id
      and membership.role in ('OWNER', 'HOST')
  ) then raise exception 'Session host must be a workspace owner or host.'; end if;
  return new;
end;
$$;
create trigger sessions_validate_host before insert or update of host_user_id
on public.sessions for each row execute function public.validate_session_host();

create or replace function public.protect_workspace_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('seventwo.owner_transfer', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' and old.role = 'OWNER' then
    raise exception 'The workspace owner cannot be removed.';
  end if;
  if tg_op = 'UPDATE' and old.role = 'OWNER' and new.role <> 'OWNER' then
    raise exception 'The workspace owner cannot be downgraded.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger workspace_members_protect_owner before update or delete
on public.workspace_members for each row execute function public.protect_workspace_owner();
create unique index workspace_members_single_owner
  on public.workspace_members(workspace_id) where role = 'OWNER';

alter table public.user_profiles enable row level security;
alter table public.event_plans enable row level security;
alter table public.plan_options enable row level security;
alter table public.plan_votes enable row level security;
alter table public.player_invites enable row level security;
alter table public.account_access_transfers enable row level security;

revoke all on public.player_invites from anon, authenticated;
revoke all on public.account_access_transfers from anon, authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant select, insert, update, delete on public.event_plans to authenticated;
grant select, insert, update, delete on public.plan_options to authenticated;
grant select, insert, update, delete on public.plan_votes to authenticated;

create policy "Users can view shared profiles" on public.user_profiles
for select to authenticated using (
  user_id = (select auth.uid()) or public.shares_workspace_with(user_id)
);
create policy "Registered users create their profile" on public.user_profiles
for insert to authenticated with check (
  user_id = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), true) = false
);
create policy "Users update their profile" on public.user_profiles
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Replace Phase 2's broad member-write policies with role-aware policies.
drop policy if exists "Members can view players" on public.players;
create policy "Operators and linked users view players" on public.players
for select to authenticated using (
  public.is_workspace_operator(workspace_id)
  or user_id = (select auth.uid())
);
drop policy if exists "Members can add players" on public.players;
drop policy if exists "Members can update players" on public.players;
drop policy if exists "Members can delete players" on public.players;
create policy "Operators can add players" on public.players for insert to authenticated
with check (public.is_workspace_operator(workspace_id) and user_id is null);
create policy "Operators can update players" on public.players for update to authenticated
using (public.is_workspace_operator(workspace_id))
with check (public.is_workspace_operator(workspace_id));
create policy "Operators can delete players" on public.players for delete to authenticated
using (public.is_workspace_operator(workspace_id));

drop policy if exists "Members can view sessions" on public.sessions;
drop policy if exists "Members can add sessions" on public.sessions;
drop policy if exists "Members can update sessions" on public.sessions;
drop policy if exists "Members can delete sessions" on public.sessions;
create policy "Operators and participants view sessions" on public.sessions
for select to authenticated using (
  public.is_workspace_operator(workspace_id) or exists (
    select 1 from public.session_players participant
    join public.players player on player.id = participant.player_id
    where participant.session_id = sessions.id
      and participant.workspace_id = sessions.workspace_id
      and player.user_id = (select auth.uid())
  )
);
create policy "Operators add sessions" on public.sessions for insert to authenticated
with check (public.is_workspace_operator(workspace_id));
create policy "Operators update sessions" on public.sessions for update to authenticated
using (public.is_workspace_operator(workspace_id))
with check (public.is_workspace_operator(workspace_id));
create policy "Operators delete sessions" on public.sessions for delete to authenticated
using (public.is_workspace_operator(workspace_id));

drop policy if exists "Members can view session players" on public.session_players;
drop policy if exists "Members can add session players" on public.session_players;
drop policy if exists "Members can update session players" on public.session_players;
drop policy if exists "Members can delete session players" on public.session_players;
create policy "Operators and linked players view session players" on public.session_players
for select to authenticated using (
  public.is_workspace_operator(workspace_id)
  or public.is_linked_player(workspace_id, player_id)
);
create policy "Operators add session players" on public.session_players for insert to authenticated
with check (public.is_workspace_operator(workspace_id));
create policy "Operators update session players" on public.session_players for update to authenticated
using (public.is_workspace_operator(workspace_id))
with check (public.is_workspace_operator(workspace_id));
create policy "Operators delete session players" on public.session_players for delete to authenticated
using (public.is_workspace_operator(workspace_id));

drop policy if exists "Members can view transactions" on public.transactions;
drop policy if exists "Members can add transactions" on public.transactions;
drop policy if exists "Members can correct transactions" on public.transactions;
drop policy if exists "Members can delete transactions" on public.transactions;
create policy "Operators and linked players view transactions" on public.transactions
for select to authenticated using (
  public.is_workspace_operator(workspace_id)
  or public.is_linked_player(workspace_id, player_id)
);
create policy "Operators add transactions" on public.transactions for insert to authenticated
with check (public.is_workspace_operator(workspace_id));
create policy "Operators correct transactions" on public.transactions for update to authenticated
using (public.is_workspace_operator(workspace_id))
with check (public.is_workspace_operator(workspace_id));
create policy "Operators delete transactions" on public.transactions for delete to authenticated
using (public.is_workspace_operator(workspace_id));

drop policy if exists "Members can view payout allocations" on public.payout_allocations;
drop policy if exists "Members can add payout allocations" on public.payout_allocations;
drop policy if exists "Members can update payout allocations" on public.payout_allocations;
drop policy if exists "Members can delete payout allocations" on public.payout_allocations;
create policy "Operators and linked players view payouts" on public.payout_allocations
for select to authenticated using (
  public.is_workspace_operator(workspace_id) or exists (
    select 1 from public.session_players participant
    where participant.id = payout_allocations.session_player_id
      and public.is_linked_player(workspace_id, participant.player_id)
  )
);
create policy "Operators add payouts" on public.payout_allocations for insert to authenticated
with check (public.is_workspace_operator(workspace_id));
create policy "Operators update payouts" on public.payout_allocations for update to authenticated
using (public.is_workspace_operator(workspace_id)) with check (public.is_workspace_operator(workspace_id));
create policy "Operators delete payouts" on public.payout_allocations for delete to authenticated
using (public.is_workspace_operator(workspace_id));

drop policy if exists "Members can view payment offsets" on public.payment_offsets;
drop policy if exists "Members can add payment offsets" on public.payment_offsets;
drop policy if exists "Members can update payment offsets" on public.payment_offsets;
drop policy if exists "Members can delete payment offsets" on public.payment_offsets;
create policy "Operators and linked players view offsets" on public.payment_offsets
for select to authenticated using (
  public.is_workspace_operator(workspace_id) or exists (
    select 1 from public.session_players participant
    where participant.id = payment_offsets.session_player_id
      and public.is_linked_player(workspace_id, participant.player_id)
  )
);
create policy "Operators add offsets" on public.payment_offsets for insert to authenticated
with check (public.is_workspace_operator(workspace_id));
create policy "Operators update offsets" on public.payment_offsets for update to authenticated
using (public.is_workspace_operator(workspace_id)) with check (public.is_workspace_operator(workspace_id));
create policy "Operators delete offsets" on public.payment_offsets for delete to authenticated
using (public.is_workspace_operator(workspace_id));

create policy "Members view plans" on public.event_plans for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Operators add plans" on public.event_plans for insert to authenticated
with check (public.is_workspace_operator(workspace_id));
create policy "Operators update plans" on public.event_plans for update to authenticated
using (public.is_workspace_operator(workspace_id)) with check (public.is_workspace_operator(workspace_id));
create policy "Operators delete plans" on public.event_plans for delete to authenticated
using (public.is_workspace_operator(workspace_id));

create policy "Members view plan options" on public.plan_options for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Operators add plan options" on public.plan_options for insert to authenticated
with check (public.is_workspace_operator(workspace_id));
create policy "Operators update plan options" on public.plan_options for update to authenticated
using (public.is_workspace_operator(workspace_id)) with check (public.is_workspace_operator(workspace_id));
create policy "Operators delete plan options" on public.plan_options for delete to authenticated
using (public.is_workspace_operator(workspace_id));

create policy "Members view plan votes" on public.plan_votes for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Authorized players record plan votes" on public.plan_votes for insert to authenticated
with check (
  public.is_workspace_member(workspace_id)
  and public.can_record_plan_vote(workspace_id, player_id)
  and recorded_by_user_id = (select auth.uid())
);
create policy "Authorized players update plan votes" on public.plan_votes for update to authenticated
using (public.can_record_plan_vote(workspace_id, player_id))
with check (
  public.can_record_plan_vote(workspace_id, player_id)
  and recorded_by_user_id = (select auth.uid())
);
create policy "Authorized players delete plan votes" on public.plan_votes for delete to authenticated
using (public.can_record_plan_vote(workspace_id, player_id));

create or replace function public.redeem_player_invite(
  target_invite_id uuid,
  target_user_id uuid
) returns table(workspace_id uuid, player_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare invite_row public.player_invites%rowtype; player_user uuid; current_role public.workspace_role;
begin
  select * into invite_row from public.player_invites
  where id = target_invite_id for update;
  if not found or invite_row.redeemed_at is not null or invite_row.expires_at <= now() then
    raise exception 'Invite is invalid or expired.';
  end if;
  select user_id into player_user from public.players
  where id = invite_row.player_id and workspace_id = invite_row.workspace_id for update;
  if player_user is not null and player_user <> target_user_id then
    raise exception 'Invite is invalid or expired.';
  end if;
  if exists (
    select 1 from public.players
    where workspace_id = invite_row.workspace_id
      and user_id = target_user_id and id <> invite_row.player_id
  ) then raise exception 'This account already has a player in the workspace.'; end if;
  update public.players set user_id = target_user_id
  where id = invite_row.player_id and workspace_id = invite_row.workspace_id;
  select role into current_role from public.workspace_members
  where workspace_id = invite_row.workspace_id and user_id = target_user_id;
  if current_role is null then
    insert into public.workspace_members(workspace_id, user_id, role)
    values (invite_row.workspace_id, target_user_id, 'PLAYER');
  end if;
  update public.player_invites set redeemed_at = now(), redeemed_by_user_id = target_user_id
  where id = invite_row.id;
  return query select invite_row.workspace_id, invite_row.player_id;
end;
$$;
revoke all on function public.redeem_player_invite(uuid, uuid) from public, authenticated;
grant execute on function public.redeem_player_invite(uuid, uuid) to service_role;

create or replace function public.complete_anonymous_access_transfer(
  target_transfer_id uuid,
  destination_user_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare transfer_row public.account_access_transfers%rowtype; membership record; destination_role public.workspace_role;
begin
  select * into transfer_row from public.account_access_transfers
  where id = target_transfer_id for update;
  if not found or transfer_row.completed_at is not null or transfer_row.expires_at <= now()
    or transfer_row.source_user_id = destination_user_id then
    raise exception 'Access transfer is invalid or expired.';
  end if;
  if exists (
    select 1 from public.players source_player
    join public.players destination_player
      on destination_player.workspace_id = source_player.workspace_id
    where source_player.user_id = transfer_row.source_user_id
      and destination_player.user_id = destination_user_id
  ) then raise exception 'Player identity conflict requires manual review.'; end if;
  update public.players set user_id = destination_user_id
  where user_id = transfer_row.source_user_id;
  perform set_config('seventwo.owner_transfer', 'on', true);
  for membership in select * from public.workspace_members
    where user_id = transfer_row.source_user_id for update
  loop
    select role into destination_role from public.workspace_members
    where workspace_id = membership.workspace_id and user_id = destination_user_id;
    delete from public.workspace_members
    where workspace_id = membership.workspace_id and user_id = transfer_row.source_user_id;
    insert into public.workspace_members(workspace_id, user_id, role)
    values (
      membership.workspace_id,
      destination_user_id,
      case
        when membership.role = 'OWNER' or destination_role = 'OWNER' then 'OWNER'::public.workspace_role
        when membership.role = 'HOST' or destination_role = 'HOST' then 'HOST'::public.workspace_role
        else 'PLAYER'::public.workspace_role
      end
    )
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  end loop;
  update public.account_access_transfers
  set completed_at = now(), target_user_id = destination_user_id
  where id = transfer_row.id;
end;
$$;
revoke all on function public.complete_anonymous_access_transfer(uuid, uuid) from public, authenticated;
grant execute on function public.complete_anonymous_access_transfer(uuid, uuid) to service_role;

create or replace function public.create_session_from_plan(
  target_workspace_id uuid,
  target_plan_id uuid,
  session_row jsonb,
  participant_rows jsonb,
  transaction_rows jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  plan_row public.event_plans%rowtype;
  new_session_id uuid;
  confirmed_starts_at timestamptz;
begin
  if not public.is_workspace_operator(target_workspace_id) then
    raise exception 'Workspace host access is required.';
  end if;
  select * into plan_row from public.event_plans
  where id = target_plan_id and workspace_id = target_workspace_id for update;
  if not found or plan_row.status <> 'CONFIRMED' or plan_row.confirmed_option_id is null then
    raise exception 'A confirmed plan is required.';
  end if;
  if exists (select 1 from public.sessions where plan_id = target_plan_id) then
    raise exception 'This plan already has a session.';
  end if;
  select starts_at into confirmed_starts_at from public.plan_options
  where id = plan_row.confirmed_option_id and plan_id = plan_row.id;
  new_session_id := (session_row ->> 'id')::uuid;
  insert into public.sessions(
    id, workspace_id, name, date, status, buy_in_amount, chips_per_buy_in,
    currency, created_at, finished_at, host_user_id, plan_id, starts_at
  ) values (
    new_session_id, target_workspace_id, trim(session_row ->> 'name'),
    (session_row ->> 'date')::date, 'ACTIVE',
    (session_row ->> 'buyInAmount')::numeric,
    (session_row ->> 'chipsPerBuyIn')::integer, 'RON',
    (session_row ->> 'createdAt')::timestamptz, null,
    plan_row.host_user_id, target_plan_id, confirmed_starts_at
  );
  insert into public.session_players(
    id, workspace_id, session_id, player_id, joined_at, status
  ) select
    (item ->> 'id')::uuid, target_workspace_id, new_session_id,
    (item ->> 'playerId')::uuid, (item ->> 'joinedAt')::timestamptz, 'ACTIVE'
  from jsonb_array_elements(participant_rows) item;
  insert into public.transactions(
    id, workspace_id, session_id, player_id, type, amount, chips,
    payment_method, payment_status, created_at, updated_at
  ) select
    (item ->> 'id')::uuid, target_workspace_id, new_session_id,
    (item ->> 'playerId')::uuid, 'BUY_IN',
    (item ->> 'amount')::numeric, (item ->> 'chips')::integer,
    (item ->> 'paymentMethod')::public.payment_method,
    (item ->> 'paymentStatus')::public.payment_status,
    (item ->> 'createdAt')::timestamptz, (item ->> 'updatedAt')::timestamptz
  from jsonb_array_elements(transaction_rows) item;
  update public.event_plans set status = 'SESSION_CREATED'
  where id = target_plan_id and workspace_id = target_workspace_id;
end;
$$;
revoke all on function public.create_session_from_plan(uuid, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_session_from_plan(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;

comment on table public.player_invites is
  'Server-only, single-use invitations linking a registered auth user to one canonical poker player.';
comment on table public.plan_votes is
  'Player-identity availability responses. registered users vote for themselves; operators may proxy guests.';
