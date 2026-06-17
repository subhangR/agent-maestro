# Maestro mobile app (Atelier) — end-to-end build analysis

How to build the Atelier mobile app on top of the existing Maestro server, with no server code changes. Synthesized from seven parallel deep-dives across the server REST surface, the two WebSocket channels, the maestro-ui client, the desktop UI surface inventory, the maestro-web precedent, the terminal/PTY architecture, and the Atelier design specimens.

---

## 1. Executive summary

You can build the Atelier mobile app entirely against the server you already have. The connection model maestro-ui uses is two pure-JS channels plus one terminal channel, and every one of them is transport-neutral: a REST/JSON API, an entity-sync WebSocket, and a per-session PTY WebSocket. None of them require Tauri or any native bridge on the server side. The codebase has already proven a non-native client works twice over — the `maestro-web` browser POC and maestro-ui's own `webTerminal` transport both drive the unchanged server over plain HTTP + WebSocket.

What it takes, in one breath: re-author the Atelier design specimens as a React Native app, port maestro-ui's REST client and WebSocket reconciliation engine almost verbatim, and re-solve the one thing that has no native equivalent — the live terminal renderer.

The single biggest risk is **terminal streaming**, and it splits into two facts that must both hold:

1. **Operational (make-or-break):** the live terminal only exists when the server runs with `MAESTRO_PTY_HOST=server`. The default is `tauri`, under which the server hosts no PTY and `/pty` closes with code 1011. This is an environment/deploy flag, not a code change — so it stays inside the "no server changes" constraint, but the mobile app is dead-on-arrival for terminals if the target box is in the default mode.
2. **Client (net-new build):** there is no xterm.js on React Native. The wire protocol is solved and has reference implementations to copy, but the renderer (a WebView-hosted xterm or a native VT emulator) must be built from scratch. This is the largest mobile-specific work item.

Rough effort shape: the read/control plane (browse and act on tasks, sessions, members, teams, spells, docs) is a high-confidence port of existing, proven code and a known design — call it the bulk of the value at moderate effort. The terminal is a separate, riskier track that can ship later. A responsive PWA wrapper of the existing DOM specimens is a materially cheaper alternative to native RN if "phone app" can flex to "phone web app" (see section 6).

---

## 2. How the current architecture works, layer by layer

### 2.1 Server REST API

A single Express app (`maestro-server/src/server.ts`) mounts every resource router under the `/api` prefix. Everything — entity CRUD, session lifecycle, spawn, prompt, modal, spell, team, git, skills — is plain JSON REST over HTTP. Requests are validated by Zod schemas in `src/api/validation.ts` (most `.strict()`, so extra keys are rejected with `400 VALIDATION_ERROR`). Responses are raw entity JSON or `{ success: true, ... }`; errors are `{ error: true, code, message }`.

- **Base URL:** `http://<host>:<port>/api`. Port = `PORT || 4567` (staging 4569, prod 3001). `GET /health` and `GET /ws-status` sit outside `/api`.
- **CORS:** allows `tauri://localhost`, any localhost origin, and comma-separated `MAESTRO_ALLOWED_ORIGINS`. A native mobile app typically sends no `Origin` header, which is allowed.
- **Auth:** off by default. When enabled, `POST /api/auth/login` sets an HttpOnly cookie, but the middleware (`authMiddleware.ts`) also accepts `Authorization: Bearer <token>` and `?token=<jwt>`. Trusted-loopback requests bypass auth. `/api/auth/*`, `/health`, `/ws-status` are exempt.
- **Body limit:** 50mb (image and Excalidraw-diagram uploads ride as base64 inside JSON). Compression on above 1KB.
- **Notable for mobile:** `GET /api/agent-logs/list|read|tail` exists specifically so non-Tauri clients can read agent logs the desktop reads via Rust.

Router inventory (all under `/api`): `sessionRoutes` (the largest, ~98KB — session CRUD, spawn, resume, prompt, modal, docs, timeline, mode, stats, pty/stop), `projectRoutes`, `taskRoutes`, `teamMemberRoutes`, `teamRoutes`, `spellRoutes`, `skillRoutes`, `taskListRoutes`, `taskGraphRoutes`, `masterRoutes` (cross-project aggregation), `gitRoutes`, `modelProfileRoutes`, `ensembleRoutes`, `orderingRoutes`, `workflowTemplateRoutes`, `agentLogRoutes`, `authRoutes`, `hookRoutes` (agent-side), `alexaRoutes`.

