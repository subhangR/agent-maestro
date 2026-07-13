# Planning — Features / Screens (Forge)

Scope: `features/`. I own the screen-level composition and end-to-end wiring of the four
tabs (Sessions / Tasks / Members / More), their detail screens, the action sheets, and the
spawn flow. I consume Bedrock's theme, Palette's components, Compass's navigation, Lexicon's
types, Conduit's REST client, Pulse's realtime client, and Ledger's stores. I do **not** own
the terminal renderer (Relay) — I only own the "open terminal / send reply" entry points that
hand off to Relay's sheet.

This doc is opinionated and concrete. Where I name a library I name the rejected alternative
and why. Decisions that cross a boundary are flagged for consensus, not unilaterally fixed.

---

## 1. Architectural stance for `features/`

**A feature is a screen + its hooks + its local UI state — nothing else.** Features are the
only layer allowed to compose across all the lower layers. The hard rule:

- **Features read state through selectors, never by calling the REST client to fetch-then-render.**
  REST mutations go *out* through Conduit; data comes *in* through Ledger selectors fed by
  Pulse's WS reconciler. A screen that does `useEffect(() => client.getTasks())` and holds the
  result in local `useState` is a bug — it bypasses the live sync and will show stale data the
  moment a WS event lands. The one exception is teams (no `team:*` broadcast — see §6), which
  are an explicit REST-poll.
- **Features hold only ephemeral UI state** (which tab, which filter, sheet open/closed, form
  field drafts). Anything that another screen could observe lives in a Ledger store.
- **Screens are thin.** A screen file should be layout + a call to one `use<Screen>()` hook that
  returns `{ data, actions, status }`. All selector wiring and action plumbing lives in the hook
  so the screen stays a readable composition of Palette components.

This mirrors maestro-ui's own split (`useSessionStore`/`useTaskStore` selectors + `useSessionActions`/
`usePromptSender` hooks + dumb view components) — proven, and it ports cleanly to RN.

---

## 2. Screen composition

The Atelier specimens (`m-screens.jsx`, `m-app.jsx`, `m-overlays.jsx`) already define the IA.
I map each to a feature module and replace every `m-data.jsx` constant with a live selector.

### 2.1 Sessions tab (home)

- **List screen** (`SessionsScreen`): header stat line (`N running · M needs-input · K idle`),
  the spawn quick-chips row (Terminal / Claude / Codex / Gemini), then sections grouped by
  status (Running → grouped by team, Idle, Completed). Each row is Palette's `MSessionTile`
  (spawn-chain tree, live status dot, mode/model/strategy meta).
- **Detail screen** (push, not sheet): stats (`GET /sessions/:id/stats`), timeline
  (`/timeline`), prompts (`/prompts`), command-usage (`/command-usage`), docs (`/docs`), git
  summary. Tabbed sub-views (Overview / Timeline / Prompts / Docs). The "open live terminal"
  button hands off to Relay's `TerminalSheet`.
- **NowPlaying strip**: a persistent mini-bar above the tab bar bound to the *active* session
  (last-focused live session). Tapping opens the terminal sheet. The strip's "say" line + live
  dot + context gauge are driven by `session:status_changed` / `session:updated` events.

### 2.2 Tasks tab

- **List screen** (`TasksScreen`): sub-tabs Current / Pinned / Done / Archived; priority filter
  chips (All / High / Mine); sections (In progress / Up next / Completed). Rows are Palette's
  `MTaskTile` with the inline hierarchical subtask tree and inline status/priority/assignee/model
  editors (each editor opens a `PickerSheet`).
- **Detail screen** (push): description (markdown), subtask tree, assignees, linked sessions,
  timeline, docs/images. Inline edit of every field via pickers; actions row (Run, Pin, Complete,
  Block, Delete).
- **Create / Edit task sheet** (`CreateTaskSheet`): title, description, priority, due date,
  assignees, agent+model, worktree toggle, YOLO-perms toggle, skills. Footer: Cancel / Create /
  Create&Start (Start = create then immediately spawn).
