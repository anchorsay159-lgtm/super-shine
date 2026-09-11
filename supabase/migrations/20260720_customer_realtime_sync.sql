begin;

-- One public revision counter invalidates customer catalogue and promotion
-- queries without exposing private redemption rows or weakening their RLS.
alter table public.business_settings
  add column if not exists realtime_revision bigint not null default 0;

create or replace function public.bump_customer_realtime_revision_v16()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.business_settings
  set realtime_revision = realtime_revision + 1
  where id = 1;
  return null;
end;
$$;

revoke all on function public.bump_customer_realtime_revision_v16() from public, anon, authenticated;

drop trigger if exists services_customer_realtime_v16 on public.services;
create trigger services_customer_realtime_v16
after insert or update or delete on public.services
for each statement execute function public.bump_customer_realtime_revision_v16();

drop trigger if exists service_options_customer_realtime_v16 on public.service_options;
create trigger service_options_customer_realtime_v16
after insert or update or delete on public.service_options
for each statement execute function public.bump_customer_realtime_revision_v16();

drop trigger if exists coupons_customer_realtime_v16 on public.coupons;
create trigger coupons_customer_realtime_v16
after insert or update or delete on public.coupons
for each statement execute function public.bump_customer_realtime_revision_v16();

drop trigger if exists coupon_usage_customer_realtime_v16 on public.coupon_usage;
create trigger coupon_usage_customer_realtime_v16
after insert or update or delete on public.coupon_usage
for each statement execute function public.bump_customer_realtime_revision_v16();

drop trigger if exists pickup_slots_customer_realtime_v16 on public.pickup_slots;
create trigger pickup_slots_customer_realtime_v16
after insert or update or delete on public.pickup_slots
for each statement execute function public.bump_customer_realtime_revision_v16();

-- Inactive services are still public catalogue records, but remain blocked by
-- checkout and place_order_v11. Private customer tables keep their existing RLS.
drop policy if exists "services_public_read_active" on public.services;
drop policy if exists "services_public_read_catalog" on public.services;
create policy "services_public_read_catalog" on public.services
for select to anon, authenticated
using (true);

-- Postgres Changes only emits tables present in this publication. Add each
-- required live-update source idempotently and preserve existing entries.
do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;

  foreach table_name in array array[
    'services',
    'service_options',
    'coupons',
    'coupon_usage',
    'pickup_slots',
    'business_settings',
    'orders',
    'order_items',
    'order_status_history',
    'notifications',
    'payments',
    'support_messages'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

-- Event handlers refetch authoritative rows and do not require previous-row
-- payloads, so REPLICA IDENTITY FULL is intentionally not enabled.
notify pgrst, 'reload schema';

commit;
