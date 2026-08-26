-- Hotfix: safe player lifecycle management.

alter table public.players
  add column archived_at timestamptz;

-- The existing exact-case uniqueness constraint is replaced with a
-- workspace-scoped case-insensitive index. Archived players remain unique too:
-- restoring one must not create a duplicate nickname.
alter table public.players
  drop constraint players_workspace_nickname_unique;

create unique index players_workspace_nickname_ci_unique
  on public.players (workspace_id, lower(trim(nickname)));

create index players_workspace_archived_idx
  on public.players (workspace_id, archived_at);

comment on column public.players.archived_at is
  'When set, the player is hidden from new-session selection but retained for history and statistics.';
