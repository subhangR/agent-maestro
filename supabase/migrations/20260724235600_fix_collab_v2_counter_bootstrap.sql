-- The counter trigger and the newer facade RPCs both inserted the same row.
-- Messages are the only current entity creation path without an explicit
-- counter insert, so keep the trigger for them and let command RPCs own the rest.
create or replace function private.ensure_entity_counter() returns trigger
language plpgsql set search_path = public, private, pg_temp as $$
begin
  if new.kind = 'message' then
    insert into public.entity_counters(entity_id) values (new.id)
    on conflict (entity_id) do nothing;
  end if;
  return new;
end;
$$;
