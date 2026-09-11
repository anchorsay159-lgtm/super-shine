begin;

-- One fulfillment model is shared by customer mobile, customer web, and admin.
alter table public.orders
  add column if not exists collection_method text not null default 'home_pickup',
  add column if not exists return_method text not null default 'home_delivery',
  add column if not exists delivery_address text not null default '',
  add column if not exists pricing_status text not null default 'estimated';

drop trigger if exists orders_financial_closure_v18 on public.orders;
drop trigger if exists orders_fulfillment_transition_v20 on public.orders;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders drop constraint if exists orders_status_v11_check;
alter table public.orders drop constraint if exists orders_status_v18_check;
alter table public.orders drop constraint if exists orders_status_v20_check;
alter table public.orders drop constraint if exists orders_collection_method_v20_check;
alter table public.orders drop constraint if exists orders_return_method_v20_check;
alter table public.orders drop constraint if exists orders_pricing_status_v20_check;

update public.orders set
  collection_method = coalesce(nullif(collection_method, ''), 'home_pickup'),
  return_method = coalesce(nullif(return_method, ''), 'home_delivery'),
  delivery_address = case when coalesce(delivery_address, '') = '' then coalesce(pickup_address, '') else delivery_address end,
  pricing_status = case when final_total is not null or pricing_type = 'fixed' then 'finalized' else 'estimated' end,
  status = case status
    when 'requested' then 'pending'
    when 'payment_verification_required' then 'pending'
    when 'pickup_confirmed' then 'accepted'
    when 'picked_up' then 'picked_up'
    when 'received' then 'processing'
    when 'waiting_price_approval' then 'processing'
    when 'cleaning' then 'processing'
    when 'quality_check' then 'ready'
    when 'out_for_delivery' then 'out_for_delivery'
    when 'delivered' then 'delivered'
    when 'completed' then 'delivered'
    when 'on_hold' then 'processing'
    when 'rejected' then 'cancelled'
    when 'withdrawn' then 'cancelled'
    else status
  end;

update public.order_status_history set
  status = case status
    when 'requested' then 'pending' when 'payment_verification_required' then 'pending'
    when 'pickup_confirmed' then 'accepted' when 'received' then 'processing'
    when 'waiting_price_approval' then 'processing' when 'cleaning' then 'processing'
    when 'quality_check' then 'ready' when 'completed' then 'delivered'
    when 'on_hold' then 'processing' when 'rejected' then 'cancelled'
    when 'withdrawn' then 'cancelled' else status end,
  previous_status = case previous_status
    when 'requested' then 'pending' when 'payment_verification_required' then 'pending'
    when 'pickup_confirmed' then 'accepted' when 'received' then 'processing'
    when 'waiting_price_approval' then 'processing' when 'cleaning' then 'processing'
    when 'quality_check' then 'ready' when 'completed' then 'delivered'
    when 'on_hold' then 'processing' when 'rejected' then 'cancelled'
    when 'withdrawn' then 'cancelled' else previous_status end,
  new_status = case new_status
    when 'requested' then 'pending' when 'payment_verification_required' then 'pending'
    when 'pickup_confirmed' then 'accepted' when 'received' then 'processing'
    when 'waiting_price_approval' then 'processing' when 'cleaning' then 'processing'
    when 'quality_check' then 'ready' when 'completed' then 'delivered'
    when 'on_hold' then 'processing' when 'rejected' then 'cancelled'
    when 'withdrawn' then 'cancelled' else new_status end;

alter table public.orders add constraint orders_status_v20_check check (status in (
  'pending','accepted','pickup_in_progress','picked_up','awaiting_dropoff','received_at_store',
  'processing','ready','ready_for_collection','out_for_delivery','delivered','collected','cancelled'
));
alter table public.orders add constraint orders_collection_method_v20_check
  check (collection_method in ('home_pickup','store_dropoff'));
alter table public.orders add constraint orders_return_method_v20_check
  check (return_method in ('home_delivery','store_collection'));
alter table public.orders add constraint orders_pricing_status_v20_check
  check (pricing_status in ('estimated','finalized'));

