begin;

-- Keep only the latest driver position for each order. This gives customers a
-- live marker without retaining an unnecessary location history.
alter table public.orders
  add column if not exists assigned_driver_id uuid references public.profiles(id) on delete set null;

create index if not exists orders_assigned_driver_idx
  on public.orders (assigned_driver_id)
  where assigned_driver_id is not null;

create table if not exists public.order_live_locations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  phase text not null check (phase in ('pickup', 'delivery')),
  status text not null default 'active' check (status in ('active', 'completed')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  heading_degrees double precision check (heading_degrees is null or heading_degrees between 0 and 360),
  speed_mps double precision check (speed_mps is null or speed_mps >= 0),
  started_at timestamptz not null default now(),
  captured_at timestamptz not null default now(),
  ended_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.order_live_locations enable row level security;

drop policy if exists "order_live_locations_participant_read_v1" on public.order_live_locations;
create policy "order_live_locations_participant_read_v1"
on public.order_live_locations for select to authenticated
using (
  public.is_admin()
  or driver_id = auth.uid()
  or exists (
    select 1 from public.orders o
    where o.id = order_id and o.user_id = auth.uid()
  )
);

-- All writes go through the validated RPC functions below.
revoke insert, update, delete on public.order_live_locations from anon, authenticated;
grant select on public.order_live_locations to authenticated;

create or replace function public.can_manage_order_tracking_v1(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin() or exists (
    select 1
    from public.orders o
    join public.profiles p on p.id = auth.uid()
    where o.id = p_order_id
      and o.assigned_driver_id = auth.uid()
      and p.role = 'driver'
  );
$$;

revoke all on function public.can_manage_order_tracking_v1(uuid) from public, anon;
grant execute on function public.can_manage_order_tracking_v1(uuid) to authenticated;

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
  if not public.can_manage_order_tracking_v1(p_order_id) then
    raise exception 'TRACKING_STAFF_REQUIRED';
  end if;
  if p_phase not in ('pickup', 'delivery') then raise exception 'INVALID_TRACKING_PHASE'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'INVALID_COORDINATES';
  end if;

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
    driver_id = excluded.driver_id,
    phase = excluded.phase,
    status = 'active',
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters,
    heading_degrees = excluded.heading_degrees,
    speed_mps = excluded.speed_mps,
    started_at = now(),
    captured_at = now(),
    ended_at = null,
    updated_at = now()
  returning * into v_result;
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
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'INVALID_COORDINATES'; end if;

  update public.order_live_locations set
    latitude = p_latitude,
    longitude = p_longitude,
    accuracy_meters = p_accuracy_meters,
    heading_degrees = p_heading_degrees,
    speed_mps = p_speed_mps,
    captured_at = now(),
    updated_at = now()
  where order_id = p_order_id and status = 'active'
  returning * into v_result;
  if not found then raise exception 'TRACKING_NOT_ACTIVE'; end if;
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
  if not public.can_manage_order_tracking_v1(p_order_id) then raise exception 'TRACKING_STAFF_REQUIRED'; end if;
  update public.order_live_locations set
    status = 'completed', ended_at = now(), updated_at = now()
  where order_id = p_order_id
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.staff_start_order_tracking_v1(uuid,text,double precision,double precision,double precision,double precision,double precision) from public, anon;
revoke all on function public.staff_update_order_location_v1(uuid,double precision,double precision,double precision,double precision,double precision) from public, anon;
revoke all on function public.staff_stop_order_tracking_v1(uuid) from public, anon;
grant execute on function public.staff_start_order_tracking_v1(uuid,text,double precision,double precision,double precision,double precision,double precision) to authenticated;
grant execute on function public.staff_update_order_location_v1(uuid,double precision,double precision,double precision,double precision,double precision) to authenticated;
grant execute on function public.staff_stop_order_tracking_v1(uuid) to authenticated;

create or replace function public.finish_order_live_tracking_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.order_live_locations set
    status = 'completed', ended_at = now(), updated_at = now()
  where order_id = new.id
    and status = 'active'
    and (
      new.status in ('delivered', 'collected', 'cancelled')
      or (phase = 'pickup' and new.status in ('picked_up', 'received_at_store', 'processing', 'ready', 'ready_for_collection', 'out_for_delivery'))
    );
  return new;
end;
$$;

revoke all on function public.finish_order_live_tracking_v1() from public, anon, authenticated;
drop trigger if exists orders_finish_live_tracking_v1 on public.orders;
create trigger orders_finish_live_tracking_v1
after update of status on public.orders
for each row when (old.status is distinct from new.status)
execute function public.finish_order_live_tracking_v1();

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_live_locations'
  ) then
    alter publication supabase_realtime add table public.order_live_locations;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
