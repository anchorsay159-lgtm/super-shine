begin;

alter table public.coupons
  add column if not exists discount_target text not null default 'service',
  add column if not exists max_discount numeric(10,2),
  add column if not exists eligible_service_ids text[] not null default '{}';

alter table public.coupons drop constraint if exists coupons_discount_type_check;
alter table public.coupons drop constraint if exists coupons_discount_type_v11_check;
alter table public.coupons drop constraint if exists coupons_discount_type_v15_check;
alter table public.coupons drop constraint if exists coupons_discount_target_v15_check;
alter table public.coupons drop constraint if exists coupons_discount_value_v15_check;
alter table public.coupons drop constraint if exists coupons_max_discount_v15_check;
alter table public.coupons drop constraint if exists coupons_free_target_v15_check;

update public.coupons
set discount_target = case when discount_type = 'free_pickup' then 'pickup_fee' else 'service' end,
    discount_value = case
      when discount_type = 'free_pickup' then 0
      when discount_type in ('percentage', 'service_percentage') then least(100, greatest(1, discount_value))
      else greatest(1, discount_value)
    end,
    discount_type = case
      when discount_type = 'fixed' then 'fixed_amount'
      when discount_type = 'free_pickup' then 'free'
      when discount_type = 'service_percentage' then 'percentage'
      else discount_type
    end,
    eligible_service_ids = case
      when cardinality(eligible_service_ids) > 0 then eligible_service_ids
      when service_id is null then '{}'
      else array[service_id]
    end;

alter table public.coupons
  add constraint coupons_discount_type_v15_check
    check (discount_type in ('percentage', 'fixed_amount', 'free')),
  add constraint coupons_discount_target_v15_check
    check (discount_target in ('service', 'pickup_fee', 'delivery_fee', 'pickup_and_delivery')),
  add constraint coupons_discount_value_v15_check
    check ((discount_type = 'free' and discount_value = 0)
      or (discount_type = 'percentage' and discount_value > 0 and discount_value <= 100)
      or (discount_type = 'fixed_amount' and discount_value > 0)),
  add constraint coupons_max_discount_v15_check
    check (max_discount is null or max_discount > 0),
  add constraint coupons_free_target_v15_check
    check (discount_type <> 'free' or discount_target <> 'service');

alter table public.orders
  add column if not exists pickup_benefit_discount numeric(10,2) not null default 0,
  add column if not exists coupon_code_snapshot text,
  add column if not exists coupon_title_snapshot text,
  add column if not exists coupon_discount_target text,
  add column if not exists coupon_discount_type text,
  add column if not exists coupon_discount_value numeric(10,2),
  add column if not exists coupon_max_discount numeric(10,2),
  add column if not exists coupon_discount_amount numeric(10,2) not null default 0;

create table if not exists public.profile_pickup_benefit_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restore_reason text
);

create index if not exists pickup_benefit_user_active_v15
on public.profile_pickup_benefit_usage(user_id, created_at)
where restored_at is null;

alter table public.profile_pickup_benefit_usage enable row level security;
drop policy if exists "pickup_benefit_read_own_or_admin" on public.profile_pickup_benefit_usage;
create policy "pickup_benefit_read_own_or_admin" on public.profile_pickup_benefit_usage
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "services_public_read_active" on public.services;
drop policy if exists "services_public_read_catalog" on public.services;
create policy "services_public_read_catalog" on public.services
for select to anon, authenticated
using (true);

create or replace function public.get_eligible_coupons_v15()
returns setof public.coupons
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select c.*
  from public.coupons c
  where auth.uid() is not null
    and c.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.expires_at is null or c.expires_at > now())
    and (c.total_usage_limit is null or c.usage_count < c.total_usage_limit)
    and (c.per_customer_limit is null or (
      select count(*)
      from public.coupon_usage u
      where u.user_id = auth.uid() and u.coupon_code = c.code
    ) < c.per_customer_limit)
  order by c.created_at, c.code;
$$;

