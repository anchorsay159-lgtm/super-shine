begin;

-- The notification outbox is processed independently from order/payment
-- transactions. Supabase Cron invokes the private worker once per minute.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'line_worker_secret'
  ) then
    raise exception 'VAULT_SECRET_MISSING: create line_worker_secret in Supabase Vault first';
  end if;
end;
$$;

select cron.schedule(
  'super-shine-line-notifications-worker',
  '* * * * *',
  $worker$
    select net.http_post(
      url := 'https://tozgpzdvddjtcdzhgbqa.supabase.co/functions/v1/line-notifications-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-line-worker-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'line_worker_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $worker$
);

commit;
