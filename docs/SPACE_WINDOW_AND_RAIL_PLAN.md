# Per-Space Rail Icons + Full-Window Space Layout — Implementation Plan

Plan for two coupled changes that together establish how users *enter and inhabit* a Collab Space:

1. **Rail addition** — every Space the signed-in user is a member of appears as an icon at the bottom of the left icon rail (first-letter-in-a-circle, Discord-style).
2. **Full-window Space layout** — clicking any of those rail icons takes over the entire app view with a brand-new, chat-stream-oriented Space layout that fully replaces the existing in-panel `CollabSpaceDetail`.

The existing **Collab** tab in the rail stays — it remains the management surface for browsing public spaces, creating, and joining. But the *detail / inhabit* experience moves to the new full-window view.

---

## Decisions (confirmed)

| Question | Answer |
|---|---|
| One layout or two? | **One** — full-window replaces the in-panel detail entirely. |
| Rail icon style | First letter of the Space name in a colored circle. |
| Which spaces show in the rail? | All joined spaces, across all repos (global, like Slack workspaces). |
| Ordering | Last-joined first (epoch from `members.{uid}.joinedAt`). |
| Layout takeover scope | **Full**: hides project chrome / sessions / left panel while a Space is open. |
| Exit | Clicking any other rail icon (Maestro section) switches back to Maestro view. Plus an explicit "Back to Maestro" affordance in the Space chrome. |
| Multi-window | Single window for v1. |

---

## 1. Architecture Overview

Three composing pieces:

### a. Global app view-mode state

Add to `useUIStore`:

```ts
type AppView = { kind: 'maestro' } | { kind: 'space'; spaceId: string };

interface UIState {
  appView: AppView;
  setAppView: (v: AppView) => void;
}
```

When `appView.kind === 'space'`, render `<SpaceWindow spaceId={...}/>` at the top of the app tree instead of the normal Maestro layout. When the user clicks any *Maestro* rail icon (tasks/members/teams/skills/lists/graphs/files/collab), `setAppView({ kind: 'maestro' })` runs first, then the section selection.

### b. Rail extension (`IconRail.tsx`)

Two visual zones in the rail, separated by `iconRailSpacer`:

```
┌─────┐
│  T  │  Tasks
│  M  │  Members
│  …  │  (other Maestro sections)
│  C  │  Collab (management — list/discover)
├─────┤  ← spacer
│  ●  │  Space "Backend" (joined)
│  ●  │  Space "Design" (joined)
│  ●  │  Space "OSS Help" (joined)
└─────┘
```

The bottom zone is dynamic — driven by a global subscription to "all spaces where I'm a member."

### c. Full-window layout (`SpaceWindow.tsx`)

Brand-new component tree mounted under `maestro-ui/src/components/space-window/`. Stream-oriented chat-first layout (the messaging system from the sibling task is the centerpiece).

```
┌─ SpaceWindow Chrome ───────────────────────────────────┐
│ ← Back to Maestro    Backend Squad    [⚙ settings]    │
├─────────┬─────────────────────────────────┬────────────┤
│         │                                   │            │
│ # gen   │  ChannelHeader                    │ Members    │
│ # api   │ ───────────────────────────       │ ● Subhang  │
│ # rand  │  Stream of messages               │ ● Manzil   │
│         │  ...                              │ ○ Priya    │
│ + new   │                                   │            │
│         │  [composer textarea]   [Send]    │ + invite   │
└─────────┴───────────────────────────────────┴────────────┘
```

Three columns:
- **Left**: channels list (with `+ create channel`)
- **Center**: stream — channel header, message timeline, composer
- **Right**: members panel + (later) tasks list + docs

The center is messaging-centric. When the messaging task lands, its `<MessagesPane/>` and `<MessageComposer/>` slot into the center column. `<ChannelList/>` slots into the left column.

---

## 2. New Files

```
maestro-ui/src/components/space-window/
├── SpaceWindow.tsx              full-window shell
├── SpaceWindowChrome.tsx        top bar (back, name, settings)
├── SpaceChannelsColumn.tsx      left column wrapper
├── SpaceStreamColumn.tsx        center column (consumes messaging components)
├── SpaceMembersColumn.tsx       right column
└── SpaceWindowEmpty.tsx         loading / not-a-member states

maestro-ui/src/components/SpaceRailSection.tsx
        bottom-of-rail section listing joined spaces

maestro-ui/src/styles-space-window.css
maestro-ui/src/stores/useJoinedSpacesStore.ts   global subscription to my spaces
```

## 3. Modified Files

| File | Change |
|---|---|
| `maestro-ui/src/stores/useUIStore.ts` | add `appView` + `setAppView` |
| `maestro-ui/src/components/IconRail.tsx` | render bottom `<SpaceRailSection/>` after spacer |
| `maestro-ui/src/components/AppLeftPanel.tsx` | reset `appView` to `maestro` on Maestro section click |
| `maestro-ui/src/App.tsx` (or main shell) | branch on `appView.kind`: render `SpaceWindow` or normal Maestro layout |
| `maestro-ui/src/components/maestro/CollabSpaceDetail.tsx` | **delete** — replaced by `SpaceWindow` |
| `maestro-ui/src/components/maestro/CollabSpacePanel.tsx` | remove the `if (activeSpaceId) return <CollabSpaceDetail/>` branch; instead, clicking a row calls `setAppView({kind:'space', spaceId})` |
| `maestro-ui/src/stores/useCollabSpaceStore.ts` | remove `enterSpace`/`exitSpace`/`activeSpaceId` (logic moves to `appView`); keep `subscribeToSpace` and reuse for the active space window |
| `maestro-ui/src/styles.css` | `@import './styles-space-window.css';` |