revoke all on function public.get_eligible_coupons_v15() from public, anon;
grant execute on function public.get_eligible_coupons_v15() to authenticated;

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
  eligible_base_value numeric(10,2) := 0;
  eligible_service_subtotal numeric(10,2) := 0;
  item_summary_value text := '';
  first_service_id text;
  first_service_name text;
  first_quantity integer := 1;
  estimated_pricing boolean := false;
  usage_value integer := 0;
  benefit_usage_value integer := 0;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(p_is_demo, false) then raise exception 'DEMO_ORDER_DISABLED'; end if;

  select * into profile_row from public.profiles where id = current_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if profile_row.is_demo then raise exception 'DEMO_ORDER_DISABLED'; end if;
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

  if coalesce(settings_row.pickup_fee, 0) > 0 then
    select count(*) into benefit_usage_value
    from public.profile_pickup_benefit_usage b
    where b.user_id = current_user_id and b.restored_at is null;
    if benefit_usage_value < 5 then pickup_benefit_value := settings_row.pickup_fee; end if;
  end if;

  if nullif(trim(p_coupon_code), '') is not null then
    select * into coupon_row
    from public.coupons
    where upper(code) = upper(trim(p_coupon_code))
    for update;

    if not found or not coupon_row.active
      or (coupon_row.starts_at is not null and coupon_row.starts_at > now())
      or (coupon_row.expires_at is not null and coupon_row.expires_at <= now())
      or subtotal_value < coupon_row.minimum_order
      or (coupon_row.total_usage_limit is not null and coupon_row.usage_count >= coupon_row.total_usage_limit) then
      raise exception 'COUPON_INVALID';
    end if;

    if cardinality(coupon_row.eligible_service_ids) > 0 and not exists (
      select 1
      from jsonb_array_elements(p_items) x
      where x ->> 'serviceId' = any(coupon_row.eligible_service_ids)
    ) then
      raise exception 'COUPON_SERVICE_REQUIRED';
    end if;

    select count(*) into usage_value
    from public.coupon_usage
    where user_id = current_user_id and coupon_code = coupon_row.code;
    if coupon_row.per_customer_limit is not null and usage_value >= coupon_row.per_customer_limit then
      raise exception 'COUPON_LIMIT_REACHED';
    end if;

    select coalesce(sum(s.price * (x ->> 'quantity')::numeric), 0)
    into eligible_service_subtotal
    from jsonb_array_elements(p_items) x
    join public.services s on s.id = x ->> 'serviceId' and s.enabled = true
    where cardinality(coupon_row.eligible_service_ids) = 0
      or s.id = any(coupon_row.eligible_service_ids);

    eligible_base_value := case coupon_row.discount_target
      when 'service' then eligible_service_subtotal
      when 'pickup_fee' then greatest(0, coalesce(settings_row.pickup_fee, 0) - pickup_benefit_value)
      when 'delivery_fee' then greatest(0, coalesce(settings_row.delivery_fee, 0))
      when 'pickup_and_delivery' then greatest(0, coalesce(settings_row.pickup_fee, 0) - pickup_benefit_value) + greatest(0, coalesce(settings_row.delivery_fee, 0))
      else 0
    end;
    if eligible_base_value <= 0 then raise exception 'COUPON_TARGET_UNAVAILABLE'; end if;

    coupon_discount_value := case coupon_row.discount_type
      when 'percentage' then round(eligible_base_value * coupon_row.discount_value / 100, 2)
      when 'fixed_amount' then least(eligible_base_value, coupon_row.discount_value)
      when 'free' then eligible_base_value
      else 0
    end;
    if coupon_row.discount_type = 'percentage' and coupon_row.max_discount is not null then
      coupon_discount_value := least(coupon_discount_value, coupon_row.max_discount);
    end if;
    coupon_discount_value := least(eligible_base_value, greatest(0, coupon_discount_value));
  end if;

  total_discount_value := coupon_discount_value + pickup_benefit_value;
  total_value := greatest(0, subtotal_value + fee_value - total_discount_value);

  insert into public.orders (
    user_id, service_id, service_name, quantity, item_summary, subtotal,
    express_fee, pickup_fee, delivery_fee, discount, pickup_benefit_discount, total, estimated_total,
    pickup_slot, pickup_slot_id, pickup_date, pickup_start, pickup_end,
    pickup_address, contact_phone, pickup_instructions, customer_comment,
    preferences, payment_method, payment_status, coupon_code,
    coupon_code_snapshot, coupon_title_snapshot, coupon_discount_target, coupon_discount_type,
    coupon_discount_value, coupon_max_discount, coupon_discount_amount,
    pricing_type, status, is_demo, express, priority
  ) values (
    current_user_id, first_service_id, first_service_name, first_quantity,
    item_summary_value, subtotal_value, 0, coalesce(settings_row.pickup_fee, 0),
    coalesce(settings_row.delivery_fee, 0), total_discount_value, pickup_benefit_value, total_value, total_value,
    to_char(slot_row.slot_date, 'YYYY-MM-DD') || ' · ' || to_char(slot_row.start_time, 'HH24:MI') || '–' || to_char(slot_row.end_time, 'HH24:MI'),
    slot_row.id, slot_row.slot_date, slot_row.start_time, slot_row.end_time,
    address_row.address_line, coalesce(nullif(trim(p_contact_phone), ''), profile_row.phone, ''),
    coalesce(p_pickup_instructions, ''), coalesce(p_customer_comment, ''),
    coalesce(p_preferences, '{}'::jsonb), p_payment_method,
    case when p_payment_method = 'promptpay' then 'waiting_verification' else 'pending' end,
    coupon_row.code, coupon_row.code, coupon_row.title, coupon_row.discount_target, coupon_row.discount_type,
    coupon_row.discount_value, coupon_row.max_discount, coupon_discount_value,
    case when estimated_pricing then 'estimated' else 'fixed' end,
    case when p_payment_method = 'promptpay' then 'payment_verification_required' else 'requested' end,
    false, false, false
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
    case when p_payment_method = 'promptpay' then 'waiting_verification' else 'pending' end);

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
    'couponDiscount', coupon_discount_value,
    'pickupBenefitDiscount', pickup_benefit_value
  );
end;
$$;

revoke all on function public.place_order_v11(jsonb, jsonb, uuid, uuid, text, text, text, text, text, boolean) from public;
grant execute on function public.place_order_v11(jsonb, jsonb, uuid, uuid, text, text, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
