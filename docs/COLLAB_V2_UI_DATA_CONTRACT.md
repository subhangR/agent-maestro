# Collab V2 workspace UI data contract

**Status:** proposed public UI/server contract, derived from the Modular Collab
Workspace prototype and the V2 entity-graph design.  This is an adapter contract;
it deliberately does not expose Postgres table rows to UI components.

**Audience:** Collab V2 UI, `maestro-server`, CLI projection, and the Supabase data
adapter.  UUIDs are opaque strings and all timestamps are ISO-8601 UTC strings.

## 1. Contract rules

- The UI reads one consistent shape, `EntitySummary` for Z1/Z2 and `EntityDetail` for
  Z3/Z4.  A page must not compose its own joins from `entities`, kind tables, edges,
  counters, and actors.
- `actorId`, `createdBy`, author, assignee, and completer are always entity IDs.  They
  can identify either a human `member` or an agent `team_member`; `ActorSummary.kind`
  preserves that provenance.
- All list endpoints use cursor pagination and return a stable `nextCursor`, even
  where the first UI release renders only a small collection.  Lists must exclude soft
  deleted entities by default; retained historical references are represented as a
  tombstone summary.
- Intrinsic edits use an expected `version` when they can conflict.  Link/message/
  reaction/point commands are idempotent using `clientMutationId`.  Failed optimistic
  commands return a typed error and the latest affected summaries.
- Reads are scoped by the authenticated Firebase user and RLS.  Command inputs may
  name an `actorId`, but the backend must prove that the signed-in user may act as that
  member or its owned team-member persona.
- HTTP route notation below is a stable server façade recommendation.  Direct
  Supabase implementations may use RPCs internally, but must return the same DTOs.

## 2. Shared TypeScript DTOs

