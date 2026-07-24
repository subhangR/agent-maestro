-- Collab V2: channel hubs render attached tasks, people, and tracking entities
-- alongside documents/files/capabilities. This remains one typed relation: the
-- edge validation trigger continues to reject any source/destination outside this
-- explicit registry declaration.
update public.edge_types
set src_kinds = array[
  'task', 'member', 'team_member', 'doc', 'file', 'spell', 'skill',
  'pull_request', 'commit'
],
    dst_kinds = array[
  'channel', 'task', 'message', 'member', 'team_member', 'doc',
  'pull_request'
],
    description = 'Context attachment; channel destinations power hub tabs and pinned shelves'
where type = 'attached_to';
