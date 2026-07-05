# 03 — Component Inventory (Spell System Redesign)

> Canonical component spec for the new spells UI. Source of truth lives in
> `docs/spell-system-design/DESIGN_BRIEF.md` + the 6 `*.excalidraw` diagrams.
> This document defines what gets built in `maestro-ui/src/`, the props each
> component exposes, the store selectors each one reads, and the shared
> contracts with `01-tokens.md` (ui-systems) and `02-flows.md` (ux-flows).

---

## 0 · Conventions

### Naming

- New components live under `maestro-ui/src/components/spells/`.
- The current `components/maestro/SpellPicker.tsx` is **deleted** and replaced by
  `components/spells/SpellLauncher.tsx`. Keep the old file path resolvable from
  `AppModals.tsx` import for one commit, then remove.
- CSS lives in `maestro-ui/src/styles-spells.css`; classes use the `sp-*`
  prefix (e.g. `sp-launcher`, `sp-card`, `sp-ring`). The old `spellPicker__*`
  classes are removed.

### Token contract (frozen with `ui-systems` — see `01-design-system.md`)

All visual values come from `01-design-system.md` (§1.2, §1.4, §2.2–2.5,
§3.5); this doc consumes them by name and never invents new ones. **Frozen
palette IDs (10):**
`brass · vermilion · moss · lapis · amber · aubergine · teal · clay · slate · plum`.
Each color exposes 5 properties:

| Token | Purpose |
| --- | --- |
| `--spell-<id>-primary` | Full-saturation ring color (used for ensemble members). |
| `--spell-<id>-primary-rgb` | Same as above expressed as `R, G, B` for `rgb()/rgba()`. |
| `--spell-<id>-dim` | Subdued surface tint for cards / chip backgrounds. |
| `--spell-<id>-border` | Default ring color (~42 % alpha, used for non-ensemble active spells). |
| `--spell-<id>-text` | Legible foreground for text/glyphs on the color tile. |

**Library spell → color mapping (locked):** Guardian → `lapis`,
Test Sentinel → `moss`, Self-Critic → `plum`, Plan-First → `lapis`,
Progress Pulse → `moss`, Context Primer → `amber`, Lint-on-Edit → `vermilion`,
Notify-on-Done → `teal`, Scope Keeper → `aubergine`. `brass`, `clay`, `slate`
are reserved for user custom spells (round-robin assignment).

**Removed from earlier drafts** (do not reintroduce):
`--spell-color-<name>`, `--spell-on-color-<name>`, `--spell-ring-width`
(replaced by per-slot `--spell-ring-K-w`), `--spell-ensemble-ring`,
`--spell-active-glow`, `--spell-surface*`, `--spell-border*`, `--spell-text*`,
bare `--ring-K` shorthand.

Ring slots use the `--spell-ring-K / -K-rgb / -K-w` naming defined in the
next section. Per `UI_SPEC.md §7`, the host also receives three data
attributes from `spellRingAttrs()` — `data-spell-rings`,
`data-spell-ring-names` (CSV, canonical tooltip + e2e source), and
`data-spell-ring-overflow` — written by the helper and never by components.

Panel surface / border / text use the existing `--pn-*` tokens; ensemble
visual is derived from the spell color via `spellEnsembleStyle()`, not its
own token.

Other shared tokens that components in this doc read directly:

| Token | Purpose |
| --- | --- |
| `--pn-ink`, `--pn-paper` | Existing panel ink/paper, used by the `+N` overflow badge (paper text on ink ground per §2.5). |
| `--spell-ring-gap` | Pixel gap between concentric rings (host-specific overrides set in `spell-ring.css`: 2 px on `pn-st`/`pn-srail-s`, 3 px on `.terminalContainer`). |

### Ring host contract

**Canonical contract: `UI_SPEC.md §7` (overrides 01/03 if they disagree).**
This section restates the contract as it applies to components.

A single utility, owned by `ui-systems`, is applied to the three ring hosts.
Components **never** write ring CSS vars or data-attrs directly — they call
the `spellRingAttrs(activeSpells)` helper from
`maestro-ui/src/utils/spellRings.ts` and **spread the whole object** onto the
host element. `.spell-ring` is added additively (`pn-st`, `pn-srail-s`,
`.terminalContainer` keep their existing classes).

```tsx
import { spellRingAttrs } from '../../utils/spellRings';

<li
  className="pn-st spell-ring"
  {...spellRingAttrs(activeSpells)}
  aria-label="3 active spells: Critic refine, Test failure gate, Lint-fix"
>
  …
  {overflowCount > 0 && (
    <span className="spell-ring__overflow">+{overflowCount}</span>
  )}
</li>
```

- `spellRingAttrs(activeSpells)` returns:
  ```ts
  {
    style: { '--spell-ring-1': ..., '--spell-ring-1-rgb': ..., '--spell-ring-1-w': ..., ... },
    'data-spell-rings': string,           // e.g. "3"
    'data-spell-ring-names': string,      // CSV, e.g. "Guardian,Test Sentinel,Self-Critic" or "...,+2"
    'data-spell-ring-overflow': string,   // "0" | "2" (extra count past 4)
  }
  ```
  `data-spell-ring-names` (CSV) is **the canonical source** for the ring
  tooltip + e2e selectors. `ux-flows` depends on it. `data-spell-rings` is
  the count attribute for CSS state hooks.
- A separate `spellRingStyle(activeSpells)` returns **only** the style object,
  for non-host callers that want a ring preview (e.g. `SpellCard` swatch).
  Host components always use `spellRingAttrs()`.
- Ring property names per slot:
  `--spell-ring-K`, `--spell-ring-K-rgb`, `--spell-ring-K-w` for K ∈ 1..4
  (color, RGB triple, ring width).
- **Stroke / contrast:** solo ring (count = 1) and ring 1 always use
  `var(--spell-<id>-primary)` (full saturation, AA-verified ≥3:1 on both
  surfaces). Rings 2–4 use the 42 % `var(--spell-<id>-border)`. Ensemble
  outermost ring also always `primary` (full saturation).
- Cap is **4 visible** rings. Stacking order is **oldest-outer,
  newest-inner** (governed by `ActiveSpell.castAt asc`). When
  `activeSpells.length > 4`, ring 4 **keeps the 4th spell's color** — it is
  NOT replaced by an overflow color — and `.spell-ring__overflow` ("+N") is
  rendered inside the host. Pill placement (set by `spell-ring.css`):
  top-right on `pn-st` and `.terminalContainer`, bottom-right on
  `pn-srail-s`. No rail "dot" variant, no neutral ring-4, no negative
  offsets.
- **Iter-tick** motion paints on `.spell-ring__overflow` / `.spell-ring__tick`,
  **never** on the ring box-shadows themselves (perf). The JS-driven path is
  gated by `useReducedMotion()` from `ui-systems`.
- Inset-shadow strategy generalizes the existing `coordinator-glow`; geometry
  is host-specific via `--spell-ring-gap` overrides in `spell-ring.css`.
- The three hosts that consume the utility:
  - `pn-st` — session list tile (`SessionListItem` root).
  - `pn-srail-s` — Spaces rail icon (`SpacesRail` per-session pill).
  - `.terminalContainer` — terminal panel frame (`AppWorkspace`).

### Selected / needs-input / coordinator-glow compatibility

Existing `pn-st--selected`, `pn-st--needsInput`, and `coordinator-glow` styles
remain. Rings are an **additive** outer layer composed by `spell-ring.css`:

- **`.coordinator-glow.spell-ring`** (terminal): the merged rule in
  `spell-ring.css §2.4-C` keeps the orange halo and lets spell rings draw on
  top — the crisp coordinator stroke is suppressed so it doesn't fight ring 1.
- A spell being "active" is just **the presence of a ring** — there is no
  separate "active glow" token.