```ts
type EntityId = string;
type SpaceId = string;
type Cursor = string;
type EntityKind =
  | 'channel' | 'task' | 'message' | 'member' | 'team_member'
  | 'doc' | 'file' | 'spell' | 'skill' | 'pull_request' | 'commit';
type WorkStatus = 'open' | 'pulled' | 'working' | 'in_review'
  | 'done' | 'blocked' | 'cancelled';
type Visibility = 'space' | 'restricted';

interface ActorSummary {
  id: EntityId;
  kind: 'member' | 'team_member';
  displayName: string;
  avatar?: string | null;
  role?: string | null;
  ownerMemberId?: EntityId;       // present for a team_member
  isAgent: boolean;
}

interface EntityCounters {
  likes: number;
  dislikes: number;
  stars: number;
  points: number;
  messages: number;
  viewerReaction?: 'like' | 'dislike' | 'star' | null;
}

interface EntitySummary {
  id: EntityId;
  spaceId: SpaceId;
  kind: EntityKind;
  title: string;                  // kind-specific display title, never an ID
  excerpt?: string;
  parentId: EntityId | null;
  position: number;
  visibility: Visibility;
  version: number;
  activityAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: ActorSummary;
  counters: EntityCounters;
  state: EntityState;             // discriminator-specific Z1/Z2 fields
  badges: EntityBadges;
}

type EntityState =
  | { kind: 'task'; workStatus: WorkStatus; priority: 'low'|'medium'|'high'|'urgent';
      axes: Record<string, string>; dueDate?: string | null; assignees: ActorSummary[];
      acceptance: { total: number; completed: number } }
  | { kind: 'channel'; topic: string; unreadCount: number; workingAgentCount: number }
  | { kind: 'doc'; format: 'markdown'|'mermaid'|'excalidraw'; childCount: number }
  | { kind: 'message'; anchorId: EntityId; rootMessageId: EntityId | null; author: ActorSummary;
      editedAt?: string | null }
  | { kind: 'member'; role: 'owner'|'admin'|'member'; score: number; taskDoneCount: number }
  | { kind: 'team_member'; owner: ActorSummary; model?: string | null; agentTool?: string | null;
      liveWork?: LiveWork | null }
  | { kind: 'pull_request'; repository: string; number: number; state: string;
      url?: string; fetchedAt?: string | null; stale: boolean }
  | { kind: 'commit'; repository: string; sha: string; message: string; committedAt?: string | null }
  | { kind: 'file'; name: string; mimeType: string; sizeBytes: number }
  | { kind: 'spell' | 'skill'; description?: string; equipped: boolean };

interface EntityBadges {
  blocked?: { unresolvedHardDependencyCount: number; waitingOn: EntitySummary[] };
  pulls?: PullState[];
  workingActors?: LiveWork[];
  restricted?: boolean;
}
interface PullState {
  actor: ActorSummary;
  localId?: string | null;
  pinnedVersion: number;
  contentStale: boolean;          // pinnedVersion < entity.version
  discussionMoved: boolean;       // activity changed after the pull
  workStatus?: string | null;
  pulledAt: string;
}
interface LiveWork { actor: ActorSummary; task: EntitySummary; startedAt: string; note?: string | null }

interface EntityDetail extends EntitySummary {
  content: EntityContent;
  hierarchy: Hierarchy;
  connections: Connections;
  capabilities: EntityCapabilities;
}
type EntityContent =
  | { kind: 'task'; description: string; acceptanceCriteria: AcceptanceCriterion[];
      pointsEstimate?: number | null }
  | { kind: 'channel'; topic: string; pinned: EntitySummary[]; autoTabs: ChannelTab[] }
  | { kind: 'doc'; body: string; format: 'markdown'|'mermaid'|'excalidraw' }
  | { kind: 'message'; body: string; mentions: Mention[]; attachments: FileAttachment[] }
  | { kind: 'member'; teamMembers: EntitySummary[]; work: EntitySummary[] }
  | { kind: 'team_member'; identity: string; memories: unknown[]; capabilities: Record<string, unknown>;
      commandPermissions: Record<string, unknown>; equipped: EntitySummary[]; work: EntitySummary[] }
  | { kind: 'pull_request' | 'commit' | 'file' | 'spell' | 'skill'; [key: string]: unknown };
interface AcceptanceCriterion { id: string; text: string; done: boolean; doneBy?: EntityId; doneAt?: string }
interface Mention { entityId: EntityId; kind: 'member'|'team_member'; display: string }
interface FileAttachment { fileEntityId: EntityId; name: string; mime: string }
interface Hierarchy { parent: EntitySummary | null; children: Page<EntitySummary>; path: EntitySummary[] }
interface Connections {
  outgoing: EdgeGroup[];
  incoming: EdgeGroup[];
  unresolvedHardDependencyCount: number;
}
interface EdgeGroup { type: string; direction: 'outgoing'|'incoming'; label: string; edges: EdgeView[]; nextCursor?: Cursor }
interface EdgeView { id: string; type: string; source: EntitySummary; target: EntitySummary; props: Record<string, unknown>;
  createdBy: ActorSummary; createdAt: string; resolved?: boolean; hard?: boolean }
interface EntityCapabilities { canEdit: boolean; canDelete: boolean; canAddChild: boolean; canLink: boolean;
  canPull: boolean; canReact: boolean; canGrantPoints: boolean; canComplete: boolean }
interface Page<T> { items: T[]; nextCursor: Cursor | null; total?: number }
interface ChannelTab { key: 'feed'|'tasks'|'docs'|'team'|'prs'|string; label: string; count: number;
  query: CollectionQuery }
```

### Collection and graph DTOs

```ts
interface CollectionQuery {
  spaceId: SpaceId;
  kinds?: EntityKind[];
  subtreeOf?: EntityId;
  parentId?: EntityId | null;
  filters?: {
    workStatus?: WorkStatus[]; axes?: Record<string, string[]>; assigneeIds?: EntityId[];
    edge?: { type: string; direction: 'incoming'|'outgoing'; entityId: EntityId };
    readyToPull?: boolean; inReviewForActorId?: EntityId; mentionedActorId?: EntityId;
    deleted?: 'exclude'|'only'|'include';
  };
  layout?: 'list'|'board'|'tree'|'feed'|'gallery'|'graph';
  groupBy?: 'workStatus'|'assignee'|`axis:${string}`;
  sort?: 'activityAt_desc'|'createdAt_desc'|'position'|'dueDate'|'priority';
  cursor?: Cursor; limit?: number;
}
interface CollectionResult { query: CollectionQuery; page: Page<EntitySummary>; groups?: CollectionGroup[] }
interface CollectionGroup { key: string; label: string; items: EntitySummary[]; nextCursor?: Cursor }
interface GraphQuery extends CollectionQuery { focusId?: EntityId; hops?: number; edgeTypes?: string[]; mode?: 'free'|'dependency' }
interface GraphResult { nodes: EntitySummary[]; edges: EdgeView[]; clusters: { parentId: EntityId; childIds: EntityId[] }[];
  layout?: Record<EntityId, { x: number; y: number }> }
```

