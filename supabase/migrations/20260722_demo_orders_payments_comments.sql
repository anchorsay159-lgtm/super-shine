begin;

alter table public.orders
  add column if not exists payment_rejection_reason text not null default '';

-- Demo sessions use Supabase anonymous Auth. They receive an isolated auth.uid()
-- for RLS and Realtime, but remain marked as demo data throughout the schema.
create or replace function public.initialize_demo_session_v17()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'DEMO_SESSION_REQUIRED';
  end if;

  insert into public.profiles (id, full_name, email, phone, role, is_demo)
  values (
    current_user_id,
    'Demo Customer',
    'demo-' || replace(current_user_id::text, '-', '') || '@supershine.invalid',
    '',
    'customer',
    true
  )
  on conflict (id) do update set
    full_name = 'Demo Customer',
    role = 'customer',
    is_demo = true;

  return current_user_id;
end;
$$;

revoke all on function public.initialize_demo_session_v17() from public, anon;
grant execute on function public.initialize_demo_session_v17() to authenticated;

create or replace function public.protect_demo_profile_v17()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    if new.id is distinct from auth.uid() then raise exception 'DEMO_PROFILE_FORBIDDEN'; end if;
    new.role := 'customer';
    new.is_demo := true;
    new.phone := '';
    new.normalized_phone := null;
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_demo_v17 on public.profiles;
create trigger profiles_protect_demo_v17
before insert or update on public.profiles
for each row execute function public.protect_demo_profile_v17();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_customer_comment_length_v17'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_customer_comment_length_v17
      check (char_length(customer_comment) <= 1000) not valid;
  end if;
end;
$$;

