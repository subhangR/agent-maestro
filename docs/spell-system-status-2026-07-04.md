# Maestro Spell System — Status Report

**Date:** 2026-07-04
**Branch:** `staging`
**Author:** Maestro worker (`sess_1783163443187_jr4l3d52y`)
**Method:** graphify-oriented, 4 parallel layer audits (server / CLI / UI / tests+docs), every finding read against actual source; server test suite executed.

---

## TL;DR

The **v2 multi-rule spell redesign shipped** (commit `670bfe8`) and the core engine is **working and well-tested**. Both blockers from the pre-implementation review — F1 (run-command 4s starvation) and F2 (unbound SubagentStop/SessionEnd hooks) — are **fixed**. The proposed improvements PI-1 (discriminated union), PI-2 (per-event action matrix, enforced in Zod), PI-3 (rule labels), PI-4 (async run-command), PI-7 (matrix + seed-contract tests), PI-10 (rule caps) all landed.

The **weak seam is the activation layer**: cast modes / ensembles, spell enable-toggle, and per-rule loop-reset are UI-stubbed because the corresponding server endpoints don't exist yet. There are also two **functional dead-ends** (notify-channel routing, `spell:rule_fired` not forwarded to UI), **zero UI test coverage**, and **stale docs** that still describe the dropped `gate`/single-action model.

**Overall: 🟢 Core engine production-viable · 🟡 activation UX + a few edges incomplete.**

---

## What works (verified)

| Area | Status | Evidence |
|---|---|---|
| Multi-rule data model (discriminated union) | ✅ | `types.ts:650-704` — `SpellActionConfig` union, `Spell.rules: SpellRule[]` |
| Per-event action matrix, **enforced in Zod** | ✅ | `ACTIONS_BY_EVENT` `types.ts:676`; `spellRuleSchema.superRefine` rejects illegal action/event `validation.ts:636-643` |
| **F1** run-command async fire-and-forget (no 4s starvation) | ✅ | `execRunCommand` returns immediately, delivers `feedOutput` via `session:prompt_send` `HookDispatcherService.ts:286-356` |
| **F2** all 8 hook events bound | ✅ | `HOOK_EVENTS` (8) `hook.ts:8-17`; SubagentStop + SessionEnd bound in **both** `plugins/*/hooks/hooks.json` |
| **F3** SessionEnd terminal gating | ✅ | enforced via matrix in schema |
| **F8** idempotent re-cast preserves counters | ✅ | `activateSpell` keeps `ruleIterations` for unchanged rule ids `SpellService.ts:949-959` |
| **F6** orphaned `ruleIterations` GC on update | ✅ (server) | `reconcileRuleIterations` `SpellService.ts:887-923` |
| Schedule triggers rejected at save | ✅ | `superRefine` "not available yet" `validation.ts:627-634`; dispatcher skips `HookDispatcherService.ts:135` |
| **PI-10** rules `.min(1).max(20)` + `MAX_RUN_COMMANDS_PER_DISPATCH=5` | ✅ | `validation.ts:651,659`; `HookDispatcherService.ts:47` |
| run-command security: `execFile` (no shell), self-only guard, `feedOutput` default off | ✅ | `hookRoutes.ts:23-31`; `HookDispatcherService.ts:316,335` |
| ReDoS defense (isSafeRegex + 4096 matcher cap) | ✅ | `validation.ts:541-561`; `HookDispatcherService.ts:49` |
| CustomSpellEditor rebuilt to per-rule (add/remove/enable, action-scoped config, live summary, run-cmd ack, advanced matcher) | ✅ | `CustomSpellEditor.tsx` full rewrite |
| UI fully migrated off scalar `iteration` → `ruleIterations` | ✅ | `useActiveSpellsStore.ts:18` |
| Clean-break v2 migration (deletes old spell files, strips stale activeSpells) | ✅ | `container.ts:120-177` |
| Server dispatcher tests | ✅ **21/21 pass** | `hook-dispatcher.test.ts` (incl. PI-7b seed-contract test) |

---

## Gaps & issues (ranked)

### 🔴 High — functional gaps users would hit

1. **Cast mode & ensembles are UI-only illusions.** The launcher lets users pick broadcast vs **coordinate** and name an ensemble, but `castSpell` calls `activateSpell(spellId, targetSessionIds, invokerSessionId)` and **drops `castMode`/`ensembleName`** (`useSpellActivationStore.ts:41-47`). `maybeCreateEnsemble` is a no-op stub (`SpellLauncher.tsx:449`). → Coordinate casts silently behave as plain broadcast; ensembles are never created server-side.

2. **No real enable/disable or loop-reset endpoints.** `setSpellEnabled` fakes a toggle by re-casting (which **resets loop counters** — the F8 trap resurfaces at the UI seam), and `resetIteration` is optimistic-only with no server persistence (`useSpellActivationStore.ts:73-92`; no `/reset` on the client). State desyncs on refresh until the dispatcher next writes counters.