## 3. Read API, by UI surface

`GET` routes return `{ data, requestId }`; collection routes additionally return
`nextCursor`.  Equivalent RPCs are fine behind the façade.  The initial server
implementation mounts this contract at **`/api/collab/v2`** and authenticates its
Supabase/RLS bridge with **`X-Collab-Firebase-Token`** (not the local server password
credential).  Route paths in the matrix omit that prefix.

| Screen / component | Required query and result | Refresh / pagination |
|---|---|---|
| Space switcher + left rail | `GET /v2/spaces` → `SpaceSummary[]`; `GET /v2/spaces/:spaceId/navigation` → current member, unread total, channel tree with `EntitySummary` rows and child counts | Subscribe to channel/entity/read-mark updates; tree is paged per expanded parent at scale. |
| Home — My Work | `POST /v2/collections/query` with three server-defined `home` presets (`readyToPull`, `inFlight`, `needsMe`) → three `CollectionResult`s plus compact activity page | Realtime entity/edge/message events; each column cursor loads independently. |
| Inbox | `GET /v2/inbox?cursor=` → notification rows with target `EntitySummary`, actor, kind, read state and timestamp | Mark-read command; cross-space subscription or polling. |
| Channel hub | `GET /v2/entities/:id` → `EntityDetail` (header, shelf, calculated `autoTabs`); selected auto-tab calls collection query from `ChannelTab.query`; Feed calls thread query below | Feed newest/older cursors and presence/typing; live embeds receive summary patches. |
| Tasks | `GET /v2/spaces/:spaceId/task-axes`; `POST /v2/collections/query` with task filters/grouping/layout. Tree mode requires `parentId`/`subtreeOf`; board accepts any `groupBy` axis | Entity/edge updates move cards; child pages load on expansion. |
| Docs | doc `CollectionQuery` for tree/gallery; `GET /v2/entities/:id` for reader/editor; `GET /v2/entities/:id/versions?cursor=` for history | Detail/version events; margin discussion is the common thread anchored to doc. |
| Team | collection query for `member` + `team_member`; member/TM `EntityDetail` for profile, hierarchy, equipped items, and work query | Presence and working-on updates. |
| Tracking | collection query for `pull_request,commit` with `tracks` edge projection; each returned item includes linked task summaries and fetch freshness | Tracking entity updates following refresh/webhook. |
| Graph canvas | `POST /v2/graph/query` → `GraphResult`, accepting kind/type filters, focus hops, and dependency mode | Entity/edge patches; persisted layout is returned/stored per saved view. |
| Leaderboard | `GET /v2/spaces/:spaceId/leaderboard?cursor=` → score rows (actor, score, rank) plus `GET /v2/spaces/:spaceId/awards?cursor=` → point events with task/completer | Point/complete events update scores and awards. |
| Space settings | `GET /v2/spaces/:spaceId/settings` → space profile, members/roles, invite summaries, task axes | Settings commands require admin capability. |
| Z1/Z2 hover, Z3 panel, Z4 route | `GET /v2/entities/:id?include=detail` → `EntityDetail`; sections can be lazy: `/hierarchy`, `/connections`, `/activity`, `/versions` | Panel receives entity-scoped event patches and presence. |
| Command palette | `GET /v2/search?q=&spaceId=&kinds=&cursor=` → `EntitySummary[]`; `GET /v2/actions?contextEntityId=` returns allowed commands and schemas | Search is planned; until shipped, command navigation uses supplied recent/known entities. |

### Thread, activity, and presence reads

```ts
GET /v2/entities/:anchorId/messages?cursor=&order=asc|desc&rootId=
// Page<MessageView>; each root includes paged child replies, or replies load with rootId.
interface MessageView extends EntitySummary {
  state: Extract<EntityState, { kind: 'message' }>;
  content: Extract<EntityContent, { kind: 'message' }>;
  replyCount: number; replies?: Page<MessageView>; pending?: boolean;
}

GET /v2/entities/:id/activity?cursor=  // Page<ActivityItem>
GET /v2/entities/:id/presence           // PresenceSnapshot (ephemeral Firebase RTDB data)
interface ActivityItem { id: string; entityId?: EntityId | null; actor?: ActorSummary | null;
  verb: string; summary: Record<string, unknown>; createdAt: string; refId?: string | null }
interface PresenceSnapshot { viewers: ActorSummary[]; typingActorIds: EntityId[]; updatedAt: string }
```

