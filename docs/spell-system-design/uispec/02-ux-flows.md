# Spell System — UX Flows (Interaction Model)

> Scope: the *behaviour* of the new spell UI. Component anatomy is owned by `components`; tokens/motion/a11y primitives are owned by `ui-systems`. This doc locks how users move through the system and which states they can be in.
>
> Read first: `docs/spell-system-design/DESIGN_BRIEF.md`, `5-lifecycle-ui-phases.excalidraw`, `6-multi-session-ensembles.excalidraw`, `multi-session-ensembles.md`.

---

## 0. Vocabulary & mental model

The user thinks in three nouns:

| Term         | What the user perceives                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| **Spell**    | A reusable behaviour they can *cast* on a session. Each spell has a fixed color, icon, and action kind. |
| **Active**   | A spell currently bound to a session — visible as a colored ring around the session's three boxes.     |
| **Ensemble** | A persistent group of sessions sharing a coordinate-mode spell, with a cross-session message channel.   |

Three verbs:

- **Cast** — apply a spell to one or more sessions (the *moment* of invocation).
- **Toggle** — turn an already-active spell on/off without removing it.
- **Disband / Deactivate** — remove a spell or dissolve an ensemble.

The whole UI is built around answering, at a glance:
*"What is active on this session right now, and how do I change it?"*

---

## 1. Surfaces (where the user can be)

| Surface              | Purpose                                                                  | Trigger                                                                     | Owner             |
| -------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------- |
| **Cast Sheet** *(component name: `SpellLauncher`)* | Browse library, pick targets, choose castMode, cast. | `Cmd/Ctrl+Shift+S`, ✦ in TerminalStrip header, session tile context menu, command-bar ✦. Source enum in `OpenLauncherInput.source`. | `components`      |
| **Spellbook drawer** | Manage all active spells across the project; bulk deactivate; audit log. | `Cmd/Ctrl+Shift+B` or "Manage spells" in command palette.                   | `components`      |
| **Spell detail flyout** | View spell metadata, bind/unbind trigger, edit failMode, set maxIterations. | Click chip in TerminalStrip OR row in Spellbook OR "i" in library row. | `components`      |
| **Active-spell chip-strip** | Inline status — what's running on *this* session. | Always visible in TerminalStrip header.                                | `components`      |
| **Concentric rings** | Glanceable identity of active spells on session tiles.                   | Always-on borders on `pn-st`, `pn-srail-s`, `.terminalContainer`.           | `ui-systems` (tokens) |
| **Undo toast**       | 5-second reversal of last cast.                                          | Auto-appears after any successful cast.                                     | `components`      |

The Cast Sheet *replaces* the current `SpellPicker` (`maestro-ui/src/components/maestro/SpellPicker.tsx`). The current store action `openPicker(targetSessionId)` becomes `openCastSheet({ initialTargets: [sessionId], origin: 'terminal-strip' })`.

---

## 2. Cast flow (single-target)

### 2.1 Entry points

```
┌──────────────────────────────────────────────────────────────────────┐
│  ENTRY                                              opens Cast Sheet │
├──────────────────────────────────────────────────────────────────────┤
│  Cmd/Ctrl+Shift+S (global)        ── target = focused session        │
│  TerminalStrip header ✦ button    ── target = that session           │
│  Session tile right-click → Cast  ── target = clicked session        │
│  Command palette → "Cast spell"   ── target = focused session        │
│  Spellbook drawer "+ Cast" button ── target = empty (pick first)     │
└──────────────────────────────────────────────────────────────────────┘
```

- If no session is focused when the global shortcut fires, the Cast Sheet opens in **no-target** state (see §10.4) — user must add at least one target chip before the Cast button enables.
- The shortcut is registered in `useKeyboardShortcuts.ts` (additive — must not collide with existing Cmd/Ctrl+Shift+S; if conflict found there, fall back to `Cmd/Ctrl+Alt+S` and update this spec).
- The triggering element is captured as `lastFocusedRef`; closing the Sheet returns focus there (a11y requirement).

### 2.2 Wireflow

