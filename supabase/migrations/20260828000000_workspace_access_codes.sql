-- Phase 2.5: anonymous hosts join isolated workspaces with short-lived shared
-- access codes. Plaintext codes and their HMAC pepper never enter PostgreSQL.

alter table public.workspaces
  add column access_code_digest text,
  add column updated_at timestamptz not null default now(),
  add constraint workspaces_name_length check (length(trim(name)) between 1 and 80),
  add constraint workspaces_access_code_digest_format check (
    access_code_digest is null
    or access_code_digest ~ '^[0-9a-f]{64}$'
  );

create unique index workspaces_access_code_digest_unique_idx
  on public.workspaces(access_code_digest)
  where access_code_digest is not null;

create or replace function public.set_workspace_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_workspace_updated_at();

-- PostgREST must never return or accept the digest for ordinary clients. RLS
-- still controls which rows are visible; these grants additionally hide the
-- sensitive implementation column from the authenticated role.
revoke select, update on public.workspaces from anon, authenticated;
grant select (id, name, created_at, updated_at)
  on public.workspaces to authenticated;
grant update (name)
  on public.workspaces to authenticated;

-- A deliberately small rate-limit ledger used only by the join Edge Function.
-- There are no client policies, so an authenticated browser cannot inspect or
-- modify its own counters.
create table public.workspace_join_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint workspace_join_attempts_failed_non_negative
    check (failed_attempts >= 0)
);

create index workspace_join_attempts_blocked_until_idx
  on public.workspace_join_attempts(blocked_until)
  where blocked_until is not null;

alter table public.workspace_join_attempts enable row level security;
revoke all on public.workspace_join_attempts from anon, authenticated;

comment on column public.workspaces.access_code_digest is
  'HMAC-SHA-256 digest of the six-digit access code. The secret pepper exists only in Edge Function secrets.';
comment on table public.workspace_join_attempts is
  'Server-only, per-anonymous-user throttling state for workspace-code joins.';
