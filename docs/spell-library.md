# The Maestro Spell Library — Seed Design

> **Status: current as of 2026-07-04** (`feat/spell-hardening`). This is the design doc for
> the curated `SPELL_LIBRARY` seeds in
> `maestro-server/src/infrastructure/repositories/FileSystemSpellRepository.ts`. It is the
> spec the seed array implements and the seed-contract test
> (`maestro-server/test/spell-library-seeds.test.ts`) enforces.
>
> Read `docs/spell-system-explainer.md` first for the mechanics; the authoritative type
> contract is `docs/spell-system-redesign.md` §11.

## What a seed is

A seed is a curated `Spell` (`isDefault: true`, non-deletable) merged into the spell list
at read time. Seeds are **not auto-active** — they sit in the library until a user (or a
task's `spellIds`) casts them onto a session. Each seed holds 1..20 `SpellRule`s, each a
`{ trigger → action }` binding.

## Design principles (the seed-contract test enforces these)

1. **Schema-valid.** Every seed's `rules[]` passes the real Zod `createSpellSchema`
   (`api/validation.ts`). Seeds are TypeScript literals that bypass request validation, so
   without the test they can silently drift out of contract.
2. **Legal actions only.** Every rule's `action.type` is in
   `ACTIONS_BY_EVENT[trigger.hookEvent]` (e.g. `continue-loop` only on
   `Stop`/`SubagentStop`; `SessionEnd` → only `run-command`/`notify-channel`).
3. **Safe by default.** Every `run-command` rule ships **`enabled: false`** — a fresh
   install must never fire a command that may not exist. The user points it at a real
   command, then enables it. Non-executing actions (inject-prompt, feed-context,
   continue-loop, notify-channel) may ship enabled because a cast is always a deliberate
   act and they cannot run arbitrary code.
4. **`feedOutput` off unless needed.** Only rules whose value *is* the command's output
   (lint/test/typecheck sentinels) set `feedOutput: true`.
5. **Self-describing commands.** No `run-command` seed hardcodes a toolchain-specific
   command that assumes a project's scripts (the old `npm run lint` trap). A seed's default
   command either (a) is a genuinely universal invocation the description flags as an
   assumption (`npx tsc --noEmit`), or (b) is a harmless `echo` placeholder whose args tell
   the user exactly what to replace it with. Either way the **label and description state
   the assumption** so enabling it un-edited is never a surprise.
6. **No `channel` field.** `notify-channel` is in-app only; its config is just `message`.
   The `channel` field was removed from the v1 action union (dead promise — no relay ever
   consumed it). No seed sets it.
7. **Stable ids.** Refined seeds keep their existing ids
   (`spell_self_critic`, `spell_plan_first`, `spell_progress_pulse`,
   `spell_context_primer`, `spell_notify_on_done`, `spell_lint_on_edit`,
   `spell_guardrail_combo`) so existing activations/overrides survive. New seeds get fresh
   `spell_*` ids. Rule ids are unique within a spell; ids are unique across the library.

> **Matcher note (important for `Pre/PostToolUse`).** The dispatcher matches
> `Pre/PostToolUse` rules against the **tool name** (`payload.tool_name`), *not* the file
> path (`HookDispatcherService.matcherTarget`). So a matcher like `Edit|Write` fires on the
> Edit/Write tools; you **cannot** narrow by file extension (`\.ts$`) here. Sentinels that
> want "after a code edit" use `Edit|Write` and run their (project-wide) command regardless
> of which file changed. For other events the target is `matcherTarget`/`path`/`file_path`/
> `message`, so path/message matchers work there.

---

## The seeds

### 1. Self-Critic — `spell_self_critic` (refined)

- **Rules:** `Stop` → `continue-loop` `{ loopType: 'critic-refine', maxIterations: 3 }` · enabled.
- **What it does:** each time the agent tries to stop, it loops back for a critique-and-
  refine pass — reviewing its own work against the goal and tightening it — up to 3 times,
  then stops. Iteration count is per-rule and resettable via the reset-loop endpoint.
- **When to use:** quality-sensitive work (a PR, a spec, a tricky fix) where a couple of
  self-review passes materially improve the output.
- **Why safe:** `continue-loop` only nudges the agent to keep going; it runs no commands
  and is hard-bounded at 3 iterations. Worst case is a few extra turns.
- **Refinement over the old seed:** tightened continuation intent (critique *against the
  stated goal and acceptance criteria*, not vague "improve"), repo-agnostic wording.

### 2. Plan-First — `spell_plan_first` (refined)

- **Rules:** `Stop` → `continue-loop` `{ loopType: 'plan-execute', maxIterations: 2 }` · enabled.
- **What it does:** turns a single stop into "write the plan, then loop back and execute
  against it" — at most 2 continuations.
- **When to use:** multi-step tasks that benefit from an explicit plan before execution.
- **Why safe:** same as Self-Critic — bounded loop, no exec.
- **Refinement:** wording made robust across repos (no assumption of a particular task
  tracker); clarified it expects a concrete, checkable plan before proceeding.

### 3. Progress Pulse — `spell_progress_pulse`

- **Rules:** `Notification` → `inject-prompt` (report progress) · enabled.
- **What it does:** when the session emits a Notification (e.g. goes idle / waits), injects
  a prompt asking the agent to briefly report what it just did, what's next, and blockers.
- **When to use:** long-running or coordinated sessions where you want periodic status.
- **Why safe:** inject-prompt only pushes text; no exec, no loop.

### 4. Context Primer — `spell_context_primer`

- **Rules:** `SessionStart` → `feed-context` (task/docs primer) · enabled.
- **What it does:** at session start, feeds a primer reminding the agent to review its
  assigned tasks and attached docs, confirm goal + constraints, then proceed.
- **When to use:** as a default on freshly spawned workers to reduce "dived in without
  reading the brief" failures.
- **Why safe:** feed-context returns stdout Claude reads; no side effects.

### 5. No-Secrets Guard — `spell_no_secrets` (new)

- **Rules:** `PreToolUse` matcher `Edit|Write` → `feed-context` (secrets reminder) · enabled.
- **What it does:** before an Edit/Write tool call, feeds a short reminder: never write
  secrets, API keys, tokens, or credentials into source or committed files; use env vars /
  a secrets manager and keep them out of version control.
- **When to use:** any session touching config, infra, or auth code; a cheap guardrail
  against the most common accidental-leak class.
- **Why safe:** it is advisory only — `feed-context`, no block (v2 has no gate), no exec.
  It reminds; it never prevents. Fail-open by construction.

### 6. Conventional Commits — `spell_conventional_commits` (new)

- **Rules:** `Stop` → `inject-prompt` (commit-format nudge) · enabled.
- **What it does:** on stop, nudges the agent — *if it is about to commit* — to use a clean
  Conventional-Commits message (`type(scope): summary`, imperative mood, why-not-just-what
  body). Explicitly tells it not to commit if the user hasn't asked.
- **When to use:** sessions that produce commits and you want consistent history.
- **Why safe:** inject-prompt text only; `Stop` permits `inject-prompt` per
  `ACTIONS_BY_EVENT`. It advises formatting; it does not run `git`.

### 7. Test-After-Edit — `spell_test_after_edit` (new)

- **Rules:** `PostToolUse` matcher `Edit|Write` → `run-command` · **enabled: false**,
  `feedOutput: true`.
- **Default command (self-describing placeholder):**
  `echo` with an arg string instructing the user to replace it with their test command
  (e.g. `npm test` / `pytest` / `go test ./...` / `bun test`) and enable the rule.
- **What it does (once wired):** after a file edit, runs the project's test command and
  feeds the output back to the agent so it can react to failures.
- **When to use:** TDD-style or regression-sensitive work — wire it to your test runner,
  enable it.
- **Why safe:** ships **disabled** (run-command); the default command is a harmless `echo`
  that, if enabled un-edited, just feeds back the "configure me" instruction rather than
  assuming a toolchain. run-command is async fire-and-forget, so a slow test suite never
  starves the 4 s hook budget.

### 8. Type-Safety Sentinel — `spell_type_safety` (new)

- **Rules:** `PostToolUse` matcher `Edit|Write` → `run-command`
  `{ command: 'npx', args: ['tsc', '--noEmit'] }` · **enabled: false**, `feedOutput: true`.
- **What it does (once enabled):** after a file edit, runs a project-wide TypeScript
  typecheck and feeds any errors back. (Per the matcher note, it triggers on the edit tool,
  not a `.ts` path filter, and typechecks the whole project — which is what you want.)
- **When to use:** TypeScript projects where you want the agent to catch type regressions
  as it edits.
- **Why safe:** ships **disabled**; `tsc --noEmit` is read-only (emits nothing). The
  description flags the assumption (a TS project with `tsc` resolvable via `npx`). Async, so
  no hook-budget starvation.

### 9. Session Recap — `spell_session_recap` (new)

- **Rules (multi-rule):**
  1. `SessionEnd` → `notify-channel` `{ message: '…' }` · enabled — an in-app notification
     that the session ended (a recap prompt).
  2. `SessionEnd` → `run-command` · **enabled: false** — a self-describing `echo`
     placeholder for writing a recap doc (user wires it to their own summary command).
- **What it does:** on session end, surfaces an in-app "session ended — recap" notification;
  optionally (once wired + enabled) writes a recap artifact.
- **When to use:** sessions you want a closing signal / summary hook for.
- **Why safe:** `SessionEnd` legally permits only `run-command`/`notify-channel`
  (`ACTIONS_BY_EVENT`), and this seed uses exactly those. notify-channel is in-app only (no
  `channel`); the run-command rule ships disabled with a self-describing placeholder.

### 10. Focus-Keeper — `spell_focus_keeper` (new)

- **Rules:** `Stop` → `continue-loop` `{ loopType: 'continue-until-done', maxIterations: 5 }` · enabled.
- **What it does:** keeps the agent working toward completion instead of stopping early —
  on each stop it nudges "is the task actually complete? if not, continue" — bounded at 5
  iterations.
- **When to use:** larger tasks where the agent tends to stop prematurely; the bound keeps
  it from looping forever.
- **Why safe:** `continue-loop` runs no commands; hard-bounded at 5; resettable. Distinct
  from Self-Critic (quality passes) — this one is about *completeness*.

### 11. Notify-on-Done — `spell_notify_on_done` (refined)

- **Rules:** `Stop` → `notify-channel` `{ message: '…' }` · enabled.
- **What it does:** emits an **in-app** notification when the session finishes a turn.
- **When to use:** when you want a heads-up that a worker has paused/finished, without
  watching the terminal.
- **Why safe:** in-app only — **no `channel` field, no external relay**. It shows a
  notification; it does nothing else.
- **Refinement:** message reworded to reflect in-app delivery honestly (no "sent to your
  channel" language).

### 12. Guardrail Combo — `spell_guardrail_combo` (refined, multi-rule demo)

- **Rules (multi-rule):**
  1. `PostToolUse` matcher `Edit|Write` → `run-command` · **enabled: false**,
     `feedOutput: true` — self-describing `echo` lint placeholder (wire it to your lint
     command).
  2. `Stop` → `notify-channel` `{ message: '…' }` · enabled — in-app notification on stop.
- **What it does:** demonstrates a single spell combining a (disabled) exec rule and an
  (enabled) notify rule — the canonical "multiple independent rules under one name" example.
- **When to use:** as a template when authoring your own multi-rule spells.
- **Why safe:** the exec rule ships disabled with a self-describing placeholder; the notify
  rule is in-app only. Fixes the old `npm run lint` hardcode.

### 13. Lint-on-Edit — `spell_lint_on_edit` (refined)

- **Rules:** `PostToolUse` matcher `Edit|Write` → `run-command` · **enabled: false**,
  `feedOutput: true` — self-describing `echo` lint placeholder.
- **What it does (once wired):** runs your linter after each edit and feeds errors back.
- **When to use:** wire it to your project's lint command, then enable.
- **Why safe:** ships disabled; default is a harmless self-describing `echo` (fixes the old
  `npm run lint` assumption); async exec.

---

## Summary table

| Seed id | Name | Rule(s): event · matcher → action | Enabled | feedOutput |
|---|---|---|---|---|
| `spell_self_critic` | Self-Critic | `Stop` → continue-loop `critic-refine` (max 3) | ✅ | — |
| `spell_plan_first` | Plan-First | `Stop` → continue-loop `plan-execute` (max 2) | ✅ | — |
| `spell_progress_pulse` | Progress Pulse | `Notification` → inject-prompt | ✅ | — |
| `spell_context_primer` | Context Primer | `SessionStart` → feed-context | ✅ | — |
| `spell_no_secrets` | No-Secrets Guard | `PreToolUse` `Edit\|Write` → feed-context | ✅ | — |
| `spell_conventional_commits` | Conventional Commits | `Stop` → inject-prompt | ✅ | — |
| `spell_test_after_edit` | Test-After-Edit | `PostToolUse` `Edit\|Write` → run-command (echo placeholder) | ❌ | ✅ |
| `spell_type_safety` | Type-Safety Sentinel | `PostToolUse` `Edit\|Write` → run-command `npx tsc --noEmit` | ❌ | ✅ |
| `spell_session_recap` | Session Recap | `SessionEnd` → notify-channel · `SessionEnd` → run-command (echo placeholder) | ✅ / ❌ | — |
| `spell_focus_keeper` | Focus-Keeper | `Stop` → continue-loop `continue-until-done` (max 5) | ✅ | — |
| `spell_notify_on_done` | Notify-on-Done | `Stop` → notify-channel | ✅ | — |
| `spell_guardrail_combo` | Guardrail Combo | `PostToolUse` `Edit\|Write` → run-command (echo placeholder) · `Stop` → notify-channel | ❌ / ✅ | ✅ |
| `spell_lint_on_edit` | Lint-on-Edit | `PostToolUse` `Edit\|Write` → run-command (echo placeholder) | ❌ | ✅ |

13 seeds: 4 refined loop/prompt seeds, 4 refined (notify/lint/combo/context), 5 genuinely
new (No-Secrets, Conventional Commits, Test-After-Edit, Type-Safety Sentinel, Session
Recap, Focus-Keeper — counting the new authoring). Every `run-command` rule is disabled;
no `channel` field anywhere.

## Seed-contract test (`test/spell-library-seeds.test.ts`)

The test imports `SPELL_LIBRARY` and asserts, for every seed:
1. The seed's `{ name, description, icon, color, rules }` passes `createSpellSchema` (the
   real Zod schema) — proving schema validity for the literals that bypass request
   validation.
2. Every `run-command` rule ships `enabled: false`.
3. Every rule's `trigger.matcher` (when present) passes `isSafeRegex`.
4. Every rule's `action.type` is legal for its `trigger.hookEvent` per `ACTIONS_BY_EVENT`.
5. No `notify-channel` action carries a `channel` field (removed from v1).
6. Seed ids are unique; rule ids are unique within each seed; the refined seeds retain
   their historical ids.
</content>
