-- Phase 5.2: registered-member Plan discussion with Realtime delivery and
-- server-side lifecycle cleanup.

create table public.plan_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  plan_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint plan_messages_plan_workspace_fkey
    foreign key (plan_id, workspace_id)
    references public.event_plans(id, workspace_id) on delete cascade,
  constraint plan_messages_body_length
    check (length(body) between 1 and 500)
);

create index plan_messages_plan_created_idx
  on public.plan_messages(plan_id, created_at, id);
create index plan_messages_user_idx
  on public.plan_messages(user_id);

create or replace function public.prepare_plan_message()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.body := trim(new.body);
  new.created_at := now();
  return new;
end;
$$;

create trigger plan_messages_prepare
before insert on public.plan_messages
for each row execute function public.prepare_plan_message();

create or replace function public.can_use_plan_discussion(
  target_workspace_id uuid
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1
      from public.workspace_members membership
      where membership.workspace_id = target_workspace_id
        and membership.user_id = (select auth.uid())
    );
$$;

revoke all on function public.can_use_plan_discussion(uuid) from public;
grant execute on function public.can_use_plan_discussion(uuid) to authenticated;

alter table public.plan_messages enable row level security;
revoke all on public.plan_messages from public, anon, authenticated;
grant select, insert, delete on public.plan_messages to authenticated;

create policy "Registered members view Plan discussion"
on public.plan_messages for select to authenticated
using (public.can_use_plan_discussion(workspace_id));

create policy "Registered members post Plan messages"
on public.plan_messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.can_use_plan_discussion(workspace_id)
);

create policy "Authors delete their Plan messages"
on public.plan_messages for delete to authenticated
using (
  user_id = (select auth.uid())
  and public.can_use_plan_discussion(workspace_id)
);

alter table public.plan_messages replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.plan_messages;
exception when duplicate_object then null;
end;
$$;

create or replace function public.cleanup_expired_plan_messages(
  target_now timestamptz default now()
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare deleted_count integer;
begin
  delete from public.plan_messages message
  using public.event_plans plan
  where plan.id = message.plan_id
    and plan.workspace_id = message.workspace_id
    and (
      plan.status = 'CANCELLED'
      or (
        plan.confirmed_option_id is not null
        and plan.status in ('CONFIRMED', 'SESSION_CREATED')
        and exists (
          select 1
          from public.plan_options option
          where option.id = plan.confirmed_option_id
            and option.plan_id = plan.id
            and option.starts_at + interval '24 hours' <= target_now
        )
      )
      or (
        plan.confirmed_option_id is null
        and plan.status in ('DRAFT', 'VOTING')
        and (
          select max(option.starts_at)
          from public.plan_options option
          where option.plan_id = plan.id
        ) + interval '24 hours' <= target_now
      )
    );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_plan_messages(timestamptz)
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_plan_messages(timestamptz)
  to service_role;

do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'seventwo-plan-message-cleanup'
  ) then
    perform cron.unschedule('seventwo-plan-message-cleanup');
  end if;
  perform cron.schedule(
    'seventwo-plan-message-cleanup',
    '17 * * * *',
    'select public.cleanup_expired_plan_messages();'
  );
end;
$$;

notify pgrst, 'reload schema';