- **Run-config sheet** (`RunConfigSheet`): agent, model, permission segment, isolation, assignees,
  a natural-language summary line — this is the pre-spawn launch panel.

### 2.3 Members tab

- **List screen** (`MembersScreen`): member cards (avatar, name, role/coordinator badge, live dot,
  model, live-session + task counts, last "say"). New-member / New-team actions.
- **Team member sheet** (`TeamMemberSheet`): full persona editor — name, role, identity prompt,
  mode, agent, model, permissions, capability switches, scope, instrument, skills. Create + Edit.
- **Teams**: list + tree view via REST poll (no WS — §6). Member detail (push) shows their live
  sessions and assigned tasks (cross-selectors into session/task stores).

### 2.4 More tab

- Grouped settings list: Workspace (Teams, Skills & spells, Docs, Diagrams, Lists, Files),
  Session (Resources, Whiteboard, Recordings), App (Dark mode, Notifications, Settings, About).
- **Docs / Diagrams viewer** (`DocsSheet` / `DocSheet` / `DiagramSheet`): markdown + Mermaid +
  read-only diagram render. Files/Recordings/SSH are native-only — render as "not available on
  mobile" rows or drop (product call, §7).

### 2.5 Conduct FAB + Command sheet

The center FAB opens `CommandSheet` — the mobile command palette: New task, Spawn Claude/Codex/
Gemini, New terminal, New team member, New team, Cast spell. This is the primary action surface
and the entry point into the spawn flow (§4).

### 2.6 Shared sheets (I own the orchestration, Palette owns the chrome)

`ProjectSheet` (switcher), `PickerSheet` (the universal single/multi select — replaces every
desktop dropdown), `FormSheet`/`BottomSheet` shells. I own *when* they open and *what they do on
confirm*; Palette owns their visual shell.

---

## 3. Data-hook patterns

Each screen gets one hook. Pattern:

```ts
// features/sessions/useSessionsScreen.ts
export function useSessionsScreen() {
  const projectId = useUiStore(s => s.activeProjectId);
  const sessions  = useEntityStore(useShallow(s => selectSessionsByProject(s, projectId)));
  const grouped   = useMemo(() => groupByStatusAndTeam(sessions), [sessions]);
  const actions   = useSessionActions();        // spawn, resume, stop, sendReply
  return { grouped, actions, isConnected: useUiStore(s => s.connected) };
}
```

There is **one** `entityStore` (not `useSessionStore`/`useProjectStore`/`useRealtimeStore` — those
desktop names do not exist on mobile). All server entities live in `entityStore`; `activeProjectId`
and the realtime `connected` flag live in `uiStore`. Features read both via Ledger's exported pure
`select*(state, ...args)` functions composed with `useShallow`.

Rules I will hold the line on:
- **`useShallow` (zustand v5) on every multi-field selector** to stop re-render storms when one
  session in a 50-item list updates. Without it, a single `session:updated` re-renders every
  subscriber. (Ledger owns the store shape; I own correct subscription.)
- **Selectors are pure functions exported by Ledger** (`selectSessionsByProject`, `selectOpenTasks`,
  `selectTaskTree`). Features import them; they do not reach into raw store maps. This keeps the
  state→features boundary a typed contract, not ad-hoc `.values()` spelunking.
- **Derive, don't store.** Status counts, groupings, the task tree are `useMemo` over selector
  output, not extra store fields. One source of truth (the entity maps), everything else computed.
- **`status` triad** returned by every hook: `loading` (first fetch in flight), `empty`
  (fetched, zero items), `error`. Screens render the matching Palette empty/error state. No screen
  invents its own loading boolean.

---

## 4. Spawn flow (the one to get exactly right)

The mobile spawn flow, end to end:

1. User taps a spawn affordance (quick-chip, Command sheet, Run-config sheet, Create&Start).
2. For a task-attached spawn, open `RunConfigSheet` to collect agent/model/perms/worktree/
   assignees. For a quick terminal/agent chip, use sensible defaults and skip the sheet.