- `pn-st--selected` renders **above** all rings via `outline` (not box-shadow)
  so it never visually competes.
- `pn-st--needsInput` blink is preserved; when rings are present, its color
  is multiplied with `--spell-ring-1` per the rule in `spell-ring.css §2.4`.

### Accessibility baseline (applies to every component below)

- All interactive surfaces are real `<button>` / `<a>` / form elements; never
  click handlers on a `<div>`.
- Keyboard: `Tab` reaches every action; `Esc` closes overlays; the
  command-palette pattern (`↑/↓/Enter`) drives every searchable list.
- Color is never the **only** signal — every ring is paired with an icon, label,
  or text. Rings carry `aria-label="3 active spells"` on the host.
- Live regions: cast/iteration toasts announce via `role="status"`.
- Min hit target 32×32 in dense rails, 40×40 elsewhere.

### State naming

Every component documents the same canonical states:
**default · hover · focus-visible · active · disabled · loading · empty · error**.
When a state is not applicable, it is listed as "n/a" with a one-line reason.

---

## 1 · `SpellLauncher` (a.k.a. "Cast Sheet")

The redesigned picker. Replaces `SpellPicker.tsx`. `ux-flows` refers to this
surface as the **Cast Sheet** in `02-ux-flows.md`; both names refer to the same
component.

Entry points (locked with `ux-flows`):

| Entry point | `source` value | Notes |
| --- | --- | --- |
| Command-bar `✦` icon | `'command-palette'` | Global. |
| Terminal-strip `✦` button | `'workspace'` | Pre-fills focused session as target. |
| Session tile right-click → "Cast spell…" | `'session-tile'` | Tile session pre-selected. |
| Spaces rail per-session menu | `'spaces-rail'` | Same as tile. |
| Task tile "Add spell" | `'task-tile'` | Opens in attach mode (§7). |
| Ensemble dock "Cast another" | `'ensemble'` | Pre-selects all members. |
| Global shortcut `Cmd/Ctrl + Shift + S` | `'command-palette'` | Equivalent to command-bar. |

### 1.1 Purpose

A single, focused surface for **discovering** and **casting** a spell on one or
many sessions. Library browse + search + categories + recents + multi-target
selector + cast-mode toggle. Opens fast (< 80 ms perceived), feels like the
command palette but visually richer.

### 1.2 Wireframe

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ✦  Cast a spell           [⌘K  search spells, skills, tasks…]      ✕    │
│  ─────────────────────────────────────────────────────────────────────── │
│  ┌──────────────────┐  ┌────────────────────────────────────────────┐   │
│  │ Recent           │  │  PLAN  EXECUTE                              │   │
│  │  ◐ Critic refine │  │  ╭──────────────────────────────────────╮  │   │
│  │  ◑ Plan-execute  │  │  │ ◐  CRITIC REFINE              [loop] │  │   │
│  │  ⬢ Test failure  │  │  │    Refines work in <=N rounds        │  │   │
│  │ ─                │  │  │    trigger: Stop  ·  fail-mode: open │  │   │
│  │ Library          │  │  ╰──────────────────────────────────────╯  │   │
│  │  ☆ Featured      │  │  ╭──────────────────────────────────────╮  │   │
│  │  ⚙ Execute       │  │  │ ⬢  TEST FAILURE GATE          [gate] │  │   │
│  │  🧭 Plan         │  │  │    Blocks commits while tests red    │  │   │
│  │  🛡 Gate         │  │  ╰──────────────────────────────────────╯  │   │
│  │  📡 Notify       │  │  ╭──────────────────────────────────────╮  │   │
│  │  🪄 Custom       │  │  │ +  CREATE CUSTOM SPELL               │  │   │
│  │  🧪 Skills       │  │  ╰──────────────────────────────────────╯  │   │
│  │ ─                │  └────────────────────────────────────────────┘   │
│  │ My spells (4)    │                                                    │
│  │  ⬡ Lint-fix loop │  ─── Cast on ──────────────────────────────────   │
│  │  ⬡ PR ready      │  ◉ Frontend-A   ◉ Frontend-B   ◯ Server-1         │
│  │                  │  ◯ Coordinator-α                                   │
│  │                  │                                                    │
│  │                  │  Mode:  ( • Single )( Broadcast )( Coordinate )    │
│  │                  │                                                    │
│  │                  │  [Cancel]                       [ ✦  Cast  ⌘↩ ]   │
│  └──────────────────┘                                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Interface

```ts
// File: components/spells/SpellLauncher.tsx
// Mounted from AppModals.tsx, controlled by useSpellLauncherStore.
// No props — fully store-driven so any caller can `openLauncher({...})`.
export const SpellLauncher: React.FC;

// Open API (called by SessionListItem ✦ button, command palette, task tile, ensemble dock)
type OpenLauncherInput = {
  /** Pre-selected targets. If empty, defaults to the focused session. */
  targetSessionIds: string[];
  /** Optional spell to preselect (deep-link / "cast again" from recent). */
  preselectSpellId?: string;
  /** When set, the launcher opens already filtered to this category. */
  initialCategory?: SpellCategory;
  /** Where the open was initiated from (telemetry + back-button affordances). */
  source: 'session-tile' | 'spaces-rail' | 'command-palette' | 'task-tile' | 'ensemble' | 'workspace';
};
```

### 1.4 Internal state

```ts
type LauncherLocalState = {
  query: string;                          // search input
  category: SpellCategory | 'all' | 'recent' | 'mine';
  cursorIndex: number;                    // keyboard nav
  hoveredSpellId: string | null;          // for hover-preview into details drawer
  castMode: 'single' | 'broadcast' | 'coordinate';
  selectedTargetIds: Set<string>;         // mutable target set
  ensembleName?: string;                  // only when castMode === 'coordinate'
  inlineError: string | null;             // last cast error (e.g. failed target)
};
```

### 1.5 Store selectors (consumed)

```ts
// useSpellLauncherStore (new) — owns the modal-side state
isOpen, source, openLauncher, closeLauncher

// useSpellLibraryStore (new — replaces useSpellStore for browse)
spells: Spell[]                       // curated + custom, merged
spellsByCategory: Record<SpellCategory, Spell[]>
customSpells: Spell[]
recentSpellIds: string[]              // persisted localStorage
fetchLibrary(projectId)
upsertSpell(spell) / deleteSpell(id)

// useSpellActivationStore (new)
castSpell(input: CastSpellInput): Promise<CastResult>
casting: boolean
lastCastAt: number | null

// useSessionStore (existing)
sessions, activeSessionId, sortedSessionsForProject(projectId)

// useProjectStore (existing)
activeProjectId
```

### 1.6 Anatomy & layout

| Region | Element | Notes |
| --- | --- | --- |
| Header | `<header class="sp-launcher__header">` | Title, search field (autofocus), close. |
| Sidebar | `<nav class="sp-launcher__nav">` | Recents, library categories, "My spells", Skills tab. |
| Body | `<section class="sp-launcher__body">` | Grid of `SpellCard`s, virtualized over 50. |
| Targets | `<footer class="sp-launcher__targets">` | `SessionTargetChips` + mode toggle. |
| CTA | `<div class="sp-launcher__cta">` | Cancel + Cast. Sticky to footer. |

### 1.7 SpellCard sub-component

```ts
type SpellCardProps = {
  spell: Spell;
  isFocused: boolean;       // keyboard cursor lands here
  isSelected: boolean;      // primary target of the upcoming cast
  onFocus(): void;          // moves details drawer to this spell
  onActivate(): void;       // ⏎ or click → cast (or expand if multi-action)
  density: 'comfortable' | 'compact';
};
```

Card visual is dominated by the spell's **color tile** (left rail filled with
`var(--spell-color-<name>)`) + icon glyph + name + a single-line description.
Trailing chips: action-type (`gate` / `loop` / `inject` / `notify` / `cmd` /
`context`), `loopType` if any, and a small ring preview that matches what will
appear on the session tile.

