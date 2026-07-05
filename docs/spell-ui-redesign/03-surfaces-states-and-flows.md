# Surfaces, States & Flows (Design Deliverables)

The concrete list of what to design. For each surface: its job, the key content, and the
**states** it must handle. Then the end-to-end flows that tie them together. You're free to
merge, split, or rename surfaces — this is the capability inventory, not a layout.

---

## A. Surfaces to design

### S1 — Spell Library / Browser (A)
**Job:** browse, search, filter all spells; entry point to cast/create/edit.
Content: spell cards (name, icon, color, rule summary, seed/custom badge), search, filter/
group, "recently used", "＋ Create spell".
States: **loading**, **empty** (no custom spells yet — show seeds + a create nudge),
**error** (fetch failed + retry), populated, **search-no-results**.

### S2 — Spell Detail (A)
**Job:** full view of one spell — every rule expanded, metadata, actions.
Content: header (name/icon/color/description/badge), rule list (each: trigger summary →
action summary, config, enabled state, label), actions (Cast, Edit, Duplicate, Delete —
Edit/Delete hidden/disabled for seeds).
States: read-only (seed) vs editable (custom); active-somewhere indicator.

### S3 — Spell Editor (A) — **the centerpiece**
**Job:** create/edit a spell and its rules. This is where the redesign matters most.
Content:
- Spell header fields: name, description, icon, color.
- **Rule list**: add / remove / reorder / duplicate / enable-toggle rule cards.
- **Per-rule builder** (the hard part): trigger-type toggle (Hook | Schedule-disabled) →
  hook-event picker (with descriptions) → matcher (structured tool picker + advanced regex)
  → action picker (filtered by event) → action-specific config panel → live rule summary →
  optional label.
- run-command's **shell-command acknowledgement**.
- Save / Cancel; validation errors inline; unsaved-changes discard guard.
States: **create** vs **edit**; **read-only** (seed → prompt to duplicate); **saving**;
**validation-error**; **dirty/discard-confirm**; per-rule **collapsed/expanded**.
> This surface must scale from a 1-rule spell to a 20-rule spell without becoming a wall.
> Consider progressive disclosure (collapsed rule = its summary line; expand to configure).

### S4 — Cast / Launcher (A + B)
**Job:** pick a spell (A) or an entity (B), choose targets + mode, and fire.
Content: source picker (spell library vs entity browser — keep A and B clearly separated),
**target session picker**, **cast-mode toggle** (Single/Broadcast/Coordinate), ensemble-name
field (coordinate only), risky-cast confirmation, Cast button.
States: **no eligible targets** (nothing to cast onto), single vs multi target, **risky
confirm**, **casting** (in-flight), **error**.

### S5 — Active-spells-on-a-session (A)
**Job:** show, at a glance and on demand, which spells are live on a given session and let the
user manage them.
Content: the **ring** treatment around the session tile/panel (concentric per active spell),
**chips** or a popover listing active spells (name, color, enabled, loop progress), per-spell
actions (deactivate, enable-toggle, reset-loop). "＋ Cast" affordance.
States: **none active**, 1–N active, **overflow** (many active → "+N"), a spell **looping**
(iteration x/y), a spell **disabled**, **disconnected** (WS down — show stale-safe).

### S6 — Spellbook / Management Drawer (A)
**Job:** project-wide view of every active spell across all sessions; manage in bulk.
Content: grouped by session (or by spell), each active spell with manage actions; jump-to-session.
States: loading, empty (nothing active anywhere), populated, error.

### S7 — Task ↔ Spell assignment (A)
**Job:** attach spells to a task so they auto-activate when a session spawns for it.
Content: a task's attached spells (rule summaries), add/remove, "add spell" launcher.
States: none attached, some attached.

### S8 — Activity / "why did it fire" (A) — observability
**Job:** let users trust and debug automations.
Content: a live feed or per-session indicator of rule-fired events (spell · rule · event ·
action · outcome); surfacing of run-command output/errors.
States: quiet (nothing firing), active, error outcomes highlighted.

### S9 — Ensemble surfaces (A, advanced)
**Job:** view/manage an ensemble.
Content: members, leader, objective, message-all composer, add/remove member, disband; visual
grouping of member sessions.
States: forming, active, disbanded.

