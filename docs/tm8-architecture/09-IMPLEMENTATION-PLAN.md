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
