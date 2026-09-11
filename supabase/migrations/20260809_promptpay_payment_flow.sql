begin;

-- PromptPay remains a merchant QR with staff confirmation. These fields make
-- the payment attempt explicit without pretending that a static QR is a gateway.
alter table public.business_settings
  add column if not exists promptpay_enabled boolean not null default false,
  add column if not exists promptpay_display_name text not null default '',
  add column if not exists promptpay_identifier text not null default '',
  add column if not exists promptpay_instructions text not null default '',
  add column if not exists promptpay_attempt_minutes integer not null default 15;

update public.business_settings
set promptpay_enabled = promptpay_qr_path is not null
where promptpay_qr_path is not null and not promptpay_enabled;

alter table public.business_settings drop constraint if exists business_settings_promptpay_attempt_minutes_check;
alter table public.business_settings add constraint business_settings_promptpay_attempt_minutes_check
  check (promptpay_attempt_minutes between 5 and 120);

alter table public.orders
  add column if not exists amount_paid numeric(10,2) not null default 0,
  add column if not exists payment_reference text,
  add column if not exists payment_attempt_number integer not null default 0,
  add column if not exists payment_expires_at timestamptz,
  add column if not exists payment_confirmation_requested_at timestamptz,
  add column if not exists payment_failure_reason text not null default '',
  add column if not exists payment_confirmed_amount numeric(10,2);

alter table public.payments
  add column if not exists attempt_number integer not null default 0,
  add column if not exists expires_at timestamptz,
  add column if not exists confirmation_requested_at timestamptz,
  add column if not exists failure_reason text not null default '',
  add column if not exists payment_reference text,
  add column if not exists confirmed_amount numeric(10,2),
  add column if not exists confirmation_source text not null default '';

-- The v18 trigger and status constraints only understand the legacy vocabulary.
-- Remove them inside this transaction before translating existing rows. They are
-- replaced below after all delivered balances have been made v19-compatible.
drop trigger if exists orders_financial_closure_v18 on public.orders;
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders drop constraint if exists orders_payment_status_v18_check;
alter table public.orders drop constraint if exists orders_payment_status_v19_check;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments drop constraint if exists payments_status_v18_check;
alter table public.payments drop constraint if exists payments_status_v19_check;

-- Normalize old vocabulary before installing the new constraints.
update public.orders set payment_confirmation_requested_at = coalesce(payment_confirmation_requested_at, updated_at)
where payment_status in ('waiting_verification', 'verified');
update public.payments set confirmation_requested_at = coalesce(confirmation_requested_at, updated_at)
where status in ('waiting_verification', 'verified');

update public.orders set payment_status = case payment_status
  when 'waiting_verification' then 'pending'
  when 'verified' then 'paid'
  when 'rejected' then 'failed'
  when 'outstanding' then 'unpaid'
  when 'pending' then case when payment_confirmation_requested_at is not null then 'pending' else 'unpaid' end
  else payment_status end;
update public.payments set status = case status
  when 'waiting_verification' then 'pending'
  when 'verified' then 'paid'
  when 'rejected' then 'failed'
  when 'outstanding' then 'unpaid'
  when 'pending' then case when confirmation_requested_at is not null or slip_path is not null then 'pending' else 'unpaid' end
  else status end;

update public.orders set amount_paid = coalesce(final_total, estimated_total, total, 0)
where payment_status in ('paid', 'refunded') and amount_paid = 0;
update public.payments set confirmed_amount = amount
where status in ('paid', 'refunded') and confirmed_amount is null;

