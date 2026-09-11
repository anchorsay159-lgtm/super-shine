begin;

alter table public.orders
  add column if not exists paid_at timestamptz,
  add column if not exists payment_updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists outstanding_amount numeric(10,2) not null default 0,
  add column if not exists outstanding_since timestamptz,
  add column if not exists outstanding_reason text not null default '';

alter table public.payments add column if not exists paid_at timestamptz;

alter table public.orders drop constraint if exists orders_status_v11_check;
alter table public.orders add constraint orders_status_v18_check check (status in (
  'requested', 'pickup_confirmed', 'picked_up', 'received', 'cleaning',
  'quality_check', 'out_for_delivery', 'delivered', 'completed',
  'waiting_price_approval', 'payment_verification_required', 'on_hold',
  'rejected', 'withdrawn'
));

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_v18_check check (payment_status in (
  'pending', 'waiting_verification', 'verified', 'rejected', 'paid',
  'outstanding', 'refunded'
));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_v18_check check (status in (
  'pending', 'waiting_verification', 'verified', 'rejected', 'paid',
  'outstanding', 'refunded'
));

update public.orders set
  payment_status = 'outstanding',
  outstanding_amount = coalesce(final_total, estimated_total, total, 0),
  outstanding_since = coalesce(updated_at, now()),
  outstanding_reason = 'Delivered before payment was recorded'
where status = 'delivered'
  and payment_status not in ('paid', 'verified', 'refunded');

create or replace function public.enforce_financial_closure_v18()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'completed' and new.payment_status not in ('paid', 'verified', 'refunded') then
    raise exception 'PAYMENT_REQUIRED_FOR_COMPLETION';
  end if;
  if new.status = 'delivered' and new.payment_status not in ('paid', 'verified', 'outstanding', 'refunded') then
    raise exception 'OUTSTANDING_REASON_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_financial_closure_v18 on public.orders;
create trigger orders_financial_closure_v18 before insert or update on public.orders
for each row execute function public.enforce_financial_closure_v18();

create or replace function public.admin_set_final_price_v18(p_order_id uuid, p_final_total numeric)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; needs_approval boolean;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_final_total is null or p_final_total < 0 then raise exception 'INVALID_FINAL_TOTAL'; end if;
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.status not in ('received', 'waiting_price_approval')
    or order_row.payment_status in ('paid', 'verified', 'refunded') then
    raise exception 'FINAL_PRICE_NOT_ALLOWED';
  end if;
  needs_approval := abs(p_final_total - coalesce(order_row.estimated_total, order_row.total, 0)) >= 0.01;
  update public.orders set
    final_total = p_final_total,
    total = case when needs_approval then total else p_final_total end,
    price_approval_status = case when needs_approval then 'pending' else 'approved' end,
    price_approved_at = case when needs_approval then null else now() end,
    payment_status = 'pending', payment_rejection_reason = '',
    outstanding_amount = 0, outstanding_since = null, outstanding_reason = '',
    status = case when needs_approval then 'waiting_price_approval'
      when status = 'waiting_price_approval' then 'received' else status end,
    status_comment = case when needs_approval then 'Final price submitted for customer approval'
      else 'Final price confirmed by admin' end
  where id = p_order_id;
  if not order_row.is_demo then
    update public.payments set amount = p_final_total, status = 'pending',
      rejection_reason = '', verified_by = null, verified_at = null, paid_at = null
    where order_id = p_order_id;
  end if;
  return needs_approval;
end;
$$;

revoke all on function public.admin_set_final_price_v18(uuid, numeric) from public, anon, authenticated;
grant execute on function public.admin_set_final_price_v18(uuid, numeric) to authenticated;

