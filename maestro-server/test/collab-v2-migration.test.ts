import fs from 'fs';
import path from 'path';

describe('Collab V2 facade completion migration', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260724223000_collab_v2_facade_completion.sql'), 'utf8');

  it.each(['discover_public_spaces','join_public_space','current_space_identity','create_channel','queue_tracking_refresh','write_edge','move_entity','place_entity','complete_task','set_pull_state','set_work_state','create_document','create_file_metadata','mark_read','mark_notification_read'])(
    'defines and grants the %s RPC', (name) => {
      expect(sql).toContain(`function public.${name}`);
      expect(sql).toMatch(new RegExp(`grant execute[\\s\\S]*public\\.${name}\\(`));
    },
  );

  it('persists all non-presence realtime event categories behind RLS', () => {
    expect(sql).toContain('create table public.workspace_events');
    expect(sql).toContain('workspace_events_member_select');
    for (const type of ['entity.upsert','edge.upsert','message.created','counter.changed','activity.created','notification.created']) expect(sql).toContain(`'${type}'`);
  });

  it('keeps file paths inside their owning space prefix', () => {
    expect(sql).toContain("p_storage_path not like 'spaces/'||p_space_id::text||'/%'");
    expect(sql).toContain("p_storage_path not like 'spaces/'||target.space_id::text||'/%'");
  });

  it('bootstraps general, the default type axis, and public discovery visibility', () => {
    expect(sql).toContain("values(channel_id,space_id,'general','General collaboration')");
    expect(sql).toContain("array['default','code','design','review','test'],'default',0");
    expect(sql).toContain("space_visibility text default 'public'");
  });

  it('authorizes every work-state branch and reserves done for complete_task', () => {
    const body = sql.slice(sql.indexOf('function public.set_work_state'), sql.indexOf('function public.create_document'));
    expect(body.indexOf('private.is_space_member')).toBeGreaterThan(0);
    expect(body.indexOf('private.is_space_member')).toBeLessThan(body.indexOf("if p_status in ('open','cancelled')"));
    expect(body).toContain("if p_status='done' then raise exception 'complete tasks through complete_task'");
  });

  it('does not fan out duplicate message activity notifications', () => {
    expect(sql).toContain("new.verb <> 'message.created'");
    expect(sql).toContain('create trigger message_notification_fanout');
  });
});
