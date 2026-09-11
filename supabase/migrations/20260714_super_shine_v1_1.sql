-- Super Shine V1.1 non-destructive upgrade.
-- Run after supabase/schema.sql. Existing users and orders are preserved.

create extension if not exists pgcrypto;

-- Profiles and preferences ---------------------------------------------------
alter table public.profiles add column if not exists language text not null default 'en';
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists default_payment_method text not null default 'cash_delivery';
alter table public.profiles add column if not exists default_preferences jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists is_demo boolean not null default false;

do $$ begin
  alter table public.profiles add constraint profiles_language_check
    check (language in ('en', 'th', 'my', 'bn', 'dz'));
exception when duplicate_object then null; end $$;

-- Service catalogue: the only source for service names, units and prices ----
alter table public.services add column if not exists icon text not null default 'laundry';
alter table public.services add column if not exists pricing_type text not null default 'fixed';
alter table public.services add column if not exists turnaround_hours integer not null default 24;
alter table public.services add column if not exists name_key text;
alter table public.services add column if not exists description_key text;

do $$ begin
  alter table public.services add constraint services_pricing_type_check
    check (pricing_type in ('fixed', 'estimated'));
exception when duplicate_object then null; end $$;

create table if not exists public.service_options (
  id uuid primary key default gen_random_uuid(),
  service_id text not null references public.services(id) on delete cascade,
  option_key text not null,
  label_key text not null,
  input_type text not null check (input_type in ('select', 'boolean', 'text', 'photo')),
  choices jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, option_key)
);

-- Public operating settings and admin-controlled slots ----------------------
create table if not exists public.business_settings (
  id smallint primary key default 1 check (id = 1),
  store_name text not null default 'Super Shine',
  timezone text not null default 'Asia/Bangkok',
  currency text not null default 'THB',
  open_time time not null default '08:00',
  close_time time not null default '21:00',
  manual_status text not null default 'automatic' check (manual_status in ('automatic', 'open', 'closed')),
  pickup_fee numeric(10,2) not null default 0 check (pickup_fee >= 0),
  delivery_fee numeric(10,2) not null default 30 check (delivery_fee >= 0),
  promptpay_qr_path text,
  business_phone text not null default '',
  line_url text not null default '',
  service_areas jsonb not null default '[]'::jsonb,
  app_version text not null default '1.1.0',
  updated_at timestamptz not null default now()
);

create table if not exists public.pickup_slots (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  capacity integer not null default 8 check (capacity > 0),
  booked_count integer not null default 0 check (booked_count >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot_date, start_time, end_time),
  check (end_time > start_time),
  check (booked_count <= capacity)
);

-- Coupon rules ---------------------------------------------------------------
alter table public.coupons drop constraint if exists coupons_discount_type_check;
alter table public.coupons add constraint coupons_discount_type_v11_check
  check (discount_type in ('percentage', 'fixed', 'free_pickup', 'service_percentage'));
alter table public.coupons add column if not exists description text not null default '';
alter table public.coupons add column if not exists minimum_order numeric(10,2) not null default 0;
alter table public.coupons add column if not exists starts_at timestamptz;
alter table public.coupons add column if not exists expires_at timestamptz;
alter table public.coupons add column if not exists per_customer_limit integer;
alter table public.coupons add column if not exists total_usage_limit integer;
alter table public.coupons add column if not exists usage_count integer not null default 0;
alter table public.coupons add column if not exists service_id text references public.services(id) on delete set null;

