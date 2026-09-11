begin;

create extension if not exists pg_net with schema extensions;

-- Wake the worker as soon as a new LINE delivery is committed. pg_net sends
-- asynchronously after the database transaction commits, so order updates do
-- not wait for LINE and are never failed by a temporary messaging outage.
create or replace function public.wake_line_notifications_worker_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  worker_secret text;
begin
  select decrypted_secret
    into worker_secret
  from vault.decrypted_secrets
  where name = 'line_worker_secret';

  if nullif(worker_secret, '') is null then
    raise log 'line_worker_wake_skipped: VAULT_SECRET_MISSING';
    return new;
  end if;

  perform net.http_post(
    url := 'https://tozgpzdvddjtcdzhgbqa.supabase.co/functions/v1/line-notifications-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-line-worker-secret', worker_secret
    ),
    body := jsonb_build_object('deliveryId', new.id),
    timeout_milliseconds := 10000
  );

  return new;
exception when others then
  -- LINE delivery must never break the order or notification transaction.
  raise log 'line_worker_wake_failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.wake_line_notifications_worker_v1() from public, anon, authenticated;

drop trigger if exists line_deliveries_wake_worker_v1 on public.line_notification_deliveries;
create trigger line_deliveries_wake_worker_v1
after insert on public.line_notification_deliveries
for each row execute function public.wake_line_notifications_worker_v1();

commit;
