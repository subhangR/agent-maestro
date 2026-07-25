# Collab V2 API Layer — Design Overview

**Status:** Draft for user review
**Date:** 2026-07-25
**Author:** API design session (`sess_1784929602380_uqgmhgptx`, task `task_1784929562603_9sjhzw67s`)
**Scope:** Design only. Nothing here is implemented by this doc set; it defines the contract that implementation (on `feat/collab-v2-supabase-backend` and successors) must converge to.

---

## 1. What this doc set is

Collab V2 already has:

- a **first-principles data design** (`docs/COLLAB_V2_ENTITY_GRAPH_DESIGN.md`, on the backend branch): entities envelope + per-kind detail tables, homogeneous hierarchy, one typed edges table, unified messages anchored to any entity, points ledger, derived counters, version vs activity, asymmetric bridge, agents-as-actors, RLS as authorization.
- a **UI data contract** (`docs/COLLAB_V2_UI_DATA_CONTRACT.md`): the DTOs and route matrix the UI team is building against right now via a mock facade.
- a **partial implementation** on `feat/collab-v2-supabase-backend`: 8 migrations, ~30 RPCs, a maestro-server facade (~35 endpoints), a thin CLI.

What it does **not** have is a single, coherent API-layer contract that says: this is the layering, this is the resource grammar, these are the operations, this is how every consumer (UI, CLI, agent, MCP) maps onto them, this is the event model, this is the auth story — and here is exactly where the current implementation and the UI contract must change. That is this doc set.

## 2. The doc set

| Doc | Contents |
|---|---|
| `00-OVERVIEW.md` (this) | Scope, principles, decision log, flagged forks for user decision |
| `01-DATA-MODEL.md` | **A.** Final table catalog: every table/column/constraint/trigger/index; exists-today vs changes; resolutions for search, read marks, activity, visibility, approvals, saved views, notification outbox |
| `02-API-ARCHITECTURE.md` | **B.** Layering (SQL/RPC → service → transport facades) and the core resource grammar: uniform entity operations, kind commands, edges, messages, collections/graph, placements |
| `03-CONSUMER-SURFACES.md` | **C.** One core contract, four projections: UI DTOs, CLI (human + agent), programmatic/agent API, future MCP tool mapping |
| `04-COMMUNICATION-MODEL.md` | **D.** Canonical event contract + transport strategy, honest cursor pagination, error taxonomy, idempotency, optimistic reconciliation, end-to-end auth (and the removal of the UID bypass), rate/size limits |
| `05-COHERENCE-MATRIX.md` | **E.** Every UI surface / CLI command / agent workflow → API operations; explicit deviations from the UI data contract, each with a migration note |

## 3. Design principles (inherited and binding)

Every decision in this doc set traces to one of these; where a decision is a trade-off instead, it is marked **[trade-off]** inline.

1. **The graph is the API.** The API surface is generated from the entity model's four universal capabilities (hierarchy, messages, reactions/points, edges) plus per-kind intrinsic content. Uniform semantics first; kind-specific commands only where a transaction or invariant demands them (`complete_task`, `pull`, `link_pr`).
2. **One contract, many transports.** The logical contract (operations, DTOs, events, errors) is transport-independent. HTTP facade, CLI, and MCP tools are projections of the same operation catalog — never parallel APIs.
3. **RLS is the authorization source.** Every path to Postgres goes through the caller's identity; the facade adds no privileged shortcuts. Compound invariants live in security-definer RPCs that re-assert membership and `can_act_as`.
4. **Server owns derived truth.** Blocked rollups, PullState staleness, auto-tabs, counters, titles/excerpts are computed once, server-side, and delivered identically to every consumer.
5. **Agents are first-class consumers.** Context efficiency is a design constraint: one `walk` call returns a typed neighborhood; every mutation is idempotent (`clientMutationId`); every response is deterministic, typed JSON.
6. **Deployment-agnostic.** The same contract is served by local maestro-server today and any cloud deployment later. Nothing in the contract names Supabase; Supabase specifics live below the service layer.
7. **Honest mechanics.** Cursors are real keysets (uuidv7), not encoded offsets. Events are one canonical shape regardless of transport. Errors are typed and enumerable. If a capability is absent, the contract says so (capability flags), rather than a route pretending.

## 4. Method