3. **Measure `cols`/`rows`.** This is the subtle part — there is no terminal mounted yet at spawn
   time. I will compute a target grid from the device viewport and the terminal sheet's known
   monospace metrics (cell width/height from Bedrock's mono token at the sheet's font size),
   `cols = floor(sheetWidth / cellW)`, `rows = floor(sheetHeight / cellH)`, clamped to `1..1000`
   per `spawnSessionSchema`. A wrong size only means the agent TUI boots at the wrong width and
   reflows on first real `/pty` resize — acceptable, but I want it close. **Cross-team: I need the
   mono cell metrics from Bedrock and the terminal-sheet dimensions from Relay/Compass.**
4. `POST /api/sessions/spawn` via Conduit with the exact body:
   `{ taskIds, projectId, mode, spawnSource: 'ui', launchConfig|legacy agentTool/model, teamMemberId(s), permissionMode, useWorktree, initialDirective?, cols, rows }`.
   **`spawnSource` is always `'ui'`** — `'session'` requires an `X-Session-Id` coordinator header
   we don't have and returns 403.
5. Server returns `201 {sessionId, session, manifestPath}` and emits the `session:spawn` WS event.
   I optimistically insert the returned `session` into the store immediately (don't wait for the
   WS echo), keyed by `sessionId`.
6. **Consume `session:spawn` from Pulse, ignoring `command`/`cwd`/`envVars`** (those are native-PTY
   payload for the desktop forker). The only thing I take from the event is the session id →
   that's the key Relay uses to open `ws://host/pty?sessionId=<id>`. This is exactly what maestro-ui's
   `webTerminal.createSession` does.
7. Auto-navigate to the new session (or open its terminal sheet) and make it the NowPlaying active
   session.

**Hard dependency:** the agent only actually launches when the server runs `MAESTRO_PTY_HOST=server`.
Atlas's brief confirms the target server is in that mode, so spawn-to-run works. If a deployment
isn't, spawn still 201s and creates a Session that never runs — I'll surface a "spawned, awaiting
PTY" state rather than a fake "live".

---

## 5. The prompt sender-session problem

`POST /api/sessions/:id/prompt` requires a real `senderSessionId` and forbids self-prompting.
On desktop, maestro-ui sidesteps the REST prompt path entirely — `usePromptSender` writes straight
to the PTY via the Tauri `write_to_session` invoke (a keystroke injection, not a server prompt).
Mobile has neither a Tauri invoke nor a natural sender session. Three options:

- **Option A — write through the live `/pty` socket (recommended for the common case).** When the
  user replies to a *live* session from the terminal sheet or NowPlaying, send the reply as binary
  keystroke frames + `\r` over the already-open `/pty` socket — the literal mobile equivalent of
  `write_to_session`. No `senderSessionId`, no REST prompt, no self-prompt rule in play. This
  covers "answer the agent / reply to the agent," which is 90% of mobile prompting. **Owned jointly
  with Relay** (Relay owns the socket; I own the send-reply UI + intent).
- **Option B — a dedicated synthetic "mobile control" session as the sender** for cases where there
  is no live PTY (e.g. queueing a prompt to a session that's idle/needs-resume, or a coordinator
  directive). Create/reuse one long-lived session per device whose id is the `senderSessionId` on
  `POST /sessions/:id/prompt`. Needs a server-side sender that satisfies the validation; verify the
  prompt route accepts an arbitrary existing session id as sender.
- **Option C — drop non-live prompting from v1.** Reply only works on live sessions (Option A);
  idle sessions must be resumed first. Smallest surface, no synthetic-session machinery.

**My recommendation: A for v1, with C as the explicit fallback for non-live sessions; defer B**
until there's a real coordinator-directive-from-mobile use case. This is a product decision —
flagged for Atlas (§7).

---

## 6. Optimistic updates

Policy: **optimistic for cheap reversible field edits, pending-state for spawns, confirm-on-WS for
everything structural.**

