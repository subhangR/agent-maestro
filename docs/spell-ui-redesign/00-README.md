# Spell System — UI Redesign Spec

This folder is the **complete requirements + design brief** for redesigning the Maestro
Spell UI. You design the visuals against it; hand the design back and it gets implemented
and wired to the existing backend (which already ships the full multi-rule model).

**These docs describe *what* the UI must let users do and *what data/constraints* exist —
not *how* it should look.** The look is yours to design. Everything here is grounded in the
actual shipped backend (staging), so anything you design against it is buildable.

## Read in this order

| File | What it's for |
|---|---|
| `00-README.md` | This file — mental model, glossary, index. |
| `01-functional-requirements.md` | Every user capability, as numbered requirements (browse, create, edit, cast, manage, observe). |
| `02-config-and-options-reference.md` | The exhaustive data dictionary — every field, allowed value, default, limit. What controls you need to design. |
| `03-surfaces-states-and-flows.md` | The design deliverables: every screen/panel to design, the states each must handle, and the end-to-end flows. |
| `04-backend-contract.md` | Endpoints, payloads, events, and data shapes. For implementability + wiring. |
| `05-open-decisions.md` | Product/UX decisions to make *during* design (each with a recommendation). |

## The one mental model you must internalize

The word "spell" covers **two different mechanisms**. The UI must make which-is-which
obvious, because they behave completely differently. Most of this redesign is about
**Mechanism A**; Mechanism B already works and mostly needs to coexist cleanly.

### Mechanism A — **Automations** (the real "spell system", the focus of this redesign)
A **Spell** is a reusable automation: a named bundle of **rules**. Each rule is one
**trigger → one action**. You **activate** a spell onto one or more running sessions; from
then on, whenever a trigger fires (a Claude hook event), its action runs automatically —
inject a prompt, feed context, run a shell command, loop the agent, or notify a channel.

> Example: a spell "CI Guard" with two rules — *(1) after every Edit/Write → run `npm run
> lint` and feed the output back; (2) when the agent stops → notify Telegram.* Activate it
> on a session and it just runs, hands-free, until deactivated.

- Persistent: lives until you deactivate it.
- Multiple hooks per spell, each independently configured and toggleable.
- This is what the user wants a clean, intuitive **editor** and **management UI** for.

### Mechanism B — **Casts / Invocations** (one-shot prompts; already works)
A one-time action: take an **entity** (a task, a doc, a skill, a team member, a custom
prompt…), run it through a small template, and drop the resulting **prompt** into a target
session — right now, once. "Send this task as context to that session." No persistence, no
hooks. This is the `invoke` path.

**Design implication:** browsing/launching surfaces may show both, but the UI must never let
a user confuse "fire a prompt once" (B) with "install an automation that keeps running" (A).

## Glossary

- **Spell** — a named automation = `{ name, description, icon, color, rules[] }`. (Mechanism A)
- **Rule** — one `{ trigger → action }` binding inside a spell. A spell has 1–20 rules.
- **Trigger** — what makes a rule fire. Today: a **hook event** (8 Claude events).
  Scheduled/time triggers are modeled but not yet active ("coming soon").
- **Action** — what the rule does: `inject-prompt`, `feed-context`, `run-command`,
  `continue-loop`, `notify-channel`. Each carries its own config.
- **Hook event** — a moment in the agent's lifecycle (before/after a tool, on stop, on
  session start, etc.) that the automation can react to.
- **Activate / Cast (a spell)** — attach a spell to session(s) so its rules start firing.
- **Active spell** — a spell currently attached to a specific session (has per-rule loop
  counters, an on/off state, a ring color).
- **Deactivate** — detach a spell from a session; its rules stop firing.
- **Library / Spellbook** — the collection of spell definitions (curated seeds + user-made).
- **Seed spell** — a curated, non-deletable built-in spell.
- **Invoke (an entity)** — Mechanism B: one-shot prompt from an entity template.
- **Ensemble** — a group of sessions coordinated by a spell cast in "coordinate" mode.
- **Ring** — the colored border drawn around a session tile/panel per active spell.

## What already exists (redesign targets, not constraints)

There is a working-but-rough set of components today (`SpellLauncher`, `CustomSpellEditor`,
`ActiveSpellsPanel`, `ActiveSpellChip`, `SpellbookDrawer`, `SpellCard`, `SpellDetailFlyout`,
`EnsembleDock`, `CastModeToggle`, …). Treat these as *inventory of capabilities to
redesign/replace*, not as layouts to preserve. `03-surfaces-states-and-flows.md` maps them.

## Scope note

The backend is done and shipped: the full multi-rule model, validation, dispatcher, seeds,
and hook wiring are live on staging. So this is a **UI/UX redesign on a stable contract** —
no backend redesign required, only wiring the new UI to existing endpoints (and a couple of
small, clearly-flagged backend additions listed in `05-open-decisions.md`, e.g. a loop-reset
endpoint).