### 2.2 WebSocket bridge + event contract

The server runs **two separate WebSocket servers on the same HTTP port**, routed by upgrade path in `server.ts` (lines 251-289).

**(1) Entity-sync bridge** (`WebSocketBridge.ts`): accepts upgrades on any path *except* `/pty` — the UI connects to the bare origin (e.g. `ws://localhost:4569`, no path). It listens to ~60 domain events on the in-memory event bus and fans them to clients with:
- 50ms batching (a flush sends a JSON **array** of envelopes)
- an `IMMEDIATE_EVENTS` bypass set that sends a **single** envelope object un-batched
- per-entity throttling (sessions 500ms, tasks 300ms)
- optional per-client subscription filtering by `sessionIds` / `projectId` / `taskIds`
- backpressure (drops above 1MB buffered, terminates clients stuck >30s), 50-client cap

Each envelope is `{ type, event, data, timestamp }` where `type === event`. **A client must branch on `Array.isArray(parsed)`** because batched flushes arrive as arrays and immediate events as single objects — getting this wrong silently drops half the events. The authoritative payload shapes live in `domain/events/DomainEvents.ts` (`TypedEventMap`).

Immediate (un-batched) events: `session:spawn`, `session:resume`, `session:prompt_send`, `session:modal`, `session:modal_action`, `session:modal_closed`, `spell:invoked|activated|deactivated`, `ensemble:created|updated|disbanded|message`.

Known gap: `team:*` events are declared in `TypedEventMap` but are **not** in the bridge's subscribed-event list, so team CRUD is currently not broadcast over WS. Treat teams as REST-poll-only on mobile until verified.

**(2) PTY channel** (`PtyWebSocketServer.ts`, path `/pty?sessionId=<id>`): a completely separate socket per session carrying **raw binary terminal bytes** (no JSON framing, no batching), plus a couple of JSON text control frames. Terminal output is NOT on the entity-sync socket. Details in 2.6.

### 2.3 maestro-ui connection and data flow

maestro-ui talks to the server over two pure-JS channels plus the platform-abstracted terminal.

- **REST:** one singleton `maestroClient` (`utils/MaestroClient.ts`) wraps `fetch()` against `API_BASE_URL` with `credentials: 'include'` and JSON bodies — ~120 typed methods, zero Tauri.
- **Control WebSocket:** lives inside `useMaestroStore.ts` (`connectGlobal()`, L740). It is fire-and-subscribe — **the client sends no subscribe handshake**, so it receives all events. `handleSingleMessage` (L363-725) switches ~40 event names into `Record<id, entity>` maps. `batchSet` coalesces N events into one React render via `queueMicrotask`. Reconnect is exponential backoff capped at 30s plus 0-50% jitter; **on every `onopen` it re-fetches model profiles + the active project's tasks/sessions/teamMembers/teams/taskLists, so a reconnect is a full resync.**
- **URL derivation:** `utils/serverConfig.ts` is the single source of truth. `API_BASE_URL ← VITE_API_URL`; `WS_URL = deriveWsUrl(API)` (http→ws, https→wss, host preserved, no path); `PTY_WS_URL = WS_URL + '/pty'`.
- **Boot order** (`initApp.ts setup()`): `initWebSocket()` first, then fetch entities. Browser/web mode early-return: no native PTYs; on load it re-fetches sessions and re-opens a `/pty` socket for every alive session — the reference reattach pattern for mobile.

Note: `useMaestroWebSocket.ts` is **deprecated/unused**. Mirror `useMaestroStore`, not that hook (though the hook is a clean catalog of event names).

### 2.4 UI surfaces inventory (what the mobile app must offer equivalents of)

maestro-ui (`App.tsx`) is a 3-column shell: left (`AppLeftPanel` = `IconRail` + `MaestroPanel`/`FileExplorer`), center (`AppWorkspace` = terminals/whiteboard/editor/files), right (`SpacesPanel` = Sessions/Resources), with `ProjectTabBar` on top and floating overlays (`TeamView`, `MultiProjectBoard`, `CommandPalette`, detail overlays, `DocViewer`, `AppModals`, spell launcher).

The `IconRail` switches the left panel across 7 sections: tasks, members, teams, skills, lists, graphs, files. `MaestroPanel` is itself tabbed (tasks current/pinned/completed/archived; members/teams; skills; lists; graphs; profiles).

