# Spell System — End-to-End Implementation: Orchestration Brief

**You are the orchestrator.** Deliver the complete Spell system experience — **UI (from the
provided prototype), backend wiring, CLI commands, and Claude Code hooks/commands** — as a
green, tested, pushed feature branch. You decompose the work, spawn and coordinate parallel
workers across frontend/backend/CLI, integrate, and verify end-to-end. You do NOT hand back
until it builds green, is CLI-testable, and has been run in a real browser.

Report final status to session **sess_1783030600760_957078kw8** (the lead that set you up).

---

## 0. Environment & isolation (HARD RULES)

- **Everything happens in THIS worktree** — the project workingDir is
  `/Users/subhang/Desktop/Projects/maestro/spell-ui-wt` on branch `feat/spell-ui-impl`
  (off staging, deps already `bun install`ed).
- **NEVER touch the shared staging tree** `/Users/subhang/Desktop/Projects/maestro/agent-maestro`.
- **Do NOT merge to staging.** Push `feat/spell-ui-impl`; the human + overseeing coordinator
  review before any merge.
- **Workers do NOT run git.** Only YOU (orchestrator/lead) commit and push, after verifying.
- **No concurrent `bun run build:ui`** (parallel vite builds SIGTERM-kill each other) — workers
  typecheck with `bunx tsc -b` / `bunx tsc --noEmit` only. The one real browser run is done
  once, serially, by you or a dedicated verifier at the end.
- **Package-disjoint worker scopes** (server / cli / ui split) so parallel workers don't
  collide on files. Each worker edits only its package.
- **Always independently verify** worker claims (re-run their typecheck/tests yourself).
- Workers spawned bypass-permissions, Opus. Don't stall on prompts.

## 1. The goal

A user must be able to do the FULL spell lifecycle both in the **UI** and headlessly via the
**CLI** (so a tester can drive it without the app):
- Browse the spell library; create/edit multi-rule spells in a clean editor; cast/activate
  onto sessions; manage active spells (loops, enable/disable, deactivate, reset); observe rule
  firings; one-shot casts (invoke); ensembles.
- Everything wired to the **already-shipped multi-rule backend** (this worktree is off staging,
  which already has the redesigned Spell model, dispatcher, validation, seeds, and hook wiring).

## 2. Source material (read all of it first)

- **Prototype (the target UI):** `docs/prototype/spells-standalone.html` — OPEN IT IN A BROWSER
  to see the intended design (`open` it, or serve it). It's a bundled React prototype
  (components include SpellStudio, SpellEditor, RuleBuilder, RuleSummary, SpellbookDrawer,
  Library, Launcher, Ensemble). The JS is minified — **treat it as a visual + interaction
  reference and rebuild cleanly in the real codebase; do NOT try to port minified bundles.**
  Decompressed resources are in `docs/prototype/extracted/` if useful (CSS/tokens/strings).
- **Requirements & contract (authoritative spec):** `docs/spell-ui-redesign/` — read all 6:
  - `00-README.md` (mental model: Automations vs one-shot Casts — keep them distinct),
  - `01-functional-requirements.md` (numbered FRs),
  - `02-config-and-options-reference.md` (every field/value/limit + capability matrix),
  - `03-surfaces-states-and-flows.md` (surfaces S1–S10, states, flows),
  - `04-backend-contract.md` (endpoints, types, WS events, stores),
  - `05-open-decisions.md` (UX decisions + the small backend additions to make).
- **Grounding:** the merged backend lives in this worktree under `maestro-server/`,
  `maestro-cli/`, `maestro-ui/`. Use graphify first (`graphify query`, `graphify explain`)
  then read real source. `docs/spell-system-explainer.md` + `docs/spell-system-redesign.md`
  (§11 authoritative contract) describe the current system.

## 3. Scope breakdown (spawn workers along these disjoint lines)

Lock the **shared contract** for the small new additions FIRST (types/endpoints), so FE and CLI
can build against it in parallel. The core Spell data model already exists — only these
additions need coordination.

### Track BE — `maestro-server/` (backend additions + wiring)
The data model/dispatcher/validation/seeds already exist. Add what the UI/CLI need:
- **Loop-reset endpoint** `POST /api/spells/:id/reset-loop { sessionId, ruleId? }` → zero
  `ruleIterations` + emit an update event (05 §D8; today the UI fakes it locally).
