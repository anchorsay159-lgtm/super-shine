begin;

-- LINE is an additional, downstream delivery channel.  No order, payment,
-- pricing, fulfillment, or accounting columns are changed by this migration.
create extension if not exists pgcrypto;

create table if not exists public.line_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  line_user_id text unique,
  notifications_enabled boolean not null default true,
  order_updates_enabled boolean not null default true,
  payment_updates_enabled boolean not null default true,
  friend_status text not null default 'unknown' check (friend_status in ('unknown','following','blocked')),
  linked_at timestamptz,
  disconnected_at timestamptz,
  last_friend_event_at timestamptz,
  last_successful_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.line_link_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  state_hash text not null unique,
  nonce text not null,
  code_verifier text not null,
  finalize_secret_hash text not null,
  return_url text not null,
  line_user_id text,
  friend_status text not null default 'unknown' check (friend_status in ('unknown','following','blocked')),
  status text not null default 'started' check (status in ('started','callback_received','failed','used','expired')),
  error_code text,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  callback_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists line_link_attempts_user_idx on public.line_link_attempts(user_id, created_at desc);
create index if not exists line_link_attempts_expiry_idx on public.line_link_attempts(expires_at) where used_at is null;

create table if not exists public.line_webhook_events (
  event_id text primary key,
  event_type text not null,
  line_user_id text,
  event_timestamp timestamptz,
  received_at timestamptz not null default now()
);

create table if not exists public.line_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  event_type text not null,
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  retry_key uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','processing','sent','skipped','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  lock_token uuid,
  last_error text,
  last_http_status integer,
  first_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, event_key)
);

create index if not exists line_deliveries_claim_idx on public.line_notification_deliveries(status, next_attempt_at, locked_until);
create index if not exists line_deliveries_order_idx on public.line_notification_deliveries(order_id, created_at desc);

-- Existing notification rows remain the app notification channel.  This key
-- gives new downstream events a stable, auditable idempotency key.
alter table public.notifications add column if not exists source_event_key text;
create unique index if not exists notifications_source_event_key_idx
  on public.notifications(user_id, order_id, source_event_key)
  where source_event_key is not null and order_id is not null;

alter table public.line_connections enable row level security;
alter table public.line_link_attempts enable row level security;
alter table public.line_webhook_events enable row level security;
alter table public.line_notification_deliveries enable row level security;

revoke all on public.line_connections from anon, authenticated;
revoke all on public.line_link_attempts from anon, authenticated;
revoke all on public.line_webhook_events from anon, authenticated;
revoke all on public.line_notification_deliveries from anon, authenticated;

create or replace function public.line_connection_status_v1()
returns table(
  connected boolean,
  notifications_enabled boolean,
  order_updates_enabled boolean,
  payment_updates_enabled boolean,
  friend_status text,
  linked_at timestamptz,
  last_successful_delivery_at timestamptz
) language sql security definer set search_path = public, pg_temp as $$
  select (c.line_user_id is not null), c.notifications_enabled, c.order_updates_enabled,
    c.payment_updates_enabled, c.friend_status, c.linked_at, c.last_successful_delivery_at
  from public.line_connections c where c.user_id = auth.uid();
$$;

