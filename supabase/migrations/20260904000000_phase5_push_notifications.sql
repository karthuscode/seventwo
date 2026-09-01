-- Phase 5.1: standards-based Web Push subscriptions, preferences, durable
-- notification events, and a Supabase Cron dispatcher.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.workspaces
  add column timezone text not null default 'Europe/Bucharest';

create type public.notification_category as enum (
  'POLLS', 'REMINDERS', 'SESSION_UPDATES'
);
create type public.notification_event_type as enum (
  'NEW_POLL', 'MILESTONE_3', 'MILESTONE_6',
  'DAILY_REMINDER', 'THREE_HOUR_REMINDER', 'PLAN_CONFIRMED'
);
create type public.notification_event_status as enum (
  'PENDING', 'PROCESSING', 'SENT', 'CANCELLED', 'FAILED'
);
create type public.notification_delivery_status as enum (
  'PENDING', 'PROCESSING', 'SENT', 'INVALID', 'FAILED'
);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  polls_enabled boolean not null default true,
  reminders_enabled boolean not null default true,
  session_updates_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  disabled_at timestamptz,
  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://'),
  constraint push_subscriptions_keys_present check (
    length(p256dh) between 16 and 512 and length(auth) between 8 and 256
  )
);
create index push_subscriptions_active_user_idx
  on public.push_subscriptions(user_id) where disabled_at is null;

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category public.notification_category not null,
  event_type public.notification_event_type not null,
  plan_id uuid not null references public.event_plans(id) on delete cascade,
  option_id uuid references public.plan_options(id) on delete cascade,
  logical_key text not null unique,
  title text not null,
  body text not null,
  destination text not null,
  status public.notification_event_status not null default 'PENDING',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint notification_events_attempts_nonnegative check (attempts >= 0),
  constraint notification_events_title_length check (length(title) between 1 and 120),
  constraint notification_events_body_length check (length(body) between 1 and 240),
  constraint notification_events_safe_destination check (
    destination ~ '^/plans/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
);
create index notification_events_due_idx
  on public.notification_events(status, available_at, created_at)
  where status = 'PENDING';
create index notification_events_user_idx
  on public.notification_events(user_id, created_at desc);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status public.notification_delivery_status not null default 'PENDING',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_event_subscription_unique
    unique (event_id, subscription_id),
  constraint notification_deliveries_attempts_nonnegative check (attempts >= 0)
);
create index notification_deliveries_due_idx
  on public.notification_deliveries(status, available_at)
  where status = 'PENDING';

create table public.notification_dispatch_config (
  singleton boolean primary key default true check (singleton),
  project_url text not null,
  dispatch_secret text not null,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_dispatch_config enable row level security;

grant select, insert, update on public.notification_preferences to authenticated;
grant select, delete on public.push_subscriptions to authenticated;
revoke all on public.notification_events from public, anon, authenticated;
revoke all on public.notification_deliveries from public, anon, authenticated;
revoke all on public.notification_dispatch_config from public, anon, authenticated;

create policy "Users view notification preferences"
on public.notification_preferences for select to authenticated
using (user_id = (select auth.uid()));
create policy "Users create notification preferences"
on public.notification_preferences for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Users update notification preferences"
on public.notification_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users view their push subscriptions"
on public.push_subscriptions for select to authenticated
using (user_id = (select auth.uid()));
create policy "Users delete their push subscriptions"
on public.push_subscriptions for delete to authenticated
using (user_id = (select auth.uid()));

create or replace function public.set_notification_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences for each row
execute function public.set_notification_updated_at();
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions for each row
execute function public.set_notification_updated_at();
create trigger notification_deliveries_set_updated_at
before update on public.notification_deliveries for each row
execute function public.set_notification_updated_at();

create or replace function public.is_registered_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members membership
    join public.players player
      on player.workspace_id = membership.workspace_id
      and player.user_id = membership.user_id
    join auth.users account on account.id = membership.user_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = target_user_id
      and coalesce(account.is_anonymous, true) = false
  );