## 4. Commands / mutation contract

All requests take `{ actorId, clientMutationId }` unless the actor is implicit from the
current member.  Responses are `CommandResult`: `{ entity?, edge?, activity?, patches:
EntitySummary[], undo?: UndoToken }`.  Validation failures use `400 invalid_input`,
permission failures `403 forbidden`, missing/tombstoned entity `404 not_found`, and
stale version `409 version_conflict` with `current: EntityDetail`.

| UI action | Public command | Required input / semantic result | Current Supabase support |
|---|---|---|---|
| Create task / child / promote message | `POST /v2/tasks` | `spaceId,title,description,axes,parentId?,position?,priority,acceptanceCriteria,pointsEstimate?,dueDate?,attachTo?`; creates task and optional `attached_to` or `relates_to` edge atomically | `create_task` exists; attach/promote is a façade addition. |
| Edit task / status / criteria | `PATCH /v2/tasks/:id` | Intrinsic fields plus `expectedVersion`; returns bumped detail. UI may send a whole criteria array. | `update_task_content` exists; dedicated status/complete flow still needed. |
| Create/update another kind | `POST/PATCH /v2/entities` | Discriminated `kind` plus typed `content`; same version rule | Planned beyond task/message. |
| Reparent / reorder | `POST /v2/entities/:id/move` | `parentId` (same kind or null), `position`, expected version; returns affected old/new parent summaries | Planned RPC; database validates same-kind, space, and cycles. |
| Add/remove/update link | `POST /v2/edges`, `DELETE /v2/edges/:id`, `PATCH /v2/edges/:id` | `srcId,dstId,type,props`; no reverse duplicate. `depends_on.props={hard:boolean,note?}`, channel pin uses `attached_to.props={pinned:true}`. | Typed edge table exists; audited write façade needed. |
| Drag/drop | `POST /v2/placements` | `{sourceId,targetId,intent:'attach'|'assign'|'depend'|'subtask'|'embed'|'reparent', embedMessage?}`; resolves to edge/move/message atomically and yields undo token | Planned façade; never infer intent silently. |
| Post/reply/edit/delete message | `POST /v2/messages`; `PATCH/DELETE /v2/messages/:id` | anchor, body, parentMessageId?, mentions, attachments, clientMutationId. Editing bumps message version; deletion returns tombstone | `post_message` exists; edit/delete planned. |
| React | `PUT /v2/entities/:id/reaction` | `{reaction:'like'|'dislike'|'star', enabled}`; like/dislike are mutually exclusive, star independent | `react` exists. |
| Grant points | `POST /v2/entities/:id/points` | `{amount,reason:'grant'|'award'|'seed',referenceId?}`; ledger append, idempotent | `grant_points` exists. |
| Complete task | `POST /v2/tasks/:id/complete` | `{expectedVersion, completerIds}`; checks criteria/permission, sets done, creates `completed_by` edges and award ledger events in one transaction | Planned dedicated RPC (do not emulate from UI). |
| Pull/re-pull / work status | `POST /v2/entities/:id/pulls`, `POST /v2/entities/:id/work` | pull `{localId,pinnedVersion}`; work `{status,startedAt?,note?}`; result includes refreshed `PullState` | Planned façade; pull edge shape already designed. |
| Refresh PR(s) | `POST /v2/tracking/refresh` | `{entityIds?: EntityId[]}` queues/fetches provider data; returns accepted status and later patches | Planned; no UI-side provider call. |
| Task-axis admin | `POST/PATCH/DELETE /v2/spaces/:id/task-axes` | definition `{name,axisValues,kind,position}` | `create_task_axis` exists; update/delete pending. |
| Read / notifications | `PUT /v2/read-marks/:anchorId`, `PUT /v2/inbox/:id/read` | last read time (server timestamp) | Read-mark table exists; public RPC/façade pending. |
| Saved collection/graph views | `POST/PATCH/DELETE /v2/saved-views` | name, share mode, `CollectionQuery`, optional graph layout | Planned; do not put UI layout in entity content. |

### Channel attachment registry reconciliation