Surfaces split cleanly:

| Reusable (server-data, rebuildable on REST+WS) | Native-only (no server-only path) |
|---|---|
| Tasks board/list + filters + create/edit/assign/pin/complete | Live terminal / PTY interaction (xterm + Tauri) |
| Team members + teams | Monaco code editor |
| Skills browse, task lists, task graphs, model profiles | Excalidraw whiteboard (`invoke save_session_asset`) |
| Session list/tiles (live working + needs-input indicators) | Local file explorer + path picker (Tauri fs) |
| Session detail / stats / timeline / prompts / command-usage | SSH manager |
| Docs / diagrams viewer (markdown + Mermaid) | Session recording / replay (on-disk via Tauri) |
| Multi-project board, project switcher | File attach / draw-to-session (`plugin-dialog`) |
| Spells / spellbook / active spells, resources | App-window lifecycle |

A "mobile mode" already exists in maestro-ui (`useBreakpoint` ≤768px → `MobilePanelNav` bottom bar + `useMobilePanelStore` single-pane switcher), but it is a **responsive reflow of the same desktop app** — it still mounts the Tauri-bound terminal/editor/file panes, so it is not a standalone mobile client.

### 2.5 maestro-web reference client

`maestro-web/src/main.ts` is a ~160-line Vite/TS POC proving a non-Tauri client can drive Maestro over plain HTTP + WebSocket with zero native code. It lists sessions over REST, attaches one terminal over `/pty`, renders with xterm + FitAddon, sends keystrokes as binary frames and resizes as JSON. Its `package.json` deps are just `xterm` + `xterm-addon-fit` + `vite` — no Tauri.

Caveats: the POC has no auth handling and no reconnection (it assumes trusted-loopback), and implements only terminal streaming + session list — none of the entity CRUD, the entity-sync bridge, or spawn UI. Its default port `4570` is a POC value; real servers use 4567/4569/3001. The more complete precedent is maestro-ui's `webTerminal` transport (proven, hardened), not this POC.

### 2.6 Terminal / PTY architecture

Two independent PTY paths, selected by `MAESTRO_PTY_HOST` (`Config.ts:61`, default `tauri`):

- **Path A — `ptyHost='tauri'` (default, desktop-only):** the Tauri Rust process owns the PTY via `portable_pty` (`src-tauri/src/pty.rs`), spawned in-process from the `session:spawn` WS event; output reaches xterm.js through Tauri `pty-output`/`pty-exit` IPC events. 100% Tauri-only, unreachable from a browser/mobile client.
- **Path B — `ptyHost='server'` (headless/web):** `PtyHostService.ts` spawns the agent with node-pty server-side, keeps a 256KB scrollback ring per session, and fans raw output bytes to subscribers over the `/pty` WebSocket (`PtyWebSocketServer.ts`). The spawn and resume routes already call `ptyHostService.spawn(...)` when `ptyHost==='server'` (`sessionRoutes.ts` ~L2172 / ~L2425), passing `cols/rows` so the agent TUI boots at the client's real width.

**Wire protocol for `/pty?sessionId=<id>`** (definitive contract):
- Server→client: text frame `{type:'size',cols,rows}` once on attach (before replay); binary frames = raw PTY output (scrollback replayed first, then live); text frame `{type:'exit',exitCode}` on real process exit.
- Client→server: binary frame = keystroke bytes; text frame `{type:'resize',cols,rows}`.
- Close codes: 1008 = missing sessionId; 1011 = no live PTY (treat as session-over / needs resume); plain close = client detached, PTY keeps running and can be re-attached.
- Binary frames split multibyte UTF-8 across boundaries → use a **per-session streaming `TextDecoder({stream:true})`** or box-drawing/emoji glyphs render as replacement chars.

Critical caveat carried in project memory: node-pty's `onData` does not fire under bun and bun strips the spawn-helper exec bit — **the server PTY process must run under node, not bun.**

---

## 3. The connection contract the mobile app must implement

This is the exact surface a mobile client calls to reuse the server unchanged. Everything below works against the existing server; the only environment requirement is `MAESTRO_PTY_HOST=server` for the terminal rows.

### 3.1 Channels

