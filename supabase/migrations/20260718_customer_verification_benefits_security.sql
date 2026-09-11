-- Super Shine V1.4 customer verification, benefit limits, and security hardening.
-- Apply after 20260714_super_shine_v1_1.sql. This migration is non-destructive.

-- Verified customer identity -------------------------------------------------
alter table public.profiles add column if not exists normalized_phone text;
alter table public.profiles add column if not exists phone_verified_at timestamptz;

create or replace function public.normalize_th_phone_v14(p_phone text)
returns text
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare digits text := regexp_replace(trim(p_phone), '[^0-9]', '', 'g');
begin
  if digits ~ '^0[689][0-9]{8}$' then
    return '+66' || substring(digits from 2);
  end if;
  if digits ~ '^66[689][0-9]{8}$' then
    return '+' || digits;
  end if;
  raise exception 'PHONE_INVALID';
end;
$$;

create unique index if not exists profiles_verified_phone_unique_v14
on public.profiles(normalized_phone)
where phone_verified_at is not null and is_demo = false;

create or replace function public.protect_profile_verification_v14()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.normalized_phone is distinct from old.normalized_phone
      or new.phone_verified_at is distinct from old.phone_verified_at then
      raise exception 'VERIFICATION_FIELDS_READ_ONLY';
    end if;
    if new.phone is distinct from old.phone then
      new.normalized_phone := null;
      new.phone_verified_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_verification_v14 on public.profiles;
create trigger profiles_protect_verification_v14
before update on public.profiles
for each row execute function public.protect_profile_verification_v14();

create or replace function public.sync_verified_phone_v14()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  auth_phone text;
  confirmed_at timestamptz;
  normalized_value text;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select u.phone, u.phone_confirmed_at
  into auth_phone, confirmed_at
  from auth.users u
  where u.id = current_user_id;

  if confirmed_at is null or nullif(trim(auth_phone), '') is null then
    raise exception 'PHONE_NOT_VERIFIED';
  end if;

  normalized_value := public.normalize_th_phone_v14(auth_phone);
  begin
    update public.profiles
    set phone = normalized_value,
        normalized_phone = normalized_value,
        phone_verified_at = confirmed_at
    where id = current_user_id and is_demo = false;
  exception when unique_violation then
    raise exception 'PHONE_ALREADY_VERIFIED';
  end;

  if not found then raise exception 'REAL_PROFILE_REQUIRED'; end if;
  return jsonb_build_object('phone', normalized_value, 'verifiedAt', confirmed_at);
end;
$$;

revoke all on function public.normalize_th_phone_v14(text) from public;
grant execute on function public.normalize_th_phone_v14(text) to authenticated;
revoke all on function public.sync_verified_phone_v14() from public;
grant execute on function public.sync_verified_phone_v14() to authenticated;

-- Coupon eligibility and five-pickup benefit -------------------------------
alter table public.coupons add column if not exists requires_verified_phone boolean not null default false;
alter table public.coupons add column if not exists first_verified_profile_only boolean not null default false;
alter table public.orders add column if not exists pickup_benefit_discount numeric(10,2) not null default 0;

create table if not exists public.profile_pickup_benefit_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restore_reason text
);

create index if not exists pickup_benefit_user_active_v14
on public.profile_pickup_benefit_usage(user_id, created_at)
where restored_at is null;

alter table public.profile_pickup_benefit_usage enable row level security;
drop policy if exists "pickup_benefit_read_own_or_admin" on public.profile_pickup_benefit_usage;
create policy "pickup_benefit_read_own_or_admin" on public.profile_pickup_benefit_usage
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

update public.coupons
set requires_verified_phone = false,
    first_verified_profile_only = false;

update public.coupons
set requires_verified_phone = false,
    first_verified_profile_only = false,
    per_customer_limit = 1
where upper(code) in ('FRESH', 'FRESH20');

create or replace function public.enforce_coupon_verification_v14()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.requires_verified_phone := false;
  new.first_verified_profile_only := false;
  return new;
end;
$$;

drop trigger if exists coupons_enforce_verification_v14 on public.coupons;
create trigger coupons_enforce_verification_v14
before insert or update on public.coupons
for each row execute function public.enforce_coupon_verification_v14();

