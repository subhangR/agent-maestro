# 05 — Coherence Proof: Surface → Operation Matrix and Contract Deviations

**Part of:** `docs/collab-v2-api-design/` — see `00-OVERVIEW.md`.
**Answers:** proof that every UI surface, CLI command, and agent workflow maps onto the operation catalog (`02 §4`) — and the exact, enumerated deviations from `COLLAB_V2_UI_DATA_CONTRACT.md` with a migration note each (the UI mock facade must follow these).

---

## 1. UI surfaces → operations

Every screen/component from the UI data contract §3 and the UI/UX brief:

| UI surface | Operations | Notes |
|---|---|---|
| Space switcher + left rail | `spaces.list`, `spaces.navigation` | navigation = current member, unread totals, channel tree of `EntitySummary` |
| Home — My Work (3 columns) | `collections.query` ×3 (server presets `readyToPull`, `inFlight`, `needsMe`), `activity` page | presets expanded server-side |
| Inbox | `inbox.list`, `inbox.markRead` | cross-space |
| Channel hub (header/shelf/auto-tabs) | `entities.get` (detail: autoTabs, shelf), then `collections.query` per `ChannelTab.query` | shelf pin = `attached_to.props.pinned` |
| Channel feed / any thread | `messages.list`, `messages.post/edit/delete`, `readMarks.upsert` | one thread component for chat, task comments, doc margins |
| Tasks (list/board/tree) | `spaces.taskAxes.list`, `collections.query` (groupBy axis/status, tree via `parentId`/`subtreeOf`) | board moves = `entities.patch` (status) / `edges.create` (assign) |
| Task detail | `entities.get`, `entities.patch`, `entities.commands.work/complete`, `edges.*`, `messages.*` | |
| Docs (tree/gallery/reader) | `collections.query`, `entities.get`, `entities.versions`, `entities.patch` | margin notes = messages anchored to doc |
| Team | `collections.query` (member, team_member), `entities.get` | liveWork from `working_on` edges |
| Tracking (PRs/commits) | `collections.query` + edge projection, `entities.commands.refresh` | |
| Graph canvas | `graph.query`, `savedViews.*` | layout persisted on saved view |
| Leaderboard | `spaces.leaderboard`, `spaces.awards` | ledger sums / award events |
| Space settings | `spaces.get/update`, `spaces.members.list`, `spaces.invites.*`, `spaces.taskAxes.*` | admin capability gated |
| Hover cards / Z3 panel / Z4 route | `entities.get` (+lazy `?include=` sections) | |
| Command palette | `/actions?contextEntityId=` (+ recent/known entities) | `search.query` deferred v1 (00 D12) |
| Drag & drop grammar | `placements.apply` | intent → edge/move/message, undoable |
| Liveness everywhere | `events.subscribe` (+ `presence.get` via RTDB) | canonical `WorkspaceEvent` only |

## 2. CLI commands and agent workflows → operations

| CLI command (03 §3.1) | Operations |
|---|---|
| `walk` / `tree` / `get` | `entities.get` (+children/edges/messages includes) |
| `list` | `collections.query` |
| `create` / `patch` / `move` / `delete` | `entities.create/patch/move/delete` |
| `message send` / `messages` | `messages.post` / `messages.list` |
| `edge add/rm/ls` | `edges.create/delete/list` |
| `pull` / `status` | `entities.commands.pull` / pull-edge staleness read |
| `task status` / `task complete` | `entities.commands.work` / `.complete` |
| `pr link` | `entities.create` (pull_request) + `edges.create` (tracks) — one composite op `prLink` in the service layer |
| `react` / `points add` | `entities.react` / `entities.points.add` |
| `search` | `search.query` — **deferred v1 (00 D12)**, reserved verb |
| `inbox` / `read` | `inbox.list` / `readMarks.upsert` |
| `events tail` | `events.subscribe` (SSE) |

Agent work loop (design doc §16), end to end: `pull` → (`walk`, `messages.list`) → `messages.post` progress → `pr link` → `task status in_review` → human `complete --by` → award events → leaderboard. Every step is a catalog operation; no step requires a bespoke route. Future MCP tools map per `03 §5` (1:1 with catalog families).

## 3. Deviations from `COLLAB_V2_UI_DATA_CONTRACT.md`

