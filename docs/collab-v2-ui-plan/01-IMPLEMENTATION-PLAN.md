# Collab V2 UI — Full Implementation Plan (mock-data, contract-faithful)

**Goal:** implement the complete Modular Collab Workspace UI exactly as the design corpus
specifies — the Entity Component Contract (Z1–Z4), the five universal subsystems, the
panel-stack navigation, the collection system, all ten views, the drag/drop grammar, and
live behaviors — against a rich mock data layer that speaks the *real* UI data contract
(`COLLAB_V2_UI_DATA_CONTRACT.md`), so the backend can be swapped in later by replacing
one adapter, zero component changes.

**Design maxim enforced throughout:** if a surface can't be composed from entity
components + collection views + the two axes, it doesn't get built.

---

## Architecture in one picture

```
                         ┌─────────────────────────────────────────────┐
                         │  SCREENS (compose only — no bespoke logic)  │
                         │  Home · Tasks · Docs · Team · Tracking ·    │
                         │  Graph · Leaderboard · Channel Hub · Inbox ·│
                         │  Entity Z4 · Space Settings                 │
                         ├─────────────────────────────────────────────┤
                         │  SHELL: icon rail · left rail · center host │
                         │  · PANEL STACK (peek/stack/pin-split) · URL │
                         ├──────────────────┬──────────────────────────┤
                         │ COLLECTION SYSTEM│  UNIVERSAL SUBSYSTEMS    │
                         │ query+layout+    │  Thread · ConnectionsRail│
                         │ groupBy·6 layouts│  ReactionsPointsBar ·    │
                         │ (incl. Graph)    │  CommandPalette · Live   │
                         ├──────────────────┴──────────────────────────┤
                         │  ENTITY CONTRACT: Chip(Z1) Card(Z2)         │
                         │  Panel(Z3) FullView(Z4) — one system,       │
                         │  parameterized by the KIND REGISTRY         │
                         ├─────────────────────────────────────────────┤
                         │  STATE: graph store (normalized entities/   │
                         │  edges/counters) · workspace store (nav,    │
                         │  stack) · collection cache · presence store │
                         ├─────────────────────────────────────────────┤
                         │  DATA: CollabFacade interface (= UI data    │
                         │  contract) → MockFacade (seeded world,      │
                         │  mutations, undo, versions, WorkspaceEvent  │
                         │  emitter, agent SIMULATION driver)          │
                         └─────────────────────────────────────────────┘
```

Two hard rules that make it modular:
1. **Screens may only import from layers below.** No screen talks to the facade
   directly for entity rendering — everything renders through EntitySummary/EntityDetail.
2. **Kinds are data, not code paths.** One `KindRegistry` entry per kind (icon, tint,
   Z2 summary fields, Z3 content renderer, Z4 layout variant, primary actions, create
   form). Adding a kind = adding a registry entry. No `if (kind === 'task')` outside
   the registry.

---

## Layer 0 — Foundation (types, mock world, stores)

### 0.1 Contract types (`types.ts`)
Transcribe the DTOs from `COLLAB_V2_UI_DATA_CONTRACT.md` verbatim: `EntitySummary`,
`EntityState` (discriminated per kind), `EntityDetail`, `EntityContent`, `ActorSummary`,
`EntityCounters`, `EntityBadges`/`PullState`/`LiveWork`, `Hierarchy`, `Connections`/
`EdgeGroup`/`EdgeView`, `EntityCapabilities`, `Page<T>`, `ChannelTab`,
`CollectionQuery`/`CollectionResult`/`CollectionGroup`, `GraphQuery`/`GraphResult`,
`MessageView`, `ActivityItem`, `PresenceSnapshot`, `WorkspaceEvent`, command inputs +
`CommandResult` + typed errors (`invalid_input`, `forbidden`, `not_found`,
`version_conflict`). These are the law; components never see anything rawer.

