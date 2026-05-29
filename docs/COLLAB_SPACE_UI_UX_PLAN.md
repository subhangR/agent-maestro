# Collab Space — Tasks / Team / Spells / Members / Push-Pull UI Plan

This document covers the inhabitable surfaces of a Collab Space beyond the
default `# channels` messaging stream. It is the v1 design contract for the
five surfaces that must coexist inside `SpaceWindow`:

1. **Channels** — the messaging stream (already designed in the previous task)
2. **Tasks** — shared tasks + push/pull from the local Maestro project
3. **Team Members** — shared agent personas (team member configs) the space
   has contributed
4. **Spells** — shared spell library
5. **Members** — humans in the space (presence + invite + permissions)

All five must be reachable from inside `SpaceWindow` without leaving the
full-window layout, and must compose cleanly with messaging once the
messaging task lands.

---

## 1. Layout — top tabs + always-on chat + entity pane

> **Pivot (2026-04-29):** the original sub-rail design was abandoned in
> favor of a flatter, two-pane shell with top tabs. Both panes are
> realtime — chat is always visible while the user reads/edits any entity.

```
┌─ Chrome (back, name, settings) ───────────────────────────────────────┐
├───────────────────────────────────────────────────────────────────────┤
│  [Tasks] [Team Members] [Spells] [Members] [Settings]                 │ ← top tabs
├───────────────────────────────────────────────────────────────────────┤
│ ┌──────┬────────────────────────────┐ │                                │
│ │ # ch │ # general · Backend Squad  │ │  ENTITY PANE                   │
│ │ list │                            │ │  (active top tab)              │
│ │      │  stream of messages...     │ │                                │
│ │ # gen│                            │ │  - row                         │
│ │      │  ...                       │ │  - row    [push/pull/install]  │
│ │ + ch │                            │ │  - row                         │
│ │      │ [composer]          [Send] │ │                                │
│ └──────┴────────────────────────────┘ │                                │
└───────────────────────────────────────────────────────────────────────┘
   ↑   chat pane (always visible)         ↑   entity pane (per top tab)
```

The top tabs (left-to-right):

| Tab | Entity pane shows |
|---|---|
| Tasks (default) | Shared task list + push/pull row actions, status filter, search |
| Team Members | Shared agent personas + adopt/fork |
| Spells | Shared spell library + install/preview |
| Members | Humans in the space + presence + invite + manage |
| Settings | Rename, visibility, invite link, admins, leave/delete |

### Why this shape
- **Chat is omnipresent.** The user never has to leave conversation context
  to read or push tasks/agents/spells. Both panes update in realtime.
- **Channels are not a tab.** Their stream IS the chat pane. The thin
  channel-list strip on the far left of the chat pane lets the active
  channel switch without yielding screen real-estate to a list view.
- **Members + Settings are top tabs**, not always-on columns — the user is
  unlikely to need them on every interaction, so reclaim that width for the
  primary work (entity pane).
- **No master/detail.** Each entity tab is a single list with row-level
  actions; rows expand inline when more detail is needed. Cuts a column,
  faster to scan, easier to add live updates without conflict UX.

---

## 2. Top-tab behavior

State lives in `useUIStore`:

```ts
type SpaceSection = 'tasks' | 'team' | 'spells' | 'members' | 'settings';

interface UIState {
  spaceActiveSection: SpaceSection;
  setSpaceActiveSection: (s: SpaceSection, spaceId?: string) => void;
  loadSpaceSection: (spaceId: string) => void;
}
```

- Default: `'tasks'` whenever a space is opened.
- Persisted per-space in `localStorage` (key: `space.{spaceId}.section`) so
  the user lands back on whichever tab they were last in.
- Active tab gets a 2px accent underline.
- The chrome's gear icon jumps directly to the Settings tab.

---

## 3. Tasks surface (push / pull)

The Tasks surface is the core push/pull pipeline between a user's local
Maestro project and a shared space. The space is the canonical store for
shared work; the local project pulls down task definitions and pushes up
new ones.

### Layout
Two-pane master/detail inside the center column:

```
┌─ Sub-rail │ Tasks ──────────────────────────────┬──────────────────────┐
│           │                                     │                      │
│           │  [▼ All]  [▼ Status]  [⤓ Pull]      │                      │
│           │  ─────────────────────────────────   │  Task detail         │
│           │  ◆ Add OAuth callback                │                      │
│           │    todo · pushed by @subhang · 2d    │  Title:              │
│           │  ◆ Refactor session manager          │  Description...      │
│           │    in_progress · @manzil · 1h        │                      │
│           │  ◆ Migrate to Postgres               │  Linked sessions...  │
│           │    completed · @priya · 6d           │                      │
│           │                                     │  [Pull to local]     │
│           │  + Push from local                   │  [Edit] [Delete]     │
│           │                                     │                      │
└───────────┴─────────────────────────────────────┴──────────────────────┘
```

Per-task fields (on top of the local Maestro `MaestroTask` shape):
- `originUid` — who pushed this task
- `originLocalTaskId` — the local Maestro task id it came from (nullable)
- `pulledByUids[]` — which space members have pulled it locally
- `linkedLocalTaskIdsByUid: Record<uid, string>` — per-user link back to local
- `status`, `priority`, `assignee` — same enum as local Maestro

### Push from local
- "+ Push from local" opens a modal with a multi-select task picker scoped
  to the user's *active local project*.
- Submit → calls `SpaceTasksClient.push(localTask, spaceId)` → server-side
  Cloud Function (or client transaction in v1) writes `spaceTasks/<id>` and
  records `linkedLocalTaskIdsByUid[user.uid]` so future updates round-trip.
- Empty state: no active local project? → "Open a Maestro project to push
  tasks." with a CTA back to Maestro view.

### Pull to local
- Per-task "Pull to local" button.
- Picks a destination (active local project; if user has multiple, modal
  picker).
- Calls a `localTaskAdapter.materialize(spaceTask, projectId)` that creates
  the matching `MaestroTask` and links it back via `linkedLocalTaskIdsByUid`.
- Bulk-pull header action: "⤓ Pull all" — confirmation prompt + progress
  toast.

### Sync semantics (v1, deferred to v2 in code)
- Pull is one-way (creates a local copy). Updates do not stream back unless
  the user explicitly re-pulls.
- Future: push-on-update — the space task author can elect to keep their
  local edits in sync; pulled copies subscribe and surface "this task was
  updated upstream."

### Empty state
> *No shared tasks yet.* Push tasks from your local Maestro project to share
> them with everyone in this space, or pull them down to work on locally.

### Placeholder for v1
- List + detail UI implemented; data wired from a stub `SpaceTasksClient`
  that subscribes to `collabSpaces/{spaceId}/tasks`.
- Push/pull modals stubbed; actual server work flagged TODO.

---

## 4. Team Members surface

Shared agent personas. A Maestro team member is a reusable agent config
(mode, model, agentTool, commandPermissions, identity prompt). Spaces let
collaborators publish theirs so others can adopt them locally.

### Layout
Master/detail like Tasks:

```
┌─ Sub-rail │ Team Members ───────────────────────┬──────────────────────┐
│           │  [+ Publish from local]              │  Avatar  Name        │
│           │                                      │  worker · sonnet-4.6 │
│           │  ▢ Reviewer (worker, sonnet-4.6)     │                      │
│           │     by @subhang · 12 adoptions       │  Identity prompt:    │
│           │  ▢ Codegen Lead (coordinator, opus)  │  > You review PRs... │
│           │     by @manzil · 4 adoptions         │                      │
│           │  ▢ Test-runner (worker, haiku)       │  Commands: ...       │
│           │     by @priya · 2 adoptions          │  Agent tool: ...     │
│           │                                      │                      │
│           │                                      │  [Adopt locally]     │
│           │                                      │  [Fork] [Open]       │
└───────────┴──────────────────────────────────────┴──────────────────────┘
```

Per-team-member fields:
- `originUid`, `publishedAt`
- `mode` (worker/coordinator/...)
- `model`
- `agentTool`
- `identity` — full prompt string
- `commandPermissions` — same shape as local `TeamMember`
- `adoptionCount` — cached count

