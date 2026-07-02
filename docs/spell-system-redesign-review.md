# Spell System Redesign — Independent Review

**Reviewer:** Maestro worker (session `sess_1783031873686_5r6rtshuf`)
**Reviews:** `docs/spell-system-redesign.md`
**Grounding:** Re-verified against actual `staging` source — every citation below was read, not trusted from the doc.
**Date:** 2026-07-03

---

## Verdict: 🟡 **GO-WITH-FIXES**

The direction is right and the data model is fundamentally sound. The multi-rule shape is the correct abstraction, dropping `gate` genuinely simplifies `composeResult`, and the clean-break call is defensible on staging. But there is **one critical technical flaw the doc misses** (the run-command/hook-timeout mismatch, F1) that breaks the flagship seeds, and **one false premise** (F2: SubagentStop/SessionEnd are *not* already bound) that undercuts a Phase-1 assumption. Fix F1–F2 and answer the medium items before starting P1.

Citation accuracy of the doc itself is **high** — I spot-checked ~15 `file:line` references and all were correct or within 1–3 lines. The problems are omissions and two over-optimistic claims, not fabricated code.

---

## What the doc got right (verified)

- **Single action+trigger today** — `Spell` at `types.ts:642` carries exactly one `action` (`:648`) + one optional `trigger` (`:650`). ✓
- **No body field; injected text = `description`** — `spellPromptText()` returns `spell.description || spell.name` (`HookDispatcherService.ts:357`). ✓
- **Editor's `prompt` is dead** — `CustomSpellEditor` collects `prompt` in `FormState` (`:35`, initialized `:52`) but `buildPayload()` (`:99-112`) **never includes it**, and `createSpellSchema` (`validation.ts:574`) is `.strict()` with no `prompt` field. Verified dead. ✓
- **`composeResult` gate branch** — the "any block → exit 2" branch is `HookDispatcherService.ts:383-396`; deleting it after dropping `gate` is accurate and leaves only the continue-on-Stop exit-2 path (`:401-430`). ✓
- **inject vs feed subtlety** — `execInjectPrompt` (`:208`) emits `session:prompt_send` and deliberately returns **no** stdout (`:228-231` comment); `execFeedContext` (`:235`) returns stdout. Doc §9.3 is correct. ✓
- **Matcher reuse + ReDoS cap** — `matcherTarget` (`:141`), `matcherMatches` (`:161`), 4096-char cap (`MATCHER_TARGET_MAX`, `:159`), plus `isSafeRegex` at create time (`validation.ts:540`). ✓
- **`categoryForSpell` switches on `s.action`** (`useSpellLibraryStore.ts:24`) — must be rewritten for rules. ✓
- **`activateSpell` copies `hookEvent`/`matcher`, `iteration:0`** (`SpellService.ts:908-910`). ✓

---

## Prioritized fixes (must-fix → nice-to-have)

### 🔴 F1 — [CRITICAL] `run-command` output can never be fed back for any command slower than ~4s
**The doc completely misses this.** Three timeouts are in play and they are inconsistent by an order of magnitude:

- CLI aborts the dispatch HTTP request at **4 s** — `HOOK_REQUEST_TIMEOUT_MS = 4_000` (`maestro-cli/src/commands/hook.ts:29`), `controller.abort()` at `:63`.
- `hooks.json` gives `maestro hook dispatch <EVENT>` a **5 s** process timeout (`plugins/maestro-worker/hooks/hooks.json`, every `hook dispatch` entry).
- But `execRunCommand` runs the child up to **30 s** — `COMMAND_TIMEOUT_MS = 30_000` (`HookDispatcherService.ts:38`), and the redesign **keeps** this cap (§3.2, `timeoutMs … capped server-side at 30_000`).

Because dispatch is **synchronous** (the server runs the command inside the request and returns stdout in the `DispatchResult`), any command that takes >4 s has its HTTP request aborted CLI-side → `postDispatch` returns `null` → `applyResult` never runs → **fail-open exit 0, `feedOutput` silently dropped** (`hook.ts:154-159`). Nearly every real `npm run lint` / `npm test` exceeds 4 s. This means the flagship **Lint-on-Edit**, **Test Sentinel**, and every `feedOutput: true` seed in §6 will *appear* to work and silently deliver nothing.

**Fix (pick one):**
- **(preferred, structural)** Make `run-command` fire-and-forget: kick off `execFile`, return exit 0 immediately, and deliver stdout **asynchronously** via `session:prompt_send` (the same channel `inject-prompt` already uses, `:216`). Decouples command latency from the hook response entirely. Effort: **M**.
- **(minimal)** Lower the run-command cap to ~3 s and make the editor state, in copy, that only sub-3 s commands can feed output. Effort: **S**, but cripples the feature.

