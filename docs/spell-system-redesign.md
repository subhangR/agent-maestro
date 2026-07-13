# Spell System Redesign — Design Document

**Status:** v2 — reviewed (🟡 GO-WITH-FIXES) and amended. **§11 (v2 Amendments) is the AUTHORITATIVE contract; where §1–§10 conflict with §11, §11 wins.**
**Author:** Maestro worker (session sess_1783030600760_957078kw8)
**Branch target:** `staging`
**Supersedes:** the P1–P4 spell build described in `docs/spell-system-design/FINAL_STATUS.md`
**Companion:** `docs/spell-system-explainer.md` (accurate description of the *current* system)

---

## 1. Motivation

The current spell system is broken in two independent ways:

1. **It was never run.** Per `docs/spell-system-design/FINAL_STATUS.md`, the entire UI was
   "verified by typecheck only — NOT run in a browser/app." It is mounted
   (`maestro-ui/src/components/app/AppModals.tsx:685` renders `<SpellLauncher />`, `:709`
   renders `<SpellbookDrawer />`) but the runtime paths are untested and several pieces are
   explicit stubs (`resetIteration`, iteration ticks, `CustomSkillEditor` local stub).

2. **The data model cannot express what users want.** A `Spell` today has exactly **one**
   `action` and **one** `trigger` (`maestro-server/src/types.ts:642`):

   ```ts
   interface Spell { action: SpellAction; trigger?: SpellTrigger; /* … */ }
   ```

   So a spell reacts to a *single* hook with a *single* behavior. There is also **no body
   field** — the injected text falls back to `spell.description`
   (`HookDispatcherService.ts:357`), so the editor's "prompt" field
   (`CustomSpellEditor.tsx:35,52`) is collected but never persisted or used.

### Goals

- A spell can bind **multiple hooks**, each with its **own configurable action**.
- Users **see every Claude Code hook event** and choose what happens on each.
- Core purpose: **do things on a hook** — inject a prompt, feed context, run a command,
  loop the agent, or notify a channel — and, later, **on a schedule**.
- A **clean, intuitive editor** where every configuration is properly editable (including
  the prompt/command bodies that today are unreachable).
- The data model is **forward-compatible with scheduled (time-based) triggers**, even
  though the scheduler engine ships in a later phase.

### Non-goals (this phase)

- **No time-based scheduler engine.** The `schedule` trigger *type* exists in the schema
  and the editor can show it as "coming soon," but nothing fires on a clock yet.
- **No `gate` / tool-blocking action.** Dropped from the taxonomy (see §3.3). Re-addable
  later as an additive action type.
- **No data migration.** Clean break (see §7).
- Ensembles, invoke/cast templates, and the spell *invocation* path
  (`SpellService.invoke`) are **unchanged** — this redesign only touches the
  spell-*entity* / hook-*activation* side.

---

## 2. Design decisions (locked with product owner)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Spell = collection of rules**, each `{ trigger → action + config }` | The single biggest change; unlocks multi-hook + per-hook behavior. |
| D2 | **Hook triggers now; schedule schema-ready, engine phase 2** | Scheduler is a whole new server daemon; ship the high-value hook side first. |
| D3 | **Clean break** — wipe old `data/spells/*` + `Session.activeSpells`; reseed fresh | Staging, already broken; no back-compat cruft. |
| D4 | **v1 actions:** `inject-prompt`, `feed-context`, `run-command`, `continue-loop`, `notify-channel` | Owner-selected. **No `gate`.** |
| D5 | **Full editor rebuild + actually run it in a browser** | The visible win; fixes the "nothing works" report. |

---

## 3. Data model

### 3.1 Triggers (discriminated union)

```ts
type SpellHookEvent =
  | 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit'
  | 'Stop' | 'SubagentStop' | 'Notification' | 'SessionStart' | 'SessionEnd';

type SpellTrigger =
  | { type: 'hook'; hookEvent: SpellHookEvent; matcher?: string }
  | { type: 'schedule'; cron?: string; intervalMs?: number };   // PHASE 2 — accepted, never fires yet
```

