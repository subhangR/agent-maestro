# Collab V2 server façade

`maestro-server` exposes the deployed Supabase graph through `/api/collab/v2`.
It is a façade over PostgREST and the database's security-definer RPCs, not a
second source of truth and not a privileged admin proxy.

## Configuration and identity

Set these server environment variables locally (never commit credentials):

- `MAESTRO_SUPABASE_URL`
- `MAESTRO_SUPABASE_PUBLISHABLE_KEY`

Every Collab request supplies the current Firebase ID token as
`X-Collab-Firebase-Token`. The server forwards that token and the publishable
key to Supabase. It does not accept or use a service-role key, so Supabase
Firebase Third-Party Auth and RLS continue to authorize every read and write.
The header is deliberately separate from Maestro's optional local web-password
cookie.

`GET /api/collab/v2/health` returns the configuration state without secrets.
When configuration is absent, other Collab calls fail without making an
outbound request.

## MVP surface backed by deployed RPCs

- Identity and spaces: `GET /identity`, `GET/POST /spaces`
- Entity reads: `GET /spaces/:spaceId/entities`,
  `GET /entities/:entityId`, `GET /spaces/:spaceId/activity`
- Normalized list projection: `POST /collections/query`; its result uses the
  `CollectionResult`/`EntitySummary` names in
  [the UI data contract](COLLAB_V2_UI_DATA_CONTRACT.md).
- Tasks: `GET/POST /spaces/:spaceId/task-axes`,
  `POST /spaces/:spaceId/tasks`, `PATCH /tasks/:taskId`
- Collaboration: `POST /entities/:entityId/messages`,
  `POST /entities/:entityId/reactions`, `POST /entities/:entityId/points`

Incoming command payloads are Zod-validated. The task update façade first
loads current task content and merges partial input because the deployed
`update_task_content` RPC intentionally requires a complete task snapshot.

## Explicitly deferred

The façade does not pretend that database support exists for generic entity
creation, edge CRUD, moves, completion, pulls/work state, read marks/inbox,
search, saved views, or a server realtime mapper. These remain feature-gated
as described in the UI data contract. They require audited RPCs/migrations,
not raw table writes from a client.

The accompanying migration
`20260724190000_collab_v2_channel_attachment_sources.sql` expands the typed
`attached_to` registry for channel hubs (tasks, members, agents, PRs, and
commits), while retaining trigger-based type validation.
