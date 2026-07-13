# maestro-mobile — Project Structure (ratified)

> The agreed folder tree. Each top-level `src/` module has a single owner (see `ARCHITECTURE.md` §3). Scopes are **file-disjoint** so parallel workers never touch the same files. Atlas integrates and commits.

## Top level

> The `feat/mobile-app` worktree root is the **whole monorepo** (`maestro-ui/server/cli/web`). The mobile app is a **standalone package at `maestro-mobile/`** (sibling to `maestro-ui`), NOT added to the root bun `workspaces` list — so it stays outside the bun workspace and uses its own npm install. The drift-guard imports `../maestro-server/src/types.ts` (reachable in-tree).

```
maestro-mobile/                     ← the standalone Expo app (this is the app root)
  design-reference/                 pinned Atelier specimens (mobile-app/*.jsx, colors_and_type.css, assets)
  app.json / app.config.ts          Expo config (CNG, plugins, fonts)
  package.json                      standalone npm app (NOT in the bun workspace)
  tsconfig.json                     path alias @/* → src/*; excludes src/domain/__sync__
  tsconfig.drift.json               dedicated drift-guard gate (imports ../maestro-server/src/types.ts)
  babel.config.js                   unistyles + reanimated plugins
  metro.config.js                   blockList: src/domain/__sync__ + ../maestro-server
  index.ts                          Expo entry
  assets/                           fonts, logos, the offline xterm + excalidraw HTML bundles
  src/
    app/                            expo-router route tree (Compass)
    domain/                         (Lexicon)
    theme/                          (Bedrock)
    services/
      api/                          (Conduit)
      realtime/                     (Pulse)
    state/                          (Ledger)
    components/                     (Palette)
    features/                       (Forge — split A / B; incl. docs/ viewer)
    terminal/                       (Relay)
    whiteboard/                     (Relay) — WebView-hosted Excalidraw, scene↔doc persistence
    lib/                            tiny shared helpers (no domain logic)
  __qa__/                           (Sentinel) — fake server, integration, gates
  planning/                         the 10 specialist planning docs (this phase)
  ARCHITECTURE.md PROJECT_STRUCTURE.md DEPENDENCIES.md CONVENTIONS.md BUILD_PLAN.md
  MOBILE_APP_BUILD_ANALYSIS.md      connection contract (authoritative)
```

## `src/app/` — expo-router tree (Compass)

```
app/
  _layout.tsx           root: ThemeBoot > GestureHandlerRootView > BottomSheetModalProvider > SheetHost > Stack
  connect.tsx           host-entry screen (enter IP:port → connect)  [no auth]
  (tabs)/
    _layout.tsx         custom 5-slot tab bar + center Conduct FAB + NowPlaying strip
    sessions/           [B] session-panel stack
      index.tsx  [id].tsx
    tasks/              [A] maestro-panel stack
      index.tsx  [id].tsx
    members/            [A]
      index.tsx  [id].tsx
    more/               [A] teams/skills/lists/graphs/profiles entry rows
      index.tsx  teams.tsx  skills.tsx  lists.tsx  graphs.tsx  profiles.tsx
  terminal/[sessionId].tsx   fullScreenModal (Relay fills the body)
  +not-found.tsx
navigation/
  routes.ts             route-name + param-shape contract (nav ↔ features seam)
  sheets/               SheetHost, useSheetStore, SheetRequest union, backdrop
  deeplinks.ts          maestro:// scheme + notify:* → URL builder
```

## `src/domain/` (Lexicon)

```
domain/
  entities/             task.ts session.ts teamMember.ts team.ts project.ts
                        spell.ts taskList.ts taskGraph.ts modelProfile.ts ensemble.ts
  enums.ts              TaskStatus, SessionStatus, Mode, Priority, AgentTool, ...
  ids.ts                branded id types (SessionId, TaskId, ...)
  contracts/
    rest.ts             request + response payload types (per endpoint)
    ws.ts               WsEnvelope {type,event,data,timestamp} + RealtimeEvent union
  schemas/              zod v4 — boundary-only (spawnBody, wsEnvelope parse)
  derive/               toUiSessionStatus (8-state UI union), tab predicates, mode/agentTool display
  __sync__/             compile-time assignability assertions vs maestro-server/src/types.ts (under tsconfig.drift.json)
  index.ts
```

> **Branch reality (feat/mobile-app):** this branch's server has a **minimal Spell** type and **no Ensemble / no SPELL_COLORS** (the rich spell system lives on `staging`). Lexicon mirrored only the real server types — no invented shapes. Rich spell-ring UI / ensembles are out of scope on this branch unless the server gains them.

```
```

## `src/theme/` (Bedrock) — DATA + ASSETS only, no component files

```
theme/
  tokens.ts             lightTheme/darkTheme (same shape): colors, space[], radii, shadows, fonts, motion
  typography.ts         .t-* presets → RN text style objects
  unistyles.ts          StyleSheet.configure(themes, settings)
  ThemeBoot.tsx         thin boot + useTheme/setThemeMode over UnistylesRuntime
  fonts.ts              @expo-google-fonts registration / config-plugin embed
  svg/
    paths.ts            M_ICONS registry + glyph/Mark shapes + Gauge/arc geometry
    statusColors.ts     status → token color map (keyed off Lexicon status union)
  assets/               claude/codex/gemini logos
  index.ts
```