### Publish from local
- "+ Publish from local" → modal with a picker of the user's local team
  members in the active project.
- Confirmation surfaces what will become public (identity prompt content,
  command perms) so users don't accidentally leak prompts.

### Adopt locally
- One-click clone into the active local project.
- Creates a new local `TeamMember` with `metadata.spaceMemberId` set so we
  can show "Adopted from space" in Maestro's team view.

### Empty state
> *No shared team members yet.* Publish your most-used agents so the rest of
> the space can adopt them with one click.

---

## 5. Spells surface

Spells are contextual prompts. The shared spell library lets the space
publish spells anyone can install locally.

### Layout
List with inline detail (lighter than Tasks/Team since spells are simple):

```
┌─ Sub-rail │ Spells ─────────────────────────────────────────────────────┐
│           │  [Search...]                       [+ Publish from local]   │
│           │                                                              │
│           │  ✦ /review-pr                                                │
│           │    "Review the current PR for..." · @subhang · ↑ 8           │
│           │    [Install] [Preview]                                       │
│           │                                                              │
│           │  ✦ /scaffold-feature                                         │
│           │    "Scaffold a new feature..." · @manzil · ↑ 3               │
│           │    [Install] [Preview]                                       │
└───────────┴──────────────────────────────────────────────────────────────┘
```

Per-spell fields (on top of local `Spell` shape):
- `originUid`, `publishedAt`
- `name`, `description`, `body`
- `targetEntities[]` — which entity types it applies to
- `installCount`

### Install
- Adopts the spell into the user's *global* spell library (not project-
  scoped) since spells are workflow-level, not project-level.
- Conflict UX: if a spell with the same name exists, prompt "Replace /
  Rename / Cancel".

### Preview
- Opens a side-pane reading-mode view of the prompt body. No execution.

### Empty state
> *No shared spells yet.* Publish a spell to give every member a one-click
> shortcut to your favorite prompts.

---

## 6. Members surface (right column)

Humans in the space. Always visible while in `SpaceWindow`. Three sections:

```
┌─ Members (12) ─────────────┐
│                             │
│  Online (3)                 │
│  ● Subhang   owner          │
│  ● Manzil    member         │
│  ● Priya     member         │
│                             │
│  Offline (9)                │
│  ○ Asha      member         │
│  ○ Devon     member         │
│  ...                        │
│                             │
│  + Invite                   │
└─────────────────────────────┘
```

### Presence (deferred to v2)
- v1: static "joined recently" indicator (last 7 days).
- v2: realtime presence via Firestore RTDB or a presence subcollection.

### Invite
- Opens a modal with an invite link `https://maestro.app/space/{id}/join`
  (deep-link the desktop app handles in v2; copies to clipboard in v1).
- For private spaces: also surfaces an "Email invite" form.

### Member click
- v1: shows a side-popover with the member's name + email + role.
- v2: opens DMs (deferred).

### Roles
- Owner (creator): rename / delete space, manage members, change visibility.
- Member: read + write everywhere; cannot manage space.
- (v2) Admin: a middle tier for moderation.

---

## 7. Push / Pull pipeline — global model

The push/pull pipeline is reusable. We model it once and parametrize it
for tasks, team members, and spells:

```ts
interface SyncableItem<T> {
  id: string;                                   // space-scoped id
  originUid: string;                            // who published
  publishedAt: Timestamp;
  data: T;                                      // shape per kind
  linkedLocalIdsByUid: Record<string, string>;  // local id per puller
  adoptionCount: number;
}

type Syncable<K extends 'task' | 'team-member' | 'spell'> =
  K extends 'task' ? SyncableItem<MaestroTask> :
  K extends 'team-member' ? SyncableItem<TeamMemberConfig> :
  K extends 'spell' ? SyncableItem<Spell> : never;
```

Single `<PushFromLocalPicker kind="task|team-member|spell"/>` and
`<AdoptToLocalButton kind=...>` components handle the actual data flow. The
Tasks/Team/Spells surfaces use these primitives so the patterns are
consistent.