### 0.2 CollabFacade interface
One TypeScript interface with every read/command from the contract's route matrix
(spaces/navigation, entity detail + lazy sections, collections/query, graph/query,
messages, activity, presence, inbox, leaderboard, task-axes, and all commands: create/
patch task, entities, move, edges, placements, messages, reaction, points, complete,
pull/work, tracking refresh, read-marks, saved views) plus `subscribe(spaceId, cb):
Unsubscribe` for `WorkspaceEvent`s. **This is the seam.** Real backend later = new class
implementing the same interface.

### 0.3 MockFacade + seeded world
- **Seed graph** mirroring and extending the prototype narrative: 1 space
  (`maestro-core`), 3 channels, the T-100 milestone subtree (T-101…T-108 incl.
  T-103a/b), 4-doc tree, 2 humans (Subhang, Mira), 3-agent org (Forge → Scout, Probe),
  2 PRs + commits, spells/skills equipped to Forge, points ledger history, reactions,
  read-marks, notifications, task axes (`type`, `milestone`) — every edge type in the
  taxonomy represented at least once (`assigned_to`, `depends_on` hard+soft,
  `attached_to`, `tracks`, `pulled` w/ pinnedVersion, `working_on`, `completed_by`,
  `equips`, `relates_to`, one `x:` custom).
- **Live semantics implemented in the mock**, not faked in components: version bumps on
  content writes, `activity_at` bumps on messages/edges, counter maintenance, blocked
  rollups from unresolved hard deps, PullState staleness computation, channel auto-tabs
  derivation, completion → award → leaderboard, unblock ripple when a dependency
  resolves, undo tokens for placements. Latency (~120–400ms) + optional error injection.
- **Simulation driver** (toggleable): scripted timeline that replays the golden
  narrative — Forge posts progress, Mira bumps the spec doc to v5, Forge's pin goes
  stale, Scout requests review, an award fires — emitted as `WorkspaceEvent`s so every
  live behavior (presence pulses, staleness badges, feed updates, board moves) is
  exercised without a backend.

### 0.4 Stores (Zustand 5, narrow selectors)
- `useGraphStore` — normalized: `entities: Record<id, EntitySummary>`, details cache,
  edges by src/dst, counters; applies `WorkspaceEvent` patches; optimistic mutation
  journal keyed by `clientMutationId` with reconcile/rollback.
- `useWorkspaceNavStore` — current space, view, entity route, **panel stack**
  (`{stack: PanelRef[], pinned: PanelRef[]}`), palette open-state, selection; serializes
  to/from the URL (hash-based; no router dep) so every state is addressable +
  back/forward works.
- `useCollectionStore` — query→result cache w/ cursors, saved views.
- `usePresenceStore` — viewers/typing/working per entity (fed by simulation).
- All action logic lives in store actions (testable without DOM).

### 0.5 Design system
Port the prototype's design language as the module's scoped tokens: paper/ink `--pn-*`
palette, Newsreader (serif display) + Hanken Grotesk (body) + JetBrains Mono (meta),
pill/status colors (green working, red blocked, blue review, amber stale), card
shadows, the avatar system (humans round, agents rounded-square). One `tokens.css` +
small primitives (`Pill`, `Avatar`, `Eyebrow`, `Kbd`, `IconBtn`). Status is always
color + word, never color alone.

**Exit criteria L0:** mock facade passes a contract test-suite (every read returns
contract-shaped data; every command mutates the world correctly incl. versions,
counters, staleness, blocked rollups, undo); stores replay a scripted event stream
correctly.

---

## Layer 1 — Entity Component Contract (the heart)