| Channel | URL | Notes |
|---|---|---|
| REST | `http://<host>:<port>/api/...` | JSON in/out. Port 4569 staging / 3001 prod. |
| Entity-sync WS | `ws(s)://<host>` (bare origin, **no path**) | Receives all events; optional subscribe to filter. |
| PTY WS | `ws(s)://<host>/pty?sessionId=<id>` | One socket per session, `binaryType=arraybuffer`. |
| Health | `GET /health`, `GET /ws-status` | Outside `/api`, no auth. |

### 3.2 REST checklist (read/control plane — all reusable as-is)

| Done | Resource | Endpoints |
|---|---|---|
| ☐ | Auth | `GET /api/auth/status`; `POST /api/auth/login {password}`; `POST /api/auth/logout` |
| ☐ | Projects | `GET/POST /api/projects`; `GET/PUT/DELETE /api/projects/:id`; `PUT /api/projects/:id/master`; `GET /api/projects/:id/docs?kind=` |
| ☐ | Tasks | `GET /api/tasks?projectId&status&parentId`; `POST /api/tasks`; `GET /api/tasks/:id`; `PATCH /api/tasks/:id`; `DELETE`; `GET /api/tasks/:id/children`; `GET/POST /api/tasks/:id/docs`; `POST /api/tasks/:id/timeline`; `POST/GET/DELETE /api/tasks/:id/images[/:imageId]` |
| ☐ | Sessions (read) | `GET /api/sessions?projectId&taskId&status&active&fields=full\|summary`; `GET /api/sessions/:id`; `GET /api/sessions/:id/stats\|mode\|prompts\|command-usage\|docs\|log-digest`; `GET /api/sessions/log-digests` |
| ☐ | Sessions (control) | `POST /api/sessions/spawn`; `POST /api/sessions/:id/resume`; `POST /api/sessions/:id/pty/stop`; `PATCH /api/sessions/:id`; `DELETE`; `POST /api/sessions/:id/prompt`; `POST /api/sessions/:id/events`; `POST /api/sessions/:id/timeline`; `POST /api/sessions/:id/mode`; `POST/DELETE /api/sessions/:id/tasks/:taskId` |
| ☐ | Modals | `POST /api/sessions/:id/modal`; `.../modal/:modalId/actions`; `.../modal/:modalId/close` |
| ☐ | Team members | `GET/POST /api/team-members`; `GET/PATCH/DELETE /api/team-members/:id`; `POST .../archive\|unarchive\|memory\|reset`; `PATCH .../scope` |
| ☐ | Teams | `GET/POST /api/teams`; `GET /api/teams/:id[/tree]`; `PATCH/DELETE`; `POST .../archive\|unarchive`; `POST/DELETE .../members`; `POST/DELETE .../sub-teams` |
| ☐ | Task lists | `GET/POST /api/task-lists`; `GET/PATCH/DELETE /api/task-lists/:id`; `POST/DELETE .../tasks/:taskId`; `PUT .../reorder` |
| ☐ | Task graphs | `GET/POST /api/task-graphs`; `GET/PATCH/DELETE /api/task-graphs/:id`; `POST .../validate` |
| ☐ | Spells | `GET /api/spells/definitions`; `GET /api/spells/entities/:type`; `POST /api/spells/invoke`; `GET/POST /api/spells`; `GET/PUT/DELETE /api/spells/:id`; `POST .../activate\|deactivate`; `GET/POST/PUT/DELETE /api/spells/custom-prompts[/:id]` |
| ☐ | Skills | `GET /api/skills`; `GET /api/skills/:id`; `GET /api/skills/mode/:mode`; `POST /api/skills/:id/reload` |
| ☐ | Model profiles | `GET/POST /api/model-profiles`; `GET/PUT/DELETE /api/model-profiles/:id` |
| ☐ | Ensembles | `GET/POST /api/ensembles`; `GET/PUT /api/ensembles/:id`; `POST/DELETE .../members`; `POST .../disband\|message` |
| ☐ | Master | `GET /api/master/projects\|tasks\|sessions\|context` |
| ☐ | Git | `GET /api/git/capabilities`; `GET /api/sessions/:id/git[/diff\|/pr]`; `POST .../git/branch\|merge\|pr`; `DELETE .../git/worktree` |
| ☐ | Ordering | `GET/PUT /api/ordering/:entityType/:projectId` |
| ☐ | Workflow templates | `GET /api/workflow-templates[/:id]` |
| ☐ | Agent logs | `GET /api/agent-logs/list\|read\|tail` |