```
                       ┌────────────────────────────┐
                       │   keystroke / click / ctx  │
                       └────────────┬───────────────┘
                                    ▼
                       ┌────────────────────────────┐
                       │ store.openCastSheet()      │
                       │  • capture lastFocusedRef  │
                       │  • initialTargets = [s]    │
                       │  • castMode = 'single'     │
                       │  • fetchEntities()         │
                       └────────────┬───────────────┘
                                    ▼
        ┌──────────────────────── CAST SHEET ────────────────────────┐
        │ ┌────────────────────────────────────────────────────────┐ │
        │ │ Targets:  [● foo  ×] [+ add]    Mode: ⦿ Single ○ B ○ C │ │  ← target chip-bar
        │ ├────────────────────────────────────────────────────────┤ │
        │ │ 🔍 Search spells…                       (autofocus)    │ │
        │ ├────────────────────────────────────────────────────────┤ │
        │ │  RECENT                                                │ │
        │ │   ✦ plan-execute     ● blue                            │ │
        │ │  LIBRARY                                               │ │
        │ │   ⚡ lint-gate       ● amber   gate                    │ │
        │ │   ☰ watch-tests     ● teal    feed-context             │ │
        │ │   ✎ summarize       ● violet  inject-prompt            │ │
        │ │   …                                                    │ │
        │ ├────────────────────────────────────────────────────────┤ │
        │ │   [ Esc Cancel ]              [ ⏎ Cast on foo ]        │ │
        │ └────────────────────────────────────────────────────────┘ │
        └─────────────────────────────────────────────────────────────┘
                                    │
                          ┌─────────┴─────────┐
                          ▼                   ▼
                  type to filter         Arrow ↓/↑ navigates list
                          │                   │
                          └─────────┬─────────┘
                                    ▼
                            ⏎ on highlighted row
                                    │
                  ┌─── risky? ──────┴───── no ─────┐
                  ▼                                ▼
       inline confirm banner               POST /api/spells/cast
       [ Cast anyway ]  [Back]                     │
                  │                                ▼
                  └──────── Cast ──────► server emits spell:activated
                                                   │
                                                   ▼
                                       Sheet closes, focus restored,
                                       ring renders on 3 boxes,
                                       undo toast appears (5s)
```

### 2.3 Keyboard-first interaction (locked)

| Key                       | Behaviour                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Cmd/Ctrl+Shift+S`        | Open Cast Sheet targeted at focused session.                                                                           |
| `Esc`                     | Close Sheet (or step back: confirm-banner → list → close). Returns focus to invoking element.                          |
| `↑` / `↓`                 | Move highlight within the library list (`aria-activedescendant`).                                                      |
| `Home` / `End`            | Jump to first / last spell in current filter.                                                                          |
| `PgUp` / `PgDn`           | Page through long lists.                                                                                               |
| Any printable             | Focuses search input (debounced 150ms) and filters; type-ahead never traps focus inside list.                          |
| `⏎`                       | Cast highlighted spell on current targets. If risky-cast, first press shows confirm banner; second press confirms.     |
| `⌘+⏎` / `Ctrl+⏎`         | Force-cast (skips risky-cast banner, but still produces an undo toast).                                                 |
| `Tab` / `Shift+Tab`       | Cycle (canonical, reconciled with `03 §1.11`): search → mode radios → library → target chip-bar → cancel → cast. Focus is trapped inside the dialog. |
| `B` / `C` / `S`           | Switch castMode radios (`B`roadcast / `C`oordinate / `S`ingle) — only when search is empty (otherwise the letter filters). Matches `03 §1.11`. |
| `1`..`9`                  | Quick-select target session by index in the target chip-bar (1 = first chip, etc.). Only when search is empty. Reconciled with `03 §1.11`. |
| `/`                       | Focus search input from anywhere in the Sheet (matches `03 §1.11`).                                                    |
| `Backspace` in empty search | Removes the last target chip (matches chip-input convention).                                                          |

A small "?" icon in the Sheet footer reveals a key-help popover (`aria-describedby` linked).

### 2.4 Library browsing & search

- Library is grouped: **Recent (last 5)** → **Active on this target** (so user sees what's already on) → **By action-kind** (`inject-prompt`, `gate`, `continue-loop`, `feed-context`, `run-command`, `notify-channel`) → **Custom**.
- Search input is **debounced 150ms** (use a small internal debounce, not lodash) and filters across name, description, and action-kind keyword. Empty search shows full grouped view.
- Filter results render flat (no group headers) sorted by: exact-name > prefix > substring > description-match.
- Each row shows: color dot · icon · name · action-kind chip · "i" details affordance · keyboard hint on highlight.
- Already-active spells on the current targets show an "ACTIVE" pill and casting them again means **re-cast** (re-inject for inject-prompt, reset iteration for loops; visible in the row's tooltip).
- "Cannot cast on these targets" reasons (e.g. gate on a session without exit-2 support) render as a muted row with a tooltip explaining why and no enter action.

### 2.5 Focus trap & dialog semantics

- The Cast Sheet is `role="dialog"` `aria-modal="true"` with `aria-labelledby` pointing at the title.
- Focus enters the search input on open.
- **Canonical tab order** (reconciled with `03 §1.11`, follows reading order — pick a spell, then confirm targets, then commit):
  `[backdrop sentinel] → search → modeRadios → libraryList → targetChips → cancel → cast → [sentinel] → search …`. Sentinels are zero-size focus traps using the standard wai-aria pattern.
- Backdrop click and Esc close. Clicks on the Sheet body do not propagate to backdrop.
- On close, `lastFocusedRef.current?.focus()` is called inside a `queueMicrotask` to survive React re-render.
- **Stacked-dialog contract** (when `SpellDetailFlyout` opens above the Sheet): while the flyout is open, the Sheet's focus trap is **suspended** (sentinels disabled, `aria-hidden="true"` on the Sheet body); the flyout owns focus and dismisses on click-outside or `Esc`. On flyout close, the Sheet re-enables its trap and returns focus to the element that opened the flyout (typically the library row or chip). This must be wired explicitly — `aria-modal="true"` nested under `aria-modal="false"` is not handled correctly by Radix/React-Aria out of the box; `components` owns the implementation.

### 2.6 Risky-cast confirmation

A cast is "risky" if any of:

- `action ∈ {gate, run-command}` AND target session is currently `processing` (would interrupt).
- `action = continue-loop` AND there's already a continue-loop spell active on the same target (compounded loops).
- `castMode = broadcast` AND `targets.length > 5`.

UX: an inline yellow banner replaces the footer until confirmed:

```
┌────────────────────────────────────────────────────────────┐
│ ⚠ This will gate the next tool call on foo (running).     │
│   [ Back to library ]              [ ⏎  Cast anyway ]      │
└────────────────────────────────────────────────────────────┘
```

The banner is `role="alertdialog"` with `aria-describedby` and focus moves to "Cast anyway".

### 2.7 Undo

After every successful cast, a toast appears (5s, dismissible) at the bottom-right of the workspace:

```
┌──────────────────────────────────────────────┐
│ ✦ Cast plan-execute on foo  ·  [Undo]  · ×  │
└──────────────────────────────────────────────┘
```

Undo issues `POST /api/spells/deactivate` for each newly created `ActiveSpell` (or a bulk `POST /api/spells/bulk-deactivate` if available — flagged for backend per critic §4.4). Multi-target cast → single toast, "Cast plan-execute on 3 sessions · Undo". Undo is **disabled** for re-casts and for any cast whose action has already fired (`iteration > 0`); the toast still shows but the button is grey with a tooltip "Already executed".

**Reduced motion:** when `prefers-reduced-motion: reduce` matches, the toast appears/disappears with **opacity-only** transitions (no slide); the 150ms slide is suppressed. The 5s auto-dismiss timer is unchanged. Toast selectors are added to the central `prefers-reduced-motion: reduce` block in `01-design-system.md §4`: `.spell-undo-toast`, `.spell-undo-toast--enter`, `.spell-undo-toast--exit` — `animation: none; transition: opacity 0ms;`.

---

## 3. Activation visibility (what's on this session?)

Two answers, two surfaces. They must agree at all times — both subscribe to `useSpellStore.activeSpellsBySession`.

### 3.1 Glance: concentric rings on the 3 boxes

```
                pn-srail-s              pn-st              .terminalContainer
                ┌─────────┐         ┌────────────┐         ┌────────────────┐
                │ ╭─────╮ │         │╭──────────╮│         │╭──────────────╮│
   inner ring → │ │ ╭─╮ │ │         ││╭────────╮││         ││╭────────────╮││
   middle      →│ │ │S│ │ │         │││  foo   │││         │││  terminal  │││
   outer       →│ │ ╰─╯ │ │         ││╰────────╯││         ││╰────────────╯││
                │ ╰─────╯ │         │╰──────────╯│         │╰──────────────╯│
                └─────────┘         └────────────┘         └────────────────┘
                  3 rings              3 rings                3 rings (thicker)
