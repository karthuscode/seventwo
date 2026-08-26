-- Phase 3: cash-outs, pending-payment offsets, and payout allocations.

alter table public.session_players
  add column cashed_out_at timestamptz;

alter table public.session_players
  add constraint session_players_id_workspace_unique unique (id, workspace_id);
alter table public.transactions
  add constraint transactions_id_workspace_unique unique (id, workspace_id);

create table public.payout_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid not null,
  session_player_id uuid not null,
  payment_method public.payment_method not null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_allocations_amount_positive check (amount > 0),
  constraint payout_allocations_method_unique
    unique (session_player_id, payment_method),
  constraint payout_allocations_workspace_fkey
    foreign key (workspace_id) references public.workspaces(id) on delete cascade,
  constraint payout_allocations_session_workspace_fkey
    foreign key (session_id, workspace_id)
    references public.sessions(id, workspace_id) on delete cascade,
  constraint payout_allocations_player_workspace_fkey
    foreign key (session_player_id, workspace_id)
    references public.session_players(id, workspace_id) on delete cascade
);

create table public.payment_offsets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid not null,
  session_player_id uuid not null,
  transaction_id uuid not null,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_offsets_amount_positive check (amount > 0),
  constraint payment_offsets_transaction_unique unique (transaction_id),
  constraint payment_offsets_workspace_fkey
    foreign key (workspace_id) references public.workspaces(id) on delete cascade,
  constraint payment_offsets_session_workspace_fkey
    foreign key (session_id, workspace_id)
    references public.sessions(id, workspace_id) on delete cascade,
  constraint payment_offsets_player_workspace_fkey
    foreign key (session_player_id, workspace_id)
    references public.session_players(id, workspace_id) on delete cascade,
  constraint payment_offsets_transaction_workspace_fkey
    foreign key (transaction_id, workspace_id)
    references public.transactions(id, workspace_id) on delete cascade
);

create index payout_allocations_workspace_session_idx
  on public.payout_allocations(workspace_id, session_id);
create index payment_offsets_workspace_session_idx
  on public.payment_offsets(workspace_id, session_id);
create index payment_offsets_session_player_idx
  on public.payment_offsets(session_player_id);

alter table public.payout_allocations enable row level security;
alter table public.payment_offsets enable row level security;

create policy "Members can view payout allocations"
on public.payout_allocations for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Members can add payout allocations"
on public.payout_allocations for insert to authenticated
with check (public.is_workspace_member(workspace_id));
create policy "Members can update payout allocations"
on public.payout_allocations for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Members can delete payout allocations"
on public.payout_allocations for delete to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Members can view payment offsets"
on public.payment_offsets for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Members can add payment offsets"
on public.payment_offsets for insert to authenticated
with check (public.is_workspace_member(workspace_id));
create policy "Members can update payment offsets"
on public.payment_offsets for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
create policy "Members can delete payment offsets"
on public.payment_offsets for delete to authenticated
using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.payout_allocations to authenticated;
grant select, insert, update, delete on public.payment_offsets to authenticated;

create trigger payout_allocations_set_updated_at
before update on public.payout_allocations
for each row execute function public.set_transaction_updated_at();

create trigger payment_offsets_set_updated_at
before update on public.payment_offsets
for each row execute function public.set_transaction_updated_at();