### 3.3 Spawn body (the one to get exactly right)

`POST /api/sessions/spawn` — validated by `spawnSessionSchema` (`.strict`):
- `taskIds: string[]` (≥1, required), `projectId?`, `sessionName?`
- `mode?` (`worker|coordinator|coordinated-worker|coordinated-coordinator`, default `worker`)
- `spawnSource?` (default `ui` — **mobile should always use `ui`**; `session` requires an `X-Session-Id` header of a coordinator session, else 403)
- `launchConfig{provider,model,reasoningEffort?,accessMode?}` (non-strict) OR legacy `agentTool/model/reasoningEffort`
- `teamMemberId(s)` / `delegateTeamMemberIds` / `teamId`, `memberOverrides`, `permissionMode`, `useWorktree`, `initialDirective{subject,message}`
- `cols?` / `rows?` (int 1..1000) — the measured PTY size

Returns `201 {success, sessionId, manifestPath, message, session}`, and always emits the `session:spawn` WS event. **The agent process only actually launches when `ptyHost==='server'`.**

### 3.4 Entity-sync WS event checklist

| Done | Group | Events |
|---|---|---|
| ☐ | Handshake | `{type:'ping'}`→`pong`; `{type:'subscribe',sessionIds?,projectId?,taskIds?}`→`subscribed`; `{type:'unsubscribe'}` |
| ☐ | Projects | `project:created\|updated\|deleted` |
| ☐ | Tasks | `task:created\|updated\|deleted\|session_added\|session_removed` |
| ☐ | Task lists | `task_list:created\|updated\|reordered\|deleted` |
| ☐ | Task graphs | `task_graph:created\|updated\|deleted` |
| ☐ | Sessions | `session:created\|spawn\|resume\|updated\|status_changed\|mode_changed\|deleted\|task_added\|task_removed` |
| ☐ | Modals/prompts | `session:modal\|modal_action\|modal_closed\|prompt_send` |
| ☐ | Notifications | `notify:task_completed\|task_failed\|task_in_review\|task_blocked\|task_session_completed\|task_session_failed\|session_completed\|session_failed\|needs_input\|progress` |
| ☐ | Team members | `team_member:created\|updated\|deleted\|archived` |
| ☐ | Spells | `spell:invoked\|activated\|deactivated` |
| ☐ | Ensembles | `ensemble:created\|updated\|disbanded\|message` |
| ☐ | Custom prompts | `custom_prompt:created\|updated\|deleted` (always broadcast) |
| ☐ | Model profiles | `model_profile:created\|updated\|deleted` (always broadcast) |
| ☐ | Teams | `team:*` — **declared but NOT broadcast; poll via REST** |

### 3.5 Client behaviors to port

- Branch on `Array.isArray()` for batched vs immediate envelopes.
- App-level ping (the bridge does not push heartbeats; it only replies to client pings).
- Exponential backoff + jitter reconnect; on `onopen`, re-fetch entities for the active project (full resync).
- Auth: use `?token=` / `Authorization: Bearer` (not cookies — RN has no browser cookie jar). For the WS upgrade, pass `?token=` in the URL when auth is enabled. Loopback bypass does NOT apply to a remote mobile client over a tunnel.
- On the `session:spawn` event, **ignore `command/cwd/envVars`** (those are for a native PTY) and just open the `/pty` socket keyed by the maestro session id — exactly what `webTerminal.createSession` does.

---

## 4. The Atelier design situation

What's designed today is a complete phone UI — and it is genuinely good and already shaped to the server's domain — but it is design specimens, not an app.