create table if not exists public.coupon_usage (
  id uuid primary key default gen_random_uuid(),
  coupon_code text not null references public.coupons(code) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  discount_amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Orders V1.1 ---------------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add column if not exists pickup_slot_id uuid references public.pickup_slots(id) on delete set null;
alter table public.orders add column if not exists pickup_date date;
alter table public.orders add column if not exists pickup_start time;
alter table public.orders add column if not exists pickup_end time;
alter table public.orders add column if not exists delivery_eta timestamptz;
alter table public.orders add column if not exists expected_arrival_at timestamptz;
alter table public.orders add column if not exists contact_phone text not null default '';
alter table public.orders add column if not exists pickup_instructions text not null default '';
alter table public.orders add column if not exists customer_comment text not null default '';
alter table public.orders add column if not exists preferences jsonb not null default '{}'::jsonb;
alter table public.orders add column if not exists pricing_type text not null default 'fixed';
alter table public.orders add column if not exists pickup_fee numeric(10,2) not null default 0;
alter table public.orders add column if not exists delivery_fee numeric(10,2) not null default 0;
alter table public.orders add column if not exists coupon_code text references public.coupons(code) on delete set null;
alter table public.orders add column if not exists estimated_total numeric(10,2);
alter table public.orders add column if not exists final_total numeric(10,2);
alter table public.orders add column if not exists final_quantity numeric(10,2);
alter table public.orders add column if not exists price_approval_status text not null default 'not_required';
alter table public.orders add column if not exists price_approved_at timestamptz;
alter table public.orders add column if not exists price_response_note text not null default '';
alter table public.orders add column if not exists payment_status text not null default 'pending';
alter table public.orders add column if not exists status_comment text not null default '';
alter table public.orders add column if not exists admin_private_comment text not null default '';
alter table public.orders add column if not exists is_demo boolean not null default false;
alter table public.orders add column if not exists withdrawn_at timestamptz;

update public.orders set
  status = case status
    when 'New' then 'requested'
    when 'Accepted' then 'pickup_confirmed'
    when 'Pickup' then 'picked_up'
    when 'Washing' then 'cleaning'
    when 'Ready' then 'quality_check'
    when 'Delivered' then 'delivered'
    when 'Cancelled' then 'withdrawn'
    else lower(replace(status, ' ', '_'))
  end,
  estimated_total = coalesce(estimated_total, total),
  final_total = case when status = 'Delivered' then coalesce(final_total, total) else final_total end
where status in ('New', 'Accepted', 'Pickup', 'Washing', 'Ready', 'Delivered', 'Cancelled');

do $$ begin
  alter table public.orders add constraint orders_status_v11_check check (status in (
    'requested', 'pickup_confirmed', 'picked_up', 'received', 'cleaning',
    'quality_check', 'out_for_delivery', 'delivered', 'waiting_price_approval',
    'payment_verification_required', 'on_hold', 'rejected', 'withdrawn'
  ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.orders add constraint orders_payment_method_v11_check
    check (payment_method in ('cash_pickup', 'cash_delivery', 'promptpay', 'cash', 'card'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.orders add constraint orders_payment_status_check check (payment_status in (
    'pending', 'waiting_verification', 'verified', 'rejected', 'paid', 'refunded'
  ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.orders add constraint orders_price_approval_check check (price_approval_status in (
    'not_required', 'pending', 'approved', 'rejected'
  ));
exception when duplicate_object then null; end $$;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id text references public.services(id) on delete set null,
  service_name text not null,
  service_icon text not null default 'laundry',
  quantity numeric(10,2) not null check (quantity > 0),
  price_unit text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  line_total numeric(10,2) not null check (line_total >= 0),
  pricing_type text not null default 'fixed' check (pricing_type in ('fixed', 'estimated')),
  preferences jsonb not null default '{}'::jsonb,
  final_quantity numeric(10,2),
  final_unit_price numeric(10,2),
  final_line_total numeric(10,2),
  created_at timestamptz not null default now()
);

insert into public.order_items (
  order_id, service_id, service_name, quantity, price_unit, unit_price, line_total, pricing_type
)
select o.id, o.service_id, o.service_name, o.quantity,
  coalesce(s.price_unit, 'unit'),
  case when o.quantity > 0 then round(o.subtotal / o.quantity, 2) else o.subtotal end,
  o.subtotal,
  coalesce(s.pricing_type, 'fixed')
from public.orders o
left join public.services s on s.id = o.service_id
where not exists (select 1 from public.order_items oi where oi.order_id = o.id);

-- Status history keeps legacy columns while adding audit detail --------------
alter table public.order_status_history add column if not exists previous_status text;
alter table public.order_status_history add column if not exists new_status text;
alter table public.order_status_history add column if not exists actor_id uuid references public.profiles(id) on delete set null;
alter table public.order_status_history add column if not exists actor_role text not null default 'system';
alter table public.order_status_history add column if not exists comment text not null default '';

update public.order_status_history
set new_status = coalesce(new_status, case status
  when 'New' then 'requested' when 'Accepted' then 'pickup_confirmed'
  when 'Pickup' then 'picked_up' when 'Washing' then 'cleaning'
  when 'Ready' then 'quality_check' when 'Delivered' then 'delivered'
  when 'Cancelled' then 'withdrawn' else lower(replace(status, ' ', '_')) end),
  comment = case when comment = '' then note else comment end
where new_status is null or comment = '';

-- Payments, notifications, support and uploads ------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  method text not null check (method in ('cash_pickup', 'cash_delivery', 'promptpay', 'cash')),
  amount numeric(10,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'waiting_verification', 'verified', 'rejected', 'paid', 'refunded')),
  slip_path text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  rejection_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notifications add column if not exists type text not null default 'order_update';
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists title_key text;
alter table public.notifications add column if not exists message_key text;
alter table public.notifications add column if not exists message_params jsonb not null default '{}'::jsonb;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'admin')),
  reason text not null,
  message text not null check (char_length(message) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete cascade,
  file_type text not null check (file_type in ('laundry_photo', 'stain_photo', 'payment_slip', 'profile_photo')),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create or replace function public.notify_support_reply_v11()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sender_role = 'admin' then
    insert into public.notifications (user_id, order_id, type, title, body, title_key, message_key, link)
    values (new.user_id, new.order_id, 'support_reply', 'Support replied', 'Super Shine replied to your support message.', 'notification.support_reply.title', 'notification.support_reply.message', '/order-tracking?orderId=' || new.order_id);
  end if;
  return new;
end; $$;

drop trigger if exists support_reply_notification_v11 on public.support_messages;
create trigger support_reply_notification_v11 after insert on public.support_messages
for each row execute function public.notify_support_reply_v11();

create or replace function public.notify_payment_update_v11()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status and new.status in ('verified', 'rejected') then
    insert into public.notifications (user_id, order_id, type, title, body, title_key, message_key, link)
    values (
      new.user_id, new.order_id, 'payment_update',
      case when new.status = 'verified' then 'Payment verified' else 'Payment rejected' end,
      case when new.status = 'verified' then 'Your PromptPay payment was verified.' else 'Your payment slip was rejected. Please upload a new slip.' end,
      case when new.status = 'verified' then 'notification.payment_verified.title' else 'notification.payment_rejected.title' end,
      case when new.status = 'verified' then 'notification.payment_verified.message' else 'notification.payment_rejected.message' end,
      '/orders'
    );
  end if;
  return new;
end; $$;

drop trigger if exists payment_update_notification_v11 on public.payments;
create trigger payment_update_notification_v11 after update of status on public.payments
for each row execute function public.notify_payment_update_v11();

-- Indexes -------------------------------------------------------------------
create index if not exists orders_pickup_date_idx on public.orders(pickup_date, status);
create index if not exists orders_payment_status_idx on public.orders(payment_status, created_at desc);
create index if not exists orders_is_demo_idx on public.orders(is_demo, created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists status_history_order_created_idx on public.order_status_history(order_id, created_at);
create index if not exists pickup_slots_date_enabled_idx on public.pickup_slots(slot_date, enabled);
create index if not exists payments_status_idx on public.payments(status, created_at desc);
create index if not exists support_order_created_idx on public.support_messages(order_id, created_at);
create index if not exists coupon_usage_user_coupon_idx on public.coupon_usage(user_id, coupon_code);

-- Updated-at triggers --------------------------------------------------------
drop trigger if exists service_options_set_updated_at on public.service_options;
create trigger service_options_set_updated_at before update on public.service_options
for each row execute function public.set_updated_at();
drop trigger if exists settings_set_updated_at on public.business_settings;
create trigger settings_set_updated_at before update on public.business_settings
for each row execute function public.set_updated_at();
drop trigger if exists pickup_slots_set_updated_at on public.pickup_slots;
create trigger pickup_slots_set_updated_at before update on public.pickup_slots
for each row execute function public.set_updated_at();
drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
for each row execute function public.set_updated_at();

-- Replace legacy status trigger with a full audit + notification trigger -----
create or replace function public.record_order_status_v11()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role_value text := 'system';
  notification_type text;
begin
  if auth.uid() is not null then
    select case when role = 'admin' then 'admin' else 'customer' end
    into actor_role_value from public.profiles where id = auth.uid();
  end if;

  if tg_op = 'INSERT' or old.status is distinct from new.status then
    notification_type := case new.status
      when 'requested' then 'order_submitted'
      when 'pickup_confirmed' then 'pickup_scheduled'
      when 'picked_up' then 'laundry_picked_up'
      when 'received' then 'laundry_received'
      when 'waiting_price_approval' then 'price_approval_requested'
      when 'payment_verification_required' then 'payment_verification_required'
      when 'cleaning' then 'cleaning_started'
      when 'quality_check' then 'quality_check_completed'
      when 'out_for_delivery' then 'delivery_started'
      when 'delivered' then 'order_delivered'
      when 'rejected' then 'order_rejected'
      when 'on_hold' then 'order_on_hold'
      when 'withdrawn' then 'order_withdrawn'
      else 'order_update'
    end;

    insert into public.order_status_history (
      order_id, status, previous_status, new_status, actor_id, actor_role, note, comment
    ) values (
      new.id, new.status, case when tg_op = 'INSERT' then null else old.status end,
      new.status, auth.uid(), coalesce(actor_role_value, 'system'),
      coalesce(nullif(new.status_comment, ''), 'Status updated'),
      coalesce(new.status_comment, '')
    );

    insert into public.notifications (
      user_id, order_id, title, body, type, link, title_key, message_key, message_params
    ) values (
      new.user_id, new.id, 'Order update',
      'Order ' || new.order_number || ' is now ' || replace(new.status, '_', ' ') || '.',
      notification_type, '/order-tracking?orderId=' || new.id,
      'notification.' || notification_type || '.title',
      'notification.' || notification_type || '.message',
      jsonb_build_object('orderNumber', new.order_number)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists orders_record_status on public.orders;
drop trigger if exists orders_record_status_v11 on public.orders;
create trigger orders_record_status_v11 after insert or update of status on public.orders
for each row execute function public.record_order_status_v11();

-- Server-side checkout prevents price and coupon tampering ------------------
create or replace function public.place_order_v11(
  p_items jsonb,
  p_preferences jsonb,
  p_pickup_slot_id uuid,
  p_address_id uuid,
  p_pickup_instructions text,
  p_contact_phone text,
  p_payment_method text,
  p_coupon_code text default null,
  p_customer_comment text default '',
  p_is_demo boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  item jsonb;
  service_row public.services%rowtype;
  slot_row public.pickup_slots%rowtype;
  address_row public.addresses%rowtype;
  settings_row public.business_settings%rowtype;
  coupon_row public.coupons%rowtype;
  new_order public.orders%rowtype;
  item_quantity numeric(10,2);
  subtotal_value numeric(10,2) := 0;
  fee_value numeric(10,2) := 0;
  discount_value numeric(10,2) := 0;
  total_value numeric(10,2) := 0;
  item_summary_value text := '';
  first_service_id text;
  first_service_name text;
  first_quantity integer := 1;
  estimated_pricing boolean := false;
  demo_value boolean := false;
  coupon_service_subtotal numeric(10,2) := 0;
  usage_value integer := 0;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select is_demo into demo_value from public.profiles where id = current_user_id;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'ITEMS_REQUIRED'; end if;
  if p_payment_method not in ('cash_pickup', 'cash_delivery', 'promptpay') then raise exception 'INVALID_PAYMENT_METHOD'; end if;

  select * into address_row from public.addresses
  where id = p_address_id and user_id = current_user_id;
  if not found then raise exception 'ADDRESS_NOT_FOUND'; end if;

  select * into slot_row from public.pickup_slots where id = p_pickup_slot_id for update;
  if not found or not slot_row.enabled or slot_row.slot_date < (now() at time zone 'Asia/Bangkok')::date
    or slot_row.booked_count >= slot_row.capacity then
    raise exception 'PICKUP_SLOT_UNAVAILABLE';
  end if;

  select * into settings_row from public.business_settings where id = 1;
  fee_value := coalesce(settings_row.pickup_fee, 0) + coalesce(settings_row.delivery_fee, 0);

  for item in select * from jsonb_array_elements(p_items)
  loop
    item_quantity := greatest(1, coalesce((item ->> 'quantity')::numeric, 1));
    select * into service_row from public.services where id = item ->> 'serviceId' and enabled = true;
    if not found then raise exception 'SERVICE_UNAVAILABLE'; end if;
    subtotal_value := subtotal_value + (service_row.price * item_quantity);
    estimated_pricing := estimated_pricing or service_row.pricing_type = 'estimated';
    item_summary_value := item_summary_value || case when item_summary_value = '' then '' else ', ' end
      || trim(to_char(item_quantity, 'FM999999990.##')) || ' × ' || service_row.name;
    if first_service_id is null then
      first_service_id := service_row.id;
      first_service_name := service_row.name;
      first_quantity := ceil(item_quantity)::integer;
    end if;
  end loop;

  if nullif(trim(p_coupon_code), '') is not null then
    select * into coupon_row from public.coupons where upper(code) = upper(trim(p_coupon_code)) for update;
    if not found or not coupon_row.active
      or (coupon_row.starts_at is not null and coupon_row.starts_at > now())
      or (coupon_row.expires_at is not null and coupon_row.expires_at < now())
      or subtotal_value < coupon_row.minimum_order
      or (coupon_row.total_usage_limit is not null and coupon_row.usage_count >= coupon_row.total_usage_limit) then
      raise exception 'COUPON_INVALID';
    end if;
    if coupon_row.service_id is not null and not exists (
      select 1 from jsonb_array_elements(p_items) x where x ->> 'serviceId' = coupon_row.service_id
    ) then raise exception 'COUPON_SERVICE_REQUIRED'; end if;
    if coupon_row.per_customer_limit is not null then
      select count(*) into usage_value from public.coupon_usage
      where user_id = current_user_id and coupon_code = coupon_row.code;
      if usage_value >= coupon_row.per_customer_limit then raise exception 'COUPON_LIMIT_REACHED'; end if;
    end if;
    if coupon_row.service_id is not null then
      select coalesce(sum(s.price * greatest(1, coalesce((x ->> 'quantity')::numeric, 1))), 0)
      into coupon_service_subtotal
      from jsonb_array_elements(p_items) x
      join public.services s on s.id = x ->> 'serviceId'
      where s.id = coupon_row.service_id;
    end if;
    discount_value := case coupon_row.discount_type
      when 'percentage' then round(subtotal_value * coupon_row.discount_value / 100, 2)
      when 'fixed' then least(subtotal_value, coupon_row.discount_value)
      when 'free_pickup' then coalesce(settings_row.pickup_fee, 0)
      when 'service_percentage' then round(coupon_service_subtotal * coupon_row.discount_value / 100, 2)
      else 0 end;
  end if;

  total_value := greatest(0, subtotal_value + fee_value - discount_value);

  insert into public.orders (
    user_id, service_id, service_name, quantity, item_summary, subtotal,
    express_fee, pickup_fee, delivery_fee, discount, total, estimated_total,
    pickup_slot, pickup_slot_id, pickup_date, pickup_start, pickup_end,
    pickup_address, contact_phone, pickup_instructions, customer_comment,
    preferences, payment_method, payment_status, coupon_code, pricing_type,
    status, is_demo, express, priority
  ) values (
    current_user_id, first_service_id, first_service_name, first_quantity,
    item_summary_value, subtotal_value, 0, coalesce(settings_row.pickup_fee, 0),
    coalesce(settings_row.delivery_fee, 0), discount_value, total_value, total_value,
    to_char(slot_row.slot_date, 'YYYY-MM-DD') || ' · ' || to_char(slot_row.start_time, 'HH24:MI') || '–' || to_char(slot_row.end_time, 'HH24:MI'),
    slot_row.id, slot_row.slot_date, slot_row.start_time, slot_row.end_time,
    address_row.address_line, coalesce(p_contact_phone, ''), coalesce(p_pickup_instructions, ''),
    coalesce(p_customer_comment, ''), coalesce(p_preferences, '{}'::jsonb), p_payment_method,
    case when p_payment_method = 'promptpay' and not demo_value then 'waiting_verification' else 'pending' end,
    case when coupon_row.code is null then null else coupon_row.code end,
    case when estimated_pricing then 'estimated' else 'fixed' end,
    case when p_payment_method = 'promptpay' and not demo_value then 'payment_verification_required' else 'requested' end,
    demo_value, false, false
  ) returning * into new_order;

  for item in select * from jsonb_array_elements(p_items)
  loop
    item_quantity := greatest(1, coalesce((item ->> 'quantity')::numeric, 1));
    select * into service_row from public.services where id = item ->> 'serviceId';
    insert into public.order_items (
      order_id, service_id, service_name, service_icon, quantity, price_unit,
      unit_price, line_total, pricing_type, preferences
    ) values (
      new_order.id, service_row.id, service_row.name, service_row.icon, item_quantity,
      service_row.price_unit, service_row.price, service_row.price * item_quantity,
      service_row.pricing_type, coalesce(item -> 'preferences', '{}'::jsonb)
    );
  end loop;

  update public.pickup_slots set booked_count = booked_count + 1 where id = slot_row.id;

  insert into public.payments (order_id, user_id, method, amount, status)
  values (new_order.id, current_user_id, p_payment_method, total_value,
    case when p_payment_method = 'promptpay' and not demo_value then 'waiting_verification' else 'pending' end);

  if coupon_row.code is not null then
    insert into public.coupon_usage (coupon_code, user_id, order_id, discount_amount)
    values (coupon_row.code, current_user_id, new_order.id, discount_value);
    update public.coupons set usage_count = usage_count + 1 where code = coupon_row.code;
  end if;

  return jsonb_build_object('id', new_order.id, 'orderNumber', new_order.order_number, 'total', total_value);
end;
$$;

create or replace function public.withdraw_order_v11(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare slot_id uuid;
begin
  update public.orders set status = 'withdrawn', withdrawn_at = now(), status_comment = 'Withdrawn by customer'
  where id = p_order_id and user_id = auth.uid() and status in ('requested', 'payment_verification_required')
  returning pickup_slot_id into slot_id;
  if not found then raise exception 'ORDER_CANNOT_BE_WITHDRAWN'; end if;
  if slot_id is not null then
    update public.pickup_slots set booked_count = greatest(0, booked_count - 1) where id = slot_id;
  end if;
end; $$;

create or replace function public.respond_to_price_v11(p_order_id uuid, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set
    price_approval_status = case when p_approve then 'approved' else 'rejected' end,
    price_approved_at = now(), price_response_note = coalesce(p_note, ''),
    status = case when p_approve then 'received' else 'on_hold' end,
    total = case when p_approve then coalesce(final_total, estimated_total, total) else total end,
    status_comment = case when p_approve then 'Final price approved by customer' else 'Final price rejected by customer' end
  where id = p_order_id and user_id = auth.uid()
    and status = 'waiting_price_approval' and price_approval_status = 'pending';
  if not found then raise exception 'PRICE_RESPONSE_NOT_ALLOWED'; end if;
end; $$;

create or replace function public.register_order_upload_v11(
  p_order_id uuid,
  p_file_type text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint default 0
)
returns uuid language plpgsql security definer set search_path = public as $$
declare upload_id uuid; payment_record_id uuid;
begin
  if p_file_type not in ('laundry_photo', 'stain_photo', 'payment_slip') then raise exception 'INVALID_FILE_TYPE'; end if;
  if not exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid()) then raise exception 'ORDER_NOT_FOUND'; end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text then raise exception 'INVALID_STORAGE_PATH'; end if;
  select id into payment_record_id from public.payments where order_id = p_order_id limit 1;
  insert into public.uploaded_files (user_id, order_id, payment_id, file_type, storage_path, mime_type, size_bytes)
  values (auth.uid(), p_order_id, case when p_file_type = 'payment_slip' then payment_record_id else null end, p_file_type, p_storage_path, p_mime_type, greatest(p_size_bytes, 0))
  returning id into upload_id;
  if p_file_type = 'payment_slip' then
    update public.payments set slip_path = p_storage_path, status = 'waiting_verification' where order_id = p_order_id;
    update public.orders set payment_status = 'waiting_verification', status = 'payment_verification_required', status_comment = 'Payment slip uploaded' where id = p_order_id;
  end if;
  return upload_id;
end; $$;

create or replace function public.admin_reschedule_order_v11(p_order_id uuid, p_pickup_slot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare old_slot_id uuid; slot_row public.pickup_slots%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select pickup_slot_id into old_slot_id from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if old_slot_id = p_pickup_slot_id then return; end if;
  select * into slot_row from public.pickup_slots where id = p_pickup_slot_id for update;
  if not found or not slot_row.enabled or slot_row.slot_date < (now() at time zone 'Asia/Bangkok')::date or slot_row.booked_count >= slot_row.capacity then raise exception 'PICKUP_SLOT_UNAVAILABLE'; end if;
  if old_slot_id is not null then update public.pickup_slots set booked_count = greatest(0, booked_count - 1) where id = old_slot_id; end if;
  update public.pickup_slots set booked_count = booked_count + 1 where id = p_pickup_slot_id;
  update public.orders set pickup_slot_id = slot_row.id, pickup_date = slot_row.slot_date, pickup_start = slot_row.start_time, pickup_end = slot_row.end_time,
    pickup_slot = to_char(slot_row.slot_date, 'YYYY-MM-DD') || ' · ' || to_char(slot_row.start_time, 'HH24:MI') || '–' || to_char(slot_row.end_time, 'HH24:MI'),
    status = case when status in ('requested', 'payment_verification_required') then 'pickup_confirmed' else status end,
    status_comment = 'Pickup time updated by admin'
  where id = p_order_id;
end; $$;

-- Row Level Security ---------------------------------------------------------
alter table public.service_options enable row level security;
alter table public.business_settings enable row level security;
alter table public.pickup_slots enable row level security;
alter table public.coupon_usage enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.support_messages enable row level security;
alter table public.uploaded_files enable row level security;

drop policy if exists "services_read_authenticated" on public.services;
drop policy if exists "services_public_read_active" on public.services;
create policy "services_public_read_active" on public.services for select to anon, authenticated
using (enabled or public.is_admin());
drop policy if exists "service_options_public_read_active" on public.service_options;
create policy "service_options_public_read_active" on public.service_options for select to anon, authenticated
using ((active and exists (select 1 from public.services s where s.id = service_id and s.enabled)) or public.is_admin());
drop policy if exists "service_options_admin_write" on public.service_options;
create policy "service_options_admin_write" on public.service_options for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings_public_read" on public.business_settings;
create policy "settings_public_read" on public.business_settings for select to anon, authenticated using (true);
drop policy if exists "settings_admin_write" on public.business_settings;
create policy "settings_admin_write" on public.business_settings for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pickup_slots_public_available" on public.pickup_slots;
create policy "pickup_slots_public_available" on public.pickup_slots for select to anon, authenticated
using ((enabled and slot_date >= (now() at time zone 'Asia/Bangkok')::date) or public.is_admin());
drop policy if exists "pickup_slots_admin_write" on public.pickup_slots;
create policy "pickup_slots_admin_write" on public.pickup_slots for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "coupons_read_authenticated" on public.coupons;
drop policy if exists "coupons_public_active" on public.coupons;
create policy "coupons_public_active" on public.coupons for select to anon, authenticated
using ((active and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at >= now())) or public.is_admin());

drop policy if exists "order_items_read_own_or_admin" on public.order_items;
create policy "order_items_read_own_or_admin" on public.order_items for select to authenticated
using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
drop policy if exists "order_items_admin_write" on public.order_items;
create policy "order_items_admin_write" on public.order_items for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "coupon_usage_read_own_or_admin" on public.coupon_usage;
create policy "coupon_usage_read_own_or_admin" on public.coupon_usage for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "payments_read_own_or_admin" on public.payments;
create policy "payments_read_own_or_admin" on public.payments for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists "payments_admin_update" on public.payments;
create policy "payments_admin_update" on public.payments for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "support_read_own_or_admin" on public.support_messages;
create policy "support_read_own_or_admin" on public.support_messages for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists "support_insert_customer_or_admin" on public.support_messages;
create policy "support_insert_customer_or_admin" on public.support_messages for insert to authenticated
with check (
  (user_id = auth.uid() and sender_id = auth.uid() and sender_role = 'customer'
    and (order_id is null or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())))
  or (public.is_admin() and sender_id = auth.uid() and sender_role = 'admin')
);
drop policy if exists "support_admin_update" on public.support_messages;
create policy "support_admin_update" on public.support_messages for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "uploads_read_own_or_admin" on public.uploaded_files;
create policy "uploads_read_own_or_admin" on public.uploaded_files for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists "uploads_insert_own_or_admin" on public.uploaded_files;
create policy "uploads_insert_own_or_admin" on public.uploaded_files for insert to authenticated
with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "uploads_delete_own_or_admin" on public.uploaded_files;
create policy "uploads_delete_own_or_admin" on public.uploaded_files for delete to authenticated
using (user_id = auth.uid() or public.is_admin());

-- Customer changes are restricted to safe RPCs; admins keep operational write.
drop policy if exists "orders_customer_insert" on public.orders;
drop policy if exists "orders_customer_update_requested" on public.orders;

grant execute on function public.place_order_v11(jsonb, jsonb, uuid, uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.withdraw_order_v11(uuid) to authenticated;
grant execute on function public.respond_to_price_v11(uuid, boolean, text) to authenticated;
grant execute on function public.register_order_upload_v11(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.admin_reschedule_order_v11(uuid, uuid) to authenticated;

-- Private order files and public business assets -----------------------------
insert into storage.buckets (id, name, public)
values ('order-uploads', 'order-uploads', false), ('business-public', 'business-public', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "customers_upload_own_order_files" on storage.objects;
create policy "customers_upload_own_order_files" on storage.objects for insert to authenticated
with check (bucket_id = 'order-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "customers_read_own_order_files" on storage.objects;
create policy "customers_read_own_order_files" on storage.objects for select to authenticated
using (bucket_id = 'order-uploads' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "customers_delete_own_order_files" on storage.objects;
create policy "customers_delete_own_order_files" on storage.objects for delete to authenticated
using (bucket_id = 'order-uploads' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "admins_manage_business_assets" on storage.objects;
create policy "admins_manage_business_assets" on storage.objects for all to authenticated
using (bucket_id = 'business-public' and public.is_admin())
with check (bucket_id = 'business-public' and public.is_admin());

-- Seed/upgrade operational data ---------------------------------------------
insert into public.business_settings (id) values (1) on conflict (id) do nothing;

update public.services set
  name_key = case id when 'wash-fold' then 'service.wash_fold.name' when 'dry-clean' then 'service.dry_cleaning.name' when 'iron' then 'service.iron_press.name' when 'bedding' then 'service.bedding_care.name' else name_key end,
  description_key = case id when 'wash-fold' then 'service.wash_fold.description' when 'dry-clean' then 'service.dry_cleaning.description' when 'iron' then 'service.iron_press.description' when 'bedding' then 'service.bedding_care.description' else description_key end,
  icon = case id when 'wash-fold' then 'laundry' when 'dry-clean' then 'dry_cleaning' when 'iron' then 'iron' when 'bedding' then 'bed' else icon end,
  turnaround_hours = case id when 'wash-fold' then 24 when 'dry-clean' then 48 when 'iron' then 12 when 'bedding' then 48 else turnaround_hours end,
  pricing_type = case when id in ('wash-fold', 'bedding') then 'estimated' else 'fixed' end;

update public.coupons set minimum_order = 200, per_customer_limit = 1 where code = 'FRESH20';
update public.coupons set per_customer_limit = 1, service_id = 'bedding' where code = 'BEDDING50';
update public.coupons set description = 'Free pickup fee on an eligible order' where code = 'FREEPICKUP';
update public.coupons set expires_at = now() + interval '30 days' where code = 'FREEPICKUP' and expires_at is null;

insert into public.service_options (service_id, option_key, label_key, input_type, choices, sort_order)
values
  ('wash-fold', 'detergent', 'preference.detergent', 'select', '["standard","gentle","customer_own"]', 1),
  ('wash-fold', 'fabric_softener', 'preference.fabricSoftener', 'boolean', '[]', 2),
  ('wash-fold', 'fragrance_free', 'preference.fragranceFree', 'boolean', '[]', 3),
  ('wash-fold', 'wash_temperature', 'preference.temperature', 'select', '["cold","warm"]', 4),
  ('wash-fold', 'folding', 'preference.folding', 'select', '["standard","compact"]', 5),
  ('dry-clean', 'hanger', 'preference.hanger', 'boolean', '[]', 1),
  ('iron', 'hanger', 'preference.hanger', 'boolean', '[]', 1),
  ('bedding', 'fragrance_free', 'preference.fragranceFree', 'boolean', '[]', 1)
on conflict (service_id, option_key) do update set
  label_key = excluded.label_key, input_type = excluded.input_type,
  choices = excluded.choices, active = true, sort_order = excluded.sort_order;

insert into public.pickup_slots (slot_date, start_time, end_time, capacity)
select d::date, t.start_time, t.end_time, 8
from generate_series(
  (now() at time zone 'Asia/Bangkok')::date,
  (now() at time zone 'Asia/Bangkok')::date + 13,
  interval '1 day'
) d
cross join (values ('09:00'::time, '11:00'::time), ('14:00'::time, '16:00'::time), ('16:00'::time, '18:00'::time)) t(start_time, end_time)
on conflict (slot_date, start_time, end_time) do nothing;

select setval(
  'public.order_number_seq',
  greatest(
    1053,
    coalesce((select max(substring(order_number from '[0-9]+')::bigint) from public.orders), 1053)
  ),
  true
);

-- Realtime for customer/admin synchronization -------------------------------
do $$
declare table_name text;
begin
  foreach table_name in array array['orders','order_status_history','payments','notifications','support_messages','pickup_slots']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

-- Mark the existing owner only after that Auth user exists:
-- update public.profiles set role = 'admin' where email = 'owner@supershine.app';
