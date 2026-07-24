# Maestro Collab V2 — UI/UX Design Brief (for Claude Design)

**Status:** Design brief — hand to the design/implementation pass as the master prompt
**Date:** 2026-07-23
**Backend contract:** `COLLAB_V2_ENTITY_GRAPH_DESIGN.md` (entity graph on Postgres/Supabase)
**Scope of this doc:** the LOGICAL UI/UX — structure, views, composition, interactions,
states. Visual styling (glass theme etc.) is the designer's canvas; this doc constrains
*what exists and how it behaves*, not how it's painted.

---

## 0. Context you need (self-contained model summary)

Maestro Collab is a collaboration workspace shared by **humans and AI agents**. The
backend is an **entity graph**. Everything is one of a small set of first-class
entities, and every entity has the same four universal capabilities:

**Entity kinds:** `channel`, `task`, `doc`, `file`, `message`, `member` (a human in
this space), `team_member` (an agent persona owned by a member), `spell`, `skill`,
`pull_request`, `commit`.

**The four universal capabilities (every entity, no exceptions):**
1. **Hierarchy (vertical axis).** Every entity has an optional same-kind parent and
   ordered same-kind children. Task trees, doc chapters, team-member org trees, message
   threads — all the same mechanism. A subtree is a self-contained context unit.
2. **Edges (horizontal axis).** Typed relations to any entity:
   `assigned_to`, `attached_to`, `tracks` (task→PR/commit), `depends_on` (any→any,
   with hard/soft blocking and kind-aware resolution), `pulled` (someone took it into
   their local maestro), `working_on`, `completed_by`, `equips` (spells/skills),
   `copy_of`, `relates_to`, plus free-form `x:*` types. Edges are queryable in both
   directions.
3. **Discussion.** Messages are entities that *anchor* to any entity. Channel chat,
   task comments, doc reviews, a member's wall — all the same Message, threaded via
   hierarchy. One shape.
4. **Reactions & points.** Like/dislike/star (one per person per entity) on anything.
   Points: anyone can grant points to any entity (accumulating pool). Completing a task
   with tagged completers awards its pool to them → per-member scores, leaderboards.

**Other facts the UI must reflect:**
- `version` (content changed) and `activity_at` (discussion/links moved) are separate
  signals. Pulled entities pin a version → **staleness** is known per puller.
- `work_status` on tasks: open → pulled → working → in_review → done (+ blocked,
  cancelled). Acceptance criteria are check-off items on the task.
- **Tasks are multi-axis:** each space has named classification axes — a seeded
  *default* axis `type: code|design|review|test|default` plus team-defined *manual*
  axes (platform, milestone, area…). A task holds one value per axis. All axes are
  equal citizens in the UI: any board/filter/group-by can use any axis; axis
  management lives in space settings.
- Agents act *as themselves*: a `team_member` authors messages/edges under its own
  identity (owned by a human member). The UI must always distinguish agent vs human
  actors while treating them as peers.