### Storage layout (Firestore)
```
collabSpaces/{spaceId}/
  channels/{channelId}            (existing)
  tasks/{taskId}                  (this plan)
  teamMembers/{memberConfigId}    (this plan)
  spells/{spellId}                (this plan)
```

---

## 8. Visual language

Reuse the existing Maestro design tokens — there is no new theme:
- Backgrounds: `#0c0e14` body, `#0a0c12` sidebars/columns
- Borders: `--border` / `--border-subtle`
- Accent: `--theme-primary` (varies by user's chosen theme)
- Mono: 'JetBrains Mono'; UI: 'Inter' / `--style-font-ui`

Sub-rail inside `SpaceWindow` reuses `iconRailButton`/`iconRailButton--active`
classes for consistency. Members avatar and rail-letter avatar share the
hash-color palette already shipped in `SpaceRailSection`.

Differences from Maestro main UI:
- Wider center column (chat-first ergonomics).
- No project tabs.
- Sub-rail is *narrower* (32px) than the main rail (48px) so it doesn't
  visually compete with the main rail when both are visible.

---

## 9. Empty / loading / error states

| Surface | Loading | Empty | Error |
|---|---|---|---|
| Channels | spinner in list | "No channels yet" + create CTA | inline error pill |
| Tasks | skeleton rows | "No shared tasks yet" + push CTA | error banner with retry |
| Team Members | skeleton rows | "No shared team members yet" + publish CTA | error banner |
| Spells | skeleton rows | "No shared spells yet" + publish CTA | error banner |
| Members | skeleton rows | (members[] always has owner so no empty) | error banner |

All loading skeletons reuse the existing `terminalLoadingState` /
`terminalSpinnerDot` aesthetic to stay consistent with Maestro.

---

## 10. Acceptance criteria for the placeholder phase

The placeholder phase (this task) ships:

- [ ] Sub-rail inside `SpaceWindow` with four buttons (Channels / Tasks /
      Team / Spells)
- [ ] `useUIStore.spaceActiveSection` + persisted per-space localStorage
- [ ] **Channels** — already shipped; left list + center stream
- [ ] **Tasks** — placeholder list + detail panes; "Push from local" and
      "Pull to local" buttons disabled with TODO badges; empty state copy
- [ ] **Team Members** — placeholder list + detail; "Publish from local"
      and "Adopt locally" disabled with TODO badges; empty state
- [ ] **Spells** — placeholder list + inline preview; "Publish" / "Install"
      disabled with TODO; empty state
- [ ] **Members** column (right) — same as v1 ship + a stubbed "+ Invite"
      button (opens a modal with placeholder text)
- [ ] All four sub-rail sections compose with the existing Esc / Back
      shortcuts
- [ ] Type-check + vitest pass

The actual data wiring (Firestore subscriptions, push/pull RPCs, conflict
UX) is the next task and is *out of scope here*.

---

## 11. Out of scope (future tasks)

- Realtime presence
- DMs / threads
- Reactions / mentions / attachments
- Update streaming for pulled tasks (auto-sync)
- Cross-project task push (push from any local project, not just active)
- Spell categories / tags / search
- Member moderation (kick, ban, mute)
- Rich-text composer
- Drag-and-drop tasks across columns
- Multi-window (open Space in separate Tauri window)

---

## 12. File layout (new files this task adds)

```
maestro-ui/src/components/space-window/
├── SpaceSubRail.tsx                left-edge sub-rail
├── sections/
│   ├── ChannelsSection.tsx         existing left+stream pair, wrapped
│   ├── TasksSection.tsx            list + detail
│   ├── TeamMembersSection.tsx      list + detail
│   └── SpellsSection.tsx           list + inline preview
├── shared/
│   ├── PushFromLocalButton.tsx     stubbed CTA
│   ├── AdoptToLocalButton.tsx      stubbed CTA
│   └── EmptySectionState.tsx       reusable empty state
└── modals/
    └── InviteMemberModal.tsx       stubbed invite flow
```

Existing files modified:
- `SpaceWindow.tsx` — render sub-rail + branch on `spaceActiveSection`
- `useUIStore.ts` — add `spaceActiveSection` state
- `styles-space-window.css` — sub-rail + section styles