Notes:
- We **expand** the hook-event list vs. today's 6 (`types.ts:620`) to include
  `SubagentStop`, `SessionEnd` — the plugin `hooks.json` already binds most events; the
  dispatcher just needs to accept them. (Binding parity is a Phase-1 checklist item.)
- `matcher` is a regex string (tool name for `Pre/PostToolUse`, else a payload field),
  reusing the existing `matcherTarget` / `matcherMatches` logic
  (`HookDispatcherService.ts:141,161`), including the 4096-char ReDoS cap.

### 3.2 Actions (config-carrying)

```ts
type SpellActionType =
  | 'inject-prompt' | 'feed-context' | 'run-command' | 'continue-loop' | 'notify-channel';

interface SpellActionConfig {
  type: SpellActionType;

  // inject-prompt | feed-context
  prompt?: string;                 // NEW — the body that today is unreachable

  // run-command
  command?: string;
  args?: string[];
  cwd?: string;                    // defaults to session working dir
  timeoutMs?: number;             // capped server-side at 30_000 (existing COMMAND_TIMEOUT_MS)
  feedOutput?: boolean;           // if true, stdout is fed back to the agent as context

  // continue-loop
  loopType?: SpellLoopType;       // 'single-shot' | 'continue-until-done' | 'plan-execute' | 'critic-refine'
  maxIterations?: number;         // cap; existing default semantics

  // notify-channel
  channel?: string;               // e.g. 'telegram' | 'slack' | free-form; relayed via notify:progress
  message?: string;               // overrides the default "[name] fired on <event>" text
}
```

### 3.3 Why no `gate`

`gate` is the only action that returns **exit 2 to block a tool call**. Dropping it means
the dispatcher never blocks `Pre/PostToolUse` — it only *contributes stdout* (inject/feed)
or *continues loops* on `Stop`. This materially simplifies `composeResult`
(`HookDispatcherService.ts:378`): the "any block wins → exit 2" branch is deleted, leaving
only the continue-loop-on-Stop exit-2 path. If tool-blocking is wanted later, it returns
as a 6th action type without disturbing rules that don't use it.

### 3.4 Spell entity

```ts
interface SpellRule {
  id: string;                     // stable per-rule id (idGenerator 'rule')
  enabled: boolean;
  trigger: SpellTrigger;
  action: SpellActionConfig;
}

interface Spell {
  id: string;
  name: string;
  description: string;            // human summary only (NO longer the injected body)
  icon?: string;
  color: SpellColorSlug;          // unchanged 9-slug palette (types.ts:591)
  rules: SpellRule[];             // ← the core change
  isDefault?: boolean;            // curated seed, non-deletable
  createdAt: number;
  updatedAt: number;
}
```

Removed top-level fields (now per-rule or gone): `action`, `loopType`, `trigger`,
`failMode`, `maxIterations`, `skillRef`. `failMode` is dropped with `gate` (its only real
consumer); if a `run-command` needs fail-closed semantics later it becomes a per-action
field.

### 3.5 Per-session activation

```ts
interface ActiveSpell {
  spellId: string;
  color: SpellColorSlug;          // denormalized for UI rings
  enabled: boolean;
  ruleIterations: Record<string, number>;  // ruleId → iteration (loops are per-rule now)
  ensembleId?: string;
  castAt: number;
  castBy: string | null;
}
```

Replaces today's flat `iteration` + copied `hookEvent`/`matcher`
(`types.ts:667`). The dispatcher re-reads the spell's rules at fire time (rules can change
without re-casting), so we no longer denormalize trigger fields onto `ActiveSpell`.

---

## 4. Server changes

### 4.1 `HookDispatcherService` (rewrite of the core loop)

`dispatch({ sessionId, event, payload })`:

1. Load session → `activeSpells`.
2. For each **enabled** active spell, resolve its `Spell`, then iterate `spell.rules`:
   - keep rules where `rule.enabled` **and** `rule.trigger.type === 'hook'` **and**
     `rule.trigger.hookEvent === event` **and** `matcher` matches (existing matcher logic).
   - `schedule` rules are skipped entirely (Phase 1).
3. Execute each matched rule's action (`executeRuleAction(session, activeSpell, spell, rule, payload)`):
   - `inject-prompt` → emit `session:prompt_send` with `rule.action.prompt`; no stdout.
   - `feed-context` → return `stdout = rule.action.prompt`.
   - `run-command` → `execFile(command, args, { cwd, timeout })`; if `feedOutput`, stdout
     is returned as context; errors logged (fail-open).
   - `continue-loop` → read/bump `activeSpell.ruleIterations[rule.id]`, persist, return
     continue+reason (only meaningful on `Stop`/`SubagentStop`).
   - `notify-channel` → emit `notify:progress`.
4. `composeResult(outcomes, event)` — **simplified**: no block branch. Any continue on a
   Stop event → exit 2 + reason; otherwise exit 0 + concatenated stdout.

Per-rule iteration state is persisted on `ActiveSpell.ruleIterations` via
`sessionRepo.update`, mirroring today's single-counter approach.

### 4.2 `SpellService`

- `createSpell` / `updateSpell` accept `rules[]`; server assigns `rule.id` where missing.
- `activateSpell` builds `ActiveSpell` with `ruleIterations: {}` (no trigger denormalization).
- Everything on the **invoke** path (`SPELL_REGISTRY`, `DEFAULT_SPELL_ENTITIES`,
  `resolveEntity`, `interpolateTemplate`, `invoke`) is untouched.

### 4.3 `FileSystemSpellRepository`

- New `SPELL_LIBRARY` seeds authored on the rules shape (see §6).
- `mergeWithLibrary`, `isDefault`/`SEED_IDS` deletion guards unchanged.
- Clean break: the operator deletes `~/.maestro-staging/data/spells/*.json`; seeds
  reappear from code.

### 4.4 Validation (`api/validation.ts`)

Replace `spellActionSchema` / `spellTriggerSchema` / `createSpellSchema` /
`updateSpellSchema` with:
- `spellTriggerSchema` = discriminated union on `type` (`hook` | `schedule`).
- `spellActionConfigSchema` = `type` enum + optional per-action fields, with a
  `superRefine` requiring the right field per type (e.g. `inject-prompt` ⇒ `prompt`
  non-empty; `run-command` ⇒ `command` non-empty).
- `spellRuleSchema` = `{ id?, enabled, trigger, action }`.
- `createSpellSchema` = `{ name, description, icon?, color, rules: [rule…] }` with
  `rules` min length 1.
- Keep the ReDoS-safe matcher validation for hook matchers.

### 4.5 Events / WebSocket

No new event types required. `spell:activated` / `spell:deactivated` /
`session:prompt_send` / `notify:progress` are unchanged. (Optional Phase-3 nicety:
`spell:iteration_advanced` for live loop ticks — deferred.)

---

## 5. CLI & UI changes

### 5.1 CLI

- `maestro-cli/src/types/api-responses.ts` — update `Spell` response shape to `rules[]`.
- `maestro hook dispatch <event>` (`commands/hook.ts`) — **unchanged** (dumb shim; server
  owns all logic). Add the new events to `HOOK_EVENTS` and both plugin `hooks.json` so
  `SubagentStop` / `SessionEnd` reach the dispatcher.
- `maestro spell create` stays a thin custom-prompt creator; full rule authoring is a
  UI-first experience (CLI multi-rule authoring is out of scope this phase).

### 5.2 UI types & stores