create or replace function public.get_customer_eligibility_v14()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  profile_row public.profiles%rowtype;
  used_pickups integer := 0;
  eligible_codes jsonb := '[]'::jsonb;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into profile_row from public.profiles where id = current_user_id;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  if not profile_row.is_demo then
    select count(*) into used_pickups
    from public.profile_pickup_benefit_usage b
    where b.user_id = current_user_id and b.restored_at is null;
  end if;

  select coalesce(jsonb_agg(c.code order by c.created_at), '[]'::jsonb)
  into eligible_codes
  from public.coupons c
  where c.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.expires_at is null or c.expires_at > now())
    and (c.total_usage_limit is null or c.usage_count < c.total_usage_limit)
    and (c.per_customer_limit is null or (
      select count(*) from public.coupon_usage u
      where u.user_id = current_user_id and u.coupon_code = c.code
    ) < c.per_customer_limit)
    and (not c.first_verified_profile_only or not exists (
      select 1 from public.coupon_usage u
      where u.user_id = current_user_id and u.coupon_code = c.code
    ));

  return jsonb_build_object(
    'phoneVerified', profile_row.is_demo or profile_row.phone_verified_at is not null,
    'verifiedPhone', profile_row.normalized_phone,
    'phoneVerifiedAt', profile_row.phone_verified_at,
    'remainingFreePickups', case when profile_row.is_demo then 0 else greatest(0, 5 - used_pickups) end,
    'eligibleCouponCodes', eligible_codes
  );
end;
$$;

revoke all on function public.get_customer_eligibility_v14() from public;
grant execute on function public.get_customer_eligibility_v14() to authenticated;