| Component | Spec |
|---|---|
| `KindRegistry` | Per-kind: icon, tint, chip label fn, Z2 summary fields renderer, Z3 Content-tab renderer, Z4 layout variant, primary actions, creation form schema. All 11 kinds + tombstone. |
| `EntityChip` (Z1) | icon + name + state tint; hover → Z2 popover (shared engine, one instance, delay/cancel logic); click → push panel; draggable (drag payload = entity ref). Mention/ref variant for inline text. |
| `EntityCard` (Z2) | chip row + 2–4 kind fields + universal footer (reactions, points, msg count, key edge chips, actor avatars) + badges (blocked ⚠, working ●, stale, restricted). THE cell for every collection, embed, and graph node. Skeleton variant. |
| `EntityPanel` (Z3) | uniform anatomy: ① header (breadcrumb, kind icon, inline-editable title, status control, overflow: copy link/copy to space/watch/delete) ② action bar (react, points, Link→edge composer, Add child, Pull where meaningful, kind primaries) ③ body tabs Content/Discussion/Connections/Activity — same order for every kind ④ footer (presence avatars, created-by, version + activity). |
| `EntityFullView` (Z4) | panel promoted to route; kind layout variants: doc=reader+chapter tree+margin threads, channel=hub, task=subtree board+dep mini-graph, member/TM=profile, generic fallback = prose + children grid. Expand ⤢ / collapse round-trips with the panel. |
| `Tombstone` | deleted chip/card that keeps history shape. |

**Exit criteria L1:** a storybook-style gallery page renders all 11 kinds × Z1/Z2/Z3
(+ skeleton + tombstone) from mock data; popover engine works; panel tabs switch.

---

## Layer 2 — Universal subsystems

1. **`Thread`** — one component for channel feed, task comments, doc margin threads,
   member wall: real-time append, replies as collapsible child-message subtrees,
   @member/@agent mentions + #entity refs (react-mentions → chips), drop-chip-to-embed
   (live Z2 card in the message), attachments, reactions on messages, edit/soft-delete
   (tombstone), unread line + jump-to-unread, AGENT-badged messages in-flow, composer
   with pending states. Feed variant (channel: system/activity items collapsed) vs
   comment variant (task/doc).
2. **`ConnectionsRail`** — hierarchy section (parent chip up, ordered children with
   add/reorder/drag-reparent, "open as tree/board") + edge groups by type with
   direction labels, per-item resolution (HARD ✓ / HARD ⚠), blocked rollup, hover
   previews, click-hops stack, inline "+" per group, remove on hover, `x:*` groups.
3. **`ReactionsPointsBar`** — 👍/👎 mutually exclusive, ⭐, points control (tap +1,
   hold → amount picker, hover → pool + top granters). Identical on every entity incl.
   messages.
4. **`CommandPalette` (⌘K)** — search entities by kind/title (mock search over seed),
   context-aware actions (create in…, link A→B w/ edge-type picker, go to, pull,
   status…); full keyboard path for every mouse operation; renders results as chips.
5. **Live layer** — presence avatars-on-entity, typing, working pulse (agent chip +
   hover "working on {task} since {t}"), "🤖 2 working" aggregates, staleness badge
   (`v3 pinned · v5 → stale` + one-click RE-PULL), blocked badge with waiting-on chips
   + unblock moment (badge clears + activity + toast).

**Exit criteria L2:** each subsystem drivable standalone on the gallery page against
the mock; thread handles 10k-message virtualization; rail handles 50-edge grouping.

---

## Layer 3 — Shell & navigation

- **Icon rail** (spaces + Inbox unread dot + home) · **Left rail** (space name, nav
  sections with badges, channel tree with unread; sections are saved collection views,
  not bespoke pages).
- **Panel stack**: click chip/card anywhere → Z3 peeks over right edge; chip inside a
  panel → stacks (breadcrumbed, ⌫/swipe pops); 📌 pin → docks as persistent split
  (2–3 splits max, e.g. feed + task + doc side-by-side); ⤢ promotes to Z4 (current
  center view becomes the back target).
- **URL-addressable everything**: `#/s/{space}/{view}` · `#/s/{space}/e/{entityId}` ·
  stack state encoded (primary + panels) → back/forward = graph browsing history.
