# 02 — API Architecture: Layering and the Core Resource Grammar

**Part of:** `docs/collab-v2-api-design/` — see `00-OVERVIEW.md`.
**Answers:** how the API is layered, and what the one noun grammar is that every operation follows.

---

## 1. The problem this solves

The branch implementation grew route-by-route: task routes here, message routes there, RPC shapes leaking through where a normalized command wasn't built yet. The UI contract (§1 of `COLLAB_V2_UI_DATA_CONTRACT.md`) already demands the opposite — "the UI reads one consistent shape" — but no doc says how the layers produce that shape, or what the full operation catalog is. This doc fixes the structure; `03` projects it per consumer; `05` proves coverage.

## 2. Layering (D1)

```
┌────────────────────────────────────────────────────────────────────┐
│  TRANSPORT FACADES — projections, no business logic                │
│   HTTP facade  /api/collab/v2/*   (maestro-server, Express+Zod)    │
│   CLI          maestro collab …   (HTTP client of the facade)      │
│   MCP server   collab_* tools     (future; same operation catalog) │
├────────────────────────────────────────────────────────────────────┤
│  SERVICE LAYER — the operation catalog (CollabV2Service)           │
│   • one TypeScript interface: every operation, DTO, event, error   │
│   • assembles EntitySummary/EntityDetail (server-owned derived     │
│     fields: badges, PullState, autoTabs, capabilities)             │
│   • idempotency bookkeeping, cursor encode/decode, event mapping   │
│   • NO authorization decisions (delegated down), NO SQL            │
├────────────────────────────────────────────────────────────────────┤
│  DATA LAYER — Postgres via the caller's identity                   │
│   • PostgREST reads (RLS-guarded) for simple selects               │
│   • security-definer RPCs for compound/invariant-bearing writes    │
│   • triggers own counters, activity, versions, validation          │
└────────────────────────────────────────────────────────────────────┘
```

Rules that make this real, not aspirational:

- **L1. The service layer is the contract.** `CollabV2Service` (an interface + DTO module, `@maestro/collab-v2-contract` conceptually) is the single definition of operations, inputs, outputs, events, and errors. The HTTP facade is a mechanical binding (route ↔ operation); the CLI calls the HTTP facade; the MCP server binds tools to the same operations. Adding an operation means touching the contract once and each binding mechanically.
- **L2. Authorization never lives in the middle.** The service layer always executes as the calling user: maestro-server mints a short-lived Postgres JWT carrying the resolved identity id (it holds the signing key, **not** a service-role key — `04 §6`), so RLS/RPC guards remain the enforcement. It may *pre-check* for better error messages, but never authorizes. This keeps maestro-server the single boundary without becoming a privileged proxy.
- **L3. Derived truth is computed in exactly one place.** Blocked rollups, staleness, auto-tabs, titles, capabilities: computed by the service layer (or by SQL views it calls), never by a transport or a client. (UI contract §6 already mandates this; here it becomes an ownership rule.)
- **L4. Transports add nothing semantic.** A transport may batch, stream, or paginate presentation, but may not invent fields, defaults, or error kinds.
- **L5. Deployment-agnostic.** Local: maestro-server hosts the service layer, talking to hosted Supabase. Cloud: the same service layer hosted behind maestro-gateway or an edge function. Nothing above the data layer names Supabase (D6 of `00`).

### 2.1 Why keep maestro-server in the path at all?

Clients never talk to Supabase directly — they hold no Supabase key and no Firebase/Supabase token (`04 §6`, user decision). maestro-server is the sole boundary because:

- the derived-field assembly (L3) needs a place that isn't N clients;
- agents/CLI need an HTTP surface anyway (no Supabase SDK in every consumer);
- the canonical event contract needs one mapper (see `04 §2`);
- swapping Supabase hosted → self-hosted Postgres later touches one layer.

