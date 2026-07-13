# Spell System — Architecture Review & Production-Hardening Plan

**Date:** 2026-07-04 · **Base:** `staging` @ `6355198` · **Work branch:** `feat/spell-hardening` (worktree `~/Desktop/Projects/maestro/spell-hardening-wt`)
**Author:** Spell System Architect (coordinator `sess_1783187072919_0ijyw0phn`)
**Method:** graphify-oriented, 3 parallel layer audits (server / CLI / UI), every finding verified against source at `6355198`.
**Scope authority:** `docs/spell-system-production-hardening-brief.md` (locked decisions honored: no schedule engine, no Phase-2 fan-out, notify-channel scoped down to in-app, isolated branch + stop for human review).

---

## 1. Executive summary

The v2 multi-rule spell engine is architecturally sound and the recent Spell Studio merge (`6355198`) closed most of the previously reported activation-seam gaps: the reset-loop endpoint (with per-rule `ruleId`) exists end-to-end, `spell:rule_fired`/`spell:loop_reset` are WS-forwarded and consumed by a real activity feed, and the CLI now has the full 14-subcommand spell surface.

What remains is concentrated in four places:

1. **Security:** `run-command` executes with zero permission gating and no in-flight concurrency ceiling (`HookDispatcherService.ts:316` — straight to `execFile`).
2. **The cast seam:** the server has a full `EnsembleService` + `/api/ensembles` routes, but `POST /api/spells/:id/activate` doesn't accept `castMode`/`ensembleName`, and the UI drops both before the call (`useSpellActivationStore.ts:43`) — coordinate casts silently degrade to broadcast.
3. **Honesty of the surface:** `notify-channel`'s `channel` field is threaded to `notify:progress` and then ignored everywhere (UI plays a sound, shows nothing); `DispatchResult.blocked` is permanently false; "Test cast" is a live cast with no dry-run.
4. **Test debt:** zero UI tests for the entire spell surface; dispatcher matrix missing four known cases; CLI auto-activator untested; a 210-line dead CLI service (`hook-executor.ts`) carries a 30-case test for code nothing imports.

Everything is fixable within the locked scope. The plan below is organized as four package-disjoint work streams with the cross-package API contracts decided **here, up front** (§4), so streams can proceed in parallel against a stable contract.

---

## 2. Architecture as-built (verified)

### 2.1 Data model (server `types.ts` ~L595–850)
`Spell` holds 1..20 `SpellRule`s; each rule `{ trigger, action, enabled, label?, id }`. Trigger is a discriminated union `hook | schedule` (schedule schema-ready, rejected at save — stays that way per scope). Action is a 5-way discriminated union (`inject-prompt`, `feed-context`, `run-command`, `continue-loop`, `notify-channel`). `ACTIONS_BY_EVENT` (types.ts:676) is the single legality source, enforced in Zod (`spellRuleSchema.superRefine`, validation.ts:636) and mirrored in the Studio editor dropdown.

