-- Collab V2 Phase 1: task detail domain and task-facing graph semantics.
--
-- This migration intentionally does NOT seed task_axes.  The per-space `type`
-- axis is seeded only by the Phase 2 space bootstrap path.

-- A Firebase user may act as their own member entity or an agent persona owned by
-- that member.  All SECURITY DEFINER write RPCs must call this helper themselves;
-- RLS does not protect a definer function.
create or replace function private.can_act_as(target_actor_id uuid, target_space_id uuid)
returns boolean
language sql stable security definer
set search_path = public, private, pg_temp
as $$
  select private.is_valid_firebase_identity() and (
    exists (
      select 1
      from public.members m
      where m.entity_id = target_actor_id
        and m.space_id = target_space_id
        and m.firebase_uid = private.firebase_uid()
    )
    or exists (
      select 1
      from public.team_members tm
      join public.members owner_member on owner_member.entity_id = tm.owner_member_id
      where tm.entity_id = target_actor_id
        and owner_member.space_id = target_space_id
        and owner_member.firebase_uid = private.firebase_uid()
    )
  )
$$;

create or replace function private.current_identity_owns_actor(target_actor_id uuid, target_space_id uuid)
returns boolean
language sql stable security definer
set search_path = public, private, pg_temp
as $$
  select private.can_act_as(target_actor_id, target_space_id)
$$;

revoke all on function private.can_act_as(uuid, uuid) from public;
revoke all on function private.current_identity_owns_actor(uuid, uuid) from public;