```

- Up to 4 rings, ordered by `ActiveSpell.castAt ASC` (oldest = innermost). 5+ collapses ring 4 to keep the 4th spell's color and renders a `.spell-ring__overflow` "+N" pill **inside** the host (top-right on `pn-st` / `.terminalContainer`, bottom-right on `pn-srail-s`) — never outside, never a neutral ring-4 (frozen in `UI_SPEC.md §7`).
- **Canonical ring contract (frozen, `UI_SPEC.md §7` — overrides any other doc).** Hosts get their attributes + style from `spellRingAttrs(activeSpells)` in `maestro-ui/src/utils/spellRings.ts`; `SpellRingHost` spreads the whole object onto the host element. The contract surface is:
  - CSS vars per slot 1..4: `--spell-ring-N`, `--spell-ring-N-rgb`, `--spell-ring-N-w`.
  - Attributes: `data-spell-rings="{count}"` (0–4), `data-spell-ring-overflow="{N}"` when >4, `data-spell-ring-names="Guardian,Test Sentinel,+2"` (CSV; canonical source for the §3.1 tooltip + e2e selectors).
  - Stroke / contrast: solo ring (depth 1) and ring 1 always render `primary` at 100% (AA-verified ≥3:1); rings 2–4 render `border` at 42% (disambiguated by hue + position); ensemble outermost ring is always `primary`.
- Disabled (`enabled=false`) active-spells render as a **dashed ring** in the same color at 40% opacity. Loop spells in flight (`iteration > 0 && iteration < maxIterations`) animate the iter-tick on `.spell-ring__overflow` / `.spell-ring__tick` (never on ring box-shadows), gated by `useReducedMotion()`.
- Ensemble-tagged active-spells share `ensembleId` color across all members; they cluster as an outer ensemble-color *halo* on each member tile, and an outer wrapping border on the SpacesRail group container (see §4.4). Color is resolved in the store selector: when an `ActiveSpell` carries `ensembleId`, the selector that produces `RingSpec` reads `ensembles[ensembleId].color` and writes it into `RingSpec.ensembleColorId`; `SpellRingHost` performs no lookup, it just renders the resolved palette IDs.
- Hovering any of the 3 boxes for >400ms shows a tooltip listing each active spell + status. **Keyboard parity:** the same tooltip opens on `focus-visible` of the ring host (no hover required) and closes on blur/Esc — so the information is reachable via keyboard. AT users also receive the content via `aria-label` on the tile (host label shape locked in §7).
- Rings stack additively with existing visuals: focused → outermost focus token > selected → selection ring > spell rings > coordinator-glow (generalize as innermost). Order is enforced in CSS by `ui-systems`.

### 3.2 Manage: chip-strip + Spellbook drawer

**Inline chip-strip** lives in the TerminalStrip header (next to `formatTokens()` / `ContextGauge`). One chip per `ActiveSpell` on the selected session:

```
[ ● lint-gate  ⏸ ] [ ● plan-execute  3/8 ] [ ● watch  on Stop ] [ + Cast ]
```

- Color dot = spell color. Glyph after dot encodes action-kind (so color isn't load-bearing).
- Click chip → opens the spell-detail flyout (see §5).
- Long-press / right-click → quick menu: `Toggle`, `Reset loop`, `Deactivate`, `View in Spellbook`.
- `⏸` glyph = currently disabled. `3/8` = loop iteration. `on Stop` = bound to hook event.
- `[ + Cast ]` opens the Cast Sheet pre-targeted at this session.

**Spellbook drawer** (`Cmd/Ctrl+Shift+B`) — full management surface, slides from right:

```
┌──── SPELLBOOK ──────────────────────────────────────── × ──┐
│ Project: maestro       [ Filter: All ▾ ]   [ + Cast ]      │
├────────────────────────────────────────────────────────────┤
│ ▾  Session: foo    (3 active)                              │
│      ● lint-gate         enabled    [⏸]  [⤓]  [⌫]          │
│      ● plan-execute      enabled    3/8  [↻]  [⌫]          │
│      ● watch            paused      [▶]                    │
│                                                            │
│ ▾  Ensemble: refactor-squad   (4 members)   ● purple       │
│    members: a, b, c, d                                     │
│      [ ✉ Message ensemble ]  [ Disband ]                   │
│      ● critic-refine        enabled  1/4  [↻]  [⌫]         │
│                                                            │
│ ▾  Session: baz    (0 active)                              │
│      Drop a spell here, or [ + Cast ]                      │
└────────────────────────────────────────────────────────────┘
```

- Rows expose: deactivate `⌫`, toggle enabled `⏸/▶`, reset loop `↻`, view trigger binding `⤓` (opens flyout).
- Drawer is a navigable region: arrow keys move row focus; `Enter` opens detail flyout; `Delete` deactivates with confirm.
- Filter dropdown: All / By spell / By session / By ensemble / By action-kind.
- Drawer is sticky — closing it preserves scroll and filter via `usePersistentSessionStore`.

### 3.3 "What does this do?" affordance

Three places explain each spell consistently — all read from the same `SpellDefinition`:

1. Library row tooltip (delayed 600ms): name + description + action-kind + color.
2. Chip-strip tooltip (delayed 400ms): name + iteration/state + description.
3. Spell detail flyout: full description, action-kind explanation, current trigger binding, failMode, maxIterations, "Where it's active" list.

State diagram for a single ActiveSpell:

```
                  cast()
   ┌─ NONE ─────────────────▶ ACTIVE_ENABLED ◀──┐
   │                              │             │
   │                              │ toggle(off) │ toggle(on)
   │ deactivate()                 ▼             │
   │                          ACTIVE_DISABLED ──┘
   │                              │
   │                              │ deactivate()
   └──────────────────────────────┘

   ACTIVE_ENABLED also has, for loop spells:
   FIRING (iteration in flight) → COOLDOWN (between iterations) → EXHAUSTED (iteration == max)
