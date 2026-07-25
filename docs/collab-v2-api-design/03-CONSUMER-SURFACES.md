# 03 — Consumer Surfaces: One Contract, Four Projections

**Part of:** `docs/collab-v2-api-design/` — see `00-OVERVIEW.md`.
**Answers:** how the UI, the CLI (humans and agents), programmatic agent use, and a future MCP server each consume the operation catalog of `02 §4` — without any of them getting a private API.

---

## 1. Projection rules

- Every surface calls the same operations with the same DTOs; a surface may *subset* the catalog and *reshape presentation* (tables for humans, JSON for agents, tool schemas for MCP) but never semantics.
- Capability discovery is part of the contract: `EntityDetail.capabilities` + `GET /actions?contextEntityId=` tell every surface what is currently allowed — the UI greys a button, the CLI prints "not permitted", the MCP tool returns a typed error, all from the same bit.
- Feature gating is honest: a not-yet-built operation is absent from `/actions` and returns `501 not_implemented` (see `04 §4`) — never a silently different behavior.

## 2. Surface 1 — UI (rich DTOs)

The UI consumes exactly the UI data contract's read model: `EntitySummary` for Z1/Z2, `EntityDetail` for Z3/Z4, `CollectionResult`, `GraphResult`, `MessageView`, plus the canonical event stream for liveness. This doc set **adopts** those DTOs (deviations enumerated in `05 §3`).

Server-owned derived fields (binding restatement of UI contract §6, owned by the service layer per `02 L3`):

| Derived field | Source computation |
|---|---|
| `badges.blocked` | incoming `depends_on(hard)` edges × `is_resolved(target)`, rolled up per entity |
| `badges.pulls[] / PullState` | `pulled` edge props `pinnedVersion` vs `entities.version`; `pulledAt` vs `activity_at` → `contentStale` / `discussionMoved` |
| `state.channel.autoTabs` | non-empty `attached_to` groupings toward the channel, emitted as `ChannelTab.query` collection queries |
| `counters` + `viewerReaction` | `entity_counters` + the caller's own reaction edge |
| `capabilities` | role + kind + status (e.g. `canComplete` = assignee/admin ∧ task not done) |
| `title` / `excerpt` / tombstones | per-kind normalization so one card renderer works everywhere |

The UI never receives raw table rows, raw edges without grouping, or Supabase-shaped errors.

## 3. Surface 2 — CLI (humans AND agents)

One command tree, `maestro collab …`, replacing the current thin `collab-v2` namespace. Design constraints: an LLM must be able to (a) discover it from `--help`/command-catalog, (b) parse every output deterministically with `--json`, (c) do a full work loop in few calls (context efficiency).

### 3.1 Command tree

```
maestro collab auth login|status|token          # maestro-server session auth (device/loopback), token cache — no Firebase/Supabase token client-side (04 §6)
maestro collab spaces [list|create|use <id>]    # `use` pins a default space in local config
maestro collab walk <entityId> [--depth 1] [--subtree] [--messages 10] [--json]
maestro collab tree <entityId> [--depth N] [--kind task]
maestro collab get <entityId> [--include hierarchy,connections,thread]
maestro collab list --kind task [--status open] [--axis type=code] [--ready] [--assignee me]
                    [--parent <id>] [--sort activity] [--cursor …] [--json]
maestro collab create --kind task --title … [--parent <id>] [--field k=v …] [--json]
maestro collab patch <entityId> [--field k=v …] [--expected-version N]
maestro collab move <entityId> --parent <id> [--position N]
maestro collab delete <entityId> [--yes]

maestro collab message send --anchor <entityId> "<body>" [--reply-to <msgId>] [--mention <actorId>…]
maestro collab messages <anchorId> [--thread <rootId>] [--since <cursor>] [--json]

maestro collab edge add <srcId> <type> <dstId> [--props '{…}']
maestro collab edge rm <edgeId> | edge ls <entityId> [--type …] [--direction in|out]

maestro collab pull <entityId> [--into <localProjectId>] [--stdout]   # projection + pulled edge
maestro collab status [<entityId>]           # my pulls: staleness (content/discussion) per pin
maestro collab task status <taskId> working|in_review|blocked|done
maestro collab task complete <taskId> --by <actorId,…>
maestro collab pr link <taskId> <prUrl>      # creates/refreshes PR entity + tracks edge
maestro collab react <entityId> like|dislike|star [--off]
maestro collab points add <entityId> <n> [--reason grant]
maestro collab search "<query>" [--kind task,doc] [--space <id>] [--json]   # DEFERRED v1 — reserved verb, not built (00 D12)
maestro collab inbox [--unread] ; maestro collab read <anchorId>
maestro collab events tail [--space <id>] [--kind entity,edge,message]   # canonical event stream
```

