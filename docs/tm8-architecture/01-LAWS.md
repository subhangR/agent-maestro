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