Each deviation lists a migration note for the UI mock facade (the UI team binds to these). Everything not listed here is **adopted unchanged**: the DTOs of contract §2, the read matrix of §3, the command semantics of §4, the event taxonomy of §5, and the derived-field ownership of §6.

| # | Deviation | Migration note for the UI mock facade |
|---|---|---|
| DEV-1 | **Per-kind create/edit routes collapse into the generic entity routes.** `POST /v2/tasks` and `PATCH /v2/tasks/:id` are replaced by `POST /v2/entities` / `PATCH /v2/entities/:id` with discriminated `{kind, content}` (the contract already sketches this as "Create/update another kind"; it becomes the only form). | Route task create/edit through the generic entity handlers; keep payload fields identical inside `content`. Task-specific validation is by `kind`, not by path. |
| DEV-2 | **Kind commands move under a closed `/commands/*` namespace.** `POST /v2/tasks/:id/complete` → `POST /v2/entities/:id/commands/complete`; `POST /v2/entities/:id/pulls` → `…/commands/pull`; `POST /v2/entities/:id/work` → `…/commands/work`. Payloads unchanged. | Path rename only. Command discovery via `capabilities` + `GET /actions` is unchanged. |
| DEV-3 | **PR linking is a first-class command**: `POST /v2/entities/:id/commands/link-pr` `{url, clientMutationId}` creates/upserts the `pull_request` entity and the `tracks` edge atomically (contract §4 had no explicit row for it). | Add the command; render result as `CommandResult` with the new PR `EntitySummary` in `patches`. |
| DEV-4 | **Presence/typing relay through maestro-server, not a direct client connection.** `presence.changed` / `typing.changed` stay in the `WorkspaceEvent` union but are delivered over the same maestro-server bridge as durable events; RTDB (if used at all) is a server-side detail. Per the single-boundary decision (00 D5), the client opens **no** Firebase/Supabase connection. | Mock delivers presence via its event stream/bridge like everything else; drop any direct client RTDB presence hook. |
| DEV-5 | **Offset pagination is deleted, not aliased.** `?offset=` on `/spaces/:id/entities` and `/spaces/:id/activity` is removed; every list takes an opaque keyset cursor (`04 §3`), and cursors from before the cutover are rejected with `400 invalid_cursor`. | Mock must ignore/reject `offset` and hand out opaque cursors; UI drops its cursor-as-offset special case for `getActivity`. |
| DEV-6 | **Uniform envelope everywhere:** every route returns `{ data, requestId }` (the contract required it for GETs; today's live client reads bare bodies everywhere except `collections/query`). | Mock wraps all responses; UI client normalizes to one unwrap path. |
| DEV-7 | **Reaction route is the contract shape, confirmed against a divergent implementation:** `PUT /v2/entities/:id/reaction` `{reaction:'like'|'dislike'|'star', enabled}`. The branch facade's `POST …/reactions` `{type:'likes', active}` is dropped. | If the mock copied the branch facade shape, switch to the contract shape (singular, PUT). |
| DEV-8 | **Error taxonomy extended (additive):** the contract's four errors grow to the closed set of `04 §4` (`invalid_cursor`, `invariant_violation`, `payload_too_large`, `rate_limited`, `not_implemented`, `upstream_unavailable`), all in one `{error:{code,…}}` body with `requestId` and `retryable`. | Mock adopts the body shape; UI error handling switches on `code`, not status text. |
| DEV-9 | **Idempotency is universal:** `clientMutationId` is accepted **and honored** on every mutation (command-ledger replay, `04 §5`), not just messages/points. `react`/`create` paths gain the field. | Mock may treat replay as no-op-with-same-result; UI keeps generating ids per mutation (already does). |
| DEV-10 | **`counters.viewerReaction` is guaranteed** (server-computed from the caller's reaction edge), no longer optional-and-null. | Mock computes it from its own state; UI can drop any client-side fallback. |
| DEV-11 | **Undo redemption is specified:** `POST /v2/undo` `{token}` executes the inverse command; `UndoToken` TTL 5 min (contract mentioned the token, not the redemption route). | Add the route to the mock; wire the one-step undo UX to it. |
| DEV-12 | **Client auth is a maestro-server session, not a Firebase/Supabase token** (00 D5). The `X-Collab-Firebase-Token` / `X-Collab-Firebase-Uid` headers and the Supabase publishable key are removed from the client contract; the collab surface authenticates like every other maestro-server call. | Mock/live client drop the Firebase headers and Supabase client entirely; use the standard maestro-server session. No client-side Supabase/Firebase SDK. |
| DEV-13 | **Search is deferred for v1** (00 D12): no `GET /v2/search`; the command palette runs on recent/known entities plus `/actions`. | Mock returns no search endpoint; palette uses supplied recent/known entities (contract §3 already allows this fallback). |

## 4. Implementation status (verified against the branch, 2026-07-25)

Status per operation family — what the next implementation phase actually owes:

| Operation family | DB (RPC/tables) | Facade | CLI | Notes |
|---|---|---|---|---|
| identity / spaces / navigation / discover / join | ✅ | ✅ | ✅ | discover unbounded → keyset (01 §6) |
| entities read (detail/children/edges/thread bundle) | ✅ reads via PostgREST | 🔶 `CollabEntityView`, not `EntityDetail`; no capabilities/autoTabs/PullState/blocked | 🔶 `entity get` | the **biggest gap is the read projection**, not writes |
| collections.query | — (facade-composed) | 🔶 filters/groupBy/sort/subtree ignored; no `groups` | ✅ passthrough | grouping/sorting/subtree owed |
| graph.query | — | 🔶 basic nodes+edges | ❌ | dependency mode, clusters owed |
| entities create/patch (task/doc/file/channel) | ✅ | ✅ (per-kind routes) | ✅ | collapse per DEV-1 |
| entities create/patch (spell/skill/PR/commit/team_member) | ❌ no detail tables | ❌ | ❌ | 01 §3 |
| move / placements / undo | ✅ (undo token in RPC results) | ✅ (undo route: UI client only) | 🔶 no undo | |
| delete/restore entity | ❌ | ❌ | ❌ | 01 §6 — nothing can delete today |
| messages post | ✅ | ✅ | ✅ | |
| messages edit/delete | ❌ no RPC | ❌ | ❌ | 01 §6 |
| thread paging (`GET /entities/:id/messages`) | index ready | ❌ (bundled, capped 500) | ❌ | |
| react / points | ✅ | ✅ (divergent shape → DEV-7) | ✅ | react lacks idempotency key → DEV-9 |
| complete / work / pull | ✅ | ✅ | ✅ | pull = edge only; **projection composer absent** (03 §3.3 owes it) |
| link PR / commit | ❌ | ❌ | ❌ | DEV-3, 01 §6 |
| tracking refresh | ✅ queue table | ✅ (202) | ❌ | worker that fetches provider data absent |
| task-axes | 🔶 create only | 🔶 | 🔶 | update/delete owed |
| inbox / read-marks | ✅ | ✅ | ✅ | unread_counts RPC absent (01 §S2); fan-out is broadcast → targeted rewrite (01 §5.3) |
| search | ⏸ deferred | ⏸ deferred | ⏸ deferred | v1: not built; reserved slot 01 §S1 (00 D12) |
| saved views | ❌ | ❌ | ❌ | 01 §S6 |
| leaderboard / awards | tables ready | ❌ | ❌ | view + routes owed |
| versions history read | 🔶 task-only snapshots | ❌ | ❌ | snapshot trigger (01 §5.1) + route |
| walk / tree | ❌ | ❌ | ❌ | flagship agent op — 01 §6, 03 §3.3 |
| events (canonical stream) | ✅ `workspace_events` + capture trigger | 🔶 poll-only, offset cursor, no push, no `clientMutationId` | 🔶 `v2 events` | push transports + keyset + reconciliation → 04 §2 |
| invites | ❌ | ❌ | ❌ | 01 §2 |
| auth | 🔴→ target: maestro-server-issued Postgres JWT; bypass removed at sequence level (migration 1) | 🔴→ target: sole boundary, mints token, no client Firebase/Supabase token | ✅ keychain/loopback flow solid; retarget to maestro-server session | 00 D5/D11, 04 §6; prod identity source flagged (04 §6.4) |
| agent prompt catalog | — | — | 🔶 6 of ~30 commands advertised | 03 §3.1 tree + full catalog exposure |

Legend: ✅ done · 🔶 partial/divergent · ❌ absent · 🔴 must be removed.
