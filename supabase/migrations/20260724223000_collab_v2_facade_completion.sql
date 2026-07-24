-- Collab V2 facade completion: public onboarding, graph commands, work state,
-- documents/files, inbox/read marks, and a durable event cursor.

create table public.channels (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  topic text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(space_id,name)
);

create table public.documents (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 500),
  body text not null default '',
  format text not null default 'markdown' check (format in ('markdown','mermaid','excalidraw')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.files (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 500),
  mime_type text not null check (char_length(mime_type) between 1 and 255),
  size_bytes bigint not null check (size_bytes >= 0),
  storage_path text not null check (char_length(storage_path) between 1 and 2000),
  checksum text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default public.uuidv7(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  recipient_member_id uuid not null references public.members(entity_id) on delete cascade,
  activity_id uuid references public.activity(id) on delete set null,
  target_entity_id uuid references public.entities(id) on delete set null,
  actor_id uuid references public.entities(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_cursor_idx on public.notifications(recipient_member_id, created_at desc, id desc);

create table public.tracking_refresh_requests (
  id uuid primary key default public.uuidv7(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  requested_by uuid not null references public.members(entity_id),
  entity_ids uuid[],
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  error text,
  created_at timestamptz not null default now(), completed_at timestamptz
);
create index tracking_refresh_queued_idx on public.tracking_refresh_requests(created_at) where status='queued';

create table public.workspace_events (
  id uuid primary key default public.uuidv7(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index workspace_events_space_cursor_idx on public.workspace_events(space_id, created_at asc, id asc);

alter table public.channels enable row level security;
alter table public.documents enable row level security;
alter table public.files enable row level security;
alter table public.notifications enable row level security;
alter table public.workspace_events enable row level security;
alter table public.tracking_refresh_requests enable row level security;
create policy channels_member_select on public.channels for select to authenticated using (
  exists (select 1 from public.entities e where e.id = channels.entity_id and e.visibility='space' and private.is_space_member(e.space_id))
);
create policy documents_member_select on public.documents for select to authenticated using (
  exists (select 1 from public.entities e where e.id = documents.entity_id and e.visibility = 'space' and private.is_space_member(e.space_id))
);
create policy files_member_select on public.files for select to authenticated using (
  exists (select 1 from public.entities e where e.id = files.entity_id and e.visibility = 'space' and private.is_space_member(e.space_id))
);
create policy notifications_own_select on public.notifications for select to authenticated using (
  exists (select 1 from public.members m where m.entity_id = notifications.recipient_member_id and m.firebase_uid = private.firebase_uid())
);
create policy workspace_events_member_select on public.workspace_events for select to authenticated using (private.is_space_member(space_id));
create policy tracking_refresh_member_select on public.tracking_refresh_requests for select to authenticated using (private.is_space_member(space_id));
grant select on public.channels, public.documents, public.files, public.notifications, public.workspace_events, public.tracking_refresh_requests to authenticated;

create or replace function private.capture_workspace_event() returns trigger
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare row_value jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
        event_space uuid; event_name text; entity_target uuid;
begin
  if tg_table_name='entities' then event_space:=coalesce(new.space_id,old.space_id); event_name:=case when tg_op='DELETE' or new.deleted_at is not null then 'entity.deleted' else 'entity.upsert' end;
  elsif tg_table_name='edges' then event_space:=coalesce(new.space_id,old.space_id); event_name:=case when tg_op='DELETE' then 'edge.deleted' else 'edge.upsert' end;
  elsif tg_table_name='messages' then select space_id into event_space from public.entities where id=coalesce(new.entity_id,old.entity_id); event_name:=case when tg_op='INSERT' then 'message.created' when tg_op='DELETE' then 'message.deleted' else 'message.updated' end;
  elsif tg_table_name='entity_counters' then entity_target:=coalesce(new.entity_id,old.entity_id); select space_id into event_space from public.entities where id=entity_target; event_name:='counter.changed';
  elsif tg_table_name='activity' then event_space:=new.space_id; event_name:='activity.created';
  else event_space:=new.space_id; event_name:=case when new.read_at is null then 'notification.created' else 'notification.read' end;
  end if;
  if event_space is not null then insert into public.workspace_events(space_id,event_type,payload) values(event_space,event_name,row_value); end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.capture_workspace_event() from public;
create trigger entities_workspace_event after insert or update or delete on public.entities for each row execute function private.capture_workspace_event();
create trigger edges_workspace_event after insert or update or delete on public.edges for each row execute function private.capture_workspace_event();
create trigger messages_workspace_event after insert or update or delete on public.messages for each row execute function private.capture_workspace_event();
create trigger counters_workspace_event after insert or update or delete on public.entity_counters for each row execute function private.capture_workspace_event();
create trigger activity_workspace_event after insert on public.activity for each row execute function private.capture_workspace_event();
create trigger notifications_workspace_event after insert or update of read_at on public.notifications for each row execute function private.capture_workspace_event();

create or replace function private.fan_out_activity_notification() returns trigger
language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  insert into public.notifications(space_id,recipient_member_id,activity_id,target_entity_id,actor_id,kind,payload)
  select new.space_id,m.entity_id,new.id,new.entity_id,new.actor_id,new.verb,new.summary
  from public.members m where m.space_id=new.space_id and m.entity_id is distinct from new.actor_id
    and new.verb <> 'message.created';
  return new;
end; $$;
revoke all on function private.fan_out_activity_notification() from public;
create trigger activity_notification_fanout after insert on public.activity for each row execute function private.fan_out_activity_notification();

create or replace function private.fan_out_message_notification() returns trigger
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare event_space uuid;
begin
  select space_id into event_space from public.entities where id=new.entity_id;
  insert into public.notifications(space_id,recipient_member_id,target_entity_id,actor_id,kind,payload)
  select event_space,m.entity_id,new.anchor_id,new.author_id,'message.created',
    jsonb_build_object('messageId',new.entity_id,'anchorId',new.anchor_id,'excerpt',left(new.body,280))
  from public.members m where m.space_id=event_space and m.entity_id is distinct from new.author_id;
  return new;
end; $$;
revoke all on function private.fan_out_message_notification() from public;
create trigger message_notification_fanout after insert on public.messages for each row execute function private.fan_out_message_notification();

create or replace function private.command_entity(target_id uuid) returns jsonb
language sql stable security definer set search_path = public, private, pg_temp as $$
  select to_jsonb(e) from public.entities e where e.id = target_id
$$;
revoke all on function private.command_entity(uuid) from public;

create or replace function private.command_edge(target_id uuid) returns jsonb
language sql stable security definer set search_path = public, private, pg_temp as $$
  select to_jsonb(e) from public.edges e where e.id = target_id
$$;
revoke all on function private.command_edge(uuid) from public;

create or replace function public.discover_public_spaces(p_github_repo text default null)
returns table(id uuid, name text, description text, github_repo text, visibility text,
              created_at timestamptz, updated_at timestamptz, is_member boolean)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select s.id, s.name, s.description, s.github_repo, s.visibility, s.created_at, s.updated_at,
         exists(select 1 from public.members m where m.space_id = s.id and m.firebase_uid = private.firebase_uid())
  from public.spaces s
  where private.is_valid_firebase_identity() and s.visibility = 'public'
    and (p_github_repo is null or lower(s.github_repo) = lower(p_github_repo))
  order by s.updated_at desc, s.id desc
$$;

create or replace function public.join_public_space(p_space_id uuid) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare uid text; member_id uuid; already_joined boolean := false; target public.spaces;
begin
  select firebase_uid into uid from public.current_identity();
  select * into target from public.spaces where id = p_space_id;
  if target.id is null then raise exception 'space not found' using errcode = 'P0002'; end if;
  select m.entity_id into member_id from public.members m where m.space_id = p_space_id and m.firebase_uid = uid;
  if member_id is not null then already_joined := true;
  elsif target.visibility <> 'public' then raise exception 'space is not public' using errcode = '42501';
  else
    member_id := public.uuidv7();
    insert into public.entities(id, space_id, kind, created_by) values (member_id, p_space_id, 'member', member_id);
    insert into public.members(entity_id, space_id, firebase_uid, role, display_name)
    select member_id, p_space_id, uid, 'member', up.display_name from public.user_profiles up where up.firebase_uid = uid;
    insert into public.entity_counters(entity_id) values (member_id) on conflict do nothing;
  end if;
  return jsonb_build_object('spaceId', p_space_id, 'memberId', member_id, 'joined', not already_joined);
end;
$$;

create or replace function public.current_space_identity(p_space_id uuid) returns jsonb
language sql stable security definer set search_path = public, private, pg_temp as $$
  select jsonb_build_object('firebaseUid', up.firebase_uid, 'displayName', up.display_name,
    'photoUrl', up.photo_url, 'email', up.email, 'memberId', m.entity_id, 'role', m.role)
  from public.members m join public.user_profiles up on up.firebase_uid = m.firebase_uid
  where m.space_id = p_space_id and m.firebase_uid = private.firebase_uid() and private.is_space_member(p_space_id)
$$;

-- Replace the Phase 0 bootstrap with V1-equivalent onboarding. Public is the
-- default until the UI asks otherwise, so discovery/join works out of the box.
drop function public.create_space(text,text,text);
create function public.create_space(space_name text, space_description text default '', repository text default null,
  space_visibility text default 'public') returns uuid
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare uid text; space_id uuid:=public.uuidv7(); member_id uuid:=public.uuidv7(); channel_id uuid:=public.uuidv7(); profile public.user_profiles;
begin
  if space_visibility not in ('public','private') then raise exception 'invalid space visibility' using errcode='22023'; end if;
  select * into profile from public.current_identity(); uid:=profile.firebase_uid;
  insert into public.spaces(id,name,description,github_repo,visibility,created_by)
  values(space_id,space_name,coalesce(space_description,''),repository,space_visibility,uid);
  insert into public.entities(id,space_id,kind,created_by) values(member_id,space_id,'member',member_id);
  insert into public.members(entity_id,space_id,firebase_uid,role,display_name) values(member_id,space_id,uid,'owner',profile.display_name);
  insert into public.entity_counters(entity_id) values(member_id);
  insert into public.entities(id,space_id,kind,created_by) values(channel_id,space_id,'channel',member_id);
  insert into public.channels(entity_id,space_id,name,topic) values(channel_id,space_id,'general','General collaboration');
  insert into public.entity_counters(entity_id) values(channel_id);
  insert into public.task_axes(space_id,name,axis_values,kind,position)
  values(space_id,'type',array['default','code','design','review','test'],'default',0);
  return space_id;
end; $$;
revoke all on function public.create_space(text,text,text,text) from public;
grant execute on function public.create_space(text,text,text,text) to authenticated;

create or replace function public.create_channel(p_space_id uuid,p_actor_id uuid,p_name text,p_topic text default '',p_parent_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare entity_id uuid:=public.uuidv7();
begin
  if not private.is_space_member(p_space_id) or not private.can_act_as(p_actor_id,p_space_id) then raise exception 'not permitted to create channel' using errcode='42501'; end if;
  insert into public.entities(id,space_id,kind,parent_id,created_by) values(entity_id,p_space_id,'channel',p_parent_id,p_actor_id);
  insert into public.channels(entity_id,space_id,name,topic) values(entity_id,p_space_id,lower(p_name),coalesce(p_topic,''));
  insert into public.entity_counters(entity_id) values(entity_id);
  return jsonb_build_object('entity',private.command_entity(entity_id),'patches',jsonb_build_array(private.command_entity(entity_id)));
end; $$;

-- Queue provider refreshes; a worker with provider credentials consumes this
-- table. With no ids/space, one request is queued for every caller-owned space.
create or replace function public.queue_tracking_refresh(p_entity_ids uuid[] default null,p_space_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare target_space uuid; member_id uuid; request_id uuid; request_ids jsonb:='[]'::jsonb;
begin
  if not private.is_valid_firebase_identity() then raise exception 'invalid Firebase identity' using errcode='42501'; end if;
  if coalesce(array_length(p_entity_ids,1),0)>0 then
    select min(space_id) into target_space from public.entities where id=any(p_entity_ids) and kind in ('pull_request','commit') and deleted_at is null;
    if target_space is null or exists(select 1 from public.entities where id=any(p_entity_ids) and (space_id<>target_space or kind not in ('pull_request','commit') or deleted_at is not null)) then raise exception 'invalid tracking entity set' using errcode='22023'; end if;
    p_space_id:=target_space;
  end if;
  for target_space,member_id in
    select m.space_id,m.entity_id from public.members m
    where m.firebase_uid=private.firebase_uid() and (p_space_id is null or m.space_id=p_space_id)
  loop
    insert into public.tracking_refresh_requests(space_id,requested_by,entity_ids) values(target_space,member_id,p_entity_ids) returning id into request_id;
    request_ids:=request_ids||jsonb_build_array(request_id);
  end loop;
  if jsonb_array_length(request_ids)=0 then raise exception 'no accessible tracking space' using errcode='P0002'; end if;
  return jsonb_build_object('accepted',true,'requestIds',request_ids);
end; $$;

do $$ declare target record; channel_id uuid; begin
  insert into public.task_axes(space_id,name,axis_values,kind,position)
  select s.id,'type',array['default','code','design','review','test'],'default',0 from public.spaces s
  on conflict(space_id,name) do nothing;
  for target in select s.id as space_id,m.entity_id as owner_id from public.spaces s join public.members m on m.space_id=s.id and m.role='owner'
    where not exists(select 1 from public.channels c where c.space_id=s.id and c.name='general')
  loop
    channel_id:=public.uuidv7();
    insert into public.entities(id,space_id,kind,created_by) values(channel_id,target.space_id,'channel',target.owner_id);
    insert into public.channels(entity_id,space_id,name,topic) values(channel_id,target.space_id,'general','General collaboration');
    insert into public.entity_counters(entity_id) values(channel_id);
  end loop;
end $$;

create or replace function public.write_edge(p_actor_id uuid, p_src_id uuid, p_dst_id uuid,
  p_type text, p_props jsonb default '{}'::jsonb, p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare source public.entities; target public.entities; edge_id uuid; activity_id uuid;
begin
  select * into source from public.entities where id = p_src_id and deleted_at is null;
  select * into target from public.entities where id = p_dst_id and deleted_at is null;
  if source.id is null or target.id is null then raise exception 'edge endpoint not found' using errcode = 'P0002'; end if;
  if source.space_id <> target.space_id or not private.is_space_member(source.space_id) or not private.can_act_as(p_actor_id, source.space_id) then raise exception 'not permitted to write edge' using errcode = '42501'; end if;
  insert into public.edges(space_id, src_id, dst_id, type, props, created_by)
  values(source.space_id, p_src_id, p_dst_id, p_type, coalesce(p_props,'{}'::jsonb), p_actor_id)
  on conflict(src_id,dst_id,type) do update set props=excluded.props, updated_at=now()
  returning id into edge_id;
  insert into public.activity(space_id,entity_id,actor_id,verb,ref_id,summary)
  values(source.space_id,p_src_id,p_actor_id,'edge.upserted',edge_id,jsonb_build_object('clientMutationId',p_client_mutation_id)) returning id into activity_id;
  return jsonb_build_object('edge',private.command_edge(edge_id),'activity',activity_id,'patches',jsonb_build_array(private.command_entity(p_src_id),private.command_entity(p_dst_id)));
end;
$$;

create or replace function public.update_edge(p_edge_id uuid, p_actor_id uuid, p_props jsonb,
  p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare target public.edges;
begin
  select * into target from public.edges where id=p_edge_id;
  if target.id is null then raise exception 'edge not found' using errcode='P0002'; end if;
  if not private.is_space_member(target.space_id) or not private.can_act_as(p_actor_id,target.space_id) then raise exception 'not permitted to update edge' using errcode='42501'; end if;
  update public.edges set props=coalesce(p_props,'{}'::jsonb),updated_at=now() where id=p_edge_id;
  return jsonb_build_object('edge',private.command_edge(p_edge_id),'patches',jsonb_build_array(private.command_entity(target.src_id),private.command_entity(target.dst_id)));
end;
$$;

create or replace function public.delete_edge(p_edge_id uuid, p_actor_id uuid,
  p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare target public.edges;
begin
  select * into target from public.edges where id=p_edge_id;
  if target.id is null then raise exception 'edge not found' using errcode='P0002'; end if;
  if not private.is_space_member(target.space_id) or not private.can_act_as(p_actor_id,target.space_id) then raise exception 'not permitted to delete edge' using errcode='42501'; end if;
  delete from public.edges where id=p_edge_id;
  return jsonb_build_object('patches',jsonb_build_array(private.command_entity(target.src_id),private.command_entity(target.dst_id)));
end;
$$;

create or replace function public.move_entity(p_entity_id uuid, p_actor_id uuid, p_parent_id uuid,
  p_position double precision, p_expected_version integer, p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare target public.entities; old_parent uuid;
begin
  select * into target from public.entities where id=p_entity_id and deleted_at is null for update;
  if target.id is null then raise exception 'entity not found' using errcode='P0002'; end if;
  if not private.is_space_member(target.space_id) or not private.can_act_as(p_actor_id,target.space_id) then raise exception 'not permitted to move entity' using errcode='42501'; end if;
  if target.version <> p_expected_version then raise exception 'entity version conflict' using errcode='40001'; end if;
  old_parent := target.parent_id;
  update public.entities set parent_id=p_parent_id,position=coalesce(p_position,0),version=version+1,updated_at=now(),activity_at=now() where id=p_entity_id;
  return jsonb_build_object('entity',private.command_entity(p_entity_id),'patches',jsonb_build_array(private.command_entity(p_entity_id)),
    'undo',jsonb_build_object('kind','move','entityId',p_entity_id,'parentId',old_parent,'position',target.position,'expectedVersion',target.version+1));
end;
$$;

create or replace function public.place_entity(p_actor_id uuid,p_source_id uuid,p_target_id uuid,p_intent text,
  p_embed_message text default null,p_position double precision default 0,p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare source public.entities; target public.entities; result jsonb; relation text;
begin
  select * into source from public.entities where id=p_source_id and deleted_at is null;
  select * into target from public.entities where id=p_target_id and deleted_at is null;
  if source.id is null or target.id is null then raise exception 'placement endpoint not found' using errcode='P0002'; end if;
  if p_intent in ('subtask','reparent') then
    return public.move_entity(p_source_id,p_actor_id,p_target_id,p_position,source.version,p_client_mutation_id);
  end if;
  relation := case p_intent when 'attach' then 'attached_to' when 'assign' then 'assigned_to' when 'depend' then 'depends_on' when 'embed' then 'relates_to' else null end;
  if relation is null then raise exception 'unsupported placement intent' using errcode='22023'; end if;
  result := public.write_edge(p_actor_id,p_source_id,p_target_id,relation,
    case when p_intent='embed' then jsonb_build_object('message',p_embed_message) else '{}'::jsonb end,p_client_mutation_id);
  return result || jsonb_build_object('undo',jsonb_build_object('kind','delete_edge','edgeId',result->'edge'->>'id'));
end;
$$;

create or replace function public.complete_task(p_task_id uuid,p_actor_id uuid,p_expected_version integer,
  p_completer_ids uuid[],p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare target public.entities; criterion jsonb; completer uuid;
begin
  select * into target from public.entities where id=p_task_id and kind='task' and deleted_at is null for update;
  if target.id is null then raise exception 'task not found' using errcode='P0002'; end if;
  if not private.is_space_member(target.space_id) or not private.can_act_as(p_actor_id,target.space_id) then raise exception 'not permitted to complete task' using errcode='42501'; end if;
  if target.version <> p_expected_version then raise exception 'task version conflict' using errcode='40001'; end if;
  if exists(select 1 from jsonb_array_elements((select acceptance_criteria from public.tasks where entity_id=p_task_id)) c where not coalesce((c->>'done')::boolean,false)) then raise exception 'all acceptance criteria must be complete' using errcode='23514'; end if;
  update public.tasks set work_status='done',updated_at=now() where entity_id=p_task_id;
  update public.entities set version=version+1,updated_at=now(),activity_at=now() where id=p_task_id;
  foreach completer in array coalesce(p_completer_ids,'{}'::uuid[]) loop
    if not exists(select 1 from public.entities where id=completer and space_id=target.space_id and kind in ('member','team_member') and deleted_at is null) then raise exception 'invalid completer' using errcode='23503'; end if;
    insert into public.edges(space_id,src_id,dst_id,type,created_by) values(target.space_id,p_task_id,completer,'completed_by',p_actor_id) on conflict do nothing;
    insert into public.point_events(space_id,entity_id,actor_id,amount,reason,ref_id,client_event_id)
    select target.space_id,completer,p_actor_id,t.points_estimate,'award',p_task_id,
      case when p_client_mutation_id is null then null else p_client_mutation_id||':award:'||completer::text end
    from public.tasks t where t.entity_id=p_task_id and coalesce(t.points_estimate,0)>0
    on conflict(client_event_id) do nothing;
  end loop;
  insert into public.entity_versions(entity_id,version,snapshot,changed_by) select p_task_id,version,private.task_snapshot(p_task_id),p_actor_id from public.entities where id=p_task_id;
  return jsonb_build_object('entity',private.command_entity(p_task_id),'patches',jsonb_build_array(private.command_entity(p_task_id)));
end;
$$;

create or replace function public.set_pull_state(p_entity_id uuid,p_actor_id uuid,p_local_id text,
  p_pinned_version integer,p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare target public.entities;
begin
  select * into target from public.entities where id=p_entity_id and deleted_at is null;
  if target.id is null then raise exception 'entity not found' using errcode='P0002'; end if;
  if p_pinned_version > target.version or p_pinned_version < 1 then raise exception 'invalid pinned version' using errcode='22023'; end if;
  return public.write_edge(p_actor_id,p_actor_id,p_entity_id,'pulled',jsonb_build_object('localId',p_local_id,'pinnedVersion',p_pinned_version,'pulledAt',now()),p_client_mutation_id);
end;
$$;

create or replace function public.set_work_state(p_entity_id uuid,p_actor_id uuid,p_status text,
  p_started_at timestamptz default null,p_note text default null,p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare target public.entities; result jsonb;
begin
  select * into target from public.entities where id=p_entity_id and kind='task' and deleted_at is null;
  if target.id is null then raise exception 'task not found' using errcode='P0002'; end if;
  if not private.is_space_member(target.space_id) or not private.can_act_as(p_actor_id,target.space_id) then raise exception 'not permitted to update work state' using errcode='42501'; end if;
  if p_status not in ('open','pulled','working','in_review','done','blocked','cancelled') then raise exception 'invalid work status' using errcode='22023'; end if;
  if p_status='done' then raise exception 'complete tasks through complete_task' using errcode='23514'; end if;
  if p_status in ('open','cancelled') then
    delete from public.edges where src_id=p_actor_id and dst_id=p_entity_id and type='working_on';
    result := jsonb_build_object('patches',jsonb_build_array(private.command_entity(p_entity_id)));
  else
    result := public.write_edge(p_actor_id,p_actor_id,p_entity_id,'working_on',jsonb_build_object('status',p_status,'startedAt',coalesce(p_started_at,now()),'note',p_note),p_client_mutation_id);
  end if;
  update public.tasks set work_status=p_status,updated_at=now() where entity_id=p_entity_id;
  update public.entities set activity_at=now(),updated_at=now() where id=p_entity_id;
  return result || jsonb_build_object('entity',private.command_entity(p_entity_id));
end;
$$;

create or replace function public.create_document(p_space_id uuid,p_actor_id uuid,p_title text,p_body text default '',
 p_format text default 'markdown',p_parent_id uuid default null,p_position double precision default 0,p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare entity_id uuid:=public.uuidv7();
begin
 if not private.is_space_member(p_space_id) or not private.can_act_as(p_actor_id,p_space_id) then raise exception 'not permitted to create document' using errcode='42501'; end if;
 insert into public.entities(id,space_id,kind,parent_id,position,created_by) values(entity_id,p_space_id,'doc',p_parent_id,coalesce(p_position,0),p_actor_id);
 insert into public.documents(entity_id,title,body,format) values(entity_id,p_title,coalesce(p_body,''),coalesce(p_format,'markdown'));
 insert into public.entity_counters(entity_id) values(entity_id);
 return jsonb_build_object('entity',private.command_entity(entity_id),'patches',jsonb_build_array(private.command_entity(entity_id)));
end; $$;

create or replace function public.create_file_metadata(p_space_id uuid,p_actor_id uuid,p_name text,p_mime_type text,
 p_size_bytes bigint,p_storage_path text,p_checksum text default null,p_parent_id uuid default null,p_position double precision default 0,p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare entity_id uuid:=public.uuidv7();
begin
 if not private.is_space_member(p_space_id) or not private.can_act_as(p_actor_id,p_space_id) then raise exception 'not permitted to create file metadata' using errcode='42501'; end if;
 if p_storage_path not like 'spaces/'||p_space_id::text||'/%' then raise exception 'storage path must be scoped to the space' using errcode='22023'; end if;
 insert into public.entities(id,space_id,kind,parent_id,position,created_by) values(entity_id,p_space_id,'file',p_parent_id,coalesce(p_position,0),p_actor_id);
 insert into public.files(entity_id,name,mime_type,size_bytes,storage_path,checksum) values(entity_id,p_name,p_mime_type,p_size_bytes,p_storage_path,p_checksum);
 insert into public.entity_counters(entity_id) values(entity_id);
 return jsonb_build_object('entity',private.command_entity(entity_id),'patches',jsonb_build_array(private.command_entity(entity_id)));
end; $$;

create or replace function public.update_document(p_entity_id uuid,p_actor_id uuid,p_title text,p_body text,p_format text,
 p_expected_version integer,p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare target public.entities;
begin
 select * into target from public.entities where id=p_entity_id and kind='doc' and deleted_at is null for update;
 if target.id is null then raise exception 'document not found' using errcode='P0002'; end if;
 if not private.is_space_member(target.space_id) or not private.can_act_as(p_actor_id,target.space_id) then raise exception 'not permitted to update document' using errcode='42501'; end if;
 if target.version <> p_expected_version then raise exception 'document version conflict' using errcode='40001'; end if;
 update public.documents set title=p_title,body=coalesce(p_body,''),format=p_format,updated_at=now() where entity_id=p_entity_id;
 update public.entities set version=version+1,updated_at=now(),activity_at=now() where id=p_entity_id;
 return jsonb_build_object('entity',private.command_entity(p_entity_id),'patches',jsonb_build_array(private.command_entity(p_entity_id)));
end; $$;

create or replace function public.update_file_metadata(p_entity_id uuid,p_actor_id uuid,p_name text,p_mime_type text,
 p_size_bytes bigint,p_storage_path text,p_checksum text,p_expected_version integer,p_client_mutation_id text default null) returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare target public.entities;
begin
 select * into target from public.entities where id=p_entity_id and kind='file' and deleted_at is null for update;
 if target.id is null then raise exception 'file not found' using errcode='P0002'; end if;
 if not private.is_space_member(target.space_id) or not private.can_act_as(p_actor_id,target.space_id) then raise exception 'not permitted to update file' using errcode='42501'; end if;
 if target.version <> p_expected_version then raise exception 'file version conflict' using errcode='40001'; end if;
 if p_storage_path not like 'spaces/'||target.space_id::text||'/%' then raise exception 'storage path must be scoped to the space' using errcode='22023'; end if;
 update public.files set name=p_name,mime_type=p_mime_type,size_bytes=p_size_bytes,storage_path=p_storage_path,checksum=p_checksum,updated_at=now() where entity_id=p_entity_id;
 update public.entities set version=version+1,updated_at=now(),activity_at=now() where id=p_entity_id;
 return jsonb_build_object('entity',private.command_entity(p_entity_id),'patches',jsonb_build_array(private.command_entity(p_entity_id)));
end; $$;

create or replace function public.mark_read(p_anchor_id uuid) returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare target public.entities; member_id uuid; marked_at timestamptz:=now();
begin
 select * into target from public.entities where id=p_anchor_id and deleted_at is null;
 if target.id is null or not private.is_space_member(target.space_id) then raise exception 'anchor not found' using errcode='P0002'; end if;
 select entity_id into member_id from public.members where space_id=target.space_id and firebase_uid=private.firebase_uid();
 insert into public.read_marks(member_id,anchor_id,last_read_at) values(member_id,p_anchor_id,marked_at)
 on conflict(member_id,anchor_id) do update set last_read_at=excluded.last_read_at;
 update public.notifications set read_at=coalesce(read_at,marked_at) where recipient_member_id=member_id and target_entity_id=p_anchor_id;
 return jsonb_build_object('anchorId',p_anchor_id,'lastReadAt',marked_at);
end; $$;

create or replace function public.mark_notification_read(p_notification_id uuid) returns jsonb
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare result public.notifications;
begin
 update public.notifications n set read_at=coalesce(n.read_at,now())
 where n.id=p_notification_id and exists(select 1 from public.members m where m.entity_id=n.recipient_member_id and m.firebase_uid=private.firebase_uid()) returning * into result;
 if result.id is null then raise exception 'notification not found' using errcode='P0002'; end if;
 return to_jsonb(result);
end; $$;

revoke all on function public.discover_public_spaces(text), public.join_public_space(uuid), public.current_space_identity(uuid),
 public.create_channel(uuid,uuid,text,text,uuid), public.queue_tracking_refresh(uuid[],uuid),
 public.write_edge(uuid,uuid,uuid,text,jsonb,text), public.update_edge(uuid,uuid,jsonb,text), public.delete_edge(uuid,uuid,text),
 public.move_entity(uuid,uuid,uuid,double precision,integer,text), public.place_entity(uuid,uuid,uuid,text,text,double precision,text),
 public.complete_task(uuid,uuid,integer,uuid[],text), public.set_pull_state(uuid,uuid,text,integer,text),
 public.set_work_state(uuid,uuid,text,timestamptz,text,text), public.create_document(uuid,uuid,text,text,text,uuid,double precision,text),
 public.create_file_metadata(uuid,uuid,text,text,bigint,text,text,uuid,double precision,text),
 public.update_document(uuid,uuid,text,text,text,integer,text), public.update_file_metadata(uuid,uuid,text,text,bigint,text,text,integer,text),
 public.mark_read(uuid), public.mark_notification_read(uuid) from public;
grant execute on function public.discover_public_spaces(text), public.join_public_space(uuid), public.current_space_identity(uuid),
 public.create_channel(uuid,uuid,text,text,uuid), public.queue_tracking_refresh(uuid[],uuid),
 public.write_edge(uuid,uuid,uuid,text,jsonb,text), public.update_edge(uuid,uuid,jsonb,text), public.delete_edge(uuid,uuid,text),
 public.move_entity(uuid,uuid,uuid,double precision,integer,text), public.place_entity(uuid,uuid,uuid,text,text,double precision,text),
 public.complete_task(uuid,uuid,integer,uuid[],text), public.set_pull_state(uuid,uuid,text,integer,text),
 public.set_work_state(uuid,uuid,text,timestamptz,text,text), public.create_document(uuid,uuid,text,text,text,uuid,double precision,text),
 public.create_file_metadata(uuid,uuid,text,text,bigint,text,text,uuid,double precision,text),
 public.update_document(uuid,uuid,text,text,text,integer,text), public.update_file_metadata(uuid,uuid,text,text,bigint,text,text,integer,text),
 public.mark_read(uuid), public.mark_notification_read(uuid) to authenticated;

-- Activity and graph tables are the durable Supabase Realtime publication. The
-- server maps these rows to WorkspaceEvent; RTDB remains authoritative for presence.
do $$ declare relation text; begin
  foreach relation in array array['entities','edges','activity','notifications','workspace_events'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=relation) then
      execute format('alter publication supabase_realtime add table public.%I', relation);
    end if;
  end loop;
end $$;
