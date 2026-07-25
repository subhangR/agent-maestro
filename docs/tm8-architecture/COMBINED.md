# tm8 — Architecture Doc Set (Combined Edition)

**Assembled:** 2026-07-25 (regenerated: AM-1 in-place rewrites P0-5, T-D22/AM-2 recorded, 08 resolution addendum, 10-SECURITY-MODEL adopted) · Concatenation of docs 00–10. Individual files normative; running build state in tm8/STATE.md.

**Contents:** 00-VISION · 01-LAWS · 02-NODE-AND-GATEWAY · 03-ENTITY-GRAPH-DELTAS · 04-EXECUTION-TRANSPLANT · 05-DECISIONS · 06-SEQUENCING-AND-REVIEW · 07-ARCHITECTURE-REVIEW · 08-AMENDMENT-VERIFICATION · 09-IMPLEMENTATION-PLAN · 10-SECURITY-MODEL


---

<!-- ======================= 00-VISION.md ======================= -->

# tm8 — Vision

**Status:** FINAL (2026-07-25) — GO adjudicated in T-D20; verified per `08-AMENDMENT-VERIFICATION.md`. Note: maestro-mobile joins the unification as a thin client of the contract (server-hosted PTY mode), Phase 3 [R23].
**Date:** 2026-07-25
**Author:** Design discussion session (`sess_1784931993141_0y6d4fs4v`) with the user; distills the Collab V2 corpus + the unification discussion of 2026-07-25.
**Name:** `tm8` — spells *teammate*. `team_member` is the atomic unit of the data model; the product is teammates (human and agent) around a shared entity graph. The name and the data model agree.

---

## 1. The product in one paragraph

tm8 is a workspace where humans and AI agents are peers around a single **entity graph**: a small set of first-class kinds (task, doc, channel, message, member, team_member, spell, skill, work_session, pull_request, commit, file, collection, + user-defined custom kinds) where every entity has four universal capabilities — same-kind hierarchy (context-splitting subtrees), typed edges (all relations), anchored messages (one discussion shape everywhere), and reactions/points (a social+gamification layer). The graph is the UI: one component system renders every kind at four zoom levels; one Thread, one ConnectionsRail, one CollectionView; a drag grammar where every drop means one explicit edge/move/embed. **Execution — actually running agent sessions in terminals — is a capability of a server, not a separate product.** Collaboration is what happens when servers talk: a hub is a well-connected server, peer-to-peer is two servers speaking the same bridge protocol, and the local single-user case is the same machinery with one member in it.

## 2. Why a new repository

tm8 replaces the `agent-maestro` repo rather than converging inside it, because:

1. **The blueprint already exists outside the old code.** The Collab V2 corpus — entity-graph design, approved API contract (`docs/collab-v2-api-design/`), UI data contract, interactive prototype, and the in-flight mock-data UI build — is a complete spec. Most rewrites die because the spec lives in the legacy code; here it lives in documents.
2. **The seed code was built to be lifted.** The Collab V2 UI module is deliberately self-contained (`maestro-ui/src/collab-v2/`: own tokens, own stores, zero legacy imports, facade seam). The backend branch's migrations are the schema minus the auth swap already decided.
3. **The old repo fights the vision.** File-based JSON repos, 23 Zustand stores, CJS server, Collab V1 Firestore, Firebase — every in-place step would be half migration, half archaeology. A repo where the graph is the *only* model is how "kinds are data" and "the graph is the core" stay true.

The one thing the corpus does NOT specify is the thing old maestro is best at: **running sessions** (spawn flow, manifests, PTY hosting, terminal performance). That is why execution is **transplanted, never rewritten** — see `04-EXECUTION-TRANSPLANT.md`.

## 3. What tm8 unifies (the old world → the new)

| Old (agent-maestro) | tm8 |
|---|---|
| maestro-server (Express, file JSON repos) | tm8-server: same facade role, graph engine on Postgres |
| Maestro local desktop (Tauri, 23 stores) | tm8-ui: the Collab V2 entity-component UI is the whole UI |
| Maestro Collab V1 (Firestore) + Collab V2 (Supabase) | one entity graph, plain Postgres, no Firebase, no Supabase |
| maestro-cli (worker/coordinator commands) + collab CLI | one graph CLI, space-scoped (`--space` / pinned spaceId); worker-verb compat adapter during transition |
| maestro-gateway (Trusted Hub, Design A) | tm8-gateway module: auth + routing + relay + hosted workspaces |
| Project / Task / Session / TeamMember / Team / Spell / TaskList | space-linked projects / task / work_session / team_member / team_member subtree / spell / collection — all graph kinds |

## 4. Non-goals (v1)

- No CRDT/live co-editing (inherited non-goal B1).
- No per-entity fine ACLs beyond visibility (inherited B2).
- No search (deferred per DEV-13; reserved slot `search_index`).
- No cross-node portable identity (federation identity deferred; v1 identity is node-local).
- No public-signup scale identity (invite/account on your own node or a hub you join).
- No P2P federation in v1 (hub-only; the bridge protocol is designed so P2P is additive).

## 5. Reading order for this doc set

`00-VISION` → `01-LAWS` → `02-NODE-AND-GATEWAY` → `03-ENTITY-GRAPH-DELTAS` → `04-EXECUTION-TRANSPLANT` → `05-DECISIONS` → `06-SEQUENCING-AND-REVIEW`.

Normative upstream corpus (inherited ground truth, referenced not duplicated):

- `docs/collab-v2-api-design/00..05` (on main) — the API contract: layering, resource grammar, consumer surfaces, communication model, coherence matrix. Read with the substitution *maestro-server → tm8-server* and the auth delta in `05-DECISIONS.md` (T-D3).
- `docs/COLLAB_V2_ENTITY_GRAPH_DESIGN.md`, `COLLAB_V2_UI_UX_BRIEF.md`, `COLLAB_V2_GAPS_AND_EXTENSIONS.md`, `COLLAB_V2_UI_DATA_CONTRACT.md` (branch `feat/collab-v2-supabase-backend`) — the data model, UI thesis, deferred slots.
- `docs/collab-v2-ui-plan/01,02` (main) — the UI implementation in flight (Atlas, waves W0–W5), which becomes tm8-ui by transplant.

---

<!-- ======================= 01-LAWS.md ======================= -->

# tm8 — The Architecture Laws

**Status:** FINAL (2026-07-25) — amended per `07-ARCHITECTURE-REVIEW.md` (R1, R2, R3, R13, R16); verified per `08-AMENDMENT-VERIFICATION.md`. These are the invariants every design and implementation decision must satisfy. Each law records its rationale and what it forbids. Numbered T-L1…T-L12; referenced throughout the doc set.

---

## T-L1. One node binary, six composable blocks