-- Atomic checkout. The public function name and parameter contract are kept.
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
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  profile_row public.profiles%rowtype;
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
  coupon_discount_value numeric(10,2) := 0;
  pickup_benefit_value numeric(10,2) := 0;
  total_discount_value numeric(10,2) := 0;
  total_value numeric(10,2) := 0;
  item_summary_value text := '';
  first_service_id text;
  first_service_name text;
  first_quantity integer := 1;
  estimated_pricing boolean := false;
  coupon_service_subtotal numeric(10,2) := 0;
  usage_value integer := 0;
  benefit_usage_value integer := 0;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into profile_row from public.profiles where id = current_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'ITEMS_REQUIRED'; end if;
  if p_payment_method not in ('cash_pickup', 'cash_delivery', 'promptpay') then raise exception 'INVALID_PAYMENT_METHOD'; end if;

  select * into address_row from public.addresses where id = p_address_id and user_id = current_user_id;
  if not found then raise exception 'ADDRESS_NOT_FOUND'; end if;

  select * into slot_row from public.pickup_slots where id = p_pickup_slot_id for update;
  if not found or not slot_row.enabled
    or slot_row.slot_date < (now() at time zone 'Asia/Bangkok')::date
    or slot_row.booked_count >= slot_row.capacity then
    raise exception 'PICKUP_SLOT_UNAVAILABLE';
  end if;

  select * into settings_row from public.business_settings where id = 1;
  fee_value := coalesce(settings_row.pickup_fee, 0) + coalesce(settings_row.delivery_fee, 0);

  for item in select * from jsonb_array_elements(p_items)
  loop
    begin
      item_quantity := (item ->> 'quantity')::numeric;
    exception when others then raise exception 'INVALID_QUANTITY'; end;
    if item_quantity is null or item_quantity < 1 or item_quantity > 99 then raise exception 'INVALID_QUANTITY'; end if;
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

  if not profile_row.is_demo and coalesce(settings_row.pickup_fee, 0) > 0 then
    select count(*) into benefit_usage_value
    from public.profile_pickup_benefit_usage b
    where b.user_id = current_user_id and b.restored_at is null;
    if benefit_usage_value < 5 then pickup_benefit_value := settings_row.pickup_fee; end if;
  end if;

  if nullif(trim(p_coupon_code), '') is not null then
    select * into coupon_row from public.coupons where upper(code) = upper(trim(p_coupon_code)) for update;
    if not found or not coupon_row.active
      or (coupon_row.starts_at is not null and coupon_row.starts_at > now())
      or (coupon_row.expires_at is not null and coupon_row.expires_at <= now())
      or subtotal_value < coupon_row.minimum_order
      or (coupon_row.total_usage_limit is not null and coupon_row.usage_count >= coupon_row.total_usage_limit) then
      raise exception 'COUPON_INVALID';
    end if;
    if coupon_row.service_id is not null and not exists (
      select 1 from jsonb_array_elements(p_items) x where x ->> 'serviceId' = coupon_row.service_id
    ) then raise exception 'COUPON_SERVICE_REQUIRED'; end if;

    select count(*) into usage_value from public.coupon_usage
    where user_id = current_user_id and coupon_code = coupon_row.code;
    if (coupon_row.per_customer_limit is not null and usage_value >= coupon_row.per_customer_limit)
      or (coupon_row.first_verified_profile_only and usage_value > 0) then
      raise exception 'COUPON_LIMIT_REACHED';
    end if;

    if coupon_row.service_id is not null then
      select coalesce(sum(s.price * (x ->> 'quantity')::numeric), 0)
      into coupon_service_subtotal
      from jsonb_array_elements(p_items) x
      join public.services s on s.id = x ->> 'serviceId'
      where s.id = coupon_row.service_id and s.enabled = true;
    end if;
    coupon_discount_value := case coupon_row.discount_type
      when 'percentage' then round(subtotal_value * coupon_row.discount_value / 100, 2)
      when 'fixed' then least(subtotal_value, coupon_row.discount_value)
      when 'free_pickup' then greatest(0, coalesce(settings_row.pickup_fee, 0) - pickup_benefit_value)
      when 'service_percentage' then round(coupon_service_subtotal * coupon_row.discount_value / 100, 2)
      else 0 end;
  end if;

  total_discount_value := coupon_discount_value + pickup_benefit_value;
  total_value := greatest(0, subtotal_value + fee_value - total_discount_value);

  insert into public.orders (
    user_id, service_id, service_name, quantity, item_summary, subtotal,
    express_fee, pickup_fee, delivery_fee, discount, pickup_benefit_discount, total, estimated_total,
    pickup_slot, pickup_slot_id, pickup_date, pickup_start, pickup_end,
    pickup_address, contact_phone, pickup_instructions, customer_comment,
    preferences, payment_method, payment_status, coupon_code, pricing_type,
    status, is_demo, express, priority
  ) values (
    current_user_id, first_service_id, first_service_name, first_quantity,
    item_summary_value, subtotal_value, 0, coalesce(settings_row.pickup_fee, 0),
    coalesce(settings_row.delivery_fee, 0), total_discount_value, pickup_benefit_value, total_value, total_value,
    to_char(slot_row.slot_date, 'YYYY-MM-DD') || ' · ' || to_char(slot_row.start_time, 'HH24:MI') || '–' || to_char(slot_row.end_time, 'HH24:MI'),
    slot_row.id, slot_row.slot_date, slot_row.start_time, slot_row.end_time,
    address_row.address_line,
    case when profile_row.is_demo then coalesce(p_contact_phone, '') else profile_row.normalized_phone end,
    coalesce(p_pickup_instructions, ''), coalesce(p_customer_comment, ''),
    coalesce(p_preferences, '{}'::jsonb), p_payment_method,
    case when p_payment_method = 'promptpay' and not profile_row.is_demo then 'waiting_verification' else 'pending' end,
    case when coupon_row.code is null then null else coupon_row.code end,
    case when estimated_pricing then 'estimated' else 'fixed' end,
    case when p_payment_method = 'promptpay' and not profile_row.is_demo then 'payment_verification_required' else 'requested' end,
    profile_row.is_demo, false, false
  ) returning * into new_order;

  for item in select * from jsonb_array_elements(p_items)
  loop
    item_quantity := (item ->> 'quantity')::numeric;
    select * into service_row from public.services where id = item ->> 'serviceId' and enabled = true;
    if not found then raise exception 'SERVICE_UNAVAILABLE'; end if;
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
    case when p_payment_method = 'promptpay' and not profile_row.is_demo then 'waiting_verification' else 'pending' end);

  if pickup_benefit_value > 0 then
    insert into public.profile_pickup_benefit_usage (user_id, order_id, amount)
    values (current_user_id, new_order.id, pickup_benefit_value);
  end if;

  if coupon_row.code is not null then
    insert into public.coupon_usage (coupon_code, user_id, order_id, discount_amount)
    values (coupon_row.code, current_user_id, new_order.id, coupon_discount_value);
    update public.coupons set usage_count = usage_count + 1 where code = coupon_row.code;
  end if;

  return jsonb_build_object(
    'id', new_order.id,
    'orderNumber', new_order.order_number,
    'total', total_value,
    'pickupBenefitDiscount', pickup_benefit_value,
    'remainingFreePickups', greatest(0, 5 - benefit_usage_value - case when pickup_benefit_value > 0 then 1 else 0 end)
  );
