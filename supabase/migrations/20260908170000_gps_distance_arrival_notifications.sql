begin;

-- The customer shares the pickup/delivery point from the device. We keep only
-- the latest point for each phase; the driver's live point is already stored in
-- order_live_locations by the previous GPS migration.
alter table public.orders
  add column if not exists pickup_latitude double precision,
  add column if not exists pickup_longitude double precision,
  add column if not exists pickup_location_accuracy_meters double precision,
  add column if not exists pickup_location_captured_at timestamptz,
  add column if not exists delivery_latitude double precision,
  add column if not exists delivery_longitude double precision,
  add column if not exists delivery_location_accuracy_meters double precision,
  add column if not exists delivery_location_captured_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_pickup_latitude_range') then
    alter table public.orders add constraint orders_pickup_latitude_range check (pickup_latitude is null or pickup_latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_pickup_longitude_range') then
    alter table public.orders add constraint orders_pickup_longitude_range check (pickup_longitude is null or pickup_longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_latitude_range') then
    alter table public.orders add constraint orders_delivery_latitude_range check (delivery_latitude is null or delivery_latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_longitude_range') then
    alter table public.orders add constraint orders_delivery_longitude_range check (delivery_longitude is null or delivery_longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_pickup_accuracy_range') then
    alter table public.orders add constraint orders_pickup_accuracy_range check (pickup_location_accuracy_meters is null or pickup_location_accuracy_meters >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_delivery_accuracy_range') then
    alter table public.orders add constraint orders_delivery_accuracy_range check (delivery_location_accuracy_meters is null or delivery_location_accuracy_meters >= 0);
  end if;
end;
$$;

create or replace function public.customer_set_order_location_v1(
  p_order_id uuid,
  p_phase text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_phase is null or p_phase not in ('pickup', 'delivery') then raise exception 'INVALID_TRACKING_PHASE'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'INVALID_COORDINATES';
  end if;
  if p_accuracy_meters is not null and p_accuracy_meters < 0 then raise exception 'INVALID_ACCURACY'; end if;

  select * into v_order from public.orders where id = p_order_id and user_id = auth.uid();
  if not found or v_order.is_demo then raise exception 'ORDER_NOT_TRACKABLE'; end if;
  if v_order.status in ('delivered', 'collected', 'cancelled') then raise exception 'ORDER_NOT_TRACKABLE'; end if;
  if p_phase = 'pickup' and v_order.collection_method <> 'home_pickup' then raise exception 'PICKUP_NOT_REQUIRED'; end if;
  if p_phase = 'delivery' and v_order.return_method <> 'home_delivery' then raise exception 'DELIVERY_NOT_REQUIRED'; end if;

  if p_phase = 'pickup' then
    update public.orders set
      pickup_latitude = p_latitude,
      pickup_longitude = p_longitude,
      pickup_location_accuracy_meters = p_accuracy_meters,
      pickup_location_captured_at = now(),
      updated_at = now()
    where id = p_order_id
    returning * into v_order;
  else
    update public.orders set
      delivery_latitude = p_latitude,
      delivery_longitude = p_longitude,
      delivery_location_accuracy_meters = p_accuracy_meters,
      delivery_location_captured_at = now(),
      updated_at = now()
    where id = p_order_id
    returning * into v_order;
  end if;
  return v_order;
end;
$$;

revoke all on function public.customer_set_order_location_v1(uuid,text,double precision,double precision,double precision) from public, anon;
grant execute on function public.customer_set_order_location_v1(uuid,text,double precision,double precision,double precision) to authenticated;

-- Notify once per phase when the driver is within one kilometre of the
-- customer-shared point. Inserting into notifications also feeds the existing
-- LINE outbox trigger, so this reaches both the app inbox and LINE.
create or replace function public.enqueue_driver_arrival_notification_v1(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_location public.order_live_locations%rowtype;
  v_destination_latitude double precision;
  v_destination_longitude double precision;
  v_distance_meters double precision;
  v_distance_label text;
  v_event_key text;
  v_phase text;
begin
  select o.* into v_order
  from public.orders o
  where o.id = p_order_id;
  if not found or v_order.is_demo then return; end if;
  select l.* into v_location
  from public.order_live_locations l
  where l.order_id = p_order_id and l.status = 'active';
  if not found then return; end if;

  v_phase := v_location.phase;
  if v_phase = 'pickup' then
    v_destination_latitude := v_order.pickup_latitude;
    v_destination_longitude := v_order.pickup_longitude;
  else
    v_destination_latitude := v_order.delivery_latitude;
    v_destination_longitude := v_order.delivery_longitude;
  end if;
  if v_destination_latitude is null or v_destination_longitude is null then return; end if;

  -- Haversine distance in metres (straight-line distance, like the distance
  -- shown before a route is calculated by a ride-hailing app).
  v_distance_meters := 6371000 * 2 * asin(sqrt(
    power(sin(radians((v_destination_latitude - v_location.latitude) / 2)), 2)
    + cos(radians(v_location.latitude)) * cos(radians(v_destination_latitude))
    * power(sin(radians((v_destination_longitude - v_location.longitude) / 2)), 2)
  ));
  if v_distance_meters > 1000 then return; end if;

  v_distance_label := case
    when v_distance_meters < 1000 then greatest(1, round(v_distance_meters))::text || ' m'
    else round((v_distance_meters / 1000)::numeric, 1)::text || ' km'
  end;
  v_event_key := 'driver-arriving:' || p_order_id::text || ':' || v_phase;
  insert into public.notifications (
    user_id, order_id, title, body, type, link, message_params, source_event_key
  ) values (
    v_order.user_id,
    v_order.id,
    'Driver arriving soon',
    'Your driver is about ' || v_distance_label || ' away for order ' || v_order.order_number || '. Please get ready.',
    'driver_arriving',
    '/order-tracking?orderId=' || v_order.id,
    jsonb_build_object('orderNumber', v_order.order_number, 'distanceLabel', v_distance_label, 'phase', v_phase),
    v_event_key
  )
  on conflict (user_id, order_id, source_event_key)
    where source_event_key is not null and order_id is not null
    do nothing;
end;
$$;

revoke all on function public.enqueue_driver_arrival_notification_v1(uuid) from public, anon, authenticated;

-- Replace the GPS RPCs so every fresh position checks the arrival threshold.
create or replace function public.staff_start_order_tracking_v1(
  p_order_id uuid,
  p_phase text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision default null,
  p_heading_degrees double precision default null,
  p_speed_mps double precision default null
)
returns public.order_live_locations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_result public.order_live_locations%rowtype;
begin
  if not public.can_manage_order_tracking_v1(p_order_id) then raise exception 'TRACKING_STAFF_REQUIRED'; end if;
  if p_phase is null or p_phase not in ('pickup', 'delivery') then raise exception 'INVALID_TRACKING_PHASE'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'INVALID_COORDINATES'; end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.is_demo then raise exception 'ORDER_NOT_TRACKABLE'; end if;
  if v_order.status in ('delivered', 'collected', 'cancelled') then raise exception 'ORDER_NOT_TRACKABLE'; end if;
  if p_phase = 'pickup' and v_order.collection_method <> 'home_pickup' then raise exception 'PICKUP_NOT_REQUIRED'; end if;
  if p_phase = 'delivery' and v_order.return_method <> 'home_delivery' then raise exception 'DELIVERY_NOT_REQUIRED'; end if;

  insert into public.order_live_locations (
    order_id, driver_id, phase, status, latitude, longitude, accuracy_meters,
    heading_degrees, speed_mps, started_at, captured_at, ended_at, updated_at
  ) values (
    p_order_id, auth.uid(), p_phase, 'active', p_latitude, p_longitude,
    p_accuracy_meters, p_heading_degrees, p_speed_mps, now(), now(), null, now()
  )
  on conflict (order_id) do update set
    driver_id = excluded.driver_id, phase = excluded.phase, status = 'active',
    latitude = excluded.latitude, longitude = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters, heading_degrees = excluded.heading_degrees,
    speed_mps = excluded.speed_mps, started_at = now(), captured_at = now(),
    ended_at = null, updated_at = now()
  returning * into v_result;
  perform public.enqueue_driver_arrival_notification_v1(p_order_id);
  return v_result;
end;
$$;

create or replace function public.staff_update_order_location_v1(
  p_order_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision default null,
  p_heading_degrees double precision default null,
  p_speed_mps double precision default null
)
returns public.order_live_locations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result public.order_live_locations%rowtype;
begin
  if not public.can_manage_order_tracking_v1(p_order_id) then raise exception 'TRACKING_STAFF_REQUIRED'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'INVALID_COORDINATES'; end if;
  update public.order_live_locations set
    latitude = p_latitude, longitude = p_longitude, accuracy_meters = p_accuracy_meters,
    heading_degrees = p_heading_degrees, speed_mps = p_speed_mps,
    captured_at = now(), updated_at = now()
  where order_id = p_order_id and status = 'active'
  returning * into v_result;
  if not found then raise exception 'TRACKING_NOT_ACTIVE'; end if;
  perform public.enqueue_driver_arrival_notification_v1(p_order_id);
  return v_result;
end;
$$;

revoke all on function public.staff_start_order_tracking_v1(uuid,text,double precision,double precision,double precision,double precision,double precision) from public, anon;
revoke all on function public.staff_update_order_location_v1(uuid,double precision,double precision,double precision,double precision,double precision) from public, anon;
grant execute on function public.staff_start_order_tracking_v1(uuid,text,double precision,double precision,double precision,double precision,double precision) to authenticated;
grant execute on function public.staff_update_order_location_v1(uuid,double precision,double precision,double precision,double precision,double precision) to authenticated;

notify pgrst, 'reload schema';
commit;