A **node** is one server binary composed of six blocks: **graph engine** (entity graph + contract), **db** (Postgres), **server** (HTTP/WS facade, WorkspaceEvent, **identity/accounts** — the account store, sessions, `can_act_as`, and the node-admin role live here, in *every* composition [R1]), **execution** (PTY/sessions), **bridge** (node↔node protocol client), **gateway** (routing + relay + hosted-workspace spawner + the *remote-facing* auth surface, which authenticates against the server's identity block [R1]). Every deployment is a composition:

| Deployment | graph | db | server | execution | bridge | gateway |
|---|---|---|---|---|---|---|
| Local desktop | ✓ | ✓ (sidecar) | ✓ | ✓ | ✓ (outbound) | — |
| Hub (VPS) | ✓ | ✓ | ✓ | optional | ✓ | ✓ |
| Hosted workspace (behind a hub) | ✓ | ✓ (shared cluster) | ✓ | optional | ✓ | — |

*Forbids:* a second product, a "collab build" vs "local build", any feature that exists in one composition but is architecturally impossible in another.

## T-L2. The graph is the core, and the graph is the UI

Everything user-facing is one of: an entity rendered by the entity component contract (Z1 chip / Z2 card / Z3 panel / Z4 full view), a collection view over entities, or the two axes (hierarchy + edges). The composition maxim is inherited verbatim: *if a surface can't be composed from entity components, collection views, and the two axes — it doesn't belong in the product.*

## T-L3. Graph-core + side tables

The graph holds entities and edges. Side tables are legitimate and expected, in four flavors: **ledgers** (points, activity, command replay), **per-member state** (read marks, notifications, saved views), **config** (task axes, edge-type registry, entity-kind registry), **operational** (outbox, event buffer, invites, manifests). The entity test: *do the four universal capabilities pay rent on X?* (would you discuss it, link it, parent it, react to it — does it deserve a chip/card/panel?). Side tables never encode relations; **edges are the only relationship mechanism.**

*Forbids:* hand-rolled relationship arrays/columns (the V1 Firestore failure mode: `pulledByUids[]`, `assigneeUids[]`, …).

## T-L4. Kinds are data — including user-defined kinds

One `KindRegistry` entry per kind in the UI; one `entity_kinds` registry row per kind in the DB. Core kinds get typed SQL detail tables (constraints and invariants live in the database). **Custom kinds** are created at runtime: a registry row (name, icon, field schema, enabled capabilities) + rows in one shared jsonb detail table validated against the schema on write. All four universal capabilities work on custom kinds from day zero (they live on the envelope). Custom kinds get **no custom commands or triggers** — data-shaped, not behavior-shaped. Promotion of a proven custom kind to a core kind is a migration (mirrors `x:` edge-type promotion).

*Forbids:* `if (kind === '…')` outside the registry; dynamic DDL.

## T-L5. Single-homed spaces

Every space has exactly one authority node — its **home server**. There is no multi-master, no distributed consensus. Hub and P2P are the same protocol at different topologies: a hub is a well-connected node.

Consequences accepted [R13]: a space is as available as its home; partition degrades to pull-side work + deferred report-back; rehoming a space (via export/import) re-establishes membership — identity is node-local until Phase 4, so authored history carries as attributed record while membership is re-invited. Backup/export is the trust backstop.

## T-L6. The bridge is workspace↔workspace and asymmetric — asymmetry binds the *projection*, not the member [R3]

The bridge is defined between *workspaces*, not machines — a browser user acts directly in a graph (no pull); two workspaces hosted on the same physical hub still bridge identically. Two distinct ideas, kept distinct:

- **(a) The bridge as remote consumer surface.** An authenticated remote member can do, over the bridge, anything the operation catalog + RLS lets them do in that space — including `entities.create`, `entities.patch` (with `expectedVersion`), and commands. This is safe: it is the same single-authority write path every local client uses; the space stays single-homed; there is no sync. Remote members are first-class citizens.
- **(b) The projection discipline.** For *pulled* entities specifically: pull = a deterministic **projection** of an entity neighborhood, pinned to a version, rendered into the pulling workspace (with a `pulled` edge recording `{workspace/localId, pinnedVersion}`). The local artifact is a build product — local edits to it never propagate; the only sanctioned flows back to the source are appends (messages, edges) and commands. **Never field-level sync of a projection.** `version` (content) vs `activity_at` (neighborhood) remain the two staleness signals for every pin.

*Forbids:* two-way mirror sync; any **automated** write-back derived from a pulled projection; bridge mutations outside the operation catalog.

## T-L7. Auth is always on; local is the degenerate case

Every node runs the full identity/membership/`can_act_as` machinery. A single-user local node auto-authenticates its owner: one account, one member row per space — the same code path with one row in it. Node-level roles (node admin: accounts, invites, resource limits) are distinct from space-level roles (owner/admin/member) and never mixed. Agents act as themselves (`team_member` authorship) with authorization resolving through their owner — inherited unchanged.

*Forbids:* "local mode skips auth"; any second auth code path.

## T-L8. The gateway owns routing + relay only — never graph data, and never the primary account store [R1]

The gateway block holds the node/workspace routing table, the relay, the hosted-workspace spawner, and the *remote-facing* auth surface (login endpoints for other people's clients, token exchange for bridge callers); it authenticates against the node's identity block (which lives in the server block, every composition — T-L1). The hub's shared collab space is an **ordinary space in an ordinary workspace** served by the same graph engine as everyone else's. Same Postgres cluster allowed; separate schema, separate concern.

*Forbids:* gateway-side graph-ish tables; a "collab database" distinct from the workspace database; a gateway-owned account database.

## T-L9. Space membership is always the visibility boundary

"Every hub user sees the hub graph" is a *default policy* (the hub's shared space auto-adds authenticated users as members), not an architecture property. A hub can host a private space between two users without touching the model. Visibility machinery (the inert `visibility` column + `visible_to` slot) is inherited as designed.

## T-L10. The graph announces, sockets deliver

Live media — terminal streams today, broadcast/screen-share later — is **announced and authorized through the graph** (e.g. a `work_session` entity with a LIVE/share flag; viewers discovered via membership) but **always flows client↔home-server over the WS bridge**, relayed by a gateway as a dumb pipe when the home machine isn't directly reachable. Live bytes never pass through storage. Session *state* lives in the graph; session *output* lives on the socket; a session's reviewable record is an artifact (transcript document) attached to the entity, not a byte recording.

The xterm frame surface *inside* a `work_session` panel is stream UI, explicitly exempt from the entity-component contract at the frame level — the panel around it is an entity component; the canvas inside it is not [R16].

*Forbids:* the database in any streaming hot path; ambient live-terminal visibility (sharing is an explicit act).

## T-L11. The contract is the seam; Postgres is the implementation

The API contract (operations, DTOs, events, errors — inherited from `docs/collab-v2-api-design/`) is database-agnostic and transport-independent; the reference implementation is Postgres and uses it fully (triggers, recursive CTEs, GIN, RLS, uuidv7). Locally, Postgres runs as a **bundled sidecar** managed by tm8-server (PGlite is the watched fallback; a SQLite port is rejected). One schema, one migration sequence, laptop and hub.

Identity binds to Postgres **per transaction**, not via self-minted tokens [R2]: tm8-server executes as a dedicated **low-privilege role** (never table-owner/superuser) and sets identity claims with `SET LOCAL` inside each transaction; RLS predicates and `can_act_as` read those claims. JWTs exist only at real *verifying boundaries* — the bridge (node↔node calls carry a token the remote's identity block verifies). No service-role bypass; every write goes through the SECURITY DEFINER RPC catalog (inherited D8).

*Forbids:* lowest-common-denominator SQL in the name of database portability; clients holding any database or third-party auth material (single boundary: tm8-server).

## T-L12. One contract, many transports; honest mechanics

HTTP facade, CLI, and MCP tools are projections of one operation catalog — never parallel APIs. Inherited verbatim from the api-design corpus: canonical `WorkspaceEvent` as the only event shape any consumer sees; keyset cursors (uuidv7) everywhere; the closed error taxonomy; universal idempotency (`clientMutationId` + command ledger); capability discovery (`capabilities` + `/actions`); `501 not_implemented` as the honest feature gate. Server owns derived truth (blocked rollups, PullState, auto-tabs, counters, titles) — computed once, delivered identically to every consumer.

---

<!-- ======================= 02-NODE-AND-GATEWAY.md ======================= -->

# tm8 — Node, Workspace, and Gateway Architecture

**Status:** FINAL (2026-07-25) — amended per `07-ARCHITECTURE-REVIEW.md` (R1, R3, R4, R5, R6, R11, R12, Q1); verified per `08-AMENDMENT-VERIFICATION.md` (fixes F2, F4 applied). Defines the node model (T-L1), the container hierarchy, the gateway module, identity, and the canonical user flows.

---

## 1. Container hierarchy

```
NODE  (one tm8-server process; one machine or one hosted slot)
 └─ WORKSPACE  (the root container one server instance serves; one owner)
     └─ SPACES  (the collaboration + permission boundary; each has its entity graph,
        │        members, roles; visibility per T-L9)
     │    └─ entities / edges / messages / side tables
     └─ linked PROJECTS  (repos / working dirs) — many-to-many with spaces:
          a space can link multiple projects; a project can appear in multiple spaces.
          Projects are linked resources of a space, not containers.
```

- **Workspace** = what you see when you open tm8: your space list, your teammates, your sessions. One owner identity per workspace.
- **Space** = the unit of sharing. Inviting someone shares *a space*, nothing else. Local default: one space per project is a fine convention, but nothing enforces it — a space may span repos (a product spanning UI+server+cli repos is one space).
- Cross-space queries within one workspace replace old maestro's "master project" cross-project access.

## 2. The six blocks (T-L1) — responsibilities

| Block | Owns | Never does |
|---|---|---|
| **graph engine** | entity envelope + detail tables, edges, messages, counters, versions, activity, RPC invariants, RLS | transport, auth decisions beyond RLS, streaming |
| **db** | Postgres (bundled sidecar locally; managed instance on hubs); one schema, one migration sequence | dialect forks |
| **server** | HTTP facade (`/entities` grammar + closed `/commands/*`), WS bridge, WorkspaceEvent mapper, derived-truth assembly, rate/size limits, **identity/accounts** (account store, sessions, `can_act_as`, node-admin role — every composition [R1]) | privileged shortcuts around RLS |
| **execution** | PTY host, session spawn, manifests, terminal fan-out, work_session lifecycle | touching graph tables directly (contract only — the seam law, 04 §2) |
| **bridge** | outbound node↔node client: connect/authn to remotes, full-catalog reads/writes (RLS-scoped) [R3], pull, report-back, event subscribe, stream subscribe | writes outside the operation catalog; any automated write-back from a pulled projection (T-L6b) [R3] |
| **gateway** | node/workspace routing, relay, hosted-workspace spawner, remote-facing auth surface (fronts the server's identity block) [R1] | graph data of any kind; owning the primary account store (T-L8) |

## 3. Node roles are compositions, not modes

- **User C, normal:** graph+db+server+execution. His workspace, his sessions, fully offline-capable.
- **User C, gateway on:** + gateway block. His node now (a) authenticates other users, (b) exposes designated shared space(s), (c) can spin up **hosted workspaces** (process-per-user tm8-server instances — the validated maestro-gateway Design A pattern), (d) relays streams. C's own workspace is unchanged; he is additionally **node admin**.
- **Users A and B (laptop owners):** local nodes; bridge pointed at C. They see C's shared space *as a collab space* with pull/report-back.
- **User X (browser-only):** logs into C's gateway; acts **directly in** the hub's shared space (create, discuss, react — no pull, he has no second workspace). Optionally creates a **hosted workspace** on the hub, from which he can pull from the shared space like any node owner — the bridge is workspace↔workspace (T-L6), so hosting locality is irrelevant.

## 4. The gateway module

Recycles the existing `maestro-gateway` package (Trusted Hub, Design A, process-per-user; M1 validated) as tm8-gateway. Responsibilities:

1. **Remote-facing auth surface [R1].** Login endpoints for other people's clients and token exchange for bridge callers — authenticating against the **node's identity block** (which lives in the server block; accounts are node-local, v1 [T-D7]). Identity binds to Postgres per-transaction (T-L11/R2); no Firebase, no Supabase, anywhere in tm8 (T-D3).
2. **Routing.** Maps an authenticated user to: the hub's shared space(s), their hosted workspace (if any), and stream endpoints. Thin, mechanical.
3. **Hosted workspace spawner.** Provision/start/stop per-user tm8-server processes sharing the hub's Postgres cluster with **one database per workspace** (stronger isolation than schemas, same cluster — pinned per review Q1). Idle eviction (stop after N idle minutes; cold-start seconds behind the gateway is acceptable) + per-workspace resource caps. **Execution is disabled by default on hosted workspaces** — enabling it is a node-admin capability per workspace, never a space role [R5]: hosted execution is arbitrary code execution on the hub; process-per-user isolation is a start, not a sandbox.
4. **Relay.** Dumb-pipe forwarding of live streams (T-L10) and bridge traffic for unreachable home machines. No storage, no inspection.

**The hub trust model, explicit [R4]:** the hub operator is trusted — they administer the identity store and can technically act as any account homed on their node; the relay sees (but never stores) stream bytes. Cross-node actions are attributed but not cryptographically non-repudiable until portable identity (Phase 4). Choose your hub like you choose your git host. This is the documented Design A trade, not a vulnerability.

**Account lifecycle minimums [R6]:** *recovery* — node admin resets credentials (acceptable at invite scale; a hub is "accounts on a machine someone runs," not a public IdP). *Revocation* — disabling an account kills gateway sessions and bridge tokens; the member entity and authored history remain (graph actor-attribution is historical record). *Re-key compatibility* — `identity_id` is opaque and immutable; display names live elsewhere; `user@server` layers on later without rekeying `user_profiles`.

**Identity across nodes (v1):** credential-per-remote, the git-remotes model. A's identity on C's hub is an account *on C*; A's local node stores a token for C. Portable identity (`user@server`, key-based) is deferred with federation — addresses should be stored in a shape that can carry `user@server` later without rekeying.

## 5. The bridge protocol (v1 verbs, sketch)

Between a client workspace and a remote (home) server — same verbs whether the caller is a laptop node or a hosted workspace:

```
authn        login/token exchange with the remote's gateway (or direct node auth)
spaces       list spaces shared with me on the remote
subscribe    WorkspaceEvent stream for a remote space (scoped, resumable via event cursor)
walk/get     read a remote entity neighborhood (RLS-scoped, same DTOs)
create/patch full catalog mutations, RLS-scoped, expectedVersion honored [R3] — a remote
             member is a first-class member: create tasks, edit descriptions, check
             acceptance criteria, run commands, exactly as a local client would
pull         request projection of entity/subtree @version → local artifact + pulled edge (recorded on the REMOTE)
report-back  append: message / edge / status command / PR link (idempotent, clientMutationId)
fetch-blob   file bytes for attachments referenced by projections/entities (home-node
             storage, membership-checked; relayable) [R11]
stream       subscribe to an announced live media channel (terminal), possibly via relay
```

**The bridge carries the full operation catalog** — the bridge client is just another consumer surface (T-L12); the *projection discipline* (T-L6b) governs only the pulled-artifact relationship. Per-member state for a remote space (inbox, read marks) lives home-side and is queried over the same catalog ops; the UI's cross-space Inbox aggregates across connected remotes [R11]. **Subscription depth rule [R12]:** the local node holds remote data only in memory-bounded caches keyed by event cursor — reconnect resumes from cursor within the remote's retention window (7 days), else re-walks focused entities; nothing remote is ever written to the local Postgres except pull artifacts (explicit build products) and bridge bookkeeping. Durable replication of remote events is forbidden (multi-master by installments). P2P later = pointing the same client at a non-hub node; nothing new except reachability (relay) and portable identity.

## 6. Streams & terminal sharing (T-L10 applied)

- Session state (status, machine, task edges, progress messages) = `work_session` entity in the graph → visible to space members everywhere, renders as chip/card/panel like anything else.
- Live terminal = client connects to the session's **home server** WS; gateway relays if unreachable. Viewer authorization = graph check (space member + share enabled).
- Broadcast ("share my terminal to the space") = explicit act: flip share state on the work_session (command → WorkspaceEvent → LIVE chip everywhere), viewers attach to the existing PTY fan-out as additional subscribers. View-only vs drive (input) is a later permission tier on the same path.
- After exit: transcript artifact attached to the work_session entity; the stream is never stored.

---

<!-- ======================= 03-ENTITY-GRAPH-DELTAS.md ======================= -->

# tm8 — Entity Graph: Inherited Model + Deltas

**Status:** FINAL (2026-07-25) — amended per `07-ARCHITECTURE-REVIEW.md` (R2, R7, R8, R9, R10, R29 + team-affiliation note); verified per `08-AMENDMENT-VERIFICATION.md`. The Collab V2 entity-graph design is inherited as ground truth; this doc records only what tm8 **adds or changes**. Anything not mentioned here is adopted unchanged (envelope+detail pattern, homogeneous hierarchy, edges table + registry + `x:*`, unified messages, reactions as edges, points ledger, counters, version/activity, soft-delete subtree semantics, RLS posture, multi-axis tasks, acceptance criteria, completed-by award flow, asymmetric bridge, `depends_on` resolution, DEV-1..13).

Inherited normative docs: `COLLAB_V2_ENTITY_GRAPH_DESIGN.md`, `COLLAB_V2_GAPS_AND_EXTENSIONS.md`, `docs/collab-v2-api-design/01-DATA-MODEL.md` (final table catalog + migration sequence).

---

## 1. New core kinds (promoted from the gaps-doc backlog)

### 1.1 `work_session` (from C4) — the execution shadow

Detail: `(entity_id PK, node_id/home text, project_ref text, status text check (spawning|running|idle|exited|failed), agent_tool text, model text, started_at, exited_at, share_mode text default 'none' check (none|space|explicit), transcript_doc_id uuid null)`.

- Created by the execution block's spawn transaction; edges: `working_on → task`, spawned-by attribution via `created_by` (a `team_member` or `member`).
- Commands: the `execution.*` operation-catalog family — `execution.spawn`, `execution.prompt` (PTY delivery, see 04 §6), `execution.terminate`, `execution.streams.attach` [R10/R16]. `work_session.status` has a **single writer**: the execution block's transition function [R29].
- Timeline = messages + activity anchored to the entity (no bespoke timeline table).
- Live terminal per T-L10: `share_mode` is the graph-side announce/authorize state; bytes never touch the DB.
- Transcript on exit = a document entity `attached_to` the work_session (reviewable history without byte recording).

### 1.2 `collection` (from C1) — curated sets

Detail: `(entity_id PK, name, description, collection_type text default 'manual')` + `contains` edges (any entity, `props.position` for ordering). Absorbs old maestro's TaskList; also sprints/milestones/curated doc sets. Registered edge type: `contains (collection → any)`.

## 2. Custom entity kinds (T-L4) — new mechanism

```sql
CREATE TABLE entity_kinds (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),          -- surrogate PK [R7]
  kind        text NOT NULL,              -- namespaced for custom: 'c:design_asset'
  origin      text NOT NULL DEFAULT 'custom' CHECK (origin IN ('core','custom')),
  space_id    uuid REFERENCES spaces(id), -- custom kinds are space-scoped; core = NULL/global
  icon        text,
  field_schema jsonb NOT NULL DEFAULT '[]',  -- [{name, type: text|number|bool|date|enum, required, values[]}] — scalars ONLY [R8]
  capabilities jsonb NOT NULL DEFAULT '{}',  -- which universal caps are surfaced (all default on)
  created_by  uuid, created_at timestamptz DEFAULT now(),
  UNIQUE (space_id, kind)                                  -- two spaces may both define 'c:design_asset' [R7]
);
CREATE UNIQUE INDEX entity_kinds_core ON entity_kinds(kind) WHERE space_id IS NULL;  -- core kinds global-unique [R7]

CREATE TABLE custom_entities (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  fields    jsonb NOT NULL DEFAULT '{}'   -- validated against entity_kinds.field_schema on write (trigger)
);
```

- Envelope capabilities (hierarchy, edges, messages, reactions/points, collection views, panel tabs) work with zero additional wiring.
- Kind resolution is a two-step lookup: `(entity.space_id, kind)` falling back to the core row (`space_id IS NULL`); the envelope's kind-validation trigger does the same [R7]. Custom-kind entities never cross spaces; a `c:` kind pulled across the bridge arrives as its rendered projection, never as a registry import [R7].
- UI: the KindRegistry consumes `entity_kinds` rows and generates default renderers (Z2 = top schema fields; Z3 Content = field list; filters/group-by over jsonb, GIN-indexed). The registry must accept **runtime-registered kinds** (generated-renderer path) — a compile-time-only registry is insufficient (review §12).
- Guardrails: custom kinds are namespaced (`c:` prefix, mirroring `x:` edges); **no custom commands, no custom triggers**; promotion to a core kind (typed detail table, bespoke commands) is a migration.
- **Fields are scalars only in v1 [R8]** (`text|number|bool|date|enum`). There is no `entity_ref` field type: display-only refs would smuggle relations into jsonb (rebuild `assigneeUids[]` inside the mechanism T-L3 exists to kill), and auto-materialized edges import edge-lifecycle complexity into the part of the system meant to be dumb. **If a relation matters, it is an edge, full stop** — the custom-kind panel has the Connections rail for exactly this. Revisit only on demonstrated need.
- **Schema evolution [R9]:** edits are additive-or-relaxing by default (add field, widen enum, make optional); reads tolerate missing fields (render empty); a *tightening* edit (new required field, narrowed enum) is refused unless the space admin runs it as an explicit backfill action. Validation checks the current schema **on write only** — old rows are grandfathered until touched.

## 3. Old-maestro entity mapping (convergence table)

| agent-maestro | tm8 | Notes |
|---|---|---|
| Project | linked project resource on a space | many-to-many; project = repo/workingDir ref, not a container |
| Task (+TaskList order) | `task` (+`collection`) | hierarchy from envelope; assignment/deps as edges |
| Session | `work_session` + execution side tables | §1.1; timeline → anchored messages/activity |
| TeamMember | `team_member` | fields already mirrored in the collab schema |
| Team (leader + members, sub-teams) | `team_member` hierarchy | org-tree = the homogeneous parent mechanism; leader = parent. A strict tree cannot express membership in two teams: primary org line = hierarchy; secondary affiliation = a registered `member_of` (or `x:member_of`) edge (review §4) |
| Spell | `spell` | portable rule shape, lossless (inherited) |
| Skill | `skill` | markdown content (inherited) |
| Docs on sessions/tasks | `doc` + `attached_to` edges | |
| Modal/timeline/manifest bookkeeping | operational side tables | never entities (T-L3) |

## 4. Execution side tables (operational, T-L3)

- `session_manifests (work_session_id PK, manifest jsonb, created_at)` — the spawn manifest (prompt context, skills, permissions) as handed to the terminal; auditable, not graph data.
- `stream_grants (work_session_id, subject_identity, mode view|drive, granted_by, expires_at)` — explicit-share bookkeeping for T-L10 (only if `share_mode='explicit'` needs per-person grants; else omitted).
- `session_modals` — agents raise interactive modals mid-run over the runtime surface; operational side table + immediate-class WorkspaceEvent, never an entity; the compat adapter must carry the `modal` verbs [R29].

## 5. Auth-model delta

`user_profiles` is keyed by a **tm8 identity id** (opaque, immutable text; issued by the node's identity block [R1/R6]). The inherited D5 *posture* is kept — server-established identity, RLS as the sole authorization source, no service-role bypass — but the token step is replaced: tm8-server owns the Postgres connection, so identity binds per-transaction via `SET LOCAL` claims read by the RLS helpers; JWTs exist only at verifying boundaries (the bridge) [R2]. tm8-native accounts, no Firebase anywhere (supersedes Reading B within tm8; see `05-DECISIONS.md` T-D3). Presence/typing ride the WS bridge (no RTDB).

## 6. Storage delta

File blobs: local disk under the node's data dir (laptop) / object storage or disk on hubs, brokered by tm8-server signed routes; path convention `spaces/<spaceId>/…` with the same membership checks as the graph (inherited invariant: graph RLS and blob authz must never disagree). No Supabase Storage, no Firebase Storage.

---

<!-- ======================= 04-EXECUTION-TRANSPLANT.md ======================= -->

# tm8 — The Execution Transplant

**Status:** FINAL (2026-07-25) — amended per `07-ARCHITECTURE-REVIEW.md` (R16–R20, R27–R29; source-audit corrections applied); verified per `08-AMENDMENT-VERIFICATION.md`; **rewritten in place for AM-1/T-D21 (no Tauri — tm8 is server + web only; server-side PTY is the only spawn path)**. Execution (running agent sessions) is the one capability not specified by the Collab V2 corpus. The true lifts (PTY host, WS engine, terminal UI, prompt composition — audited portable) are **transplanted, never rewritten**; spawn/manifest is a **bounded re-authoring with the old code as behavioral spec** [R27]. This doc is the corrected inventory.

---

## 1. Transplant inventory

### 1.1 Lifts as-is (copy, keep the scars)

| Asset | Why it's load-bearing |
|---|---|
| **PTY host** (server-side pty management) | node-pty must run under **node, not bun** (onData never fires under bun; bun strips spawn-helper exec bit). 16ms output-frame coalescing. What was `MAESTRO_PTY_HOST=server` mode in old maestro is **the architecture** in tm8 (T-D21): all sessions spawn on the server PTY host — laptop, hub, and hosted workspaces are the same path; there is no client-side spawn. |
| **WS bridge** (batching, per-entity throttling, subscription filtering, immediate bypass for spawn/modal) | The *engine* lifts cleanly behind its event-bus seam. **Budgeted delta [R28]:** ~40% of the module (~150–190 LOC) is policy hard-wired to the old entity taxonomy — immediate-bypass lists, per-entity throttle tables, subscription families, namespace filtering — and is a deliberate small rewrite (~200 LOC) against the WorkspaceEvent + `work_session` vocabulary. Semantically load-bearing (spawn/modal immediacy is what makes the desktop feel right). One socket per client for graph events *and* stream frames. |
| **Terminal UI components** (browser app) | xterm setup, write scheduler, WebGL renderer on Chromium with DOM fallback, unmount-terminals-of-exited-sessions memory work, bounded log strips. tm8 is web-only (T-D21); the lifted renderer path is the one old maestro already shipped on web. |
| **Spawn wire contract** | The `session:spawn` payload shape (session, command, cwd, envVars, manifest path, ids, spawn provenance) is preserved **verbatim** as the internal server→UI contract [R29]: the server PTY host executes the spawn, the UI receives the event over the WS bridge and attaches a terminal to the session's stream, and CLI `worker init` boots the agent inside the server-hosted PTY. (Old maestro's Tauri-side spawn handler is **not** transplanted — T-D21 removed the client-spawn path entirely.) |

### 1.2 Re-authored with behavioral parity — bounded build, NOT a lift [R27]

**Spawn + manifest composition.** *Corrected per the source audit (07 §8):* there is no spawn *service* to transplant. Today's flow is an ~850-LOC inline route reading **seven** entity types (sessions, tasks, team members, model profiles, project, team, spells), performing git side effects (worktrees), applying a ~5-level launch-config precedence chain + permission-mode inheritance + coordinator/sub-team re-rooting, with a hardcoded 27-entry model-power table — and manifest composition runs as a **CLI subprocess reading `~/.maestro/data` files directly** (the route `flush()`es repos to feed it), duplicating the launch/permission logic verbatim.

The tm8 plan: **write a real `SpawnService` in the execution block implementing the behavioral spec that the old code constitutes** — precedence chains, coordinator/sub-team resolution, worktree flow, spell injection — against graph reads through the contract, with manifest composition moved **in-process** (killing the subprocess + shared-disk pipeline and the flush hack; the CLI keeps only manifest *reading*). The model-power ranking becomes model-profile **data** (one place, not two). Bounded, well-understood work: **~1,500–2,000 LOC planned as a build, not budgeted as a lift.** Target shape:

```
spawn(taskIds, teamMemberId, mode) — one transaction through the contract:
 1. read task / team_member / space entities (graph reads; all needed fields exist:
    identity, mode, permission_mode, command_permissions, model, agent_tool)
 2. create work_session entity + working_on edge(s); created_by = spawning actor
 3. compose manifest (prompt context, skills, spells, permissions) → session_manifests side table
 4. emit spawn_request over the WS bridge (immediate-bypass class, as today)
 5. terminal boots → CLI reads manifest → agent runs
```

Report-back writes become graph appends: progress → messages anchored to the work_session/task; status → work commands; PR → link-pr command. Session timeline is retired in favor of anchored messages + activity (inherited law: one message shape).

**Single-writer status [R29]:** today session status has 3+ independent writers (create route, PTY host on exit, stop route, agent-side REST flips). In tm8 every transition funnels through one function in the execution block → one command → one WorkspaceEvent. **Preserved integration shape [R29]:** the `session:spawn` payload (session, command, cwd, envVars, manifest path, ids, spawn provenance) is preserved verbatim as the server→UI wire contract; spawn executes on the server PTY host (T-D21), the UI only attaches. **Status chattiness [R20]:** idle-detection flapping is debounced in the execution block *before* touching the graph — status is graph state; keystroke-grade liveness never becomes entity writes. **Skills/spells feed the manifest from the graph [R19]:** the spawn transaction renders `equips`-edged spell/skill content into the manifest (replacing filesystem scope-loading); the hardened spell *engine* (gating, ensembles, notify) is homed in the **server block** as a WorkspaceEvent-driven service (see 06, "Homes for the completeness holes").

### 1.3 Replaced (deliberately)

**The agent-facing CLI surface.** Agents speak the **graph CLI** (`walk`, `get`, `list`, `message send`, `edge add`, `pull`, `task status/complete`, `pr link` — the inherited `03-CONSUMER-SURFACES` tree), space-scoped via pinned spaceId. A **compat adapter** maps the old verbs onto graph ops during transition so existing skills/spells/prompts keep working. *Corrected scope [R18]:* the audited runtime surface is ~54 REST endpoints / ~7,800 LOC — the adapter is **the worker + coordinator core loop, not six report verbs**. Frozen v1 list (pending the prompt-corpus grep): **task report \*** , **task create/edit/get/list/children/tree**, **task docs add**, **session report \***, **session prompt**, **session siblings**, **session spawn** (coordinators spawn workers — depends on `execution.spawn`, §5), **team-member list/get**, **modal** [R29], **whoami/status**. Spell/modal-show/master verbs migrate natively to graph grammar (coordinator-facing, re-promptable; `master` cross-project → cross-space queries).

| Old verb | Graph op |
|---|---|
| `maestro task report progress <id> "…"` | message anchored to task (+activity) |
| `maestro task report complete <id> "…"` | `commands/work` → in_review/done + message |
| `maestro task create/edit/get/list/…` | `entities.create/patch/get`, `collections.query` |
| `maestro session report …` | message anchored to own work_session + status |
| `maestro session prompt <id> --message` | **`execution.prompt` — PTY delivery, not just a message [R17]**: see §6 |
| `maestro session spawn …` | `execution.spawn` [R16/R18] |
| `maestro session siblings` | collection query: work_sessions in space |
| `maestro task docs add` | create doc + `attached_to` edge |
| `maestro modal …` | session_modals side table ops + immediate-class event [R29] |

The adapter is sugar over the operation catalog (T-L12) and ages out as prompts migrate to the graph grammar.

## 2. The seam law

**The execution block talks to the graph only through the contract** — spawn reads entities via the service layer, runtime emits WorkspaceEvents, report-back writes messages/edges/commands. It never reaches into tables and never smuggles a Session-shaped blob into the graph. This seam is what makes execution a *block* (T-L1) rather than a second data model.

## 3. Streams (restating T-L10 operationally)

- PTY frames: PTY → tm8-server fan-out → WS → terminal component. Multiple subscribers already supported (multi-window today); sharing = non-owner subscribers admitted after a graph authorization check.
- The DB is in the path only for: work_session status transitions, share_mode changes, transcript artifact on exit. Frame traffic never touches it.
- Remote viewing: viewer → session's home server (direct or via gateway relay). Hosted workspaces: the PTY host runs on the hub slot; identical path.

## 4. Carried operational lessons (verbatim into tm8's engineering notes)

- Run the server's PTY code under node; never bun (node-pty incompatibilities).
- Never run parallel UI builds (vite SIGTERM storm); verify with scoped `tsc -b`.
- WebGL xterm renderer on Chromium, DOM fallback otherwise (tm8 is browser-only per T-D21; the old Tauri addon-crash lesson survives as: never assume a GPU renderer, always keep the DOM fallback).
- Server test suites: `--forceExit` (open-handle hangs).
- Terminal perf: coalesce PTY output into 16ms frames server-side; bound client-side log memory; unmount exited terminals.
- Spawned workers get bypass permissions (no prompt stalls); parallel workers need disjoint working trees (worktree-per-worker or package-disjoint scopes).

## 5. The execution operation family [R16]

The inherited operation catalog has zero execution verbs; tm8 extends it with an `execution.*` family, designed now so CLI/MCP/UI projections stay T-L12-clean and `capabilities`/`/actions` can honestly gate them (`501 not_implemented` on nodes with execution disabled — the T-L1 composition story depends on this):

```
execution.spawn        create work_session + working_on edges + manifest + spawn_request (the R27 SpawnService)
execution.prompt       deliver text INTO a live session's PTY (§6)
execution.terminate    stop a session (single-writer transition, R29)
execution.streams.attach   subscribe to the PTY fan-out (view; drive = later permission tier)
```

## 6. `session prompt` is a delivery mechanism, not a message [R17]

Today `maestro session prompt <id> --message` *injects text into the target session's PTY* — it makes an agent act. An anchored message is inert unless something delivers it. tm8 specifies the mechanism: the execution block, for each live work_session it hosts, subscribes to `execution.prompt` commands (and/or messages anchored to that session flagged for delivery) and **injects into the PTY, marking delivery**. Without this, every coordinator↔worker protocol breaks *silently* — messages land in the graph, agents never see them. This is the single most dangerous silent-failure seam in the transplant; it is a named v1 requirement, not an option.

## 7. What v1 execution parity means (acceptance)

tm8 v1 replaces local maestro when: spawn from a task (any team_member persona, any mode) → terminal opens → agent boots with correct manifest/prompt → progress/report-back lands in the graph → session card/panel reflects live status → exit produces transcript artifact → all with terminal latency and stability at parity with current maestro (the perf work is the regression bar, not an aspiration).

---

<!-- ======================= 05-DECISIONS.md ======================= -->

# tm8 — Decision Log

**Status:** FINAL (2026-07-25) — adjudicated per T-D20; verified per `08-AMENDMENT-VERIFICATION.md` (fixes F1, F3 applied). T-D* = decisions from the 2026-07-25 unification discussion (user + design session `sess_1784931993141_0y6d4fs4v`). Inherited decisions from the Collab V2 api-design corpus (D1–D12, DEV-1..13) remain binding except where a T-D row explicitly supersedes.

| # | Decision | Rationale / consequences |
|---|---|---|
| T-D1 | **New repository `tm8`; the Collab V2 UI becomes the whole UI; the entity graph becomes the only product model.** agent-maestro is the predecessor and organ donor, not the convergence target. | The blueprint lives in docs, the seed code (UI module, schema, gateway) was built liftable, the old repo fights the vision (file repos, 23 stores, V1 collab). |
| T-D2 | **One node binary, six blocks** (graph, db, server, execution, bridge, gateway); deployments are compositions (T-L1). | Kills the local/collab product split. "Local vs hub vs peer" become configurations. |
| T-D3 | **No Firebase, no Supabase, anywhere in tm8. Postgres owned by tm8-server; tm8-native identity.** Supersedes Reading B *within tm8 scope* (Reading B remains correct for the interim Collab V2 on maestro, if/while that ships). The inherited D5 **posture** is kept — server-established identity, RLS as the sole authorization source, no service-role bypass — with the mechanism per R2: per-transaction `SET LOCAL` identity claims (tm8-server owns the connection); JWTs only at verifying boundaries (the bridge). | User directive ("remove firebase and supabase completely"). Invite-based accounts on own/hub nodes are small; Firebase earns its keep only at public-signup scale. |
| T-D4 | **Single-homed spaces** (T-L5); hub and P2P are one protocol at different topologies; **v1 is hub-only**, federation additive later. | Avoids multi-master/CRDT permanently; the asymmetric bridge is the federation primitive. |
| T-D5 | **The bridge is workspace↔workspace, not machine↔machine** (T-L6). Browser users act directly in a graph (no pull); hosted workspaces pull from co-located spaces via the same protocol. | From the user-X flow; makes hosting locality irrelevant and the protocol single. |
| T-D6 | **Gateway = routing + relay + hosted-workspace spawner + remote-facing auth surface (fronting the server's identity block), recycling maestro-gateway Design A — never graph data, never the primary account store [R1]** (T-L8). Hub's collab space = ordinary space in the hub's ordinary workspace. | Prevents a second data model; reuses validated process-per-user work. |
| T-D7 | **Identity v1 is node-local** (accounts live on the node/hub; credential-per-remote, git-remotes model). Portable `user@server` identity deferred with federation, address shape kept compatible. | Defers the Matrix/ActivityPub tarpit without foreclosing it. |
| T-D8 | **Space membership is always the visibility boundary** (T-L9); hub-wide visibility is a default policy on the hub's shared space (auto-membership), not architecture. | One rule for local, hub, private spaces. |
| T-D9 | **Auth always on; local = one-member degenerate case of the same machinery** (T-L7). Node admin (accounts/limits) ≠ space roles (owner/admin/member). | No second code path; symmetry cannot rot. |
| T-D10 | **Graph-core + side tables** (T-L3): ledgers, per-member state, config, operational tables are legitimate; entity test = "do the four capabilities pay rent"; edges are the only relation mechanism. | Codifies existing corpus practice (point_events, read_marks, saved_views…). |
| T-D11 | **Custom entity kinds**: `entity_kinds` registry as data + shared jsonb detail table, schema-validated; all universal capabilities free at the envelope; namespaced (`c:`); no custom commands/triggers; promotion to core = migration (T-L4). | The Notion-databases move grounded in the graph; mirrors `x:` edge-type promotion. |
| T-D12 | **Streams invariant** (T-L10): live media announced/authorized through the graph, delivered peer↔home-server over the WS bridge, gateway relays as dumb pipe, never stored. Terminal *sharing/broadcast* = explicit act, later feature, same skeleton. Session record = transcript artifact, not byte recording. | Keeps the DB out of hot paths; coheres today's terminals with future screen-share-like features. |
| T-D13 | **Contract is the seam; Postgres is the implementation** (T-L11). Local = bundled native Postgres sidecar managed by tm8-server; PGlite = watched fallback; SQLite port rejected. | "Any database" abstraction forfeits triggers/CTEs/GIN/RLS — the machinery the design leans on. One code path laptop↔hub. |
| T-D14 | **tm8 v1 scope = graph engine + execution** — a full local-maestro replacement that is natively a collab space. *Amended per R21/R27:* v1 is honestly **one from-contract build** (the graph engine + facade, implementing the api-design contract fresh with the branch as crib) **+ one transplant** (execution: PTY host, WS engine, terminal UI, prompt composition lift as-is — client-spawn/Tauri path excluded per T-D21; spawn/manifest is a bounded ~1.5–2k-LOC re-authoring with the old code as behavioral spec). Old-maestro bridge/coexistence is a migration convenience, not a required phase. | The audited lifts carry the scar tissue; the re-authoring is bounded and well-specified (04 §1.2). |
| T-D15 | **Agent CLI = the graph CLI** (space-scoped, inherited command tree) + a **compat adapter covering the worker+coordinator core loop** (the R18 frozen list in 04 §1.3 — incl. `session spawn` and `modal`) as sugar over graph ops, aging out as prompts migrate. | Protects every tuned prompt/skill through transition; scope corrected per R18 (the runtime surface is ~54 endpoints, not six verbs). |
| T-D16 | **Full superset everywhere**: local spaces get channels, points, leaderboards — the local UI is literally the collab UI with one member. One KindRegistry, one code path. | An empty channel costs nothing; trimmed registries rot the symmetry. |
| T-D17 | **Space ↔ projects is many-to-many**; workspace = root container of one server instance (one owner); space = sharing/permission boundary; projects = linked resources. Supersedes "one space per project" (remains the sensible local default convention). | |
| T-D18 | **In-flight work disposition**: Atlas's UI waves run to completion in the current worktree, then the module transplants to tm8-ui (built self-contained for exactly this). The api-design docs are inherited as tm8's API contract (s/maestro-server/tm8-server/ + T-D3 auth delta). The backend branch is *reference*; tm8 re-derives a clean migration sequence per api-design 01 §11 (no UID-bypass history, no Supabase-auth assumptions). Collab V1 Firestore retires with old maestro. | Nothing in flight is wasted; the branch's toxic history (bypass migration) never enters the new repo. |
| T-D19 | **Architecture review gate before implementation**: a Fable 5 reviewer session reads the full corpus + this doc set and challenges it; implementation planning for the tm8 repo begins only after the review is resolved and the architecture is finalized. | User directive, 2026-07-25. |
| T-D22 | **AM-2 (2026-07-25): the user-sanctioned implementation review (sess_1784945489792_14ws8ejrk, CONDITIONAL GO) is adopted.** Substance: (a) **contract amendments before migration freeze** — first-class `projects` resource (`space_projects` + `projects.*` operations), `files.*` blob-lifecycle operations, WorkspaceEvent gains a common envelope `{spaceId, seq, occurredAt, schemaVersion, clientMutationId}`, execution-governance minimums; (b) **`10-SECURITY-MODEL.md`** threat model (Vega-authored, adopted into the master corpus as doc 10; tm8 copy is source): loopback-only default bind, Host allowlist vs DNS rebinding, WS Origin checks, CSRF posture, CLI/agent bearer tokens scoped to team_member identity, spawn-path discipline (server-computed cwd, symlink-resolved containment), project trust levels, prompt-injection containment via server-side per-persona command permissions, secrets-never-in-Postgres, blob path/checksum/nosniff, backup incl. blobs with tested restore, 7-point scripted acceptance folded into gate G1A; (c) **sequencing restructure** — Phase 1A vertical slice (space+project → task → spawn server PTY → prompt delivery → progress → PR link → complete+transcript → restart/recovery, with security + perf acceptance) BEFORE platform completeness; 1B adds channels/collections/custom kinds/points + basic Postgres FTS behind `search.query` (**partially un-defers D12/DEV-13: search enters at 1B as Postgres FTS**, palette upgrade accordingly) + minimal old-maestro import. Full normative text in tm8/STATE.md. | Reviewer-driven; user-sanctioned. Master corpus records the decision; tm8 STATE.md carries the running detail. |
| T-D21 | **AM-1 (user-directed, mid-W0, 2026-07-25): NO TAURI — tm8 is server + web only.** `apps/desktop` dropped from the scaffold. The server-side PTY host is the **only** spawn path (the `session:spawn` payload contract is preserved verbatim on the server path per R29 — it becomes an internal server↔UI contract, no longer a Tauri handler shape). The UI is a browser app: Vite dev on 4611, production bundle served by tm8-server on 4610. Terminal rendering: xterm WebGL on Chromium + DOM fallback, unmount-exited-terminals, bounded log memory (the Tauri/StrictMode WebGL caveat is moot; the web renderer path is the one that already shipped in old maestro). Consequences: 04's "Tauri shell + spawn plumbing" lift row is void; Draco's lift scope = PTY host + terminal components only; `MAESTRO_PTY_HOST=server` stops being a mode and becomes the architecture; mobile (Phase 3) and hosted workspaces (Phase 2) are strengthened (they always needed the server path). G3 terminal-parity bar unchanged. Recorded in tm8/STATE.md by Vega; master corpus updated here. | Simplifies distribution (no app bundling/signing), one spawn path instead of two, browser-first matches the hub/thin-client future. |
| T-D20 | **Review adjudication (2026-07-25):** `07-ARCHITECTURE-REVIEW.md` verdict GO accepted. **R1–R13, R15–R29 accepted** and folded into docs 00–06 (amendment markers `[Rn]` inline). **R14 (push-notification transport) DEFERRED by the user** — the outbox stays transport-agnostic (`channel` column, workers per transport); no transport is chosen now; nothing in v1 needs one (local nodes use in-app + OS-native desktop notifications). A second Fable 5 reviewer verifies the amendments before the doc set is stamped FINAL. Key doc-changing accepts: R1 (identity into the server block, every composition), R2 (per-transaction identity claims; JWTs only at bridge boundaries), R3 (bridge carries the full catalog; asymmetry binds the pulled-projection discipline), R7–R9 (custom-kind keying/scalars-only/schema-evolution), R16–R18 (`execution.*` catalog family; `session prompt` = PTY delivery; adapter = worker+coordinator core loop), R21 (v1 = one from-contract build + one transplant; M1–M3), R27–R29 (spawn/manifest re-authoring; WS-policy re-map; single-writer status). | Amendments applied by sess_1784931993141_0y6d4fs4v; verification reviewer to confirm fidelity. |

---

<!-- ======================= 06-SEQUENCING-AND-REVIEW.md ======================= -->

# tm8 — Sequencing, Repo Shape, and the Review Charter

**Status:** FINAL (2026-07-25) — amended per `07-ARCHITECTURE-REVIEW.md`; verified per `08-AMENDMENT-VERIFICATION.md` (fixes F1–F6 applied). Phasing at the architecture level (the detailed implementation plan is written only AFTER the review gate, per T-D19), the new repo's shape, disposition of in-flight work, and the review record.

## Homes for the completeness holes (R22–R26)

Push dispatcher = hub-side worker, Phase 2+, transport deferred (T-D20). Mobile = thin client, Phase 3 (R23). **Spell engine** = server-block service, WorkspaceEvent-driven, over graph entities; operational side tables per T-L3 — without this, "spells" would silently mean inert documents (R24). **Workspace-scope queries** = a workspace-level collections variant (`spaceId:'*'` or `workspace.collections.query`) for Home-across-spaces + the far-left Inbox (R25). **One scheduler** in the server block for reminders, spell schedules, and all retention jobs — command-ledger TTL, event pruning, soft-delete purge (R26).

---

## 1. Phases (architecture-level)

**Phase 1 — tm8 v1: the node (one from-contract build + one transplant) [R21].**
Scope: graph engine on Postgres (clean migration sequence re-derived from api-design 01 §11 + tm8 deltas: work_session, collection, entity_kinds/custom_entities, native identity, `execution.*` catalog family) — this is a **full implementation of the api-design contract written fresh with the branch as a crib** (the branch lacks walk, EntityDetail projection, delete/restore, invites, saved views, leaderboard, versions-read, link-pr, event push, universal idempotency); tm8-server facade (entities grammar, commands, WorkspaceEvent over WS, keyset cursors, error taxonomy, command ledger); bundled Postgres sidecar (R15 operational rules: pinned major, backup-before-migrate, pg_dump export, PG18+/vendored uuidv7); execution per 04 (lifts + R27 SpawnService re-authoring + R17 prompt delivery + R28 WS-policy re-map); graph CLI + R18 compat adapter; tm8-ui = transplanted Collab V2 module + terminal components as a browser app served by tm8-server (T-D21 — no Tauri, no desktop shell); single-user auth (auto-owner). Sequencing within Phase 1 is restructured by T-D22: Phase 1A vertical slice first, 1B platform completeness (normative order in tm8/STATE.md).
Internal milestones [R21]: **M1** — graph engine passes a **headless contract conformance suite** (the UI build's mock-facade contract tests, re-pointed at tm8-server: a real inherited asset, treated as a deliverable). **M2** — tm8-ui swaps MockFacade→real facade (adapter-only per T-D18). **M3** — execution to 04 §7 parity.
Acceptance: 04 §7 execution parity + the five golden workflows from the UI brief running against the real backend (not mock).

**Phase 2 — the hub: gateway module.**
Remote-facing auth (against the server's identity block, R1), routing, hosted workspaces (Design A port; per-workspace databases; **execution off by default**, node-admin enable — R5), shared space with auto-membership policy, relay, bridge v1 verbs (02 §5, full-catalog per R3 + fetch-blob per R11) between laptop nodes and the hub, user-X browser flow, space export/import (Q7 — the single-homed trust backstop), push-notification dispatcher slot (transport deferred per T-D20/R14). Terminal remote viewing (view-only) behind explicit share.

**Phase 3 — depth & migration.**
Old-maestro data migration (tasks/team members/spells/skills/docs → graph; sessions → historical work_sessions), old maestro retirement, points/leaderboard polish, custom-kind UX maturation, broadcast/drive permission tier, **mobile** (maestro-mobile becomes a thin client of the contract + server-hosted PTY mode — R23).

**Phase 4 — federation.**
P2P (bridge pointed at non-hub nodes), portable identity (`user@server`), relay traversal. Additive by construction (T-D4/5/7).

## 2. tm8 repo shape (proposed, for the implementation plan to refine)

```
tm8/  (bun workspace monorepo)
  packages/contract/    types + zod schemas + operation catalog (the law; consumed by all)
  packages/server/      graph engine, facade, WS bridge, event mapper, sidecar mgmt   [node runtime for PTY]
  packages/execution/   PTY host, spawn service, manifests (transplanted)
  packages/gateway/     phase 2 (ported maestro-gateway Design A)
  packages/cli/         graph CLI + worker compat adapter
  packages/ui/          the entity-component UI (transplanted collab-v2 module) + terminal components
  db/migrations/        one clean sequence (no legacy history)
  docs/                 this doc set + inherited corpus snapshot
```

## 3. In-flight work disposition (T-D18)

| Workstream | Disposition |
|---|---|
| Atlas UI build (W0–W5, feat/collab-v2-ui) | **Continue to completion**; transplant module to `packages/ui` afterward. Contract deviations DEV-1..13 stay binding on the mock facade so the swap to tm8-server is adapter-only. |
| api-design docs (00–05) | Inherited as tm8's API contract; read with tm8-server substitution + T-D3 auth delta. |
| feat/collab-v2-supabase-backend | Reference implementation to crib from; **not merged**. Clean re-derived migrations; UID-bypass history never enters tm8. |
| maestro-gateway (Trusted Hub) | Ported in Phase 2. |
| Bedrock (infra/secrets/system HLD) | Inputs to Phase 1 infra decisions (hub hosting, Postgres provisioning). |
| Collab V1 Firestore | Keeps running on old maestro; retires in Phase 3. |

## 4. Open questions — RESOLVED per review §10 (positions adopted)

1. **Hosted-workspace economics** → process-per-user holds to ~10–20 active; constraint is memory + connections. Per-workspace **databases** (pinned), idle eviction, resource caps, execution off by default (R5). At 50 mostly-idle: fine; otherwise split the hub — documented, not architected-for.
2. **Bridge subscription depth** → remote-live + memory-bounded cache keyed by event cursor; cursor-resume within retention window, else re-walk. **No durable replication, ever** (R12).
3. **Custom-kind `entity_ref`** → dropped from v1; scalars only; relations are edges (R8).
4. **Compat adapter surface** → the worker+coordinator core loop incl. `session spawn` (R18 frozen list); prompt-corpus grep re-run during implementation planning before final freeze.
5. **Sidecar Postgres** → R15 rules adopted (pin major, backup-before-migrate dump/restore, scheduled pg_dump, PG18+/vendored uuidv7, single-instance locking, distinct dual-stack data dirs); PGlite trigger = **distribution failure only**, never schema-forking.
6. **Points economy** → confirmed non-blocking: scarcity/budgets = config side table + RPC guard; C8 rollup = leaderboard query variant. Product design post-v1.
7. **Space export** → yes, Phase 2 (trust backstop for single-homing); export manifest includes side tables + custom `entity_kinds` rows + blobs; identity remaps on rehome (R13).

**Deferred by the user (T-D20):** push-notification transport (R14) — outbox transport-agnostic; decision later.

## 5. Review charter (for the Fable 5 architecture reviewer)

**Mandate:** adversarial architecture review of this doc set against the inherited corpus, BEFORE any implementation planning. The bar: would you bet the product on these laws?

Read, in order: `docs/tm8-architecture/00–06` (this set) → `docs/collab-v2-api-design/00–05` (main) → branch docs via `git show feat/collab-v2-supabase-backend:docs/COLLAB_V2_ENTITY_GRAPH_DESIGN.md` (+ `_GAPS_AND_EXTENSIONS`, `_UI_UX_BRIEF`, `_UI_DATA_CONTRACT`) → `docs/collab-v2-ui-plan/01,02`.

Challenge specifically:
- **Law coherence**: do T-L1..12 contradict each other or the inherited corpus anywhere? Is any law under-specified enough to permit divergent implementations?
- **The gateway/identity split** (T-L8, T-D3/6/7): does node-local identity + hosted workspaces + relay actually compose? Where does account lifecycle (recovery, revocation, hub-admin abuse) bite?
- **The execution seam** (04 §2): is "contract-only" access truly sufficient for spawn/manifest/report-back, or does any real flow force a table-level backdoor?
- **The bridge** (T-L6, 02 §5): are the v1 verbs complete for the golden workflows across nodes? Does anything in pull/report-back secretly require field sync?
- **Custom kinds** (T-D11): jsonb+schema vs the four capabilities — failure modes (validation drift, query performance, migration-on-promotion)?
- **Single-homed spaces** (T-D4): what legitimately-wanted feature does this foreclose (offline multi-writer? space migration between homes?) and is the answer acceptable?
- **Sequencing realism** (T-D14): is v1 = graph+execution honestly a transplant, or is there hidden rewrite surface (audit the spawn-flow inventory in 04 against the actual maestro-server code)?
- **Completeness**: what has NO home in this architecture (notifications at hub scale? mobile? spell triggers/automation? backup)?

**Output:** a review doc `docs/tm8-architecture/07-ARCHITECTURE-REVIEW.md` with verdicts per area (SOUND / SOUND-WITH-CHANGES / UNSOUND + argument), concrete change proposals for every non-SOUND verdict, and a final go/no-go recommendation for proceeding to implementation planning. Review only — do not modify docs 00–06; propose diffs in the review doc.

---

<!-- ======================= 07-ARCHITECTURE-REVIEW.md ======================= -->

# tm8 — Architecture Review (T-D19 gate)

**Status:** Final
**Date:** 2026-07-25
**Reviewer:** Fable 5 architecture review session (`sess_1784939973807_vy08zex25`, task `task_1784939944781_0gc35ww96`)
**Charter:** `06-SEQUENCING-AND-REVIEW.md` §5. Corpus reviewed: tm8 docs 00–06; `docs/collab-v2-api-design/00–05`; branch docs (`COLLAB_V2_ENTITY_GRAPH_DESIGN`, `_GAPS_AND_EXTENSIONS`, `_UI_UX_BRIEF`, `_UI_DATA_CONTRACT` @ `feat/collab-v2-supabase-backend`); `docs/collab-v2-ui-plan/01–02`; plus a source-level audit of the maestro-server / maestro-cli execution code against the 04 inventory.
**Rule respected:** docs 00–06 are unmodified; every proposal lives here. Proposals are numbered **R1…** for traceability into the implementation plan.

---

## 0. Verdict summary

| # | Area | Verdict |
|---|---|---|
| 1 | Vision & new-repo strategy (00, T-D1) | **SOUND** |
| 2 | Law coherence (T-L1…T-L12) | **SOUND-WITH-CHANGES** (R1–R3) |
| 3 | Node / gateway / identity (02, T-D6/7/9) | **SOUND-WITH-CHANGES** (R1, R4–R6) |
| 4 | Entity-graph deltas (03) | **SOUND-WITH-CHANGES** (R7–R10) |
| 5 | Bridge protocol (T-L6, 02 §5) | **SOUND-WITH-CHANGES** (R3, R11–R12) |
| 6 | Single-homed spaces (T-L5, T-D4) | **SOUND** (statements R13) |
| 7 | Auth & storage deltas (T-D3, T-D13, 03 §5–6) | **SOUND-WITH-CHANGES** (R2, R14–R15) |
| 8 | Execution transplant & seam (04, T-D14) | **SOUND-WITH-CHANGES** (R16–R20, R27–R29) — PTY/terminal/prompt-composition claims verified portable; the spawn/manifest "one seam" claim is **understated** (it is a bounded re-authoring, not a lift) |
| 9 | Sequencing & v1 scope (06 §1, T-D14/18) | **SOUND-WITH-CHANGES** (R21) |
| 10 | Completeness | Holes enumerated in §11 (R22–R26) — none foundation-breaking; all need homes before the implementation plan freezes scope |

**Final recommendation: GO** — proceed to implementation planning once the R-changes are accepted into the doc set (an afternoon of edits, not a redesign). Argument in §13.

The bar applied throughout: *would I bet the product on this law as written?* Where the answer is "yes as intended, no as written," the verdict is SOUND-WITH-CHANGES and the change makes the writing match the intent.

---

## 1. Vision & new-repo strategy — SOUND

The three-part argument for a new repo (00 §2) survives adversarial reading:

1. **"The blueprint lives in documents, not legacy code"** is verifiably true. The api-design corpus is a genuinely complete contract — operation catalog, DTOs, event taxonomy, error taxonomy, idempotency, auth flow, coverage matrix with per-family implementation status. I checked the coherence matrix (05 §1–2) against the UI brief's surfaces and the CLI tree: no surface lacks an operation mapping. This is the strongest asset tm8 has, and it is the thing most rewrites lack.
2. **The seed code was built liftable.** The in-flight UI build (ui-plan 01–02) enforces self-containment structurally (own tokens, own stores, facade seam, "screens import only downward," kind registry) and the orchestration plan enforces it in review. The transplant premise for the UI is credible *provided* the mock facade stays bound to DEV-1..13 (T-D18 already requires this).
3. **The old repo fights the vision** — accurate. File-JSON repos and 23 stores are not a foundation for an entity graph; converging in-place would mean maintaining two data models indefinitely, which is exactly the failure T-L3 exists to prevent.

One vision-level observation, not a defect: 00 §1's "the graph is the UI" and 04's "terminal latency at parity" pull in different directions during v1 (entity-component discipline vs. raw PTY throughput). The doc set already resolves this correctly — T-L10 keeps streams off the graph path — but the implementation plan should treat terminal surfaces as *explicitly exempt* from the entity-component contract at the frame level (the `work_session` panel is an entity component; the xterm canvas inside it is not). Worth one sentence in 01-LAWS to prevent a purist misreading. *(Folded into R16.)*

## 2. Law coherence (T-L1…T-L12) — SOUND-WITH-CHANGES

The twelve laws are mutually consistent in intent. Three places where the written form either contradicts a sibling doc or under-specifies enough to permit divergent implementations:

### 2.1 Where does the identity store live? (T-L1 vs T-L7 vs T-L8) — the one genuine contradiction

- T-L1's composition table gives the **local desktop no gateway block**.
- T-L7 says **every node** runs the full identity/membership/`can_act_as` machinery ("local is the degenerate case").
- T-L8 and 02 §4.1 say **the gateway owns the account/session store** ("the gateway's identity store holds accounts on this node").

These cannot all be true: a gateway-less local node must still hold its owner's account (T-L7), but the account store is defined as gateway property (T-L8), and the local composition has no gateway (T-L1). As written, an implementer can legitimately build identity into the gateway package (breaking local), into the server (breaking T-L8's ownership claim), or duplicate it (breaking T-L7's "no second code path").

**R1 — Split identity out of the gateway.** Redefine the blocks: **identity/accounts is a core server concern present in every composition** (the account store, sessions, `can_act_as`, node-admin role — this is what T-L7 already implies), and the **gateway is routing + relay + hosted-workspace spawner + the *remote-facing* auth surface** (login endpoints for other people's clients, token exchange for bridge callers). T-L8 becomes: "the gateway owns **routing and relay** only — never graph data *and never the primary account store*; it authenticates against the node's identity block." This is also truer to the maestro-gateway Design A code being recycled (auth fronting + process management, not an account database of its own). One-line consequential edit to T-L1's table: identity is inside `server`, all compositions.

### 2.2 "Server-minted JWTs" is Supabase residue (T-L11, T-D3, 03 §5)

The inherited D5 flow mints an HS256 JWT because **Supabase** sits between maestro-server and Postgres and needs a token to verify (api-design 04 §6.1a is explicit that the mechanism exists for Supabase's verifier). In tm8 there is no Supabase: tm8-server owns the Postgres connection. Minting a JWT to hand to *yourself* is ceremony — unless the design intends to keep PostgREST as an internal component, which no tm8 doc says (02 §2 of api-design mentions PostgREST reads, but that is the *maestro* implementation being described, not a tm8 commitment).

The law's intent — **RLS is the authorization source; the server adds no privileged shortcut** — is right and must survive. The mechanism should be stated in Postgres-native terms:

**R2 — Specify identity binding as per-transaction GUC claims, not token minting.** tm8-server executes every request on a pooled connection as a non-superuser role (`authenticated`), setting `request.jwt.claims` (or an equivalent `app.identity_id` GUC that the RLS helpers read) with `SET LOCAL` inside the transaction. RLS predicates and `can_act_as` resolve from that claim exactly as designed. JWTs reappear only where a *verifying boundary* exists: the bridge (node↔node calls carry a token the remote's identity block verifies) and any future PostgREST-style component. This keeps one enforcement model (RLS) with an honest local mechanism, and removes a per-request signing/verifying round-trip from the hot path. Rewrite the parenthetical in T-L11/T-D3/03 §5 accordingly ("the inherited D5 flow is kept" → "the inherited D5 *posture* is kept: server-established identity, RLS enforcement, no service-role bypass; the token step is replaced by transaction-scoped identity claims because tm8-server owns the connection").

Non-negotiable invariant to carry into the implementation plan: **the app role must not be table-owner/superuser** (RLS does not bind to owners without `FORCE ROW LEVEL SECURITY`; simplest is a dedicated low-privilege role), and every write path still goes through the SECURITY DEFINER RPC catalog per D8.

### 2.3 T-L6's "appends only" collides with "the bridge client is just another consumer surface" (02 §5)

Treated fully in §5 below; the law-level fix is **R3**.

Everything else coheres: T-L2 vs T-L10 (streams are not graph surfaces) is consistent; T-L3's entity test is crisp enough to adjudicate real cases (I tried it against manifests, read-marks, saved views, stream grants — all land correctly as side tables); T-L4's "no `if (kind===…)` outside the registry" matches the UI plan's enforcement; T-L9's policy-vs-architecture distinction is exactly right; T-L12 inherits a contract that demonstrably covers its surfaces.

## 3. Node / gateway / identity — SOUND-WITH-CHANGES

The composition model (T-L1, 02 §3) is the best part of this architecture: local, hub, hosted, browser-only are configurations of one binary, and the user-X flow proves the bridge's workspace↔workspace framing does real work (hosting locality genuinely becomes irrelevant). Three changes:

**R4 — Make the hub trust model explicit.** With node-local identity (T-D7), the hub's node admin *is* the identity provider for every account on that hub. Technically, a malicious hub admin can mint a session for any hub account and act as them in hub-homed spaces; the relay additionally sees (but per T-L10 does not store) stream bytes. This is inherent to "Trusted Hub" Design A and is an acceptable v1 stance — but it is currently implicit. Add to 02 §4: *"The hub operator is trusted: they administer the identity store and can technically act as any account homed on their node. Cross-node actions are attributed but not cryptographically non-repudiable until portable identity (Phase 4). Choose your hub like you choose your git host."* Without this sentence, someone will later discover it as a "vulnerability" instead of a documented trade.

**R5 — Gate hosted-workspace execution explicitly.** T-L1 marks execution "optional" on hosted workspaces and 04 §3 says the PTY host runs on the hub slot. That is **arbitrary code execution on the hub by any user who gets a hosted workspace**. Design A's process-per-user isolation is a start, not a sandbox. v1 policy should be: hosted workspaces ship with **execution disabled by default**, enabled per-workspace by the node admin (a node-admin capability, not a space role), with the resource limits from open question 1. This is one row in the gateway's routing/limits config and saves the hub story from being quietly unshippable.

**R6 — Specify account lifecycle minimums.** Node-local identity is right for v1 (T-D7 correctly defers the federation tarpit), but three lifecycle events need one-line answers in 02 §4 before implementation: **recovery** (v1: node admin resets credentials — acceptable for invite-scale; a hub is "accounts on a machine someone runs," not a public IdP), **revocation** (deleting/disabling an account kills gateway sessions and bridge tokens; the member entity and authored history remain, per the graph's actor-attribution model), and **rename/re-key compatibility** (the address shape carried per T-D7 — store `identity_id` as opaque and immutable, display names elsewhere, so `user@server` can layer on later without rekeying `user_profiles`). None of these are hard; all of them are the kind of thing that gets improvised inconsistently if unwritten.

## 4. Entity-graph deltas (03) — SOUND-WITH-CHANGES

`work_session` and `collection` as new core kinds pass the four-capabilities rent test cleanly (you genuinely discuss, link, parent, and react to both). The custom-kind mechanism is the right shape (registry-as-data + one shared jsonb detail table + envelope capabilities free). Four concrete findings:

**R7 — `entity_kinds` primary key is wrong as written.** 03 §2 has `kind text PRIMARY KEY` with a nullable `space_id` column. Custom kinds are space-scoped, so two spaces must both be able to define `c:design_asset` — the global PK forbids it and lets spaces squat names workspace-wide. Fix: `PRIMARY KEY` on `(kind, space_id)` is not directly possible with nullable `space_id`; use the standard pattern — `UNIQUE (space_id, kind)` plus a partial unique index `ON entity_kinds(kind) WHERE space_id IS NULL` for core kinds, surrogate id PK. Kind resolution for an entity then resolves `(entity.space_id, kind)` falling back to the core row; the envelope's kind-validation trigger must do this two-step lookup. Consequence to state: custom-kind entities cannot cross spaces (already true — everything is space-scoped), and a `c:` kind pulled across the bridge arrives as its rendered projection, never as a registry import.

**R8 — Decide `entity_ref` now: drop it from v1.** On the reviewer-flagged line in 03 §2: display-only refs **will** smuggle relations — the moment a jsonb field holds an entity id, someone will filter on it (it is GIN-indexed by design), and you have rebuilt `assigneeUids[]` inside the mechanism T-L3 exists to kill. The auto-materialized `x:field:<name>` edge alternative fixes queryability but imports edge-lifecycle complexity (field update = edge delete+create; who owns the edge; what happens on schema edit) into the one part of the system meant to be dumb. The clean v1 line: **custom-kind fields are scalars only** (`text|number|bool|date|enum`); if a relation matters, it is an edge, full stop — and the UI's custom-kind panel already has the Connections rail for exactly this. Revisit auto-materialization only if real usage demands ref-typed fields.

**R9 — Add a custom-kind schema-evolution rule.** `field_schema` is mutable data; the doc validates rows "against the schema on write" but says nothing about existing rows when the schema changes. Without a rule, an implementer will either rewrite all rows on schema edit (expensive, wrong) or leave validation drift unbounded (rows that can never be re-saved). State the rule: **schema edits are additive-or-relaxing by default** (add field, widen enum, make optional); reads must tolerate missing fields (render as empty); a *tightening* edit (new required field, narrowed enum) is refused unless the space admin runs it as an explicit backfill action. Validation always checks against the current schema **on write only** — old rows are grandfathered until touched. This is three sentences in 03 §2 and prevents a class of production incidents.

**R10 — `work_session` needs commands.** 03 §1.1 defines the kind and its detail table but the operation catalog gains no verbs for it. Treated in §8/R17 (execution operation family) — noted here because the delta doc is where the kind is defined and should point at its commands.

The convergence table (03 §3) is honest — including the brave and correct choice that Team = `team_member` hierarchy (leader = parent). One consequence worth a note: old maestro Teams allow a member in multiple teams and sub-team graphs; a strict tree cannot express membership in two teams. The mapping should say: primary org line = hierarchy; secondary affiliation = an edge (`x:member_of` or a registered `member_of`). Cheap now, confusing later if silent.

## 5. Bridge protocol — SOUND-WITH-CHANGES

The asymmetric core — pull = pinned projection, report-back = appends, never field sync — is the single best inheritance from the corpus: it is what permanently forecloses multi-master merge hell (T-D4 depends on it). The problems are in the verb enumeration and one overreach in the law's wording.

**R3 — Re-scope T-L6's "appends only" to the projection discipline, not the member's agency.** 02 §5 says the bridge client is "just another consumer surface" projecting "the inherited operation catalog" — but the verb list omits `create` and `patch` entirely. Run golden workflow 1 (author & stage) from a laptop node against the hub's shared space: the user cannot create a task, cannot edit its description, cannot check an acceptance criterion — the bridge only lets them message, edge, and status-command. As written, laptop members are second-class citizens of the shared space and the browser user (who acts directly) is first-class — inverted from the product's intent. The two ideas the law conflates:

- **(a) The bridge as remote consumer surface:** an authenticated remote member should be able to do, over the bridge, anything the operation catalog + RLS lets them do in that space — including `entities.create` and `entities.patch` of entities they may edit. This is safe: it is the same single-authority write path every local client uses; the space is still single-homed; there is no sync.
- **(b) The projection discipline:** for *pulled* entities specifically, the local rendered artifact is a build product; local edits to it never propagate; the only sanctioned flows back to the source are appends (messages, edges) and commands. **This** is what "never field-level sync" must bind.

Rewrite T-L6's forbids-clause: *"Forbids: two-way mirror sync; any **automated** write-back derived from a pulled projection; bridge mutations outside the operation catalog."* And extend 02 §5's verb list: `create`, `patch` (catalog ops, RLS-scoped, `expectedVersion` honored), with the note that pull/report-back remain the disciplined protocol for the projection relationship. The staleness model is unaffected — `version`/`activity_at` still drive re-pull.

**R11 — Add the missing infrastructure verbs.** Two flows the v1 verbs cannot carry:
1. **Blob fetch.** A pulled projection references attached files; file bytes live on the home node's storage (03 §6). The bridge needs `fetch-blob` (or the projection composer must inline/sign URLs that route via the gateway relay). Without it, golden workflow 1's "drags in a design doc" produces a projection with dead references on every remote node.
2. **Remote inbox/read-marks.** Per-member state for a remote space lives on the space's home node (read_marks, notifications are home-side tables keyed by the member). `subscribe` delivers events, but "what's unread for me in the hub space" is a home-side query. Covered automatically if R3's "full catalog over the bridge" lands (inbox.list/readMarks.upsert are catalog ops); called out so the implementation plan wires cross-space inbox aggregation (the UI's far-left Inbox is defined as cross-space).

**R12 — Answer open question 2 (subscription depth): remote-live with bounded ephemeral cache — confirmed, plus a resume rule.** Durable replication of remote events into the local store is multi-master by installments: the moment a mirrored row survives a disconnect, someone will read it stale, then write against it. The lean in 06 §4.2 is correct. Make it a rule with teeth: the local node holds remote data only in **memory-bounded caches keyed by event cursor**; reconnect = resume from cursor if within the remote's event-retention window (7 days inherited), else re-walk focused entities. Nothing remote is ever written to the local node's Postgres except pull artifacts (which are explicitly build products) and the operational bookkeeping of the bridge itself.

Does anything in pull/report-back secretly require field sync? I hunted for one and the closest is **acceptance-criteria check-off** by a remote agent (workflow 2/3): checking a box is a content patch on the source task. Under the current law it is forbidden; under R3 it is an ordinary RLS-scoped `entities.patch` with `expectedVersion`. That is the correct resolution — it is a *direct authorized edit of the source*, not a sync of a local copy. No true field-sync requirement found; the asymmetry survives.

## 6. Single-homed spaces — SOUND

I tried to break T-L5 and failed in a good way. The features it forecloses and my assessment of each:

- **Offline multi-writer** (two disconnected laptops writing one space, merged later): genuinely foreclosed, genuinely fine. The architecture's answer — everyone's own workspace is always-writable locally; *shared* spaces live somewhere well-connected (a hub); collaboration under partition degrades to "work in your workspace, report back when reachable" — matches how the product is actually used (agents work against pulled projections, which are partition-tolerant by construction). CRDT-grade merge for a task graph is a research project, not a feature; T-D4 rejecting it permanently is a strength.
- **Space migration between homes:** *not* foreclosed by single-homing itself — an exported space (Q7) can be imported to a new home — but the identity interaction must be stated: members are keyed to accounts on the old home node (T-D7), so **rehoming = data moves, membership re-establishes** (re-invite; authored history keeps its actor attribution as historical record). Acceptable for v1; portable identity (Phase 4) is what makes rehoming seamless later, and the address-shape compatibility note in 02 §4 already points there.
- **Availability:** a space homed on a laptop is down when the laptop sleeps. Inherent, and the hub composition exists precisely for spaces that need better uptime.

**R13 — State the trades in 01-LAWS.** Add to T-L5: *"Consequences accepted: a space is as available as its home; partition degrades to pull-side work + deferred report-back; rehoming a space re-establishes membership (identity is node-local until Phase 4). Backup/export (Q7) is the trust backstop."* Single-homing is load-bearing for everything else (bridge asymmetry, no consensus, RLS-as-authorization at one place) — it should carry its costs on its face.

## 7. Auth & storage deltas — SOUND-WITH-CHANGES

The identity delta (03 §5) is coherent once R2 lands (mechanism restated for self-owned Postgres). `user_profiles` keyed by opaque tm8 identity id — right, and consistent with the api-design's own migration note ("treat the existing text PK as opaque").

**R14 — Resolve the push-notification contradiction.** T-D3 says *no Firebase anywhere in tm8*. The inherited notification design (api-design 01 §S7, D9) revives `notification_outbox` explicitly as **the FCM dispatch queue** with a **trusted Firebase worker**. Both cannot hold. tm8 must pick: (a) carve a narrow exception (FCM as a dumb push transport, no identity, no data — defensible but dilutes a clean directive), or (b) go Firebase-free push: web-push/VAPID for browser + desktop, and for mobile accept that APNs/FCM are unavoidable *platform* channels and route them through a hub-side dispatcher in Phase 2+ (the outbox stays transport-agnostic: `channel` column, workers per transport). **Recommendation: (b)** — keep the outbox design, delete "FCM" from its definition, make push transports a gateway/hub concern (local nodes deliver in-app + OS-native desktop notifications, which need no third party). Either way, decide it now: it is the one place the inherited corpus directly contradicts T-D3.

**R15 — The sidecar's operational story is v1 scope, not an open question (answers Q5).** Position:
- **Pin the major version** and ship the binaries with the app (per-platform); data dir under the node data dir (`<data>/pg/<major>/`).
- **Migration-on-update:** app update never `pg_upgrade`s silently — on major-version change, run a dump/restore migration with an automatic pre-migration backup; refuse to start on failure with the backup path surfaced. Minor updates are in-place.
- **Backup = `pg_dump` on a schedule + on-demand export** (this is also 80% of Q7's space export).
- **Crash recovery:** Postgres already owns this (WAL); tm8-server's job is single-instance locking (staging/prod dual-stack must get distinct data dirs + ports, a lesson the old repo already learned) and health-check-then-start.
- **uuidv7:** require PG 18+ (native `uuidv7()`) or vendor the function; pin it in the contract so keyset cursors are uniform.
- **PGlite fallback trigger (Q5):** define it as *distribution* failure, not preference — adopt PGlite only if a target platform cannot ship the sidecar (signing/notarization/size). PGlite is single-connection and weaker on extensions; it must never fork the schema (T-L11's one-migration-sequence law applies). Until that trigger fires, PGlite stays watched, unbuilt.

## 8. Execution transplant & seam (04, T-D14) — SOUND-WITH-CHANGES

*Source audit basis:* file-level audit of `maestro-server/src` (spawn route, PTY host, WebSocket bridge, manifest generation) and `maestro-cli` (worker init, prompt composition, command surface) against 04 §1's inventory. Per-claim verdicts: **claim 1 (lifts-as-is) MOSTLY-HONEST; claim 2 (one-seam spawn/manifest) UNDERSTATED — the headline problem; claim 3 (CLI unchanged except verbs) MOSTLY-HONEST.**

**What genuinely lifts.** The PTY host is the cleanest asset in the audit: ~1,388 LOC (`PtyHostService` + `PtyWebSocketServer` + `OutputBuffer` + `TerminalStateMirror`) with **no** repository, event-bus, or filesystem coupling — it keys off an opaque sessionId and has exactly one write seam (a status update on exit). The 16ms coalescing is real; `MAESTRO_PTY_HOST=server` is the thin-client path as claimed (desktop PTY actually runs Tauri-side in Rust). The CLI prompt-composition core is equally portable: ~2,400 LOC that reads the manifest **file** only and emits the system prompt with zero REST calls — 04's claim 3 holds for it; only the command-catalog verb strings change. The terminal UI components and Tauri spawn plumbing lift, with one hard constraint: the Tauri handler consumes an exact `session:spawn` payload shape (session, command, cwd, envVars, manifest path, ids, spawn provenance) that must be preserved verbatim or desktop spawn breaks.

**What 04 understates — the "one seam" is the least portable part.** The audit found no spawn *service* to transplant:

- The spawn flow is an **~850-LOC inline Express handler** (in a 2,674-LOC route file) that reads **seven** entity types, not three (sessions, tasks, team members, model profiles, project, team, spells), performs git side effects (worktree creation), applies a ~5-level launch-config precedence chain and a permission-mode inheritance chain, resolves coordinator/sub-team re-rooting, and embeds a hardcoded 27-entry model-power ranking table.
- Manifest composition is not in-process: the server **shells out to the CLI** (`manifest generate` subprocess), and that subprocess reads tasks and projects **directly from the file data dir** (`~/.maestro/data/{tasks,projects}/*.json`) — the spawn route even calls `taskRepo.flush()` first so the files are fresh. The file model is load-bearing *inside* the spawn path, which a Postgres graph server contradicts by design. The model-power table and launch/permission logic are **duplicated verbatim** in this subprocess.
- `createSession` itself mutates every linked task and writes per-task timeline events; session status has **3+ independent writers** (route on create, PTY host on exit, stop route, and agent-side REST calls flipping running/idle/needs-input).
- The WS bridge's *engine* (50ms batching, coalesce-throttling, subscription filtering, backpressure) lifts cleanly behind its event-bus seam, but **~40% (~150–190 LOC) is policy hard-wired to the old entity taxonomy** — immediate-bypass lists, per-entity throttle tables, a ~60-name subscription list, and namespace-aware filtering across a ~62-event domain map — all of which must be re-mapped to the graph event vocabulary.
- The agent-facing runtime CLI is not thin: ~7,800 LOC across ~25 command files hitting **~54 distinct REST endpoints** in ~12 resource groups; `worker init` itself fires REST side effects (status auto-update, manifest-spell activation); and the old collab CLI talks Firestore directly (moot — it retires with Collab V1, but it is not "adapter-covered" either).

**R27 — Reclassify spawn + manifest as *re-authored with behavioral parity*, not transplanted.** 04 §1.2's "logic kept, persistence re-addressed" is not achievable as written: the logic is tangled with the file model, a subprocess boundary, and duplication. The honest tm8 plan: write a real `SpawnService` in the execution block implementing the *behavioral spec the old code constitutes* — the precedence chains, coordinator/sub-team resolution, worktree flow, spell injection — against graph reads through the contract, with manifest composition moved **in-process** (killing the CLI-subprocess + shared-disk pipeline and the `flush()` hack; the CLI keeps only manifest *reading*). Fold the model-power ranking into model-profile **data** (it is a ranking table pretending to be code, currently maintained in two places). This is bounded, well-specified work (~1,500–2,000 LOC of understood logic) — normal feature-writing, not archaeology — but it must be *planned as a build*, and 04 §1.2 should be corrected so the implementation plan doesn't budget it as a lift.

**R28 — Budget the WS-bridge policy re-map.** Engine lifts; the policy tables (immediate-class events, per-kind throttles, subscription families, filter predicates) are a deliberate rewrite against the WorkspaceEvent taxonomy + `work_session` kinds. Small (~200 LOC) but semantically load-bearing (spawn/modal immediacy is what makes the desktop feel right); name it in 04 §1.1 rather than implying zero-delta.

**R29 — Single-writer status lifecycle + preserved integration shapes.** In tm8, make the execution block the **sole writer** of `work_session.status` (PTY exit, stop, agent-hook idle/needs-input all funnel through one transition function → one command → one event), replacing today's 3+ writers. Preserve exactly: the `session:spawn` payload contract for the Tauri shell, and homes for the two session sub-resources agents write mid-run — docs (`doc` + `attached_to`, already mapped in 03 §3) and **modal** (operational side table + immediate-class event; it is in 03 §3's bookkeeping row but 04's inventory omits that agents write it over REST during runs — the compat adapter must carry `modal`).

Beyond the audit's findings, five additions 04 is silent on, found at the corpus level:

**R16 — The execution block needs an *operation-catalog family*, and the graph needs to admit terminal surfaces.** The inherited catalog (api-design 02 §4) has no execution verbs at all — no spawn, no session-input, no terminate, no transcript, no stream-attach. tm8 must extend the catalog with an `execution.*` family (`execution.spawn`, `execution.prompt` [PTY input injection], `execution.terminate`, `execution.streams.attach`, plus `work_session` command surface per R10) — designed *now* so the CLI/MCP/UI projections stay T-L12-clean, and so `capabilities`/`/actions` can honestly gate them (`501 not_implemented` on nodes with execution disabled — the T-L1 composition story depends on this). Also add the §1 exemption note: the xterm frame surface inside a `work_session` Z3/Z4 is stream UI, not an entity component.

**R17 — "session prompt" must be a delivery mechanism, not just a message.** 04 §1.3 maps `maestro session prompt <id> --message` to "message anchored to target work_session." Today that command *injects text into the target session's PTY* — it makes an agent act. An anchored message is inert unless something delivers it. Specify the mechanism: the execution block, for each live work_session it hosts, subscribes to messages anchored to that session (or to an explicit `execution.prompt` command) and injects into the PTY, marking delivery. If this is silently dropped, every coordinator/worker protocol in the existing prompt corpus breaks while appearing to work (messages land in the graph, agents never see them). This is the single most dangerous silent-failure seam in the transplant.

**R18 — The compat adapter's real surface is the coordinator loop, not just report verbs (answers Q4).** The 04 §1.3 table covers worker report-back; the audited runtime surface is ~54 REST endpoints across ~12 resource groups. The actual agent-facing CLI also carries: **`session spawn`** (coordinators spawn workers — this is the heart of orchestration and depends on R16's `execution.spawn`), `task create/edit/list/get/children/tree` (coordinators decompose work), `team-member` reads (spawn targeting), `spell` invocation, `modal`/`show` (UI interaction), and `master` cross-project queries (→ cross-space queries per 02 §1). Answer to Q4: freeze the v1 compat list as **{task report *, task create/edit/get/list, task docs add, session report *, session prompt, session siblings, session spawn, team-member list/get, whoami/status}** — i.e. the verbs that appear in the shipped identity/commands/spawner prompt sections — and let spell/modal/master verbs migrate natively to graph grammar (they are coordinator-facing and re-promptable). The implementation plan should still run the promised grep over seed skills/spells before freezing, but plan capacity for "adapter ≈ the worker+coordinator core loop," not six verbs.

**R19 — Skills and spells feed the manifest from the graph, and the spell *engine* needs a home.** Manifest composition today loads skills from filesystem scopes (global/project/task) and spells from repos. In tm8 skills/spells are graph entities; the spawn transaction must render `equips`-edged skill/skill-content into the manifest (and the hardened spell system — gating, ensembles, notify — is an application service that must be placed: it belongs in the **server block** as a graph consumer, triggered by WorkspaceEvents, per §11/R24). Also: the old session `timeline[]` retires into anchored messages/activity (already stated) — verify the UI session card needs nothing timeline-shaped beyond that.

**R20 — Status-lifecycle chattiness through the contract.** Session status (spawning→running→idle→exited) flips frequently (idle detection). Through the contract each flip is a command + WorkspaceEvent; per-entity throttling (transplanted WS bridge) must be re-keyed to `work_session` events, and idle-flapping should be debounced at the execution block before it touches the graph (status is graph state per T-L10; *keystroke-grade* liveness is not and must never become entity writes). One sentence in 04 §3.

**Verdict rationale:** the assets whose loss would be catastrophic — PTY host, WS engine, terminal components, Tauri plumbing, prompt composition (~5,000+ LOC of scar tissue) — audit as genuinely portable, which is what T-D14's "safe because it is a transplant" gamble actually rests on. What fails audit is the *framing* of spawn/manifest as a one-seam re-point (it is a bounded re-authoring, R27) plus silence on the catalog extension, prompt delivery, adapter breadth, and bridge policy re-map. Those corrections change the implementation plan's budget, not the architecture — hence SOUND-WITH-CHANGES, not UNSOUND. The seam *law* (04 §2, contract-only access) is unconditionally right and is precisely what kills the file/subprocess pipeline the audit flagged.

## 9. Sequencing & v1 scope — SOUND-WITH-CHANGES

T-D14's collapse of graph-first/execution-later into one v1 is defensible *because* the execution side is a transplant (§8 confirms) and the UI side is a transplant (in-flight build, contract-bound). But the doc's framing hides the load-bearing fact:

**R21 — Name the graph engine as v1's real build.** Per the coherence matrix (05 §4), the *reference branch* lacks: the read projection (`EntityDetail`, capabilities, badges, PullState), `walk`, delete/restore, message edit/delete, invites, saved views, leaderboard routes, versions-read, link-pr, the canonical event push path, and universal idempotency — and T-D18 rightly discards its migration history anyway. So tm8 v1's graph engine + facade is **a full implementation of the api-design contract, written fresh with the branch as a crib**. That is the right call (the contract is complete, the schema is proven in miniature), but "v1 = graph + execution transplant" reads as two transplants when it is one transplant + one from-contract build. The implementation plan should sequence accordingly — suggested internal milestones: **M1** graph engine passes a headless contract test-suite (the mock facade's contract tests, re-pointed, are the free acceptance suite — this is a real asset: the UI build's L0 tests become tm8-server's conformance gate); **M2** tm8-ui swaps MockFacade→real facade (adapter-only per T-D18); **M3** execution — the true lifts (PTY host, WS engine, terminal UI, Tauri shell, prompt composition) plus the R27 spawn/manifest re-authoring — to 04 §5 parity. Phases 2–4 sequencing is sound; Phase 2's hub depends on R5's execution gate.

In-flight disposition (T-D18): sound, one addition — the UI waves are binding DEV-1..13 onto the mock facade; R-changes here that touch DTOs (none do materially; R16 adds operations, R7–R9 are DB-side) should be relayed to the UI coordinator only if the contract module gains the `execution.*` family before W5 finishes, so `types/` is amended once, by its owner, per that plan's §7 protocol.

## 10. Open questions (06 §4) — positions

| Q | Position |
|---|---|
| 1. Hosted-workspace economics | Process-per-user holds to ~10–20 active; the constraint is memory (N × node process) + connections, not CPU. Prescribe: shared PG cluster with per-workspace **databases** (stronger isolation than schemas, same cluster; pick one and pin it — 02 §4 currently says "schemas/databases"), idle eviction (stop process after N idle minutes; cold start seconds is fine behind the gateway), per-workspace resource caps, and **execution off by default** (R5). At 50 users, process-per-user is still fine *if mostly idle*; if not, that hub should be split — say so rather than architecting for it. |
| 2. Bridge subscription depth | Remote-live + bounded ephemeral cache, cursor-resume, re-walk on window overflow (R12). No durable replication, ever. |
| 3. Custom-kind `entity_ref` | Drop from v1; scalars only; relations are edges (R8). |
| 4. Compat adapter surface | The worker+coordinator core loop, incl. `session spawn` — see R18's frozen list, confirmed by prompt-corpus grep during implementation planning. |
| 5. Sidecar Postgres | Full position in R15: pin major, backup-before-migrate, pg_dump export, PG18+/uuidv7 pinned, PGlite trigger = distribution failure only. |
| 6. Points economy | No law forecloses any option examined: scarcity/budgets = config side table + RPC guard; C8 agent→owner rollup = a leaderboard query variant (ledger already attributes earner and ownership chain). Confirmed non-blocking. Product design can proceed post-v1. |
| 7. Workspace/space export | Yes — needed for single-homed trust; commit in Phase 2. Nothing resists it: all durable state is space-scoped rows + `spaces/<id>/…` blobs + registry rows (include `entity_kinds` custom rows and side tables in the manifest). The one lossy edge is identity (export carries actor attribution as history; import remaps membership per R13). `pg_dump`-based node backup (R15) covers disaster; space export is the portability/trust artifact. |

## 11. Completeness — what has no home (R22–R26)

- **R22 — Push notifications / mobile reachability:** contradiction resolved per R14; the *dispatcher* is a hub-side worker (Phase 2), local nodes use OS notifications.
- **R23 — Mobile app:** maestro-mobile exists today (RN, server-hosted PTY mode) and the tm8 docs never mention it. It is architecturally covered — it is exactly a thin client of the contract + `MAESTRO_PTY_HOST=server` (whose preservation 04 §1.1 already mandates) — but it needs a phase assignment (suggest Phase 3, after the hub exists to reach) and a sentence in 00 §3 so the transplant of that surface isn't discovered mid-build.
- **R24 — Spell engine (automation):** the `spell` *kind* is inherited; the spell *system* (invocation, gating, ensembles, notify — the hardened engine) has no named home. Home it in the server block as a WorkspaceEvent-driven service over graph entities; its side tables are operational per T-L3. Without this, "spells" silently means "inert documents" in v1.
- **R25 — Workspace-level rollups:** the UI's Home/My-Work presets are space-scoped; old maestro's master view is cross-project. 02 §1 promises cross-space queries within a workspace but the catalog's queries all take a `spaceId`. Add a workspace-scope variant (`spaceId: '*'` or a `workspace.collections.query`) for Home-across-spaces and the far-left Inbox — small, but it is the one place the old product is broader than the new catalog.
- **R26 — Time-based automation:** reminders/due-date nudges (C9), spell schedules, retention jobs (command-ledger TTL, event pruning, soft-delete purge — all inherited with named policies). These need one scheduler in the server block; listing it prevents three ad-hoc cron implementations.

Checked and confirmed **already homed** (no action): search (reserved slot, D12), visibility (inert column + `visible_to` slot), approvals (registry rows), presence/typing (WS bridge), saved views, undo, tracking refresh worker, invites, modal/timeline/manifest bookkeeping (operational side tables per 03 §3/§4).

## 12. The UI-plan inheritance — reviewed for transplant fitness

Not a charter bullet, but the transplant target: the ui-plan's architecture laws (screens compose downward; kinds are registry data; facade seam) are *the same laws* as T-L2/T-L4 — the UI build is effectively already building tm8-ui. Two watch-items for the implementation plan: (1) the mock facade's contract tests become the server conformance suite (R21/M1) — treat them as a deliverable, not scaffolding; (2) the KindRegistry must accept **runtime-registered kinds** (custom kinds, T-L4) — the current plan's registry is compile-time per-kind entries; the transplant needs a generated-renderer path (03 §2 already sketches it). Neither blocks the UI waves; both belong in the tm8 implementation plan.

## 13. GO / NO-GO

**GO — proceed to implementation planning**, conditional on the R-changes being accepted into the doc set first (they are edits and additions, not redesign; nothing invalidates a law's intent).

Why GO despite eight SOUND-WITH-CHANGES verdicts:

1. **No law is wrong in intent.** Every finding is either a written-form contradiction (R1), inherited residue (R2, R14), an enumeration gap (R3, R11, R16–R18), a schema-level bug (R7), or an unstated operational rule (R9, R15). The load-bearing bets — one node binary, graph-core + side tables, single-homed spaces + asymmetric bridge, RLS as the one authorization source, contract-as-seam, transplant-not-rewrite — all survived adversarial pressure, and several (single-homing + asymmetry; the contract's completeness; the UI/laws convergence) are genuinely strong.
2. **The riskiest claim was audited, not assumed — and the correction is affordable.** The transplant inventory was checked file-by-file against the actual code. The assets that carry the operational scar tissue audit as genuinely portable; the one claim that failed (spawn/manifest as a one-seam lift) fails toward a **bounded re-authoring of ~1,500–2,000 LOC of well-understood logic** (R27), not toward an open-ended rewrite. T-D14's conclusion survives its weakened premise.
3. **The two would-be blockers have clean resolutions.** The identity-placement contradiction (R1) resolves by moving one responsibility between blocks, strengthening T-L7. The bridge under-specification (R3) resolves by letting the bridge be what 02 §5 already claims it is.

**Conditions (do before or at the start of implementation planning):**
- Accept/adjudicate R1–R3 (law text), R7 (schema), R14 (push story), R16–R18 (execution catalog + prompt delivery + adapter scope), and R27 (spawn/manifest reclassified as re-authoring; 04 §1.2 corrected) — these change what gets planned and budgeted.
- Fold R4–R6, R9, R13, R15, R19–R26, R28–R29 into the implementation plan as requirements; none alter the architecture.
- Re-run the Q4 prompt-corpus grep before freezing the adapter list (R18's list is the reviewer's read of the shipped prompt sections, not yet an exhaustive audit of user skills/spells).

**What would have made this NO-GO,** for the record: durable replication of remote events (multi-master creep), a second auth path for local, gateway-owned graph data, per-kind API routes, or an audit showing the PTY/WS/terminal/prompting stack itself concealed a rewrite. None are present — the one inventory overstatement found (spawn/manifest) is bounded and its correction strengthens the plan rather than undermining the laws.

---

<!-- ======================= 08-AMENDMENT-VERIFICATION.md ======================= -->

# tm8 — Amendment Verification (second review pass)

**Status:** Final
**Date:** 2026-07-25
**Verifier:** Fable 5 verification reviewer (`sess_1784941747577_6shiysouf`, task `task_1784941718086_u2n464zsy`)
**Scope:** Fidelity + coherence pass over docs 00–06 as amended against `07-ARCHITECTURE-REVIEW.md`, per the T-D20 adjudication (R1–R13, R15–R29 accepted; R14 deferred). Not a re-review of the architecture; no settled decision is relitigated.

**Verdict: FAIL (narrow) — 27 of 29 R-changes verified applied correctly; R1 and R3 each left one contradicting residue in text the amendment sweep did not touch.** Two one-line fixes are blocking; four editorial nits are recommended. After the two blocking fixes land, the set can be stamped FINAL on a spot-check of those lines only — no further full pass needed.

---

## 1. Per-R verification table

Verdicts: **AC** = APPLIED-CORRECTLY · **AI** = APPLIED-INCORRECTLY (folded but residue/dilution breaks the R's intent somewhere in the set) · **MISSING** · **N/A** (deferred / no doc-text obligation).

| R | Demand (short) | Verdict | Evidence |
|---|---|---|---|
| R1 | Identity/accounts into the server block, every composition; gateway = routing + relay + spawner + remote-facing auth surface, never the primary account store | **AI** | Applied correctly in 01 T-L1 (server block gains identity/accounts, all compositions) and T-L8 (forbids gateway-owned account database); 02 §2 server/gateway rows; 02 §4.1 (auth surface fronts the node's identity block); 03 §5 (id issued by the node's identity block). **Residue: 05 T-D6 still reads "Owns identity/routing store only"** — a decision-log row asserting exactly the gateway-owned identity store R1 removed. See §2 fix F1. |
| R2 | Per-transaction `SET LOCAL` identity claims, not self-minted JWTs; low-privilege role invariant; JWTs only at verifying boundaries | AC | 01 T-L11 second para (mechanism + never table-owner/superuser + SECURITY DEFINER catalog per D8); 03 §5 ("posture kept… token step replaced"); 05 T-D3 (posture + R2 mechanism). The review's non-negotiable role invariant is carried in law text, not just the plan. |
| R3 | Bridge carries the full operation catalog (create/patch, RLS-scoped, expectedVersion); asymmetry re-scoped to bind the pulled-projection discipline; forbids-clause rewritten | **AI** | Applied correctly in 01 T-L6 (a/b split; forbids-clause matches the review verbatim) and 02 §5 (`create/patch` verb row [R3]; "the bridge carries the full operation catalog"). **Residue: 02 §2 bridge row "Never does" still reads "any write other than appends/commands to a remote"** — the pre-R3 restriction, contradicting §5 of the same doc. See §2 fix F2. |
| R4 | Hub trust model explicit in 02 §4 | AC | 02 §4 "The hub trust model, explicit [R4]" — admin-can-act-as, relay sees/never stores bytes, non-repudiation deferred to Phase 4, "choose your hub like your git host". Matches review intent fully. |
| R5 | Hosted-workspace execution disabled by default; node-admin capability, not a space role | AC | 02 §4.3 [R5] (with the "isolation is a start, not a sandbox" rationale); echoed in 06 Phase 2 and 06 §4 Q1. |
| R6 | Account lifecycle minimums: recovery, revocation, re-key compatibility | AC | 02 §4 "Account lifecycle minimums [R6]" — all three events, one line each, matching the review's answers (admin reset; sessions/tokens killed + history retained; opaque immutable `identity_id`). |
| R7 | `entity_kinds` keying: surrogate PK + `UNIQUE(space_id, kind)` + partial unique index for core; two-step kind resolution; no cross-space custom kinds; bridge delivers projection not registry import | AC | 03 §2 SQL (all three keying elements present, annotated [R7]) + resolution bullet (two-step lookup, trigger does the same; bridge note). |
| R8 | Drop `entity_ref` from v1; scalars only; relations are edges | AC | 03 §2 field_schema comment ("scalars ONLY") + dedicated bullet [R8] with the review's full rationale and "revisit only on demonstrated need"; 06 §4 Q3. |
| R9 | Schema-evolution rule: additive-or-relaxing; reads tolerate missing; tightening = explicit backfill; write-only validation, grandfathered rows | AC | 03 §2 "Schema evolution [R9]" — all four clauses present, semantically identical to the review. |
| R10 | `work_session` kind definition points at its commands | AC | 03 §1.1 "Commands: the `execution.*` operation-catalog family… [R10/R16]" — the delta doc now names the verbs where the kind is defined, as demanded. |
| R11 | Bridge infrastructure verbs: `fetch-blob`; remote inbox/read-marks home-side via catalog ops; cross-space Inbox aggregation named for the impl plan | AC | 02 §5 verb list (`fetch-blob` row [R11], membership-checked, relayable) + the per-member-state/Inbox-aggregation sentence [R11]; 06 Phase 2 ("full-catalog per R3 + fetch-blob per R11"). |
| R12 | Subscription depth: remote-live, memory-bounded cursor-keyed cache, cursor-resume/re-walk, no durable replication ever | AC | 02 §5 "Subscription depth rule [R12]" — all elements incl. the 7-day window, the pull-artifact/bookkeeping exception, and "durable replication… forbidden (multi-master by installments)"; 06 §4 Q2. |
| R13 | T-L5 carries its trades on its face | AC | 01 T-L5 "Consequences accepted [R13]" — availability, partition degradation, rehoming/membership re-establishment, export as trust backstop; identity-remap echoed in 06 §4 Q7. |
| R14 | Push transport — **DEFERRED by user (T-D20)** | **N/A** | Deferral recorded consistently: 05 T-D20 (outbox transport-agnostic, `channel` column, workers per transport, nothing in v1 needs one); 06 §4 "Deferred by the user"; 06 homes + Phase 2 ("dispatcher slot, transport deferred"). **Nothing in the set commits to a transport.** Observation (no action): T-D3's pre-existing "no Firebase anywhere" still latently forecloses FCM — that is the original R14 tension the user chose to leave open, correctly untouched by the amendments. |
| R15 | Sidecar operational story is v1 scope (pin major, backup-before-migrate, pg_dump, PG18+/uuidv7, locking, PGlite trigger = distribution failure) | AC | 06 §4 Q5 (all six rules adopted, incl. dual-stack data dirs and "never schema-forking") + 06 Phase 1 scope line. Fine-grain details (data-dir path shape, refuse-to-start-with-backup-path-surfaced) are summarized, not verbatim — acceptable: R15 is a fold-into-implementation-plan requirement and 06 carries the normative rules. |
| R16 | `execution.*` operation-catalog family designed now; 501 gating; terminal-frame exemption sentence in 01-LAWS | AC | 04 §5 (all four verbs, T-L12/`capabilities`/501 rationale verbatim); 01 T-L10 exemption sentence [R16]; 03 §1.1 cross-ref; 06 Phase 1 includes the family in contract scope. |
| R17 | `session prompt` = PTY delivery mechanism, named v1 requirement | AC | 04 §6 (dedicated section: subscribe-and-inject, mark delivery, "single most dangerous silent-failure seam… named v1 requirement, not an option"); 04 §1.3 mapping row; 06 Phase 1 ("R17 prompt delivery"). |
| R18 | Adapter = worker+coordinator core loop; frozen v1 list; grep re-run before final freeze | AC | 04 §1.3 (corrected ~54-endpoint scope; frozen list matches the review's plus `task children/tree` — which the review's own surface enumeration includes — and `modal`, which implements R29's "adapter must carry modal"; the R18-vs-R29 tension inside the review is resolved in R29's favor, correctly, with `modal-show` still migrating natively); 06 §4 Q4 carries the grep re-run — GO-condition 3 discharged. Note the dilution residue in 05 T-D15 (§2 fix F3, recommended). |
| R19 | Skills/spells feed the manifest from the graph (`equips` edges); spell engine homed | AC | 04 §1.2 closing para [R19] (in-transaction rendering replaces filesystem scope-loading; engine → server block, WorkspaceEvent-driven); 06 homes (R24 entry). Minor: the review's side-instruction "verify the UI session card needs nothing timeline-shaped" is not carried anywhere — impl-plan-grade, listed in §3. |
| R20 | Status chattiness: debounce idle-flapping before the graph; throttling re-keyed | AC | 04 §1.2 "Status chattiness [R20]" (review asked for the sentence in 04 §3; it landed in §1.2 — location differs, substance identical and arguably better-placed next to single-writer status; re-keying covered by the R28 row in §1.1). |
| R21 | v1 named honestly: one from-contract build + one transplant; M1–M3 milestones; conformance suite as deliverable | AC | 05 T-D14 ("Amended per R21/R27"); 06 Phase 1 (crib-gap list, M1 headless conformance suite "treated as a deliverable", M2 facade swap, M3 = 04 §7 parity). Minor: the review §9 in-flight note (relay `execution.*` to the UI coordinator only if the contract module gains it before W5, so `types/` is amended once) is not carried — listed in §3. |
| R22 | Push dispatcher homed: hub-side worker Phase 2+; local nodes in-app + OS-native | AC | 06 homes ("push dispatcher = hub-side worker, Phase 2+, transport deferred") + 05 T-D20 ("local nodes use in-app + OS-native desktop notifications"). Correctly adjusted for the R14 deferral. |
| R23 | Mobile assigned a phase + a sentence in 00 | AC | 00 Status line ("maestro-mobile joins the unification as a thin client of the contract (server-hosted PTY mode), Phase 3 [R23]"); 06 Phase 3 + homes. (Landed in 00's Status line rather than §3's table — substance present; nit only.) |
| R24 | Spell engine homed: server-block WorkspaceEvent-driven service; side tables operational | AC | 06 homes (verbatim intent incl. "without this, spells would silently mean inert documents"); 04 §1.2 cross-reference. |
| R25 | Workspace-scope query variant for Home-across-spaces + Inbox | AC | 06 homes (`spaceId:'*'` or `workspace.collections.query`). |
| R26 | One scheduler in the server block (reminders, spell schedules, retention jobs) | AC | 06 homes (all three job families named incl. command-ledger TTL, event pruning, soft-delete purge). |
| R27 | Spawn/manifest reclassified as bounded re-authoring with behavioral parity; in-process manifest; model-power → data; ~1.5–2k LOC planned as build | AC | 04 title/intro + §1.2 (full audit facts carried: 850-LOC route, seven entity types, subprocess + `flush()` hack, verbatim duplication; SpawnService target shape; "planned as a build, not budgeted as a lift"); 05 T-D14; 06 Phase 1. GO-condition 1's core correction is discharged. |
| R28 | WS-bridge policy re-map named and budgeted in 04 §1.1 | AC | 04 §1.1 WS-bridge row ("Budgeted delta [R28]": ~40%/~150–190 LOC policy, ~200 LOC rewrite, spawn/modal-immediacy load-bearing); 06 Phase 1. |
| R29 | Single-writer `work_session.status`; `session:spawn` payload preserved verbatim; modal + docs homes carried by the adapter | AC | 04 §1.2 (single-writer funnel + payload contract); 03 §1.1 (single-writer note); 03 §4 `session_modals` (side table + immediate-class event + "compat adapter must carry the `modal` verbs"); docs home pre-existing in 03 §3. |

**Score: 26 × APPLIED-CORRECTLY, 2 × APPLIED-INCORRECTLY (R1, R3 — correct at their primary targets, each with one contradicting residue), 1 × N/A (R14, deferral recorded correctly, nothing commits to a transport).** No R is MISSING.

## 2. Contradictions / broken references found

### Blocking (the two FAIL causes — one line each)

- **F1 — 05-DECISIONS T-D6 contradicts R1.** T-D6 still reads *"Owns identity/routing store only — never graph data (T-L8)."* Post-R1, the identity/account store lives in the server block in every composition and T-L8 explicitly forbids "a gateway-owned account database" — a reader of the decision log alone reconstructs the pre-review architecture. **Fix:** reword to *"Owns routing + relay + hosted-workspace spawner + the remote-facing auth surface (fronting the server's identity block) — never graph data, never the primary account store [R1] (T-L8)."*
- **F2 — 02 §2 bridge row contradicts R3 (and 02 §5 four sections later).** The bridge block's "Never does" column still reads *"any write other than appends/commands to a remote"* — the pre-R3 restriction. §5 of the same doc grants `create/patch` (full catalog) over the bridge; `entities.create/patch` are writes that are neither appends nor commands. **Fix:** reword to *"writes outside the operation catalog; any automated write-back from a pulled projection (T-L6b) [R3]"* (optionally add `create/patch` to the "Owns" column).

### Recommended (non-blocking editorial fixes)

- **F3 — 05 T-D15 dilutes R18.** "A thin worker-verb compat adapter (old `task report`/`session report` verbs as sugar…)" retains the understated framing R18 explicitly corrected ("the worker+coordinator core loop, not six report verbs"). T-D20 records R18 correctly, so the log self-corrects, but the row should say *"a compat adapter covering the worker+coordinator core loop (R18 frozen list, 04 §1.3)"*.
- **F4 — 02 §2 execution row cites "T-04 doc §4"** for the contract-only seam; the seam law is **04 §2** (04 §4 is the operational-lessons list). Change to "04 §2".
- **F5 — 04 §1.3 cites "§6" for `execution.spawn`**; the family is defined in **§5** (§6 is prompt delivery). Change to "§5".
- **F6 — "06 §5-homes" labeling.** 04 §1.2 and 06's Status line refer to "06 §5-homes", but the homes block is an unnumbered preamble and 06's actual §5 is the review charter. Either number the homes block or change references to "06 homes (preamble)". Also: 05's Status line still says "Draft for architecture review" though T-D3/T-D14/T-D20 were amended — update it to match the other docs' amended-status convention.

### Cross-reference sweep (04 renumbering) — otherwise clean

All other references checked and valid: 06 Phase 1 and M3 correctly point at **04 §7** (new acceptance number); 03 §1.1 correctly points at **04 §6** (prompt delivery); 06 §5 charter's "04 §2" (seam law) remains correct; 03's "(review §4)"/"(review §12)" and 06 §4's "review §10" point at the right 07 sections; nothing still uses old "04 §5 = acceptance" semantics.

## 3. GO-conditions (07 §13) — discharge check

1. **Adjudicate R1–R3, R7, R14, R16–R18, R27** → discharged: T-D20 records the adjudication (R14 deferred is a valid adjudication) and all are folded into doc text (R1/R3 modulo F1/F2 above).
2. **Fold R4–R6, R9, R13, R15, R19–R26, R28–R29 into the implementation plan as requirements** → discharged ahead of schedule: all are folded into the doc text itself (02/03/04) and 06 carries the plan-facing ones (Phase scopes, §4 resolutions, homes preamble). Two review side-notes are not carried anywhere and should ride into the implementation plan: *(a)* verify the UI session card needs nothing timeline-shaped beyond anchored messages/activity (R19 tail); *(b)* relay the `execution.*` contract addition to the UI coordinator only if the contract module gains it before W5 finishes, so `types/` is amended once by its owner (review §9 tail). Neither is doc-text-blocking.
3. **Re-run the Q4 prompt-corpus grep before freezing the adapter list** → carried explicitly: 04 §1.3 ("Frozen v1 list (pending the prompt-corpus grep)") and 06 §4 Q4.

## 4. Final verdict

**FAIL — do not stamp FINAL yet.** The amendment quality is high: every accepted R is present, none is semantically diluted at its primary target, the R14 deferral is recorded consistently with no accidental transport commitment, and the 04 renumbering broke nothing. But the sweep missed two consequential edits (F1 in the decision log, F2 in 02's block-responsibility table), each of which reintroduces exactly the pre-review architecture the adjudicated changes removed — a FINAL stamp over either would leave the set self-contradictory on its two headline law changes (R1, R3).

**Path to FINAL:** apply F1 and F2 (two one-line edits; F3–F6 recommended in the same pass), then stamp. Re-verification can be a spot-check of the edited lines; no further full pass is required.

---

## Resolution addendum (2026-07-25, design session sess_1784931993141_0y6d4fs4v)

The FAIL verdict above was **narrow and is now resolved**; this addendum is the closing record so the doc no longer contradicts the set's FINAL stamp:

1. **F1, F2 (blocking)** — applied same-day: T-D6 reworded to the R1 gateway scope (routing + relay + spawner + remote-facing auth, never the primary account store); the 02 §2 bridge row's "never does" now reads "writes outside the operation catalog; any automated write-back from a pulled projection (T-L6b)". Spot-check per this doc's own guidance ("no second full pass") completed.
2. **F3–F6 (nits)** — applied: T-D15 points at the R18 frozen list; 04 §2 / execution.spawn §5 cross-references corrected; 06 homes promoted to a proper heading; 05 status updated.
3. **Post-FINAL in-place rewrites** — per AM-1/T-D21 (no Tauri) the overlay amendments flagged as P0-5 by the tm8 implementation review were replaced with in-place rewrites across 04 (lift table, R29 wire-contract wording, §4 lesson), 06 (Phase-1 scope, repo shape), and 09 (definition of done, scaffold, M2/M3, wave table). No normative Tauri requirement remains anywhere in docs 00–09.

**Closing verdict: PASS — the FINAL stamp on docs 00–06 (and the amended 09) stands.** Subsequent amendments are tracked as decision-log rows (T-D21, T-D22) with in-place rewrites, never overlay notes.

---

<!-- ======================= 09-IMPLEMENTATION-PLAN.md ======================= -->

# tm8 — Phase 1 Implementation Plan (v1: the node)

**Status:** In execution (Vega, sess_1784943069601_y42xw5b9m; tm8 repo + project live). Rewritten in place for **AM-1/T-D21** (no Tauri — server + web only; server-side PTY is the only spawn path). **AM-2/T-D22** (implementation-review adoption) restructures sequencing: a **Phase 1A vertical slice** (space+project → task → spawn → prompt delivery → progress → PR link → complete+transcript → restart/recovery, with security + perf acceptance) lands **before** platform completeness; **1B** adds channels/collections/custom kinds/points, basic Postgres FTS behind `search.query`, and minimal old-maestro import. This doc remains the content reference for the M-milestones; **execution order and the AM-2 contract amendments are normative in tm8/STATE.md** (+ 10-SECURITY-MODEL.md, Vega-authored).
**Date:** 2026-07-25
**Author:** Design session `sess_1784931993141_0y6d4fs4v` (user-directed).
**Scope:** Phase 1 only — tm8 v1 per T-D14/R21: **one from-contract build** (graph engine + facade) **+ one transplant** (execution), shipping a full local-maestro replacement that is natively a collab space. Phases 2–4 (hub/gateway, migration+mobile, federation) get their own plans when Phase 1's gates close.
**Normative inputs:** tm8 laws + decisions (01/05), the api-design contract (`docs/collab-v2-api-design/`, read with tm8-server substitution + R2 auth delta), the execution inventory (04), and every R-condition from 07 (traceability table in §8).

---

## 0. Definition of done (Phase 1)

A user runs tm8 on a laptop — one command starts tm8-server (which starts the Postgres sidecar and serves the browser UI) — and, with no other infrastructure:

1. Opens their workspace, creates spaces, tasks, docs, channels, team-member personas, custom kinds — the full entity-graph UI (five golden workflows pass against the real backend, not mock).
2. Spawns an agent session from a task (any persona, any mode) → terminal opens → agent boots with correct manifest/prompt → posts progress into the task thread → links a PR → completes with award flow — at terminal latency/stability parity with old maestro (04 §7 acceptance).
3. Everything runs through one contract: UI, CLI (graph grammar + compat adapter), and the WS event stream are projections of the same operation catalog; RLS enforces every read/write via per-transaction identity claims.

Old maestro keeps running untouched throughout (separate ports, separate data dirs); nothing in Phase 1 migrates old data (Phase 3).

## 1. Repository scaffold (M0)

```
tm8/                          # new repo, bun workspace
  packages/contract/          # THE LAW: types + zod + operation catalog + WorkspaceEvent + errors
  packages/server/            # graph engine, HTTP/WS facade, event mapper, identity block,
                              #   derived-truth assembly, sidecar lifecycle, scheduler   [node runtime]
  packages/execution/         # PTY host (lift), SpawnService (build), manifest composition
  packages/cli/               # graph CLI + compat adapter + manifest reader (worker init)
  packages/ui/                # transplanted collab-v2 module + terminal components + shell glue
  db/migrations/              # ONE clean sequence (no legacy history)
  docs/                       # snapshot: tm8-architecture 00-08 + collab-v2-api-design + UI contract
  tools/conformance/          # the contract conformance suite (M1 gate artifact)
```

Scaffold rules:

- **Contract-first:** nothing imports Postgres types or server internals across package lines; `packages/contract` is the only shared dependency (T-L12; api-design L1).
- **Runtime split honored from day one:** `packages/server` + `packages/execution` run under **node** (node-pty; 04 §4); everything else may use bun. One `bun run dev` orchestrates.
- **Ports/data dirs:** dev defaults chosen to never collide with live maestro (4567–4569) or the collab-v2 UI dev server (4571) — tm8-server 4610, UI dev 4611, sidecar PG 5442; data at `~/.tm8/` (dev: `~/.tm8-dev/`). Single-instance locking per R15.
- **Corpus snapshot in-repo:** workers never read from agent-maestro at runtime; everything they need is vendored into `docs/` at M0 (same discipline as the UI build's worktree setup).

## 2. Milestone M0 — scaffold + contract package

Deliverables:

1. Repo + workspace + CI basics (typecheck, vitest, migration runner).
2. **`packages/contract`**: transcribe DTOs from the UI data contract (as already implemented by Atlas's `types/`) + the api-design operation catalog + error taxonomy + `CommandResult` + `WorkspaceEvent` + keyset-cursor helpers, **extended with the `execution.*` family** (R16: `spawn`, `prompt`, `terminate`, `streams.attach`) and the `work_session`/`collection`/custom-kind state shapes (03). Zod schemas are the single source; server validation, CLI `--json`, and future MCP tool schemas all derive from them.
3. **`tools/conformance`**: harness that runs a suite of contract tests against any base URL. Seed it by porting the mock-facade contract tests from the UI build (R21 — they are a deliverable, not scaffolding); extend with: error-taxonomy assertions, keyset-cursor behavior (DEV-5), idempotent replay (DEV-9), `{data, requestId}` envelope (DEV-6), capability gating + `501 not_implemented` honesty.

**Gate G0:** contract package builds; conformance harness runs (red) against a stub server; CI green.

## 3. Milestone M1 — the graph engine passes conformance headless

The from-contract build (R21). Workstreams, package-disjoint:

### 3.1 Database (db/migrations, one clean sequence)

Derived from api-design 01 (final table catalog) + tm8 deltas (03), *crib freely from the branch migrations, import none of them* (T-D18). Grouped:

| Migration group | Contents |
|---|---|
| 001 core graph | `spaces`, `entities` (envelope + triggers: same-kind/same-space parent, cycles, position), detail tables for all core kinds incl. `work_sessions`, `collections`, `edges` + `edge_types` registry (14 inherited + `contains`, `member_of`, `visible_to`, approvals rows), `messages` (+immutability, mentions GIN), `entity_counters`, `entity_versions` (+debounced snapshot trigger, retention), `task_axes` |
| 002 identity | `accounts` (node-local credentials, node-admin flag), `auth_sessions`, `user_profiles` (opaque immutable `identity_id`, R6), `members`, `team_members`; **RLS helpers read per-transaction claims** (`SET LOCAL`; low-privilege app role, never table owner — R2) |
| 003 read model | `activity` (full verb set), `read_marks` + `unread_counts`, `notifications` (**targeted** fan-out rules) + `notification_outbox` (transport-agnostic, `channel` column, no transport chosen — T-D20), `workspace_events` + capture trigger, `saved_views` |
| 004 ledgers | `point_events`, `command_ledger` (universal idempotency, 24h TTL) |
| 005 custom kinds | `entity_kinds` (R7 keying: surrogate PK, `UNIQUE(space_id, kind)`, core partial-unique), `custom_entities` + schema-validation trigger (scalars only R8; evolution rule R9) |
| 006 execution side | `session_manifests`, `session_modals`, `stream_grants` (03 §4) |
| 007 RPC catalog | everything in api-design 01 §6 (kept + changed + new: `walk`, `delete_entity`/`restore`, team-member/spell/skill/PR/commit CRUD, `link_pr`/`link_commit`, `edit_message`/`redact_message`, invites, `unread_counts`) + tm8 additions: `entity_kinds` CRUD, `work_session` transitions (single-writer function, R29), `collection` ops; views `entity_tree`, `leaderboard`, `ready_to_work` |
| 008 RLS policies | SELECT-only policies + SECURITY-DEFINER-writes posture (D8) across all tables, keyed on claim-reading helpers |

Explicitly absent, forever: any UID-bypass/flag machinery, Firebase/Supabase references, search (reserved slot only, DEV-13/T-D20-adjacent).

### 3.2 Identity block (packages/server)

Accounts + sessions + `can_act_as` in the server block, every composition (R1). v1 local mode: first run creates the owner account and auto-authenticates (T-L7 degenerate case — same code path, one row). Lifecycle minimums per R6. No remote-facing surface yet (that's the gateway, Phase 2) — but the seam (identity API consumed by facade + future gateway) is explicit.

### 3.3 Facade + event mapper (packages/server)

- `/entities` grammar + closed `/commands/*` (+ DEV-1..13 exactly — the UI's mock facade is already bound to them), collections/graph/placements queries with real grouping/sorting/subtree, derived-truth assembly (`EntityDetail`, capabilities, badges, PullState, autoTabs, titles/excerpts/tombstones — L3: computed once, here).
- WorkspaceEvent mapper → **WS push** (the one socket; polling fallback endpoint for catch-up), `clientMutationId` threading for optimistic reconciliation.
- Keyset cursors everywhere; closed error taxonomy; command-ledger replay on every mutation.
- Sidecar lifecycle: bundled PG per R15 (pinned major, backup-before-migrate, scheduled `pg_dump`, health-check-then-start, locking).
- **Scheduler** (R26): one job runner for retention (ledger TTL, event pruning, soft-delete purge, snapshot prune) — spell schedules and reminders plug in later.
- **Spell engine home** (R24): stub the server-block service now (subscribes to WorkspaceEvents, no-op rules) so the seam exists; port the hardened engine's rule evaluation in M3 alongside the CLI (spells are graph entities feeding manifests, R19).

**Gate G1 (= M1):** conformance suite green against tm8-server headless — every read contract-shaped, every command correct (versions, counters, staleness, blocked rollups, awards, undo, idempotent replay), RLS negative tests pass (wrong actor → `forbidden`), five golden workflows executable as scripted HTTP sequences. This gate is the whole ballgame; nothing UI- or execution-shaped starts until it's green.

## 4. Milestone M2 — the UI swaps its facade

- **Transplant** `maestro-ui/src/collab-v2/` → `packages/ui` after Atlas's W5 completes (T-D18). Mechanical move + import-path pass; the module was built self-contained.
- **`RealFacade implements CollabFacade`** over tm8-server HTTP + WS: the seam the UI plan promised ("real backend later = new class"). Mock stays available behind a flag as demo/simulation mode.
- **KindRegistry runtime path** (review §12): generated default renderers for `entity_kinds` rows (custom kinds) + registry entries for `work_session` (panel = entity chrome; terminal canvas exempt per T-L10/R16) and `collection`.
- **Browser app boot:** tm8-server serves the production UI bundle (4610); Vite dev on 4611; auth = auto-owner; sidecar managed by tm8-server (T-D21).

**Gate G2:** five golden workflows in the running app against the real backend; deep-links/panel stack/back-forward hold; no mock imports outside the demo flag; typecheck + vitest clean.

## 5. Milestone M3 — execution

Per 04 (amended). In order:

1. **Lifts:** PTY host into `packages/execution` (server-hosted PTY is the only spawn path — T-D21); WS-bridge engine into `packages/server` with the **policy re-map** written fresh against WorkspaceEvent + `work_session` (R28); terminal components into `packages/ui`; the `session:spawn` payload preserved **verbatim** as the server→UI wire contract (R29).
2. **SpawnService (the R27 build, ~1.5–2k LOC):** graph reads via contract → work_session + edges + manifest (in-process composition; `session_manifests`; model-power as model-profile data) → spawn_request (immediate-class). Behavioral spec = old route + subprocess, kept side-by-side during the build for parity checking.
3. **`execution.*` family live** (R16), incl. **`execution.prompt` PTY delivery** (R17): per-hosted-session subscription → inject → mark delivered. Single-writer status transitions + idle debounce (R29/R20).
4. **CLI:** graph command tree (api-design 03 §3.1) + **compat adapter** per the R18 frozen list — *preceded by the prompt-corpus grep* (seed skills, spells, identity/commands/spawner prompt sections, user skills) to confirm/adjust the list before freezing. Prompt composer transplant: manifest-reading only; command catalog re-targeted to the graph grammar + adapter verbs.
5. **Transcript artifact on exit** (doc entity `attached_to` the work_session) via the existing transcript approach.
6. **Spell engine port** (R24/R19): rule evaluation over graph events; `equips`-driven manifest injection verified end-to-end.

**Gate G3 (= Phase 1 done):** 04 §7 acceptance — full spawn→work→report-back→complete loop, coordinator spawning workers through `execution.spawn`, `session prompt` delivered into a live PTY, terminal perf at parity (regression bar: old maestro on the same machine), all golden workflows + a two-agent orchestration scenario green.

## 6. Orchestration shape (for the build coordinator)

Ground rules inherited verbatim from the Collab V2 UI orchestration (proven this week): workers never run git (lead commits per verified wave); package-disjoint ownership; no parallel vite builds; scoped `tsc`/`vitest` verification; bypass permissions; re-brief with a STATE.md maintained at every gate; independent verifier from mid-build onward.

| Wave | Who (shape) | Scope | Gate |
|---|---|---|---|
| W0 | lead alone | §2 M0: scaffold, contract, conformance harness, migration runner | G0 |
| W1 | 3 parallel | db/migrations+RPCs+RLS · identity block · sidecar+scheduler ops | migrations apply clean; RLS negative tests; identity unit tests |
| W2 | 2–3 parallel | facade+derived truth · event mapper+WS · conformance completion | **G1 (M1)** |
| W3 | 2 parallel | UI transplant+RealFacade · browser-app boot/serving | **G2 (M2)** |
| W4 | 3 parallel | execution lifts+policy re-map · SpawnService+`execution.*` · CLI+adapter (+grep first) | integration checkpoints |
| W5 | lead + verifier | spell engine port, transcript, acceptance runs, perf parity measurement | **G3 (Phase 1 done)** |

Model policy: lead + the two highest-leverage builders (contract/graph-engine, SpawnService) on Fable 5; remaining workers Opus-class; independent verifier Fable 5. Sizing ~10–12 worker-sessions across waves.

Dependencies on in-flight work: W3 waits on Atlas's W5 (UI complete) — if tm8 W0–W2 finish first, that's fine; M1 is headless by design. The contract package should be authored from the *UI's actual `types/`* + api-design docs so the transplant diff at W3 is near-zero; if `execution.*` types land in the contract before Atlas finishes, relay once to Keystone per that plan's §7 protocol.

## 7. Risks and their controls

| Risk | Control |
|---|---|
| Conformance suite under-specifies the contract (green ≠ correct) | Port the UI's tests *and* add taxonomy/cursor/idempotency/RLS suites (G0 deliverable, reviewed by verifier at W2) |
| SpawnService parity drift (subtle launch-config/permission precedence differences) | Old code kept as behavioral oracle; parity fixture: same inputs → manifest diff = ∅ across a recorded scenario set |
| `execution.prompt` silently undelivered (R17's failure mode) | G3 includes a scripted coordinator→worker prompt round-trip asserted on PTY output, not on graph state |
| Terminal perf regression via the graph path | T-L10 forbids it structurally; G3 measures against old maestro on the same machine (04 §4 lessons pre-loaded) |
| Sidecar distribution pain (signing/size per platform) | R15: PGlite trigger = distribution failure only; decision point logged, schema never forks |
| Scope creep from Phase 2 (gateway/hub temptation) | Phase 1 has zero remote surface; identity seam documented but unexposed. Hub work starts only after G3. |

## 8. R-condition traceability (accepted per T-D20)

| R | Landed in |
|---|---|
| R1, R6 | §3.2 identity block; 001/002 migrations |
| R2 | 002/008 migrations (claims + low-priv role); §3.3 facade |
| R3, R11, R12 | Phase 2 (bridge) — contract shapes reserved in §2 |
| R4, R5 | Phase 2 (gateway); noted in §7 scope control |
| R7–R9 | 005 migration + §4 KindRegistry runtime path |
| R10, R16, R17 | §2 contract family; §5.3 |
| R13 | Phase 2 export; `pg_dump` backup in R15 scope now |
| R14 | deferred (T-D20); outbox transport-agnostic in 003 |
| R15 | §3.3 sidecar + §1 ports/locking |
| R18 | §5.4 CLI + grep-before-freeze |
| R19, R24 | §3.3 spell-engine stub → §5.6 port |
| R20, R29 | §5.1–5.3 (single-writer, debounce, payload preservation) |
| R21 | §2 conformance harness; M1/M2/M3 structure |
| R22 | Phase 2+ (dispatcher slot) |
| R23 | Phase 3 (mobile thin client) |
| R25 | §3.3 facade: workspace-scope collections variant for Home/Inbox |
| R26 | §3.3 scheduler |
| R27 | §5.2 SpawnService as a planned build |
| R28 | §5.1 policy re-map |

---

<!-- ======================= 10-SECURITY-MODEL.md ======================= -->

# tm8 — Security Model (v1: the local node, server + web)

**Status:** DRAFT v1 (2026-07-25) — authored by Vega per AM-2 P0-4 (adopted implementation review). Scope: Phase 1 local node under AM-1/T-D21 (no Tauri; browser UI on 4611/served bundle + tm8-server on 4610 + sidecar PG on 5442; server-side PTY execution). Phase 2 (gateway/hub/hosted) inherits the seams named in §9 and gets its own hardening pass.

**The core fact this document exists for:** tm8 v1 is a *browser-controlled arbitrary-code-execution system*. The web UI spawns agent sessions that run real shells with the user's credentials on the user's machine. RLS answers "who may read/write which graph rows"; everything else here answers "who may reach the server at all, and what can a reached server be made to do."

## 1. Assets and adversaries

**Assets:** the user's filesystem + shell (via PTY), provider API credentials (Claude/etc.), the graph DB (may contain private work), transcripts/logs/backups, git repositories (possibly with push credentials).

**Adversaries in scope for v1:**
- A1 Malicious web page in the same browser (drive-by): CSRF, DNS rebinding, WebSocket cross-origin hijack.
- A2 Other local processes/users on the machine (shared machines): port access, data-dir access.
- A3 Malicious repository content checked out into a project (compromised deps, hooks, prompt-injection payloads in files an agent reads).
- A4 Malicious or compromised agent output (prompt-injected agent attempts privileged CLI/API calls).
- Out of scope v1 (Phase 2+): remote network attackers (server is loopback-only by default), multi-tenant isolation, malicious space members (single-owner node).

## 2. Network binding and transport

- **S1. Loopback-only by default.** tm8-server binds `127.0.0.1:4610`; sidecar PG binds `127.0.0.1:5442`; Vite dev binds `127.0.0.1:4611`. Non-loopback binding (`TM8_BIND`) is an explicit opt-in and **requires token auth (S8) — the server refuses to start non-loopback with auth disabled.**
- **S2. Host-header allowlist** (DNS-rebinding defense): requests must carry `Host: localhost:4610`, `127.0.0.1:4610`, or an explicitly configured hostname; otherwise `403`. Applies to HTTP and the WS upgrade.
- **S3. WS Origin check:** the `/v2/ws` upgrade (and any PTY stream socket) rejects browser origins other than the served UI origin(s) (`http://localhost:4610`, `http://localhost:4611` in dev, configured origins otherwise). Non-browser clients (CLI) send no Origin — allowed, they authenticate per S8.
- **S4. CORS:** same-origin only. No `Access-Control-Allow-Origin: *`, no reflected origins. The UI is served by tm8-server (or the dev server proxies) precisely so cross-origin API access is never needed.

## 3. Browser-facing auth (CSRF posture)

- **S5.** v1 local mode auto-authenticates the owner (T-L7) — but **auto-auth only applies to requests that pass S1–S4** (loopback + Host + Origin discipline). A cross-site form-POST or rebound-DNS request never gets the auto-owner identity.
- **S6.** If cookies are used for the browser session they are `HttpOnly; SameSite=Strict`; state-changing endpoints additionally require a custom header (`X-TM8-Client`) that simple cross-site requests cannot set. Bearer-token clients (CLI, rigs) are exempt from cookie CSRF rules by construction.
- **S7.** The poll-fallback endpoint and all `/v2/*` reads obey the same rules — no "harmless" unauthenticated reads; graph reads leak private work.

## 4. Non-browser clients

- **S8. Token auth for CLI/agents:** `tm8` CLI and spawned agents authenticate with a node-issued bearer token (from `auth_sessions`), delivered to agent sessions via the manifest env, scoped to the agent's `team_member` identity (`can_act_as` resolves through the owner, T-L7). Tokens are revocable (session row deletion) and expire per R6 lifecycle.
- **S9.** The DB claims path stays per R2/T-L11: tm8-server owns the PG connection as a **low-privilege role**, sets `SET LOCAL` claims per transaction; no client ever holds DB credentials; no service-role bypass exists.

## 5. Execution safety (spawn, PTY, worktrees)

- **S10. Spawn only through the catalog.** `execution.spawn` is the sole session-creation path (work_session is excluded from `entities.create`), so RLS + capability gating + the command ledger see every spawn. Governance minimums: per-node concurrent-session cap (config, default 8) → `limit_exceeded`; `execution.terminate` is the universal cancellation path; every `execution.*` command lands in `command_ledger` (audit).
- **S11. Path discipline.** Session cwd/worktree paths are **server-computed** from the project's registered `workingDir` — never accepted raw from the client. Computed paths must resolve (after symlink resolution) inside the project root or the node's worktree area; otherwise `invalid_input`. Same rule for transcript/blob write paths (§7).
- **S12. Project trust levels.** A `project` carries `trust: trusted|untrusted` (AM-2). Spawning into an `untrusted` project requires an explicit per-spawn confirmation flag (`confirmUntrusted: true`); manifests for untrusted projects note the trust level so agent prompts can warn. v1 does not sandbox — trust is informed consent, and that is stated honestly in the UI copy.
- **S13. Prompt injection containment (v1 posture):** agents act with their own `team_member` identity and its command permissions — never with a broader identity; the compat adapter + graph CLI enforce per-persona `command_permissions` server-side (not just in the prompt). Destructive graph ops an agent's persona lacks are `forbidden` regardless of what the model asks for.
- **S14. Streams.** PTY attach requires `execution.streams.attach` authorization resolved through the graph (T-L10; `share_mode` + membership). Stream sockets obey S2/S3/S8. Frames never touch the DB; `drive` (input) mode is a later, separately-gated permission tier — v1 grants input only to the spawning owner.

## 6. Secrets

- **S15. Secrets never enter Postgres.** Provider API keys live in the OS environment / keychain and are injected into agent processes at spawn time by the execution block; `session_manifests` stores *references* (env var names), never values. Consequence: pg_dump backups are secret-free by construction.
- **S16. Redaction.** Transcript artifacts and server logs pass a redaction filter (known credential patterns: `sk-`-style keys, bearer headers, `AWS_`/`ANTHROPIC_`/`OPENAI_` env values seen in the clear) before storage. Redaction is best-effort and stated as such; S15 is the real defense.

## 7. Blob I/O safety (files.*)

- **S17.** Blob storage lives under the node data dir at `blobs/spaces/<spaceId>/<uuid>` — server-generated names only; client-supplied filenames are metadata, never paths. Upload requires the same membership RLS as the graph (invariant: graph RLS and blob authz never disagree); size limits and checksum verification on `uploadComplete`; MIME is stored as declared but served with `X-Content-Type-Options: nosniff` and a conservative `Content-Disposition` for non-media types.
- **S18.** Backups include blobs + registry + transcripts (AM-2): the scheduled backup job pairs `pg_dump` with a blob-dir snapshot; restore is a tested path (G1B acceptance), not a hope.

## 8. Data-dir hygiene

- **S19.** `~/.tm8*` created `0700`; PG `--auth=trust` is acceptable only because PG binds loopback and the dir is user-private — hosted compositions (Phase 2) use password/peer auth provisioned by the gateway.
- **S20.** Single-instance locking (R15) prevents two servers sharing one data dir; the lock file records pid+port for honest `doctor` diagnostics.

## 9. Phase 2 seams (named, not built)

Remote-facing auth surface (gateway) authenticates against the identity block (R1); bridge JWTs at verifying boundaries (R2); hosted-workspace quotas/isolation (process-per-user per maestro-gateway Design A); bridge fetch-blob authorization. None of this is reachable in v1: there is no remote surface (S1).

## 10. Acceptance (folds into gate G1A)

1. Server refuses non-loopback bind without auth; refuses bad Host; WS upgrade rejects foreign Origin (scripted negative tests in tools/conformance security suite).
2. Cross-site form-POST and rebound-Host mutation attempts fail (403/401) — rig-scripted.
3. Spawn path traversal attempts (`../`, symlinked project dir) → `invalid_input` (test).
4. Untrusted project spawn without `confirmUntrusted` → `forbidden` (test).
5. Manifest for a session with provider creds present in env contains no secret values (test greps manifest JSON).
6. Concurrency cap → `limit_exceeded`; terminate mid-run → single-writer transition to `exited` + ledger rows for both commands (test).
7. Blob upload with wrong checksum rejected; download without membership → `forbidden` (test).
