# UI Fix — Cards / Graphs / Lists tab organization

Staging tree: `/home/ubuntu/agent-maestro` (branch `integrate/msg-pipeline-to-main`).
Scope: layout/organization only (spacing on a 4px grid, alignment, touch targets, theme consistency). No logic changes.
Build: `bunx tsc --noEmit` in `maestro-ui` → **exit 0 (clean)**.

## Audit findings
- **Overlapping CSS systems**: the panel shell uses redesign `pn-*` tokens, but the Lists tab renders with the legacy `terminal*`/`taskList*` classes hosted in `.terminalContent` (padding `6px 4px` — a cramped 4px side gutter vs the 14px gutter used elsewhere).
- **Off-grid card spacing**: board cards used odd values (`11px` padding, `9px` gaps) that don't align to the 4px grid → visually inconsistent gaps/padding.
- **Graphs tab off-theme + tiny controls**: `TaskGraphPanel` inline styles referenced non-existent vars (`--bg-tertiary`/`--text-primary`/`--text-secondary`) that fell back to hard-coded dark hex, clashing with the warm-paper theme; delete/back buttons were ~18px hit boxes; toolbar buttons `4px 10px`.
- **Real alignment bug (Lists)**: `.taskListItemWorkArea` was `display:flex; align-items:center`, which shrink-wrapped the expanded task rows so they no longer spanned the card width.

## Changes (file:line — before → after)

### Lists tab
- `maestro-ui/src/task-lists.css:178` — `.taskListsPanel` padding `6px 4px` (inherited from `.terminalContent`) → `padding:14px; gap:12px; box-sizing:border-box` (consistent 14px gutter matching the tasks tab).
- `maestro-ui/src/task-lists.css:184` — `.taskList` gap `2px` → `8px` (legible spacing between list cards).
- `maestro-ui/src/task-lists.css:188` — `.taskListActionBtn` (row ↑/↓/Remove) `min-height` unset (~28px) → `min-height:32px` + flex-centered (touch target).
- `maestro-ui/src/styles-task-list-view.css:543` — `.taskListItemWorkArea` `display:flex; align-items:center` → `display:block` (expanded task rows now span full card width).
- `maestro-ui/src/styles-task-list-view.css:547` — `.taskListItemExpand` chevron `24×24` → `30×30` (touch target).
- `maestro-ui/src/styles-task-list-view.css:551` — `.taskListItemActionBtn` (Add Tasks/Edit/Delete) added `min-height:32px` (touch target).

### Cards (board / TaskCard)
- `maestro-ui/src/components/maestro/redesign/redesign-boards.css:34` — `.pn-bcol__hd` padding `11px 12px` → `12px`.
- `maestro-ui/src/components/maestro/redesign/redesign-boards.css:37` — `.pn-bcol__body` padding `10px`/gap `9px`/min-height `70px` → `12px`/`10px`/`72px`.
- `maestro-ui/src/components/maestro/redesign/redesign-boards.css:44` — `.pn-bcard` padding `11px 12px` → `12px`.
- `maestro-ui/src/components/maestro/redesign/redesign-boards.css:54` — `.pn-bcard__meta` gap `9px` → `8px`.
  (All card padding/gaps now on the 4px grid: 8/10/12.)

### Graphs tab (TaskGraphPanel.tsx — inline styles)
- `TaskGraphPanel.tsx` (6+4+3 sites) — replaced off-theme fallback vars `var(--bg-tertiary,#1f1f1f)`→`var(--pn-card)`, `var(--text-primary,#e5e5e5)`→`var(--pn-ink)`, `var(--text-secondary,#a0a0a0)`→`var(--pn-ink-3)` (graph list rows, toolbar, task-picker now match the warm-paper theme).
- `TaskGraphPanel.tsx:167` — graph list row padding `10px 12px`/marginBottom `6` → `12px`/`8`, added `minHeight:52`, `gap:12`, `--pn-r-md` radius + `--pn-sh-sm` shadow (consistent card look/spacing).
- `TaskGraphPanel.tsx:190` — graph "×" delete button `padding:2px 6px` → `30×30` grid-centered hit box, radius `--pn-r-sm`.
- `TaskGraphPanel.tsx:218` — editor toolbar padding `6px 12px` → `8px 12px`.
- `TaskGraphPanel.tsx:226` — toolbar "←" back button `padding:2px 6px` → `30×30` grid-centered hit box.
- `TaskGraphPanel.tsx:242/257/272` — toolbar Add Tasks / Validate / Save buttons `padding:4px 10px; fontSize:11; radius:5` → `height:30; padding:0 12px; fontSize:12; radius --pn-r-sm` (uniform, comfortable targets).

All list/graph layout CSS is scoped under `html[data-redesign]` (redesign is default-on) so it wins specificity without touching the legacy theme.
