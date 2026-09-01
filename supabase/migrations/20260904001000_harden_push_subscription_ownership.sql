-- Keep a browser push endpoint bound to its original account. Re-registering
-- the same endpoint for the same account remains idempotent.

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
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    disabled_at = null,
    updated_at = now()
  where public.push_subscriptions.user_id = actor
  returning id into subscription_id;

  if subscription_id is null then
    raise exception 'This push subscription belongs to another account.';
  end if;
  return subscription_id;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text)
  from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';