- **Location & status:** untracked, static specimens in `"Maestro Design System - mobile/"`. Not committed to git (could be lost). Not connected to anything.
- **Technology:** **web React (DOM + scoped `.m-*` CSS), NOT React Native.** Eight `.jsx` files loaded by `index.html` via React 18 + ReactDOM + `@babel/standalone` + roughjs from the unpkg CDN, compiled in-browser. There is no bundler and no RN toolchain.
- **Tokens:** `colors_and_type.css` is the single source of truth — the `--pn-*` system (paper/ink ramp, brass `--pn-brand`, status run/wait/block/info/idle), `.t-*` type classes, 4px spacing grid, radii, shadows, motion. Light by default; `html[data-theme="dark"]` swaps to warm graphite. Fonts: Newsreader + Hanken Grotesk + JetBrains Mono (currently pulled from Google Fonts).
- **What's designed:** a 4-tab app (Sessions / Tasks / Members / More) with a center "Conduct" FAB, a NowPlaying strip, a full-screen TerminalSheet, and a family of bottom sheets (command, project switcher, create-task, new/edit member, run-config, picker, doc/diagram/docs viewers). Core tiles `MTaskTile` (hierarchical subtask tree, inline status/priority/assignee/model editors) and `MSessionTile` (spawn-chain tree, live status dot, mode/model/strategy meta).
- **The design correctly anticipates the server contract.** The domain enums in `m-data.jsx` already mirror real server entities: `TASK_STATUSES`, session statuses (`spawning/idle/working/run/wait/completed/failed/stopped`), modes (`Worker/Coordinator/Co-Worker/Co-Coordinator`), agent tools (`claude/codex/gemini/terminal`), hierarchical tasks, spawn-chain sessions, docs/diagrams. This is a real advantage — the IA maps 1:1 to the API.

What's missing to make it a real app:

1. **A data layer — entirely.** No fetch, axios, WebSocket, store, base URL, auth, or env config exists anywhere in the kit. Every action is a `window.MUI.notify(...)` toast stub over hardcoded `m-data.jsx` constants. The "connect the same way as maestro-ui" part is 100% unbuilt.
2. **A real (or RN) component layer.** These are DOM components; `--pn-*` vars and `.t-*` classes don't exist in RN. For native, every component must be re-authored (View/Text/Pressable + a JS token theme), the inline-SVG Icon/Glyph/Mark/Gauge need `react-native-svg`, and the rough.js diagram board has no RN equivalent.
3. **A live terminal.** `TerminalSheet` renders canned transcript variants and a static stat strip — it is faked. The real stream is unaddressed.

**Obsolete parallel assets to ignore:** `.design-sync/` and the git-stale `maestro-mobile/` reference a now-deleted Expo RN package with a different, conflicting token system (`--bg-app`/`--accent`/Inter, `PhoneFrame`/`SessionCard`). Do not resurrect them as the baseline — Atelier (`--pn-*`/Newsreader) supersedes them.

---

## 5. The hard problems

### 5.1 Can a mobile client attach to terminal/PTY streams using ONLY the existing server?

**Yes — definitively, with no server code change.** This is the central question and it resolves cleanly from the terminal + web-client findings.

The server already contains a complete, transport-agnostic terminal path: `PtyHostService` (node-pty, 256KB scrollback ring) + `PtyWebSocketServer` (the `/pty` socket). It has **two existing non-native consumers** proving it works: the `maestro-web` browser POC and maestro-ui's own `webTerminal` transport (auto-selected whenever not under Tauri). A mobile client mirrors `webTerminal` exactly: spawn with `cols/rows`, open `ws://host/pty?sessionId=<id>`, render bytes, send keystrokes as binary + resizes as JSON.

The catch is **operational, not code**: the server must run with `MAESTRO_PTY_HOST=server`. The default is `tauri`, under which no server PTY is ever created and every `/pty` attach closes with 1011. Setting the env var is existing, supported behavior — it stays within the "no server changes" constraint, but **it is the make-or-break prerequisite** and must be confirmed on the actual target box. (Unverified from the findings: whether the deployed EC2/Tailscale server currently sets it — check before assuming terminals are live there.)

**Solvable without server changes:** YES (env flag only). **Net-new client work:** the renderer (no xterm.js on RN — needs a WebView-hosted xterm bridged via postMessage, or a native VT emulator), soft-keyboard control-sequence mapping (Ctrl-C, arrows, ESC), and reconnect-on-background leaning on scrollback-replay + the `resume` (1011) flow.

### 5.2 Spawn flow — Tauri-owned parts

In the default `tauri` mode, `POST /api/sessions/spawn` returns 201 and emits `session:spawn`, but the agent process is launched by the **desktop app** reacting to that event and forking a native PTY. A phone cannot fork node-pty. So a mobile spawn against a default-config server creates a Session that never actually runs.

**Solvable without server changes:** YES, but only if the server runs `MAESTRO_PTY_HOST=server` (same flag as 5.1) — then the spawn route launches the PTY server-side. **Same operational prerequisite, not a code change.** The mobile client should always use `spawnSource:'ui'` and ignore the native env payload in the spawn event.