create or replace function public.fulfillment_next_status_v20(
  p_status text, p_collection_method text, p_return_method text
) returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_status = 'pending' then 'accepted'
    when p_status = 'accepted' and p_collection_method = 'home_pickup' then 'pickup_in_progress'
    when p_status = 'accepted' and p_collection_method = 'store_dropoff' then 'awaiting_dropoff'
    when p_status = 'pickup_in_progress' then 'picked_up'
    when p_status = 'awaiting_dropoff' then 'received_at_store'
    when p_status in ('picked_up','received_at_store') then 'processing'
    when p_status = 'processing' and p_return_method = 'home_delivery' then 'ready'
    when p_status = 'processing' and p_return_method = 'store_collection' then 'ready_for_collection'
    when p_status = 'ready' then 'out_for_delivery'
    when p_status = 'out_for_delivery' then 'delivered'
    when p_status = 'ready_for_collection' then 'collected'
    else null end;
$$;

create or replace function public.enforce_fulfillment_transition_v20()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare expected text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception 'INVALID_INITIAL_ORDER_STATUS'; end if;
    return new;
  end if;
  if old.collection_method is distinct from new.collection_method or old.return_method is distinct from new.return_method then
    if old.status <> 'pending' then raise exception 'FULFILLMENT_METHOD_LOCKED'; end if;
  end if;
  if old.status is not distinct from new.status then return new; end if;
  if new.status = 'cancelled' and old.status not in ('delivered','collected','cancelled') then return new; end if;
  expected := public.fulfillment_next_status_v20(old.status, old.collection_method, old.return_method);
  if expected is null or new.status <> expected then raise exception 'INVALID_ORDER_TRANSITION'; end if;
  return new;
end;
$$;

create trigger orders_fulfillment_transition_v20 before insert or update of status, collection_method, return_method on public.orders
for each row execute function public.enforce_fulfillment_transition_v20();

create or replace function public.enforce_financial_closure_v18()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status in ('delivered','collected') and new.payment_status not in ('paid','refunded') then
    if coalesce(new.outstanding_amount,0) <= 0 then
      new.outstanding_amount := coalesce(new.final_total,new.estimated_total,new.total,0) - coalesce(new.amount_paid,0);
    end if;
    if new.outstanding_amount > 0 then
      new.outstanding_since := coalesce(new.outstanding_since,now());
      new.outstanding_reason := coalesce(nullif(trim(new.outstanding_reason),''),'Fulfillment completed before payment was received');
    end if;
  end if;
  return new;
end;
$$;
create trigger orders_financial_closure_v18 before insert or update on public.orders
for each row execute function public.enforce_financial_closure_v18();

