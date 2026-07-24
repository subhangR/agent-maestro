-- Collab V2 Phase 0: Firebase-authenticated entity-graph foundation.
-- Firebase UIDs are text: Third-Party Auth does not populate auth.users.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;

-- RFC 9562 UUIDv7: timestamp-sortable, with random remaining bits.
create or replace function public.uuidv7()
returns uuid language plpgsql volatile as $$
declare
  bytes bytea := gen_random_bytes(16);
  millis bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  millis_hex text := lpad(to_hex(millis), 12, '0');
  value_hex text;
  i integer;
begin
  for i in 0..5 loop
    bytes := set_byte(bytes, i, (('x' || substr(millis_hex, i * 2 + 1, 2))::bit(8)::int));
  end loop;
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112); -- version 7
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128); -- RFC variant
  value_hex := encode(bytes, 'hex');
  return (
    substr(value_hex, 1, 8) || '-' || substr(value_hex, 9, 4) || '-' ||
    substr(value_hex, 13, 4) || '-' || substr(value_hex, 17, 4) || '-' ||
    substr(value_hex, 21, 12)
  )::uuid;
end;
$$;

create table public.user_profiles (
  firebase_uid text primary key,
  display_name text,
  photo_url text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.spaces (
  id uuid primary key default public.uuidv7(),
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '',
  github_repo text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_by text not null references public.user_profiles(firebase_uid),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entities (
  id uuid primary key default public.uuidv7(),
  space_id uuid not null references public.spaces(id),
  kind text not null check (kind in ('channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit')),
  parent_id uuid references public.entities(id) deferrable initially deferred,
  position double precision not null default 0,
  created_by uuid not null references public.entities(id) deferrable initially deferred,
  visibility text not null default 'space' check (visibility in ('space', 'restricted')),
  version integer not null default 1 check (version > 0),
  activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index entities_space_kind_created_idx on public.entities(space_id, kind, created_at desc);
create index entities_parent_idx on public.entities(parent_id) where deleted_at is null;

create table public.members (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  space_id uuid not null references public.spaces(id),
  firebase_uid text not null references public.user_profiles(firebase_uid),
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  display_name text,
  joined_at timestamptz not null default now(),
  unique(space_id, firebase_uid)
);
create index members_firebase_uid_idx on public.members(firebase_uid);

create table public.team_members (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  owner_member_id uuid not null references public.members(entity_id),
  name text not null,
  role text not null default '',
  identity text not null default '',
  memories jsonb not null default '[]'::jsonb,
  model text,
  agent_tool text,
  mode text,
  permission_mode text,
  capabilities jsonb not null default '{}'::jsonb,
  command_permissions jsonb not null default '{}'::jsonb,
  avatar text
);

create table public.edge_types (
  type text primary key,
  src_kinds text[] not null,
  dst_kinds text[] not null,
  description text not null,
  props_schema jsonb,
  acyclic boolean not null default false
);

create table public.edges (
  id uuid primary key default public.uuidv7(),
  space_id uuid not null references public.spaces(id),
  src_id uuid not null references public.entities(id) on delete cascade,
  dst_id uuid not null references public.entities(id) on delete cascade,
  type text not null,
  props jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.entities(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(src_id, dst_id, type)
);
create index edges_src_type_idx on public.edges(src_id, type);
create index edges_dst_type_idx on public.edges(dst_id, type);

create table public.entity_counters (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  likes integer not null default 0, dislikes integer not null default 0,
  stars integer not null default 0, points integer not null default 0,
  messages integer not null default 0, updated_at timestamptz not null default now()
);
create table public.entity_versions (
  entity_id uuid not null references public.entities(id) on delete cascade,
  version integer not null, snapshot jsonb not null,
  changed_by uuid not null references public.entities(id),
  changed_at timestamptz not null default now(), primary key(entity_id, version)
);
create table public.point_events (
  id uuid primary key default public.uuidv7(), space_id uuid not null references public.spaces(id),
  entity_id uuid not null references public.entities(id) on delete cascade,
  actor_id uuid not null references public.entities(id), amount integer not null check (amount <> 0),
  reason text not null default 'grant' check (reason in ('grant','award','seed')),
  ref_id uuid, client_event_id text unique, created_at timestamptz not null default now()
);
create index point_events_entity_idx on public.point_events(entity_id);

create table public.activity (
  id uuid primary key default public.uuidv7(), space_id uuid not null references public.spaces(id),
  entity_id uuid references public.entities(id) on delete set null,
  actor_id uuid references public.entities(id) on delete set null,
  verb text not null, ref_id uuid, summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_space_created_idx on public.activity(space_id, created_at desc);
create table public.notification_outbox (
  id uuid primary key default public.uuidv7(), space_id uuid not null references public.spaces(id),
  recipient_member_id uuid not null references public.members(entity_id),
  activity_id uuid references public.activity(id) on delete set null,
  kind text not null, payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0, last_error text, processed_at timestamptz,
  dead_lettered_at timestamptz, created_at timestamptz not null default now()
);
create index notification_outbox_pending_idx on public.notification_outbox(created_at) where processed_at is null and dead_lettered_at is null;
create table public.read_marks (
  member_id uuid not null references public.members(entity_id) on delete cascade,
  anchor_id uuid not null references public.entities(id) on delete cascade,
  last_read_at timestamptz not null default now(), primary key(member_id, anchor_id)
);

create or replace function private.firebase_uid() returns text language sql stable as $$
  select nullif((select auth.jwt() ->> 'sub'), '')
$$;
create or replace function private.is_valid_firebase_identity() returns boolean language sql stable as $$
  select (select auth.jwt() ->> 'iss') = 'https://securetoken.google.com/maestro-5f3fc'
     and (select auth.jwt() ->> 'aud') = 'maestro-5f3fc'
     and coalesce((select auth.jwt() -> 'firebase' ->> 'sign_in_provider'), '') <> 'anonymous'
     and private.firebase_uid() is not null
$$;
create or replace function private.is_space_member(target_space uuid) returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.is_valid_firebase_identity() and exists (
    select 1 from public.members m where m.space_id = target_space and m.firebase_uid = private.firebase_uid()
  )
$$;
create or replace function private.is_space_admin(target_space uuid) returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.is_valid_firebase_identity() and exists (
    select 1 from public.members m where m.space_id = target_space and m.firebase_uid = private.firebase_uid() and m.role in ('owner','admin')
  )
$$;
revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

create or replace function public.current_identity()
returns public.user_profiles language plpgsql security definer set search_path = public, private, pg_temp as $$
declare profile public.user_profiles;
begin
  if not private.is_valid_firebase_identity() then raise exception 'invalid Firebase identity' using errcode = '42501'; end if;
  insert into public.user_profiles(firebase_uid, display_name, photo_url, email)
  values (private.firebase_uid(), auth.jwt() ->> 'name', auth.jwt() ->> 'picture', auth.jwt() ->> 'email')
  on conflict (firebase_uid) do update set display_name = coalesce(excluded.display_name, user_profiles.display_name), photo_url = coalesce(excluded.photo_url, user_profiles.photo_url), email = coalesce(excluded.email, user_profiles.email), updated_at = now()
  returning * into profile;
  return profile;
end;
$$;
revoke all on function public.current_identity() from public;
grant execute on function public.current_identity() to authenticated;

create or replace function private.validate_entity_parent() returns trigger language plpgsql as $$
declare p public.entities;
begin
  if new.parent_id is null then return new; end if;
  select * into p from public.entities where id = new.parent_id;
  if not found or p.space_id <> new.space_id or p.kind <> new.kind then raise exception 'parent must be same-kind and same-space'; end if;
  if new.parent_id = new.id then raise exception 'entity cannot parent itself'; end if;
  if exists (with recursive ancestors as (select parent_id from public.entities where id = new.parent_id union all select e.parent_id from public.entities e join ancestors a on e.id = a.parent_id where a.parent_id is not null) select 1 from ancestors where parent_id = new.id) then raise exception 'hierarchy cycle'; end if;
  return new;
end;
$$;
create trigger entities_validate_parent before insert or update of parent_id, space_id, kind on public.entities for each row execute function private.validate_entity_parent();

create or replace function private.validate_edge() returns trigger language plpgsql as $$
declare s public.entities; d public.entities; t public.edge_types;
begin
 select * into s from public.entities where id = new.src_id; select * into d from public.entities where id = new.dst_id;
 if s.id is null or d.id is null or s.space_id <> new.space_id or d.space_id <> new.space_id then raise exception 'edge endpoints must be in its space'; end if;
 select * into t from public.edge_types where type = new.type;
 if found then
   if not (s.kind = any(t.src_kinds) and d.kind = any(t.dst_kinds)) then raise exception 'edge endpoint kinds invalid for %', new.type; end if;
 elsif new.type !~ '^x:' then raise exception 'unregistered edge types must begin x:'; end if;
 return new;
end;
$$;
create trigger edges_validate before insert or update on public.edges for each row execute function private.validate_edge();

-- All exposed tables are RLS-protected. Writes land through audited RPCs in Phase 1.
alter table public.user_profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.entities enable row level security;
alter table public.members enable row level security;
alter table public.team_members enable row level security;
alter table public.edge_types enable row level security;
alter table public.edges enable row level security;
alter table public.entity_counters enable row level security;
alter table public.entity_versions enable row level security;
alter table public.point_events enable row level security;
alter table public.activity enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.read_marks enable row level security;

create policy profiles_own_select on public.user_profiles for select to authenticated using (firebase_uid = private.firebase_uid());
create policy edge_types_authenticated_select on public.edge_types for select to authenticated using (true);
create policy spaces_member_select on public.spaces for select to authenticated using ((select private.is_space_member(id)));
create policy entities_member_select on public.entities for select to authenticated using (visibility = 'space' and (select private.is_space_member(space_id)));
create policy members_member_select on public.members for select to authenticated using ((select private.is_space_member(space_id)));
create policy team_members_member_select on public.team_members for select to authenticated using (exists (select 1 from public.entities e where e.id = team_members.entity_id and (select private.is_space_member(e.space_id))));
create policy edges_member_select on public.edges for select to authenticated using ((select private.is_space_member(space_id)));
create policy counters_member_select on public.entity_counters for select to authenticated using (exists (select 1 from public.entities e where e.id = entity_counters.entity_id and e.visibility = 'space' and (select private.is_space_member(e.space_id))));
create policy versions_member_select on public.entity_versions for select to authenticated using (exists (select 1 from public.entities e where e.id = entity_versions.entity_id and (select private.is_space_member(e.space_id))));
create policy points_member_select on public.point_events for select to authenticated using ((select private.is_space_member(space_id)));
create policy activity_member_select on public.activity for select to authenticated using ((select private.is_space_member(space_id)));
create policy read_marks_own on public.read_marks for select to authenticated using (exists (select 1 from public.members m where m.entity_id = read_marks.member_id and m.firebase_uid = private.firebase_uid()));

create or replace function public.create_space(space_name text, space_description text default '', repository text default null)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare uid text; space_id uuid := public.uuidv7(); member_id uuid := public.uuidv7();
begin
  select firebase_uid into uid from public.current_identity();
  insert into public.spaces(id, name, description, github_repo, created_by) values (space_id, space_name, coalesce(space_description, ''), repository, uid);
  insert into public.entities(id, space_id, kind, created_by) values (member_id, space_id, 'member', member_id);
  insert into public.members(entity_id, space_id, firebase_uid, role) values (member_id, space_id, uid, 'owner');
  insert into public.entity_counters(entity_id) values (member_id);
  return space_id;
end;
$$;
revoke all on function public.create_space(text, text, text) from public;
grant execute on function public.create_space(text, text, text) to authenticated;

grant select on public.user_profiles, public.spaces, public.entities, public.members, public.team_members, public.edge_types, public.edges, public.entity_counters, public.entity_versions, public.point_events, public.activity, public.read_marks to authenticated;

insert into public.edge_types(type, src_kinds, dst_kinds, description, acyclic) values
  ('depends_on', array['task','doc','spell','skill','pull_request','commit'], array['task','doc','spell','skill','pull_request','commit'], 'Sequencing or prerequisite relation', true),
  ('assigned_to', array['task'], array['member','team_member'], 'Task assignment', false),
  ('pulled', array['member','team_member'], array['channel','task','doc','file','spell','skill'], 'Local projection/adoption', false),
  ('working_on', array['member','team_member'], array['task'], 'Active work', false),
  ('attached_to', array['doc','file','spell','skill'], array['channel','task','message','member','team_member','doc','pull_request'], 'Attachment', false),
  ('relates_to', array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'], array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'], 'Generic relation', false)
on conflict (type) do nothing;
