-- pgcrypto is installed in Supabase's extensions schema, not public.
create or replace function public.uuidv7()
returns uuid language plpgsql volatile as $$
declare
  bytes bytea := extensions.gen_random_bytes(16);
  millis bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  millis_hex text := lpad(to_hex(millis), 12, '0');
  value_hex text;
  i integer;
begin
  for i in 0..5 loop
    bytes := set_byte(bytes, i, (('x' || substr(millis_hex, i * 2 + 1, 2))::bit(8)::int));
  end loop;
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112);
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);
  value_hex := encode(bytes, 'hex');
  return (substr(value_hex, 1, 8) || '-' || substr(value_hex, 9, 4) || '-' ||
          substr(value_hex, 13, 4) || '-' || substr(value_hex, 17, 4) || '-' ||
          substr(value_hex, 21, 12))::uuid;
end;
$$;