### 5.3 Auth

Web relies on an HttpOnly cookie via `credentials:'include'`; the 401→login flow is skipped when `IS_TAURI`. Neither applies on mobile. RN's cookie handling over fetch + WS upgrade is not automatic.

**Solvable without server changes:** YES. The middleware already accepts `Authorization: Bearer` and `?token=` (the latter is the key for the WS upgrade). Mobile holds the token in the OS keystore and sends it explicitly on both REST and `/pty`/entity-sync WS URLs. Boot handshake: `GET /api/auth/status` → if enabled, `POST /api/auth/login {password}` → then REST + WS with the token. (Exact header parsing in `authMiddleware.ts` should be confirmed before relying on Bearer vs `?token=` parity.)

### 5.4 File access, whiteboard, editor, recordings, SSH

These are Tauri/native desktop surfaces (`save_session_asset`, `plugin-dialog`, local fs, Monaco, Excalidraw, on-disk recordings) with **no server-only path**.

**Solvable without server changes:** PARTIALLY. Read paths exist — docs/diagrams via `GET /api/.../docs` and `inject-diagram`, images as base64 in JSON, agent logs via `GET /api/agent-logs/*`. But local file browsing, draw-to-session asset capture, code editing, recordings, and SSH have no server API and must be dropped or redesigned for mobile. None of this forces a server change; it forces **product scope decisions**.

### 5.5 The `prompt` sender-session problem

`POST /api/sessions/:id/prompt` requires a real `senderSessionId` and forbids self-prompting. A mobile "message an agent" feature has no natural sender session.

**Solvable without server changes:** LIKELY, but needs a product call — either attribute from a dedicated/synthetic session, or use a different control path. Flag for a human decision (section 8). This is a UX/product constraint, not a server-change blocker.

