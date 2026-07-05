# Functional Requirements

Numbered, testable capabilities the redesigned UI must deliver. Grouped by user goal.
`[MUST]` = required for v1, `[SHOULD]` = strongly wanted, `[COULD]` = nice-to-have.
Requirements describe behavior, not layout — the visual solution is the designer's.

Legend: **A** = Automation/spell-entity mechanism, **B** = Cast/invoke mechanism.

---

## 1. Browse & discover spells (A)

- **FR-1.1 [MUST]** View the full spell library — curated seed spells + user-created spells
  — in one browsable surface.
- **FR-1.2 [MUST]** Each spell in a list shows at minimum: name, icon, color, a one-line
  human description, and a **summary of its rules** (e.g. "2 rules · on Edit → run command · on Stop → notify").
- **FR-1.3 [MUST]** Distinguish **seed** (curated, non-deletable) from **custom** (editable,
  deletable) spells visually.
- **FR-1.4 [SHOULD]** Search spells by name/description/rule content.
- **FR-1.5 [SHOULD]** Group/filter spells (e.g. by what they do — runs commands, loops,
  notifies, injects — or by which hook events they use). Categories are derived from the
  rule set, not a stored field.
- **FR-1.6 [SHOULD]** Show **recently used** spells for quick re-cast (persisted locally, last ~8).
- **FR-1.7 [MUST]** Open a **detail view** for any spell showing every rule expanded
  (trigger + action + config + enabled state), plus metadata (seed/custom, created/updated).
- **FR-1.8 [SHOULD]** From detail view, act on the spell: Cast/Activate, Edit, Duplicate, Delete.
- **FR-1.9 [COULD]** "Duplicate to edit" a seed spell (since seeds are read-only) as a fast
  path to customizing a built-in.

## 2. Create a spell (A)

- **FR-2.1 [MUST]** Create a new spell from scratch: set name, description, icon, color.
- **FR-2.2 [MUST]** A spell must have **at least 1 rule** and at most **20** to be saved.
- **FR-2.3 [MUST]** Add rules one at a time; each rule is independently configured (see §3).
- **FR-2.4 [SHOULD]** Start from a template/duplicate (clone an existing spell as a starting point).
- **FR-2.5 [MUST]** Validate before save and clearly surface errors (missing required
  fields, empty prompt/command, action not allowed for the chosen event, too many rules).
- **FR-2.6 [SHOULD]** Save without leaving the user guessing — confirmation + the new spell
  appears in the library immediately.

## 3. Configure a rule (A) — the core of the editor

Each rule = **one trigger + one action + that action's config + an enabled toggle + an
optional label**. The editor must make building a rule feel guided, not like filling a form
blindly.

### Trigger
- **FR-3.1 [MUST]** Choose the trigger **type**: **Hook** (available now) or **Schedule**
  (must be shown but visibly **disabled / "coming soon"** — modeled, not yet functional).
- **FR-3.2 [MUST]** For a Hook trigger, pick one of the **8 hook events** from a list where
  each event has a **plain-English description** of when it fires (see `02` §Hook events).
  Users should never need to know the raw event names' semantics.
- **FR-3.3 [MUST]** For tool events (`PreToolUse` / `PostToolUse`), offer a **structured
  matcher**: pick which tool(s) the rule applies to (e.g. Edit, Write, Bash) from a known
  list, rather than forcing raw regex.
- **FR-3.4 [SHOULD]** Provide an **advanced matcher (raw regex)** escape hatch, available for
  **all** events (e.g. match on a Notification message or a file path), clearly marked as advanced.
- **FR-3.5 [MUST]** When no matcher is set, the rule fires on every occurrence of the event —
  make that consequence legible ("fires on every tool use").

### Action
- **FR-3.6 [MUST]** Choose the action. The action choices offered **must be filtered by the
  selected hook event** (the capability matrix in `02`): e.g. `continue-loop` only appears
  for `Stop`/`SubagentStop`; `SessionEnd` only offers `run-command`/`notify-channel`.
