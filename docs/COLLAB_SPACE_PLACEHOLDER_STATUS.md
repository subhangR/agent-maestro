# Collab Space — Placeholder Phase Status

Status for the placeholder phase of the four non-channel surfaces inside
`SpaceWindow`. Source-of-truth design lives in:

- `docs/COLLAB_SPACE_UI_UX_PLAN.md` — layouts, interactions, empty states
- `docs/ENTITY_PUSH_PULL_PLAN.md` — push/pull data model + provenance
- `docs/SPACE_WINDOW_AND_RAIL_PLAN.md` — full-window layout + rail entry

This doc only captures what shipped in the placeholder phase and what is
deliberately deferred to the data-wiring phase.

---

## 1. What ships in the placeholder phase

### Sub-rail (left edge of `SpaceWindow`)

`maestro-ui/src/components/space-window/SpaceSubRail.tsx`

Four buttons — `Channels`, `Tasks`, `Team Members`, `Spells`. Active state
mirrors the main `IconRail` visual language. State lives in
`useUIStore.spaceActiveSection`; selection is persisted per-space under
`space.{spaceId}.section` in `localStorage` and restored on re-entry.

### Layout shell

`SpaceWindow` body is a 3-column CSS grid: `36px subrail | 1fr section |
260px members`. The center column is wrapped in
`.spaceWindowSectionWrap.spaceWindowSectionWrap--{section}` so each section
can pick its own internal master/detail split:

- `--channels` → `220px | 1fr` (channel list + stream)
- `--tasks`, `--team` → `280px | 1fr` (master/detail)
- `--spells` → `1fr` (single-column card list with inline preview)

Members column is always visible — humans are context, not a tab.

### Sections

| File | Surface | Layout | Empty-state copy |
|---|---|---|---|
| `sections/ChannelsSection.tsx` | existing channels + stream | wraps existing columns | (n/a — handled by messaging) |
| `sections/TasksSection.tsx` | shared tasks (push/pull) | master/detail | "No shared tasks yet" |
| `sections/TeamMembersSection.tsx` | shared agent personas | master/detail | "No shared team members yet" |
| `sections/SpellsSection.tsx` | shared spells | card list + inline preview | "No shared spells yet" |

Stub data arrays (`STUB_TASKS`, `STUB`) are intentionally empty so the
empty-state copy is what users see today. Replacing these constants with a
Firestore subscription is the data-wiring task.

### Shared primitives

- `shared/EmptySectionState.tsx` — reusable empty-state card
- `shared/PushFromLocalButton.tsx` — `+ Push from local` / `+ Publish from local`
  with a `soon` badge; renders disabled until a click handler is provided
- `shared/AdoptToLocalButton.tsx` — `Pull to local` / `Adopt locally` /
  `Install`; disabled until handler provided

These are kind-parametrized (`task | team-member | spell`) so the future
data layer wires the same component for all three surfaces.

### Modals

- `modals/InviteMemberModal.tsx` — copy-link UX for now. Visible from the
  members column's `+ Invite` button. Email-based invites + join-request
  approvals are explicitly deferred.

### Members column

`SpaceMembersColumn.tsx` keeps the existing roster + owner badge UI. The
invite button now opens `InviteMemberModal` instead of being disabled.

---

## 2. State + persistence

```ts
// useUIStore.ts
type SpaceSection = 'channels' | 'tasks' | 'team' | 'spells';

interface UIState {
  spaceActiveSection: SpaceSection;
  setSpaceActiveSection: (section: SpaceSection) => void;
}
```

- Default: `'channels'` whenever `appView.kind === 'space'`.
- Persisted: `localStorage["space.{spaceId}.section"]`.
- Hydration: `setAppView({kind:'space',spaceId})` calls `readSpaceSection` so
  re-entering a space lands the user back on whichever section they left.
- Esc still returns to Maestro view (handled in `SpaceWindow`).

---

## 3. What is *not* in this phase (deferred)

Captured here so the next picker doesn't re-derive scope:

| Surface | Deferred work |
|---|---|
| Tasks | Firestore subscription to `collabSpaces/{spaceId}/tasks`; Push/Pull modals; provenance (`linkedLocalTaskIdsByUid`); bulk-pull |
| Team Members | Firestore subscription to `collabSpaces/{spaceId}/teamMembers`; publish modal (skill missing flag); adopt cloning |
| Spells | Firestore subscription to `collabSpaces/{spaceId}/spells`; install conflict UX (replace/rename/cancel); preview-only mode |
| Members | Realtime presence; DMs; member-click side-popover; Admin role tier |
| Invite | Email-based invites; deep-link handling in Tauri; join-request approvals for private spaces |

Storage layout to add in the wiring phase:

```
collabSpaces/{spaceId}/
  channels/{channelId}            (already exists)
  tasks/{taskId}                  (this plan)
  teamMembers/{memberConfigId}    (this plan)
  spells/{spellId}                (this plan)
```

Security rules + indexes for these subcollections live in
`docs/ENTITY_PUSH_PULL_PLAN.md §3-4`.

---

## 4. CSS contract

All section CSS is in `maestro-ui/src/styles-space-window.css` (already
imported from `styles.css`). Class prefixes:

- `.spaceSubRail*` — sub-rail
- `.spaceWindowSectionWrap*` — center-column variants per section
- `.spaceSectionList*` / `.spaceSectionDetail*` — master/detail shared by
  Tasks + Team Members
- `.spaceTask*` — task-row + status pills
- `.spaceMemberCard*` / `.spaceModeBadge` — agent-persona cards
- `.spaceSectionFull*` / `.spaceSpell*` — single-column spell list
- `.spaceEmptySection*` / `.spaceSectionHint*` — empty-state + detail-empty
- `.spacePushFromLocalBtn` / `.spaceAdoptBtn` / `.spaceTodoBadge` — stub CTAs
- `.spaceModal*` / `.spaceInviteLink*` — invite modal

Visual language follows the existing Maestro tokens (`--theme-primary`,
`--border`, `--text-*`). No new theme primitives were introduced.

---

## 5. Verification

- `bunx tsc -b` (UI) — clean
- `bunx vitest run` (UI) — 4 files, 41 tests pass
- All four sub-rail sections compose with the existing Esc / Back shortcuts.
- Empty-state copy matches plan §10 acceptance criteria.

---

## 6. Files touched in this phase

New:
```
maestro-ui/src/components/space-window/
├── SpaceSubRail.tsx
├── sections/
│   ├── ChannelsSection.tsx
│   ├── TasksSection.tsx
│   ├── TeamMembersSection.tsx
│   └── SpellsSection.tsx
├── shared/
│   ├── EmptySectionState.tsx
│   ├── PushFromLocalButton.tsx
│   └── AdoptToLocalButton.tsx
└── modals/
    └── InviteMemberModal.tsx
```

Modified:
```
maestro-ui/src/components/space-window/SpaceWindow.tsx
maestro-ui/src/components/space-window/SpaceMembersColumn.tsx
maestro-ui/src/stores/useUIStore.ts
maestro-ui/src/styles-space-window.css
```