> **No item in this analysis requires a server code change.** Two items (live terminal, spawn-that-actually-runs) require the `MAESTRO_PTY_HOST=server` env flag on the target deployment. If the target server cannot be run in that mode, the mobile app is reduced to a read/control plane (browse + edit entities, cast spells, trigger spawns that won't execute) with no live terminal — which would be a partial product, not a constraint violation.

---

## 6. Recommended stack & architecture

**Primary recommendation: Expo React Native**, targeting a server running in `MAESTRO_PTY_HOST=server` mode.

Rationale:
- The README/SKILL explicitly frame Atelier as a phone app, and `ios-frame.jsx` targets iOS chrome. A native app is the stated intent.
- The data layer ports almost verbatim — `MaestroClient`, `serverConfig` URL derivation, and the entire `useMaestroStore` reconciliation engine need only `fetch` + `WebSocket`, both first-class in Expo/RN. This is the bulk of the app and is low-risk.
- The terminal is solvable: RN's `WebSocket` supports binary (ArrayBuffer), so the `/pty` transport ports directly; the renderer is a **WebView hosting xterm.js**, with bytes bridged in via `postMessage`. This reuses the battle-tested xterm renderer instead of writing a VT emulator.

**The tradeoff:** native RN means re-authoring every Atelier DOM component (the `--pn-*` tokens become a JS theme object, `.t-*` becomes typography styles, inline SVGs move to `react-native-svg`, the rough.js diagram board gets reimplemented in Skia/SVG or deferred). That is real work the design specimens do not give you for free.

**Cheaper alternative: responsive web / PWA.** If "phone app" can flex, wrapping the existing DOM specimens + `mobile.css` is far closer to drop-in — the `.m-*` CSS, the inline SVGs, and the rough.js board all already run in a browser. The terminal can even reuse xterm.js directly (as `maestro-web` does). You'd still build the entire data layer, but you skip the RN re-authoring and the WebView terminal bridge. The cost is a non-native feel, weaker OS integration (push, background, keystore), and divergence from the stated iOS-native design intent. Recommend this only if speed-to-first-usable beats native fidelity.

Either way the server is untouched and the connection contract in section 3 is identical.

---

## 7. Build plan

| Phase | Delivers | Depends on |
|---|---|---|
| **0. Foundation & design port** | Expo app skeleton; `--pn-*` tokens → JS theme + dark mode; `.t-*` typography; offline-bundled fonts; `react-native-svg` port of Icon/Glyph/Mark/Gauge/AgentTile; 4-tab shell (Sessions/Tasks/Members/More) + Conduct FAB + NowPlaying strip + bottom-sheet shells. Pin the Atelier assets into the repo (they are currently untracked). | Atelier specimens (`Maestro Design System - mobile/`) |
| **1. Data layer** | Port `serverConfig` (token/`?token=` auth, not cookies), `MaestroClient` REST methods, the entity-sync WS client with array/single branching, `batchSet` reconciler, backoff reconnect + onopen-resync. Auth handshake (`status`→`login`→token in keystore). | Phase 0; server reachable |
| **2. Read-only surfaces** | Wire every server-data surface to live REST+WS: tasks (board/list/filters/detail), sessions (list/tiles/detail/stats/timeline/prompts), members, teams (REST-poll), skills, lists, graphs, model profiles, docs/diagrams viewer, multi-project view, notifications. Replace all `m-data.jsx` constants. | Phase 1 |
| **3. Actions & spawn** | Mutations: create/edit/assign/pin/complete tasks, create/edit members, cast spells, manage lists/graphs, project switch. Spawn flow: `POST /sessions/spawn` (`spawnSource:'ui'`, `cols/rows`) + consume `session:spawn` (ignoring native payload). Resolve the `prompt` sender-session question. | Phase 2; for spawn-to-run: `MAESTRO_PTY_HOST=server` |
| **4. Terminal** | WebView-hosted xterm bridge; `/pty` transport (binary keystrokes, JSON resize, streaming `TextDecoder`, `{type:'exit'\|'size'}` + 1011 handling); reattach-per-alive-session on boot; soft-keyboard control sequences; `POST .../pty/stop` on explicit stop. | Phase 3; **hard prerequisite: server in `MAESTRO_PTY_HOST=server` mode, running under node not bun** |
| **5. Polish** | Background/foreground reconnect hardening, subscription filtering to reduce bandwidth, push notifications from `notify:*` events, error/empty states, diagram board (Skia/SVG) or graceful read-only fallback, accessibility, theming QA. | Phases 1-4 |

Phases 0-3 deliver a fully useful "remote conductor" (observe and control the orchestra) with no terminal and no hard env dependency. Phase 4 is the separable, higher-risk track gated on the deployment flag.

---

## 8. Risks & open questions

Needs a human decision before/early in the build:

1. **Will the target server run `MAESTRO_PTY_HOST=server`?** Make-or-break for terminal and for spawns that actually execute. Confirm on the actual box (the deployed EC2/Tailscale server's current mode is unverified). If it can't, decide whether a terminal-less control plane is an acceptable v1.
2. **Native RN vs PWA.** Section 6 tradeoff. This decision changes the entire Phase 0 effort and the terminal approach. Needs a call before any code.
3. **Terminal renderer choice:** WebView + xterm.js (recommended, reuses proven renderer) vs a native VT emulator (more native feel, large build). Tied to decision #2.
4. **The `prompt` sender-session model.** No natural sender on mobile. Decide: dedicated synthetic session, or a different control UX. Product question.
5. **Server runtime must be node, not bun** for the PTY host (node-pty's `onData` is broken under bun, and bun strips the spawn-helper exec bit). Confirm the deployment's process manager.
6. **Scope of native-only surfaces** (file browser, whiteboard, code editor, recordings, SSH): fold into a tab, defer, or drop. The Atelier "More" tab lists several of these as rows — decide which are real vs aspirational.
7. **Pin the design assets into git.** `"Maestro Design System - mobile/"` and the Atelier kit are untracked and could be lost. Commit them before building against them.

Unknowns flagged by the findings (verify before relying on them):
- `authMiddleware.ts` exact Bearer vs `?token=` parsing was not fully read.
- The server-side `/pty` framing (binary vs JSON control frames, 1011 semantics) was read mostly from the client transport; cross-check `PtyWebSocketServer.ts` before implementing the mobile transport.
- Whether full agent-spawn-over-`/pty` (manifest/CLI init) works end-to-end on a headless box was not run — only the `/dev/pty-test` raw-shell path is proven.
- `team:*` WS events are declared but appear not to be broadcast — confirm and treat teams as REST-poll until then.
- The control WS pushes all events to all clients; the documented "client-side subscription filtering" is applied in handlers — confirm the `{type:'subscribe'}` filter actually narrows the wire before relying on it for mobile bandwidth.