Whichever you choose, P4 verification (§8) **must** include a >4 s command, or the bug ships green.

### 🔴 F2 — [HIGH] SubagentStop / SessionEnd are NOT "already bound"; the doc's §3.1 contradicts its own §9.1
§3.1 (doc line 85) states *"the plugin `hooks.json` already binds most events; the dispatcher just needs to accept them."* Verified false against both `plugins/maestro-worker/hooks/hooks.json` and `plugins/maestro-orchestrator/hooks/hooks.json`:

- **`SubagentStop` appears in neither file.** Net-new binding required.
- **`SessionEnd` is bound to `maestro session complete`**, *not* `maestro hook dispatch SessionEnd`. A second `hook dispatch SessionEnd` entry must be added alongside it.

So both new events need real wiring in **two** JSON files plus `HOOK_EVENTS` in `hook.ts:8-15` (currently 6 events, no SubagentStop/SessionEnd). §9.1 correctly lists parity as a checklist item, but §3.1's "just accept them" framing will mislead the implementer into skipping the JSON edits. **Fix the §3.1 wording and treat this as a code change, not a type change.**
*Nice detail to note:* `composeResult` already special-cases `SubagentStop` (`HookDispatcherService.ts:409`) even though `SpellHookEvent` doesn't include it — the server half-anticipated this.

### 🟠 F3 — [HIGH] `SessionEnd` is terminal; most actions are dead config on it
A session that is ending has no further turns: `inject-prompt`, `feed-context`, and `continue-loop` cannot affect it (nothing reads the injected prompt, no stdout is consumed, exit 2 cannot "continue" a terminated session). Only `notify-channel` and a fire-and-forget `run-command` are meaningful. The redesign adds `SessionEnd` to the enum (§3.1) with no restriction, so the editor would offer all 5 actions on it — 3 of which silently no-op. **Fix:** gate the action dropdown per hook event (see PI-2). Same logic applies to `continue-loop` on any non-Stop/SubagentStop event — `composeResult` downgrades it to a stdout hint (`:421-429`), so it silently won't loop.

### 🟠 F4 — [MEDIUM] `run-command` has *never actually executed* in the current system — the doc undersells this
Today `execRunCommand` reads `(spell as any).command` / `(spell as any).commandArgs` (`HookDispatcherService.ts:300-301`) — untyped fields that **no code path ever sets** (the `.strict()` `createSpellSchema` has no `command` field, `validation.ts:574`). So run-command is currently a guaranteed no-op (`:302-308`). The redesign's `superRefine` adding `command` (§4.4) is what makes it live **for the first time**. Two implications the doc should state:
1. The dispatcher rewrite must read `rule.action.command` / `rule.action.args` — and note the *current* field is `commandArgs`, not `args`, to avoid a copy-paste miss.
2. This is a **new capability going from zero to arbitrary local exec**, which raises the stakes on F5.

### 🟠 F5 — [MEDIUM] run-command security mitigation is under-specified (doc §9.2 flags it but stops short)
Good news the doc should say out loud: it's `execFile`, not `exec` (`:310`), so **args are not shell-expanded** — no `rm -rf $(...)` injection, `cwd` defaults to session dir. The self-only guard (`hookRoutes.ts:25`, `hook_self_only`) prevents cross-session driving. But: commands auto-fire on **every matching hook** and spells can be **auto-activated at spawn** from `manifest.spells` (`spell-auto-activator.ts`), so a shared or seeded spell runs binaries unattended. **Recommend:** (a) explicit "⚠ this rule runs shell commands" confirmation in the editor before save, (b) gate authoring behind `commandPermissions`, (c) `feedOutput` defaults **false**. Turn the doc's "Open: confirm acceptable" into a concrete decision.

### 🟡 F6 — [MEDIUM] Per-rule iteration reset has no defined API/UX
Moving `iteration: number` → `ruleIterations: Record<ruleId, number>` (§3.5) breaks the existing "Reset loop" affordance (`ActiveSpellChip` context menu, per the explainer §6.2) and the already-stubbed `resetIteration`. With multiple `continue-loop` rules on one spell, "reset" is ambiguous. **Fix:** define reset-per-rule (target `ruleIterations[ruleId] = 0`) and its UI. Also GC orphaned keys: when a rule is deleted/re-added, its `ruleId` changes and the old counter leaks in `ruleIterations` — reconcile on `updateSpell`.

