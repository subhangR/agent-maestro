# 01 — Information Architecture

## Where collaboration lives in the app

Maestro's shell has a **left icon rail** (primary nav), a **left panel** (contextual lists), a **center workspace** (terminals / boards / windows), and a **spaces rail** (quick-switch strip for open surfaces). Collaboration plugs into all four:

```
┌─ Icon Rail ─┬─ Left Panel ───────────┬─ Center Workspace ──────────────┬─ Spaces Rail ─┐
│  Tasks      │                        │                                 │   [terminals] │
│  Members    │  (contextual to the    │   (terminals, whiteboards,      │   [boards]    │
│  Teams      │   selected rail item)   │    docs, and the SPACE WINDOW)  │   ───────     │
│  Skills     │                        │                                 │   [B] space   │
│  Lists      │   → COLLAB SPACE PANEL  │   → SPACE WINDOW (full)         │   [F] space   │
│  Graphs     │     when "Collab" is    │     when a space is opened      │   [M] space   │
│  Files      │     selected            │                                 │               │
│ ▸ Collab ◂  │                        │                                 │               │
└─────────────┴────────────────────────┴─────────────────────────────────┴───────────────┘
```

## Three entry points into collaboration

1. **Icon Rail → "Collab Space"** (globe icon). Opens the **Collab Space Panel** in the left panel — the home base: sign-in, repo detection, your spaces, discover spaces, create space.
2. **Spaces Rail → space avatars.** Each joined space shows as a small circular avatar at the bottom of the spaces rail. Click → opens that **Space Window** in the center workspace.
3. **Share actions elsewhere.** "Share" buttons on local tasks and team-members open the **Share-to-Space Modal** directly, without first visiting the Collab panel.

## The two homes: Panel vs. Window

- **Collab Space Panel** (narrow, left) = *account + directory*. Auth, which repo you're on, your spaces, public spaces to join, create. It's the lobby.
- **Space Window** (wide, center) = *inside a space*. Chat, tasks, team members, spells, members, settings. It's the room.

A third surface type is **modals** (create space, invite, push/publish, share-to-space, create channel), which overlay either home.

## Full surface map

```
COLLAB (icon rail)
│
├── Collab Space Panel [left panel]                         ← the lobby
│   ├── Not-configured state
│   ├── Loading state
│   ├── Sign-in view
│   │     ├── Continue with Google
│   │     └── Email / password (sign in ↔ create account)
│   └── Signed-in view
│         ├── Account header (identity, sign out)
│         ├── Repo context (detected git remote / set manually)
│         ├── Your Spaces (list → opens Space Window)
│         ├── Discover / Public Spaces (list → Join → Space Window)
│         └── + Create Space  → [Create Space Modal]
│
├── Space Window [center workspace, or full screen]         ← inside a space
│   ├── Chrome (space name · repo · settings)
│   ├── Top Tabs: Messages · Tasks · Team Members · Spells · Members · Settings
│   ├── Messages tab
│   │     ├── Channel list (multi-channel) + [+ Create Channel modal]
│   │     ├── Message stream (bubbles, grouping, edit/delete, threads*)
│   │     └── Composer (text, attach*, @mention*, emoji*)
│   ├── Tasks tab      → shared task list, search/filter, [+ Push], pull, provenance
│   ├── Team tab       → shared agent list, search, [+ Publish], adopt
│   ├── Spells tab     → shared spell list, search, [+ Publish], install, preview
│   ├── Members tab    → roster (grouped by presence*), [+ Invite modal], per-member menu
│   └── Settings tab   → general, invite, admins, danger zone
│
├── Modals (overlay any home)
│   ├── Create Space
│   ├── Create Channel
│   ├── Invite Member (link now; email* + requests* future)
│   ├── Push Tasks (local → space)
│   ├── Publish Team Member (local → space)
│   ├── Publish Spell (local → space)
│   └── Share-to-Space (from a local entity → pick space)
│
└── Cross-app affordances
    ├── Spaces-rail avatars (open a space)
    ├── "Share" buttons on local Task rows and Team-member rows
    ├── Unread badges on rail avatars + channels*     (* full-vision)
    └── Notification toasts + push*                    (* full-vision)
```
`*` = full-vision / not yet built (see `08-FULL-VISION-ROADMAP.md`).

## Navigation rules

- **Signed-out** anywhere in collab → the surface shows the calm sign-in view or a "sign in to collaborate" prompt; never an error.
- **Not a member** of a space you opened → Space Window shows a "join to enter" empty state, not the tabs.
- **Opening a space** sets it as the active center-workspace surface and highlights its spaces-rail avatar. `Esc` / back returns to the prior workspace view.
- **Settings** is both a top tab and reachable via the chrome gear.
- **Repo scoping** governs discovery: the Collab Panel only shows spaces matching the *current project's* git remote. Switching projects switches which spaces you see.

## Responsive / layout targets

Primary target is **desktop** (Tauri app, wide). The same React UI also runs as a **web app on phones** (see `09-VISUAL-DESIGN-DIRECTION.md`), so every surface needs a **narrow/mobile reflow**:
- Space Window's 3-column layout (channels | stream | members) collapses to a single column with the channel list and members behind toggles.
- Modals become full-screen sheets.
- Top tabs may become a scrollable strip or a bottom bar on mobile.