create or replace function public.save_session_player_cash_out(
  target_workspace_id uuid,
  target_session_player_id uuid,
  final_chips integer,
  gross_cash_out numeric,
  cash_out_time timestamptz,
  payout_rows jsonb,
  offset_rows jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_session_id uuid;
  target_player_id uuid;
  target_buy_in_amount numeric(12, 2);
  target_chips_per_buy_in integer;
  payout_total numeric(12, 2);
  offset_total numeric(12, 2);
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace membership is required.';
  end if;

  select
    participant.session_id,
    participant.player_id,
    session.buy_in_amount,
    session.chips_per_buy_in
    into
      target_session_id,
      target_player_id,
      target_buy_in_amount,
      target_chips_per_buy_in
  from public.session_players participant
  join public.sessions session on session.id = participant.session_id
    and session.workspace_id = participant.workspace_id
  where participant.id = target_session_player_id
    and participant.workspace_id = target_workspace_id
    and session.status = 'ACTIVE';

  if not found then
    raise exception 'Cash-out requires an active session participant.';
  end if;
  if cash_out_time is null then
    raise exception 'Cash-out time is required.';
  end if;
  if final_chips < 0 or gross_cash_out < 0 then
    raise exception 'Cash-out values cannot be negative.';
  end if;
  if gross_cash_out <> round(
    final_chips * target_buy_in_amount / target_chips_per_buy_in,
    2
  ) then
    raise exception 'Gross cash-out does not match the session chip conversion.';
  end if;

  select coalesce(sum((payout_item.value ->> 'amount')::numeric), 0)
    into payout_total
  from jsonb_array_elements(coalesce(payout_rows, '[]'::jsonb))
    as payout_item(value);
  select coalesce(sum((offset_item.value ->> 'amount')::numeric), 0)
    into offset_total
  from jsonb_array_elements(coalesce(offset_rows, '[]'::jsonb))
    as offset_item(value);

  if offset_total > gross_cash_out then
    raise exception 'Pending offsets cannot exceed the gross cash-out.';
  end if;
  if payout_total <> gross_cash_out - offset_total then
    raise exception 'Payout allocations must equal the net payout.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(offset_rows, '[]'::jsonb))
      as offset_item(value)
    left join public.transactions ledger_transaction
      on ledger_transaction.id = (offset_item.value ->> 'transactionId')::uuid
      and ledger_transaction.workspace_id = target_workspace_id
      and ledger_transaction.session_id = target_session_id
      and ledger_transaction.player_id = target_player_id
    where ledger_transaction.id is null
      or (offset_item.value ->> 'amount')::numeric <= 0
      or (offset_item.value ->> 'amount')::numeric > ledger_transaction.amount
      or (
        ledger_transaction.payment_status <> 'PENDING'
        and not exists (
          select 1
          from public.payment_offsets existing_offset
          where existing_offset.transaction_id = ledger_transaction.id
            and existing_offset.session_player_id = target_session_player_id
            and existing_offset.workspace_id = target_workspace_id
        )
      )
  ) then
    raise exception 'A pending offset does not match this participant ledger.';
  end if;

  update public.session_players
  set cash_out_chips = final_chips,
      cash_out_amount = gross_cash_out,
      cashed_out_at = cash_out_time,
      status = 'CASHED_OUT'
  where id = target_session_player_id
    and workspace_id = target_workspace_id;

  delete from public.payout_allocations
  where session_player_id = target_session_player_id
    and workspace_id = target_workspace_id;
  delete from public.payment_offsets
  where session_player_id = target_session_player_id
    and workspace_id = target_workspace_id;

  insert into public.payout_allocations (
    id, workspace_id, session_id, session_player_id, payment_method,
    amount, created_at, updated_at
  )
  select
    (payout_item.value ->> 'id')::uuid,
    target_workspace_id,
    target_session_id,
    target_session_player_id,
    (payout_item.value ->> 'paymentMethod')::public.payment_method,
    (payout_item.value ->> 'amount')::numeric,
    (payout_item.value ->> 'createdAt')::timestamptz,
    (payout_item.value ->> 'updatedAt')::timestamptz
  from jsonb_array_elements(coalesce(payout_rows, '[]'::jsonb))
    as payout_item(value);

  insert into public.payment_offsets (
    id, workspace_id, session_id, session_player_id, transaction_id,
    amount, created_at, updated_at
  )
  select
    (offset_item.value ->> 'id')::uuid,
    target_workspace_id,
    target_session_id,
    target_session_player_id,
    (offset_item.value ->> 'transactionId')::uuid,
    (offset_item.value ->> 'amount')::numeric,
    (offset_item.value ->> 'createdAt')::timestamptz,
    (offset_item.value ->> 'updatedAt')::timestamptz
  from jsonb_array_elements(coalesce(offset_rows, '[]'::jsonb))
    as offset_item(value);
end;
$$;

revoke all on function public.save_session_player_cash_out(
  uuid, uuid, integer, numeric, timestamptz, jsonb, jsonb
) from public;
grant execute on function public.save_session_player_cash_out(
  uuid, uuid, integer, numeric, timestamptz, jsonb, jsonb
) to authenticated;

comment on table public.payment_offsets is
  'Amounts from pending buy-in transactions settled by reducing a player cash-out. Original transaction rows remain unchanged.';
comment on table public.payout_allocations is
  'Actual net cash-out payments split by Cash, Card, or Other.';