The UI brief calls for a channel hub whose Tasks, Docs, Team, and PR tabs are generated
from `attached_to` edges, and its drag grammar allows a task, member/team-member, or PR
to be dropped onto a channel.  The original entity-graph draft describes
`attached_to` more narrowly (`doc|file|spell|skill → any`).  The public contract adopts
the UI behavior: **the registry allows every hub-displayable entity kind**
(`task`, `doc`, `file`, `spell`, `skill`, `member`, `team_member`, `pull_request`, and
`commit`) **as an `attached_to` source with `channel` as a destination**.  The same
edge, with `props.pinned: true`, powers the channel shelf.  This registry expansion is
now supplied by the backend migration; UI components use the `ChannelTab`/shelf
projection and never rely on the storage representation directly.

## 5. Realtime event contract

Durable graph data comes from Supabase Realtime or the server stream. Presence and
typing come only from Firebase RTDB.  The client subscribes by `spaceId`, plus focused
entity/anchor IDs; it must de-duplicate events by `eventId` and reconcile optimistic
`clientMutationId`s.

```ts
type WorkspaceEvent =
 | { type: 'entity.upsert'|'entity.deleted'; eventId: string; entity: EntitySummary; clientMutationId?: string }
 | { type: 'edge.upsert'|'edge.deleted'; eventId: string; edge: EdgeView; clientMutationId?: string }
 | { type: 'message.created'|'message.updated'|'message.deleted'; eventId: string; anchorId: EntityId; message: MessageView }
 | { type: 'counter.changed'; eventId: string; entityId: EntityId; counters: EntityCounters }
 | { type: 'activity.created'; eventId: string; activity: ActivityItem }
 | { type: 'notification.created'|'notification.read'; eventId: string; notification: NotificationItem }
 | { type: 'presence.changed'; eventId: string; entityId: EntityId; presence: PresenceSnapshot }
 | { type: 'typing.changed'; eventId: string; anchorId: EntityId; typingActorIds: EntityId[] };
```

The client treats an entity delete as a tombstone in existing thread/edge history, and
removes it from ordinary collection queries.  `entity.upsert` changes collection
membership, board columns, staleness and blocked badges without waiting for a refresh.

## 6. Cross-screen derived fields the backend owns

These must be server-calculated, not reimplemented differently by each page:

- `blocked` / unresolved dependencies: evaluate incoming/outgoing `depends_on` with
  `props.hard`; include per-edge `resolved` and a task-level roll-up.
- `PullState`: compare each pull edge's `pinnedVersion` with the target content
  version, and compare its pull timestamp/version snapshot with later activity.
- Channel auto-tabs and shelf: query `attached_to` relations in either permitted
  direction and emit only non-empty kind tabs.  The pin lives in edge props.
- Task assignees, tracking task chips, equipped items, and working-agent count are edge
  projections, not duplicated task/channel columns.
- Reactions and point totals use `entity_counters`; a caller's reaction is derived from
  its own reaction edge.  Leaderboard scores and recent awards use ledger sums/events.
- `EntitySummary.title`, excerpts, actor cards, status labels, and deleted tombstones
  are normalized by the adapter so a single card/chip renderer works across kinds.

## 7. Availability boundary (as of 2026-07-24)

The deployed Phase 0/1 database already provides Firebase-authenticated RLS reads plus
the task envelope/detail, message posting, reaction toggle, point grants, counters,
activity, task-axis creation, and the SQL RPCs `create_task`, `update_task_content`,
`create_task_axis`, `post_message`, `react`, and `grant_points`.  `maestro-server`
now token-forwards to that RLS surface and exposes the currently supported subset at
`/api/collab/v2`: `identity`, `spaces`, space `entities`, `activity`, and `task-axes`,
entity detail (entity + children + edges + thread + activity), task create/update,
axis creation, message post, reactions, point grants, and `POST /collections/query`
returning `{ data: CollectionResult, requestId }`.  The remaining MVP routes retain
direct deployed-RPC shapes where a normalized command would require a not-yet-deployed
database RPC.

The public server façade still needs to add normalized detail/collection projections,
generic edge writes and entity moves, task completion/pull/workflow commands,
docs/files/tracking projections, notification/read-mark endpoints, search, saved views,
and a unified realtime event mapper.  UI code should feature-gate those commands and
continue to consume the DTOs above rather than bypassing the façade with raw tables.