- Keyboard map: ⌘K palette, ⌫ pop panel, g+t/g+d/g+h view jumps, arrows in collections.

**Exit criteria L3:** deep-link to any view/entity/stack state reproduces the layout;
back/forward walks history; 3-split pinning works.

---

## Layer 4 — Collection system

- **`CollectionView(query, layout, groupBy, sortBy)`** executing `CollectionQuery`
  against the facade: kinds + filters (status, any axis, assignee, edge-predicates,
  subtree-of, readyToPull) — **groupBy accepts any axis, default and manual axes
  indistinguishable**.
- **Six layouts**: List · Board (group columns, drag card between columns = the
  matching mutation with ghost preview) · Tree (hierarchy, expand/collapse, paged
  children, drag-reparent) · Feed (activity order) · Gallery (Z2 grid) · **Graph**.
- **`GraphCanvas`** (@xyflow/react + dagre): nodes = Z2 cards (kind-shaped), edges
  typed/labeled/directional; hierarchy = collapsible containment clusters (visually
  distinct from edges — dashed boxes vs drawn lines); subgraph switcher; filter by
  kinds/edge types; focus mode (entity + N hops); dependency mode (topological LTR,
  blocked = red path); hover dims non-neighborhood; click node → panel stacks (canvas
  stays); **drag node→node → edge composer**; layout persistence per saved view.