end;
$$;

create or replace function public.withdraw_order_v11(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare slot_id uuid;
begin
  update public.orders
  set status = 'withdrawn', withdrawn_at = now(), status_comment = 'Withdrawn by customer'
  where id = p_order_id and user_id = auth.uid()
    and status in ('requested', 'payment_verification_required')
  returning pickup_slot_id into slot_id;
  if not found then raise exception 'ORDER_CANNOT_BE_WITHDRAWN'; end if;

  if slot_id is not null then
    update public.pickup_slots set booked_count = greatest(0, booked_count - 1) where id = slot_id;
  end if;
  update public.profile_pickup_benefit_usage
  set restored_at = now(), restore_reason = 'Order withdrawn before pickup confirmation'
  where order_id = p_order_id and user_id = auth.uid() and restored_at is null;
end;
$$;

revoke all on function public.place_order_v11(jsonb, jsonb, uuid, uuid, text, text, text, text, text, boolean) from public;
grant execute on function public.place_order_v11(jsonb, jsonb, uuid, uuid, text, text, text, text, text, boolean) to authenticated;
revoke all on function public.withdraw_order_v11(uuid) from public;
grant execute on function public.withdraw_order_v11(uuid) to authenticated;

-- Upload validation ---------------------------------------------------------
create or replace function public.register_order_upload_v11(
  p_order_id uuid,
  p_file_type text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare upload_id uuid; payment_record_id uuid;
begin
  if p_file_type not in ('laundry_photo', 'stain_photo', 'payment_slip') then raise exception 'INVALID_FILE_TYPE'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'INVALID_FILE_FORMAT'; end if;
  if p_size_bytes <= 0 or p_size_bytes > 10485760 then raise exception 'FILE_TOO_LARGE'; end if;
  if not exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid()) then raise exception 'ORDER_NOT_FOUND'; end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text
    or split_part(p_storage_path, '/', 2) <> p_order_id::text
    or lower(storage.extension(p_storage_path)) not in ('jpg', 'jpeg', 'png', 'webp') then
    raise exception 'INVALID_STORAGE_PATH';
  end if;
  select id into payment_record_id from public.payments where order_id = p_order_id limit 1;
  insert into public.uploaded_files (user_id, order_id, payment_id, file_type, storage_path, mime_type, size_bytes)
  values (auth.uid(), p_order_id, case when p_file_type = 'payment_slip' then payment_record_id else null end,
    p_file_type, p_storage_path, p_mime_type, p_size_bytes)
  returning id into upload_id;
  if p_file_type = 'payment_slip' then
    update public.payments set slip_path = p_storage_path, status = 'waiting_verification' where order_id = p_order_id;
    update public.orders set payment_status = 'waiting_verification', status = 'payment_verification_required',
      status_comment = 'Payment slip uploaded' where id = p_order_id;
  end if;
  return upload_id;
end;
$$;

revoke all on function public.register_order_upload_v11(uuid, text, text, text, bigint) from public;
grant execute on function public.register_order_upload_v11(uuid, text, text, text, bigint) to authenticated;

drop policy if exists "customers_upload_own_order_files" on storage.objects;
create policy "customers_upload_own_order_files" on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.orders o
    where o.id::text = (storage.foldername(name))[2] and o.user_id = auth.uid()
  )
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and lower(coalesce(metadata ->> 'mimetype', '')) in ('image/jpeg', 'image/png', 'image/webp')
  and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 10485760
);

update public.business_settings set app_version = '1.4.0' where id = 1;
