-- Phase 3 polish: prevent cashing out more chips than the session issued.
--
-- A session-row lock serializes cash-outs and transaction inserts that hold a
-- foreign-key lock on the same session. Corrections exclude the row currently
-- being updated, so its previously saved chip count is not double-counted.

create or replace function public.enforce_cash_out_chip_circulation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  total_issued_chips bigint;
  other_cashed_out_chips bigint;
  maximum_cash_out_chips bigint;
begin
  if new.status <> 'CASHED_OUT' then
    return new;
  end if;

  if new.cash_out_chips is null or new.cash_out_chips < 0 then
    raise exception 'Final chips must be a whole number of zero or more.';
  end if;

  perform 1
  from public.sessions session
  where session.id = new.session_id
    and session.workspace_id = new.workspace_id
  for update;

  if not found then
    raise exception 'Session not found for cash-out.';
  end if;

  select coalesce(sum(ledger_transaction.chips), 0)
    into total_issued_chips
  from public.transactions ledger_transaction
  where ledger_transaction.session_id = new.session_id
    and ledger_transaction.workspace_id = new.workspace_id;

  select coalesce(sum(participant.cash_out_chips), 0)
    into other_cashed_out_chips
  from public.session_players participant
  where participant.session_id = new.session_id
    and participant.workspace_id = new.workspace_id
    and participant.id <> new.id
    and participant.status = 'CASHED_OUT';

  maximum_cash_out_chips := greatest(
    total_issued_chips - other_cashed_out_chips,
    0
  );

  if new.cash_out_chips > maximum_cash_out_chips then
    raise exception 'Only % chips remain in circulation.', maximum_cash_out_chips;
  end if;

  return new;
end;
$$;

drop trigger if exists session_players_enforce_chip_circulation
  on public.session_players;
create trigger session_players_enforce_chip_circulation
before insert or update of cash_out_chips, status
on public.session_players
for each row execute function public.enforce_cash_out_chip_circulation();

revoke all on function public.enforce_cash_out_chip_circulation() from public;

comment on function public.enforce_cash_out_chip_circulation() is
  'Rejects cash-outs that exceed chips issued into the session, excluding the participant being corrected.';