- Layout switcher on any collection; save view (name + share-to-space, persisted via
  facade); empty states that teach the grammar ("no tasks linked yet — drag one here
  or ⌘K").

**Exit criteria L4:** same query renders in all six layouts; board drag moves status;
tree drag reparents; graph dependency mode shows the blocked red path from the seed.

---

## Layer 5 — Screens (composition only)

| Screen | Composition |
|---|---|
| **Home (My Work)** | 3 CollectionViews (Ready-to-pull w/ PULL action, In-flight w/ staleness, Needs-me) + compact activity feed; agents' work attributed under owner. |
| **Tasks** | CollectionView, default Board; Tree/Board switcher; axis pivot chips (status/assignee/type/milestone/any manual); bulk select → bulk axis/edge ops. |
| **Docs** | Tree sidebar + Z4 reader (serif, chapter tree = children, margin threads = anchored Thread, version history list, "split to child docs"). |
| **Team** | Member cards (stats: points/done/agents) with nested agent org-tree rows (mode, model, live status, SPAWN affordance, empty state); profiles open Entity Z4 (member wall = Thread; TM: identity, memories, equipped via `equips` edges, work history). |
| **Tracking** | PR list (repo#, linked task chips, state, fetch freshness incl. stale, per-row + refresh-all) + commits list. Slot designed for live webhook states. |
| **Graph** | Full-page GraphCanvas with the 3 seeded subgraphs (V2 milestone dependency view, Spec-docs tree, Forge kit) + saved-view switcher. |
| **Leaderboard** | Score rows w/ bars (humans + agents), recent awards feed, per-task award breakdowns; completion celebration moment (tasteful). |
| **Channel Hub** | Header (topic, presence, working aggregate) + pinned Shelf (edge `props.pinned`) + auto-tabs (Feed + non-empty linked-kind tabs from facade projection) + Thread feed w/ living embeds + composer. |
| **Inbox** | Cross-space notification list (mentions, assignments, awards, unblocks, review requests) w/ read state; click → panel. |
| **Entity Z4** | The generic full view route (Layer 1) — reachable from every panel. |
| **Space settings** | Members/roles, invites, space profile, **task-axis management** (add/edit manual axes). |

**Exit criteria L5:** every screen reachable from the left rail, rendering purely from
facade data; no screen contains kind-conditionals or bespoke entity markup.

---

## Layer 6 — Interaction grammar (drag/drop, creation, undo)

- **@dnd-kit implementation of the grammar table** (single source of truth module:
  `source kind × target surface → meaning`): chip→channel = `attached_to` (+optional
  embed), doc/file/spell→task = attach, member/TM→task = assign, task→task = 3-zone
  drop menu (attach | depend | subtask), task→member = assign, chip→composer = embed,
  same-kind→parent-zone = reparent. **Ghost label previews the meaning before drop**;
  ambiguity → ≤3-option drop menu; every drop = one `placements` command → undoable
  (toast with Undo, uses facade undo token) + lands in Activity.
- **Creation flows**: context-seeded "+" (channel → create+attach; parent → child;
  palette), creation modal = Z3 Content fields only; **promote message → task/doc**
  (creates entity, `relates_to` message, quotes it).
- **Optimistic mutations** end-to-end: apply patch → pending state → reconcile by
  `clientMutationId` → typed-error rollback (409 shows "edited by X just now" toast +
  latest state; no merge dialogs).

**Exit criteria L6:** all 7 grammar rows work with ghost labels + undo; promote-to-task
works from a thread; a simulated 409 rolls back cleanly.

---

## Layer 7 — Live behaviors, states, polish

- Simulation driver on by default in the demo: agents work, messages arrive, spec bumps
  to v5 → staleness appears on every surface at once (Home, board card, panel, feed
  embed), dependency resolves → unblock ripple (badges clear + notification + feed).
- Full state inventory per component: empty (grammar-teaching), loading skeletons
  (panels never blank-flash), soft-deleted tombstones, stale, blocked, offline banner
  (read-only + queued composer), restricted-badge slot (chrome only, per A4).
- Perf pass: virtualized threads (10k msgs) + paged trees (200 children) + grouped
  rails (50 edges, "show all"); memoized selectors; interaction latency budget.
- a11y pass: full keyboard paths (palette parity), focus management in stack, ARIA on
  boards/trees, color+word statuses.

## Layer 8 — Acceptance: the five golden workflows

Scripted, demoable walkthroughs (and Vitest interaction tests) reproducing the brief's
§10 end-to-end on mock data:
1. Author & stage (create in channel → criteria → attach doc → drag-assign → bounty).
2. Agent pulls & works (pull → working → progress in thread → human correction
   mid-flight → agent ack) — driven by the simulation.
3. Ship & review (PR link → in_review → side-by-side pinned splits → star → Complete →
   award moment → unblock ripple).
4. Knowledge grows (promote thread message → doc child of spec, linked forever).
5. Orient a newcomer (Home self-explains → Graph focus on milestone → channel shelf).

**Definition of done:** all five run clean; gallery page covers every kind × zoom ×
state; contract test-suite green; no console errors; type-check clean.

---

## Build order & parallelization shape (for the orchestration plan later)

```
L0 Foundation ──► L1 Entity contract ──► L2 subsystems ──┬─► L5 screens (each screen
      │                                                  │    independently parallel)
      └────────► L3 shell/nav ───────────────────────────┤
      └────────► L4 collections/graph ───────────────────┘
                                          L6 interactions ─► L7 live/polish ─► L8 acceptance
```
L0 is the single foundation a lead builds first (types + facade + seed are the shared
contract). After L1/L2 land, screens are package-disjoint and fan out cleanly to
parallel workers (one worker per screen/subsystem, no shared files — matches our
package-disjoint worker policy). L6–L8 are integration passes.

## Decisions (APPROVED 2026-07-25)

1. **Where it lives:** new isolated worktree off `main`, module self-contained at
   `maestro-ui/src/collab-v2/` (own tokens.css, own stores, no imports from legacy
   collab code), mounted behind a launcher entry — uses maestro-ui's existing deps
   (@xyflow, dnd-kit, zustand) without touching the live app.
2. **Fresh build, ignore the branch.** The `feat/collab-v2-supabase-backend` UI is
   NOT consulted or lifted from — the design docs + data contract are the sole source.
3. **Visual language:** the prototype's paper/ink design system (Newsreader/Hanken
   Grotesk/JetBrains Mono, `--pn-*` tokens), scoped to the module.