create table public.tasks (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 500),
  description text not null default '',
  axes jsonb not null default '{}'::jsonb check (jsonb_typeof(axes) = 'object'),
  work_status text not null default 'open'
    check (work_status in ('open', 'pulled', 'working', 'in_review', 'done', 'blocked', 'cancelled')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  acceptance_criteria jsonb not null default '[]'::jsonb
    check (jsonb_typeof(acceptance_criteria) = 'array'),
  points_estimate integer check (points_estimate is null or points_estimate >= 0),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_axes_gin_idx on public.tasks using gin (axes jsonb_path_ops);
create index tasks_work_status_idx on public.tasks(work_status);
create index tasks_due_date_idx on public.tasks(due_date) where due_date is not null;

-- Axis definitions are space-scoped configuration, not entities.  An empty
-- axis_values array means that the axis accepts free-text values.
create table public.task_axes (
  id uuid primary key default public.uuidv7(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  axis_values text[] not null default '{}'::text[],
  kind text not null default 'manual' check (kind in ('default', 'manual')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(space_id, name),
  check (array_position(axis_values, null) is null)
);
create index task_axes_space_position_idx on public.task_axes(space_id, position, name);

-- A detail row can only decorate a task envelope.  This is a trigger instead
-- of a redundant space_id column, keeping the universal entity envelope as the
-- source of space membership.
create or replace function private.validate_task_entity()
returns trigger language plpgsql
set search_path = public, private, pg_temp
as $$
declare entity_kind text;
begin
  select kind into entity_kind from public.entities where id = new.entity_id;
  if entity_kind is distinct from 'task' then
    raise exception 'task detail row requires an entity of kind task' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger tasks_validate_entity
before insert or update of entity_id on public.tasks
for each row execute function private.validate_task_entity();

revoke all on function private.validate_task_entity() from public;

-- Enforce a single value per named axis and validate known axes when a task is
-- written.  The Phase 2 seed is deliberately separate, so an empty axes object
-- remains valid before that seed exists.
create or replace function private.validate_task_axes()
returns trigger language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  task_space_id uuid;
  axis_name text;
  axis_value text;
  allowed_values text[];
begin
  if jsonb_typeof(new.axes) <> 'object' then
    raise exception 'task axes must be a JSON object' using errcode = '23514';
  end if;

  select space_id into task_space_id from public.entities where id = new.entity_id;
  if task_space_id is null then
    raise exception 'task entity does not exist' using errcode = '23503';
  end if;

  for axis_name, axis_value in select key, value from jsonb_each_text(new.axes) loop
    if char_length(btrim(axis_name)) = 0 or char_length(btrim(axis_value)) = 0 then
      raise exception 'task axis names and values must be non-empty strings' using errcode = '23514';
    end if;

    select axis_values into allowed_values
    from public.task_axes
    where space_id = task_space_id and name = axis_name;

    if not found then
      raise exception 'unknown task axis: %', axis_name using errcode = '23514';
    end if;
    if cardinality(allowed_values) > 0 and not (axis_value = any(allowed_values)) then
      raise exception 'invalid value % for task axis %', axis_value, axis_name using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
create trigger tasks_validate_axes
before insert or update of axes, entity_id on public.tasks
for each row execute function private.validate_task_axes();

revoke all on function private.validate_task_axes() from public;

-- Generic acyclic edge enforcement.  It is driven by the registry flag, so a
-- future acyclic type gains protection without another trigger.  The bounded
-- traversal is a safety valve for pathological existing data.
create or replace function private.prevent_acyclic_edge_cycle()
returns trigger language plpgsql
set search_path = public, private, pg_temp
as $$
declare is_acyclic boolean;
begin
  select acyclic into is_acyclic from public.edge_types where type = new.type;
  if coalesce(is_acyclic, false) is not true then
    return new;
  end if;
  if new.src_id = new.dst_id then
    raise exception 'acyclic edge % cannot target itself', new.type using errcode = '23514';
  end if;
  if exists (
    with recursive reachable(id, path, depth) as (
      select e.dst_id, array[e.src_id, e.dst_id], 1
      from public.edges e
      where e.src_id = new.dst_id
        and e.type = new.type
        and e.id is distinct from new.id
      union all
      select e.dst_id, r.path || e.dst_id, r.depth + 1
      from public.edges e
      join reachable r on e.src_id = r.id
      where e.type = new.type
        and e.id is distinct from new.id
        and not e.dst_id = any(r.path)
        and r.depth < 256
    )
    select 1 from reachable where id = new.src_id
  ) then
    raise exception 'acyclic edge % would create a cycle', new.type using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger edges_prevent_acyclic_cycles
before insert or update of src_id, dst_id, type on public.edges
for each row execute function private.prevent_acyclic_edge_cycle();

revoke all on function private.prevent_acyclic_edge_cycle() from public;

-- Complete the task-facing v1 edge taxonomy.  `depends_on` is intentionally
-- any-to-any; its target-resolution semantics remain kind-aware at query/RPC
-- level, while this trigger protects its directed graph from cycles.
insert into public.edge_types(type, src_kinds, dst_kinds, description, acyclic) values
  ('completed_by', array['task'], array['member','team_member'], 'Task completion attribution', false),
  ('tracks', array['task'], array['pull_request','commit'], 'Task implementation tracking', false),
  ('equips', array['task','team_member'], array['spell','skill'], 'Task or agent capability selection', false),
  ('copy_of', array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'], array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'], 'Copy provenance', false),
  ('likes', array['member'], array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'], 'Positive reaction', false),
  ('dislikes', array['member'], array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'], 'Negative reaction', false),
  ('stars', array['member'], array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'], 'Star reaction', false)
on conflict (type) do update set
  src_kinds = excluded.src_kinds,
  dst_kinds = excluded.dst_kinds,
  description = excluded.description,
  acyclic = excluded.acyclic;

update public.edge_types
set src_kinds = array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'],
    dst_kinds = array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'],
    description = 'Sequencing or prerequisite relation',
    acyclic = true
where type = 'depends_on';

-- A version snapshot represents intrinsic task content.  Edges and messages
-- deliberately do not call this function: they advance an entity's activity_at
-- without creating a content version.
create or replace function private.task_snapshot(target_entity_id uuid)
returns jsonb language sql stable security definer
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'entity', jsonb_build_object(
      'id', e.id, 'space_id', e.space_id, 'parent_id', e.parent_id,
      'position', e.position, 'visibility', e.visibility, 'version', e.version
    ),
    'task', jsonb_build_object(
      'title', t.title, 'description', t.description, 'axes', t.axes,
      'work_status', t.work_status, 'priority', t.priority,
      'acceptance_criteria', t.acceptance_criteria,
      'points_estimate', t.points_estimate, 'due_date', t.due_date
    )
  )
  from public.entities e
  join public.tasks t on t.entity_id = e.id
  where e.id = target_entity_id
$$;

revoke all on function private.task_snapshot(uuid) from public;

-- Security-definer RPC: it repeats both membership and actor-ownership checks
-- before writing.  It does not rely on RLS, which a definer function bypasses.
create or replace function public.create_task(
  p_space_id uuid,
  p_actor_id uuid,
  p_title text,
  p_description text default '',
  p_axes jsonb default '{}'::jsonb,
  p_parent_id uuid default null,
  p_position double precision default 0,
  p_priority text default 'medium',
  p_acceptance_criteria jsonb default '[]'::jsonb,
  p_points_estimate integer default null,
  p_due_date date default null
)
returns uuid language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare task_id uuid := public.uuidv7();
begin
  if not private.is_space_member(p_space_id) or not private.can_act_as(p_actor_id, p_space_id) then
    raise exception 'not permitted to create task in this space' using errcode = '42501';
  end if;

  insert into public.entities(id, space_id, kind, parent_id, position, created_by)
  values (task_id, p_space_id, 'task', p_parent_id, coalesce(p_position, 0), p_actor_id);
  insert into public.tasks(entity_id, title, description, axes, priority, acceptance_criteria, points_estimate, due_date)
  values (task_id, p_title, coalesce(p_description, ''), coalesce(p_axes, '{}'::jsonb),
          coalesce(p_priority, 'medium'), coalesce(p_acceptance_criteria, '[]'::jsonb),
          p_points_estimate, p_due_date);
  insert into public.entity_counters(entity_id) values (task_id) on conflict do nothing;
  insert into public.entity_versions(entity_id, version, snapshot, changed_by)
  values (task_id, 1, private.task_snapshot(task_id), p_actor_id);
  insert into public.activity(space_id, entity_id, actor_id, verb, summary)
  values (p_space_id, task_id, p_actor_id, 'created', jsonb_build_object('kind', 'task'));
  return task_id;
end;
$$;

-- Creator (or that creator's owning human) and space admins may change intrinsic
-- task content.  Status/complete workflow restrictions will be layered in a
-- dedicated RPC rather than exposing generic table UPDATEs.
create or replace function public.update_task_content(
  p_task_id uuid,
  p_actor_id uuid,
  p_title text,
  p_description text,
  p_axes jsonb,
  p_work_status text,
  p_priority text,
  p_acceptance_criteria jsonb,
  p_points_estimate integer,
  p_due_date date
)
returns void language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare task_space_id uuid; task_creator_id uuid; next_version integer;
begin
  select space_id, created_by into task_space_id, task_creator_id
  from public.entities where id = p_task_id and kind = 'task' and deleted_at is null;
  if task_space_id is null then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if not private.is_space_member(task_space_id) or not private.can_act_as(p_actor_id, task_space_id) then
    raise exception 'not permitted to update this task' using errcode = '42501';
  end if;
  if not private.is_space_admin(task_space_id)
     and p_actor_id <> task_creator_id
     and not private.current_identity_owns_actor(task_creator_id, task_space_id) then
    raise exception 'only the creator or a space admin may update this task' using errcode = '42501';
  end if;

  update public.tasks
  set title = p_title, description = coalesce(p_description, ''), axes = coalesce(p_axes, '{}'::jsonb),
      work_status = p_work_status, priority = p_priority,
      acceptance_criteria = coalesce(p_acceptance_criteria, '[]'::jsonb),
      points_estimate = p_points_estimate, due_date = p_due_date, updated_at = now()
  where entity_id = p_task_id;
  update public.entities
  set version = version + 1, activity_at = now(), updated_at = now()
  where id = p_task_id
  returning version into next_version;
  insert into public.entity_versions(entity_id, version, snapshot, changed_by)
  values (p_task_id, next_version, private.task_snapshot(p_task_id), p_actor_id);
  insert into public.activity(space_id, entity_id, actor_id, verb, summary)
  values (task_space_id, p_task_id, p_actor_id, 'updated', jsonb_build_object('kind', 'task'));
end;
$$;

-- Axis configuration is controlled by a space administrator.  This creates no
-- default axes; Phase 2 invokes it per newly bootstrapped space.
create or replace function public.create_task_axis(
  p_space_id uuid,
  p_name text,
  p_axis_values text[] default '{}'::text[],
  p_kind text default 'manual',
  p_position integer default 0
)
returns uuid language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare axis_id uuid := public.uuidv7();
begin
  if not private.is_space_admin(p_space_id) then
    raise exception 'only a space admin may configure task axes' using errcode = '42501';
  end if;
  insert into public.task_axes(id, space_id, name, axis_values, kind, position)
  values (axis_id, p_space_id, p_name, coalesce(p_axis_values, '{}'::text[]), coalesce(p_kind, 'manual'), coalesce(p_position, 0));
  return axis_id;
end;
$$;

alter table public.tasks enable row level security;
alter table public.task_axes enable row level security;

create policy tasks_member_select on public.tasks
for select to authenticated
using (exists (
  select 1 from public.entities e
  where e.id = tasks.entity_id
    and e.visibility = 'space'
    and private.is_space_member(e.space_id)
));
create policy task_axes_member_select on public.task_axes
for select to authenticated
using (private.is_space_member(space_id));

revoke all on function public.create_task(uuid, uuid, text, text, jsonb, uuid, double precision, text, jsonb, integer, date) from public;
revoke all on function public.update_task_content(uuid, uuid, text, text, jsonb, text, text, jsonb, integer, date) from public;
revoke all on function public.create_task_axis(uuid, text, text[], text, integer) from public;
grant execute on function public.create_task(uuid, uuid, text, text, jsonb, uuid, double precision, text, jsonb, integer, date) to authenticated;
grant execute on function public.update_task_content(uuid, uuid, text, text, jsonb, text, text, jsonb, integer, date) to authenticated;
grant execute on function public.create_task_axis(uuid, text, text[], text, integer) to authenticated;
grant select on public.tasks, public.task_axes to authenticated;