-- Preserve valid financial closure for legacy delivered orders. A zero-balance
-- order is settled; otherwise retain an explicit receivable and audit reason.
update public.orders set
  payment_status = case
    when coalesce(amount_paid, 0) >= coalesce(final_total, estimated_total, total, 0) then 'paid'
    else payment_status
  end,
  outstanding_amount = greatest(
    coalesce(final_total, estimated_total, total, 0) - coalesce(amount_paid, 0),
    0
  ),
  outstanding_since = case
    when coalesce(amount_paid, 0) < coalesce(final_total, estimated_total, total, 0)
      then coalesce(outstanding_since, updated_at, now())
    else null
  end,
  outstanding_reason = case
    when coalesce(amount_paid, 0) < coalesce(final_total, estimated_total, total, 0)
      then coalesce(nullif(trim(outstanding_reason), ''), 'Delivered before payment was recorded')
    else ''
  end,
  paid_at = case
    when coalesce(amount_paid, 0) >= coalesce(final_total, estimated_total, total, 0)
      then coalesce(paid_at, updated_at, now())
    else paid_at
  end
where status = 'delivered' and payment_status in ('unpaid', 'partially_paid');

alter table public.orders add constraint orders_payment_status_v19_check check (payment_status in (
  'unpaid', 'pending', 'paid', 'partially_paid', 'failed', 'expired', 'refunded'
));

alter table public.payments add constraint payments_status_v19_check check (status in (
  'unpaid', 'pending', 'paid', 'partially_paid', 'failed', 'expired', 'refunded'
));

alter table public.payments drop constraint if exists payments_confirmation_source_check;
alter table public.payments add constraint payments_confirmation_source_check check (
  confirmation_source in ('', 'admin_bank_check', 'cash_handoff', 'accounting_collection', 'slip_fallback')
);

create or replace function public.promptpay_reference_v19(p_order_number text, p_attempt integer)
returns text language sql immutable set search_path = public, pg_temp as $$
  select 'PP-' || upper(regexp_replace(coalesce(p_order_number, 'ORDER'), '[^a-zA-Z0-9]', '', 'g'))
    || '-' || greatest(1, coalesce(p_attempt, 1))::text
$$;

create or replace function public.normalize_initial_payment_v17()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare attempt_minutes integer := 15;
begin
  if new.status = 'payment_verification_required' then new.status := 'requested'; end if;
  if new.is_demo then
    new.payment_status := 'unpaid';
    return new;
  end if;

  new.payment_status := 'unpaid';
  if new.pricing_type = 'fixed' then
    new.final_total := coalesce(new.final_total, new.estimated_total, new.total, 0);
    new.total := new.final_total;
    new.price_approval_status := 'not_required';
  end if;

  if new.payment_method = 'promptpay' and new.final_total is not null then
    select promptpay_attempt_minutes into attempt_minutes from public.business_settings where id = 1;
    new.payment_attempt_number := greatest(new.payment_attempt_number, 1);
    new.payment_reference := public.promptpay_reference_v19(new.order_number, new.payment_attempt_number);
    new.payment_expires_at := now() + make_interval(mins => coalesce(attempt_minutes, 15));
  end if;
  return new;
end;
$$;

create or replace function public.normalize_payment_record_v17()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype;
begin
  select * into order_row from public.orders where id = new.order_id;
  if found then
    new.status := order_row.payment_status;
    new.attempt_number := order_row.payment_attempt_number;
    new.expires_at := order_row.payment_expires_at;
    new.payment_reference := order_row.payment_reference;
  end if;
  return new;
end;
$$;