Direct Supabase access from clients is therefore **not part of the contract** (the UI's current direct `postgres_changes` subscription is a deviation resolved in `04 §2`).

## 3. The resource grammar (D2)

One noun set, derived from the data model's shapes:

| Noun | What it is | Backing |
|---|---|---|
| `spaces` | container + membership + settings | `spaces`, `members`, `space_invites`, `task_axes` |
| `entities` | every graph node, uniform envelope + kind content | `entities` + detail tables |
| `edges` | first-class typed links | `edges`, `edge_types` |
| `messages` | entities of kind `message`, addressed via anchor | `messages` |
| `collections` | saved/ad-hoc queries over entities | query engine + `saved_views` |
| `graph` | neighborhood/dependency projections | edges + hierarchy CTEs |
| `placements` | intent-resolution for drag/drop | resolves to edge/move/message |
| `inbox`, `read-marks`, `activity` | per-member read state and feeds | `notifications`, `read_marks`, `activity` |
| `search` | ranked entity refs | `search_index` — **deferred (v1: not built)**; reserved slot, `01 §S1` |
| `events` | the realtime stream | canonical event mapper |

### 3.1 Uniform entity operations (every kind, one pattern)

```
GET    /entities/:id                     → EntityDetail   (?include= lazy sections)
GET    /entities/:id/children            → Page<EntitySummary>
GET    /entities/:id/messages            → Page<MessageView>       (anchor semantics)
GET    /entities/:id/edges               → EdgeGroup[] / Page<EdgeView>
GET    /entities/:id/activity            → Page<ActivityItem>
GET    /entities/:id/versions            → Page<VersionEntry>      (versioned kinds)
POST   /entities                         → create   { kind, spaceId, parentId?, position?, content, edges? }
PATCH  /entities/:id                     → update   { content patch, expectedVersion }
POST   /entities/:id/move                → reparent/reorder { parentId, position, expectedVersion }
DELETE /entities/:id                     → soft delete (subtree-scoped)
PUT    /entities/:id/reaction            → { reaction, enabled }
POST   /entities/:id/points              → ledger append
```

`POST /entities` and `PATCH /entities/:id` take a **discriminated `kind` + typed `content`** — the same shape for task, doc, channel, spell, skill, file-metadata, team_member. No `POST /tasks`, `POST /docs`, … routes; the kind is data, not path. (Deviation from the UI contract's `POST /v2/tasks` — see `05 §3`; the UI contract itself already sketches `POST/PATCH /v2/entities` as the general form.)

### 3.2 Kind commands (explicit, enumerated, few)

Kind-specific operations exist only where a transaction or invariant can't be expressed as a uniform patch:

```
POST /entities/:id/commands/complete        task       completers, criteria gate, award ledger — one txn
POST /entities/:id/commands/work            task       work_status transitions with per-actor working_on edge
POST /entities/:id/commands/pull            any        projection render + pulled edge {localId, pinnedVersion}
POST /entities/:id/commands/link-pr         task       url → pull_request entity upsert + tracks edge, one txn
POST /tracking/refresh                      pr/commit  batch provider fetch, async (202 + later patches)
```

(Message deletion needs no command: `DELETE /messages/:id` *is* the tombstone/redaction semantics.)

The command namespace (`/commands/<verb>`) is closed per kind and discoverable via `GET /entities/:id` → `capabilities` + `GET /actions?contextEntityId=` (UI contract §3). Anything not listed is a uniform operation or an edge write.

### 3.3 Edges as first-class resources

```
GET    /edges?src=&dst=&type=&direction=   → Page<EdgeView>
POST   /edges                              → { srcId, dstId, type, props, clientMutationId }
PATCH  /edges/:id                          → props update
DELETE /edges/:id
GET    /edge-types                         → registry (types, endpoint kinds, props schemas)
```

Assignment, dependencies, tracking, attachment, equipping, likes/stars are all `POST /edges` with a registered type — the API does not grow a route per relationship. Reactions get the sugar `PUT /entities/:id/reaction` (mutual-exclusion invariant lives in the `react` RPC), but it is defined as edge sugar, not a separate model.

### 3.4 Messages

Messages are entities, but their access pattern is anchor-first, so they get addressed routes:

```
GET    /entities/:anchorId/messages?rootId=&order=&cursor=
POST   /messages          { anchorId, body, parentMessageId?, mentions, attachments, clientMutationId }
PATCH  /messages/:id      { body, expectedVersion }
DELETE /messages/:id      → tombstone
```

### 3.5 Collections, graph, placements

Adopted from the UI contract unchanged in shape (`CollectionQuery`, `GraphQuery`, placement intents) — they are the *query* half of the grammar and are already designed from the entity shapes. The service layer owns preset expansion (`home` presets, channel auto-tab queries) so every consumer gets identical semantics.

## 4. Operation catalog (canonical names)

Transport-independent names, used by `03` (CLI/MCP mappings) and `05` (coverage matrix). HTTP bindings are §3's routes.

```
identity.get            spaces.list/create/get/update  spaces.navigation
spaces.members.list     spaces.invites.create/list/revoke/redeem
spaces.taskAxes.list/create/update/delete
spaces.leaderboard      spaces.awards

entities.get/create/patch/move/delete
entities.children/versions/activity
entities.react          entities.points.add
entities.commands.complete/work/pull/linkPr    tracking.refresh

edges.list/create/patch/delete    edgeTypes.list
messages.list/post/edit/delete
collections.query       graph.query        placements.apply
search.query            [DEFERRED v1 — reserved; palette runs on recent/known entities]
inbox.list/markRead     readMarks.upsert
savedViews.list/create/update/delete
events.subscribe        presence.get
```

Every UI screen, CLI command, and MCP tool in `03`/`05` maps to exactly one of these (or a documented composition).