- **Forward `spell:rule_fired` over WebSocket** so the UI observability feed has live data
  (05 §D9; the dispatcher already emits it, the WS bridge doesn't forward it).
- Any REST gaps the CLI needs to fully drive spells headlessly (e.g. a way to list a session's
  active spells if not already exposed; a dry-run dispatch if you implement test-fire).
- Keep changes minimal and typed; add/extend server tests.

### Track CLI — `maestro-cli/` (the tester's headless surface) — HIGH PRIORITY
Today `maestro spell` only has entities/list/invoke/create(custom-prompt)/delete and does NOT
support the new multi-rule model or activation. Build a complete CLI so a tester can exercise
EVERYTHING without the UI:
- `maestro spell create` — author a full multi-rule spell (from `--file <json>` and/or flags),
  `spell list`, `spell show <id>`, `spell edit`, `spell delete`.
- `maestro spell activate <id> --targets <sessionIds>` / `deactivate`, `spell active [--session]`
  (list active spells on a session), `spell reset-loop`.
- Keep `spell invoke` (one-shot cast) working.
- Consider `spell test <id> --rule <ruleId>` (dry-run against a synthetic payload) if BE ships it.
- Ensure `maestro hook dispatch <event>` + the plugin hooks.json cover all 8 events (verify
  SubagentStop/SessionEnd wiring landed).
- Deliver a **CLI-driven end-to-end test script** (`docs/spell-cli-e2e.md` + a runnable script)
  that: creates a multi-rule spell → activates it on a session → fires hooks → asserts each
  action (INCLUDING a >4s run-command whose output is delivered, the F1 case) → invokes →
  lists active → deactivates. This is the tester's acceptance path.

### Track UI — `maestro-ui/` (implement the prototype, wire it) — split across FE workers
Build the surfaces from the prototype + spec against the existing stores/endpoints. Suggested
split (adjust to the prototype's actual structure):
- **UI-A — Library + Detail + Launcher/Cast** (S1, S2, S4): browse/search/filter, spell detail,
  target picker, cast modes, risky-confirm, undo receipt.
- **UI-B — Editor / Rule Builder** (S3, the centerpiece): rule-list with add/remove/reorder/
  collapse, per-event action filtering (ACTIONS_BY_EVENT), structured + advanced matcher,
  all 5 action config panels, run-command shell warning, live rule summaries, validation,
  discard guard, schedule-shown-disabled.
- **UI-C — Active surfaces + Spellbook + Ensembles + Observability** (S5–S9): rings/chips,
  loop progress + reset, enable/disable/deactivate, spellbook drawer, ensemble dock, and the
  new rule-fired activity feed (wire to the forwarded WS event).
- Shared: rule-summary language (`utils/spellSummary.ts` exists), design tokens/CSS from the
  prototype, real-time via `useActiveSpellsStore` (WS-driven source of truth).
- **The prior redesign shipped typecheck-only and was broken in the browser — do NOT repeat
  that.** This must actually render and work.

## 4. Suggested sequencing

1. **Contract lock (you + a quick BE spike):** finalize the 2–3 new endpoints/events + their
   types; write them into `04-backend-contract.md` as the addendum. Publish to all workers.
2. **Parallel build:** BE additions, CLI surface, UI-A/B/C — package-disjoint, against the
   locked contract. UI can start immediately (core types already exist).
3. **Integration (you):** re-verify each track's typecheck/tests; commit per track or once.
4. **End-to-end verification (mandatory, see §5).**
5. **Push + report.**

## 5. Definition of done (verify, don't assume)

- `maestro-server`: `bunx tsc --noEmit` green; jest spell suites green (the ~pre-existing
  SessionRouteDependencies suite failures are known-not-yours — confirm they're unchanged).
- `maestro-cli`: `bunx tsc --noEmit` green; the **CLI E2E script runs and passes**, including
  the >4s run-command feedback assertion.
- `maestro-ui`: `bunx tsc -b` green **and** the app runs in a real browser (start the staging
  dev stack once, serially) — create a multi-rule spell in the editor, cast it, see the active
  treatment, manage it, and confirm a rule fires. Capture what you observed.
- Claude Code hooks: all 8 events wired in both plugin hooks.json; a fired rule is observable.
- Branch `feat/spell-ui-impl` committed + pushed. NOT merged to staging.
- A final report to sess_1783030600760_957078kw8: what shipped, exact verification output,
  deviations, and anything deferred.

## 6. Coordination hygiene (from hard-won project lessons)

- Spawn identity-bearing workers (this project has a coordinator identity; spawn workers with
  the maestro-worker skill, Opus, bypass).
- Give each worker its package scope, the artifact pointers above, the "no git / no build:ui /
  worktree-only" rules, and a "report exact typecheck/test output" requirement.
- If two UI workers must touch the same file, sequence them or assign that file to one owner.
- Keep a running status; when a worker reports, independently verify before integrating.
