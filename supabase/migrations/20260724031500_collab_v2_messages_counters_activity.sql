-- Collab V2 Phase 1: unified messages, reactions, derived counters, and activity.
-- This migration deliberately leaves task/channel detail tables to their owning track.

-- Uses private.can_act_as(actor_entity_id, space_id), established by the preceding
-- task-domain migration. Every SECURITY DEFINER writer below calls it explicitly.

create table public.messages (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  anchor_id uuid not null references public.entities(id),
  root_message_id uuid references public.messages(entity_id),
  author_id uuid not null references public.entities(id),
  body text not null check (char_length(body) between 1 and 10000),
  mentions jsonb not null default '[]'::jsonb check (jsonb_typeof(mentions) = 'array'),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  client_msg_id text,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, client_msg_id)
);
create index messages_anchor_created_idx on public.messages(anchor_id, created_at, entity_id);
create index messages_root_created_idx on public.messages(root_message_id, created_at, entity_id);
create index messages_author_created_idx on public.messages(author_id, created_at desc);
create index messages_mentions_gin_idx on public.messages using gin (mentions jsonb_path_ops);

-- Every entity gets an eagerly-created counter row. Counters remain derived data and
-- can be rebuilt by the guarded RPC below.
create or replace function private.ensure_entity_counter() returns trigger
language plpgsql set search_path = public, private, pg_temp as $$
begin
  insert into public.entity_counters(entity_id) values (new.id)
  on conflict (entity_id) do nothing;
  return new;
end;
$$;
create trigger entities_ensure_counter_after_insert
after insert on public.entities
for each row execute function private.ensure_entity_counter();
insert into public.entity_counters(entity_id)
select id from public.entities
on conflict (entity_id) do nothing;

-- Enforces the message detail/envelope agreement and denormalizes the thread root.
create or replace function private.validate_message() returns trigger
language plpgsql set search_path = public, private, pg_temp as $$
declare
  message_entity public.entities;
  anchor_entity public.entities;
  author_entity public.entities;
  parent_message public.messages;
begin
  select * into message_entity from public.entities where id = new.entity_id;
  select * into anchor_entity from public.entities where id = new.anchor_id;
  select * into author_entity from public.entities where id = new.author_id;

  if message_entity.id is null or message_entity.kind <> 'message' then
    raise exception 'message detail requires a message entity';
  end if;
  if anchor_entity.id is null or anchor_entity.space_id <> message_entity.space_id then
    raise exception 'message anchor must exist in the message space';
  end if;
  if author_entity.id is null
     or author_entity.space_id <> message_entity.space_id
     or author_entity.kind not in ('member', 'team_member') then
    raise exception 'message author must be a member or team_member in the message space';
  end if;

  if tg_op = 'UPDATE' and (
    new.entity_id <> old.entity_id or new.anchor_id <> old.anchor_id
    or new.author_id <> old.author_id or new.root_message_id is distinct from old.root_message_id
    or new.client_msg_id is distinct from old.client_msg_id
  ) then
    raise exception 'message identity, anchor, author, root, and client id are immutable';
  end if;

  if message_entity.parent_id is null then
    if new.root_message_id is not null then
      raise exception 'top-level message cannot have a root_message_id';
    end if;
  else
    select * into parent_message from public.messages where entity_id = message_entity.parent_id;
    if parent_message.entity_id is null then
      raise exception 'message parent must have a message detail row';
    end if;
    if parent_message.anchor_id <> new.anchor_id then
      raise exception 'message reply must use its parent message anchor';
    end if;
    if new.root_message_id is distinct from coalesce(parent_message.root_message_id, parent_message.entity_id) then
      raise exception 'message reply root_message_id must match its thread root';
    end if;
  end if;
  return new;
end;
$$;
create trigger messages_validate_before_write
before insert or update on public.messages
for each row execute function private.validate_message();

-- Message body edits are content changes to the message itself, but messages do not
-- receive entity_versions snapshots: edited_at + the live body are their history model.
create or replace function private.touch_message_content() returns trigger
language plpgsql set search_path = public, private, pg_temp as $$
begin
  if new.body is not distinct from old.body
     and new.mentions is not distinct from old.mentions
     and new.attachments is not distinct from old.attachments then
    return new;
  end if;
  new.edited_at := now();
  new.updated_at := now();
  update public.entities
     set version = version + 1,
         activity_at = now(),
         updated_at = now()
   where id = new.entity_id;
  return new;