create or replace function public.admin_update_payment_v18(
  p_order_id uuid, p_status text, p_rejection_reason text default ''
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; stored_status text;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_status not in ('verified', 'rejected', 'refunded') then raise exception 'INVALID_PAYMENT_STATUS'; end if;
  if p_status in ('verified', 'rejected') and (
    order_row.payment_method <> 'promptpay' or order_row.payment_status <> 'waiting_verification'
  ) then raise exception 'PAYMENT_NOT_SUBMITTED'; end if;
  if p_status = 'rejected' and char_length(trim(coalesce(p_rejection_reason, ''))) < 3 then
    raise exception 'REJECTION_REASON_REQUIRED';
  end if;
  if p_status = 'refunded' and order_row.payment_status not in ('paid', 'verified') then
    raise exception 'PAYMENT_NOT_PAID';
  end if;
  stored_status := case when p_status = 'verified' then 'paid' else p_status end;
  update public.orders set payment_status = stored_status,
    paid_at = case when stored_status = 'paid' then now() else paid_at end,
    payment_updated_by = auth.uid(),
    payment_rejection_reason = case when stored_status = 'rejected'
      then left(trim(p_rejection_reason), 1000) else '' end,
    outstanding_amount = case when stored_status = 'paid' then 0 else outstanding_amount end,
    outstanding_since = case when stored_status = 'paid' then null else outstanding_since end,
    outstanding_reason = case when stored_status = 'paid' then '' else outstanding_reason end,
    status_comment = case when stored_status = 'paid' then 'PromptPay payment verified by admin'
      when stored_status = 'rejected' then 'Payment rejected by admin' else 'Payment refunded by admin' end
  where id = p_order_id;
  if not order_row.is_demo then
    update public.payments set status = p_status,
      verified_by = case when p_status = 'verified' then auth.uid() else null end,
      verified_at = case when p_status = 'verified' then now() else null end,
      paid_at = case when p_status = 'verified' then now() else paid_at end,
      rejection_reason = case when stored_status = 'rejected'
        then left(trim(p_rejection_reason), 1000) else '' end
    where order_id = p_order_id;
  end if;
end;
$$;

revoke all on function public.admin_update_payment_v18(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_payment_v18(uuid, text, text) to authenticated;

create or replace function public.admin_handoff_order_v18(
  p_order_id uuid, p_payment_received boolean, p_reason text default ''
)
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
  update public.orders set status = next_status,
    payment_status = case when p_payment_received then 'paid' else 'outstanding' end,
    paid_at = case when p_payment_received then now() else null end,
    payment_updated_by = auth.uid(),
    outstanding_amount = case when p_payment_received then 0 else due end,
    outstanding_since = case when p_payment_received then null else now() end,
    outstanding_reason = case when p_payment_received then '' else left(trim(p_reason), 1000) end,
    status_comment = case when p_payment_received then 'Cash received at handoff'
      else 'Delivered with payment outstanding' end
  where id = p_order_id;
  if not order_row.is_demo then
    update public.payments set status = case when p_payment_received then 'paid' else 'outstanding' end,
      verified_by = case when p_payment_received then auth.uid() else null end,
      verified_at = case when p_payment_received then now() else null end,
      paid_at = case when p_payment_received then now() else null end
    where order_id = p_order_id;
  end if;
end;
$$;

revoke all on function public.admin_handoff_order_v18(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_handoff_order_v18(uuid, boolean, text) to authenticated;

create or replace function public.admin_record_payment_received_v18(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into order_row from public.orders where id = p_order_id and payment_status = 'outstanding' for update;
  if not found then raise exception 'PAYMENT_NOT_OUTSTANDING'; end if;
  update public.orders set payment_status = 'paid', paid_at = now(), payment_updated_by = auth.uid(),
    outstanding_amount = 0, outstanding_since = null, outstanding_reason = '',
    status_comment = 'Outstanding payment received' where id = p_order_id;
  if not order_row.is_demo then
    update public.payments set status = 'paid', verified_by = auth.uid(),
      verified_at = now(), paid_at = now() where order_id = p_order_id;
  end if;
end;
$$;

revoke all on function public.admin_record_payment_received_v18(uuid) from public, anon, authenticated;
grant execute on function public.admin_record_payment_received_v18(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
