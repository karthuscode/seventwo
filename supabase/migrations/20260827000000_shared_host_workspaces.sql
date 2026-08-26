create type public.workspace_role as enum ('OWNER', 'HOST');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint workspaces_name_not_blank check (length(trim(name)) > 0)
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'HOST',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx
  on public.workspace_members(user_id);

-- Preserve and assign any Phase 1 rows to one initial workspace. The shared
-- host membership is intentionally added manually after creating the Auth user.
insert into public.workspaces (name)
select 'SevenTwo'
where not exists (select 1 from public.workspaces);

alter table public.players add column workspace_id uuid;
alter table public.sessions add column workspace_id uuid;
alter table public.session_players add column workspace_id uuid;
alter table public.transactions add column workspace_id uuid;
alter table public.transactions
  add column updated_at timestamptz not null default now();

update public.players
set workspace_id = (select id from public.workspaces order by created_at limit 1)
where workspace_id is null;

update public.sessions
set workspace_id = (select id from public.workspaces order by created_at limit 1)
where workspace_id is null;

update public.session_players sp
set workspace_id = s.workspace_id
from public.sessions s
where sp.session_id = s.id and sp.workspace_id is null;

update public.transactions t
set workspace_id = s.workspace_id
from public.sessions s
where t.session_id = s.id and t.workspace_id is null;

alter table public.players alter column workspace_id set not null;
alter table public.sessions alter column workspace_id set not null;
alter table public.session_players alter column workspace_id set not null;
alter table public.transactions alter column workspace_id set not null;

alter table public.players
  add constraint players_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;
alter table public.sessions
  add constraint sessions_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;
alter table public.session_players
  add constraint session_players_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;
alter table public.transactions
  add constraint transactions_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.players drop constraint players_nickname_unique;
alter table public.players
  add constraint players_workspace_nickname_unique unique (workspace_id, nickname);

alter table public.players
  add constraint players_id_workspace_unique unique (id, workspace_id);
alter table public.sessions
  add constraint sessions_id_workspace_unique unique (id, workspace_id);

alter table public.session_players
  add constraint session_players_session_workspace_fkey
  foreign key (session_id, workspace_id)
  references public.sessions(id, workspace_id) on delete cascade;
alter table public.session_players
  add constraint session_players_player_workspace_fkey
  foreign key (player_id, workspace_id)
  references public.players(id, workspace_id) on delete restrict;
alter table public.transactions
  add constraint transactions_session_workspace_fkey
  foreign key (session_id, workspace_id)
  references public.sessions(id, workspace_id) on delete cascade;
alter table public.transactions
  add constraint transactions_player_workspace_fkey
  foreign key (player_id, workspace_id)
  references public.players(id, workspace_id) on delete restrict;

create index players_workspace_id_idx on public.players(workspace_id);
create index sessions_workspace_date_idx on public.sessions(workspace_id, date desc);
create index session_players_workspace_id_idx on public.session_players(workspace_id);
create index transactions_workspace_id_idx on public.transactions(workspace_id);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.role = 'OWNER'
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_owner(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.transactions enable row level security;

create policy "Members can view their workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

create policy "Owners can update their workspaces"
on public.workspaces for update to authenticated
using (public.is_workspace_owner(id))
with check (public.is_workspace_owner(id));

create policy "Owners can delete their workspaces"
on public.workspaces for delete to authenticated
using (public.is_workspace_owner(id));

create policy "Members can view workspace membership"
on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Owners can add workspace members"
on public.workspace_members for insert to authenticated
with check (public.is_workspace_owner(workspace_id));

create policy "Owners can update workspace members"
on public.workspace_members for update to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

create policy "Owners can remove workspace members"
on public.workspace_members for delete to authenticated
using (public.is_workspace_owner(workspace_id));

create policy "Members can view players"
on public.players for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Members can add players"
on public.players for insert to authenticated
with check (public.is_workspace_member(workspace_id));
create policy "Members can update players"
on public.players for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Members can delete players"
on public.players for delete to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Members can view sessions"
on public.sessions for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Members can add sessions"
on public.sessions for insert to authenticated
with check (public.is_workspace_member(workspace_id));
create policy "Members can update sessions"
on public.sessions for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Members can delete sessions"
on public.sessions for delete to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Members can view session players"
on public.session_players for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Members can add session players"
on public.session_players for insert to authenticated
with check (public.is_workspace_member(workspace_id));
create policy "Members can update session players"
on public.session_players for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Members can delete session players"
on public.session_players for delete to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Members can view transactions"
on public.transactions for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Members can add transactions"
on public.transactions for insert to authenticated
with check (public.is_workspace_member(workspace_id));
create policy "Members can correct transactions"
on public.transactions for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Members can delete transactions"
on public.transactions for delete to authenticated
using (public.is_workspace_member(workspace_id));

create or replace function public.set_transaction_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_transaction_updated_at();

comment on table public.transactions is
  'Buy-in and rebuy ledger. Corrections preserve the row, original creation time, and latest update time.';
