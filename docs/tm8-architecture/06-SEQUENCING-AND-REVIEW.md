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
