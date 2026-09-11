-- Hotfix for databases created before the driver role was introduced.
-- The driver account Edge Function writes profiles.role = 'driver'. Older
-- profiles check constraints only permit customer/admin and reject that write.

begin;

do $$
declare
  role_constraint record;
begin
  for role_constraint in
    select distinct constraint_row.conname
    from pg_constraint constraint_row
    join pg_attribute attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
     and attribute_row.attnum = any (constraint_row.conkey)
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.contype = 'c'
      and attribute_row.attname = 'role'
  loop
    execute format(
      'alter table public.profiles drop constraint %I',
      role_constraint.conname
    );
  end loop;
end;
$$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('customer', 'admin', 'driver'));

notify pgrst, 'reload schema';
commit;