- **Inline field edits** (priority, assignee, pin, status via pickers): apply immediately to the
  Ledger store, fire the `PATCH`, and reconcile when the authoritative `task:updated` WS event
  lands. On REST failure, roll back to the pre-edit snapshot and toast. This is the only place I
  use true optimistic mutation — these are 1-field, low-conflict, instantly visible.
- **Spawn**: insert the returned `session` (we *have* the authoritative entity from the 201, so it's
  not speculative) and show a `spawning` status until `session:status_changed` flips it to working.
- **Create task / member**: I do **not** optimistically synthesize an entity (no server id yet).
  Show a brief pending state on the submit button; the new entity appears when `task:created` /
  `team_member:created` arrives. Simpler, no id-reconciliation dance, and creates are rare enough
  that the ~100ms round-trip is invisible.
- **Conflict rule**: the WS event is always authoritative. An optimistic local edit is a *guess*
  that the store overwrites the instant the real event lands. Never merge — replace. (Ledger's
  `batchSet` reconciler is the single writer; my optimistic edits go through the same setter so
  there's one code path.)

---

## 7. List virtualization

**Decision: `@shopify/flash-list` (v2, the New-Architecture rewrite).**

Rationale:
- Sessions and Tasks lists are unbounded (a busy project has dozens of sessions, hundreds of
  tasks). `MSessionTile`/`MTaskTile` are non-trivial (spawn-chain tree, inline editors) so cell
  recycling matters. FlashList recycles views by type and has materially better scroll perf than
  FlatList for heterogeneous rich rows.
- v2 drops the `estimatedItemSize` foot-gun and is built for RN's New Architecture / Fabric, which
  Expo SDK 53+ defaults to. It supports sticky section headers and masonry, which we need for the
  status sections.

Rejected:
- **`FlatList`** — fine for the Members tab (small, bounded) and I'll use it there to avoid a
  dependency for a 4-item list, but it stutters on long rich lists; the cell-measurement model is
  the wrong tool for our tiles.
- **`@legendapp/list`** — promising and FlashList-compatible API, but less battle-tested; not worth
  the risk over Shopify's when FlashList already solves it.
- **`SectionList`** — built-in sectioning is convenient but it's FlatList-backed; same perf ceiling.
  I'll get sectioning from FlashList's data-with-headers pattern instead.

**Cross-team note for Palette:** tiles must render at a *stable height per type* (or declare their
type to FlashList) for recycling to work — inline-expanding subtask trees need care. I'll define
the `getItemType` contract with Palette.

---

## 8. Library choices (features-specific)

| Concern | Choice | Why | Rejected |
|---|---|---|---|
| List virtualization | `@shopify/flash-list` ^2.0 | recycling for rich rows, New-Arch native | FlatList (perf), legend-list (maturity) |
| Forms (create-task/member sheets) | `react-hook-form` ^7 | uncontrolled inputs = no re-render per keystroke on RN; tiny; pairs with zod resolver from Lexicon | Formik (heavier, re-renders), hand-rolled `useState` (the specimens' approach — fine for 1 field, painful for the member form's ~15) |
| Form validation | `zod` + `@hookform/resolvers` | reuse Lexicon's entity schemas as the form contract — one source of truth client↔server | yup (no schema reuse), manual |
| Selector memoization | `zustand`'s `useShallow` + `useMemo` | already in the stack via Ledger; no reselect needed | reselect (redundant with zustand v5) |
| Date picker (due date) | `@react-native-community/datetimepicker` | native OS picker, Expo-supported | JS calendar libs (heavier, non-native feel) |
| Bottom sheets | `@gorhom/bottom-sheet` ^5 | **Compass's call** — I consume it. Flag: every form/picker sheet depends on it | — (deferred to Compass) |

I introduce **only** `flash-list`, `react-hook-form`, `@hookform/resolvers`, and the datetime
picker as net-new deps in *my* scope. Everything else I consume from siblings.

---

## 9. Folder structure for `features/`

`features/` is a **flat tree**. Each subfolder belongs to exactly one stream — **A** = maestro-panel,
**B** = session-panel. The no-cross-import rule holds: a folder never imports another stream's files;
cross-stream actions are `sheets.open(...)` intents through Compass. The **straddle folders
(`conduct/`, `_shared/`) are owned by Stream B**; Stream A imports them **read-only** and they
**freeze after Phase 0**.

```
features/
  # ---- Stream B (session-panel) ----
  sessions/                     # [B]
    SessionsScreen.tsx          #   list + spawn chips + sections
    SessionDetailScreen.tsx     #   stats/timeline/prompts/docs tabs
    useSessionsScreen.ts        #   selectors + grouping (entityStore + uiStore)
    useSessionDetail.ts         #   stats/timeline/prompts fetch + live
    useSessionActions.ts        #   spawn / resume / stop / sendReply
  spawn/                        # [B]
    RunConfigSheet.tsx          #   pre-spawn launch panel (body fills Compass SheetHost slot)
    useSpawnFlow.ts             #   the §4 spawn orchestration
  connect/                      # [B]
    ConnectScreen.tsx           #   host-connect (no auth) -> Ledger configStore + Pulse reconnect
  conduct/                      # [B] — SINGLE-OWNER straddle; A imports read-only; frozen after Phase 0
    CommandSheet.tsx            #   the Conduct FAB command palette body
    useSpell.ts                 #   cast-spell action
  _shared/                      # [B] — SINGLE-OWNER straddle; A imports read-only; frozen after Phase 0
    useScreenStatus.ts          #   loading/empty/error triad helper
    optimistic.ts               #   thin wrapper over Ledger optimisticPatch/rollback
  # ---- Stream A (maestro-panel) ----
  tasks/                        # [A]
    TasksScreen.tsx
    TaskDetailScreen.tsx
    CreateTaskSheet.tsx         #   form (react-hook-form + zod); Create&Start -> sheets.open(runConfig) intent
    useTasksScreen.ts
    useTaskDetail.ts
    useTaskActions.ts           #   create / patch / pin / complete
  members/                      # [A]
    MembersScreen.tsx
    MemberDetailScreen.tsx
    TeamMemberSheet.tsx
    useMembersScreen.ts
    useMemberActions.ts
  teams/                        # [A]  TeamsList/TeamDetail — REST-poll (no WS)
  skills/                       # [A]
  lists/                        # [A]
  graphs/                       # [A]
  profiles/                     # [A]  model profiles
  more/                         # [A]
    MoreScreen.tsx
    DocsViewer.tsx              #   markdown/mermaid (read-only)
    SettingsScreen.tsx
```

`NowPlaying` is **not** here — it's Compass's nav chrome, bound via Ledger's `useActiveSession()`.
Screens push via Compass's navigator; sheets are presented via Compass's `SheetHost`. I import
components from `components/` (Palette), theme from `theme/` (Bedrock), client from `services/api`
(Conduit), realtime transport from `services/realtime` (Pulse), and **selectors + `entityStore`/
`uiStore` from `state/` (Ledger)**, types from `domain/` (Lexicon).

---

## 10. Best practices I'll enforce

- **Never fetch-to-render in a screen.** Live data only through selectors; one-shot REST only for
  detail sub-resources that aren't in the WS contract (stats/timeline/prompts/command-usage), and
  even those re-fetch on the relevant `session:updated` event rather than polling.
- **One actions hook per domain**, returning async functions that (a) optionally apply optimistic
  state, (b) call Conduit, (c) handle error+rollback+toast. Screens call actions, never the client.
- **Every list virtualized or provably bounded.** No `.map()` over an unbounded server collection.
- **`useShallow` on every selector that returns an object/array.**
- **Empty + error + offline states for every screen** (offline = WS disconnected → show last-known
  data with a stale banner, since the store is the cache).
- **No `m-data.jsx` import survives.** A grep for the mock constants is part of my done-criteria.

---

## 11. Risks

1. **cols/rows measurement before any terminal exists** (§4.3). Mitigation: compute from mono cell
   metrics; accept a one-resize reflow. Low severity.
2. **Prompt sender-session** (§5) is an unresolved product call; blocks non-live prompting. Mitigate
   by shipping Option A (live-only) first.
3. **FlashList + inline-expanding tiles**: variable-height recycling can flicker. Mitigate with
   `getItemType` per tile state; coordinate with Palette.
4. **Teams have no WS** — a teams view will silently go stale. Mitigate with a focus-triggered REST
   re-poll; never present teams as "live."
5. **Optimistic rollback UX**: a failed inline edit that snaps back can confuse. Mitigate with an
   explicit toast naming the field that reverted.
6. **Detail sub-resources (stats/timeline) aren't in the WS contract** — they can drift. Mitigate by
   re-fetching on `session:updated` rather than treating the first fetch as live.

---

## 12. Cross-team dependencies & open questions

**Depends on:**
- **Lexicon (domain):** entity types + zod schemas for tasks/sessions/members/teams/spells, the
  spawn-request type, and the WS event payload types. I need the schemas as my form contracts.
- **Conduit (services/api):** typed REST methods — especially `spawnSession`, `prompt`,
  `patchTask`, `createTask`, `createMember`, and the detail GETs (`stats/timeline/prompts/
  command-usage/docs`). And whether the prompt route accepts an arbitrary sender session id (for §5
  Option B).
- **Pulse (services/realtime):** the `session:spawn` consumer keyed by session id, and a `connected`
  flag for my offline banners. Confirm immediate vs batched handling is transparent to me (I just
  read the store).
- **Ledger (state):** exported pure selectors (`selectSessionsByProject`, `selectTaskTree`,
  `selectOpenTasks`, `selectMembersWithLiveCounts`), `batchSet` as the single writer, and the
  optimistic-edit setter path so my edits and WS echoes share one code path.
- **Compass (navigation):** route names for every detail screen, the sheet host (`@gorhom/bottom-sheet`),
  the Conduct FAB wiring, and deep-link targets (open session/task by id from a push notification).
- **Bedrock (theme):** mono cell metrics (for cols/rows), status colors, type scale.
- **Palette (components):** `MSessionTile`/`MTaskTile`/member card/all sheet shells, and the
  `getItemType` contract for FlashList recycling.
- **Relay (terminal):** the `TerminalSheet` I hand off to, the `/pty` send-keystroke API for §5
  Option A, and the terminal-sheet dimensions for cols/rows.

**Open questions for consensus:**
1. **Prompt sender-session model (§5)** — A (live `/pty` write) for v1, C as fallback, defer B?
   Needs Atlas + Relay + Conduit sign-off.
2. **Scope of native-only More-tab rows** (Files, Recordings, SSH, Whiteboard-edit) — render as
   "unavailable on mobile," or drop entirely? Product call.
3. **Selector ownership** — confirm Ledger exports the selectors I listed and owns their shape, so
   features never reach into raw maps. (state↔features boundary.)
4. **Detail sub-resource freshness** — agree that stats/timeline/prompts re-fetch on `session:updated`
   rather than expecting a dedicated WS event. (services↔state↔features.)
5. **FlashList `getItemType` contract** with Palette for expanding tiles.
6. **Create-flow optimism** — confirm we're aligned on *not* optimistically synthesizing created
   tasks/members (wait for `*:created`), only optimistic on inline field edits.

---

## 13. Cross-review addendum (post-consensus)

Read at my boundaries: `navigation.md` (Compass), `state.md` (Ledger), plus the ratified-stack
summary. **SIGN-OFF** — no blocking objection. Two user directives folded in:

**Directive 1 — NO AUTH v1.** Removes the `(auth)/login` screen body from my scope entirely.
There was never an auth screen in `features/`; the host-connect screen (type IP/host:port → tap
connect) writes the raw host string into Ledger's `configStore` (Ledger CQ-1) and triggers a Pulse
reconnect — a tiny one-screen feature I'll own under `features/connect/`. `?token=` stays a
documented FUTURE seam, referenced nowhere in v1 feature code.

**Directive 2 — UI SPLIT into two file-disjoint streams.** My `features/` scope splits cleanly:

- **Stream B — session-panel** (`features/sessions/`, `features/spawn/`, `features/connect/`):
  Sessions list/detail/stats/timeline/prompts, `useSessionActions` (spawn/resume/stop/sendReply),
  `useSpawnFlow`, `RunConfigSheet` *body*, and the terminal-launch CTA that routes to Compass's
  `terminal/[sessionId]`. **NowPlaying is Compass's** (navigation chrome bound via Ledger's
  `useActiveSession()`), not mine — one less ambiguity.