- Realtime everywhere (Supabase): live messages, presence, entity updates.
- Deferred-but-planned (design the slots, don't build the guts): search everywhere,
  unread read-marks, activity feed, private visibility, approval verdicts
  (`COLLAB_V2_GAPS_AND_EXTENSIONS.md`).

---

## 1. Mission

Design a collaboration workspace where **the graph is the UI**: every entity is a
component, every edge is a navigation, every container is a composition. It must feel
as fluid as Slack for talk, as structured as Linear for work, as composable as Notion
for knowledge — without being three separate apps. Humans plan and review; agents pull,
work, and report — in the same rooms, on the same objects.

**The one-sentence product:** *a space where you can drop anything next to anything,
talk about everything where it lives, and always see how it all connects.*

## 2. Design principles

1. **Entity = component.** One component system renders every kind at four zoom levels
   (§3). If a designer invents a surface that can't be built from entity components +
   collection views, it's wrong.
2. **Two axes, always visible.** Vertical = where does this live (breadcrumb up,
   children down). Horizontal = what does this connect to (edges rail). Every detail
   surface shows both.
3. **Freedom with structure.** Anything can be placed into anything (drag/drop, link,
   embed) — but placement always *means* something explicit: an edge of a visible type,
   a parent change, or an embed message. No mystery relationships.
4. **Talk where the work is.** Never send users "somewhere else" to discuss. Every
   entity carries its thread inline. Channels are just entities whose primary content
   *is* the thread.
5. **Peers with provenance.** Agents and humans share every surface; authorship is
   always visibly typed (agent chip vs human chip) and never buried.
6. **Zoom, don't navigate (mostly).** Prefer in-place expansion — peek panels, stacked
   panels, splits — over full page swaps. Full routes exist for deep work (doc editing,
   big boards, graph canvas).
7. **Live by default.** Presence, typing, working-status, unread, staleness — the space
   should feel inhabited, especially by agents at work.

## 3. The Entity Component Contract

Every kind implements the same four zoom levels. This is the heart of the system —
design these once, parameterize by kind.

### Z1 — Chip (inline token)
Kind icon + name + state tint. Used in: message text (mentions, refs), edge rails,
breadcrumbs, board cells, composer autocompletes.
Interactions: hover → mini-preview (Z2 popover); click → open panel (Z3); drag →
place/link anywhere (§6).

### Z2 — Card (summary tile)
Chip + 2–4 kind-specific summary fields + universal footer (reaction counts, points,
message count, key edge chips, actor avatars). Used in: collection views (boards,
lists, galleries), channel embeds/unfurls, graph-canvas nodes, hover previews.
Kind specifics: task → status, type, assignees, dep/blocked badge; doc → excerpt,
child-count; member/team_member → role, live status; PR → repo#, state; message →
author + body preview; channel → topic, unread, last activity.

### Z3 — Panel (the workhorse detail view)
A column (~420–560px) that opens in the **panel stack** (§5). Uniform anatomy:
1. **Header:** breadcrumb (hierarchy ancestors, clickable), kind icon, title (inline
   editable), work/status control, overflow menu (copy link, copy to space, watch,
   delete).
2. **Action bar:** react (👍 👎 ⭐), grant points, **Link** (edge composer, §6.2),
   **Add child**, Pull (where meaningful), kind-specific primaries (task: status/
   complete; PR: refresh; doc: open full).
3. **Body tabs — universal set, same order everywhere:**
   - **Content** (kind-specific: task fields + acceptance criteria; doc preview;
     TM identity/memories/model; PR status detail; channel = its feed)
   - **Discussion** (the universal thread component, §4.1)
   - **Connections** (edges rail grouped by type + hierarchy children list — the two
     axes, §4.2)
   - **Activity** (activity feed scoped to entity + version history with diff/restore)
4. **Footer:** presence (who's viewing), created-by chip, version + last activity.

### Z4 — Full view (immersive route)
Panel promoted to full screen with room-demanding layouts: doc = reader/editor with
chapter tree sidebar + margin threads; channel = full hub (§7); task = subtree board +
dependency mini-graph; member/TM = profile page. Every panel has "expand ⤢"; every full
view can collapse back to a panel. URL-addressable (`/s/{space}/e/{entityId}`).

## 4. Universal subsystems (design once, appear everywhere)

### 4.1 Thread (Discussion) component
One component renders every conversation: channel feed, task comments, doc review,
member wall. Features: real-time; replies as collapsible sub-threads (messages are
hierarchical); @mentions of members AND team_members AND entity refs (# for entities —
inserts chips); attachments (files) and **entity embeds** (drop a chip into the
composer → embedded Z2 card in the message); reactions on messages; edit/soft-delete;
unread line + jump-to-unread; per-anchor unread badge.
Agent messages: visually distinct (agent chip + persona avatar + subtle rail tint) but
in-flow — never ghettoized. Progress reports from agents ARE messages here.

### 4.2 Connections rail (edges + hierarchy)
The graph, made tactile. Two stacked sections:
- **Hierarchy:** parent chip (up), ordered children cards (down) with add/reorder/drag
  in-out (reparent). "Open as tree/board" affordance for big families.
- **Edges, grouped by type with direction labels:** "Assigned to", "Tracks",
  "Depends on ⚠ (2 unresolved)", "Attached", "Pulled by", "Related", custom `x:` groups.
  Each item = chip/card; hover previews; click hops (panel stacks). Inline "+" per
  group; remove on hover. Depends-on group shows resolution state per item and a
  "blocked" rollup.
This rail is how users *feel* the graph without ever seeing the word "graph".

### 4.3 Reaction & points bar
Compact universal footer/bar: 👍/👎 (mutually exclusive), ⭐ star, and a **points
control** (tap = +1, hold/long-press = choose amount; shows pool total + top granters
on hover). Full identical behavior on every entity, including messages.

### 4.4 Command palette (⌘K) — the graph's front door
Universal search (entities by kind/title/content once search ships) + actions
("create task in…", "link A → B", "go to…", "pull…"). Context-aware: opened on a panel,
actions apply to that entity. This is also the keyboard path for EVERY edge/hierarchy
operation the mouse can do.

### 4.5 Presence & live-work layer
Avatars-on-entity (viewing now); typing in threads; and the marquee: **agents at
work** — a team_member chip anywhere shows a live pulse when it has an active
`working_on` edge, with hover → "working on {task chip} since {t}". Channel/task lists
surface "🤖 2 working" aggregates.

### 4.6 Staleness & blocked indicators
- Pulled entities show, per puller, "v7 pinned · content v9 → stale" and a softer
  "discussion moved since pull". One-click re-pull (re-render context).
- Tasks with unresolved hard deps: blocked badge + "waiting on {chips}"; auto-clears
  with a satisfying unblock moment (activity + notification).

## 5. Navigation architecture

```
Space switcher (far-left icon rail: spaces + inbox + home)
└─ Left rail (per space):  Home · Channels(tree) · Tasks · Docs · Team · Tracking · Graph · Leaderboard
   └─ Center: current PRIMARY view (a full view or collection view)
      └─ Panel stack (right): peek/stacked Z3 panels navigated from anywhere
         └─ Any panel → pin to split | promote to full (becomes primary)
```

- **Panel stack behavior (Linear/Notion-peek hybrid):** clicking a chip/card opens a
  panel over the right edge; clicking a chip *inside* it stacks another (breadcrumbed,
  swipe/⌫ to pop). Pin (📌) docks a panel as a persistent split — supports 2–3 splits,
  e.g. channel feed + task panel + doc panel side by side. This IS the modular-UI
  promise: entity components composing the workspace live.
- **Everything is a URL:** space, view, entity, even a stack state (primary + panels).
  Back/forward = graph browsing history.
- **Left-rail sections are just saved collection views** (§6.1) — Tasks/Docs/Team/
  Tracking are not bespoke pages; they're the collection system pointed at a kind.

## 6. Composition mechanics (the "full freedom, still structured" rules)

### 6.1 Collection View — one system for every list of entities
`CollectionView(query, layout, groupBy, sortBy)` where query = kind(s) + filters
(status, any task axis, assignee, edge-predicates like "attached_to this channel",
subtree-of) and groupBy accepts status, assignee, or **any axis** (default or manual —
the UI never special-cases one axis over another).
**Layouts:** List · Board (group columns) · Tree (hierarchy) · Feed (activity order) ·
Gallery (Z2 grid) · **Graph** (§8). Users can switch layout on ANY collection, save
views (name + share to space), and every collection cell is the same Z2 card.
Powers: rail sections, channel tabs, search results, "children" views, my-work — all
of it. Build once.

### 6.2 Placing & linking (drag/drop grammar)
Dragging a chip/card onto a target always resolves to an explicit, previewed meaning
(ghost label before drop):
- onto a **channel** (feed or its shelf) → `attached_to` edge + optional embed message
- onto a **task** → `attached_to` (docs/files/spells) or `assigned_to` (member/TM) or
  `depends_on` (another task, via drop-zones: "attach | depend | subtask")
- onto a **member/TM** → `assigned_to` (from a task) etc.
- onto a **parent-zone** of a same-kind entity → reparent (hierarchy move)
- into a **composer** → embed in message
Ambiguity → tiny drop menu (2–3 options max). Every drop is undoable and appears in
activity. The **Link button + palette** is the exact keyboard equivalent.

### 6.3 Entity creation
"+" is everywhere and context-seeded: from a channel (creates + attaches), from a
parent (creates as child), from a message ("promote to task" — creates task,
`relates_to` the message, quotes it), from the palette. Creation modal = Z3 content
tab fields only; everything else attaches after.

## 7. Channels, reimagined: from chat room to HUB

A channel is an entity whose content is a feed — but with edges, it becomes a
**workspace hub**: the team drops tasks, docs, team members, PRs into it.

**Channel full view (Z4) anatomy:**
- **Header:** name, topic, members+agents present, unread state.
- **Tab strip — Feed + auto-tabs:** tabs appear automatically for whatever is linked:
  *Tasks* (CollectionView: tasks attached_to this channel — default Board), *Docs*
  (gallery/list), *Team* (members+TMs attached — with live work status), *PRs*
  (tracking list), custom saved views. Empty kinds = no tab (no clutter). This makes a
  channel scale from pure chat → full project room with zero configuration.
- **Feed:** the Thread component. Entity drops render as embedded cards inline
  (living cards — a task embed shows live status; completing it updates in place).
  System/activity events (task completed, PR merged, member joined) appear as compact
  feed items (collapsible, distinct from human/agent speech).
- **Shelf (pinned):** a horizontal strip of pinned entity cards under the header — the
  channel's "important things" (the spec doc, the milestone task, the on-call agent).
  Pin = edge prop.
- Channel hierarchy: channels nest (groups/sub-channels) via the same parent mechanism;
  left-rail renders the tree.

**The point:** "put tasks and team members into a channel" is not a special feature —
it's `attached_to` edges + auto-tabs + embeds. Structure emerges from links.

## 8. Graph canvas (the showcase view)

A full view rendering any collection as an actual graph: entities = Z2 cards (nodes),
edges = typed, labeled, directional lines; hierarchy = containment (collapsible
clusters) or vertical lanes — keep the two axes visually distinct (e.g. containment
boxes for hierarchy, drawn lines for edges).
Features: filter by kinds + edge types; focus mode (this entity + N hops); dependency
mode (topological left-to-right, blocked = red path); click node → panel stacks (canvas
stays); drag between nodes → create edge (type picker); layout persistence per saved
view. Reuse: xyflow + dagre exist in the codebase.
This view must be genuinely useful (dependency untangling, onboarding "how does this
space fit together"), not a demo toy.

## 9. View catalog (what ships, composed from the above)

| View | Composition | Notes |
|------|-------------|-------|
| **Home ("My Work")** | 3 collections: *Ready to pull* (open, unblocked, assigned-to-me-or-my-agents), *In flight* (pulled/working by me/my agents, with staleness), *Needs me* (in_review, approval-requested, mentions) + compact space activity feed | The daily driver. Agents' work appears under their owner with attribution. |
| **Inbox** | Notification items (mentions, assignments, awards, unblocks, approvals) with read state; click → panel | Cross-space at the far-left rail level. |
| **Channels** | Rail tree + channel hubs (§7) | Default channel = space general. |
| **Tasks** | CollectionView over tasks: Board (columns = status, assignee, or any axis) · Tree · List · Graph(dependency); axis pivot switcher is one click | Board cards show blocked/agent-working badges + axis value chips. Bulk select → bulk edge/axis ops. |
| **Docs** | CollectionView (gallery/tree) → Z4 reader/editor: chapter tree (children), margin threads (anchored messages), version history, "split to child docs" action | Versioned artifact + discussion; NO live co-editing (non-goal). |
| **Team** | Members grid; member profile (Z4): wall (thread), their team_member tree (org chart of personas), their work, their score; TM profile: identity, memories, equipped spells/skills, work history | Org-chart uses hierarchy tree layout. |
| **Tracking** | PRs/commits list with task chips, state, refresh; stale-fetch indicator | v1 is manual-link; design the slot for live webhook states. |
| **Graph** | §8 | |
| **Leaderboard** | Member scores (ledger sums), recent awards feed, per-task award breakdowns | Tasteful, not casino. Completion award = brief celebratory moment on the task + feed item. |
| **Space settings** | Members/roles, invites (link/code), space profile | Existing v1 parity. |

## 10. Golden workflows (design these end-to-end, they are the acceptance tests)

1. **Author & stage:** human creates task in a channel context (auto-attached),
   sets type/acceptance criteria, drags in a design doc (attach), drags onto an agent
   TM (assign), grants 20 points (bounty). Everything visible on the task's
   Connections rail; channel gets a feed embed.
2. **Agent pulls & works:** agent pulls (CLI) → task shows "pulled by 🤖 Forge · v3
   pinned", then live "working". Its progress messages land in the task thread —
   visible in the channel embed too. Human replies with a correction mid-flight; agent
   (via CLI) reads and acknowledges in-thread.
3. **Ship & review:** agent links PR (`tracks` edge appears, PR entity card on rail),
   sets in_review. Reviewer opens task panel + PR panel side-by-side (pinned splits),
   discusses in-thread, stars the work, hits **Complete** → tags completers (agent +
   human pair) → points award moment → leaderboard/feed update → unblock ripple to
   dependent tasks (badges clear, notifications fire).
4. **Knowledge grows:** during review someone promotes a thread message to a doc
   ("promote to doc" — like promote-to-task); doc lands as child of the spec doc,
   `relates_to` the message; searchable, linkable forever.
5. **Orient a newcomer:** new member joins → Home explains itself; opens Graph focus
   on the milestone task → sees the subtree, deps, people, docs; joins the channel and
   reads pinned shelf. Zero tribal knowledge needed.

## 11. States & edge cases (must be designed, not defaulted)

- **Empty states** for every collection ("no tasks linked yet — drag one here or ⌘K")
  — teach the grammar in-place.
- **Loading:** skeleton Z2 cards; panels never blank-flash.
- **Deleted (soft):** tombstone chips ("deleted task") in threads/rails — history
  keeps shape.
- **Stale projection**, **blocked task**, **conflict-free by design** (edits are
  last-write-wins on distinct fields; show "edited by X just now" toasts rather than
  merge dialogs).
- **Offline/degraded:** read-only cached views + queued messages with clear pending
  state.
- **Permissions:** v1 is space-visible-everything; design chrome to tolerate a future
  `restricted` badge (A4) without layout change.
- **Scale:** channels with 10k messages (virtualized thread), tasks with 200 children
  (paged tree), rails with 50 edges (grouped + "show all").

## 12. Non-goals (do not design)

Live co-edited docs (CRDT), per-entity ACL matrices, external integrations UI beyond
GitHub links, mobile layouts (separate pass; keep components mobile-decomposable),
theming beyond the existing maestro design language.

## 13. Deliverables expected from the design pass

1. Component spec for the Entity Component Contract (Z1–Z4 per kind; shared chrome).
2. The five universal subsystems (§4) as standalone specs.
3. Layout/navigation spec (rails, panel stack, splits, routes).
4. Each view in §9 as a screen spec composed FROM those components.
5. The drag/drop grammar (§6.2) as an interaction table (source × target → meaning).
6. Golden-workflow walkthroughs (§10) as annotated flows.
7. State inventory (§11) per component.

Design maxim to carry throughout: **if it can't be composed from entity components,
collection views, and the two axes — it doesn't belong in this product.**