- `maestro-ui/src/app/types/maestro.ts` — mirror the new `Spell` / `SpellRule` /
  `SpellTrigger` / `SpellActionConfig` / `ActiveSpell`.
- `useSpellLibraryStore` — `categoryForSpell` (`:22`) currently switches on `s.action`;
  rewrite to derive a category from the spell's rule set (e.g. "has a run-command rule").
- `useActiveSpellsStore` — swap `iteration` for `ruleIterations`.
- `MaestroClient` create/update payloads carry `rules[]`.
- `utils/spellRings.ts` — unaffected (keys off `color`), verify.

### 5.3 The editor rebuild (`CustomSpellEditor`)

Replace the flat single-action form with a **rule-list editor**:

```
┌─ Edit spell: "CI Guard" ───────────────────────────────┐
│ Name  [CI Guard        ]   Icon [🛡]   Color ●●●○○○○○○  │
│ Description [Runs lint on edit, nudges on stop     ]     │
│                                                          │
│ RULES                                        [+ Add rule]│
│ ┌──────────────────────────────────────────────────┐   │
│ │ ● On  │ Hook ▾  PostToolUse   Matcher [Edit|Write]│   │
│ │ Action ▾  Run command                             │   │
│ │   Command [npm run lint]  Args […]  ☑ Feed output │   │
│ │   Summary: "After Edit/Write → run `npm run lint`"│  🗑│
│ └──────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────┐   │
│ │ ● On  │ Hook ▾  Stop                              │   │
│ │ Action ▾  Continue loop  (critic-refine, max 3)   │  🗑│
│ └──────────────────────────────────────────────────┘   │
│                                    [Cancel] [Save spell] │
└──────────────────────────────────────────────────────────┘
```

