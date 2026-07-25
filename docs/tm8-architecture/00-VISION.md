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