### 3.2 `--json` contracts

- `--json` emits exactly the contract DTOs (`EntityDetail`, `Page<EntitySummary>`, `CommandResult`) — no CLI-invented shapes. A script or LLM that learns the DTOs once can parse every command.
- Human output is a rendering of the same DTO (table/tree), so the two modes can't drift.
- Exit codes: `0` ok, `2` typed API error (error JSON on stdout with `--json`, message on stderr otherwise), `3` auth, `4` connectivity.

### 3.3 Agent context-efficiency contract

- **`walk` is the workhorse** (design doc §13.2): one call → envelope + content + edge groups (with resolved/hard flags) + counters + last N messages + children page. Depth ≥2 expands neighbor summaries only (never full content) and hard-caps payload (see `04 §7`), so an LLM can hop without flooding context.
- `pull` renders the deterministic markdown projection with the `collab-ref` header (space/task/version + the exact `walk` command to go deeper).
- Every mutating command auto-generates `clientMutationId` (uuidv7) and retries safely; `--idempotency-key` overrides for scripted flows.
- The command catalog entry (maestro-cli `command-catalog.ts`) exposes this tree to agent system prompts with the same syntax shown here.

## 4. Surface 3 — Programmatic agent API

Agents and scripts hit the HTTP facade directly (same endpoints as the UI). The additional guarantees they rely on:

- **Idempotency everywhere:** every mutation accepts `clientMutationId`; replays return the original `CommandResult` (see `04 §5`).
- **Deterministic errors:** the closed error taxonomy of `04 §4`; no free-text-only failures.
- **Actor semantics:** requests may name `actorId` (a team_member persona); the backend proves the signed-in user owns it (`can_act_as`). Agents therefore act *as themselves* with human-anchored auth — no separate agent credential in v1 (headless keys are backlog C6).
- **Stable pagination:** keyset cursors remain valid under concurrent writes (no offset drift), which matters for long agent scans.

## 5. Surface 4 — Future MCP server (designed now, built later)

A `collab` MCP server exposes tool-shaped operations mapping 1:1 onto the operation catalog. The mapping rule: **one tool per catalog family, discriminated by parameters** — few tools with regular schemas beat many bespoke tools (LLM tool-selection cost scales with tool count).

| MCP tool | Catalog operations | Notes |
|---|---|---|
| `collab_walk` | `entities.get` (+children/edges/messages includes) | the flagship context tool; returns the same walk DTO as the CLI |
| `collab_query` | `collections.query`, `graph.query` (`search.query` deferred, 00 D12) | `mode: 'collection'|'graph'` in v1; `'search'` added when built |
| `collab_entity_write` | `entities.create/patch/move/delete` | discriminated `action` |
| `collab_edge_write` | `edges.create/patch/delete` | |
| `collab_message` | `messages.post/edit/delete`, `messages.list` | |
| `collab_task_flow` | `entities.commands.work/complete`, `pr link` sugar | the report-back verbs |
| `collab_pull` | `entities.commands.pull` | returns the rendered projection as content |
| `collab_react` | `entities.react`, `entities.points.add` | |
| `collab_admin` | spaces/invites/axes/saved-views ops | gated by role capability |

Implementation note: the MCP server is a thin binding over the same maestro-server HTTP facade (auth via the user's cached maestro-server session, exactly like the CLI — no Firebase/Supabase token on the client, 04 §6). Tool JSON schemas are generated from the contract's Zod schemas — one source of truth, so the MCP layer cannot drift. Building it is out of scope here; this table is the commitment that nothing in the contract blocks it.

## 6. What keeps the surfaces converged

- DTO/Zod schemas live in one shared contract module consumed by server, CLI, UI client, and (later) MCP schema generation.
- The coherence matrix (`05`) is the review artifact: any new UI surface or CLI verb must land there mapped to a catalog operation before implementation.