Per rule:
- **Trigger-type toggle:** `Hook` (active) / `Schedule` (visible, disabled, "coming
  soon").
- **Hook dropdown:** every `SpellHookEvent`, each with a plain-English one-liner
  (`PreToolUse — before a tool runs`, `Stop — when the agent finishes a turn`, …).
- **Matcher field:** shown only for `Pre/PostToolUse`, with tool-name placeholder.
- **Action dropdown:** the 5 action types; the config panel below renders **only** the
  fields for the selected action (prompt textarea / command builder / loop cap+type /
  notify channel).
- **Live summary line** describing the rule in prose.
- Add / remove / enable-toggle rules. At least one rule required to save.

Other UI surfaces to update so they render rule summaries instead of a single action:
`SpellCard`, `ActiveSpellChip`, `SpellDetailFlyout`, `ActiveSpellRow`. Then **run staging
in a browser** and fix the untested runtime paths (the actual "nothing works" bugs).

---

## 6. Reseeded library (new shape)

Fresh curated seeds on the rules model (illustrative — final set TBD in review):

| Seed | Rules |
|---|---|
| **Lint-on-Edit** | `PostToolUse` matcher `Edit\|Write` → run `npm run lint`, feed output |
| **Test Sentinel** | `PostToolUse` matcher `Edit\|Write` → run test cmd, feed output |
| **Self-Critic** | `Stop` → continue-loop `critic-refine`, max 3 |
| **Plan-First** | `Stop` → continue-loop `plan-execute`, max 2 |
| **Progress Pulse** | `Notification` → inject-prompt "report progress" |
| **Context Primer** | `SessionStart` → feed-context (task/docs primer) |
| **Notify-on-Done** | `Stop` → notify-channel |
| **Guardrail Combo** (demo of multi-rule) | `PostToolUse Edit\|Write` → run lint **+** `Stop` → notify-channel |

`Guardian` / `Scope Keeper` (both `gate`) are **removed** with the action.

---

## 7. Migration / clean break

- Delete `~/.maestro-staging/data/spells/*.json` (old single-action user spells).
- Clear `activeSpells` off all sessions in `~/.maestro-staging/data/sessions/*` (or accept
  that the dispatcher ignores malformed old entries — it re-reads rules, and an old
  `ActiveSpell` with no `ruleIterations` simply matches nothing). **Preferred:** a tiny
  one-shot cleanup so no stale rings render.
- No code-level back-compat: old-shaped JSON on disk is not parsed into the new type.

---

## 8. Phased delivery & verification

| Phase | Scope | Done when |
|---|---|---|
| **P1 Foundation (server)** | types, validation, `HookDispatcherService` rewrite, reseed, tests | `tsc --noEmit` green (server); `hook-dispatcher.test.ts` rewritten & passing |
| **P2 Plumbing (types/stores/CLI)** | UI types, stores, `MaestroClient`, CLI response types, event bindings | `tsc -b` green (ui + cli) |
| **P3 Editor + surfaces** | `CustomSpellEditor` rebuild, `SpellCard`/`ActiveSpellChip`/`SpellDetailFlyout`/`ActiveSpellRow` | Runs in browser; create→save→activate a 2-rule spell |
| **P4 End-to-end verify** | `bun run dev:all`, cast a multi-rule spell, fire a hook, confirm behavior | Lint rule runs on edit **and** notify fires on stop, observed live |

> Build hygiene: per project memory, avoid concurrent `bun run build:ui` (workers SIGTERM
> each other's vite bundle) — verify per-package with `tsc -b`, and run the browser check
> once, serially.

---

## 9. Risks & open questions

1. **Hook-event binding parity.** New events (`SubagentStop`, `SessionEnd`) must be bound
   in both `plugins/*/hooks/hooks.json` and accepted by `commands/hook.ts` `HOOK_EVENTS`,
   or rules on them silently never fire. → Phase-1/2 checklist item.
2. **`run-command` security.** Today `execRunCommand` refuses to shell out unless the spell
   carries a `command` field (`HookDispatcherService.ts:299`). Now the editor *lets users
   set `command`* — so arbitrary commands run in the session's cwd on hook events. This is
   intended, but should be gated by `commandPermissions` / an explicit "this runs shell
   commands" confirmation in the editor. → **Open: confirm acceptable, or add a guard.**
3. **`inject-prompt` vs `feed-context` on non-Stop events.** Keep the existing subtlety
   (`:208` vs `:235`): inject emits `session:prompt_send` and returns no stdout; feed
   returns stdout. Editor copy must make the difference legible to users.
4. **Composition across rules & spells.** Multiple rules (across multiple active spells)
   can match one event. Order = spell iteration × rule order; stdout concatenated. Confirm
   this is the desired composition (matches today's cross-spell behavior).
5. **Schedule schema without an engine.** A `schedule` rule saves and shows in the UI but
   never fires. Risk of user confusion → mark clearly "coming soon," and consider
   rejecting `schedule` at save time in P1 to avoid dead config. → **Open.**

---

## 10. Blast radius (files)

**Server:** `types.ts` · `api/validation.ts` · `application/services/HookDispatcherService.ts`
· `application/services/SpellService.ts` · `infrastructure/repositories/FileSystemSpellRepository.ts`
· `test/hook-dispatcher.test.ts`
**CLI:** `src/types/api-responses.ts` · `src/commands/hook.ts` · `plugins/maestro-worker/hooks/hooks.json`
· `plugins/maestro-orchestrator/hooks/hooks.json`
**UI:** `app/types/maestro.ts` · `stores/useSpellLibraryStore.ts` · `stores/useActiveSpellsStore.ts`
· `utils/MaestroClient.ts` · `components/spells/CustomSpellEditor.tsx` · `SpellCard.tsx`
· `ActiveSpellChip.tsx` · `SpellDetailFlyout.tsx` · `ActiveSpellRow.tsx` · `sp-*.css`

~36 references to the old single-action shape across the UI spell surfaces will need
updating.

---

## 11. v2 Amendments — AUTHORITATIVE contract (post-review)

Independent review (`docs/spell-system-redesign-review.md`) returned **GO-WITH-FIXES**.
This section folds in every must-fix (F1–F10) and the cheap high-value improvements
(PI-1, PI-2, PI-3, PI-4, PI-7, PI-8, PI-10, plus a lightweight PI-6). Implementers build
to **this** section. It is self-contained for everything it changes.

### 11.1 Final TypeScript contract (server-authoritative; UI mirrors it)

```ts
// 8 events (was 6). SubagentStop + SessionEnd added — these need REAL hook wiring (§11.6), not just enum entries.
type SpellHookEvent =
  | 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit'
  | 'Stop' | 'SubagentStop' | 'Notification' | 'SessionStart' | 'SessionEnd';

type SpellTrigger =
  | { type: 'hook'; hookEvent: SpellHookEvent; matcher?: string }
  | { type: 'schedule'; cron?: string; intervalMs?: number };   // PHASE 2 — REJECTED at save in v1 (§11.4)

// PI-1: discriminated union on `type` — NOT a flat optional bag. Gives exhaustive narrowing
// in the dispatcher switch and the editor config panel; kills all `(spell as any)` casts.
type SpellActionConfig =
  | { type: 'inject-prompt'; prompt: string }
  | { type: 'feed-context';  prompt: string }
  | { type: 'run-command';   command: string; args?: string[]; cwd?: string; feedOutput?: boolean } // NO timeoutMs field exposed; async (§11.5)
  | { type: 'continue-loop'; loopType?: SpellLoopType; maxIterations?: number }
  | { type: 'notify-channel'; channel?: string; message?: string };

interface SpellRule {
  id: string;              // idGenerator('rule'); stable
  label?: string;          // PI-3: optional human handle; drives summary line + reset UX
  enabled: boolean;
  trigger: SpellTrigger;
  action: SpellActionConfig;
}

interface Spell {
  id: string; name: string; description: string; icon?: string;
  color: SpellColorSlug;
  rules: SpellRule[];      // 1..20 (§11.4)
  isDefault?: boolean; createdAt: number; updatedAt: number;
}

interface ActiveSpell {
  spellId: string; color: SpellColorSlug; enabled: boolean;
  ruleIterations: Record<string, number>;   // ruleId → iteration
  ensembleId?: string; castAt: number; castBy: string | null;
}
```

### 11.2 Capability matrix (PI-2, fixes F3) — single source of truth

Shared by the Zod schema **and** the editor action dropdown. An action not listed for an
event is unselectable in the UI and rejected by the schema.

```ts
const ACTIONS_BY_EVENT: Record<SpellHookEvent, SpellActionType[]> = {
  PreToolUse:       ['inject-prompt', 'feed-context', 'run-command', 'notify-channel'],
  PostToolUse:      ['inject-prompt', 'feed-context', 'run-command', 'notify-channel'],
  UserPromptSubmit: ['inject-prompt', 'feed-context', 'run-command', 'notify-channel'],
  Stop:             ['inject-prompt', 'feed-context', 'run-command', 'continue-loop', 'notify-channel'],
  SubagentStop:     ['inject-prompt', 'feed-context', 'run-command', 'continue-loop', 'notify-channel'],
  Notification:     ['inject-prompt', 'feed-context', 'run-command', 'notify-channel'],
  SessionStart:     ['inject-prompt', 'feed-context', 'run-command', 'notify-channel'],
  SessionEnd:       ['run-command', 'notify-channel'],   // F3: terminal — inject/feed/loop are dead here
};
```
Rationale: `continue-loop` only means anything on `Stop`/`SubagentStop` (elsewhere
`composeResult` downgrades it to a stdout hint); `SessionEnd` has no further turn to
inject/feed/loop into.

### 11.3 Dispatcher rewrite (`HookDispatcherService`)

- Iterate `activeSpell → spell.rules`; keep enabled `hook`-type rules whose `hookEvent`
  matches and whose `matcher` matches (reuse `matcherTarget`/`matcherMatches` + 4096 cap).
  Skip `schedule` rules entirely.
- **`composeResult` simplified (drop gate):** delete the "any block → exit 2" branch
  (`HookDispatcherService.ts:383-396`). Only remaining exit-2 path is continue-loop on
  `Stop`/`SubagentStop`. Everything else → exit 0 + concatenated stdout.
- **Per-rule iteration:** read/bump `activeSpell.ruleIterations[rule.id]`; persist via
  `sessionRepo.update`. (F6) Expose reset by setting `ruleIterations[ruleId] = 0`.
- **F4:** read `rule.action.command` / `rule.action.args` (note: the *old* field was
  `commandArgs` — do not copy that name). This is run-command going **0 → live** for the
  first time.
- **PI-6 (lightweight):** emit `spell:rule_fired` `{ sessionId, spellId, ruleId, event,
  action, outcome }` per fired rule, so F1-class silent failures are observable.

### 11.4 Validation (`api/validation.ts`)

- `spellActionConfigSchema = z.discriminatedUnion('type', [...])` (PI-1) — each variant
  requires its own fields (`inject-prompt`/`feed-context` ⇒ non-empty `prompt`;
  `run-command` ⇒ non-empty `command`).
- `spellTriggerSchema` = discriminated union on `type`. **v1 rejects `type:'schedule'`**
  at save (`superRefine` → "Scheduled triggers are not available yet") — F2/§9.5, no dead
  config accrues.
- Cross-field: reject rules whose `action.type ∉ ACTIONS_BY_EVENT[trigger.hookEvent]`.
- Keep `isSafeRegex` on hook `matcher`.
- `rules: z.array(spellRuleSchema).min(1).max(20)` (PI-10). Cap concurrent `run-command`
  per dispatch in the service (PI-10).

### 11.5 run-command: async execution (F1 + PI-4) — the flagship fix

**The bug the doc missed:** dispatch is synchronous and the CLI aborts the HTTP request at
**4 s** (`hook.ts:29`), but commands may run up to 30 s — so any `npm run lint`/`test`
(>4 s) has its request aborted → fail-open exit 0 → `feedOutput` silently dropped. **Every
flagship seed would ship broken.**

**Contract:** run-command is **fire-and-forget**. The dispatcher kicks off `execFile`
(NOT `exec` — no shell expansion), returns from the hook immediately (contributes nothing
to the exit code / synchronous stdout), and when the command finishes, if `feedOutput`,
delivers stdout **asynchronously** via `session:prompt_send` (same channel as
`inject-prompt`, tagged with the spell/rule name). Command latency is fully decoupled from
the 4 s hook budget. **P4 verification MUST fire a >4 s command** or F1 ships green.

**Security (F5):** `execFile` (args not shell-expanded); `cwd` defaults to session dir;
`feedOutput` **defaults false**; authoring a `run-command` rule requires the
`commandPermissions` grant, and the editor shows a **"⚠ this rule runs shell commands"**
confirmation before save.

### 11.6 Hook wiring (F2) — real code, not just enum entries

Verified false in the original doc: `SubagentStop` is bound in **neither** plugin;
`SessionEnd` is bound to `maestro session complete`, not `hook dispatch`. Implementer must:
- Add `maestro hook dispatch SubagentStop` and `maestro hook dispatch SessionEnd` entries
  to **both** `plugins/maestro-worker/hooks/hooks.json` and
  `plugins/maestro-orchestrator/hooks/hooks.json` (SessionEnd alongside the existing
  `session complete`, not replacing it).
- Extend `HOOK_EVENTS` in `maestro-cli/src/commands/hook.ts:8` to all 8 events.

### 11.7 notify-channel (F7)

Thread `channel` through the emitted event: `notify:progress` payload becomes
`{ sessionId, message, channel? }`; the downstream relay treats `channel` as an optional
routing hint (falls back to default when absent). If the relay change is out of scope for
the worker, drop `channel` from the v1 union rather than storing a dead field — do **not**
ship it stored-and-ignored.

### 11.8 Activation edge cases (F8, F6)

- **F8:** `activateSpell` must **preserve** `ruleIterations[ruleId]` for rules whose id is
  unchanged when re-casting an already-active spell (don't reset live loop counters).
- **F6 GC:** on `updateSpell`, reconcile `ruleIterations` on every active session — drop
  keys for rule ids that no longer exist.

### 11.9 Clean break (F9) — cleanup is MANDATORY

Not optional. Ship a one-shot cleanup that (a) deletes old-shape `data/spells/*.json` and
(b) strips `activeSpells` from all `data/sessions/*` — otherwise stale rings render off
`castAt`/`color` regardless of dispatcher matching (`useActiveSpellsStore` still keys on
those). Reseed fresh library from code.

### 11.10 Seeds (PI-8) — fewer, higher-confidence, run-command disabled by default

Final v1 seed set. **Every `run-command` seed ships `enabled: false`** so a fresh install
never fires a missing script; the user opts in after pointing it at a real command.

| Seed | Rule(s) |
|---|---|
| Self-Critic | `Stop` → continue-loop `critic-refine`, max 3 |
| Plan-First | `Stop` → continue-loop `plan-execute`, max 2 |
| Progress Pulse | `Notification` → inject-prompt "report progress" |
| Context Primer | `SessionStart` → feed-context (task/docs primer) |
| Notify-on-Done | `Stop` → notify-channel |
| Lint-on-Edit | `PostToolUse` matcher `Edit\|Write` → run-command (feedOutput) — **enabled:false** |
| Guardrail Combo (multi-rule demo) | `PostToolUse Edit\|Write` → run-command **(enabled:false)** + `Stop` → notify-channel |

`Guardian`/`Scope Keeper`/`Test Sentinel` from earlier drafts are dropped (gate / duplicate).

### 11.11 Editor (PI-9, F10, F5, PI-3)

- Rule-list as §5.3. **Action dropdown filtered by `ACTIONS_BY_EVENT[hookEvent]`** (§11.2).
- **Structured matcher builder (PI-9)** is the default for `Pre/PostToolUse`: `tool:
  <dropdown of known tools>` + optional `argMatches: <regex>`. A collapsible **"advanced
  matcher (raw regex)"** is available for **all** events (F10 — don't drop the non-tool
  matcher capability).
- run-command rule shows the **"⚠ runs shell commands"** confirm (F5); `feedOutput`
  unchecked by default.
- Per-rule `label`, enable toggle, and reset-loop (for continue-loop rules) → sets
  `ruleIterations[ruleId]=0`.

### 11.12 Testing (PI-7)

- Rewrite `test/hook-dispatcher.test.ts` **table-driven**: `event × action ×
  matcher(match/no-match) × iteration-cap`, incl. an async run-command feedback assertion.
- Add a **seed-contract test**: every `SPELL_LIBRARY` seed's `rules[]` must pass the real
  Zod schema (seeds are literals and bypass validation today → silent drift).

### 11.13 Updated blast radius (adds from review)

Beyond §10, also touch/verify: `stores/useSpellActivationStore.ts` (iteration handoff),
`components/spells/ActiveSpellsPanel.tsx`, `SpellLauncher.tsx`, `TaskSpellAssignment.tsx`
(action/trigger badges), and confirm no change needed in `api/spellRoutes.ts`,
`api/hookRoutes.ts`, `utils/spellRings.ts`, `services/spell-auto-activator.ts` (must not
assume single-action).

### 11.14 Deferred to a later phase (explicitly NOT in v1)

PI-5 (dispatch `--dry-run` test-fire), PI-6 full observability UI, PI-9 tool-list
completeness, and the real schedule engine. Schema is ready for schedules; v1 rejects them.