Ground truth absorbed before designing: the four design docs above, plus a fresh three-way audit of the branch implementation (all 8 migrations; the server facade/service/repository; the CLI and UI data layers). Prior audit findings were independently re-verified and in places sharpened: offset pagination faked as cursors is facade-side (the DB has zero list RPCs and keyset-ready indexes); the UID bypass migration ships **enabled by default** with `anon` grants across all tables (full header-spoofable identity) — a live probe of the deployed Supabase project (2026-07-25, infra session) indicates it is **not currently applied there** (spoofed-header writes fail RLS), so the risk is latent-in-repo, activated by the next `db push`, not live-exploitable today; the realtime "split" has already collapsed to a 5-second poll with full-reload fan-out (the UI's direct Supabase client is dead code); idempotency keys are honored only for messages and points; and the write surface is further along than the docs claimed (edges/placements/move/complete/pull/work/docs/files/channels/inbox/read-marks all have deployed RPCs and routes) while the read projection (`EntityDetail`, capabilities, badges, grouping) is the real gap. `01`–`05` cite the confirmed state wherever it drives a design change.

## 5. Decision log (summary)

Filled as the doc set finalizes; each row links to the section that argues it.

| # | Decision | Where |
|---|---|---|
| D1 | Layering: Postgres (RLS + RPC) → CollabV2Service (operation catalog) → transport facades (HTTP, CLI, MCP) | 02 §2 |
| D2 | Uniform entity resource grammar; kind commands are explicit, enumerated, and few | 02 §3 |
| D3 | **[user-decided]** One canonical event contract (`WorkspaceEvent v2`) relayed by maestro-server; Supabase `postgres_changes` demoted to an internal feed; canonical events over the maestro WS bridge locally / SSE elsewhere | 04 §2 |
| D4 | Keyset cursor pagination on uuidv7 everywhere; offset forms removed | 04 §3 |
| D5 | **[user-decided]** maestro-server is the sole client-facing boundary; it establishes identity and mints short-lived Postgres JWTs it signs (server-held key, not service-role) so RLS stays the authorization source; no Firebase/Supabase token, key, or connection on any client | 04 §6 |
| D6 | UI data contract adopted with enumerated deviations (05 §3), not superseded wholesale | 05 |
| D7 | MCP mapping designed now (tool catalog 1:1 with operation catalog), built later | 03 §5 |
| D8 | RLS posture affirmed: SELECT-only policies + all writes via SECURITY DEFINER RPCs; SQL stays per-kind typed, uniformity lives in the service layer | 01 §6, §8.1 |
| D9 | Notification fan-out rewritten from all-members broadcast to targeted rules; dead `notification_outbox` revived as the FCM dispatch queue only | 01 §S7, §5.3 |
| D10 | Universal idempotency via a `command_ledger` replay table on top of existing domain keys | 04 §5, 01 §S8 |
| D11 | **[user-decided]** UID bypass killed at the sequence level — reversal is migration 1 and no forward migration can re-activate it (flag/header-fallback/anon-grants deleted, not disabled); kill-switch row kept only as break-glass remediation | 04 §6.3, 01 §8.2 |
| D12 | **[user-decided]** Search deferred entirely for v1 (no FTS); `search_index` + `search` RPC + CLI/MCP search documented as a reserved slot; command palette runs on recent/known entities only | 01 §S1, 02 §3, 03 §3.1 |
| D13 | **[user-decided]** Prod human sign-in = Firebase, verified server-to-server by maestro-server (invisible to clients), mapped to `user_profiles`; maestro-server mints the Postgres JWT (Reading B) | 04 §6.4 |

## 6. Forks — user decisions (resolved 2026-07-25)

All four originally-flagged forks were decided by the user; recorded here with the one remaining open scope question.

1. **Realtime transport** (04 §2) — **DECIDED as recommended:** maestro-server relays canonical `WorkspaceEvent`s over its WebSocket bridge locally / SSE elsewhere; `postgres_changes` is internal-only; clients hold no direct Supabase connection.
2. **Dev auth story** (04 §6) — **DECIDED, recommendation rejected:** no Firebase emulator, no Supabase auth in dev. Per user (*"no firebase or supabase, everything maestro server"*), maestro-server is the single client-facing boundary and establishes dev identities itself (server-issued, mapped to `user_profiles`), minting the same Postgres tokens as prod. Broader signal folded into D5/D12: clients/CLI/agents talk **only** to maestro-server, which brokers Postgres with server-held credentials.
3. **Search scope for v1** (01 §S1) — **DECIDED, deferred entirely:** FTS-only rejected; no search in v1. Schema slot (`search_index` + `search` RPC) kept documented so it's a later migration, not a redesign; palette runs on recent/known entities.
4. **UID bypass** (04 §6.3) — **DECIDED, kill-now:** removed from the migration sequence so it can never ship enabled; kill-switch row documented only as break-glass remediation.

### Still open — one scope question for the user

- **Prod human-identity source** (04 §6.4): the client boundary is settled (maestro-server only). What remains is whether, *upstream of* maestro-server in production, human sign-in is maestro-native (Reading A, literal "no firebase") or Firebase verified server-to-server and invisible to clients (Reading B). Both satisfy the client contract identically, so this is deferrable without touching the API surface. **Recommendation: Reading B near-term.** Flagged for the user to confirm scope.