### S10 — Casts / Entities & Custom Prompts (B)
**Job:** browse entities by type, pick a verb/template, cast one-shot; manage custom prompts.
Content: entity-type browser, template picker, target + send; custom-prompt CRUD.
States: standard loading/empty/error.

### Cross-surface components
- **Rule summary** line (one consistent renderer everywhere a rule appears).
- **Undo toast / cast receipt**.
- **Confirmations** (risky cast, delete, discard, shell-command ack).
- **Color/icon identity** primitives (swatch, ring, chip).

---

## B. States checklist (apply to every relevant surface)

- **Loading** — skeleton/spinner.
- **Empty** — first-run, nothing yet (distinct copy per surface).
- **Error** — fetch/save failed, with retry.
- **Disconnected** — WebSocket down; live data may be stale; degrade gracefully (don't lie
  about active state).
- **No eligible targets** — casting with no active sessions to target.
- **Risky-confirm** — before casting a spell with side-effecting rules.
- **Read-only** — seed spells.
- **In-flight** — casting/saving/deleting.
- **Undo window** — right after a cast/deactivate.
- **Overflow** — many active spells on one session, many rules on one spell.
- **Looping** — active loop with live iteration count.

---

## C. Key end-to-end flows

### Flow 1 — Create an automation and activate it
1. Library (S1) → "＋ Create spell" → Editor (S3).
2. Set name/icon/color/description.
3. Add rule → pick event "PostToolUse" (with description) → tool matcher "Edit, Write" →
   action "run command" (filtered list) → command `npm run lint`, feedOutput ON → accept
   shell-command warning → live summary confirms.
4. Add second rule → event "Stop" → action "notify" → message text. (⚠️ 2026-07-04: the old
   "channel telegram" routing was dropped — notify-channel is in-app only.)
5. Save → spell appears in library.
6. Cast (S4): pick the spell → choose session(s) → Single/Broadcast → risky confirm → Cast.
7. Session shows a new ring/chip (S5); Undo available (toast).
8. Agent edits a file → lint runs async → output fed back; agent stops → telegram ping.
   Activity feed (S8) shows both rules fired.

### Flow 2 — Edit an active spell's rule
1. Library/Detail (S1/S2) → Edit (S3) a custom spell that's currently active.
2. Change the lint command / add a rule → Save.
3. UI communicates: change applies on the next trigger (no re-cast needed).

### Flow 3 — Manage what's running
1. Open Spellbook (S6) or a session's active-spells (S5).
2. See loops mid-iteration (2/3), disable one rule, deactivate another, reset a loop.
3. Everything updates live (S5/S6) via WebSocket.

### Flow 4 — Customize a seed
1. Detail (S2) of a seed → "Duplicate to edit" → Editor (S3) with a custom copy → adjust → Save.

### Flow 5 — One-shot cast (B), kept separate
1. Cast/Launcher (S4) → switch to **entity** source (S10) → pick a task → verb "refer" →
   target session → send. No persistence, no ring. Clearly not an automation.

### Flow 6 — Coordinate an ensemble
1. Cast (S4) a coordination spell → Coordinate mode → pick ≥2 sessions → name the ensemble →
   Cast → Ensemble surface (S9) appears; message all / manage members.

---

## D. Current components → redesign mapping (for reference only)

| Need | Current component(s) | Redesign as |
|---|---|---|
| Library browse | `SpellLauncher`, `SpellCard` | S1 |
| Detail | `SpellDetailFlyout` | S2 |
| Editor | `CustomSpellEditor` | S3 (biggest change) |
| Cast/targets/mode | `SpellLauncher`, `SessionTargetChips`, `CastModeToggle` | S4 |
| Active on session | `ActiveSpellsPanel`, `ActiveSpellChip`, `ActiveSpellChipMenu`, `ActiveSpellRow`, rings | S5 |
| Spellbook | `SpellbookDrawer` | S6 |
| Task assignment | `TaskSpellAssignment` | S7 |
| Observability | *(none yet — new)* | S8 |
| Ensembles | `EnsembleDock`, `EnsembleGroup`, `EnsembleMessageComposer` | S9 |
| Custom prompts / entities | (invoke path in launcher), `CustomSkillEditor` | S10 |
| Undo / receipts | `UndoToast` | cross-cutting |

> Don't feel bound to these boundaries. If a single unified "Spell Studio" surface serves
> browse+detail+edit better, design that. The mapping just shows nothing is lost.