create or replace function public.prepare_promptpay_attempt_v19(p_order_id uuid, p_force_new boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; settings_row public.business_settings%rowtype;
  next_attempt integer; next_reference text; next_expiry timestamptz;
begin
  select * into order_row from public.orders where id = p_order_id and user_id = auth.uid() and not is_demo for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.payment_method <> 'promptpay' then raise exception 'PROMPTPAY_NOT_SELECTED'; end if;
  if order_row.final_total is null or order_row.price_approval_status not in ('approved', 'not_required') then
    raise exception 'FINAL_PRICE_REQUIRED';
  end if;
  if order_row.payment_status in ('paid', 'refunded', 'partially_paid') then raise exception 'PAYMENT_ALREADY_PROGRESSED'; end if;
  select * into settings_row from public.business_settings where id = 1;
  if not coalesce(settings_row.promptpay_enabled, false) or settings_row.promptpay_qr_path is null then
    raise exception 'PROMPTPAY_NOT_CONFIGURED';
  end if;
  if not p_force_new and order_row.payment_reference is not null and order_row.payment_expires_at > now()
    and order_row.payment_status = 'unpaid' then
    return jsonb_build_object('reference', order_row.payment_reference, 'expiresAt', order_row.payment_expires_at);
  end if;
  if order_row.payment_status = 'pending' and order_row.payment_confirmation_requested_at is not null then
    raise exception 'PAYMENT_CONFIRMATION_PENDING';
  end if;
  next_attempt := greatest(order_row.payment_attempt_number + 1, 1);
  next_reference := public.promptpay_reference_v19(order_row.order_number, next_attempt);
  next_expiry := now() + make_interval(mins => coalesce(settings_row.promptpay_attempt_minutes, 15));
  update public.orders set payment_status = 'unpaid', payment_attempt_number = next_attempt,
    payment_reference = next_reference, payment_expires_at = next_expiry,
    payment_confirmation_requested_at = null, payment_failure_reason = '', payment_rejection_reason = '',
    payment_confirmed_amount = null, updated_at = now()
  where id = p_order_id;
  update public.payments set status = 'unpaid', attempt_number = next_attempt,
    payment_reference = next_reference, expires_at = next_expiry,
    confirmation_requested_at = null, failure_reason = '', rejection_reason = '',
    confirmed_amount = null, confirmation_source = '', updated_at = now()
  where order_id = p_order_id;
  return jsonb_build_object('reference', next_reference, 'expiresAt', next_expiry);
end;
$$;

create or replace function public.request_promptpay_confirmation_v19(p_order_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype;
begin
  select * into order_row from public.orders where id = p_order_id and user_id = auth.uid() and not is_demo for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.payment_method <> 'promptpay' or order_row.final_total is null
    or order_row.price_approval_status not in ('approved', 'not_required') then raise exception 'PAYMENT_NOT_READY'; end if;
  if order_row.payment_status = 'pending' and order_row.payment_confirmation_requested_at is not null then return 'pending'; end if;
  if order_row.payment_status not in ('unpaid', 'failed', 'expired') then raise exception 'PAYMENT_NOT_CONFIRMABLE'; end if;
  if order_row.payment_expires_at is null or order_row.payment_expires_at <= now() then
    update public.orders set payment_status = 'expired', payment_failure_reason = 'PromptPay QR expired', updated_at = now() where id = p_order_id;
    update public.payments set status = 'expired', failure_reason = 'PromptPay QR expired', updated_at = now() where order_id = p_order_id;
    return 'expired';
  end if;
  update public.orders set payment_status = 'pending', payment_confirmation_requested_at = now(),
    payment_failure_reason = '', payment_rejection_reason = '', updated_at = now() where id = p_order_id;
  update public.payments set status = 'pending', confirmation_requested_at = now(),
    failure_reason = '', rejection_reason = '', updated_at = now() where order_id = p_order_id;
  return 'pending';
end;
$$;

create or replace function public.customer_change_payment_method_v19(p_order_id uuid, p_method text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype;
begin
  if p_method not in ('cash_pickup', 'cash_delivery', 'promptpay') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  select * into order_row from public.orders where id = p_order_id and user_id = auth.uid() and not is_demo for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.payment_status in ('paid', 'partially_paid', 'refunded') then raise exception 'PAYMENT_METHOD_LOCKED'; end if;
  if order_row.status in ('delivered', 'completed', 'rejected', 'withdrawn') then raise exception 'PAYMENT_METHOD_LOCKED'; end if;
  if p_method = 'cash_pickup' and order_row.status not in ('requested', 'pickup_confirmed') then raise exception 'CASH_PICKUP_NOT_AVAILABLE'; end if;
  update public.orders set payment_method = p_method, payment_status = 'unpaid',
    payment_reference = null, payment_expires_at = null, payment_confirmation_requested_at = null,
    payment_failure_reason = '', payment_rejection_reason = '', payment_confirmed_amount = null,
    updated_at = now() where id = p_order_id;
  update public.payments set method = p_method, status = 'unpaid', payment_reference = null,
    expires_at = null, confirmation_requested_at = null, failure_reason = '', rejection_reason = '',
    confirmed_amount = null, confirmation_source = '', updated_at = now() where order_id = p_order_id;
  if p_method = 'promptpay' then perform public.prepare_promptpay_attempt_v19(p_order_id, true); end if;
end;
$$;

create or replace function public.respond_to_price_v17(p_order_id uuid, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; attempt_minutes integer := 15; next_reference text;
begin
  select * into order_row from public.orders where id = p_order_id and user_id = auth.uid() and not is_demo for update;
  if not found or order_row.status <> 'waiting_price_approval' or order_row.price_approval_status <> 'pending' then
    raise exception 'PRICE_RESPONSE_NOT_ALLOWED';
  end if;
  if p_approve and order_row.final_total is null then raise exception 'FINAL_PRICE_REQUIRED'; end if;
  if p_approve and order_row.payment_method = 'promptpay' then
    select promptpay_attempt_minutes into attempt_minutes from public.business_settings where id = 1;
    next_reference := public.promptpay_reference_v19(order_row.order_number, order_row.payment_attempt_number + 1);
  end if;
  update public.orders set
    price_approval_status = case when p_approve then 'approved' else 'rejected' end,
    price_approved_at = case when p_approve then now() else null end,
    status = case when p_approve then 'received' else 'on_hold' end,
    total = case when p_approve then final_total else total end,
    payment_status = 'unpaid', payment_rejection_reason = '', payment_failure_reason = '',
    payment_attempt_number = case when p_approve and payment_method = 'promptpay' then payment_attempt_number + 1 else payment_attempt_number end,
    payment_reference = case when p_approve and payment_method = 'promptpay' then next_reference else null end,
    payment_expires_at = case when p_approve and payment_method = 'promptpay' then now() + make_interval(mins => coalesce(attempt_minutes, 15)) else null end,
    payment_confirmation_requested_at = null,
    status_comment = left(coalesce(nullif(trim(p_note), ''), case when p_approve then 'Final price approved by customer' else 'Final price rejected by customer' end), 1000),
    updated_at = now()
  where id = p_order_id;
  update public.payments set amount = coalesce(order_row.final_total, amount), status = 'unpaid',
    attempt_number = case when p_approve and order_row.payment_method = 'promptpay' then order_row.payment_attempt_number + 1 else attempt_number end,
    payment_reference = case when p_approve and order_row.payment_method = 'promptpay' then next_reference else null end,
    expires_at = case when p_approve and order_row.payment_method = 'promptpay' then now() + make_interval(mins => coalesce(attempt_minutes, 15)) else null end,
    confirmation_requested_at = null, failure_reason = '', rejection_reason = '', confirmation_source = '', updated_at = now()
  where order_id = p_order_id;
end;
$$;

create or replace function public.admin_set_final_price_v18(p_order_id uuid, p_final_total numeric)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; needs_approval boolean; attempt_minutes integer := 15; next_reference text;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_final_total is null or p_final_total < 0 then raise exception 'INVALID_FINAL_TOTAL'; end if;
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.status not in ('received', 'waiting_price_approval') or order_row.payment_status in ('paid', 'partially_paid', 'refunded') then
    raise exception 'FINAL_PRICE_NOT_ALLOWED';
  end if;
  needs_approval := abs(p_final_total - coalesce(order_row.estimated_total, order_row.total, 0)) >= 0.01;
  if not needs_approval and order_row.payment_method = 'promptpay' then
    select promptpay_attempt_minutes into attempt_minutes from public.business_settings where id = 1;
    next_reference := public.promptpay_reference_v19(order_row.order_number, order_row.payment_attempt_number + 1);
  end if;
  update public.orders set final_total = p_final_total,
    total = case when needs_approval then total else p_final_total end,
    price_approval_status = case when needs_approval then 'pending' else 'approved' end,
    price_approved_at = case when needs_approval then null else now() end,
    payment_status = 'unpaid', payment_rejection_reason = '', payment_failure_reason = '', amount_paid = 0,
    payment_attempt_number = case when not needs_approval and payment_method = 'promptpay' then payment_attempt_number + 1 else payment_attempt_number end,
    payment_reference = case when not needs_approval and payment_method = 'promptpay' then next_reference else null end,
    payment_expires_at = case when not needs_approval and payment_method = 'promptpay' then now() + make_interval(mins => coalesce(attempt_minutes, 15)) else null end,
    payment_confirmation_requested_at = null, payment_confirmed_amount = null,
    outstanding_amount = 0, outstanding_since = null, outstanding_reason = '',
    status = case when needs_approval then 'waiting_price_approval' when status = 'waiting_price_approval' then 'received' else status end,
    status_comment = case when needs_approval then 'Final price submitted for customer approval' else 'Final price confirmed by admin' end,
    updated_at = now() where id = p_order_id;
  if not order_row.is_demo then
    update public.payments set amount = p_final_total, status = 'unpaid', rejection_reason = '', failure_reason = '',
      verified_by = null, verified_at = null, paid_at = null, confirmed_amount = null, confirmation_source = '',
      attempt_number = case when not needs_approval and order_row.payment_method = 'promptpay' then order_row.payment_attempt_number + 1 else attempt_number end,
      payment_reference = case when not needs_approval and order_row.payment_method = 'promptpay' then next_reference else null end,
      expires_at = case when not needs_approval and order_row.payment_method = 'promptpay' then now() + make_interval(mins => coalesce(attempt_minutes, 15)) else null end,
      confirmation_requested_at = null, updated_at = now() where order_id = p_order_id;
  end if;
  return needs_approval;
end;
$$;

create or replace function public.register_order_upload_v17(
  p_order_id uuid, p_file_type text, p_storage_path text, p_mime_type text, p_size_bytes bigint default 0
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; payment_record_id uuid; file_id uuid;
begin
  if p_file_type not in ('laundry_photo', 'stain_photo', 'payment_slip') then raise exception 'INVALID_FILE_TYPE'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') or p_size_bytes <= 0 or p_size_bytes > 10485760 then raise exception 'INVALID_FILE'; end if;
  select * into order_row from public.orders where id = p_order_id and user_id = auth.uid() and not is_demo for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_file_type = 'payment_slip' and (
    order_row.payment_method <> 'promptpay' or order_row.final_total is null
    or order_row.price_approval_status not in ('approved', 'not_required')
    or order_row.payment_status not in ('unpaid', 'pending', 'failed', 'expired')
  ) then raise exception 'PAYMENT_SLIP_NOT_ALLOWED'; end if;
  select id into payment_record_id from public.payments where order_id = p_order_id;
  insert into public.uploaded_files(user_id, order_id, payment_id, file_type, storage_path, mime_type, size_bytes)
  values (auth.uid(), p_order_id, case when p_file_type = 'payment_slip' then payment_record_id else null end,
    p_file_type, p_storage_path, p_mime_type, p_size_bytes) returning id into file_id;
  if p_file_type = 'payment_slip' then
    update public.orders set payment_status = 'pending', payment_confirmation_requested_at = now(),
      payment_failure_reason = '', payment_rejection_reason = '', updated_at = now() where id = p_order_id;
    update public.payments set slip_path = p_storage_path, status = 'pending', confirmation_requested_at = now(),
      failure_reason = '', rejection_reason = '', confirmation_source = 'slip_fallback', updated_at = now()
    where order_id = p_order_id;
  end if;
  return file_id;
end;
$$;

create or replace function public.admin_update_payment_v19(
  p_order_id uuid, p_status text, p_reason text default '', p_confirmed_amount numeric default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; due numeric(10,2); mismatch boolean := false;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_status not in ('paid', 'failed', 'refunded') then raise exception 'INVALID_PAYMENT_STATUS'; end if;
  due := coalesce(order_row.final_total, order_row.estimated_total, order_row.total, 0);
  if p_status in ('paid', 'failed') and (order_row.payment_method <> 'promptpay' or order_row.payment_status <> 'pending') then
    raise exception 'PAYMENT_NOT_PENDING';
  end if;
  if p_status = 'refunded' and order_row.payment_status <> 'paid' then raise exception 'PAYMENT_NOT_PAID'; end if;
  if p_status = 'failed' and char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'FAILURE_REASON_REQUIRED'; end if;
  if p_status = 'paid' and p_confirmed_amount is not null and abs(p_confirmed_amount - due) >= 0.01 then
    mismatch := true; p_status := 'failed'; p_reason := 'Amount mismatch: expected ' || due::text || ', received ' || p_confirmed_amount::text;
  end if;
  update public.orders set payment_status = p_status,
    amount_paid = case when p_status = 'paid' then due when p_status = 'refunded' then 0 else amount_paid end,
    paid_at = case when p_status = 'paid' then now() else paid_at end,
    payment_updated_by = auth.uid(), payment_confirmed_amount = p_confirmed_amount,
    payment_failure_reason = case when p_status = 'failed' then left(trim(p_reason), 1000) else '' end,
    payment_rejection_reason = case when p_status = 'failed' then left(trim(p_reason), 1000) else '' end,
    outstanding_amount = case when p_status = 'paid' then 0 else outstanding_amount end,
    outstanding_since = case when p_status = 'paid' then null else outstanding_since end,
    outstanding_reason = case when p_status = 'paid' then '' else outstanding_reason end,
    status_comment = case when p_status = 'paid' then 'PromptPay payment confirmed by admin'
      when p_status = 'failed' and mismatch then 'PromptPay amount mismatch'
      when p_status = 'failed' then 'PromptPay confirmation failed'
      else 'Payment refunded by admin' end, updated_at = now()
  where id = p_order_id;
  if not order_row.is_demo then
    update public.payments set status = p_status, confirmed_amount = p_confirmed_amount,
      verified_by = case when p_status = 'paid' then auth.uid() else null end,
      verified_at = case when p_status = 'paid' then now() else null end,
      paid_at = case when p_status = 'paid' then now() else paid_at end,
      failure_reason = case when p_status = 'failed' then left(trim(p_reason), 1000) else '' end,
      rejection_reason = case when p_status = 'failed' then left(trim(p_reason), 1000) else '' end,
      confirmation_source = case when p_status = 'paid' then 'admin_bank_check' else confirmation_source end,
      updated_at = now() where order_id = p_order_id;
  end if;
end;
$$;

create or replace function public.admin_update_payment_v18(p_order_id uuid, p_status text, p_rejection_reason text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.admin_update_payment_v19(p_order_id,
    case when p_status = 'verified' then 'paid' when p_status = 'rejected' then 'failed' else p_status end,
    p_rejection_reason, null);
end;
$$;

create or replace function public.admin_handoff_order_v18(p_order_id uuid, p_payment_received boolean, p_reason text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; next_status text; due numeric(10,2);
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  due := coalesce(order_row.final_total, order_row.estimated_total, order_row.total, 0);
  if p_payment_received then
    if order_row.payment_method = 'cash_pickup' and order_row.status = 'pickup_confirmed' then next_status := 'picked_up';
    elsif order_row.payment_method = 'cash_delivery' and order_row.status = 'out_for_delivery' then next_status := 'delivered';
    else raise exception 'CASH_HANDOFF_NOT_ALLOWED'; end if;
  else
    if order_row.status <> 'out_for_delivery' then raise exception 'DELIVERY_NOT_ALLOWED'; end if;
    if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'OUTSTANDING_REASON_REQUIRED'; end if;
    next_status := 'delivered';
  end if;
  update public.orders set status = next_status, payment_status = case when p_payment_received then 'paid' else 'unpaid' end,
    amount_paid = case when p_payment_received then due else 0 end,
    paid_at = case when p_payment_received then now() else null end, payment_updated_by = auth.uid(),
    outstanding_amount = case when p_payment_received then 0 else due end,
    outstanding_since = case when p_payment_received then null else now() end,
    outstanding_reason = case when p_payment_received then '' else left(trim(p_reason), 1000) end,
    status_comment = case when p_payment_received then 'Cash received at handoff' else 'Delivered with payment unpaid' end,
    updated_at = now() where id = p_order_id;
  if not order_row.is_demo then
    update public.payments set status = case when p_payment_received then 'paid' else 'unpaid' end,
      confirmed_amount = case when p_payment_received then due else null end,
      verified_by = case when p_payment_received then auth.uid() else null end,
      verified_at = case when p_payment_received then now() else null end,
      paid_at = case when p_payment_received then now() else null end,
      confirmation_source = case when p_payment_received then 'cash_handoff' else '' end,
      updated_at = now() where order_id = p_order_id;
  end if;
end;
$$;

create or replace function public.admin_record_payment_received_v18(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; due numeric(10,2);
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into order_row from public.orders where id = p_order_id and payment_status in ('unpaid', 'partially_paid')
    and outstanding_amount > 0 for update;
  if not found then raise exception 'PAYMENT_NOT_OUTSTANDING'; end if;
  due := coalesce(order_row.final_total, order_row.estimated_total, order_row.total, 0);
  update public.orders set payment_status = 'paid', amount_paid = due, paid_at = now(), payment_updated_by = auth.uid(),
    outstanding_amount = 0, outstanding_since = null, outstanding_reason = '',
    status_comment = 'Outstanding payment received', updated_at = now() where id = p_order_id;
  if not order_row.is_demo then
    update public.payments set status = 'paid', confirmed_amount = due, verified_by = auth.uid(),
      verified_at = now(), paid_at = now(), confirmation_source = 'cash_handoff', updated_at = now()
    where order_id = p_order_id;
  end if;
end;
$$;

-- Accounting remains the authoritative posting path for collections entered in
-- the accounting console. The same transaction also updates the operational
-- payment state so a collection cannot be posted without the order reflecting it.
create or replace function public.record_accounting_collection(
  p_order_id uuid, p_amount numeric, p_method text, p_reference text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_invoice public.accounting_invoices%rowtype;
  v_event uuid;
  v_entry uuid;
  v_party text;
  v_outstanding numeric(14,2);
  v_due numeric(14,2);
  v_new_paid numeric(14,2);
  v_status text;
begin
  if not public.has_accounting_role(array['owner','accountant','cashier']) then raise exception 'PAYMENT_RECORDING_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if p_method not in ('cash','bank') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if char_length(trim(coalesce(p_reference,''))) < 3 then raise exception 'PAYMENT_REFERENCE_REQUIRED'; end if;

  select * into v_order from public.orders where id = p_order_id and not is_demo for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_invoice from public.accounting_invoices where order_id = p_order_id for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;

  v_outstanding := greatest(0, v_invoice.total_amount - v_invoice.paid_amount - v_invoice.refund_amount);
  if p_amount > v_outstanding then raise exception 'PAYMENT_ABOVE_OUTSTANDING_BALANCE'; end if;
  if exists(select 1 from public.accounting_receipts where payment_reference = trim(p_reference)) then
    raise exception 'DUPLICATE_PAYMENT_REFERENCE';
  end if;

  select full_name into v_party from public.profiles where id = v_order.user_id;
  v_event := public.enqueue_accounting_event(
    'collection:' || lower(trim(p_reference)), 'admin_web', 'accounting_collection', trim(p_reference), '1',
    'receivable_collected', case when p_method = 'bank' then 'payment_after_service_bank' else 'payment_after_service_cash' end,
    v_order.id, v_order.order_number, v_order.user_id, v_party, now(), 'confirmed_receivable_collection',
    jsonb_build_object('paid_amount', p_amount, 'payment_reference', trim(p_reference), 'payment_method', p_method), auth.uid()
  );
  v_entry := public.post_accounting_event(v_event);
  if v_entry is null then raise exception 'COLLECTION_POSTING_FAILED'; end if;

  v_due := coalesce(v_order.final_total, v_order.estimated_total, v_order.total, 0);
  v_new_paid := least(v_due, coalesce(v_order.amount_paid, 0) + p_amount);
  v_status := case when v_new_paid >= v_due then 'paid' else 'partially_paid' end;
  update public.orders set
    payment_status = v_status,
    amount_paid = v_new_paid,
    outstanding_amount = greatest(0, v_due - v_new_paid),
    outstanding_since = case when v_new_paid < v_due then coalesce(outstanding_since, now()) else null end,
    outstanding_reason = case when v_new_paid < v_due then 'Partially paid' else '' end,
    paid_at = case when v_new_paid >= v_due then now() else paid_at end,
    payment_updated_by = auth.uid(),
    updated_at = now()
  where id = p_order_id;
  update public.payments set
    status = v_status,
    confirmed_amount = v_new_paid,
    payment_reference = trim(p_reference),
    confirmation_source = 'accounting_collection',
    verified_by = auth.uid(),
    verified_at = now(),
    paid_at = case when v_new_paid >= v_due then now() else paid_at end,
    updated_at = now()
  where order_id = p_order_id;
  return v_entry;
end;
$$;

create or replace function public.enforce_financial_closure_v18()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'completed' and new.payment_status not in ('paid', 'refunded') then raise exception 'PAYMENT_REQUIRED_FOR_COMPLETION'; end if;
  if new.status = 'delivered' and new.payment_status not in ('paid', 'unpaid', 'partially_paid', 'refunded') then
    raise exception 'PAYMENT_STATUS_REQUIRED_FOR_DELIVERY';
  end if;
  if new.status = 'delivered' and new.payment_status in ('unpaid', 'partially_paid') and new.outstanding_amount <= 0 then
    raise exception 'OUTSTANDING_AMOUNT_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger orders_financial_closure_v18 before insert or update on public.orders
for each row execute function public.enforce_financial_closure_v18();

create or replace function public.notify_payment_update_v11()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status is distinct from new.status and new.status in ('paid', 'failed', 'refunded') then
    insert into public.notifications(user_id, order_id, type, title, body, title_key, message_key, link)
    values(new.user_id, new.order_id, 'payment_update',
      case new.status when 'paid' then 'Payment confirmed' when 'failed' then 'Payment failed' else 'Payment refunded' end,
      case new.status when 'paid' then 'Your PromptPay payment was confirmed.' when 'failed' then 'Your payment could not be confirmed. Please try again.' else 'Your payment was refunded.' end,
      case new.status when 'paid' then 'notification.payment_verified.title' when 'failed' then 'notification.payment_rejected.title' else 'notification.payment_refunded.title' end,
      case new.status when 'paid' then 'notification.payment_verified.message' when 'failed' then 'notification.payment_rejected.message' else 'notification.payment_refunded.message' end,
      '/order-tracking?orderId=' || new.order_id);
  end if;
  return new;
end;
$$;

-- Keep legacy functions callable while new clients use the v19 RPCs.
revoke all on function public.prepare_promptpay_attempt_v19(uuid, boolean) from public, anon;
grant execute on function public.prepare_promptpay_attempt_v19(uuid, boolean) to authenticated;
revoke all on function public.request_promptpay_confirmation_v19(uuid) from public, anon;
grant execute on function public.request_promptpay_confirmation_v19(uuid) to authenticated;
revoke all on function public.customer_change_payment_method_v19(uuid, text) from public, anon;
grant execute on function public.customer_change_payment_method_v19(uuid, text) to authenticated;
revoke all on function public.admin_update_payment_v19(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.admin_update_payment_v19(uuid, text, text, numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