-- This path deliberately does not call place_order_v11: it does not reserve a
-- pickup slot, consume coupons/free pickups, or create a payment record.
create or replace function public.place_demo_order_v17(
  p_items jsonb,
  p_preferences jsonb,
  p_pickup_slot_id uuid,
  p_pickup_address text,
  p_pickup_instructions text,
  p_contact_phone text,
  p_payment_method text,
  p_customer_comment text default '',
  p_simulated_discount numeric default 0,
  p_demo_coupon_code text default null
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
  settings_row public.business_settings%rowtype;
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
  note_value text := trim(coalesce(p_customer_comment, ''));
begin
  if current_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'DEMO_SESSION_REQUIRED';
  end if;

  select * into profile_row from public.profiles where id = current_user_id for update;
  if not found or not profile_row.is_demo or profile_row.role <> 'customer' then
    raise exception 'DEMO_PROFILE_REQUIRED';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEMS_REQUIRED';
  end if;
  if p_payment_method not in ('cash_pickup', 'cash_delivery', 'promptpay') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if char_length(note_value) > 1000 then raise exception 'ORDER_NOTE_TOO_LONG'; end if;
  if char_length(trim(coalesce(p_pickup_address, ''))) < 5 then raise exception 'ADDRESS_REQUIRED'; end if;

  select * into slot_row from public.pickup_slots where id = p_pickup_slot_id;
  if not found or not slot_row.enabled
    or slot_row.slot_date < (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'PICKUP_SLOT_UNAVAILABLE';
  end if;

  select * into settings_row from public.business_settings where id = 1;
  fee_value := coalesce(settings_row.pickup_fee, 0) + coalesce(settings_row.delivery_fee, 0);

  for item in select * from jsonb_array_elements(p_items)
  loop
    begin
      item_quantity := (item ->> 'quantity')::numeric;
    exception when others then raise exception 'INVALID_QUANTITY'; end;
    if item_quantity is null or item_quantity < 1 or item_quantity > 99 then
      raise exception 'INVALID_QUANTITY';
    end if;
    select * into service_row from public.services
    where id = item ->> 'serviceId' and enabled = true;
    if not found then raise exception 'SERVICE_UNAVAILABLE'; end if;
    subtotal_value := subtotal_value + service_row.price * item_quantity;
    estimated_pricing := estimated_pricing or service_row.pricing_type = 'estimated';
    item_summary_value := item_summary_value
      || case when item_summary_value = '' then '' else ', ' end
      || trim(to_char(item_quantity, 'FM999999990.##')) || ' × ' || service_row.name;
    if first_service_id is null then
      first_service_id := service_row.id;
      first_service_name := service_row.name;
      first_quantity := ceil(item_quantity)::integer;
    end if;
  end loop;

  discount_value := least(
    subtotal_value + fee_value,
    greatest(0, coalesce(p_simulated_discount, 0))
  );
  total_value := greatest(0, subtotal_value + fee_value - discount_value);

  insert into public.orders (
    user_id, service_id, service_name, quantity, item_summary, subtotal,
    express_fee, pickup_fee, delivery_fee, discount, pickup_benefit_discount,
    total, estimated_total, pickup_slot, pickup_slot_id, pickup_date,
    pickup_start, pickup_end, pickup_address, contact_phone,
    pickup_instructions, customer_comment, preferences, payment_method,
    payment_status, coupon_code, coupon_code_snapshot, pricing_type,
    price_approval_status, status, is_demo, express, priority
  ) values (
    current_user_id, first_service_id, first_service_name, first_quantity,
    item_summary_value, subtotal_value, 0, coalesce(settings_row.pickup_fee, 0),
    coalesce(settings_row.delivery_fee, 0), discount_value, 0,
    total_value, total_value,
    to_char(slot_row.slot_date, 'YYYY-MM-DD') || ' · '
      || to_char(slot_row.start_time, 'HH24:MI') || '–'
      || to_char(slot_row.end_time, 'HH24:MI'),
    slot_row.id, slot_row.slot_date, slot_row.start_time, slot_row.end_time,
    left(trim(p_pickup_address), 500), left(trim(coalesce(p_contact_phone, '')), 40),
    left(trim(coalesce(p_pickup_instructions, '')), 1000), note_value,
    coalesce(p_preferences, '{}'::jsonb), p_payment_method, 'pending', null,
    nullif(left(upper(trim(coalesce(p_demo_coupon_code, ''))), 40), ''),
    case when estimated_pricing then 'estimated' else 'fixed' end,
    'not_required', 'requested', true, false, false
  ) returning * into new_order;

  for item in select * from jsonb_array_elements(p_items)
  loop
    item_quantity := (item ->> 'quantity')::numeric;
    select * into service_row from public.services
    where id = item ->> 'serviceId' and enabled = true;
    insert into public.order_items (
      order_id, service_id, service_name, service_icon, quantity, price_unit,
      unit_price, line_total, pricing_type, preferences
    ) values (
      new_order.id, service_row.id, service_row.name, service_row.icon,
      item_quantity, service_row.price_unit, service_row.price,
      service_row.price * item_quantity, service_row.pricing_type,
      coalesce(item -> 'preferences', '{}'::jsonb)
    );
  end loop;

  return jsonb_build_object(
    'id', new_order.id,
    'orderNumber', new_order.order_number,
    'total', total_value
  );
end;
$$;

revoke all on function public.place_demo_order_v17(jsonb, jsonb, uuid, text, text, text, text, text, numeric, text) from public, anon;
grant execute on function public.place_demo_order_v17(jsonb, jsonb, uuid, text, text, text, text, text, numeric, text) to authenticated;

-- Correct the legacy PromptPay insert state without changing place_order_v11
-- or any of its price/coupon calculations.
create or replace function public.normalize_initial_payment_v17()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not new.is_demo and new.final_total is null then
    new.payment_status := 'pending';
    if new.status = 'payment_verification_required' then new.status := 'requested'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_normalize_initial_payment_v17 on public.orders;
create trigger orders_normalize_initial_payment_v17
before insert on public.orders
for each row execute function public.normalize_initial_payment_v17();

create or replace function public.normalize_payment_record_v17()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.orders o
    where o.id = new.order_id and not o.is_demo and o.final_total is null
  ) then
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_normalize_initial_v17 on public.payments;
create trigger payments_normalize_initial_v17
before insert on public.payments
for each row execute function public.normalize_payment_record_v17();

create or replace function public.admin_set_final_price_v17(
  p_order_id uuid,
  p_final_total numeric
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_row public.orders%rowtype;
  needs_approval boolean;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_final_total is null or p_final_total <= 0 then raise exception 'INVALID_FINAL_TOTAL'; end if;
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.status not in ('received', 'waiting_price_approval') then
    raise exception 'FINAL_PRICE_NOT_ALLOWED';
  end if;

  needs_approval := abs(p_final_total - coalesce(order_row.estimated_total, order_row.total, 0)) >= 0.01;
  update public.orders set
    final_total = p_final_total,
    total = case when needs_approval then total else p_final_total end,
    price_approval_status = case when needs_approval then 'pending' else 'approved' end,
    price_approved_at = case when needs_approval then null else now() end,
    payment_status = 'pending',
    payment_rejection_reason = '',
    status = case when needs_approval then 'waiting_price_approval' else 'received' end,
    status_comment = case when needs_approval
      then 'Final price submitted for customer approval'
      else 'Final price confirmed by admin' end
  where id = p_order_id;

  if not order_row.is_demo then
    update public.payments set amount = p_final_total, status = 'pending',
      rejection_reason = '', verified_by = null, verified_at = null
    where order_id = p_order_id;
  end if;
  return needs_approval;
end;
$$;

revoke all on function public.admin_set_final_price_v17(uuid, numeric) from public, anon, authenticated;
grant execute on function public.admin_set_final_price_v17(uuid, numeric) to authenticated;

create or replace function public.respond_to_price_v17(
  p_order_id uuid,
  p_approve boolean,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_row public.orders%rowtype;
begin
  select * into order_row from public.orders
  where id = p_order_id and user_id = auth.uid()
    and status = 'waiting_price_approval' and price_approval_status = 'pending'
  for update;
  if not found then raise exception 'PRICE_RESPONSE_NOT_ALLOWED'; end if;
  if order_row.is_demo is distinct from coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  update public.orders set
    price_approval_status = case when p_approve then 'approved' else 'rejected' end,
    price_approved_at = now(),
    price_response_note = left(trim(coalesce(p_note, '')), 1000),
    status = case when p_approve then 'received' else 'on_hold' end,
    total = case when p_approve then coalesce(final_total, estimated_total, total) else total end,
    payment_status = case when p_approve then 'pending' else payment_status end,
    payment_rejection_reason = case when p_approve then '' else payment_rejection_reason end,
    status_comment = case when p_approve
      then 'Final price approved by customer'
      else 'Final price rejected by customer' end
  where id = p_order_id;

  if p_approve and not order_row.is_demo then
    update public.payments set
      amount = coalesce(order_row.final_total, order_row.estimated_total, order_row.total),
      status = 'pending', rejection_reason = '', verified_by = null, verified_at = null
    where order_id = p_order_id;
  end if;
end;
$$;

revoke all on function public.respond_to_price_v17(uuid, boolean, text) from public, anon;
grant execute on function public.respond_to_price_v17(uuid, boolean, text) to authenticated;

create or replace function public.submit_demo_payment_v17(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'DEMO_SESSION_REQUIRED';
  end if;
  update public.orders set payment_status = 'waiting_verification',
    payment_rejection_reason = '',
    status_comment = 'Demo payment submitted for verification'
  where id = p_order_id and user_id = auth.uid() and is_demo
    and payment_method = 'promptpay' and final_total is not null
    and price_approval_status in ('approved', 'not_required')
    and payment_status in ('pending', 'rejected');
  if not found then raise exception 'DEMO_PAYMENT_NOT_ALLOWED'; end if;
end;
$$;

revoke all on function public.submit_demo_payment_v17(uuid) from public, anon;
grant execute on function public.submit_demo_payment_v17(uuid) to authenticated;

create or replace function public.withdraw_demo_order_v17(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'DEMO_SESSION_REQUIRED';
  end if;
  update public.orders set status = 'withdrawn', withdrawn_at = now(),
    status_comment = 'Demo order withdrawn by customer'
  where id = p_order_id and user_id = auth.uid() and is_demo
    and status in ('requested', 'payment_verification_required');
  if not found then raise exception 'ORDER_CANNOT_BE_WITHDRAWN'; end if;
end;
$$;

revoke all on function public.withdraw_demo_order_v17(uuid) from public, anon;
grant execute on function public.withdraw_demo_order_v17(uuid) to authenticated;

create or replace function public.register_order_upload_v17(
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
declare
  upload_id uuid;
  payment_record_id uuid;
  order_row public.orders%rowtype;
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'DEMO_FILE_UPLOAD_DISABLED';
  end if;
  if p_file_type not in ('laundry_photo', 'stain_photo', 'payment_slip') then
    raise exception 'INVALID_FILE_TYPE';
  end if;
  select * into order_row from public.orders
  where id = p_order_id and user_id = auth.uid() and not is_demo;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text then
    raise exception 'INVALID_STORAGE_PATH';
  end if;
  if p_file_type = 'payment_slip' and (
    order_row.payment_method <> 'promptpay'
    or order_row.final_total is null
    or order_row.price_approval_status not in ('approved', 'not_required')
    or order_row.payment_status not in ('pending', 'rejected')
  ) then raise exception 'PAYMENT_NOT_READY'; end if;

  select id into payment_record_id from public.payments where order_id = p_order_id limit 1;
  insert into public.uploaded_files (
    user_id, order_id, payment_id, file_type, storage_path, mime_type, size_bytes
  ) values (
    auth.uid(), p_order_id,
    case when p_file_type = 'payment_slip' then payment_record_id else null end,
    p_file_type, p_storage_path, p_mime_type, greatest(p_size_bytes, 0)
  ) returning id into upload_id;

  if p_file_type = 'payment_slip' then
    update public.payments set slip_path = p_storage_path,
      status = 'waiting_verification', rejection_reason = ''
    where order_id = p_order_id;
    update public.orders set payment_status = 'waiting_verification',
      payment_rejection_reason = '',
      status_comment = 'Payment slip uploaded'
    where id = p_order_id;
  end if;
  return upload_id;
end;
$$;

revoke all on function public.register_order_upload_v17(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.register_order_upload_v17(uuid, text, text, text, bigint) to authenticated;

create or replace function public.admin_update_payment_v17(
  p_order_id uuid,
  p_status text,
  p_rejection_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_row public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('verified', 'rejected', 'paid', 'refunded') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.payment_method = 'promptpay' and p_status in ('paid') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;
  if order_row.payment_method <> 'promptpay' and p_status in ('verified', 'rejected') then
    raise exception 'INVALID_PAYMENT_STATUS';
  end if;
  if order_row.payment_method = 'promptpay'
    and p_status in ('verified', 'rejected')
    and order_row.payment_status <> 'waiting_verification' then
    raise exception 'PAYMENT_NOT_SUBMITTED';
  end if;
  if order_row.payment_method <> 'promptpay' and p_status = 'paid'
    and (order_row.final_total is null or order_row.price_approval_status = 'pending') then
    raise exception 'PAYMENT_NOT_READY';
  end if;
  if p_status = 'refunded' and order_row.payment_status not in ('verified', 'paid') then
    raise exception 'PAYMENT_NOT_PAID';
  end if;
  if p_status = 'rejected' and char_length(trim(coalesce(p_rejection_reason, ''))) < 3 then
    raise exception 'REJECTION_REASON_REQUIRED';
  end if;

  update public.orders set payment_status = p_status,
    payment_rejection_reason = case when p_status = 'rejected'
      then left(trim(p_rejection_reason), 1000) else '' end,
    status_comment = case p_status
      when 'verified' then 'Payment verified by admin'
      when 'paid' then 'Cash payment collected by admin'
      when 'rejected' then 'Payment rejected by admin'
      else 'Payment refunded by admin' end
  where id = p_order_id;

  if order_row.is_demo then
    insert into public.notifications (
      user_id, order_id, type, title, body, link
    ) values (
      order_row.user_id, order_row.id, 'demo_payment_update',
      case when p_status in ('verified', 'paid') then 'Demo payment confirmed' else 'Demo payment update' end,
      case when p_status = 'rejected'
        then 'Demo payment rejected: ' || left(trim(p_rejection_reason), 300)
        else 'Your demo payment is now ' || replace(p_status, '_', ' ') || '.' end,
      '/order-tracking?orderId=' || order_row.id
    );
  else
    update public.payments set status = p_status,
      verified_by = case when p_status in ('verified', 'paid') then auth.uid() else null end,
      verified_at = case when p_status in ('verified', 'paid') then now() else null end,
      rejection_reason = case when p_status = 'rejected'
        then left(trim(p_rejection_reason), 1000) else '' end
    where order_id = p_order_id;
  end if;
end;
$$;

revoke all on function public.admin_update_payment_v17(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_payment_v17(uuid, text, text) to authenticated;

-- Tighten the existing shared message policy for permanent and anonymous users.
drop policy if exists "support_insert_customer_or_admin" on public.support_messages;
create policy "support_insert_customer_or_admin" on public.support_messages
for insert to authenticated
with check (
  (
    user_id = auth.uid() and sender_id = auth.uid() and sender_role = 'customer'
    and (
      (
        coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false
        and (
          order_id is null
          or exists (
            select 1 from public.orders o
            where o.id = order_id and o.user_id = auth.uid() and not o.is_demo
          )
        )
      )
      or (
        coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true
        and order_id is not null
        and exists (
          select 1 from public.orders o
          where o.id = order_id and o.user_id = auth.uid() and o.is_demo
        )
      )
    )
  )
  or (public.is_admin() and sender_id = auth.uid() and sender_role = 'admin')
);

-- Anonymous demo sessions may never put files in the private real-order bucket.
drop policy if exists "customers_upload_own_order_files" on storage.objects;
create policy "customers_upload_own_order_files" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'order-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false
);

-- Add a restrictive ownership boundary without replacing existing permissive
-- customer/admin read policies.
drop policy if exists "orders_demo_identity_boundary_v17" on public.orders;
create policy "orders_demo_identity_boundary_v17" on public.orders
as restrictive for select to authenticated
using (
  public.is_admin()
  or (
    user_id = auth.uid()
    and is_demo = coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'uploaded_files'
  ) then
    alter publication supabase_realtime add table public.uploaded_files;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