create or replace function public.admin_update_order_status_v20(
  p_order_id uuid, p_next_status text, p_comment text default ''
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; expected text;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  expected := public.fulfillment_next_status_v20(order_row.status,order_row.collection_method,order_row.return_method);
  if p_next_status <> 'cancelled' and p_next_status is distinct from expected then raise exception 'INVALID_ORDER_TRANSITION'; end if;
  if p_next_status = 'cancelled' and order_row.status in ('delivered','collected','cancelled') then raise exception 'INVALID_ORDER_TRANSITION'; end if;
  update public.orders set status=p_next_status,
    status_comment=left(coalesce(nullif(trim(p_comment),''),'Updated to '||replace(p_next_status,'_',' ')),1000),
    updated_at=now() where id=p_order_id;
end;
$$;

create or replace function public.place_order_v20(
  p_items jsonb,
  p_preferences jsonb,
  p_collection_method text,
  p_return_method text,
  p_pickup_slot_id uuid,
  p_address_id uuid,
  p_pickup_instructions text,
  p_contact_phone text,
  p_payment_method text,
  p_coupon_code text default null,
  p_customer_comment text default '',
  p_is_demo boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_user_id uuid := auth.uid();
  profile_row public.profiles%rowtype; item jsonb; service_row public.services%rowtype;
  slot_row public.pickup_slots%rowtype; address_row public.addresses%rowtype;
  settings_row public.business_settings%rowtype; coupon_row public.coupons%rowtype;
  new_order public.orders%rowtype; item_quantity numeric(10,2);
  subtotal_value numeric(10,2) := 0; pickup_fee_value numeric(10,2) := 0;
  delivery_fee_value numeric(10,2) := 0; coupon_discount_value numeric(10,2) := 0;
  pickup_benefit_value numeric(10,2) := 0; total_discount_value numeric(10,2) := 0;
  total_value numeric(10,2) := 0; eligible_base_value numeric(10,2) := 0;
  eligible_service_subtotal numeric(10,2) := 0; item_summary_value text := '';
  first_service_id text; first_service_name text; first_quantity integer := 1;
  estimated_pricing boolean := false; usage_value integer := 0; benefit_usage_value integer := 0;
  needs_address boolean;
begin
  if current_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(p_is_demo,false) then raise exception 'DEMO_ORDER_DISABLED'; end if;
  if p_collection_method not in ('home_pickup','store_dropoff') then raise exception 'INVALID_COLLECTION_METHOD'; end if;
  if p_return_method not in ('home_delivery','store_collection') then raise exception 'INVALID_RETURN_METHOD'; end if;
  if p_payment_method = 'cash_delivery' and p_return_method <> 'home_delivery' then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_payment_method = 'cash_pickup' and p_return_method <> 'store_collection' then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_payment_method not in ('cash_pickup','cash_delivery','promptpay') then raise exception 'INVALID_PAYMENT_METHOD'; end if;

  select * into profile_row from public.profiles where id=current_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if profile_row.is_demo then raise exception 'DEMO_ORDER_DISABLED'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'ITEMS_REQUIRED'; end if;

  needs_address := p_collection_method='home_pickup' or p_return_method='home_delivery';
  if needs_address then
    select * into address_row from public.addresses where id=p_address_id and user_id=current_user_id;
    if not found then raise exception 'ADDRESS_NOT_FOUND'; end if;
  end if;

  if p_collection_method='home_pickup' then
    select * into slot_row from public.pickup_slots where id=p_pickup_slot_id for update;
    if not found or not slot_row.enabled
      or slot_row.slot_date < (now() at time zone 'Asia/Bangkok')::date
      or slot_row.booked_count >= slot_row.capacity then raise exception 'PICKUP_SLOT_UNAVAILABLE'; end if;
  end if;

  select * into settings_row from public.business_settings where id=1;
  pickup_fee_value := case when p_collection_method='home_pickup' then coalesce(settings_row.pickup_fee,0) else 0 end;
  delivery_fee_value := case when p_return_method='home_delivery' then coalesce(settings_row.delivery_fee,0) else 0 end;

  for item in select * from jsonb_array_elements(p_items) loop
    begin item_quantity := (item->>'quantity')::numeric;
    exception when others then raise exception 'INVALID_QUANTITY'; end;
    if item_quantity is null or item_quantity < 1 or item_quantity > 99 then raise exception 'INVALID_QUANTITY'; end if;
    select * into service_row from public.services where id=item->>'serviceId' and enabled=true;
    if not found then raise exception 'SERVICE_UNAVAILABLE'; end if;
    subtotal_value := subtotal_value + service_row.price*item_quantity;
    estimated_pricing := estimated_pricing or service_row.pricing_type='estimated';
    item_summary_value := item_summary_value || case when item_summary_value='' then '' else ', ' end
      || trim(to_char(item_quantity,'FM999999990.##')) || ' × ' || service_row.name;
    if first_service_id is null then
      first_service_id:=service_row.id; first_service_name:=service_row.name; first_quantity:=ceil(item_quantity)::integer;
    end if;
  end loop;

  if pickup_fee_value > 0 then
    select count(*) into benefit_usage_value from public.profile_pickup_benefit_usage
      where user_id=current_user_id and restored_at is null;
    if benefit_usage_value < 5 then pickup_benefit_value:=pickup_fee_value; end if;
  end if;

  if nullif(trim(p_coupon_code),'') is not null then
    select * into coupon_row from public.coupons where upper(code)=upper(trim(p_coupon_code)) for update;
    if not found or not coupon_row.active
      or (coupon_row.starts_at is not null and coupon_row.starts_at>now())
      or (coupon_row.expires_at is not null and coupon_row.expires_at<=now())
      or subtotal_value<coupon_row.minimum_order
      or (coupon_row.total_usage_limit is not null and coupon_row.usage_count>=coupon_row.total_usage_limit)
      then raise exception 'COUPON_INVALID'; end if;
    if cardinality(coupon_row.eligible_service_ids)>0 and not exists (
      select 1 from jsonb_array_elements(p_items) x where x->>'serviceId'=any(coupon_row.eligible_service_ids)
    ) then raise exception 'COUPON_SERVICE_REQUIRED'; end if;
    select count(*) into usage_value from public.coupon_usage where user_id=current_user_id and coupon_code=coupon_row.code;
    if coupon_row.per_customer_limit is not null and usage_value>=coupon_row.per_customer_limit then raise exception 'COUPON_LIMIT_REACHED'; end if;
    select coalesce(sum(s.price*(x->>'quantity')::numeric),0) into eligible_service_subtotal
      from jsonb_array_elements(p_items) x join public.services s on s.id=x->>'serviceId' and s.enabled=true
      where cardinality(coupon_row.eligible_service_ids)=0 or s.id=any(coupon_row.eligible_service_ids);
    eligible_base_value := case coupon_row.discount_target
      when 'service' then eligible_service_subtotal
      when 'pickup_fee' then greatest(0,pickup_fee_value-pickup_benefit_value)
      when 'delivery_fee' then greatest(0,delivery_fee_value)
      when 'pickup_and_delivery' then greatest(0,pickup_fee_value-pickup_benefit_value)+greatest(0,delivery_fee_value)
      else 0 end;
    if eligible_base_value<=0 then raise exception 'COUPON_TARGET_UNAVAILABLE'; end if;
    coupon_discount_value := case coupon_row.discount_type
      when 'percentage' then round(eligible_base_value*coupon_row.discount_value/100,2)
      when 'fixed_amount' then least(eligible_base_value,coupon_row.discount_value)
      when 'free' then eligible_base_value else 0 end;
    if coupon_row.discount_type='percentage' and coupon_row.max_discount is not null then
      coupon_discount_value:=least(coupon_discount_value,coupon_row.max_discount);
    end if;
    coupon_discount_value:=least(eligible_base_value,greatest(0,coupon_discount_value));
  end if;

  total_discount_value:=coupon_discount_value+pickup_benefit_value;
  total_value:=greatest(0,subtotal_value+pickup_fee_value+delivery_fee_value-total_discount_value);

  insert into public.orders (
    user_id,service_id,service_name,quantity,item_summary,subtotal,express_fee,pickup_fee,delivery_fee,
    discount,pickup_benefit_discount,total,estimated_total,final_total,pickup_slot,pickup_slot_id,pickup_date,pickup_start,pickup_end,
    pickup_address,delivery_address,contact_phone,pickup_instructions,customer_comment,preferences,payment_method,
    payment_status,coupon_code,coupon_code_snapshot,coupon_title_snapshot,coupon_discount_target,coupon_discount_type,
    coupon_discount_value,coupon_max_discount,coupon_discount_amount,pricing_type,pricing_status,status,is_demo,express,priority,
    collection_method,return_method
  ) values (
    current_user_id,first_service_id,first_service_name,first_quantity,item_summary_value,subtotal_value,0,pickup_fee_value,delivery_fee_value,
    total_discount_value,pickup_benefit_value,total_value,total_value,
    case when estimated_pricing then null else total_value end,
    case when p_collection_method='home_pickup' then to_char(slot_row.slot_date,'YYYY-MM-DD')||' · '||to_char(slot_row.start_time,'HH24:MI')||'–'||to_char(slot_row.end_time,'HH24:MI') else '' end,
    case when p_collection_method='home_pickup' then slot_row.id else null end,
    case when p_collection_method='home_pickup' then slot_row.slot_date else null end,
    case when p_collection_method='home_pickup' then slot_row.start_time else null end,
    case when p_collection_method='home_pickup' then slot_row.end_time else null end,
    case when p_collection_method='home_pickup' then coalesce(address_row.address_line,'') else '' end,
    case when p_return_method='home_delivery' then coalesce(address_row.address_line,'') else '' end,
    coalesce(nullif(trim(p_contact_phone),''),profile_row.phone,''),coalesce(p_pickup_instructions,''),coalesce(p_customer_comment,''),
    coalesce(p_preferences,'{}'::jsonb),p_payment_method,'unpaid',coupon_row.code,coupon_row.code,coupon_row.title,
    coupon_row.discount_target,coupon_row.discount_type,coupon_row.discount_value,coupon_row.max_discount,coupon_discount_value,
    case when estimated_pricing then 'estimated' else 'fixed' end,
    case when estimated_pricing then 'estimated' else 'finalized' end,'pending',false,false,false,p_collection_method,p_return_method
  ) returning * into new_order;

  for item in select * from jsonb_array_elements(p_items) loop
    item_quantity:=(item->>'quantity')::numeric;
    select * into service_row from public.services where id=item->>'serviceId' and enabled=true;
    if not found then raise exception 'SERVICE_UNAVAILABLE'; end if;
    insert into public.order_items(order_id,service_id,service_name,service_icon,quantity,price_unit,unit_price,line_total,pricing_type,preferences)
    values(new_order.id,service_row.id,service_row.name,service_row.icon,item_quantity,service_row.price_unit,
      service_row.price,service_row.price*item_quantity,service_row.pricing_type,coalesce(item->'preferences','{}'::jsonb));
  end loop;
  if p_collection_method='home_pickup' then update public.pickup_slots set booked_count=booked_count+1 where id=slot_row.id; end if;
  insert into public.payments(order_id,user_id,method,amount,status) values(new_order.id,current_user_id,p_payment_method,total_value,'unpaid');
  if pickup_benefit_value>0 then insert into public.profile_pickup_benefit_usage(user_id,order_id,amount) values(current_user_id,new_order.id,pickup_benefit_value); end if;
  if coupon_row.code is not null then
    insert into public.coupon_usage(coupon_code,user_id,order_id,discount_amount) values(coupon_row.code,current_user_id,new_order.id,coupon_discount_value);
    update public.coupons set usage_count=usage_count+1 where code=coupon_row.code;
  end if;
  return jsonb_build_object('id',new_order.id,'orderNumber',new_order.order_number,'total',total_value,
    'couponDiscount',coupon_discount_value,'pickupBenefitDiscount',pickup_benefit_value);
end;
$$;

create or replace function public.customer_change_payment_method_v19(p_order_id uuid, p_method text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype;
begin
  if p_method not in ('cash_pickup','cash_delivery','promptpay') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  select * into order_row from public.orders where id=p_order_id and user_id=auth.uid() and not is_demo for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.payment_status in ('paid','partially_paid','refunded') or order_row.status in ('delivered','collected','cancelled') then raise exception 'PAYMENT_METHOD_LOCKED'; end if;
  if p_method='cash_pickup' and order_row.return_method<>'store_collection' then raise exception 'CASH_PICKUP_NOT_AVAILABLE'; end if;
  if p_method='cash_delivery' and order_row.return_method<>'home_delivery' then raise exception 'CASH_DELIVERY_NOT_AVAILABLE'; end if;
  update public.orders set payment_method=p_method,payment_status='unpaid',payment_reference=null,
    payment_expires_at=null,payment_confirmation_requested_at=null,payment_failure_reason='',
    payment_rejection_reason='',payment_confirmed_amount=null,updated_at=now() where id=p_order_id;
  update public.payments set method=p_method,status='unpaid',payment_reference=null,expires_at=null,
    confirmation_requested_at=null,failure_reason='',rejection_reason='',confirmed_amount=null,
    confirmation_source='',updated_at=now() where order_id=p_order_id;
  if p_method='promptpay' then perform public.prepare_promptpay_attempt_v19(p_order_id,true); end if;
end;
$$;

create or replace function public.respond_to_price_v17(p_order_id uuid, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; attempt_minutes integer:=15; next_reference text;
begin
  select * into order_row from public.orders where id=p_order_id and user_id=auth.uid() and not is_demo for update;
  if not found or order_row.price_approval_status<>'pending' then raise exception 'PRICE_RESPONSE_NOT_ALLOWED'; end if;
  if p_approve and order_row.final_total is null then raise exception 'FINAL_PRICE_REQUIRED'; end if;
  if p_approve and order_row.payment_method='promptpay' then
    select promptpay_attempt_minutes into attempt_minutes from public.business_settings where id=1;
    next_reference:=public.promptpay_reference_v19(order_row.order_number,order_row.payment_attempt_number+1);
  end if;
  update public.orders set price_approval_status=case when p_approve then 'approved' else 'rejected' end,
    price_approved_at=case when p_approve then now() else null end,price_response_note=left(coalesce(p_note,''),1000),
    total=case when p_approve then final_total else total end,payment_status='unpaid',
    payment_rejection_reason='',payment_failure_reason='',
    payment_attempt_number=case when p_approve and payment_method='promptpay' then payment_attempt_number+1 else payment_attempt_number end,
    payment_reference=case when p_approve and payment_method='promptpay' then next_reference else null end,
    payment_expires_at=case when p_approve and payment_method='promptpay' then now()+make_interval(mins=>coalesce(attempt_minutes,15)) else null end,
    payment_confirmation_requested_at=null,
    status_comment=case when p_approve then 'Final price approved by customer' else 'Final price rejected by customer' end,
    updated_at=now() where id=p_order_id;
  update public.payments set amount=case when p_approve then order_row.final_total else amount end,status='unpaid',
    attempt_number=case when p_approve and order_row.payment_method='promptpay' then order_row.payment_attempt_number+1 else attempt_number end,
    payment_reference=case when p_approve and order_row.payment_method='promptpay' then next_reference else null end,
    expires_at=case when p_approve and order_row.payment_method='promptpay' then now()+make_interval(mins=>coalesce(attempt_minutes,15)) else null end,
    confirmation_requested_at=null,failure_reason='',rejection_reason='',confirmation_source='',updated_at=now()
    where order_id=p_order_id;
end;
$$;

create or replace function public.admin_set_final_price_v18(p_order_id uuid,p_final_total numeric)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; needs_approval boolean; attempt_minutes integer:=15; next_reference text;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_final_total is null or p_final_total<0 then raise exception 'INVALID_FINAL_TOTAL'; end if;
  select * into order_row from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.status not in ('picked_up','received_at_store','processing')
    or order_row.payment_status in ('paid','partially_paid','refunded') then raise exception 'FINAL_PRICE_NOT_ALLOWED'; end if;
  needs_approval:=abs(p_final_total-coalesce(order_row.estimated_total,order_row.total,0))>=0.01;
  if not needs_approval and order_row.payment_method='promptpay' then
    select promptpay_attempt_minutes into attempt_minutes from public.business_settings where id=1;
    next_reference:=public.promptpay_reference_v19(order_row.order_number,order_row.payment_attempt_number+1);
  end if;
  update public.orders set final_total=p_final_total,pricing_status='finalized',
    total=case when needs_approval then total else p_final_total end,
    price_approval_status=case when needs_approval then 'pending' else 'approved' end,
    price_approved_at=case when needs_approval then null else now() end,payment_status='unpaid',
    payment_rejection_reason='',payment_failure_reason='',amount_paid=0,
    payment_attempt_number=case when not needs_approval and payment_method='promptpay' then payment_attempt_number+1 else payment_attempt_number end,
    payment_reference=case when not needs_approval and payment_method='promptpay' then next_reference else null end,
    payment_expires_at=case when not needs_approval and payment_method='promptpay' then now()+make_interval(mins=>coalesce(attempt_minutes,15)) else null end,
    payment_confirmation_requested_at=null,payment_confirmed_amount=null,outstanding_amount=0,
    outstanding_since=null,outstanding_reason='',
    status_comment=case when needs_approval then 'Final price submitted for customer approval' else 'Final price confirmed by admin' end,
    updated_at=now() where id=p_order_id;
  if not order_row.is_demo then
    update public.payments set amount=p_final_total,status='unpaid',rejection_reason='',failure_reason='',
      verified_by=null,verified_at=null,paid_at=null,confirmed_amount=null,confirmation_source='',
      attempt_number=case when not needs_approval and order_row.payment_method='promptpay' then order_row.payment_attempt_number+1 else attempt_number end,
      payment_reference=case when not needs_approval and order_row.payment_method='promptpay' then next_reference else null end,
      expires_at=case when not needs_approval and order_row.payment_method='promptpay' then now()+make_interval(mins=>coalesce(attempt_minutes,15)) else null end,
      confirmation_requested_at=null,updated_at=now() where order_id=p_order_id;
  end if;
  return needs_approval;
end;
$$;

create or replace function public.admin_handoff_order_v18(p_order_id uuid,p_payment_received boolean,p_reason text default '')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare order_row public.orders%rowtype; next_status text; due numeric(10,2);
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into order_row from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  due:=coalesce(order_row.final_total,order_row.estimated_total,order_row.total,0);
  if order_row.return_method='home_delivery' and order_row.status='out_for_delivery' then next_status:='delivered';
  elsif order_row.return_method='store_collection' and order_row.status='ready_for_collection' then next_status:='collected';
  else raise exception 'CASH_HANDOFF_NOT_ALLOWED'; end if;
  if not p_payment_received and char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'OUTSTANDING_REASON_REQUIRED'; end if;
  update public.orders set status=next_status,payment_status=case when p_payment_received then 'paid' else 'unpaid' end,
    amount_paid=case when p_payment_received then due else 0 end,paid_at=case when p_payment_received then now() else null end,
    payment_updated_by=auth.uid(),outstanding_amount=case when p_payment_received then 0 else due end,
    outstanding_since=case when p_payment_received then null else now() end,
    outstanding_reason=case when p_payment_received then '' else left(trim(p_reason),1000) end,
    status_comment=case when p_payment_received then 'Cash received at handoff' else 'Fulfillment completed with payment outstanding' end,
    updated_at=now() where id=p_order_id;
  if not order_row.is_demo then
    update public.payments set status=case when p_payment_received then 'paid' else 'unpaid' end,
      confirmed_amount=case when p_payment_received then due else null end,
      verified_by=case when p_payment_received then auth.uid() else null end,
      verified_at=case when p_payment_received then now() else null end,
      paid_at=case when p_payment_received then now() else null end,
      confirmation_source=case when p_payment_received then 'cash_handoff' else '' end,updated_at=now()
      where order_id=p_order_id;
  end if;
end;
$$;

create or replace function public.withdraw_order_v11(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare slot_id uuid;
begin
  update public.orders set status='cancelled',withdrawn_at=now(),status_comment='Cancelled by customer'
    where id=p_order_id and user_id=auth.uid() and status in ('pending','accepted') returning pickup_slot_id into slot_id;
  if not found then raise exception 'ORDER_CANNOT_BE_WITHDRAWN'; end if;
  if slot_id is not null then update public.pickup_slots set booked_count=greatest(0,booked_count-1) where id=slot_id; end if;
end;
$$;

create or replace function public.record_order_status_v11()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_role_value text:='system'; notification_type text; notification_title text; notification_body text;
begin
  if auth.uid() is not null then select case when role='admin' then 'admin' else 'customer' end into actor_role_value from public.profiles where id=auth.uid(); end if;
  if tg_op='INSERT' or old.status is distinct from new.status then
    notification_type:=case new.status
      when 'pending' then 'order_submitted' when 'accepted' then 'order_confirmed'
      when 'pickup_in_progress' then 'pickup_started' when 'picked_up' then 'laundry_picked_up'
      when 'awaiting_dropoff' then 'awaiting_dropoff' when 'received_at_store' then 'laundry_received'
      when 'processing' then 'cleaning_started' when 'ready' then 'laundry_ready'
      when 'ready_for_collection' then 'ready_for_collection' when 'out_for_delivery' then 'delivery_started'
      when 'delivered' then 'order_delivered' when 'collected' then 'order_collected'
      when 'cancelled' then 'order_cancelled' else 'order_update' end;
    notification_title:=case new.status
      when 'pending' then 'Order placed' when 'accepted' then 'Order confirmed'
      when 'pickup_in_progress' then 'Laundry pickup started' when 'picked_up' then 'Laundry picked up'
      when 'awaiting_dropoff' then 'Waiting for your laundry' when 'received_at_store' then 'Laundry received at store'
      when 'processing' then 'Cleaning started' when 'ready' then 'Laundry ready'
      when 'ready_for_collection' then 'Ready for collection' when 'out_for_delivery' then 'Out for delivery'
      when 'delivered' then 'Delivered' when 'collected' then 'Collected'
      when 'cancelled' then 'Order cancelled' else 'Order update' end;
    notification_body:=notification_title||' for order '||new.order_number||'.';
    insert into public.order_status_history(order_id,status,previous_status,new_status,actor_id,actor_role,note,comment)
      values(new.id,new.status,case when tg_op='INSERT' then null else old.status end,new.status,auth.uid(),
        coalesce(actor_role_value,'system'),coalesce(nullif(new.status_comment,''),notification_title),coalesce(new.status_comment,''));
    insert into public.notifications(user_id,order_id,title,body,type,link,title_key,message_key,message_params)
      values(new.user_id,new.id,notification_title,notification_body,notification_type,
        '/order-tracking?orderId='||new.id,'notification.'||notification_type||'.title',
        'notification.'||notification_type||'.message',jsonb_build_object('orderNumber',new.order_number));
  end if;
  return new;
end;
$$;

create or replace function public.accounting_capture_order()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_settings public.accounting_settings%rowtype; v_profile text; v_event uuid;
  v_paid boolean; v_recognized_before boolean; v_payment_trigger text; v_service_trigger text;
  v_platform text:=public.accounting_request_platform();
  v_version text:=extract(epoch from coalesce(new.updated_at,now()))::bigint::text;
  v_amount numeric(14,2):=coalesce(new.final_total,new.estimated_total,new.total,0);
begin
  if new.is_demo then return new; end if;
  select * into v_settings from public.accounting_settings where id=1;
  select full_name into v_profile from public.profiles where id=new.user_id;
  v_paid:=new.payment_status in ('paid','verified');
  v_recognized_before:=old.status in (v_settings.revenue_recognition_status,'delivered','collected');
  if v_paid and old.payment_status not in ('paid','verified') and not exists (
    select 1 from public.accounting_events where source_order_id=new.id
      and event_type in ('advance_payment_received','receivable_collected') and posting_status<>'reversed'
  ) then
    v_payment_trigger:=case when v_recognized_before and new.payment_method='promptpay' then 'payment_after_service_bank'
      when v_recognized_before then 'payment_after_service_cash' when new.payment_method='promptpay' then 'payment_before_service_bank'
      else 'payment_before_service_cash' end;
    v_event:=public.enqueue_accounting_event('order-payment:'||new.id||':'||v_version,v_platform,'order_payment',new.id::text,v_version,
      case when v_payment_trigger like 'payment_after_service%' then 'receivable_collected' else 'advance_payment_received' end,
      v_payment_trigger,new.id,new.order_number,new.user_id,v_profile,now(),'order_payment_transition',
      jsonb_build_object('paid_amount',v_amount,'net_total',v_amount,'payment_method',new.payment_method),new.payment_updated_by);
    if v_settings.automatic_posting then perform public.post_accounting_event(v_event); end if;
  end if;
  if new.status in ('delivered','collected') and old.status is distinct from new.status and not exists (
    select 1 from public.accounting_events where source_order_id=new.id
      and event_type in ('service_completed','credit_sale_completed') and posting_status<>'reversed'
  ) then
    v_service_trigger:=case when exists (
      select 1 from public.accounting_events where source_order_id=new.id and event_type='advance_payment_received' and posting_status='advance_recorded'
    ) then 'advance_settlement' when v_paid and new.payment_method='promptpay' then 'paid_service_bank'
      when v_paid then 'paid_service_cash' else 'credit_sale' end;
    v_event:=public.enqueue_accounting_event('order-revenue:'||new.id||':'||v_version,v_platform,'order',new.id::text,v_version,
      case when v_service_trigger='credit_sale' then 'credit_sale_completed' else 'service_completed' end,
      v_service_trigger,new.id,new.order_number,new.user_id,v_profile,now(),'configured_revenue_recognition',
      jsonb_build_object('gross_total',coalesce(new.subtotal,0)+coalesce(new.pickup_fee,0)+coalesce(new.delivery_fee,0),
        'net_total',v_amount,'discount_total',coalesce(new.discount,0)+coalesce(new.pickup_benefit_discount,0),
        'service_subtotal',coalesce(new.subtotal,0),'pickup_fee',coalesce(new.pickup_fee,0),
        'delivery_fee',coalesce(new.delivery_fee,0),'order_status',new.status,
        'order_source_platform',new.accounting_source_platform,
        'services',(select coalesce(jsonb_agg(jsonb_build_object('serviceId',oi.service_id,'name',oi.service_name,
          'quantity',coalesce(oi.final_quantity,oi.quantity),'revenue',coalesce(oi.final_line_total,oi.line_total))),'[]'::jsonb)
          from public.order_items oi where oi.order_id=new.id)),new.payment_updated_by);
    if v_settings.automatic_posting then perform public.post_accounting_event(v_event); end if;
  end if;
  if new.payment_status='refunded' and old.payment_status is distinct from new.payment_status and not exists (
    select 1 from public.accounting_refunds where order_id=new.id and approval_status='approved'
  ) and not exists (
    select 1 from public.accounting_events where source_order_id=new.id and event_type='refund_approved' and posting_status<>'reversed'
  ) then
    v_event:=public.enqueue_accounting_event('order-refund:'||new.id||':'||v_version,v_platform,'order_refund',new.id::text,v_version,
      'refund_approved',case when exists(select 1 from public.accounting_events where source_order_id=new.id
        and event_type in ('service_completed','credit_sale_completed') and posting_status='revenue_recorded')
        then 'approved_refund' else 'advance_refund' end,new.id,new.order_number,new.user_id,v_profile,now(),
      'payment_refund_transition',jsonb_build_object('refund_amount',v_amount),new.payment_updated_by);
    if v_settings.automatic_posting then perform public.post_accounting_event(v_event); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_accounting_capture_v1 on public.orders;
create trigger orders_accounting_capture_v1 after update of status,payment_status on public.orders
for each row execute function public.accounting_capture_order();

revoke all on function public.place_order_v20(jsonb,jsonb,text,text,uuid,uuid,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.place_order_v20(jsonb,jsonb,text,text,uuid,uuid,text,text,text,text,text,boolean) to authenticated;
revoke all on function public.admin_update_order_status_v20(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_update_order_status_v20(uuid,text,text) to authenticated;
revoke all on function public.fulfillment_next_status_v20(text,text,text) from public;
grant execute on function public.fulfillment_next_status_v20(text,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
