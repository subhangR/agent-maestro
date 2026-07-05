# Maestro Spell System — Production Hardening Brief (Fable handoff)

**Created:** 2026-07-04 · **Branch:** `staging` (spell system fully merged; Spell Studio UI merge commit `6355198`)
**For:** a strong model (Fable) to own end-to-end.
**Companion docs (read these first, in repo):**
- `docs/spell-system-status-2026-07-04.md` — the most recent independent status audit (gap list, severities).
- `docs/spell-system-redesign.md` — the authoritative v2 design (**§11 is authoritative; where §1–§10 conflict, §11 wins**).
- `docs/spell-ui-redesign/00-05` + `docs/spell-ui-redesign/CONTRACT-ADDENDUM.md` — UI requirements, config reference, surfaces/states, backend contract.
- `docs/spell-cli-e2e.md` + `docs/spell-cli-e2e.sh` — CLI end-to-end contract.

---

## 0. Your mission

Own the Maestro **spell system** end-to-end and take it to **production grade, everywhere** — server, CLI, and UI. Review the entire architecture, produce a plan, then execute: close every gap, fix every issue, harden security, add tests, tighten UX, and **author a set of high-quality new spells**. Leave it top-notch: correct, tested, observable, secure, and documented. Do your OWN comprehensive audit — the gap list below is a starting map from a prior handoff, not the ceiling. Verify each item against current `staging` before acting (several were just closed by the merge; don't redo them).

### Scope decisions (locked by product owner 2026-07-04)
- **Scope = HARDEN the current feature set + author new spells.** Make everything that exists production-grade.
- **OUT OF SCOPE — do NOT build:** the **schedule/cron trigger engine** and **Phase-2 multi-target/multi-session fan-out**. Leave them deferred (keep the schedule trigger rejected-at-save). Don't spend effort here.
- **notify-channel → scope down cleanly.** Do NOT build an external relay (OpenClaw/Telegram/etc.) now. Make `notify-channel` deliver a **reliable in-app notification** and stop advertising a `channel` capability that doesn't deliver (either drop the `channel` field from v1 or clearly mark it inert/future in schema + editor copy). No dead promises.
- **Merge policy = isolated branch, STOP for review.** Work on a dedicated worktree/branch off `staging`. When everything is green, **stop and hand back for human review — do NOT merge to `staging` yourself.**

---

## 1. What the spell system IS (full context)

A **spell** is a first-class entity that attaches contextual, event-driven behavior to a running Claude session. The v2 redesign (a **clean break** — the old `gate`/single-action model was dropped) made spells **multi-rule**:

- A `Spell` holds **1..20 `SpellRule`s**. Each rule is `{ trigger → action }`, independently enabled/disabled.
- **Trigger** (discriminated union on `type`): `hook` (fires on a Claude hook event, optional `matcher` regex) or `schedule` (**schema-ready but rejected at save — engine not built yet**).
- **8 hook events:** `PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStop, Notification, SessionStart, SessionEnd`.
- **Action** (discriminated union on `type`, 5 kinds): `inject-prompt`, `feed-context`, `run-command`, `continue-loop`, `notify-channel`.
- **`ACTIONS_BY_EVENT`** (in `types.ts`) is the single source of truth for which actions are legal per event, **enforced in the Zod schema** and mirrored in the editor dropdown. e.g. `continue-loop` only on `Stop`/`SubagentStop`; `SessionEnd` → only `run-command`/`notify-channel`.

**Runtime flow (hook dispatch):** the CLI binds every hook event once to `maestro hook dispatch <EVENT>`, which POSTs `/api/hooks/dispatch`. The server `HookDispatcherService` re-reads the session's active spells, matches rules, runs actions, and returns a `DispatchResult` the CLI folds into an exit code + stdout/stderr:
- `inject-prompt` → emits `session:prompt_send` (no stdout).
- `feed-context` → returns stdout (concatenated across rules, exit 0).
- `continue-loop` → exit 2 + reason on `Stop`/`SubagentStop` ("any continue wins"); per-rule iteration cap.
- `run-command` → **async fire-and-forget** `execFile` (NOT shell); `feedOutput:true` streams stdout back later via `session:prompt_send`. Decoupled from the hook response so slow commands (>4s) don't get starved.
- `notify-channel` → emits `notify:progress` with an optional `channel` routing hint.
- **No block path** — `gate` was dropped; `composeResult` never emits a block. Fail-open: a rule that errors is skipped, others continue.

**Activation:** `activateSpell` attaches an `ActiveSpell` to a session (`Session.activeSpells`), preserving `ruleIterations` for unchanged rule ids on re-cast. Spells can auto-activate at spawn from `manifest.spells` (`spell-auto-activator.ts`). A dedicated `reset-loop` endpoint zeros per-rule counters and emits `spell:loop_reset`.

**Curated library:** `SPELL_LIBRARY` seeds (in `FileSystemSpellRepository`) are `isDefault:true` (non-deletable), merged with user spells at read time. A seed-contract test validates every seed against the Zod schema.

---

## 2. Where the code lives (file map)

**Server** (`maestro-server/src`, CommonJS, Clean Architecture + DI in `container.ts`):
- `types.ts` (~L595–850) — Spell/SpellRule/SpellTrigger/SpellActionConfig/ACTIONS_BY_EVENT/DispatchResult.
- `application/services/HookDispatcherService.ts` — rule matching + action execution + composition.
- `application/services/SpellService.ts` — CRUD, activate/deactivate, resetLoop, ruleIterations reconcile.
- `api/spellRoutes.ts`, `api/hookRoutes.ts` (self-only guard) — REST.
- `api/validation.ts` — Zod schemas (discriminated union, superRefine, isSafeRegex, rules.max(20)).
- `infrastructure/repositories/FileSystemSpellRepository.ts` — persistence + SPELL_LIBRARY seeds.
- `infrastructure/websocket/WebSocketBridge.ts` — forwards `spell:*` events (incl. `rule_fired`, `loop_reset`).
- `domain/events/DomainEvents.ts` — typed events.
- Tests: `test/hook-dispatcher.test.ts`, `test/spell-reset-loop.test.ts`, `test/spell-activespells-persistence.test.ts`, `test/websocket-bridge-spell-firing.test.ts`.

**CLI** (`maestro-cli/src`, ESM):
- `commands/spell.ts` — full surface: `create/library/show/edit/remove/activate/deactivate/active/reset-loop` (+ `prompt-create`/`prompt-delete` for custom-prompt entities).
- `commands/hook.ts` — `hook dispatch <EVENT>`; `HOOK_EVENTS` (all 8); `HOOK_REQUEST_TIMEOUT_MS=4000`.
- `services/spell-auto-activator.ts` — casts `manifest.spells` at spawn.
- `plugins/maestro-worker/hooks/hooks.json` + `plugins/maestro-orchestrator/hooks/hooks.json` — bind all 8 events to `hook dispatch`.
- **Legacy/dead:** `services/hook-executor.ts` (+ test) — old skill shell-hook runner, no production import.

**UI** (`maestro-ui/src`, React 18 + Zustand): the new **Spell Studio** (`components/spells/studio/`): `SpellStudio.tsx`, `editor/` (SpellEditor, RuleCard, ActionPanels, MatcherField, Icon/ColorPicker), `active/` (ActiveSpellChip + menu, ring attrs), `spellbook/`, `detail/`, `ensemble/` (EnsembleSurface, list, message composer), `taskspell/`. Stores: `useSpellStudioStore`, `useSpellLibraryStore`, `useSpellActivationStore`, `useActiveSpellsStore`. Utils: `spellSummary.ts`, `spellRings.ts`. CSS: `styles-spell-studio/editor/active.css`. Open Studio with **Cmd/Ctrl+Shift+S**.

---

## 3. Current state (verified 2026-07-04, post-merge)

**Working & tested:** multi-rule model + discriminated unions; `ACTIONS_BY_EVENT` enforced in Zod; run-command async fire-and-forget (no 4s starvation); all 8 hook events bound in both plugins; SessionEnd action gating; idempotent re-cast preserves counters; `ruleIterations` GC on update; schedule rejected at save; rules cap (20) + per-dispatch run-command cap (5); ReDoS defense (isSafeRegex + 4096 matcher cap); execFile (no shell) + self-only hook guard + `feedOutput` default off; **reset-loop endpoint** + `spell:loop_reset`; **`spell:rule_fired` + `loop_reset` forwarded over WebSocket**; full headless CLI; Spell Studio UI merged + browser-verified (Library, Editor, create→save). Server spell+hook tests: **43/43 pass** (run with `--forceExit`).

---

## 4. Known gaps to fix (starting map — RE-VERIFY, then go beyond)

**🟠 Security / correctness**
- **`run-command` ignores `commandPermissions`.** The dispatcher executes any configured command regardless of the team member's permission set. Editor gates only behind a self-ack checkbox. Add real permission gating (author-time and/or exec-time), consider an allowlist/denylist, and decide the policy for auto-activated/shared spells.
- **`notify-channel` is a functional dead-end → SCOPE DOWN (not wire up).** `channel` is threaded into `notify:progress` as a hint but no relay delivers it. **Decision: do NOT build the external relay.** Make `notify-channel` deliver a reliable **in-app** notification, and remove the dead promise — drop the `channel` field from v1 (or mark it clearly inert/future in the Zod schema + editor copy). The bar is: no field that silently does nothing.
- **No global/per-session concurrent run-command ceiling** — only per-dispatch (5). A fast event stream can accumulate in-flight children. Add a session/global cap.

**🟡 Tests / quality**
- **Zero UI test coverage** for any spell component or store (Studio editor, activation store, spellSummary, rings). Add vitest coverage for the authoring + activation surfaces.
- **Dispatcher matrix not exhaustive** — missing: 4096-char matcher cap assertion, per-event `ACTIONS_BY_EVENT` legality at dispatch, missing run-command binary graceful degradation, colliding multi-rule iteration counters. Make it the full `event × action × matcher × iteration` table (PI-7).
- **`spell-auto-activator.ts` (CLI) has no test.**

**🟡 UX / activation seam**
- **Cast mode (broadcast vs coordinate) & ensembles** — verify these are fully wired server-side (activation payload carries castMode/ensemble; ensembles are actually created and messaged). If any of it is still a UI-only illusion, finish it.
- **Per-rule loop reset UI** — the store/API accept a `ruleId`, but confirm the chip menu/rows surface per-rule reset (not just "reset all").
- **Test-fire / dry-run (PI-5)** — "Test cast" is a live full-spell cast. Add a per-rule dry-run (`dispatch --dry-run`) that runs match + action logic against a synthetic payload with no side effects.

**🟡 Docs / hygiene**
- **`docs/spell-system-explainer.md` is actively misleading** — still documents the dropped `gate`/single-action model as current. Rewrite or retire it. Mark the legacy `docs/spells-*-design.md` (invoke-model) as superseded.
- **Dead code:** CLI `services/hook-executor.ts` (+ its 30-case test) — no production import. Remove or justify. Stale `gate` vocabulary lingers in a `hook.ts` comment and `DispatchResult.blocked` (always false).
- **Seed run-command hardcodes `npm run lint`** (`spell_lint_on_edit`, `spell_guardrail_combo`) — ships disabled, but enabling without editing assumes the script exists. Resolve the command from the repo's `package.json` scripts at activation, or make the default self-describing.

**Deferred — KEEP deferred (out of scope, per §0):** schedule/cron engine; Phase-2 multi-target fan-out. PI-9 structured matcher builder is optional polish (nice-to-have, not required).

---

## 5. Deliverables

1. **Architecture review** — a written review of the whole spell system (server + CLI + UI) with a prioritized plan. Save it as a repo doc (e.g. `docs/spell-system-architecture-review-<date>.md`) and attach it to this task.
2. **Fix everything** — close the gaps in §4 and anything your own audit surfaces. Production-grade: correct, secure, observable, resilient (fail-open where designed), no dead code, no stale docs.
3. **Tests** — server (exhaustive dispatcher matrix + seed-contract), CLI (auto-activator + dispatch), UI (Studio editor + activation store). All green.
4. **New spells** — author a set of genuinely useful, high-quality library spells (see §6). Each must pass the Zod schema (seed-contract test) and be safe by default.
5. **Verify for real** — typecheck all 3 packages, run the full server suite, and do a real browser run of the Spell Studio (create → save → cast → observe a rule fire). Don't ship typecheck-only (a prior redesign did and was broken in-browser).
6. **Docs** — update/replace stale docs so the system is accurately documented end-to-end.

---

## 6. New spells to add (author these + your own ideas)

Design each as multi-rule where it helps. Safe defaults (run-command seeds ship **disabled**; `feedOutput` off unless needed). Ideas:
- **Guardrail: no secrets** — `PreToolUse` matcher on Edit/Write, feed-context reminder to never commit secrets/keys.
- **Conventional commits** — `Stop`/`SubagentStop` inject-prompt nudging a clean commit message format.
- **Test-after-edit** — `PostToolUse` matcher on source files, run-command the repo's test script (resolved from package.json), `feedOutput` on.
- **Plan-then-execute** (exists as seed — refine) and **Self-critic refine** (exists — refine) — make them robust across repos.
- **Session recap** — `SessionEnd` notify-channel + run-command to write a short session summary doc.
- **Type-safety sentinel** — `PostToolUse` on `.ts` edits, run-command `tsc --noEmit` (resolved), feed failures back.
- **Focus keeper** — `Stop` continue-loop (`continue-until-done`) bounded by a sane maxIterations.
- **Notify on done** (exists — make it deliver a reliable in-app notification per the §4 scope-down; no external channel).
Pick the best ~5–8, make them excellent, and document what each does + when to use it.

---

## 7. Constraints & conventions (respect these)

- **Server = CommonJS**, CLI + UI = ESM. Server follows **Clean Architecture + DI** (`container.ts`); all API inputs validated with **Zod** in `validation.ts`; file repos use atomic writes.
- **Verify per-package with `tsc -b` / `tsc --noEmit`. Do NOT run concurrent `bun run build:ui`** (parallel vite bundles SIGTERM-kill each other). One serial browser run.
- **Server Jest needs `--forceExit`** (open handles otherwise hang the suite).
- **Server PTY/node-pty code runs under node, not bun** (onData won't fire under bun; bun strips the spawn-helper exec bit). Use node for anything spawning PTYs.
- **Hook dispatch is self-only** (`403 hook_self_only`) — you can't fire a hook for a session you aren't; prove rule-firing via the CLI running AS that session (see `docs/spell-cli-e2e.sh`).
- **Browser run (no Tauri):** `maestro-ui` has `dev:web` (`VITE_APP_MODE=browser`, port **4570**) against the staging server on :4569. Dismiss the "WELCOME TO MAESTRO" onboarding modal on fresh localStorage. Open Studio via Cmd/Ctrl+Shift+S (dispatch a native keydown if driving with Playwright).
- **Isolation:** work on a dedicated branch/worktree off `staging`; keep `build:ui` serial; do NOT merge to `staging` until a human/coordinator review. Report progress on this task.
- **`~/Downloads` is TCC-blocked** — use `~/Desktop` for any scratch artifacts.

---

## 8. Definition of done

- Architecture review doc committed + attached to this task.
- All §4 gaps closed (or explicitly deferred with rationale); no dead code; no stale docs.
- 3/3 packages typecheck clean; full server suite green (`--forceExit`); new server/CLI/UI tests added and passing.
- New library spells authored, schema-valid, safe by default, documented.
- Real browser run of Spell Studio demonstrated (create → save → cast → rule fires / loop resets / feed-context lands).
- A short "what changed & why" summary reported on task completion.