$$;

create or replace function public.registered_workspace_recipients(
  target_workspace_id uuid
) returns table(user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select distinct membership.user_id
  from public.workspace_members membership
  join public.players player
    on player.workspace_id = membership.workspace_id
    and player.user_id = membership.user_id
  join auth.users account on account.id = membership.user_id
  where membership.workspace_id = target_workspace_id
    and coalesce(account.is_anonymous, true) = false;
$$;

create or replace function public.notification_category_enabled(
  target_user_id uuid,
  target_category public.notification_category
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case target_category
    when 'POLLS' then coalesce(preference.polls_enabled, true)
    when 'REMINDERS' then coalesce(preference.reminders_enabled, true)
    when 'SESSION_UPDATES' then coalesce(preference.session_updates_enabled, true)
  end
  from (select 1) seed
  left join public.notification_preferences preference
    on preference.user_id = target_user_id;
$$;

create or replace function public.enqueue_notification(
  target_workspace_id uuid,
  target_user_id uuid,
  target_category public.notification_category,
  target_event_type public.notification_event_type,
  target_plan_id uuid,
  target_option_id uuid,
  target_logical_key text,
  target_title text,
  target_body text,
  target_destination text,
  target_available_at timestamptz default now()
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare inserted_count integer;
begin
  if not public.is_registered_workspace_member(target_workspace_id, target_user_id)
    or not public.notification_category_enabled(target_user_id, target_category)
  then return false; end if;

  insert into public.notification_events(
    workspace_id, user_id, category, event_type, plan_id, option_id,
    logical_key, title, body, destination, available_at
  ) values (
    target_workspace_id, target_user_id, target_category, target_event_type,
    target_plan_id, target_option_id, target_logical_key, left(target_title, 120),
    left(target_body, 240), target_destination, target_available_at
  ) on conflict (logical_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

create or replace function public.format_plan_option_time(target_option_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select to_char(
    option.starts_at at time zone workspace.timezone,
    'FMDay "at" HH24:MI'
  )
  from public.plan_options option
  join public.workspaces workspace on workspace.id = option.workspace_id
  where option.id = target_option_id;
$$;

create or replace function public.enqueue_new_poll_notifications()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare plan_row public.event_plans%rowtype; recipient record;
begin
  select * into plan_row from public.event_plans where id = new.plan_id;
  if plan_row.status <> 'VOTING' then return new; end if;
  for recipient in
    select * from public.registered_workspace_recipients(new.workspace_id)
    where user_id <> plan_row.created_by_user_id
  loop
    perform public.enqueue_notification(
      new.workspace_id, recipient.user_id, 'POLLS', 'NEW_POLL', new.plan_id,
      null, 'new_poll:' || new.plan_id || ':' || recipient.user_id,
      'New poker poll', 'Vote for the next poker night.',
      '/plans/' || new.plan_id
    );
  end loop;
  return new;
end;
$$;
create trigger plan_options_enqueue_new_poll
after insert on public.plan_options for each row
execute function public.enqueue_new_poll_notifications();

create or replace function public.enqueue_plan_milestone_notifications()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare available_count integer; recipient record; milestone integer; option_time text;
begin
  if new.response <> 'AVAILABLE' then return new; end if;
  select count(*) into available_count
  from public.plan_votes vote
  where vote.option_id = new.option_id and vote.response = 'AVAILABLE';
  option_time := public.format_plan_option_time(new.option_id);

  foreach milestone in array array[3, 6]
  loop
    if available_count >= milestone then
      for recipient in
        select * from public.registered_workspace_recipients(new.workspace_id)
      loop
        perform public.enqueue_notification(
          new.workspace_id, recipient.user_id, 'POLLS',
          case when milestone = 3 then 'MILESTONE_3'::public.notification_event_type
               else 'MILESTONE_6'::public.notification_event_type end,
          new.plan_id, new.option_id,
          'milestone:' || new.option_id || ':' || milestone || ':' || recipient.user_id,
          case when milestone = 3 then 'Poker night is playable' else 'Good table' end,
          milestone || ' players are available for ' || option_time || '.',
          '/plans/' || new.plan_id
        );
      end loop;
    end if;
  end loop;
  return new;
end;
$$;
create trigger plan_votes_enqueue_milestones
after insert or update of response on public.plan_votes for each row
execute function public.enqueue_plan_milestone_notifications();

create or replace function public.enqueue_plan_confirmed_notifications()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare recipient record; option_time text;
begin
  if new.confirmed_option_id is null
    or new.status not in ('CONFIRMED', 'SESSION_CREATED')
    or (old.confirmed_option_id is not distinct from new.confirmed_option_id
      and old.status in ('CONFIRMED', 'SESSION_CREATED'))
  then return new; end if;

  option_time := public.format_plan_option_time(new.confirmed_option_id);
  for recipient in
    select distinct player.user_id
    from public.plan_votes vote
    join public.players player
      on player.id = vote.player_id and player.workspace_id = vote.workspace_id
    join public.workspace_members membership
      on membership.workspace_id = vote.workspace_id
      and membership.user_id = player.user_id
    where vote.option_id = new.confirmed_option_id
      and vote.response = 'AVAILABLE'
      and player.user_id is not null
  loop
    perform public.enqueue_notification(
      new.workspace_id, recipient.user_id, 'SESSION_UPDATES', 'PLAN_CONFIRMED',
      new.id, new.confirmed_option_id,
      'confirmed:' || new.id || ':' || new.confirmed_option_id || ':' || recipient.user_id,
      'Poker night confirmed', option_time || ' is confirmed.', '/plans/' || new.id
    );
  end loop;
  return new;
end;
$$;
create trigger event_plans_enqueue_confirmation
after update of status, confirmed_option_id on public.event_plans for each row
execute function public.enqueue_plan_confirmed_notifications();

create or replace function public.enqueue_due_notification_reminders(
  target_now timestamptz default now()
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare item record; created_count integer := 0; local_date date; option_time text;
begin
  -- Daily reminder. The logical key contains the workspace-local date, so a
  -- worker retry or DST offset change cannot duplicate the day's reminder.
  for item in
    select plan.id as plan_id, plan.workspace_id, workspace.timezone,
      recipient.user_id, player.id as player_id
    from public.event_plans plan
    join public.workspaces workspace on workspace.id = plan.workspace_id
    cross join lateral public.registered_workspace_recipients(plan.workspace_id) recipient
    join public.players player
      on player.workspace_id = plan.workspace_id and player.user_id = recipient.user_id
    where plan.status = 'VOTING'
      and (target_now at time zone workspace.timezone)::time >= time '12:00'
      and exists (
        select 1 from public.plan_options option
        where option.plan_id = plan.id
          and not exists (
            select 1 from public.plan_votes vote
            where vote.option_id = option.id and vote.player_id = player.id
          )
      )
  loop
    local_date := (target_now at time zone item.timezone)::date;
    if public.enqueue_notification(
      item.workspace_id, item.user_id, 'REMINDERS', 'DAILY_REMINDER',
      item.plan_id, null,
      'daily_reminder:' || item.plan_id || ':' || item.user_id || ':' || local_date,
      'Poker poll waiting for you', 'You still have times to vote on.',
      '/plans/' || item.plan_id
    ) then created_count := created_count + 1; end if;
  end loop;

  -- The time window is deliberately open from the exact due instant until the
  -- option starts. A delayed worker can catch up, while the unique key sends once.
  for item in
    select option.id as option_id, option.plan_id, option.workspace_id,
      option.starts_at, workspace.timezone, recipient.user_id,
      player.id as player_id
    from public.plan_options option
    join public.event_plans plan on plan.id = option.plan_id
    join public.workspaces workspace on workspace.id = option.workspace_id
    cross join lateral public.registered_workspace_recipients(option.workspace_id) recipient
    join public.players player
      on player.workspace_id = option.workspace_id and player.user_id = recipient.user_id
    where plan.status = 'VOTING'
      and option.starts_at - interval '3 hours' <= target_now
      and option.starts_at > target_now
      and not exists (
        select 1 from public.plan_votes vote
        where vote.option_id = option.id and vote.player_id = player.id
      )
  loop
    option_time := to_char(
      item.starts_at at time zone item.timezone, 'HH24:MI'
    );
    if public.enqueue_notification(
      item.workspace_id, item.user_id, 'REMINDERS', 'THREE_HOUR_REMINDER',
      item.plan_id, item.option_id,
      'three_hour:' || item.option_id || ':' || item.user_id,
      'Last chance to vote',
      'Poker is planned for ' || option_time || '. Let the table know if you''re available.',
      '/plans/' || item.plan_id
    ) then created_count := created_count + 1; end if;
  end loop;
  return created_count;
end;
$$;

create or replace function public.notification_event_is_deliverable(
  target_event_id uuid
) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare event_row public.notification_events%rowtype;
begin
  select * into event_row from public.notification_events where id = target_event_id;
  if not found
    or not public.is_registered_workspace_member(event_row.workspace_id, event_row.user_id)
    or not public.notification_category_enabled(event_row.user_id, event_row.category)
  then return false; end if;

  if event_row.event_type in ('NEW_POLL', 'MILESTONE_3', 'MILESTONE_6') then
    return exists (
      select 1 from public.event_plans plan
      where plan.id = event_row.plan_id and plan.status = 'VOTING'
    );
  elsif event_row.event_type = 'DAILY_REMINDER' then
    return exists (
      select 1
      from public.event_plans plan
      join public.players player
        on player.workspace_id = plan.workspace_id
        and player.user_id = event_row.user_id
      where plan.id = event_row.plan_id and plan.status = 'VOTING'
        and exists (
          select 1 from public.plan_options option
          where option.plan_id = plan.id
            and not exists (
              select 1 from public.plan_votes vote
              where vote.option_id = option.id and vote.player_id = player.id
            )
        )
    );
  elsif event_row.event_type = 'THREE_HOUR_REMINDER' then
    return exists (
      select 1
      from public.event_plans plan
      join public.plan_options option
        on option.id = event_row.option_id and option.plan_id = plan.id
      join public.players player
        on player.workspace_id = plan.workspace_id
        and player.user_id = event_row.user_id
      where plan.id = event_row.plan_id and plan.status = 'VOTING'
        and option.starts_at > now()
        and not exists (
          select 1 from public.plan_votes vote
          where vote.option_id = option.id and vote.player_id = player.id
        )
    );
  elsif event_row.event_type = 'PLAN_CONFIRMED' then
    return exists (
      select 1
      from public.event_plans plan
      join public.players player
        on player.workspace_id = plan.workspace_id
        and player.user_id = event_row.user_id
      join public.plan_votes vote
        on vote.option_id = event_row.option_id
        and vote.player_id = player.id
        and vote.response = 'AVAILABLE'
      where plan.id = event_row.plan_id
        and plan.status in ('CONFIRMED', 'SESSION_CREATED')
        and plan.confirmed_option_id = event_row.option_id
    );
  end if;
  return false;
end;
$$;

create or replace function public.claim_notification_events(target_limit integer default 25)
returns setof public.notification_events
language sql volatile security definer set search_path = ''
as $$
  with claimed as (
    select event.id from public.notification_events event
    where event.status = 'PENDING'
      and event.available_at <= now()
      and event.attempts < 5
    order by event.available_at, event.created_at
    for update skip locked
    limit greatest(1, least(target_limit, 100))
  )
  update public.notification_events event
  set status = 'PROCESSING', claimed_at = now(), attempts = event.attempts + 1
  from claimed
  where event.id = claimed.id
  returning event.*;
$$;

create or replace function public.register_push_subscription(
  target_endpoint text,
  target_p256dh text,
  target_auth text,
  target_user_agent text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); subscription_id uuid;
begin
  if actor is null or not exists (
    select 1
    from public.workspace_members membership
    join public.players player
      on player.workspace_id = membership.workspace_id
      and player.user_id = membership.user_id
    where membership.user_id = actor
  ) then raise exception 'A linked registered Player is required.'; end if;
  if target_endpoint !~ '^https://' or length(target_endpoint) > 4096
    or length(target_p256dh) not between 16 and 512
    or length(target_auth) not between 8 and 256
  then raise exception 'Push subscription is invalid.'; end if;

  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (actor, target_endpoint, target_p256dh, target_auth, left(target_user_agent, 512))
  on conflict (endpoint) do update set
    user_id = actor,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    disabled_at = null,
    updated_at = now()
  returning id into subscription_id;
  return subscription_id;
end;
$$;

create or replace function public.disable_push_subscription(target_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  update public.push_subscriptions
  set disabled_at = now()
  where endpoint = target_endpoint and user_id = (select auth.uid());
$$;

create or replace function public.invoke_notification_dispatch()
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare config public.notification_dispatch_config%rowtype; request_id bigint;
begin
  select * into config from public.notification_dispatch_config where singleton;
  if not found then return null; end if;
  select net.http_post(
    url := config.project_url || '/functions/v1/dispatch-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-SevenTwo-Dispatch-Secret', config.dispatch_secret
    ),
    body := jsonb_build_object('scheduledAt', now()),
    timeout_milliseconds := 10000
  ) into request_id;
  return request_id;
end;
$$;

create or replace function public.configure_notification_dispatch(
  target_project_url text,
  target_dispatch_secret text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if target_project_url !~ '^https://[a-z0-9-]+\.supabase\.co$'
    or length(target_dispatch_secret) < 32
  then raise exception 'Notification dispatcher configuration is invalid.'; end if;

  insert into public.notification_dispatch_config(
    singleton, project_url, dispatch_secret, updated_at
  ) values (true, rtrim(target_project_url, '/'), target_dispatch_secret, now())
  on conflict (singleton) do update set
    project_url = excluded.project_url,
    dispatch_secret = excluded.dispatch_secret,
    updated_at = now();

  if exists (
    select 1 from cron.job where jobname = 'seventwo-notification-dispatch'
  ) then perform cron.unschedule('seventwo-notification-dispatch'); end if;
  perform cron.schedule(
    'seventwo-notification-dispatch', '* * * * *',
    'select public.invoke_notification_dispatch();'
  );
end;
$$;

revoke all on function public.is_registered_workspace_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.registered_workspace_recipients(uuid) from public, anon, authenticated;
revoke all on function public.notification_category_enabled(uuid, public.notification_category) from public, anon, authenticated;
revoke all on function public.enqueue_notification(uuid, uuid, public.notification_category, public.notification_event_type, uuid, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.format_plan_option_time(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_due_notification_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.notification_event_is_deliverable(uuid) from public, anon, authenticated;
revoke all on function public.claim_notification_events(integer) from public, anon, authenticated;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.disable_push_subscription(text) from public, anon;
revoke all on function public.invoke_notification_dispatch() from public, anon, authenticated;
revoke all on function public.configure_notification_dispatch(text, text) from public, anon, authenticated;

grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.disable_push_subscription(text) to authenticated;
grant execute on function public.enqueue_due_notification_reminders(timestamptz) to service_role;
grant execute on function public.notification_event_is_deliverable(uuid) to service_role;
grant execute on function public.claim_notification_events(integer) to service_role;
grant execute on function public.invoke_notification_dispatch() to service_role;
grant execute on function public.configure_notification_dispatch(text, text) to service_role;

notify pgrst, 'reload schema';