### 🟡 F7 — [MEDIUM] `notify-channel`'s new `channel` field is dead unless the event is extended
The redesign adds `channel?: string` to `SpellActionConfig` (§3.2), but `execNotifyChannel` emits `notify:progress` with only `{ sessionId, message }` (`HookDispatcherService.ts:344-348`) — there is no channel field on the event, and routing is decided by the downstream relay. As written, `channel` is stored and ignored. **Fix:** either thread `channel` through the `notify:progress` payload (and update the relay) or drop the field from v1.

### 🟡 F8 — [MEDIUM] Idempotent re-cast will reset loop counters
`activateSpell` is idempotent — re-activating "re-enables + bumps `castAt`" (`SpellService.ts:902`). With `ruleIterations: {}` freshly built on every activate (§4.2), re-casting a spell mid-loop **silently resets all its counters**. Today the same bug exists (`iteration:0`), but multi-rule makes it more surprising. **Fix:** on re-activation, preserve `ruleIterations` for rules whose id is unchanged.

### 🟡 F9 — [LOW] Clean-break stale rings: make cleanup non-optional
§7 offers "accept that the dispatcher ignores malformed old entries" as an alternative to wiping `activeSpells`. But the UI ring layer (`useActiveSpellsStore`, which still carries `iteration` at `:17,33,53,106`) renders rings off `castAt`/`color` regardless of whether the dispatcher matches anything — so stale rings **will** render on old sessions until cleared. Make the one-shot `activeSpells` cleanup **required**, not "preferred."

### 🟡 F10 — [LOW] Matcher removed from the editor for non-tool events, but the dispatcher still supports it
`matcherTarget` supports matchers on non-tool events (path/file_path/message/JSON fallback, `:147-155`), but §5.3 shows the matcher field only for Pre/PostToolUse. That silently drops a working capability (e.g. matcher on `Notification` message text). Either keep an "advanced matcher" affordance for all events or document the restriction as intentional.

---

## Assessment of the doc's §9 risk list

| # | Doc's risk | My take |
|---|---|---|
| 9.1 | Hook-event binding parity | **Right risk, but §3.1 contradicts it** (F2). The risk is real and *bigger* than "accept them." |
| 9.2 | run-command security | **Right, under-specified** (F5). Also missing the more urgent F1 timeout flaw. |
| 9.3 | inject vs feed on non-Stop | **Right and accurate.** Verified against `:208`/`:235`. Keep the editor copy. |
| 9.4 | Composition across rules/spells | **Right.** Order = activeSpell order × rule order; stdout concatenated (`:432-436`). Matches today. |
| 9.5 | Schedule schema w/o engine | **Right — take your own suggestion:** reject `schedule` triggers at save in P1 (superRefine) so no dead config accrues. |

**Risks the list MISSED:** F1 (timeout/feed-output — critical), F3 (SessionEnd terminal semantics), F7 (notify channel dead field), F6 (per-rule reset), F8 (re-cast counter reset).

---

## Phasing & blast radius

**Phasing (§8): realistic.** P1→P4 sequencing is sound and the `tsc -b` / per-package build hygiene note (avoiding concurrent `build:ui`) matches project memory. Two caveats: (1) P4 must fire a **>4 s** run-command to catch F1; (2) P1 should add the `schedule`-reject superRefine (F2/9.5) so the schema doesn't accept dead config from day one.

**Blast radius (§10): mostly complete; likely-missing files:**
- `stores/useSpellActivationStore.ts` — `castSpell` shape is fine, but its `activate()`→`useActiveSpellsStore` handoff carries `iteration` (`useActiveSpellsStore.ts:69,75,106`) → touched by the `ruleIterations` swap.
- `components/spells/ActiveSpellsPanel.tsx`, `SpellLauncher.tsx`, `TaskSpellAssignment.tsx` — render action/trigger badges from the old shape; part of the "~36 references."
- `services/spell-auto-activator.ts` (CLI) — reads `manifest.spells`; verify it doesn't assume single-action.
- No change needed (confirm): `api/spellRoutes.ts`, `api/hookRoutes.ts`, `utils/spellRings.ts` (keys off `color`).

---

## Editor UX

The rule-list mockup (§5.3) is **usable and intuitive** — per-rule card, action-scoped config panel, live summary line, add/remove/enable. It's a clear win over the flat form. Grounded gaps: today's editor has no per-rule concept at all (`CustomSpellEditor.tsx` is one flat `FormState`, `:22-36`), so this is a full rebuild as the doc says. Specific UX asks fold into the Proposed Improvements below (PI-2, PI-3, PI-5).

