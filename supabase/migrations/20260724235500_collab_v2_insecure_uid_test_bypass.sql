-- TEMPORARY TEST MODE.
--
-- This lets the local Collab V2 facade identify a caller with the Firebase UID
-- supplied in X-Collab-Firebase-Uid. It deliberately does not authenticate that
-- value. Disable it after Supabase accepts Firebase third-party JWTs:
--   update private.collab_runtime_flags set enabled = false
--   where key = 'insecure_uid_bypass';

create table if not exists private.collab_runtime_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.collab_runtime_flags(key, enabled)
values ('insecure_uid_bypass', true)
on conflict (key) do update set enabled = excluded.enabled, updated_at = now();

revoke all on private.collab_runtime_flags from public, anon, authenticated;

create or replace function private.insecure_uid_bypass_enabled()
returns boolean language sql stable security definer
set search_path = private, pg_temp as $$
  select coalesce((
    select enabled from private.collab_runtime_flags where key = 'insecure_uid_bypass'
  ), false)
$$;

create or replace function private.firebase_uid()
returns text language sql stable as $$
  select coalesce(
    nullif(auth.jwt() ->> 'sub', ''),
    case when private.insecure_uid_bypass_enabled() then
      nullif(
        coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb
          ->> 'x-collab-firebase-uid',
        ''
      )
    end
  )
$$;

create or replace function private.is_valid_firebase_identity()
returns boolean language sql stable as $$
  select (
    (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/maestro-5f3fc'
    and (auth.jwt() ->> 'aud') = 'maestro-5f3fc'
    and coalesce(auth.jwt() -> 'firebase' ->> 'sign_in_provider', '') <> 'anonymous'
    and private.firebase_uid() is not null
  ) or (
    private.insecure_uid_bypass_enabled()
    and private.firebase_uid() ~ '^[A-Za-z0-9:_-]{1,128}$'
  )
$$;

grant usage on schema private to anon;
grant execute on function private.insecure_uid_bypass_enabled(), private.firebase_uid(), private.is_valid_firebase_identity(),
  private.is_space_member(uuid), private.is_space_admin(uuid) to anon;

-- Existing read policies remain identical; anon is added only so an apikey-only
-- PostgREST request can reach the same Firebase-UID membership checks.
do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'user_profiles','edge_types','spaces','entities','members','team_members',
        'edges','entity_counters','entity_versions','point_events','activity',
        'read_marks','tasks','task_axes','messages','channels','documents','files',
        'notifications','workspace_events','tracking_refresh_requests'
      ])
      and 'authenticated' = any(roles)
  loop
    execute format('alter policy %I on %I.%I to authenticated, anon',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

grant select on public.user_profiles, public.spaces, public.entities, public.members,
  public.team_members, public.edge_types, public.edges, public.entity_counters,
  public.entity_versions, public.point_events, public.activity, public.read_marks,
  public.tasks, public.task_axes, public.messages, public.channels, public.documents,
  public.files, public.notifications, public.workspace_events,
  public.tracking_refresh_requests to anon;

-- Mirror only the Collab facade RPCs already granted to authenticated.
do $$
declare function_row record;
begin
  for function_row in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'current_identity','current_space_identity','discover_public_spaces',
        'join_public_space','create_space','create_task','update_task_content',
        'create_task_axis','post_message','react','grant_points','write_edge',
        'update_edge','delete_edge','place_entity','move_entity','complete_task',
        'set_pull_state','set_work_state','create_document','create_file_metadata',
        'create_channel','queue_tracking_refresh','update_document',
        'update_file_metadata','mark_read','mark_notification_read'
      ])
  loop
    execute format('grant execute on function %s to anon', function_row.signature);
  end loop;
end $$;