## `src/services/api/` (Conduit) + `src/services/realtime/` (Pulse)

```
services/
  api/
    serverConfig.ts     buildServerConfig(host) → {apiBaseUrl, wsUrl, ptyWsUrl}; deriveWsUrl
    MaestroClient.ts     native-fetch wrapper, ~methods ported 1:1, no-auth, getToken()→null
    errors.ts           typed {error,code,message} model
    index.ts
  realtime/
    EntitySyncClient.ts  bare-origin WS, Array.isArray branch, backoff+jitter, ping, resync
    normalizeEvent.ts    envelope → typed RealtimeEvent (consumes domain/contracts/ws)
    PtyTransport.ts      /pty socket, streaming decoder, send-before-open queue, 1011→exit
    index.ts
```

## `src/state/` (Ledger)

```
state/
  entityStore.ts        single Zustand store, the only set() writer
  batchSet.ts           reconciler (ported verbatim) + queueMicrotask coalescing
  ingest.ts             ingestBatch / ingestEvent / resyncProject (called by Pulse)
  optimistic.ts         optimisticPatch / rollback (single writer for inline edits)
  fetchActions.ts       typed REST calls via Conduit's client
  selectors/            pure select*(state,args): sessions.ts tasks.ts members.ts ...
  uiStore.ts            activeProjectId, realtimeStatus, themeMode
  prefsStore.ts         MMKV-backed (theme, last host); swappable StateStorage iface
  storage.ts            StateStorage (MMKV primary, AsyncStorage fallback)
  index.ts
```

## `src/components/` (Palette)

```
components/
  primitives/   Icon StatusGlyph Mark Gauge StatusDot AgentAvatar Avatar Divider Text
  controls/     Button IconButton Badge Tag Toggle Chip MetaButton Input TextArea Card
  composite/    MTaskTile MSessionTile NowPlaying
    sheet/      SheetHeader SheetHandle PickerRow SheetSection
  __tests__/
  index.ts
```

## `src/features/` (Forge) — flat children; A/B is a logical split enforced by a no-cross-import rule

The A/B split is **not** nested folders — `features/` has flat children, and the rule is: a stream-A folder never imports a stream-B folder and vice-versa. Cross-stream actions dispatch **Compass typed sheet/route intents** (`sheets.open({type,...})`), never a direct cross-feature import.

```
features/
  # ── Stream A: maestro-panel (Tasks/Members/Teams/Skills/Lists/Graphs/Profiles) ──
  tasks/      useTasksScreen.ts TasksScreen.tsx TaskDetail.tsx CreateTaskSheet.tsx
  members/    useMembersScreen.ts MembersScreen.tsx MemberDetail.tsx TeamMemberSheet.tsx
  teams/      (REST-poll — team:* not broadcast)
  skills/  lists/  graphs/  profiles/
  more/       entry rows → maestro-panel surfaces (Skills/Lists/Graphs/Profiles/Teams) + app-settings (host/connect/theme) kept as a separate settings section
  # ── Stream B: session-panel (Sessions/detail/stats/timeline/prompts + spawn + connect) ──
  sessions/   useSessionsScreen.ts SessionsScreen.tsx SessionDetail.tsx useSessionActions.ts
  spawn/      useSpawnFlow.ts RunConfigSheet.tsx ConductFab.tsx
  connect/    host-entry body (writes raw host → Ledger configStore → triggers Pulse reconnect)
  # ── straddle bodies: SINGLE OWNER = stream B (session-panel); stream A imports read-only ──
  conduct/    CommandSheet body — fires A (new task/member/spell) and B (spawn) via sheets.open; owned by B (spawn is session-panel)
  _shared/    useScreenStatus, optimistic helpers — owned by B; frozen after Phase 0, then read-only to A
  # ── shared read-only viewer (cross-cutting: tasks + sessions docs) ──
  docs/       DocViewer (markdown + Mermaid + read-only Excalidraw scene render via GET .../docs); opens the whiteboard editor for edit
```

> `NowPlaying` *component* is authored by Palette (`components/composite/`); it is **mounted** by Compass as tab-bar chrome (reads Ledger `useActiveSession`), not by Forge.
> The terminal screen body is **not** here — it lives in the top-level `src/terminal/` module (Relay), mounted by Compass's `app/terminal/[sessionId].tsx` route.

## `__qa__/` (Sentinel)

```
__qa__/
  maelstrom/        in-repo fake server: entity-sync array/single framing + /pty binary
  integration/      live-smoke + reconcile tests
  gates/            per-package tsc runner, phase-gate VERDICT templates
  fixtures/
```

## Disjointness guarantees

- `components/` imports `theme/` + `domain/` only — never `features/` or `state/`.
- `features/maestro-panel/` and `features/session-panel/` never import each other (only `features/shared/`, `components/`, `state/selectors`, `domain/`).
- `services/realtime/` never imports `services/api/`.
- `theme/svg/` holds no `.tsx` component files.