### 1.8 Multi-target selector (`SessionTargetChips`)

- Renders one chip per session in the active project, grouped by team color.
- Selected chips show a filled background + check; unselected are outlined.
- Holding `Shift` while clicking ranges over the visible list.
- "Select all in team" appears as a small action when a team is detected.
- `castMode: 'single'` collapses selection to one chip and disables multi.

### 1.9 Cast-mode toggle

Three-way segmented control:

- **Single** — one target, normal invoke.
- **Broadcast** — same prompt fired in parallel to N targets. No ensemble.
- **Coordinate** — creates an `Ensemble`. Leader picker appears (defaults to the
  first selected coordinator-mode session, else the first target). A name
  field is pre-filled with `"<spell.name> on <date>"` and is editable.

Auto-flip behavior (locked with `ux-flows`):

- Targets = 1 → mode pinned to **Single**, Broadcast/Coordinate disabled with
  inline helper text "Add a second target to broadcast or coordinate."
- Targets ≥ 2 → mode auto-flips from Single to **Broadcast** the first time
  the second target is added (only if user hadn't manually picked Coordinate).
- The user can manually toggle to Coordinate at any time once targets ≥ 2; an
  **ensemble setup panel** then reveals (leader picker + ensemble name).
- Opening the Cast Sheet via "shift-select 2+ sessions in SpacesRail →
  `Cmd/Ctrl+Shift+S`" pre-sets mode to **Coordinate** before any spell pick.
- Selecting a coordinate-mode spell in the library pre-selects **Coordinate**
  even with 1 target; the Cast button stays disabled with inline helper
  "Add a second target — this spell coordinates two or more agents."

**Ensemble creation is reachable only via this toggle.** There is no
"+ New Ensemble" affordance anywhere — ensembles are a consequence of casting,
never a primary noun the user creates abstractly.

### 1.10 States

| State | Behavior |
| --- | --- |
| default | Library visible, recents on top, no spell focused, "Cast" disabled. |
| hover | Card highlights with `--spell-card-hover`; details drawer (§2) syncs to that spell on a 120 ms hover delay. |
| focus-visible | Keyboard cursor draws a 2 px outline in `--accent`; details drawer syncs immediately. |
| active (post-cast) | Header swaps to a transient confirmation strip "Cast on N sessions ✓" for 1.5 s before close. |
| disabled (Cast) | When no spell focused **or** no targets selected **or** `casting === true`. |
| loading | `casting === true` → CTA shows spinner + "Casting…"; rest of UI is non-interactive but visible (no dim). |
| empty | Library empty (first-run, no project) → centered illustration + "Create your first spell" → opens `CustomSpellEditor`. |
| error | `inlineError` set → red text inside the CTA strip, retains form state, focus moves to Cast button. |
| confirm-risky | When the focused spell is `gate` or `loop` (or otherwise flagged risky), Cast click first inflates an **inline confirmation banner** above the CTA ("This will gate PreToolUse until disabled — proceed?"); a second confirmation dispatches. No extra modal. After dispatch, the launcher writes a `CastReceipt` (shape below) to `useSpellActivationStore.lastCastReceipt`; the global `UndoToast` (§9) consumes the receipt. |

#### 1.10.1 Cast receipt contract (consumed by `UndoToast`)

Locked with `ux-flows` §2.7 + §5.3. `SpellLauncher` emits one `CastReceipt`
per cast click; it never renders the toast itself.

```ts
type CastReceipt = {
  castId: string;
  summary: string;                          // "Cast Critic refine on 3 sessions"
  undoAction: () => Promise<void>;          // reverses the cast (removes ActiveSpells)
  /** Set when undo is unavailable post-dispatch (e.g. a loop already produced
   *  irreversible output). The toast then renders the reason instead of an undo button. */
  undoDisabled?: { reason: string };
  /** Optional second action — for cast receipts where the spell defines a
   *  trigger, the toast offers a one-click "Enable trigger" shortcut. This is
   *  the ONLY place outside SpellDetailFlyout where the trigger toggle is one
   *  click away, by deliberate just-cast convenience (per ux-flows §5.3). */
  secondaryAction?: { label: string; action: () => Promise<void> };
};
```

`UndoToast` auto-dismisses at 5 s, is dismissible earlier, and uses
`role="status"` for the live region.

### 1.11 Keyboard map

| Key | Action |
| --- | --- |
| `↑ / ↓` | Move card cursor (wrap inside category). |
| `← / →` | Switch category in nav. |
| `Enter` | Cast with current selection. |
| `Cmd/Ctrl + Enter` | Cast even if hovered card differs from selected (uses focused). |
| `Tab` | Move into the targets footer; `Shift+Tab` back. |
| `Esc` | Close. |
| `1..9` | Quick-select target by index. |
| `B / C / S` | Switch cast mode. |
| `/` | Focus search. |

---

## 2 · `SpellDetailsView`

### 2.1 Purpose

Deep view of a single spell — description, action type, trigger config, loop
type, fail mode, color, optional skill reference, and the only entry point to
edit a custom spell. Per `02-ux-flows.md` decision #5, the **trigger toggle**
lives exclusively in this view (and in the matching `ActiveSpellRow` switch);
the `SpellLauncher` grid never renders it.

### 2.2 Form factor — **non-modal side flyout** (with full-modal editor)

**Decision: non-modal side flyout, anchored right, 360 px wide.**
(Locked with `ux-flows` §5.2 — component is named `SpellDetailFlyout`;
`SpellDetailsView` is the shared body that renders inside either form factor.)

Reasoning:

- The flyout slides over the launcher's body (not the targets footer), so the
  user can still see and tweak the selection while inspecting a candidate.
- It also opens **standalone** from outside the launcher (e.g. clicking a ring,
  opening "Active spells > details"). It does **not** dim the workspace —
  terminal output keeps streaming behind it.
- For long-form editing (`CustomSpellEditor`, §6) we **promote** the flyout
  into a full modal — different intent, longer-form, commit/cancel as a unit.

A11y contract:

- `role="dialog"`, **`aria-modal="false"`** — no focus trap.
- Click-outside dismisses.
- On open, focus moves to the first interactive control inside (typically the
  Cast button, or the Edit button when read-only).
- `Esc` closes the flyout without disturbing the Cast Sheet (when stacked).

Anchoring rules (z-stack: toasts > flyout > Cast Sheet > Spellbook > workspace):

| Context | Anchor |
| --- | --- |
| Opened from a library row "i" inside the Cast Sheet | Anchored to the **right edge of the Cast Sheet** (parent/child read). |
| Opened from a terminal-strip `ActiveSpellChip` | Right edge of the workspace. |
| Opened from a `SpellbookDrawer` row | Right edge of the Spellbook drawer (slides further out). |
| Opened from session tile ring | Right edge of the workspace. |

A flag in props chooses the form factor:

```ts
type SpellDetailsViewProps = {
  spellId: string;
  mode: 'flyout' | 'modal';                 // flyout = inspect; modal = edit
  editable: boolean;                        // false for curated DEFAULTS
  /** Element to anchor the flyout's right edge against. Defaults to workspace. */
  anchorTo?: 'workspace' | 'cast-sheet' | 'spellbook';
  onClose(): void;
  onEdit?(): void;                          // promotes flyout to modal+editor
  onCast?(target?: string[]): void;         // CTA in standalone (non-launcher) mode
  onDelete?(): void;                        // custom-only
};
```

### 2.3 Wireframe (drawer)

```
                                ┌──────────────────────────────────────┐
                                │  ◐  CRITIC REFINE          [⋮]  ✕   │
                                │  ──────────────────────────────────  │
                                │  Refines worker output in ≤N rounds  │
                                │  by spawning a critic that scores    │
                                │  and returns suggestions.            │
                                │                                      │
                                │  ▸ Action            inject-prompt   │
                                │  ▸ Trigger           Stop hook       │
                                │  ▸ Loop              critic-refine   │
                                │    max iterations    3               │
                                │  ▸ Fail mode         open            │
                                │  ▸ Color             ▮ Violet        │
                                │  ▸ Skill ref         /code-review    │
                                │  ▸ Created           default · seed  │
                                │                                      │
                                │  ──────────────────────────────────  │
                                │  Prompt preview                      │
                                │  ┌──────────────────────────────┐    │
                                │  │ You are a critic. The worker│    │
                                │  │ just produced:              │    │
                                │  │ {{lastOutput}}              │    │
                                │  │ Return STRENGTHS / GAPS …   │    │
                                │  └──────────────────────────────┘    │
                                │                                      │
                                │  [ Cast on session ]   [ Edit ]      │
                                └──────────────────────────────────────┘
```

### 2.4 Internal state

```ts
type DetailsLocalState = {
  promptExpanded: boolean;       // collapses preview at > 4 visible lines
  showMenu: boolean;             // ⋮ menu: Duplicate, Export JSON, Delete
};
```

### 2.5 Store selectors

```ts
useSpellLibraryStore: spellById(id), upsertSpell, deleteSpell
useSpellActivationStore: castSpell, casting
useSkillStore (existing/new): skillByRef(skillRef)
```

### 2.6 States

| State | Behavior |
| --- | --- |
| default | Flyout slides in 180 ms ease-out; first interactive control focused (Cast when castable, else Edit). |
| hover (action chips) | Tooltip explains the action taxonomy term. |
| focus-visible | 2 px accent ring around any focusable row. |
| active | Cast button → routes through `useSpellActivationStore.castSpell`. |
| disabled | Edit/Delete hidden when `editable === false` (curated). Cast hidden when opened with no target context (e.g. from a library link). |
| loading | Skeleton lines while `spellById` resolves (rare; only on direct deep-link). |
| empty | Spell not found → 404 panel with "Back to library". |
| error | Cast failed → inline strip below the CTA, retains flyout. |

---

## 3 · `ActiveSpellsPanel`

### 3.1 Purpose

Per-session view of currently active spells with on/off toggles + remove. This
is what the user reaches by clicking a ring badge, opening the session detail
overlay, or hovering the session tile's "+N" overflow chip.

### 3.2 Surfaces (aligned with `ux-flows` §3.2)

Active spells appear in **four** surfaces, all rendered from the same
`ActiveSpellChip` row component so behavior is identical everywhere:

1. **TerminalStrip header chip-strip** (`anchor: 'header-strip'`) — one chip
   per `ActiveSpell` on the focused session, in the terminal panel header
   above `.terminalContainer`. Chip color = ring color. Click opens the chip
   quick-menu (§3.4.1). This is the primary in-context surface.
2. **`SessionDetailOverlay` strip** (`anchor: 'session-detail'`) — same chip
   strip, full-width, in the per-session detail overlay. Persistent (not
   tooltip-style).
3. **Hover popover on the ring host `+N` badge** (`anchor: 'ring-popover'`) —
   **tooltip-only**, 400 ms hover delay, listing ALL active spells on that
   session (not just the overflowed N) with state glyphs. **No interactions**;
   clicking the badge opens the `SpellbookDrawer` scoped to that session.
4. **`SpellbookDrawer`** (`anchor: 'spellbook'`, `Cmd/Ctrl+Shift+B`) — the
   canonical project-wide management surface. Lists every active spell across
   every session, grouped by session and ensemble, with bulk actions,
   filtering, and the same chip quick-menu. Opened from the ring `+N` click,
   the command bar, or the global shortcut. See §3.5.

Single source of truth: every chip in surfaces 1/2/3/4 is an `ActiveSpellChip`
with identical visuals and identical quick-menu — so muscle memory transfers
across surfaces.

### 3.3 Wireframe (header-strip + spellbook)

**Header-strip** (above terminal):

```
┌─ Frontend-A ─────────────────────────────────────────────────── ⚙ ─┐
│  ◐ Critic refine  iter 2/3   ⬢ Test failure gate   ⬡ Lint-fix     │
│  ────────────────────────  terminal below  ──────────────────────  │
```

**Spellbook drawer** (right overlay, project-wide):

```
┌──────────────────────────────────────────────────┐
│  Spellbook · Project: agent-maestro       ✕     │
│  ──────────────────────────────────────────────  │
│  ▼ Frontend-A             3 active               │
│     ◐  Critic refine            ●●○   [×]        │
│         iter 2 / 3 · loop                        │
│     ⬢  Test failure gate        ●      [×]       │
│     ⬡  Lint-fix loop            ●●●○  [×]        │
│  ▼ Frontend-B             1 active               │
│     ⬢  Test failure gate        ●      [×]       │
│  ▶ Server-1               0 active               │
│  ──────────────────────────────────────────────  │
│  ✦ Cast another                                  │
└──────────────────────────────────────────────────┘
```

`●●○` is the iteration-progress beadbar; it animates a pulse on the leading
empty bead while iterating.

### 3.4 Interface

```ts
type ActiveSpellsPanelProps = {
  /** Picks which surface this instance is rendering in. */
  anchor: 'header-strip' | 'session-detail' | 'ring-popover' | 'spellbook';
  /** Required for header-strip, session-detail, ring-popover. Ignored for
   *  spellbook (project-scope). */
  sessionId?: string;
  /** spellbook only — scroll to and expand this session on open. */
  scrollToSessionId?: string;
  /** Closes the surface when the user clicks "Cast another" so SpellLauncher
   *  can take over the same context. */
  onCastAnother?(): void;
};

// Spellbook drawer is a thin wrapper around <ActiveSpellsPanel anchor="spellbook"/>:
type SpellbookDrawerProps = {
  isOpen: boolean;
  scrollToSessionId?: string;
  onClose(): void;
};
```

#### 3.4.1 Chip quick-menu (canonical)

Right-click / long-press / kebab on any `ActiveSpellChip` opens the same menu
in every surface:

| Action | Behavior |
| --- | --- |
| Toggle | Calls `setSpellEnabled(sessionId, spellId, !enabled)`. |
| Reset loop | `useSpellActivationStore.resetIteration(sessionId, spellId)`. Hidden for non-loop spells. |
| Deactivate | `removeActiveSpell(sessionId, spellId)`; confirms for `loop`/`gate`. |
| View in Spellbook | Opens `SpellbookDrawer` scrolled to this session. |
| Edit trigger | Opens `SpellDetailFlyout` (§2) anchored to the originating surface, focused on the trigger row. |

The menu component is `ActiveSpellChipMenu`; it lives next to `ActiveSpellChip`
in the file map (§9).

### 3.5 Internal state

```ts
type ActiveSpellsLocalState = {
  confirmRemoveId: string | null;   // 2-step remove for loop/gate spells
};
```

### 3.6 Store selectors

```ts
useSpellActivationStore:
  activeSpellsBySession(sessionId): ActiveSpell[]
  setSpellEnabled(sessionId, spellId, enabled)
  removeActiveSpell(sessionId, spellId)
  iterationStateFor(sessionId, spellId): { current; max }

useSpellLibraryStore: spellById
useSessionStore: sessionById(sessionId)
useSpellLauncherStore: openLauncher
```

### 3.5 `SpellbookDrawer` specifics

Project-wide canonical surface — bulk actions, filtering, ensemble grouping.

- Width 480 px, right-anchored, slides in 180 ms ease-out.
- `aria-modal="false"` — workspace remains observable; click-outside dismisses.
- Sections, top to bottom:
  1. **Filters** — by session, by spell name, by action type (`gate` / `loop`
     / `inject` / `notify` / `cmd` / `context`), by status (iterating / paused
     / errored).
  2. **Ensembles** — collapsible per-ensemble groups (header = ensemble name +
     shared color), members nested inside.
  3. **Sessions** — every other session with at least one active spell.
- **Bulk action bar** appears when the user multi-selects chips via Shift-click
  or "select all in group": `Pause all`, `Resume all`, `Deactivate all`,
  `Reset loops`. Bulk actions confirm once for the whole batch.
- Shortcut: `Cmd/Ctrl+Shift+B` from anywhere toggles open/close.
- Empty state: "No active spells in this project. ✦ Cast one" → opens
  `SpellLauncher`.

### 3.6 Per-row sub-component (`ActiveSpellChip` / `ActiveSpellRow`)

`ActiveSpellChip` is the compact form used in surfaces 1/2/3; `ActiveSpellRow`
is the expanded form used in the Spellbook drawer. They share state, glyphs,
and quick-menu — the row is just the chip plus a description line and beadbar.

- Color rail uses `--spell-color-<name>` (same as card).
- `Switch` is the enable/disable; reads `enabled` from `ActiveSpell`.
- `×` is destructive (cancels loop, releases gate); confirms when `loop`/`gate`.
- Bead bar shows `iteration / maxIterations`; hidden for single-shot spells.
- Click row → opens `SpellDetailsView` in drawer mode anchored to the popover.

### 3.8 States

| State | Behavior |
| --- | --- |
| default | List of rows. |
| hover (row) | Slight surface lift, ✕ becomes visible. |
| focus-visible | Outline on the switch / remove. |
| active (toggling) | Switch animates; row becomes optimistic immediately. |
| disabled (row) | Spell paused server-side → switch off, row dimmed, tooltip "Paused". |
| loading | First open while `activeSpellsBySession` resolves → 2-row skeleton. |
| empty | No active spells → "No spells active. ✦ Cast one" (button). |
| error | Toggle/remove rejected → row shakes once + inline error chip; previous value restored. |

---

## 4 · Concentric ring integration on the three hosts

### 4.1 Hosts

| Host class | File | Mounted by |
| --- | --- | --- |
| `pn-st` | `components/maestro/SessionListItem.tsx` | `SessionsSection` |
| `pn-srail-s` | `components/SpacesRail.tsx` | `AppLeftPanel` |
| `.terminalContainer` | `components/app/AppWorkspace.tsx` (terminal frame) | `AppWorkspace` |

### 4.2 `SpellRingHost` helper

To keep host components clean, ring application lives in a tiny presentational
helper shared with `ui-systems`. The styling primitive — `.spell-ring` class +
`spellRingAttrs()` helper — is owned by `ui-systems` (`01-design-system.md
§2.2–2.4`, canonicalized by `UI_SPEC.md §7`); `SpellRingHost` is the React
wrapper that subscribes and feeds that primitive.

```ts
// components/spells/SpellRingHost.tsx
type SpellRingHostProps = {
  sessionId: string;
  /** Extra classes on the host (e.g. 'pn-st'); the helper appends 'spell-ring'
   *  itself, additively. */
  className: string;
  /** Inline style merge for the host (composed with the style returned by
   *  spellRingAttrs()). */
  style?: React.CSSProperties;
  /** Existing tile content. */
  children: React.ReactNode;
  /** Host element (default 'div'); SessionListItem uses 'li'. */
  as?: keyof JSX.IntrinsicElements;
  /** When false, rings still render but interactions are gated (e.g. dragging). */
  interactive?: boolean;
};
```

Behavior:

1. Subscribes to `useSpellActivationStore.activeSpellsBySession(sessionId)`.
2. Filters to **enabled** spells only.
3. Sorts by `castAt asc` — **oldest-outer, newest-inner**.
4. Takes the first 4 → builds `RingDescriptor[]` with `{ colorId, ensemble }`
   (resolved via `spellById(id).colorId`; `ensemble = activeSpell.ensembleId != null`).
5. Calls `spellRingAttrs(activeSpells)` from
   `maestro-ui/src/utils/spellRings.ts` per `UI_SPEC.md §7` and **spreads the
   whole returned object** onto the host:
   `{ style, 'data-spell-rings', 'data-spell-ring-names',
   'data-spell-ring-overflow' }`. The helper picks
   `var(--spell-<id>-primary)` for the solo ring, ring 1, and the ensemble
   outermost ring (all full-saturation, AA-verified ≥3:1); rings 2–4
   non-ensemble use `var(--spell-<id>-border)` (~42 % alpha).
6. Adds `'spell-ring'` to the host's `className`.
7. Renders `.spell-ring__overflow` ("+N") inside the host whenever
   `activeSpells.length > 4`. Ring 4 itself keeps its color — it is NOT
   replaced by an overflow color. Click on the overflow badge opens the
   `SpellbookDrawer` (§3) scrolled to this session. Placement is set by
   `spell-ring.css`: top-right on `pn-st` / `.terminalContainer`,
   bottom-right on `pn-srail-s`.
8. Ensemble grouping (the dashed group frame, not the per-tile rings) is
   handled separately by the `EnsembleGroup` container (§5), which calls
   `spellEnsembleStyle(colorId)` to set `--ensemble-dim`, `--ensemble-border`,
   `--ensemble-text` on the `.pn-ensemble` wrapper. `SpellRingHost` does NOT
   write ensemble vars on the tile.
9. **Tooltip (hover-list of spell names + glyphs)** — owned by
   `SpellRingHost`, rendered with a 400 ms hover delay per `02-ux-flows.md`
   §3.1. Source of truth for the list is the resolved `ActiveSpell[]` from
   the activation store; the matching `data-spell-ring-names` CSV attribute
   exists for e2e selectors and analytics.
10. **Iter-tick motion** paints on `.spell-ring__overflow` /
    `.spell-ring__tick`, never on the ring box-shadows themselves. The JS
    path is gated by `useReducedMotion()` from `ui-systems`.

### 4.3 Wireframe — three hosts side by side

```
   Session tile (pn-st)          Spaces rail (pn-srail-s)     Terminal panel
 ┌──────────────────────────┐       ╔═══╗                  ┌────────────────────┐
 │ ╔══════════════════════╗ │       ║ ▣ ║   ← s rail       │╔══════════════════╗│
 │ ║ ╔══════════════════╗ ║ │       ║   ║                  │║╔════════════════╗║│
 │ ║ ║ ╭──────────────╮ ║ ║ │       ╚═══╝                  │║║                ║║│
 │ ║ ║ │ ⬢  Frontend-A│ ║ ║ │       3 rings cap            │║║   terminal     ║║│
 │ ║ ║ │ Working …    │ ║ ║ │       compress to            │║║                ║║│
 │ ║ ║ ╰──────────────╯ ║ ║ │       --spell-ring-gap-rail  │║╚════════════════╝║│
 │ ║ ╚══════════════════╝ ║ │                              │╚══════════════════╝│
 │ ╚══════════════════════╝ │                              └────────────────────┘
 │                  ⊕ +2     │                                  ⊕ +2 (top-right)
 └──────────────────────────┘
```

### 4.4 Existing-style coexistence

Owned by `ui-systems` in `spell-ring.css` §2.4; summarized here for component
authors:

| Existing concern | Resolution |
| --- | --- |
| `coordinator-glow` on terminal | Merged rule `.coordinator-glow.spell-ring` keeps the orange halo and suppresses the crisp coordinator stroke so it doesn't fight ring 1. No new token. |
| `pn-st--selected` outline | Renders **above** all rings via `outline`, not box-shadow. |
| `pn-st--needsInput` blink | Preserved; when rings are present, its color is multiplied with `--spell-ring-1` per `spell-ring.css §2.4`. |
| Terminal padding | `.terminalContainer.spell-ring` reserves ring space inside the existing frame so xterm is never clipped — adjusted in `spell-ring.css`, not by components. |

### 4.5 Per-host props read

| Host | Props/state read |
| --- | --- |
| `SessionListItem` | `session.id` → subscribes via `SpellRingHost`. No prop changes needed for callers. |
| `SpacesRail` | Renders one `SpellRingHost as="button"` per session pill. The uniform `.spell-ring__overflow` "+N" pill renders inside the rail pill, same as on tiles and terminal — sized down via the `--spell-ring-gap` host override but otherwise identical (see `01-design-system.md §2.5`). |
| `AppWorkspace` (terminal) | The currently focused session's id is already known (`useSessionStore.activeSessionId`); the terminal wraps its container in `SpellRingHost` keyed by that id. |

### 4.6 States

| State | Behavior |
| --- | --- |
| default (0 spells) | No `--spell-ring-K` vars set; `.spell-ring` class still applied but inert. Host is visually unchanged from today. |
| 1–4 active | Rings render concentrically; outer = oldest, inner = newest (per `castAt asc`). |
| > 4 active | First 4 cast spells render rings (ring 4 keeps its own ring-4 color — it is **not** replaced by an overflow color). A uniform `.spell-ring__overflow` ("+N") pill renders inside the host on **all three hosts** (tile, rail, terminal) per `01-design-system.md §2.5`. No per-host visual variants — no dots, no chips. |
| disabled spell on session | That ring is rendered with the stripe pattern owned by `ui-systems` (motion-safe; `spell-ring.css §4`). |
| iterating spell | The matching ring runs the **iter-tick** motion (`01-design-system.md §4`); `prefers-reduced-motion` falls back to a static brighter ring. |
| ensemble member tile | Its ring uses `var(--spell-<id>-primary)` instead of `var(--spell-<id>-border)` (full saturation; chosen by `spellRingAttrs()`). No extra halo on the tile — the dashed group frame is drawn by `EnsembleGroup` (§5). |
| host hover/focus | Rings persist; hover does not change ring count. Hover delay 400 ms reveals the tooltip listing all active spells (§3.2 surface 3). Click on "+N" opens `SpellbookDrawer` scrolled to this session. |
| error | If activation store reports a stale/errored spell, that ring's color is replaced with the error token from `01-design-system.md` and the tooltip prepends "Spell errored — click for details". |

---

## 5 · `EnsembleGroup`

### 5.1 Purpose

Grouped session view + shared dashed frame + objective text + per-member role
chips + disband. Members are sessions linked by an `ensembleId` on their
`ActiveSpell`. Per `ui-systems §3.5`, the visual grouping is the
**`.pn-ensemble` dashed frame** drawn around the member tiles (NOT a halo on
each tile); per-member ring saturation already conveys ensemble membership
via `spellRingAttrs()` selecting `--spell-<id>-primary`.

### 5.2 Surfaces

- **In-rail group** — adjacent ensemble members in `SessionsSection` collapse
  into a single `EnsembleGroup` card with a header strip and a children stack.
- **Standalone dock** — when expanded from a ring badge or the spaces rail,
  opens as a floating dock at the bottom of the workspace listing all members.

### 5.3 Wireframe (in-rail group)

```
╔═ Ensemble · "Migrate auth to v2"  ▮ Plum  ─ leader ▣ ─── ⋮ ─╗
║  objective:  finish jwt rotation by EOD                     ║
║  ┌─ Frontend-A   ⬢  worker   iter 1/3   Working … ────────┐ ║
║  │  ╭ tile content; per-tile rings use --spell-plum-primary ║
║  └───────────────────────────────────────────────────────────┘
║  ┌─ Frontend-B   ⬢  worker   iter 1/3   Idle ────────────┐  ║
║  └───────────────────────────────────────────────────────┘  ║
║  ┌─ Coord-α      ▣  leader   coord-coord   Working … ───┐  ║
║  └───────────────────────────────────────────────────────┘  ║
║  ✦ Cast another on this ensemble       ✉ Message ensemble   ║
╚═════════════════════════════════════════════════════════════╝
   (dashed border = .pn-ensemble, color from spellEnsembleStyle())
```

### 5.4 Interface

```ts
type EnsembleGroupProps = {
  ensembleId: string;
  /** When false, the header is collapsed to a single line summary. */
  expanded: boolean;
  onToggleExpanded(): void;
  /** Render a single member row — handed in by the caller so SessionListItem
   *  remains the canonical session-row renderer (DRY with non-ensemble rows). */
  renderMember: (sessionId: string, role: EnsembleRole) => React.ReactNode;
};
```

Rendered shell:

```tsx
import { spellEnsembleStyle } from '../../utils/spellRings';
// colorId taken from ensemble.spellId → spellById(spellId).colorId
<div className="pn-ensemble" style={spellEnsembleStyle(colorId)}>
  …header / members / footer…
</div>
```

`spellEnsembleStyle(colorId)` (helper in `maestro-ui/src/utils/spellRings.ts`,
owned by `ui-systems` per `01-design-system.md §3.5`) returns
`{ '--ensemble-dim', '--ensemble-border', '--ensemble-text' }` derived from the
shared spell color. The `.pn-ensemble` rule consumes those vars for the
dashed frame, soft fill, and header label. `EnsembleGroup` never touches
ring vars on the member tiles — those flow through `SpellRingHost` (§4).

Header kebab menu (locked with `ux-flows` §4.4) — the only ensemble-first
affordance in the UI:

| Action | Behavior |
| --- | --- |
| Rename | Inline-edits the ensemble name in place. |
| Add member | Opens the **Cast Sheet target popover** (re-used from §1.8) as a session picker; selected sessions are appended via `useEnsembleStore.addMember(ensembleId, sessionId)`. **Does NOT re-cast** the spell — the server emits the ensemble's spell to the new member only as a join prompt. |
| Remove member | Removes a member without disbanding; leader-removal prompts to elect a new leader first. |
| Disband | Confirms, then `useEnsembleStore.disband(ensembleId)`. |
| Open in Spellbook | Opens `SpellbookDrawer` filtered to this ensemble. |

### 5.5 Internal state

```ts
type EnsembleGroupLocalState = {
  editingObjective: boolean;
  draftObjective: string;
  confirmDisband: boolean;
};
```

### 5.6 Store selectors

```ts
useEnsembleStore (new):
  ensembleById(id): Ensemble
  rename(id, name)
  updateObjective(id, text)
  setLeader(id, sessionId)
  addMember(id, sessionId): Promise<void>
  removeMember(id, sessionId): Promise<void>
  disband(id): Promise<void>
  sendEnsembleMessage(id, text): Promise<void>

useSpellLibraryStore: spellById   // for the action chip on the header
useSpellActivationStore: activeSpellsByEnsemble(id)
useSpellLauncherStore: openLauncher   // "Cast another" button
```

### 5.7 Per-member role chip

- `leader` — single member, mode `coordinator` / `coordinated-coordinator`.
- `worker` — typical member.
- Drag a member's role chip onto another to swap leadership (confirms).

### 5.8 States

| State | Behavior |
| --- | --- |
| default | Expanded card with member tiles + halo. |
| collapsed | One-line summary: name · objective · "N members" · leader badge. |
| hover | Header tools (rename / disband) become visible. |
| focus-visible | Outline around each interactive control. |
| active (disband-confirm) | Confirm strip slides in; primary button is `Disband`. |
| disabled (Cast another) | When ensemble's spell is single-shot and already done. |
| loading | While `disband` / `sendEnsembleMessage` pending → spinner on the affected control only. |
| empty (members = 0) | Header is preserved but body shows "All members exited. Disband?" |
| error | Toast + inline strip under the header; objective edits restore previous text. |

---

## 6 · `CustomSpellEditor` and `CustomSkillEditor`

### 6.1 Purpose

The only places to create / edit a custom **spell** (persisted to
`data/spells/*.json`) and a custom **skill** (persisted via `POST /api/skills`
to a markdown file the dispatcher can reference). Both open as a **full modal**
(promoted drawer) because they contain a prompt body that wants breathing room.

### 6.2 Wireframe — `CustomSpellEditor`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Create custom spell                                              ✕     │
│  ────────────────────────────────────────────────────────────────────── │
│  Name                            Icon                                    │
│  [ Lint-fix loop          ]      [ 🪄 ]                                  │
│                                                                          │
│  Description                                                             │
│  [ Re-runs lint until it passes, up to 5 rounds.                 ]      │
│                                                                          │
│  Color  (custom spells round-robin into brass/clay/slate by default)     │
│  ◯ brass ◯ vermilion ◯ moss ◯ lapis ◯ amber ◯ aubergine ◯ teal ● clay     │
│  ◯ slate ◯ plum                                                          │
│                                                                          │
│  Action                          Trigger                                 │
│  ▼ inject-prompt                 ▼ Stop                                  │
│                                                                          │
│  Loop type                       Max iterations                          │
│  ▼ continue-until-done           [  5  ]                                 │
│                                                                          │
│  Fail mode                                                               │
│  ◉ open    ◯ closed                                                      │
│                                                                          │
│  Skill ref (optional)            [ link to existing skill ▾ ]            │
│                                                                          │
│  Prompt                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Run the lint command. If it fails, fix the top 3 errors and     │   │
│  │ run it again. Stop when clean or after 5 rounds.                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  [Test cast on focused session]              [Cancel]   [Save spell]    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Interface — `CustomSpellEditor`

```ts
type CustomSpellEditorProps = {
  /** `null` = create. Provide a Spell to edit in place. Curated spells open
   *  read-only and the user is shown a "Duplicate to edit" CTA instead. */
  spell: Spell | null;
  onClose(): void;
  onSaved(spell: Spell): void;
};
```

### 6.4 Internal state

```ts
type CustomSpellEditorLocal = {
  form: SpellDraft;          // mirrors Spell fields, validated on change
  errors: Partial<Record<keyof SpellDraft, string>>;
  saving: boolean;
  testCasting: boolean;
  dirty: boolean;            // governs "Discard changes?" guard on close
};
```

### 6.5 Store selectors

```ts
useSpellLibraryStore: upsertSpell, fieldOptions (enums for action/loop/trigger)
useSpellActivationStore: castSpell   // "Test cast"
useSessionStore: activeSessionId      // target for test cast
useSkillStore: listSkills, skillByRef
```

### 6.6 Wireframe — `CustomSkillEditor`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Create skill                                                     ✕     │
│  ────────────────────────────────────────────────────────────────────── │
│  Scope        ◉ project   ◯ global                                       │
│  Slug         [ /lint-fix              ]   (will be invocable as ↑)      │
│  Title        [ Lint-fix routine       ]                                 │
│  Description  [ Re-run lint until clean.                         ]      │
│                                                                          │
│  SKILL.md                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  # Lint-fix routine                                              │   │
│  │  Use this skill when…                                            │   │
│  │                                                                   │   │
│  │  ## Steps                                                         │   │
│  │  1. Run `bun lint`                                                │   │
│  │  2. …                                                             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  [Link from spell ▾]                              [Cancel]   [Save]     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.7 Interface — `CustomSkillEditor`

```ts
type CustomSkillEditorProps = {
  /** `null` = create. */
  skill: Skill | null;
  /** When opened from a spell editor, the "Save and link" button replaces "Save". */
  linkBackToSpellId?: string;
  onClose(): void;
  onSaved(skill: Skill): void;
};
```

### 6.8 States (shared between both editors)

| State | Behavior |
| --- | --- |
| default | Form mounted; Name + Prompt are required; Save disabled until valid. |
| hover (enum chip) | Tooltip with the action/loop semantics. |
| focus-visible | Field outline. |
| active (Save) | Spinner inside Save; form non-interactive. |
| disabled | Required field empty / Zod validation failing / curated read-only. |
| loading | Initial open on edit → 2-row skeleton over form while fetching. |
| empty (n/a) | Editor always renders the empty form. |
| error | Inline field errors; toast at top for server-side rejection. |

### 6.9 Discard guard

`dirty === true` + close → confirm dialog "Discard changes?". This is owned by
the editor itself, not the parent.

---

## 7 · `TaskTile` spell assignment control

### 7.1 Purpose

In the task modal (`TaskDetailOverlay` / `TaskListItem` quick row), let the user
attach spells to a `Task`. These are baked into the manifest at spawn so the
spawned session auto-activates them.

### 7.2 Wireframe (task modal section)

```
┌────────────────────────────────────────────────────────────┐
│  Task · "Add auth tests"                                   │
│  ──────────────────────────────────────────────────────── │
│  Status   In progress                                       │
│  Team     Frontend                                          │
│                                                             │
│  Spells on spawn                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  ◐ Critic refine         loop · 3   [×]              │ │
│  │  ⬢ Test failure gate     gate       [×]              │ │
│  │  +  Add spell                                        │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  Sessions assigned (2)  …                                   │
└────────────────────────────────────────────────────────────┘
```

### 7.3 Interface

```ts
// components/spells/TaskSpellAssignment.tsx
type TaskSpellAssignmentProps = {
  taskId: string;
  /** When true, "Add spell" opens SpellLauncher in "attach to task" mode (no
   *  cast button — the spells are queued for spawn). */
  editable: boolean;
};
```

### 7.4 Internal state

```ts
type TaskSpellAssignmentLocal = {
  picking: boolean;   // SpellLauncher open in attach mode
};
```

### 7.5 Store selectors

```ts
useTaskStore (existing):
  taskById(taskId)
  updateTaskSpellIds(taskId, spellIds[])

useSpellLibraryStore: spellById
useSpellLauncherStore: openLauncher({ source: 'task-tile', mode: 'attach', taskId })
```

### 7.6 Attach-mode hook into SpellLauncher

`SpellLauncher` accepts an extra open variant:

```ts
type OpenLauncherInput =
  | OpenLauncherInputCast      // §1.3 — existing
  | { source: 'task-tile'; mode: 'attach'; taskId: string };
```

When in attach mode:

- Footer swaps targets for an "Already attached" chip row.
- Primary CTA becomes **Attach** (not Cast).
- Selecting a spell appends it to `task.spellIds`; deselecting removes it.
- Cast-mode toggle is hidden.

### 7.7 States

| State | Behavior |
| --- | --- |
| default | Rows of attached spells + "Add spell". |
| hover (row) | × is revealed. |
| focus-visible | Outline on row + × |
| active | Click row → opens `SpellDetailsView` in drawer mode (read-only-for-default, editable for custom). |
| disabled | `editable === false` hides + and × but keeps the list visible. |
| loading | Task being saved → small spinner next to "Spells on spawn" header. |
| empty | "No spells will run on spawn. + Add spell". |
| error | `updateTaskSpellIds` rejected → inline toast inside the section. |

### 7.8 Manifest integration note

(Not a component concern, captured here for completeness.) When a session is
spawned for a task, the server materializes each `Task.spellIds[i]` into an
`ActiveSpell` on the session at creation time. The UI doesn't need to do
anything extra — `SpellRingHost` picks it up via the activation store the
moment the session appears.

---

## 8 · Store map (summary)

| Store (file) | New / existing | Purpose |
| --- | --- | --- |
| `useSpellLibraryStore` (new — `stores/useSpellLibraryStore.ts`) | new | Curated + custom spells, fetch/upsert/delete. |
| `useSpellLauncherStore` (new — `stores/useSpellLauncherStore.ts`) | new | Open/close + open-args for the launcher; tiny. |
| `useSpellActivationStore` (new — `stores/useSpellActivationStore.ts`) | new | `Session.activeSpells` mirror + cast/toggle/remove + WS subscription to `spell:activated/deactivated`. |
| `useEnsembleStore` (new — `stores/useEnsembleStore.ts`) | new | Ensemble entities + WS subscription to `ensemble:created/updated/disbanded`. |
| `useSkillStore` (new — `stores/useSkillStore.ts`) | new | Skill list + create. |
| `useSpellStore` (existing) | **deleted** | Logic redistributed into the four stores above. |
| `useSessionStore`, `useProjectStore`, `useTaskStore`, `useUIStore` | existing | Unchanged surface, new components subscribe via existing selectors. |

### 8.1 Existing callers to migrate (`useSpellStore` removal)

The deletion of `useSpellStore` is not silent — these are the existing call
sites that must be migrated to the new stores before `useSpellStore.ts` and
`SpellPicker.tsx` are removed. P1 in the build order locks them all:

| File | Current usage | Migration target |
| --- | --- | --- |
| `maestro-ui/src/components/maestro/SpellPicker.tsx` | Entire component reads from `useSpellStore`. | **Deleted** in P1 (replaced by `SpellLauncher`); its single import from `AppModals.tsx` is swapped. |
| `maestro-ui/src/components/session-log/TerminalStrip.tsx` | Calls `useSpellStore` (`openPicker(targetSessionId)`) from the inline ✦ button. | Switch to `useSpellLauncherStore.openLauncher({ source: 'workspace', targetSessionIds: [activeSessionId] })`. Add inline render of `<ActiveSpellsPanel anchor="header-strip" sessionId={...}/>` above the terminal frame (§3.2 surface 1). |
| `maestro-ui/src/hooks/useSpells.ts` | Thin selector wrapper around `useSpellStore.entities/entitiesByType`. | Replaced by `useSpellLibraryStore` selectors (`spells`, `spellsByCategory`). The hook file is **deleted**; existing call sites already use the store directly post-P1. |
| `maestro-ui/src/hooks/useSpellInvocation.ts` | Wraps `useSpellStore.invokeSpell()`. | Replaced by `useSpellActivationStore.castSpell()` (matches the new invoke contract from `DESIGN_BRIEF.md` — `entityType + projectId + targetSessionIds + invokerSessionId`). Hook file is **deleted**; call sites move directly to the store. |
| `maestro-ui/src/stores/useSpellStore.ts` | The store itself. | **Deleted** in the same commit that ships P1's five replacement stores. No re-export shim, no transitional alias — the imports above are updated atomically. |

### 8.2 Legacy domain types (`SpellEntity*` in `maestro.ts`)

`maestro-ui/src/app/types/maestro.ts` currently declares `SpellEntity`,
`SpellEntityType`, `SpellDefinition`, `SpellInvocation` (lines ~847+) — these
mirror the old `SPELL_REGISTRY` / `CustomPrompt` server contract. They are
**not** the new `Spell` entity defined in `DESIGN_BRIEF.md` and must not
silently shadow it.

Decision (locked):

- **`SpellEntity`**, **`SpellEntityType`**, **`SpellDefinition`** — **deleted
  outright** in P1. They have no consumer once `useSpellStore.ts`,
  `SpellPicker.tsx`, `useSpells.ts`, and `useSpellInvocation.ts` are removed.
- **`SpellInvocation`** — also **deleted**; superseded by `CastSpellInput`
  on `useSpellActivationStore`.
- **`CustomPrompt`** (server `types.ts:618` + UI mirror) — retained as the
  legacy persistence shape for one migration window: `FileSystemSpellRepository`
  reads existing `~/.maestro*/data/custom-prompts/*.json` files and migrates
  them into the new `data/spells/*.json` format on first boot. After the
  migration window closes (target: one release), the `CustomPrompt` type and
  its repository can be deleted.
- The new entity is named `Spell` (matches `DESIGN_BRIEF.md`). It is exported
  from `maestro-ui/src/app/types/maestro.ts` alongside the deleted types in
  the same commit, so no overlap window exists.

---

## 9 · File map (where new files land)

```
maestro-ui/src/
├── components/
│   ├── spells/
│   │   ├── SpellLauncher.tsx                ← §1
│   │   ├── SpellCard.tsx                    ← §1.7
│   │   ├── SessionTargetChips.tsx           ← §1.8
│   │   ├── CastModeToggle.tsx               ← §1.9
│   │   ├── SpellDetailFlyout.tsx            ← §2 (non-modal flyout shell)
│   │   ├── SpellDetailsView.tsx             ← §2 (body, shared with editor modal)
│   │   ├── ActiveSpellsPanel.tsx            ← §3 (all 4 surfaces)
│   │   ├── SpellbookDrawer.tsx              ← §3.5
│   │   ├── ActiveSpellChip.tsx              ← §3.6 (compact form, surfaces 1/2/3)
│   │   ├── ActiveSpellChipMenu.tsx          ← §3.4.1
│   │   ├── ActiveSpellRow.tsx               ← §3.6 (expanded form, Spellbook)
│   │   ├── SpellRingHost.tsx                ← §4.2 (React wrapper; styling helpers live in utils/spellRings.ts)
│   │   ├── EnsembleGroup.tsx                ← §5 (rail/Spellbook grouped view)
│   │   ├── EnsembleDock.tsx                 ← §5 (standalone floating dock variant)
│   │   ├── EnsembleMessageComposer.tsx      ← §5 (✉ Message ensemble input; used by dock + group footer)
│   │   ├── UndoToast.tsx                    ← §1.10 confirm-risky state (5 s post-cast undo; consumes useSpellActivationStore.lastCastReceipt)
│   │   ├── CustomSpellEditor.tsx            ← §6
│   │   ├── CustomSkillEditor.tsx            ← §6
│   │   └── TaskSpellAssignment.tsx          ← §7
│   ├── maestro/
│   │   ├── SessionListItem.tsx              ← wraps root in <SpellRingHost>
│   │   └── SpellPicker.tsx                  ← DELETED (replaced by SpellLauncher)
│   ├── SpacesRail.tsx                       ← wraps pn-srail-s in <SpellRingHost>
│   └── app/
│       ├── AppModals.tsx                    ← imports SpellLauncher instead of SpellPicker
│       └── AppWorkspace.tsx                 ← wraps .terminalContainer in <SpellRingHost>
├── stores/
│   ├── useSpellLibraryStore.ts
│   ├── useSpellLauncherStore.ts
│   ├── useSpellActivationStore.ts
│   ├── useEnsembleStore.ts
│   └── useSkillStore.ts
├── utils/
│   └── spellRings.ts                         ← spellRingAttrs() (canonical host helper) + spellRingStyle() (style-only convenience for non-host previews) + spellEnsembleStyle() (owned by ui-systems; UI_SPEC §7)
└── styles/
    ├── spell-ring.css                        ← .spell-ring rules (owned by ui-systems)
    └── styles-spells.css                     ← sp-* component classes (Launcher / Flyout / Spellbook / cards)
```

---

## 10 · Hand-off checklist

- [x] `ui-systems` ring/palette contract folded into §0 verbatim from
      `01-design-system.md`. No `data-spell-*` attributes; helper is
      `spellRingAttrs()` / `spellRingStyle()` / `spellEnsembleStyle()` in
      `maestro-ui/src/utils/spellRings.ts`.
- [ ] `ui-systems` owns the `.spell-ring` class + `spell-ring.css` rules
      (including `.coordinator-glow.spell-ring` merged rule, motion, overflow
      badge, host-specific `--spell-ring-gap`).
- [ ] `ux-flows` validates the drawer/modal split for details/editor (§2.2)
      and the popover/inline split for active spells (§3.2).
- [ ] No component renders ring CSS directly — all goes through
      `SpellRingHost`.
- [ ] No component talks to the server directly — all calls go through the
      stores in §8.
- [ ] All `SpellLauncher`, `SpellDetailsView`, `CustomSpellEditor`,
      `CustomSkillEditor` modals mount through `AppModals.tsx` (consistent with
      existing portal patterns).