---

## 4. Joined Spaces Subscription

`useJoinedSpacesStore.ts` — a small global store that subscribes to:

```ts
query(
  collection(db, 'collabSpaces'),
  where('memberIds', 'array-contains', user.uid),
  orderBy('createdAt', 'desc'),
)
```

(May need a composite index: `memberIds (array-contains) + createdAt`.)

State:
```ts
interface JoinedSpacesState {
  spaces: CollabSpace[];           // user's joined spaces, all repos
  loading: boolean;
  unsub: Unsubscribe | null;
  start: () => void;               // call once after auth
  stop: () => void;
}
```

`start()` runs once when the user becomes signed-in (driven from a `useEffect` near the auth boundary). Re-runs when the uid changes. `stop()` runs on sign-out.

The rail icons render from `spaces`, sorted by each user's own `members[uid].joinedAt` (descending).

---

## 5. App-Level View Switching

Pseudocode for the shell:

```tsx
const appView = useUIStore(s => s.appView);

if (appView.kind === 'space') {
  return <SpaceWindow spaceId={appView.spaceId} />;
}
return <NormalMaestroLayout />;
```

This sits **above** the project tabs and the existing chrome — when a Space is open, none of that renders. Going back is one of:

1. Click any Maestro section icon in the rail → `setAppView({kind:'maestro'})`
2. Click "← Back to Maestro" in `SpaceWindowChrome`

Project state is preserved (the project tabs and active session don't unmount; they're just not rendered while the Space window is up).

---

## 6. Rail Icon Visuals

Per-space rail icon: 32px square (matching the existing `iconRailButton`), with:

- A circle background filled with a deterministic color derived from the space id (HSL hash → consistent color)
- The first uppercase letter of the space name centered, bold, in white or contrasting color
- Active indicator (`iconRailActiveIndicator--right`) when this space is the current `appView`
- Tooltip on hover: full space name + repo

Future: replace letter with the GitHub repo owner's avatar (deferred; needs `api.github.com` fetch + caching).

---

## 7. Acceptance Criteria

- [ ] After signing in, all joined spaces appear at the bottom of the left rail in real-time (new joins / leaves update without refresh).
- [ ] Each space icon shows the first letter of its name on a deterministic color.
- [ ] Active space icon shows the active indicator.
- [ ] Clicking a space rail icon opens `SpaceWindow` and hides all other Maestro chrome (project tabs, sessions, panels).
- [ ] `SpaceWindow` renders three columns: channels (left), stream (center), members (right).
- [ ] Clicking any Maestro rail icon while in a Space window returns to the Maestro view with the previously active section.
- [ ] "← Back to Maestro" link in the Space chrome also returns.
- [ ] In-panel `CollabSpaceDetail.tsx` is removed. Clicking a row in the Collab tab list now opens the full-window layout (not the panel detail).
- [ ] The Collab tab still works for browsing public spaces, creating, and joining.
- [ ] Rail icon list survives navigation between projects (it's user-scoped, not project-scoped).

---

## 8. Out of Scope (deferred)

- Drag-to-reorder spaces in the rail
- Unread badges on rail icons
- Multi-window (open Space in separate Tauri window)
- GitHub avatar instead of first-letter
- Rail icon overflow / scrolling beyond N spaces
- Settings UI for the Space (rename, delete, manage members) — just stub the gear icon
- Tasks panel and Docs panel content in the right column — placeholder for the push/pull task pipeline

---

## 9. Dependencies

- **Soft-depends on**: the messaging task (`task_1777443179374_wiyrjhfrw`). The `SpaceStreamColumn` consumes `<MessagesPane/>` and `<MessageComposer/>` from messaging. Strategy: build messaging components as reusable, framework-agnostic pieces (no panel-specific layout assumptions) so they drop into `SpaceWindow` cleanly.
- **Hard-depends on**: existing auth + collab space discovery (already shipped).

If the messaging task hasn't landed yet when this lands, the center column shows a placeholder ("Messaging coming next") and the rest of the layout (chrome, channel sidebar shell, members) ships independently.

---

## 10. Subtask Breakdown (suggested PR sequence)

1. **Joined-spaces subscription** — `useJoinedSpacesStore`, subscribe on auth, unsubscribe on sign-out.
2. **`appView` state** — add to `useUIStore`, wire app shell to branch on it, ensure Maestro icon clicks reset it.
3. **`SpaceRailSection` + integrate into `IconRail`** — bottom-of-rail icons rendering joined spaces.
4. **`SpaceWindow` shell** — three-column layout with placeholder columns; `SpaceWindowChrome` with back link.
5. **Channels column** — channel list (uses messaging task's `ChannelList` if available, else placeholder).
6. **Stream column** — messaging integration (depends on messaging task) or placeholder.
7. **Members column** — extract members rendering from old `CollabSpaceDetail`; add invite stub.
8. **Kill in-panel detail** — delete `CollabSpaceDetail.tsx`; update `CollabSpacePanel` row click to switch `appView`; remove `enterSpace/exitSpace/activeSpaceId` from `useCollabSpaceStore`.
9. **Polish** — loading states, error states, transitions, keyboard shortcut to exit (Esc?).

---

## 11. Open Questions (none blocking)

1. Should there be a keyboard shortcut to switch between joined spaces (e.g. `Cmd+1..N` like Slack)? Defer.
2. Should the Maestro project context "follow" you into the Space window, or is the Space view fully project-agnostic? My read: project-agnostic — Spaces are user-scoped, not project-scoped. A user with one local project linked to two repos, both in spaces, sees both spaces in the rail.
3. Color palette for first-letter circles — pick from the existing theme variables or a fixed Slack-like palette? Defer to implementer.
