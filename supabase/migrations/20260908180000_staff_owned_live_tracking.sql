begin;

-- A live trip belongs to the authenticated staff member who explicitly starts
-- it. Starting again is an intentional handoff to the new staff phone.
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
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.is_admin() and not exists (
    select 1 from public.orders where id = p_order_id and assigned_driver_id = auth.uid()
  ) then raise exception 'TRACKING_STAFF_REQUIRED'; end if;
  if p_phase is null or p_phase not in ('pickup', 'delivery') then raise exception 'INVALID_TRACKING_PHASE'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'INVALID_COORDINATES';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.is_demo then raise exception 'ORDER_NOT_TRACKABLE'; end if;
  if v_order.status in ('delivered', 'collected', 'cancelled') then raise exception 'ORDER_NOT_TRACKABLE'; end if;
  if p_phase = 'pickup' and v_order.collection_method <> 'home_pickup' then raise exception 'PICKUP_NOT_REQUIRED'; end if;
  if p_phase = 'delivery' and v_order.return_method <> 'home_delivery' then raise exception 'DELIVERY_NOT_REQUIRED'; end if;

  update public.orders
  set assigned_driver_id = auth.uid(), updated_at = now()
  where id = p_order_id;

  insert into public.order_live_locations (
    order_id, driver_id, phase, status, latitude, longitude, accuracy_meters,
    heading_degrees, speed_mps, started_at, captured_at, ended_at, updated_at
  ) values (
    p_order_id, auth.uid(), p_phase, 'active', p_latitude, p_longitude,
    p_accuracy_meters, p_heading_degrees, p_speed_mps, now(), now(), null, now()
  )
  on conflict (order_id) do update set
    driver_id = auth.uid(), phase = excluded.phase, status = 'active',
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
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'INVALID_COORDINATES';
  end if;

  update public.order_live_locations set
    latitude = p_latitude, longitude = p_longitude, accuracy_meters = p_accuracy_meters,
    heading_degrees = p_heading_degrees, speed_mps = p_speed_mps,
    captured_at = now(), updated_at = now()
  where order_id = p_order_id
    and status = 'active'
    and driver_id = auth.uid()
  returning * into v_result;
  if not found then raise exception 'TRACKING_DEVICE_NOT_OWNER'; end if;

  perform public.enqueue_driver_arrival_notification_v1(p_order_id);
  return v_result;
end;
$$;

create or replace function public.staff_stop_order_tracking_v1(p_order_id uuid)
returns public.order_live_locations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result public.order_live_locations%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  update public.order_live_locations set
    status = 'completed', ended_at = now(), updated_at = now()
  where order_id = p_order_id
    and status = 'active'
    and (driver_id = auth.uid() or public.is_admin())
  returning * into v_result;
  if not found then raise exception 'TRACKING_NOT_ACTIVE'; end if;
  return v_result;
end;
$$;

revoke all on function public.staff_start_order_tracking_v1(uuid,text,double precision,double precision,double precision,double precision,double precision) from public, anon;
revoke all on function public.staff_update_order_location_v1(uuid,double precision,double precision,double precision,double precision,double precision) from public, anon;
revoke all on function public.staff_stop_order_tracking_v1(uuid) from public, anon;
grant execute on function public.staff_start_order_tracking_v1(uuid,text,double precision,double precision,double precision,double precision,double precision) to authenticated;
grant execute on function public.staff_update_order_location_v1(uuid,double precision,double precision,double precision,double precision,double precision) to authenticated;
grant execute on function public.staff_stop_order_tracking_v1(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