- **FR-3.7 [MUST]** When the event changes such that the current action is no longer allowed,
  the UI must gracefully correct/notify (don't leave an invalid rule).
- **FR-3.8 [MUST]** Show **only the config fields relevant to the chosen action** (see below).

### Per-action config (show the right panel per action)
- **FR-3.9 [MUST] inject-prompt / feed-context** — a **prompt/body text** field (required,
  non-empty). Make the *difference* between the two legible: inject = push a prompt as if
  typed; feed = supply context the agent reads. (Copy should explain, briefly.)
- **FR-3.10 [MUST] run-command** — a **command** field (required) + optional **args**,
  optional **working directory**, and a **"feed output back to the agent"** toggle
  (**default OFF**). Because this runs shell commands, it **MUST** show an explicit
  **"⚠ this rule runs shell commands on your machine"** acknowledgement the user has to
  accept before the rule can be saved.
- **FR-3.11 [MUST] continue-loop** — pick a **loop style** (see `02` loop types) and a **max
  iterations** cap (integer ≥ 1). Explain that this keeps the agent working after it would
  otherwise stop, up to the cap.
- **FR-3.12 [MUST] notify-channel** — optional **message** override. ⚠️ **CORRECTION
  (2026-07-04): the `channel` routing hint (telegram/slack) was dropped — notify-channel is
  in-app only. See `CONTRACT-ADDENDUM.md`.**

### Rule management
- **FR-3.13 [MUST]** Give each rule an **enabled/disabled toggle** (a disabled rule is saved
  but never fires).
- **FR-3.14 [SHOULD]** Optional **label** per rule (a human handle used in summaries and
  active-spell surfaces).
- **FR-3.15 [MUST]** Show a **live plain-English summary** of each rule as it's configured
  (e.g. "After Edit/Write → run `npm run lint` and feed the output back").
- **FR-3.16 [MUST]** Reorder / remove rules. (Order matters: on one event, multiple rules
  fire in order and their text outputs concatenate.)
- **FR-3.17 [SHOULD]** Duplicate a rule.

## 4. Edit a spell (A)

- **FR-4.1 [MUST]** Edit any **custom** spell: all of name/description/icon/color/rules.
- **FR-4.2 [MUST]** **Seed** spells are read-only — offer "duplicate to edit" instead of editing.
- **FR-4.3 [MUST]** Warn about unsaved changes on close/navigate-away (discard confirmation).
- **FR-4.4 [SHOULD]** Editing a rule's config while the spell is **already active** on
  sessions should be safe — the change takes effect on the next trigger (the backend
  re-reads rules at fire time). The UI should communicate this, not imply a re-cast is needed.

## 5. Cast / Activate a spell (A)

- **FR-5.1 [MUST]** Activate a spell onto **one or more target sessions** from the library,
  detail view, or a session's own surface.
- **FR-5.2 [MUST]** Choose **cast mode** (see `02` cast modes): **Single**, **Broadcast**
  (independently on each of N sessions), **Coordinate** (N sessions form an ensemble).
- **FR-5.3 [MUST]** Select target session(s) with a clear picker showing which sessions are
  eligible (active sessions in scope). Auto-select mode based on target count is a nice touch
  (1 → single, >1 → broadcast).
- **FR-5.4 [MUST]** For **risky** spells (any rule that runs commands, loops, or otherwise has
  side effects), show a **confirmation** before casting.
- **FR-5.5 [MUST]** After casting, give immediate feedback (toast/receipt) naming what was
  cast onto which sessions, with an **Undo** (deactivate) affordance.
- **FR-5.6 [SHOULD]** Casting should be keyboard-drivable (open launcher → search → pick →
  choose targets → cast) for power users.
- **FR-5.7 [MUST]** Spells can also be attached to a **task** so they auto-activate when a
  session spawns for that task ("spells on spawn"). The UI must let a user manage a task's
  attached spells.

## 6. Manage active spells (A)

- **FR-6.1 [MUST]** See, per session, **which spells are currently active** on it.
- **FR-6.2 [MUST]** Represent active spells on/near the session (the current design uses
  concentric **color rings** + **chips**; redesign as you see fit, but the "what's live on
  this session, at a glance" need is mandatory).
- **FR-6.3 [MUST]** From an active spell, **deactivate** it (remove from that session).
- **FR-6.4 [SHOULD]** Toggle an active spell **enabled/disabled** without fully deactivating.
- **FR-6.5 [MUST]** For active spells with **loop** rules, show **loop progress** (e.g.
  "iteration 2 / 3") per loop rule.
- **FR-6.6 [SHOULD]** **Reset** a loop's iteration counter back to 0 (per-rule). *(Needs a
  small backend endpoint — see `05-open-decisions.md`; today it's optimistic/local-only.)*
- **FR-6.7 [SHOULD]** A **spellbook / management drawer**: a project-wide view of all active
  spells across all sessions, with the same manage actions.
- **FR-6.8 [COULD]** Bulk actions (deactivate all on a session; deactivate a spell everywhere).

## 7. Observe / debug — "why did this fire?" (A)

- **FR-7.1 [SHOULD]** Surface **when a rule fires** (the backend emits a `spell:rule_fired`
  event with spellId/ruleId/event/action/outcome). A live feed or per-session activity
  indicator lets users trust that automations are actually running.
- **FR-7.2 [SHOULD]** Make **silent failures visible** — e.g. a run-command that errored, or
  output that was fed back. (This is the class of bug that motivated the redesign; the UI
  should make "it ran and here's what happened" observable.)
- **FR-7.3 [COULD]** A **dry-run / test-fire** for a single rule against a synthetic payload,
  so authors can validate a rule without a live session. *(Needs a backend dry-run endpoint —
  see `05`.)*

## 8. Delete / lifecycle (A)

- **FR-8.1 [MUST]** Delete a **custom** spell (with confirmation). Seeds cannot be deleted.
- **FR-8.2 [SHOULD]** Deleting a spell that is currently active somewhere should warn and/or
  deactivate it cleanly.

## 9. Casts / Invocations (B) — coexistence

- **FR-9.1 [MUST]** From an **entity** (task, doc, skill, team-member, session, custom
  prompt, project), run a one-shot **cast** that sends a templated prompt to target
  session(s). This is distinct from activating a spell.
- **FR-9.2 [MUST]** Browse entities by type and pick which template/verb to apply (e.g. a
  task → "refer", "execute", "get details").
- **FR-9.3 [MUST]** Create/manage **custom prompts** (reusable one-shot prompt snippets).
- **FR-9.4 [MUST]** The UI must **not conflate** a one-shot cast (B) with activating an
  automation (A) — clearly separate entry points and language.

## 10. Ensembles (A, advanced)

- **FR-10.1 [SHOULD]** When casting in **Coordinate** mode, form an **ensemble** (named group
  of sessions with a shared objective and optional leader).
- **FR-10.2 [SHOULD]** View an ensemble: members, leader, objective; **message** all members;
  **add/remove** members; **disband**.
- **FR-10.3 [COULD]** Visually group sessions that belong to an ensemble.

## 11. Cross-cutting requirements

- **FR-11.1 [MUST]** **Real-time**: active-spell state, loop progress, and rule-fired events
  update live via WebSocket (no manual refresh).
- **FR-11.2 [MUST]** Handle all **empty / loading / error / disconnected / no-eligible-targets**
  states gracefully (see `03`).
- **FR-11.3 [MUST]** **Accessibility**: keyboard navigation, focus management in modals/
  drawers, ARIA labels, adequate color contrast (the ring colors must not be the only signal —
  pair with text/icon). Respect reduced-motion.
- **FR-11.4 [SHOULD]** **Permissions**: authoring a `run-command` rule may be gated by a
  command-permission grant; the UI should reflect when the current user/agent can't create
  such rules.
- **FR-11.5 [MUST]** **Undo** for destructive/at-a-distance actions (cast, deactivate) where
  practical.
- **FR-11.6 [SHOULD]** Consistent, legible **rule-summary language** reused everywhere a rule
  is shown (library card, detail, active chip, editor).