end;
$$;
create trigger messages_touch_content_before_update
before update of body, mentions, attachments on public.messages
for each row execute function private.touch_message_content();

-- Anchored messages advance the anchor's neighborhood signal only. They never make a
-- task/doc projection stale by changing the anchor's version.
create or replace function private.maintain_message_counter_and_activity() returns trigger
language plpgsql set search_path = public, private, pg_temp as $$
declare target_id uuid;
begin
  target_id := case when tg_op = 'DELETE' then old.anchor_id else new.anchor_id end;
  update public.entity_counters
     set messages = messages + case when tg_op = 'DELETE' then -1 else 1 end,
         updated_at = now()
   where entity_id = target_id;
  update public.entities set activity_at = now() where id = target_id and deleted_at is null;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger messages_counter_activity_after_insert
after insert on public.messages
for each row execute function private.maintain_message_counter_and_activity();
create trigger messages_counter_activity_after_delete
after delete on public.messages
for each row execute function private.maintain_message_counter_and_activity();

-- Reaction edge types are part of the typed core, not an x:* extension. Reactions are
-- intentionally authored by a human Member entity; agent personas report work via
-- messages/edges instead of silently voting for their owner.
insert into public.edge_types(type, src_kinds, dst_kinds, description, acyclic) values
  ('likes', array['member'], array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'], 'Positive reaction', false),
  ('dislikes', array['member'], array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'], 'Negative reaction', false),
  ('stars', array['member'], array['channel','task','message','member','team_member','doc','file','spell','skill','pull_request','commit'], 'Bookmark/favorite reaction', false)
on conflict (type) do nothing;

create or replace function private.maintain_reaction_counter() returns trigger
language plpgsql set search_path = public, private, pg_temp as $$
declare
  removed_type text;
  removed_target uuid;
  added_type text;
  added_target uuid;
begin
  if tg_op in ('DELETE', 'UPDATE') then
    removed_type := old.type;
    removed_target := old.dst_id;
    if removed_type in ('likes', 'dislikes', 'stars') then
      update public.entity_counters
         set likes = likes - case when removed_type = 'likes' then 1 else 0 end,
             dislikes = dislikes - case when removed_type = 'dislikes' then 1 else 0 end,
             stars = stars - case when removed_type = 'stars' then 1 else 0 end,
             updated_at = now()
       where entity_id = removed_target;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    added_type := new.type;
    added_target := new.dst_id;
    if added_type in ('likes', 'dislikes', 'stars') then
      update public.entity_counters
         set likes = likes + case when added_type = 'likes' then 1 else 0 end,
             dislikes = dislikes + case when added_type = 'dislikes' then 1 else 0 end,
             stars = stars + case when added_type = 'stars' then 1 else 0 end,
             updated_at = now()
       where entity_id = added_target;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger edges_reaction_counter_after_write
after insert or update or delete on public.edges
for each row execute function private.maintain_reaction_counter();

-- A relationship is neighborhood movement, never a content version write. Both ends
-- move because each entity's graph context changed.
create or replace function private.touch_edge_activity() returns trigger
language plpgsql set search_path = public, private, pg_temp as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.entities set activity_at = now()
     where id in (old.src_id, old.dst_id) and deleted_at is null;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.entities set activity_at = now()
     where id in (new.src_id, new.dst_id) and deleted_at is null;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger edges_activity_after_write
after insert or update or delete on public.edges
for each row execute function private.touch_edge_activity();

create or replace function private.maintain_points_counter() returns trigger
language plpgsql set search_path = public, private, pg_temp as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.entity_counters
       set points = points - old.amount, updated_at = now()
     where entity_id = old.entity_id;
    update public.entities set activity_at = now() where id = old.entity_id and deleted_at is null;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.entity_counters
       set points = points + new.amount, updated_at = now()
     where entity_id = new.entity_id;
    update public.entities set activity_at = now() where id = new.entity_id and deleted_at is null;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger point_events_counter_after_write
after insert or update or delete on public.point_events
for each row execute function private.maintain_points_counter();

-- All public write entrypoints below re-check Firebase identity, current Postgres
-- membership, and actor ownership themselves. RLS is intentionally not their only
-- guard because SECURITY DEFINER bypasses it.
create or replace function public.post_message(
  anchor_entity_id uuid,
  author_entity_id uuid,
  body_text text,
  parent_message_id uuid default null,
  mentions_value jsonb default '[]'::jsonb,
  attachments_value jsonb default '[]'::jsonb,
  client_message_id text default null
) returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  anchor_entity public.entities;
  author_entity public.entities;
  parent_entity public.entities;
  existing_id uuid;
  message_id uuid := public.uuidv7();
  thread_root_id uuid;
begin
  select * into anchor_entity from public.entities where id = anchor_entity_id and deleted_at is null;
  if anchor_entity.id is null then raise exception 'message anchor not found' using errcode = 'P0002'; end if;
  if not private.is_space_member(anchor_entity.space_id) then raise exception 'not a member of this space' using errcode = '42501'; end if;
  if not private.can_act_as(author_entity_id, anchor_entity.space_id) then raise exception 'cannot act as this author' using errcode = '42501'; end if;
  select * into author_entity from public.entities where id = author_entity_id and deleted_at is null;
  if author_entity.id is null or author_entity.space_id <> anchor_entity.space_id
     or author_entity.kind not in ('member', 'team_member') then
    raise exception 'invalid message author' using errcode = '42501';
  end if;
  if client_message_id is not null then
    select entity_id into existing_id from public.messages
     where author_id = author_entity_id and client_msg_id = client_message_id;
    if existing_id is not null then return existing_id; end if;
  end if;
  if parent_message_id is not null then
    select e.* into parent_entity
      from public.entities e join public.messages pm on pm.entity_id = e.id
     where e.id = parent_message_id and e.deleted_at is null;
    if parent_entity.id is null or parent_entity.kind <> 'message'
       or parent_entity.space_id <> anchor_entity.space_id then
      raise exception 'invalid parent message' using errcode = '23503';
    end if;
    select coalesce(root_message_id, entity_id) into thread_root_id
      from public.messages where entity_id = parent_message_id;
  end if;
  insert into public.entities(id, space_id, kind, parent_id, created_by)
  values (message_id, anchor_entity.space_id, 'message', parent_message_id, author_entity_id);
  insert into public.messages(entity_id, anchor_id, root_message_id, author_id, body, mentions, attachments, client_msg_id)
  values (message_id, anchor_entity_id, thread_root_id, author_entity_id, body_text,
          coalesce(mentions_value, '[]'::jsonb), coalesce(attachments_value, '[]'::jsonb), client_message_id);
  return message_id;
end;
$$;

create or replace function public.react(
  target_entity_id uuid,
  author_member_id uuid,
  reaction text,
  enabled boolean default true
) returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  target_entity public.entities;
  actor_entity public.entities;
  reaction_type text;
  opposite_type text;
begin
  reaction_type := case lower(reaction)
    when 'like' then 'likes' when 'likes' then 'likes'
    when 'dislike' then 'dislikes' when 'dislikes' then 'dislikes'
    when 'star' then 'stars' when 'stars' then 'stars'
    else null end;
  if reaction_type is null then raise exception 'unsupported reaction' using errcode = '22023'; end if;
  select * into target_entity from public.entities where id = target_entity_id and deleted_at is null;
  if target_entity.id is null then raise exception 'reaction target not found' using errcode = 'P0002'; end if;
  if not private.is_space_member(target_entity.space_id) then raise exception 'not a member of this space' using errcode = '42501'; end if;
  if not private.can_act_as(author_member_id, target_entity.space_id) then raise exception 'cannot act as this reaction author' using errcode = '42501'; end if;
  select * into actor_entity from public.entities where id = author_member_id and deleted_at is null;
  if actor_entity.id is null or actor_entity.kind <> 'member' or actor_entity.space_id <> target_entity.space_id then
    raise exception 'reaction author must be a member in the target space' using errcode = '42501';
  end if;
  opposite_type := case reaction_type when 'likes' then 'dislikes' when 'dislikes' then 'likes' else null end;
  if not enabled then
    delete from public.edges where src_id = author_member_id and dst_id = target_entity_id and type = reaction_type;
    return false;
  end if;
  if opposite_type is not null then
    delete from public.edges where src_id = author_member_id and dst_id = target_entity_id and type = opposite_type;
  end if;
  insert into public.edges(space_id, src_id, dst_id, type, created_by)
  values (target_entity.space_id, author_member_id, target_entity_id, reaction_type, author_member_id)
  on conflict (src_id, dst_id, type) do nothing;
  return true;
end;
$$;

create or replace function public.grant_points(
  target_entity_id uuid,
  actor_entity_id uuid,
  point_amount integer,
  point_reason text default 'grant',
  reference_id uuid default null,
  idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  target_entity public.entities;
  actor_entity public.entities;
  existing_event public.point_events;
  event_id uuid := public.uuidv7();
  inserted_event_id uuid;
begin
  if point_amount = 0 then raise exception 'point amount must be non-zero' using errcode = '22023'; end if;
  select * into target_entity from public.entities where id = target_entity_id and deleted_at is null;
  if target_entity.id is null then raise exception 'points target not found' using errcode = 'P0002'; end if;
  if not private.is_space_member(target_entity.space_id) then raise exception 'not a member of this space' using errcode = '42501'; end if;
  if not private.can_act_as(actor_entity_id, target_entity.space_id) then raise exception 'cannot act as this points actor' using errcode = '42501'; end if;
  select * into actor_entity from public.entities where id = actor_entity_id and deleted_at is null;
  if actor_entity.id is null or actor_entity.space_id <> target_entity.space_id
     or actor_entity.kind not in ('member', 'team_member') then
    raise exception 'invalid points actor' using errcode = '42501';
  end if;
  if idempotency_key is not null then
    select * into existing_event from public.point_events where client_event_id = idempotency_key;
    if existing_event.id is not null then
      if existing_event.entity_id <> target_entity_id or existing_event.actor_id <> actor_entity_id then
        raise exception 'idempotency key is already used for another point event' using errcode = '23505';
      end if;
      return existing_event.id;
    end if;
  end if;
  insert into public.point_events(id, space_id, entity_id, actor_id, amount, reason, ref_id, client_event_id)
  values (event_id, target_entity.space_id, target_entity_id, actor_entity_id, point_amount,
          point_reason, reference_id, idempotency_key)
  on conflict (client_event_id) do nothing
  returning id into inserted_event_id;
  if inserted_event_id is not null then return inserted_event_id; end if;
  -- A concurrent retry inserted the same key after the preflight read. Do not make the
  -- retry add points twice; only return it when it is the same semantic operation.
  select * into existing_event from public.point_events where client_event_id = idempotency_key;
  if existing_event.id is not null
     and existing_event.entity_id = target_entity_id
     and existing_event.actor_id = actor_entity_id then
    return existing_event.id;
  end if;
  raise exception 'idempotency key is already used for another point event' using errcode = '23505';
end;
$$;

-- Operator repair path. The underlying graph/ledger remains the source of truth.
-- Restrict this to admins even though it is a SECURITY DEFINER maintenance RPC.
create or replace function public.rebuild_entity_counters(target_space_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if not private.is_space_admin(target_space_id) then
    raise exception 'only a space admin can rebuild counters' using errcode = '42501';
  end if;
  insert into public.entity_counters(entity_id, likes, dislikes, stars, points, messages, updated_at)
  select e.id,
         coalesce(r.likes, 0), coalesce(r.dislikes, 0), coalesce(r.stars, 0),
         coalesce(p.points, 0), coalesce(m.message_count, 0), now()
    from public.entities e
    left join lateral (
      select count(*) filter (where ed.type = 'likes')::integer as likes,
             count(*) filter (where ed.type = 'dislikes')::integer as dislikes,
             count(*) filter (where ed.type = 'stars')::integer as stars
        from public.edges ed
        join public.entities src on src.id = ed.src_id and src.deleted_at is null
       where ed.dst_id = e.id and ed.type in ('likes', 'dislikes', 'stars')
    ) r on true
    left join lateral (
      select coalesce(sum(pe.amount), 0)::integer as points
        from public.point_events pe
       where pe.entity_id = e.id
    ) p on true
    left join lateral (
      select count(*)::integer as message_count
        from public.messages msg
        join public.entities message_entity on message_entity.id = msg.entity_id and message_entity.deleted_at is null
       where msg.anchor_id = e.id
    ) m on true
   where e.space_id = target_space_id and e.deleted_at is null
  on conflict (entity_id) do update
    set likes = excluded.likes,
        dislikes = excluded.dislikes,
        stars = excluded.stars,
        points = excluded.points,
        messages = excluded.messages,
        updated_at = excluded.updated_at;
end;
$$;

-- Test/operations assertion companion to rebuild_entity_counters. It deliberately
-- compares stored values with the graph/ledger truth rather than trusting a trigger.
create or replace function public.assert_entity_counters(target_space_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if not private.is_space_admin(target_space_id) then
    raise exception 'only a space admin can inspect counter integrity' using errcode = '42501';
  end if;
  if exists (
    select 1
      from public.entities e
      left join public.entity_counters stored on stored.entity_id = e.id
      left join lateral (
        select count(*) filter (where ed.type = 'likes')::integer as likes,
               count(*) filter (where ed.type = 'dislikes')::integer as dislikes,
               count(*) filter (where ed.type = 'stars')::integer as stars
          from public.edges ed
          join public.entities src on src.id = ed.src_id and src.deleted_at is null
         where ed.dst_id = e.id and ed.type in ('likes', 'dislikes', 'stars')
      ) r on true
      left join lateral (
        select coalesce(sum(pe.amount), 0)::integer as points
          from public.point_events pe
         where pe.entity_id = e.id
      ) p on true
      left join lateral (
        select count(*)::integer as message_count
          from public.messages msg
          join public.entities message_entity on message_entity.id = msg.entity_id and message_entity.deleted_at is null
         where msg.anchor_id = e.id
      ) m on true
     where e.space_id = target_space_id and e.deleted_at is null
       and (stored.entity_id is null or (stored.likes, stored.dislikes, stored.stars, stored.points, stored.messages)
           is distinct from (coalesce(r.likes, 0), coalesce(r.dislikes, 0), coalesce(r.stars, 0),
                             coalesce(p.points, 0), coalesce(m.message_count, 0)))
  ) then
    raise exception 'entity counters differ from recomputed graph truth' using errcode = '23514';
  end if;
end;
$$;

alter table public.messages enable row level security;
create policy messages_member_select on public.messages for select to authenticated
using (exists (
  select 1
  from public.entities message_entity
  join public.entities anchor_entity on anchor_entity.id = messages.anchor_id
  where message_entity.id = messages.entity_id
    and message_entity.deleted_at is null
    and message_entity.visibility = 'space'
    and anchor_entity.deleted_at is null
    and anchor_entity.visibility = 'space'
    and private.is_space_member(anchor_entity.space_id)
));

grant select on public.messages to authenticated;
revoke all on function public.post_message(uuid, uuid, text, uuid, jsonb, jsonb, text) from public;
revoke all on function public.react(uuid, uuid, text, boolean) from public;
revoke all on function public.grant_points(uuid, uuid, integer, text, uuid, text) from public;
revoke all on function public.rebuild_entity_counters(uuid) from public;
revoke all on function public.assert_entity_counters(uuid) from public;
grant execute on function public.post_message(uuid, uuid, text, uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.react(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.grant_points(uuid, uuid, integer, text, uuid, text) to authenticated;
grant execute on function public.rebuild_entity_counters(uuid) to authenticated;
grant execute on function public.assert_entity_counters(uuid) to authenticated;
revoke all on function private.ensure_entity_counter() from public;
revoke all on function private.validate_message() from public;
revoke all on function private.touch_message_content() from public;
revoke all on function private.maintain_message_counter_and_activity() from public;
revoke all on function private.maintain_reaction_counter() from public;
revoke all on function private.touch_edge_activity() from public;
revoke all on function private.maintain_points_counter() from public;