### 2.2 Runtime flow
CLI binds all 8 hook events (both plugins' `hooks.json`, verified identical) → `maestro hook dispatch <EVENT>` → `POST /api/hooks/dispatch` (self-only guard, `X-Session-Id`) → `HookDispatcherService` re-reads active spells, matches (event + optional safe-regex matcher, 4096-char target cap), executes actions, composes a `DispatchResult` → CLI folds into exit code (0 allow, 2 continue-loop on Stop/SubagentStop only) + stdout (feed-context). `run-command` is async fire-and-forget `execFile` (no shell), optional `feedOutput` streamed back later via `session:prompt_send`. Fail-open by design: an erroring rule is skipped, the rest run; there is deliberately **no block path**.

### 2.3 Activation
`activateSpell` attaches `ActiveSpell` to `Session.activeSpells`; idempotent re-cast preserves `ruleIterations` for unchanged rule ids (SpellService.ts:953); `reconcileRuleIterations` GCs orphans on spell update. Auto-activation at spawn from `manifest.spells` (CLI `spell-auto-activator.ts`). Per-rule loop reset: `POST /api/spells/:id/reset-loop {sessionId, ruleId?}` → `spell:loop_reset` (SpellService.ts:1016–1049).

### 2.4 Observability
`spell:rule_fired` (per rule, with outcome) and `spell:loop_reset` are in the WebSocketBridge IMMEDIATE_EVENTS set (WebSocketBridge.ts:26–27, bypass batching). UI consumes all five `spell:*` events (`useMaestroStore`) and renders `SpellActivityFeed` (real-time, error-highlighted, `aria-live`).

### 2.5 UI
`SpellStudio` (portal at AppModals.tsx:687, Cmd/Ctrl+Shift+S) + `SpellbookDrawer` (Cmd+Shift+B) are the live surfaces, backed by `useSpellStudioStore` / `useSpellLibraryStore` / `useSpellActivationStore` / `useActiveSpellsStore`. The pre-Studio components (`CustomSpellEditor.tsx`, `SpellLauncher.tsx`, `SpellDetailFlyout.tsx`, root-level `ActiveSpellChip/Row/Panel`) are **orphaned** — nothing mounts them.

### 2.6 Ensembles (server-complete, client-orphaned)
`EnsembleService` creates/persists ensembles, stamps the coordinate spell onto member sessions, fans out decorated prompts (`EnsembleService.ts:51–95, 173–217`). Full REST surface exists (`api/ensembleRoutes.ts`: CRUD + members + message + disband). The UI has `useEnsembleStore` + ensemble components but the cast path never reaches any of it.

---

## 3. Findings — prioritized

### P0 — security & correctness (must fix)

| # | Finding | Evidence |
|---|---------|----------|
| P0-1 | `run-command` has **no permission gating**: dispatcher execs any configured command regardless of the session's team member permissions; only author-time self-ack checkbox in editor | HookDispatcherService.ts:316–323 (straight `execFile`); ActionPanels.tsx:103 |
| P0-2 | **No global/per-session in-flight run-command cap** — only per-dispatch (5). A fast event stream accumulates unbounded children | HookDispatcherService.ts:47 |
| P0-3 | **Cast mode/ensemble dropped**: `activate` API takes no `castMode`/`ensembleName`; UI collects then discards them (`CastSpellInput` literally annotated "UI-only") | spellRoutes.ts:196–209; useSpellActivationStore.ts:40–47; maestro.ts:984–987 |
| P0-4 | **activeSpells read-modify-write race**: concurrent activations on one session can drop an update (no per-session serialization) | SpellService.ts:933–982 |

### P1 — honesty, resilience, observability

| # | Finding | Evidence |
|---|---------|----------|
| P1-1 | `notify-channel` dead promise: `channel` hint consumed by nothing; UI handler for `notify:progress` plays a sound only — no visible notification | HookDispatcherService.ts:368–371; useMaestroStore `notify:progress` case |
| P1-2 | No dry-run anywhere ("Test cast" is a live cast) | hookRoutes.ts:16; CastPanel.tsx |
| P1-3 | Enable/disable is a fake toggle (deactivate/re-activate round-trip, optimistic desync risk on network failure) | useSpellActivationStore.ts:73–81 |
| P1-4 | Spell deletion leaves orphaned `spellId`s in sessions' `activeSpells` (dispatcher skips gracefully, but state lingers) | HookDispatcherService.ts:74 |
| P1-5 | `atomicWriteFile` doesn't ensure parent dir exists | atomicWrite.ts:8 |
| P1-6 | Cast failure in Studio is silent (no error toast) | CastPanel catch block |
| P1-7 | run-command children not reaped on shutdown; no kill on container stop | HookDispatcherService.ts:316–348 |

### P2 — tests, hygiene, docs

| # | Finding | Evidence |
|---|---------|----------|
| P2-1 | Zero UI tests for any spell component/store (vitest + testing-library present, 20+ non-spell tests to pattern-match) | `src/__tests__/` |
| P2-2 | Dispatcher matrix missing: 4096 matcher-cap assertion, per-event legality at dispatch time, missing-binary degradation, colliding rule-id counters | hook-dispatcher.test.ts (488 lines, otherwise good) |
| P2-3 | CLI `spell-auto-activator.ts` untested; errors logged debug-only (silent in normal runs) | spell-auto-activator.ts:19–29 |
| P2-4 | Dead CLI code: `services/hook-executor.ts` (210 lines) + 187-line test, zero production imports; stale `gate` comment at hook.ts:102 | grep-verified |
| P2-5 | Orphaned legacy UI components (§2.5) — dead code post-Studio | AppModals/grep-verified |
| P2-6 | `docs/spell-system-explainer.md` documents the dropped gate/single-action model as current; `spells-*-design.md` unmarked legacy | docs |
| P2-7 | Seeds `spell_lint_on_edit`/`spell_guardrail_combo` hardcode `npm run lint` (ship disabled, but enabling assumes the script) | FileSystemSpellRepository.ts:135,154 |
| P2-8 | Library is thin (7 seeds) — brief calls for ~5–8 excellent new spells | FileSystemSpellRepository.ts:20–168 |

### Explicitly deferred (locked by product owner — do not build)
- Schedule/cron trigger **engine** (trigger stays rejected-at-save).
- Phase-2 multi-target/multi-session fan-out beyond the castMode/ensemble wiring above.
- External notification relay (OpenClaw/Telegram) — notify-channel is in-app only.
- PI-9 structured matcher builder (optional polish; skip unless free).

---

## 4. Locked cross-package contracts (all streams implement against these)

### C1 — Cast mode & ensembles
`POST /api/spells/:id/activate` body gains optional:
```ts
castMode?: 'single' | 'broadcast' | 'coordinate'   // default 'broadcast' semantics unchanged
ensembleName?: string                                // only meaningful with 'coordinate'
```
Server behavior: `single`/`broadcast` — unchanged (attach to `targetSessionIds`). `coordinate` — additionally create (or reuse by exact name+spellId) an Ensemble via `EnsembleService` with the target sessions as members, emit `ensemble:created`; response includes `ensembleId`. Validation in `validation.ts` (Zod). UI: `MaestroClient.activateSpell` gains the two params; `useSpellActivationStore.castSpell` stops dropping them; `useMaestroStore` handles `ensemble:*` events into `useEnsembleStore`. Remove the "UI-only" annotations in `maestro.ts`.

### C2 — Dry-run (test-fire)
`POST /api/hooks/dispatch` body gains `dryRun?: boolean`. When true:
- **Bypasses the self-only guard** (it is side-effect-free; any client incl. the UI may probe any session).
- Runs full matching + composition logic against the provided payload; executes **nothing** (no execFile, no prompt_send, no counter increments, no domain events).
- Returns the normal `DispatchResult` shape plus `dryRun: true` and per-rule match report: `matched: [{spellId, ruleId, action, wouldExecute, skipReason?}]`.
CLI: `maestro hook dispatch <EVENT> --dry-run` prints the match report (exit 0 always). UI: per-rule "Test fire" button in SpellDetail/editor calls it with a synthetic payload for the rule's event and renders the report inline. This replaces nothing — live "Cast" stays as is.

### C3 — notify-channel scope-down (in-app, honest)
- **Drop the `channel` field** from the v1 action schema (`types.ts` + `validation.ts` + editor panel + seeds). Existing persisted spells: strip unknown field on load (repo normalize) — no migration file needed.
- `notify:progress` payload: `{sessionId, spellId, ruleId, message, level?: 'info'|'success'|'warn'}` (still IMMEDIATE over WS).
- UI: real in-app delivery — toast + a persistent entry in the notification/activity surface (reuse the existing toast pathway if present; otherwise minimal toast host). Sound stays.
- Editor copy rewritten: "Shows an in-app notification" — no relay language.

### C4 — Enable/disable toggle
`POST /api/spells/:id/toggle` `{sessionId, enabled: boolean, ruleId?: string}` — flips `ActiveSpell.enabled` (or a single rule's runtime enablement when `ruleId` given) **in place, preserving `ruleIterations`**; emits `spell:toggled`; WS-forwarded immediate. UI `setSpellEnabled` switches to it (delete the deactivate/re-activate dance).

### C5 — run-command permission gating + concurrency
Dispatch-time enforcement in `HookDispatcherService` before `execFile`:
1. Resolve the session's `teamMemberSnapshot`. If `permissionMode === 'readOnly'` → **block**.
2. Explicit opt-out honored: `commandPermissions.commands['spell-run-command'] === false` (or its group) → **block**. (Ground the exact key in how commandPermissions is consumed elsewhere; keep the well-known name `spell-run-command`.)
3. Server-level binary denylist (always): `sh, bash, zsh, dash, fish, ksh, csh, env, sudo` as argv[0]. Optional allowlist via config (`MAESTRO_SPELL_CMD_ALLOWLIST`, comma-separated): when set, only listed binaries run. Config lives in `infrastructure/config/Config.ts`.
4. Blocked runs are **observable, not silent**: emit `spell:rule_fired` with `outcome: 'blocked'` + reason; dispatch continues fail-open for other rules.
5. Concurrency ceiling: per-session in-flight run-command cap (default 3) + global cap (default 16), counted at spawn/reap; excess → skip with `outcome: 'skipped'` + reason. Children tracked and killed on service shutdown.
6. Auto-activated/shared spells get no special trust: same gates apply (the gate keys off the *executing* session's member, not the author).

### C6 — Seed/library ownership
`FileSystemSpellRepository.ts` `SPELL_LIBRARY` + a new dedicated `test/spell-library-seeds.test.ts` (seed-contract moves there from hook-dispatcher.test.ts) are owned by the **spells/docs stream** — the server stream touches seeds only for the mechanical compile fix when `channel` is dropped.

---

## 5. Work breakdown (package-disjoint streams)

| Stream | Scope (files) | Work |
|--------|----------------|------|
| **S — Server** | `maestro-server/src/**` (except FileSystemSpellRepository SPELL_LIBRARY), `maestro-server/test/**` (except seeds test) | C1 server side, C2 server side, C3 schema/types/payload, C4 endpoint, C5 full; P0-4 per-session activation serialization; P1-4 cascade cleanup on spell delete; P1-5 atomicWrite mkdir; P1-7 child reaping; P2-2 full dispatcher matrix + tests for every new behavior |
| **C — CLI** | `maestro-cli/**` | C2 `--dry-run`; P2-3 auto-activator test + non-debug error logging; P2-4 delete hook-executor.ts + test, fix stale gate comment; dispatch exit-code mapping tests |
| **U — UI** | `maestro-ui/**` | C1 client side + ensemble WS handling; C2 per-rule Test-fire UI; C3 toast/notification + editor copy; C4 toggle adoption; P1-6 cast error toast; P2-1 vitest coverage (editor store, activation store, spellSummary, active-spells store); P2-5 delete orphaned legacy components |
| **D — Spells & docs** | `docs/**`, `FileSystemSpellRepository.ts` SPELL_LIBRARY, `test/spell-library-seeds.test.ts` | P2-6 rewrite explainer + mark legacy docs superseded; P2-7 self-describing/resolved commands in seeds; P2-8 author new library spells (§6 of brief): no-secrets guardrail, conventional-commits, test-after-edit, type-safety sentinel, session recap, focus-keeper, refine plan-first/self-critic, notify-on-done (in-app); each documented (what/when/why safe) |

Sequencing: S/C/U start immediately in parallel. D starts with docs + spell design; edits `SPELL_LIBRARY` only after S lands the C3 type change (coordinator gates the handoff). Workers do **not** run git — the coordinator commits per-stream checkpoints (shared worktree, package-disjoint edits).

**Integration & verification (coordinator):** per-package `tsc --noEmit`; full server Jest with `--forceExit`; CLI + UI vitest; ONE serial browser run (`dev:web` :4570 against staging server :4569): create → save → cast (incl. coordinate/ensemble) → observe rule_fired in activity feed → dry-run test-fire → loop reset → in-app notification lands. Then stop and hand back for human review — **no merge to staging**.

## 6. Definition of done
Mirrors the brief §8: review doc committed + attached; all §3 P0/P1/P2 closed or explicitly deferred with rationale; no dead code or stale docs; 3/3 packages typecheck; all suites green; new spells schema-valid, safe-by-default, documented; real browser demonstration; "what changed & why" summary on the task.
