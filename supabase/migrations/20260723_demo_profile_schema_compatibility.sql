begin;

-- Some deployed projects intentionally removed the phone-verification columns.
-- Keep anonymous demo profiles isolated without requiring those optional fields.
create or replace function public.protect_demo_profile_v17()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    if new.id is distinct from auth.uid() then
      raise exception 'DEMO_PROFILE_FORBIDDEN';
    end if;

    new.role := 'customer';
    new.is_demo := true;
    new.phone := '';

    if to_jsonb(new) ? 'normalized_phone' then
      new := jsonb_populate_record(new, jsonb_build_object('normalized_phone', null));
    end if;
    if to_jsonb(new) ? 'phone_verified_at' then
      new := jsonb_populate_record(new, jsonb_build_object('phone_verified_at', null));
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;