### 🟠 Medium — dead-ends & missing hardening

3. **`notify-channel` is a functional dead-end.** `channel` is threaded into the `notify:progress` payload but **no consumer routes by it** — no server relay, and the UI handler ignores it (`useMaestroStore.ts:626`). Notifying a named channel does nothing end-to-end. (Note: the `maestro-notify`/OpenClaw skill path is separate and unwired to this.)

4. **`run-command` ignores `commandPermissions`.** The dispatcher executes any configured command regardless of the team member's permission set; the editor gates only behind a self-ack checkbox (`CustomSpellEditor.tsx:614`). Review F5's request to gate authoring/exec behind `commandPermissions` is unimplemented. Mitigated by `execFile` (no shell expansion) + self-only guard.

5. **Per-rule loop reset not surfaced.** Store/API accept a `ruleId` for granular reset, but the chip menu and row always call reset with no `ruleId` (`ActiveSpellChip.tsx:63`, `ActiveSpellRow.tsx:58`) → "Reset loop" zeroes **all** loop rules. Ambiguous for multi-loop spells.

6. **`spell:rule_fired` observability never reaches the UI.** Emitted on the bus (`HookDispatcherService.ts:402-422`) but **not in the WebSocketBridge forward allowlist** (`WebSocketBridge.ts:23-25`). F1-class silent failures stay invisible to users.

### 🟡 Low — tests, docs, seeds

7. **Zero UI test coverage.** No vitest tests for any spell component or store (`CustomSpellEditor`, `SpellLauncher`, `useSpellLibraryStore`, `useSpellActivationStore`, `spellSummary`). The whole authoring/activation surface is untested.

8. **`docs/spell-system-explainer.md` is actively misleading.** Claims to be "grounded in staging code" but documents the **dropped `gate` action** and old single-action-per-spell model (`:46,434-498`). Contradicts shipped code. The four `docs/spells-*-design.md` files describe only the legacy invoke/template model with no multi-rule content and aren't marked superseded. `spell-system-redesign.md` §1–§10 retain pre-amendment prose behind a "§11 wins" disclaimer.

9. **Seed run-command hardcodes `npm run lint` (PI-8 residual).** `spell_lint_on_edit` + `spell_guardrail_combo` hardcode `npm run lint` (`FileSystemSpellRepository.ts:135,154`). Both ship **disabled** (a test enforces this), so no fresh-install misfire — but enabling without editing still assumes the script exists. Disabled-by-default defers rather than prevents the bad default.

10. **Dispatcher test matrix not exhaustive.** Missing assertions: 4096-char matcher cap, per-event `ACTIONS_BY_EVENT` legality at dispatch, missing run-command binary graceful degradation, colliding multi-rule iteration counters. CLI `spell-auto-activator.ts` untested.

11. **Dead code / stale bits.** CLI `hook-executor.ts` (192 lines) + its 30-case test are legacy skill-hook code with no production import — testing dead code. Stale `gate` vocabulary in `hook.ts:102` comment and `DispatchResult.blocked` (always false). `gate:[]` bucket + empty `skills` category in the UI launcher (intentional/harmless).

### Deferred by design (not bugs)

- **Schedule engine** — trigger schema exists, rejected at save; engine is a later phase.
- **CLI multi-rule Spell CRUD** — the `maestro spell` command covers only the legacy entity-invoke model; rule-Spells are UI-authored + auto-activated via `manifest.spells` only. No `create/list/activate` for rule-Spells from CLI (intentional this phase).
- **PI-5 dry-run test-fire** — "Test cast" is a live full-spell cast, not a per-rule dry-run.
- **Phase-2 multi-target fan-out / ensembles** — future.

---

## Recommended next steps (highest leverage first)

1. **Wire the activation seam** — add server endpoints for cast-mode/ensemble creation, spell enable-toggle, and per-rule loop reset; then delete the three UI stubs (`castSpell` drop, `setSpellEnabled` re-cast, `resetIteration` optimistic). This closes gaps #1, #2, #5 at once.
2. **Decide notify-channel** (#3): either thread `channel` end-to-end to a relay (OpenClaw/`maestro-notify`) or drop the field from v1 to stop advertising a dead capability.
3. **Forward `spell:rule_fired` over WS** (#6) + surface a minimal "why did this fire" log — cheap, unlocks observability of silent run-command failures.
4. **Gate run-command behind `commandPermissions`** (#4).
5. **Refresh docs** (#8): rewrite/retire `spell-system-explainer.md` and mark the legacy `spells-*-design.md` superseded.
6. **Add UI tests** (#7) for the editor + activation store; extend the dispatcher matrix (#10).
