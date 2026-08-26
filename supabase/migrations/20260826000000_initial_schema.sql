create extension if not exists pgcrypto;

create type public.session_status as enum ('ACTIVE', 'FINISHED');
create type public.session_player_status as enum ('ACTIVE', 'CASHED_OUT');
create type public.transaction_type as enum ('BUY_IN', 'REBUY');
create type public.payment_method as enum ('CASH', 'CARD', 'OTHER');
create type public.payment_status as enum ('RECEIVED', 'PENDING');

create table public.players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  created_at timestamptz not null default now(),
  constraint players_nickname_not_blank check (length(trim(nickname)) > 0),
  constraint players_nickname_unique unique (nickname)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  status public.session_status not null default 'ACTIVE',
  buy_in_amount numeric(12, 2) not null,
  chips_per_buy_in integer not null,
  currency text not null default 'RON',
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint sessions_name_not_blank check (length(trim(name)) > 0),
  constraint sessions_buy_in_positive check (buy_in_amount > 0),
  constraint sessions_chips_positive check (chips_per_buy_in > 0),
  constraint sessions_currency_supported check (currency = 'RON'),
  constraint sessions_finished_at_consistent check (
    (status = 'ACTIVE' and finished_at is null)
    or (status = 'FINISHED' and finished_at is not null)
  )
);

create table public.session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  joined_at timestamptz not null default now(),
  cash_out_chips integer,
  cash_out_amount numeric(12, 2),
  status public.session_player_status not null default 'ACTIVE',
  constraint session_players_unique_player unique (session_id, player_id),
  constraint session_players_cash_out_chips_non_negative check (
    cash_out_chips is null or cash_out_chips >= 0
  ),
  constraint session_players_cash_out_amount_non_negative check (
    cash_out_amount is null or cash_out_amount >= 0
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  type public.transaction_type not null,
  amount numeric(12, 2) not null,
  chips integer not null,
  payment_method public.payment_method not null,
  payment_status public.payment_status not null,
  created_at timestamptz not null default now(),
  constraint transactions_amount_positive check (amount > 0),
  constraint transactions_chips_positive check (chips > 0)
);

create index session_players_session_id_idx
  on public.session_players(session_id);
create index session_players_player_id_idx
  on public.session_players(player_id);
create index transactions_session_id_created_at_idx
  on public.transactions(session_id, created_at);
create index transactions_player_id_idx
  on public.transactions(player_id);
create index transactions_pending_idx
  on public.transactions(session_id)
  where payment_status = 'PENDING';

comment on table public.transactions is
  'Immutable buy-in and rebuy ledger. Pending payments still count toward committed buy-ins.';

-- Authentication and row-level security are intentionally deferred. Enable RLS
-- and add policies before exposing these tables to a public or multi-user client.