---

## Proposed Improvements (beyond fixing gaps)

Opinionated, concrete, each with rationale + rough effort.

- **PI-1 — Discriminated union on action, not a flat optional bag.** §3.2's `SpellActionConfig` is one interface with every field optional, guarded by `superRefine`. Model it as a real discriminated union (`{ type:'run-command'; command; args?; … } | { type:'inject-prompt'; prompt } | …`). Zod's `z.discriminatedUnion('type', …)` replaces the hand-rolled `superRefine`, and TS gives **exhaustive narrowing** in both the dispatcher `switch` and the editor's config panel — no `(spell as any).command` casts like today (`:300`). *Rationale:* eliminates a whole class of "wrong field for this action" bugs at compile time. *Effort:* **S** (design-time; pays for itself).

- **PI-2 — Data-driven per-event capability matrix.** Define one table `ACTIONS_BY_EVENT: Record<SpellHookEvent, SpellActionType[]>` shared by the Zod schema *and* the editor dropdown. `Stop`/`SubagentStop` → all; `SessionEnd` → `notify-channel` + `run-command` only; `PreToolUse` → no `continue-loop`; etc. Fixes F3 + the continue-loop-on-non-Stop trap in one place. *Rationale:* impossible-to-express dead config; single source of truth. *Effort:* **S–M**.

- **PI-3 — Optional per-rule `label`.** Add `SpellRule.label?: string`. Drives the live summary line and the reset-per-rule UX (F6) with a human handle instead of a `ruleId`. *Effort:* **S**.

- **PI-4 — Async run-command as the default execution model** (also the structural fix for F1). Fire the command, return immediately, stream stdout back via `session:prompt_send` tagged with the spell/rule name. Bonus: lets long test suites feed results without pinning the hook. *Effort:* **M**.

- **PI-5 — Test-fire a single rule against a synthetic payload.** Today's "Test cast" (`CustomSpellEditor.tsx:131`) casts the whole spell at a live session. Instead, let the editor POST a rule + a canned payload (`{tool_name:'Edit', file_path:'x.ts'}`) to a `dispatch --dry-run` that runs match + action logic and returns the `DispatchResult` **without** side effects. *Rationale:* authoring feedback loop without a live session or real command exec. *Effort:* **M**.

- **PI-6 — Observability: `spell:rule_fired` event + structured per-rule logs.** The dispatcher currently logs only warnings/errors. Emit a lightweight event per fired rule (spellId, ruleId, event, action, outcome) so the UI can show "why did this fire?" and so F1-class silent failures become visible. *Effort:* **M**.

- **PI-7 — Testing strategy: matrix + seed-contract tests.**
  (a) Table-driven `hook-dispatcher.test.ts`: `event × action × matcher(match/no-match) × iteration-cap` — the current suite tests a handful of paths; the rewrite is the moment to make it exhaustive.
  (b) A **seed-contract test** that runs every `SPELL_LIBRARY` seed's `rules[]` through the actual Zod schema. Seeds bypass validation (they're literals in `FileSystemSpellRepository.ts:16`), so schema drift ships silently today; this test prevents it. *Effort:* **S–M**.

- **PI-8 — Seed quality: no seed fires a command that may not exist.** `Lint-on-Edit`/`Test Sentinel` (§6) hardcode `npm run lint`/test. On a repo with no such script they fail on every edit and (post-F1) noisily or silently. Ship run-command seeds **disabled by default**, or resolve the command from the repo (detect `package.json` scripts) at activation. Fewer, higher-confidence seeds beat a broad set that misfires on first install. *Effort:* **S**.

- **PI-9 — Structured matcher builder instead of raw regex.** For Pre/PostToolUse, offer `tool: <dropdown>` + optional `argMatches: <regex>` rather than a free-text regex the user must know binds to `tool_name` (`:143-145`). Shrinks the ReDoS surface (`isSafeRegex`, `validation.ts:540`) and the "why didn't my matcher match" support load. *Effort:* **M**.

- **PI-10 — Bound the fan-out.** Add `rules.max(N)` (e.g. 20) to the schema and cap concurrent `run-command` executions per dispatch in the service. Without a cap, a spell with many run-command rules on `PostToolUse:*` can spawn N processes on every edit. *Effort:* **S**.

---

## One-line recommendation
Sound redesign — **GO once F1 (run-command timeout) and F2 (real hook binding) are addressed and §9.5 schedule-reject lands in P1.** Adopt PI-1 (discriminated union) and PI-2 (capability matrix) now while the schema is being written; they're cheap and prevent most of the medium findings by construction.