- **Stream A — maestro-panel** (`features/tasks/`, `members/`, `teams/`, `skills/`, `lists/`,
  `graphs/`, `profiles/`, `more/`): Tasks list/detail, `CreateTaskSheet` body, `TeamMemberSheet`
  body, Members/Teams (teams REST-poll), Skills/Lists/Graphs/ModelProfiles, the More menu + docs
  viewer.

**The one disjointness rule** (resolves the only collision risk): cross-stream actions go through
**Compass's typed sheet/route intents, never a direct cross-feature import.** A's task "Run" button
and A's "Create & Start" don't import B's `useSpawnFlow`; they dispatch
`sheets.open({type:'runConfig', taskId})` (after the `task:created` echo, for Create&Start). So
A→B spawn invocation is an intent, keeping the two streams' files disjoint.

**Ratified straddle ownership:** the two straddle folders have a **single owner = Stream B** —
`features/conduct/` (the `CommandSheet` body that the Conduct FAB opens) and `features/_shared/`
(`useScreenStatus` triad + the `optimistic.ts` wrapper over Ledger's `optimisticPatch`/`rollback`).
Stream A imports both **read-only**, and they **freeze after Phase 0**. (Compass owns the FAB and the
`SheetHost` that *presents* `CommandSheet`; B owns the sheet's *body*.)

**vs Ledger (state).** Confirmed: I consume **pure `select*(state, ...args)` functions** composed
with `useShallow` over the **single `entityStore`** (not separate session/task stores) — my
"per-screen hook" wraps Ledger's selectors. I consume `domain/derive` for status/tab mapping rather
than re-implementing it. Optimistic inline edits go through Ledger's `optimisticPatch`/`rollback`
single-writer path (my `_shared/optimistic.ts` is a thin wrapper); creates wait for `*:created`.
Spawn inserts from the 201 `session` body and reconciles the `session:spawn` WS event idempotently
by id (Ledger Q9) — agreed.

**vs Compass (navigation).** Confirmed: detail screens are push routes (Compass Q2), my screen
bodies import route names/params from `routes.ts`, and my sheet bodies fill Compass's `SheetHost`
slots per the `SheetRequest` union. Answering Compass Q4: More-tab leaf items — push-routes for
content-heavy (Skills/Spells/Lists/Graphs/Profiles), sheets for viewers (Docs/Diagrams). Q5:
phone-only v1, agreed.

**Net changes to my plan:** (1) `features/` is a **flat tree**, every folder tagged stream-A or
stream-B, file-disjoint; (2) straddle folders `conduct/` + `_shared/` are **single-owned by Stream B**,
A imports read-only, frozen after Phase 0; (3) add `features/connect/` host-connect screen (no auth);
(4) NowPlaying reassigned to Compass; (5) cross-stream actions via Compass `sheets.open` intents only;
(6) **drop the desktop multi-store names** (`useSessionStore`/`useProjectStore`/`useRealtimeStore`) —
consume Ledger's pure `select*(state,args)` over the **one `entityStore`**; `activeProjectId` +
`connected` live in `uiStore`; (7) drop all auth/token references. None conflict with any sibling doc.