create or replace function public.line_finish_link_v1(
  p_user_id uuid, p_attempt_id uuid, p_finalize_secret_hash text, p_line_user_id text, p_friend_status text
)
returns table(connected boolean, friend_status text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.line_link_attempts%rowtype; existing_user uuid;
begin
  select * into a from public.line_link_attempts where id=p_attempt_id and user_id=p_user_id for update;
  if not found or a.status <> 'callback_received' or a.used_at is not null or a.expires_at <= now()
    or a.finalize_secret_hash <> p_finalize_secret_hash then
    raise exception 'LINE_LINK_ATTEMPT_INVALID';
  end if;
  if nullif(trim(coalesce(p_line_user_id,'')),'') is null then raise exception 'LINE_ID_REQUIRED'; end if;
  select user_id into existing_user from public.line_connections where line_user_id=p_line_user_id;
  if existing_user is not null and existing_user <> p_user_id then raise exception 'LINE_ALREADY_LINKED'; end if;
  insert into public.line_connections(user_id,line_user_id,friend_status,linked_at,disconnected_at,updated_at)
    values(p_user_id,p_line_user_id,case when p_friend_status in ('following','blocked') then p_friend_status else 'unknown' end,now(),null,now())
    on conflict(user_id) do update set line_user_id=excluded.line_user_id,
      friend_status=excluded.friend_status,linked_at=excluded.linked_at,disconnected_at=null,updated_at=now();
  update public.line_link_attempts set status='used',used_at=now() where id=a.id;
  return query select true, c.friend_status from public.line_connections c where c.user_id=p_user_id;
exception when unique_violation then
  raise exception 'LINE_ALREADY_LINKED';
end;
$$;

create or replace function public.line_claim_deliveries_v1(p_limit integer, p_lock_token uuid)
returns setof public.line_notification_deliveries
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with candidates as (
    select d.id from public.line_notification_deliveries d
    where d.attempts < 8 and d.next_attempt_at <= now()
      and (d.status in ('pending','failed') or (d.status='processing' and d.locked_until < now()))
      and exists (select 1 from public.line_connections c where c.user_id=d.user_id
        and c.line_user_id is not null and c.notifications_enabled
        and (d.event_type like 'payment_%' and c.payment_updates_enabled or d.event_type not like 'payment_%' and c.order_updates_enabled))
    order by d.created_at
    for update of d skip locked limit greatest(1, least(coalesce(p_limit,20),100))
  ), claimed as (
    update public.line_notification_deliveries d set status='processing', lock_token=p_lock_token,
      locked_until=now()+interval '2 minutes', attempts=d.attempts+1,
      first_attempt_at=coalesce(d.first_attempt_at,now()), updated_at=now()
    from candidates c where d.id=c.id returning d.*
  ) select * from claimed;
end;
$$;

create or replace function public.line_complete_delivery_v1(
  p_delivery_id uuid, p_lock_token uuid, p_status text, p_error text, p_http_status integer, p_retry boolean
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare delay_seconds integer;
begin
  if p_status not in ('sent','skipped','failed') then raise exception 'LINE_DELIVERY_STATUS_INVALID'; end if;
  delay_seconds := case when p_retry then least(3600, (power(2, greatest(0, (select attempts from public.line_notification_deliveries where id=p_delivery_id)-1))::integer) * 15) else 0 end;
  update public.line_notification_deliveries set status=p_status, lock_token=null, locked_until=null,
    last_error=left(nullif(p_error,''),1000), last_http_status=p_http_status,
    sent_at=case when p_status='sent' then now() else sent_at end,
    next_attempt_at=case when p_retry then now()+make_interval(secs=>delay_seconds) else now() end,
    updated_at=now() where id=p_delivery_id and status='processing' and lock_token=p_lock_token;
  if p_status='sent' then
    update public.line_connections c set last_successful_delivery_at=now(),updated_at=now()
      where c.user_id=(select user_id from public.line_notification_deliveries where id=p_delivery_id);
  end if;
end;
$$;

create or replace function public.admin_line_delivery_history_v1(p_order_id uuid)
returns table(event_type text,status text,attempts integer,last_error text,created_at timestamptz,sent_at timestamptz)
language sql security definer set search_path = public, pg_temp as $$
  select d.event_type,d.status,d.attempts,d.last_error,d.created_at,d.sent_at
  from public.line_notification_deliveries d
  where d.order_id=p_order_id and public.is_admin()
  order by d.created_at desc limit 30;
$$;

revoke all on function public.line_connection_status_v1() from public, anon, authenticated;
revoke all on function public.line_finish_link_v1(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.line_claim_deliveries_v1(integer,uuid) from public, anon, authenticated;
revoke all on function public.line_complete_delivery_v1(uuid,uuid,text,text,integer,boolean) from public, anon, authenticated;
revoke all on function public.admin_line_delivery_history_v1(uuid) from public, anon, authenticated;
grant execute on function public.line_connection_status_v1() to authenticated;
grant execute on function public.line_finish_link_v1(uuid,uuid,text,text,text) to service_role;
grant execute on function public.line_claim_deliveries_v1(integer,uuid) to service_role;
grant execute on function public.line_complete_delivery_v1(uuid,uuid,text,text,integer,boolean) to service_role;
grant execute on function public.admin_line_delivery_history_v1(uuid) to authenticated;

create or replace function public.enqueue_line_delivery_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare event_key_value text; event_type_value text; payload_value jsonb; order_row public.orders%rowtype;
begin
  if new.order_id is null or new.user_id is null or new.type in ('support_reply')
    or exists (select 1 from public.orders where id=new.order_id and is_demo) then return new; end if;
  event_type_value := case when new.type='payment_update' then
      case when new.title_key like '%verified%' then 'payment_confirmed'
        when new.title_key like '%rejected%' then 'payment_failed'
        when new.title_key like '%refunded%' then 'payment_refunded' else 'payment_update' end
    else new.type end;
  event_key_value := coalesce(new.source_event_key, new.id::text);
  select * into order_row from public.orders where id=new.order_id;
  payload_value := jsonb_build_object('orderId',new.order_id,'orderNumber',coalesce(new.message_params->>'orderNumber',order_row.order_number),
    'type',event_type_value,'title',new.title,'body',new.body,
    'returnMethod',order_row.return_method,'amount',coalesce(order_row.final_total,order_row.total),
    'link',coalesce(new.link,'/order-tracking?orderId='||new.order_id));
  insert into public.line_notification_deliveries(notification_id,user_id,order_id,event_type,event_key,payload)
    values(new.id,new.user_id,new.order_id,event_type_value,event_key_value,payload_value)
    on conflict (notification_id) do nothing;
  return new;
exception when others then
  -- Never fail an order/payment notification transaction because LINE is unavailable.
  raise log 'line_delivery_enqueue_failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notifications_line_delivery_v1 on public.notifications;
create trigger notifications_line_delivery_v1 after insert on public.notifications
for each row execute function public.enqueue_line_delivery_v1();

create or replace function public.enqueue_line_payment_due_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare event_key_value text; n_id uuid; order_no text;
begin
  if new.is_demo or new.user_id is null or new.final_total is null or new.payment_status not in ('unpaid','pending')
    or new.price_approval_status not in ('approved','not_required') then return new; end if;
  if not (new.final_total is distinct from old.final_total or new.price_approval_status is distinct from old.price_approval_status or new.pricing_status is distinct from old.pricing_status) then return new; end if;
  event_key_value := 'payment-due:'||new.id::text||':'||to_char(new.final_total,'FM999999999990.00');
  select order_number into order_no from public.orders where id=new.id;
  insert into public.notifications(user_id,order_id,title,body,type,link,title_key,message_key,message_params,source_event_key)
    values(new.user_id,new.id,'Payment due','Your final price is confirmed for order '||order_no||'. Payment is now due.',
      'payment_due','/order-tracking?orderId='||new.id,'notification.payment_due.title','notification.payment_due.message',
      jsonb_build_object('orderNumber',order_no,'amount',new.final_total),event_key_value)
    on conflict (user_id,order_id,source_event_key)
      where source_event_key is not null and order_id is not null
      do nothing returning id into n_id;
  return new;
exception when others then
  raise log 'line_payment_due_enqueue_failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists orders_line_payment_due_v1 on public.orders;
create trigger orders_line_payment_due_v1 after update of final_total,price_approval_status,pricing_status on public.orders
for each row execute function public.enqueue_line_payment_due_v1();

commit;