```

EXHAUSTED loops render the outermost ring as solid + a "✓" glyph on the chip and stop pulsing; user can `↻ Reset` from chip menu or Spellbook.

---

## 4. Multi-session & ensembles

### 4.1 Mental model the UI must teach

> "A **Broadcast** sends the same spell to N independent sessions — like CC-ing an email. A **Coordinate** cast creates an **Ensemble**: a persistent named group that shares a colour, an objective, and a private message channel."

The Sheet visualises this distinction every time the user touches `Mode`:

```
   ⦿ Single        cast on 1 session
   ○ Broadcast     cast on N sessions (same prompt, independent)
   ○ Coordinate    cast on N sessions (roles + objective, forms an ensemble)
```

Picking Coordinate reveals the **ensemble setup panel** below; Broadcast does not.

### 4.2 Multi-target selection

Inside the Cast Sheet, the **target chip-bar** is the multi-select primitive:

```
Targets:  [● foo  ×] [● bar  ×] [● baz  ×] [+ add session]
```

- Clicking `+ add session` opens a popover with a searchable session list (scoped to active project; "Sessions in other projects" expandable). Multi-select with checkboxes; "Add 3" commits.
- Pasting comma-separated session names into the **target chip-bar's `+ add session` input** creates chips when each token uniquely matches; ambiguous names highlight red. (The library search input no longer accepts comma-to-add — moved here to avoid semantic confusion per critic §3.3.)
- Targets are also addable from the SpacesRail: shift-click multiple session tiles → press `Cmd/Ctrl+Shift+S` → Sheet opens with all of them pre-chipped.
- Removing the last chip auto-switches mode back to Single.
- Adding the 2nd chip auto-switches mode to Broadcast (visible, reversible).

### 4.3 Coordinate setup (ensemble creation)

When the user toggles Coordinate, the Sheet grows a setup panel between the mode radios and the library list:

```
┌─ Coordinate ────────────────────────────────────────────────────┐
│  Ensemble name *   [refactor-squad                  ]           │
│  Shared objective  [Reduce duplication in api/* …  ]            │
│  Leader            [● foo ▾]    (optional — coordinates others) │
│  Roles                                                          │
│    foo   [planner            ▾]                                 │
│    bar   [worker             ▾]                                 │
│    baz   [critic             ▾]                                 │
│  Color   ● purple   (auto from palette; click to change)        │
└─────────────────────────────────────────────────────────────────┘
```

- Roles dropdown is populated from the chosen spell's coordinate-mode role hints; if the spell has no hints, falls back to free-text.
- Color defaults to the next unused palette slot; clicking opens a swatch with `aria-roledescription="color swatch"`.
- Name validation: required, ≤ 40 chars, unique within project; error renders inline.
- After successful cast: ensemble created (`POST /api/ensembles`), members each get an `ActiveSpell` with `ensembleId`, server emits `ensemble:created` + per-member `spell:activated`, Cast Sheet closes, undo toast appears with `Undo` → `disband`.

### 4.4 Ensemble grouping view (SpacesRail)

Members of an ensemble cluster into a labelled container in the SpacesRail:

```
SpacesRail (`pn-srail`):

┌──────────────────────────────────┐
│  ● Sessions                      │
│   ╭─ alone ─╮                    │
│   │    S    │ ← regular tile     │
│   ╰─────────╯                    │
│                                  │
│  ┌─ ● refactor-squad ───────┐    │ ← ensemble wrapper, ensemble color
│  │   ╭───╮ ╭───╮ ╭───╮      │    │
│  │   │ f │ │ b │ │ z │      │    │   members share the ensemble ring
│  │   ╰───╯ ╰───╯ ╰───╯      │    │
│  │   [ ✉ ]  [ Disband ]     │    │ ← in-context actions
│  └──────────────────────────┘    │
│                                  │
│   ╭─ other ─╮                    │
│   │    S    │                    │
│   ╰─────────╯                    │
└──────────────────────────────────┘
```

- Tiles inside the wrapper keep their per-spell rings; the ensemble color is a fourth, outermost ring on each member tile (counts against the 4-ring cap → if a member has 4 spells, the ensemble ring replaces the oldest, and the chip-strip shows "+N").
- Wrapper header carries: color dot, ensemble name, member count, kebab menu (`Rename`, `Add member`, `Remove member`, `Disband`, `Open in Spellbook`).
- Same wrapper renders in MultiProjectSessionsView with collapsed-state by default.
- Dragging a session tile *into* a wrapper adds it (with confirm modal: "Add baz to refactor-squad? They'll receive the coordinate prompt now.").

### 4.5 Cross-session message channel

A **message ensemble** affordance lives in three places, all routing to `maestro ensemble message`:

1. Ensemble wrapper header → `✉` button.
2. Spellbook ensemble row → `Message ensemble` button.
3. Slash command in any session's terminal input → `/ensemble <name> <text>` (suggested by `useAgentShortcutStore`).

The compose UI is a small inline dialog:

```
┌─ Message refactor-squad ─────────────────────── × ─┐
│ To: ⦿ all  ○ foo only  ○ bar only  ○ baz only      │
│ ┌──────────────────────────────────────────────┐   │
│ │ baz, can you take the API split?             │   │
│ └──────────────────────────────────────────────┘   │
│  Sender attribution: [✓] include sender prefix     │
│       [ Esc Cancel ]            [ ⏎  Send ]        │
└────────────────────────────────────────────────────┘
```

- Sender = current user (if cast from UI) or initiating session (if from a session's slash command).
- Server reuses `session:prompt_send` with sender attribution baked into the prompt prefix; each recipient sees `[from refactor-squad/foo] baz, can you take the API split?`.
- Validation: non-empty, ≤ 4000 chars; `Cmd/Ctrl+Enter` sends; `Esc` cancels.
- Sent messages appear as transcript events in the Spellbook ensemble row (last 5 visible, "View all" expands).

### 4.6 Disband

- Triggered from the ensemble header kebab, Spellbook row, or Cast Sheet undo (immediately after creation).
- Confirm dialog (`role="alertdialog"`): "Disband refactor-squad? Members keep any other active spells; the coordinate spell will deactivate."
- On confirm: `POST /api/ensembles/:id/disband` → server emits `ensemble:disbanded` + per-member `spell:deactivated` for the ensemble spell.
- UI: wrapper container fades out (200ms), members re-flow to their normal SpacesRail positions, ensemble ring removed; if reduced-motion, no fade.

### 4.7 State diagram

```
                                +─────────────+
                  cast(coord)   │ FORMING     │   (server resp pending)
        none ───────────────────▶             │
                                +──────┬──────+
                                       │ ensemble:created
                                       ▼
                              +────────────────+
                              │ ACTIVE         │   members carry ActiveSpell w/ ensembleId
                              │ • shared color │
                              │ • channel open │
                              +───┬────────┬───+
                  add member      │        │  remove last member
                  ───────────────▶│        │◀────────────────────
                                  │        │
                          disband │        │ all members deactivated
                                  ▼        ▼
                              +────────────────+
                              │ DISBANDED      │  (persisted as audit row, hidden from list)
                              +────────────────+
```

---

## 5. Trigger / hook binding UX

### 5.1 Principle

Triggers are the most *dangerous* surface (binding a spell to a hook can gate or re-fire a session). The UX must:

- Default to **off** for every newly cast spell that has a trigger.
- Surface failMode prominently for gate spells.
- Cap loops with `maxIterations` visible and editable.
- Never bury these toggles in a settings menu — they belong on the spell-detail flyout where the user just clicked the chip.

### 5.2 Spell detail flyout

Opens to the right of the chip / library row, ~360px wide, `role="dialog"` (non-modal — doesn't trap focus, can be dismissed by clicking outside).

```
┌─ ● lint-gate ─────────────────────────── × ─┐
│  Gate · amber · custom                       │
│                                              │
│  When `npm run lint` would fail, gate the    │
│  next tool call and report the failure to    │
│  the agent.                                  │
│                                              │
│  ── Trigger ─────────────────────────────    │
│   Hook event:    PreToolUse                  │
│   Matcher:       Bash(npm run lint*)         │
│   Enabled        [ ●─── ]   on               │
│                                              │
│  ── Behaviour ───────────────────────────    │
│   failMode       ⦿ closed (block)  ○ open    │
│                  Reason: gate failures abort │
│                  the tool call (exit 2).     │
│   Max iterations  [ 3 ]   (loop spells only) │
│                                              │
│  ── Where it's active ──────────────────    │
│   • foo   (chip)                             │
│   • bar   (chip)                             │
│   [ Deactivate everywhere ]                  │
└──────────────────────────────────────────────┘
```

- Trigger toggle is a single switch with `aria-checked`. Flipping it calls `PATCH /api/sessions/:id/active-spells/:id { enabled }`.
- failMode is a radio pair with a short explanation under each — "closed" is highlighted as the safer default for gates; switching to "open" shows a small `⚠` and disables the cast button for 1s (intent friction).
- maxIterations is a number stepper (1–20). Editing while the spell is mid-loop applies to *future* iterations; the current iteration completes either way. A subtle "applies to next iteration" hint appears on change.
- Hook event + matcher are read-only here in v1 (they come from `Spell.trigger`); v2 may allow per-binding override.

### 5.3 Library-row trigger preview

In the Cast Sheet library, spells with a `trigger` show a small indicator: `🪝 PreToolUse`. Hovering reveals the matcher pattern. Casting such a spell automatically sets `trigger.enabled = false` initially — the post-cast undo toast adds a second action:

```
✦ Cast lint-gate on foo  ·  [Enable trigger]  [Undo]  · ×
```

`Enable trigger` is a one-click way to flip `enabled=true` without opening the flyout.

### 5.4 Loop iteration cap UX

For `continue-loop` spells, the chip shows `n/max`:

- `0/8` waiting / never fired
- `3/8` mid-loop, pulsing outer ring
- `8/8` ✓ exhausted, solid outer ring
- `Reset` from chip menu sets back to `0/n`.

If a user tries to cast a second continue-loop on the same session, the **risky-cast** banner fires (§2.6).

### 5.5 Trigger toggle flow

```
   chip click         flyout open
   ──────────────▶   ┌──────────────┐    flip switch
                     │  Trigger: ON │  ◀──────────── PATCH /active-spells/:id
                     └──────┬───────┘
                            │ WS spell:updated
                            ▼
                     chip glyph: ● → ●⏸ removed; ring becomes solid; on next hook
                     dispatch, spell fires.
```

---

## 6. Empty / loading / error / no-targets / disconnected

### 6.1 Loading

- Sheet opens immediately; `entities.length === 0` → render 6 skeleton rows (animated only if not reduced-motion). Library list `aria-busy="true"` until first fetch resolves.
- Spellbook drawer: skeleton groups while `activeSpellsBySession` is unhydrated.

### 6.2 Empty

| Surface             | Empty copy                                                                   | CTA                                  |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| Cast Sheet library  | "No spells yet. Curated spells are loaded with every project."               | `[ Reload library ]` `[ Create custom ]` |
| Cast Sheet search   | "No matches for `foo`. Try a different name or action kind."                 | `[ Clear search ]`                   |
| Chip-strip          | (hidden when no active spells; the `+ Cast` button replaces it inline)       | `[ + Cast spell ]`                   |
| Spellbook (project) | "No active spells. Cast one to see it here."                                 | `[ + Cast spell ]`                   |
| Ensemble compose    | "No members. Add at least one session."                                      | inline target picker                 |

### 6.3 Error

- Cast fails (network / server): Sheet stays open, footer becomes an error banner: `⚠ Couldn't cast lint-gate (HTTP 503). [Retry]`. Library remains focusable, targets preserved. After 3 successive failures, show `Server unreachable — check console.` (do not autoclose).
- Trigger toggle fails: chip flips back, inline toast `⚠ Couldn't enable trigger on lint-gate. [Retry]`.
- Ensemble create fails: setup panel highlights with red border, error under name field.

### 6.4 No-targets

If Cast Sheet is opened with zero targets (global shortcut, no focused session):

```
Targets:  [ + add session ]   Mode: ⦿ Single

      ── Pick at least one target session above ──
            (search and add list still visible)
```

Cast button is disabled with `aria-disabled="true"` and tooltip "Add a target session first". Pressing `⏎` on a spell row focuses the target chip-bar `+ add session` instead of attempting cast.

### 6.5 Disconnected / WS down

A small persistent banner inside any open spell surface:

```
⚠ Live updates paused — reconnecting…
```

Active-spell state freezes (no optimistic ring changes until reconnect). All write actions disable with tooltip "Waiting for server…". This is wired to the existing WebSocket bridge connection state.

### 6.6 Conflict resolution

If the same session receives two simultaneous casts (user + agent CLI), both create distinct `ActiveSpell` rows (additive); only continue-loop and gate of the same `spellId` collide — server returns `409 already-active`, UI re-renders the existing chip with a brief flash + tooltip "Already active".

---

## 7. Accessibility (WCAG AA — locked contract)

| Dimension              | Rule                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dialog semantics       | Cast Sheet = `role="dialog" aria-modal="true"`, focus trap, Esc closes, return focus.                                                                |
| Live region            | Successful cast announces via `role="status"` `aria-live="polite"` — "Cast plan-execute on foo and 2 others"; errors → `role="alert"`.              |
| Listbox                | Library list `role="listbox"` with `aria-activedescendant`; rows `role="option"` with `aria-selected`.                                              |
| Radios                 | Mode and failMode use `role="radiogroup"`; arrow keys cycle.                                                                                        |
| Color non-reliance     | Every spell ring color is paired with an icon (action-kind glyph) and a text label in tooltip/chip; `aria-label` always describes the spell name.   |
| Contrast               | Chip text, library text, ensemble labels: ≥ 4.5:1 on both themes (verified per palette entry in `01-design-system.md` §1.2 — use the `text` column for body text; never use `primary` as label color on `--pn-surface` because `lapis`/`moss`/`teal` light variants miss 4.5:1 at body sizes). Ring colors only need 3:1 against tile background since they're decorative. |
| Focus visibility       | Standard Atelier `*:focus-visible { outline: 2px solid var(--pn-brand); outline-offset: 2px }` sits outside the inset spell rings — no spell-specific focus token needed. Dark theme inherits the brighter `--pn-brand`. |
| Reduced motion         | `@media (prefers-reduced-motion: reduce)` disables: ring pulse (`.spell-ring--just-cast::before`), iteration tick (JS-gated by `useReducedMotion()` in `SpellRingHost`, not CSS-only), undo-toast slide (`.spell-undo-toast*` → opacity-only, 0ms transition), ensemble fade, Sheet open scale. Selectors are added to the central `01-design-system.md §4` reduced-motion block. |
| Keyboard parity        | Every mouse action (toggle, deactivate, reset, disband, message) has a keyboard equivalent reachable via Tab + visible focus.                       |
| Target sizes           | Touch targets ≥ 24×24 CSS px (Tauri desktop) — chips, ring hover hit areas, drawer rows.                                                            |
| Screen reader labels   | Host tile label (matches `01-design-system.md` §5): `"Session foo — 3 spells: lint-gate, plan-execute, watch"`; when a member of an ensemble, append `" (in ensemble \"refactor-squad\")"`. Active-spell chip label: `"Guardian — active. Press to toggle."` with `aria-describedby` linking to a hidden description span. Cast button: `"Cast plan-execute on foo"`. |
| Skip target            | "Skip to library" link as the first focusable inside the Sheet (visible only on focus).                                                              |
| Type-ahead             | Library list type-ahead is **not** mandatory beyond search input — arrow nav + search input cover all use cases.                                    |

---

## 8. Coordination notes (cross-agent contracts)

For `components` (screens):
- Build a single `SpellLauncher` (a.k.a. Cast Sheet) that owns mode + targets + library; the ensemble setup panel is a child that renders only in coordinate mode.
- The `ActiveSpellChip`, `SpellbookDrawer`, `SpellDetailFlyout`, `EnsembleWrapper`, `UndoToast`, and the `data-spell-rings` attribute on `pn-st` / `pn-srail-s` / `.terminalContainer` are the new surfaces.
- All state reads come from `useSpellStore` (extended) and `useSessionStore.activeSpellsBySession` (new selector); writes go through new store actions: `castSpell`, `toggleActiveSpell`, `deactivateActiveSpell`, `resetLoop`, `createEnsemble`, `messageEnsemble`, `disbandEnsemble`, `openCastSheet`, `openSpellbook`, `openSpellDetail`.

For `ui-systems` (tokens / motion / a11y primitives) — reconciled with `01-design-system.md`:
- Concentric-ring contract is **frozen in `UI_SPEC.md §7`** (canonical, overrides 01/03 if they drift). Hosts receive `spellRingAttrs(activeSpells)` from `maestro-ui/src/utils/spellRings.ts` spread by `SpellRingHost`: CSS vars `--spell-ring-N` / `--spell-ring-N-rgb` / `--spell-ring-N-w` per slot 1..4, plus `data-spell-rings="{count}"`, `data-spell-ring-overflow="{N}"` when >4, and `data-spell-ring-names="csv"` as the canonical tooltip + e2e selector source. Iter-tick paints on `.spell-ring__overflow` / `.spell-ring__tick`, never on ring shadows.
- Tokens that exist: `--spell-ring-w` (1px default, overridden per host in §2.4), `--spell-ring-gap` (2px default; 3px on terminal panel). The 4-ring cap is a JS constant `RING_CAP = 4` from `spellRings.ts` — reference that in copy, not a CSS var.
- Focus: standard Atelier `*:focus-visible { outline: 2px solid var(--pn-brand); outline-offset: 2px }` sits clearly outside the inset spell rings — no spell-specific focus token needed.
- Motion timings (locked in `01-design-system.md`): cast pulse 520ms (`spell-cast-pulse`, peak 35%), ring fade-in 180ms via `transition: box-shadow` on `.spell-ring`, undo-toast slide 150ms (owned by `02-ux-flows.md`). All gated by the central `prefers-reduced-motion: reduce` block.
- Z-stack (matches existing `.spellPicker__backdrop`=1000 / `.spellPicker`=1001); exposed as CSS vars in `01-design-system.md` §1.4 — portal at the var, never the raw number:
  - `--spell-tooltip-z: 1100`
  - `--spell-toast-z: 1090`
  - `--spell-flyout-z: 1050`
  - `--spell-drawer-z: 1010`
  - Cast Sheet backdrop: 1000, content: 1001 (reuses existing `.spellPicker` slots)
- Preview-ring during Cast Sheet hover/highlight uses `var(--spell-<id>-border)` (42% alpha) — *never* `primary` (which would read as an ensemble ring). The `--just-cast` pulse takes over on commit.

For `team-lead`:
- The CLI `Cmd/Ctrl+Shift+S` global shortcut must not collide with existing bindings in `useKeyboardShortcuts.ts`; if it does, fall back to `Cmd/Ctrl+Alt+S` and this doc updates.
- `castMode` enum locked: `single | broadcast | coordinate`.
- This doc presumes the M1 frozen contract: `invoke()` uses the single `session:prompt_send` path and `spell:invoked` is UI-feedback only.

---

## 9. Out of scope for this doc

- Visual design (typography, exact palette mappings) → `ui-systems` `04-design-system.md`.
- Component prop shapes and DOM anatomy → `components` `03-components.md`.
- Server contract / WS event payloads → backend specs already in `DESIGN_BRIEF.md`.
- Skill creation flow — covered by P6, separate spec.

---

## 10. Open questions (flagged, not blocking)

1. Should the global `Cmd/Ctrl+Shift+S` open the Cast Sheet *or* focus an existing inline composer? (Current spec: Sheet. Revisit if user testing shows Sheet feels heavy.)
2. Does Coordinate mode require at least 2 targets (current spec: yes; mode auto-reverts to Single on removing 2nd chip)?
3. When a user casts the same continue-loop spell that's already active (re-cast), does iteration reset to 0 or continue from current? (Current spec: reset; reasoning: predictable user intent.)
