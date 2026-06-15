# Wiring: REST + WebSocket + PTY

> Companion to `architecture.md`. The actual wire-level contracts the browser web-ui talks to. All paths are relative to the server origin (single-origin in web mode — same `host:port` as the static SPA).

---

## 1. REST surface used by the browser

All routes are mounted in `maestro-server/src/server.ts` and validated with Zod. The browser uses the same routes as Tauri except where noted.

### 1.1 Auth (browser-only contract — Tauri short-circuits in `useAuthStore`)

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/auth/status` | Returns `{ authEnabled, authenticated }`. The browser polls this on App mount; `<LoginOverlay/>` mounts if `authEnabled && !authenticated`. |
| `POST` | `/api/auth/login`  | `{ password }` → server sets an HttpOnly cookie on success. |
| `POST` | `/api/auth/logout` | Clears the cookie. |

Auth is enforced by `createAuthMiddleware` for everything under `/api` except `/api/auth/*` and `/health`. WebSocket upgrades are gated by the same cookie or `?token=` in `server.ts:236-245`.

### 1.2 Agent session logs (new for web)

`maestro-server/src/api/agentLogRoutes.ts` — exposes the same data as the Tauri Rust readers (`claude_logs.rs`, `codex_logs.rs`).

| Method | Path | Query | Returns |
|---|---|---|---|
| `GET` | `/api/agent-logs/list` | `provider` (`claude`\|`codex`, default `claude`), `cwd` | `AgentLogFile[]` newest-first, each with `{filename, relativePath?, modifiedAt, size, maestroSessionId|null}` |
| `GET` | `/api/agent-logs/read` | `provider`, `cwd`, `filename` | `{ content: string }` — whole file, capped at 10 MB |
| `GET` | `/api/agent-logs/tail` | `provider`, `cwd`, `filename`, `offset` (default 0) | `{ content, newOffset, fileSize }` — bytes after `offset`, also capped at 10 MB |

Semantics — be careful not to drift these:

- **Claude `cwd` encoding.** Every non-alphanumeric character of the absolute cwd becomes `-`, trailing slash stripped first. The on-disk path is `~/.claude/projects/<encoded>/<filename>.jsonl`. `filename` is validated to end in `.jsonl` and not contain path separators.
- **Codex `cwd` matching.** Files live under `~/.codex/sessions/**/*.jsonl`. There is no encoded directory — instead the first line of each transcript is `{"type":"session_meta","payload":{"cwd":"..."}}` and the service stream-reads only that first line (cap 1 MB) to compare. Discovery walks the whole subtree.
- **Traversal guards.** Codex `filename` is a relative path; it cannot be absolute, cannot contain `..`, and after `realpath` must still be a descendant of `~/.codex/sessions`. Reading also re-verifies the file matches the supplied `cwd` (defends against cross-cwd traversal via a relative path).
- **Maestro session ID extraction.** Each transcript writes `<session_id>sess_*</session_id>` somewhere in its header; the service scans the first 8 KiB (Claude) / 256 KiB (Codex) for it and returns `maestroSessionId | null`. The UI uses this to bind a transcript to a session card.
- **10 MB read ceiling.** Both `read` and `tail` throw if they would have to ship more than 10 MB. UIs should prefer `tail` after the initial `read`.

Web UI consumer: `maestro-ui/src/platform/logs.ts` `webLogs` (thin `fetch` wrapper). Tauri uses the same shape via `tauriLogs` → Rust `invoke` commands — same `SessionLogs` interface so `TerminalStrip.tsx` is host-agnostic at the call site.

### 1.3 Other REST routes (identical across hosts)

The browser uses the standard maestro entity API exactly the way Tauri does. No special-casing.

| Surface | Mount | Notes |
|---|---|---|
| Projects | `/api/projects/*` | CRUD + working-dir + isMaster |
| Tasks | `/api/tasks/*` | Hierarchy, status, docs |
| Task lists | `/api/task-lists/*` | Ordered groupings |
| Task graph | `/api/task-graph/*` | Adjacency for graph view |
| Sessions | `/api/sessions/*` | **incl. spawn / resume** (§4) |
| Skills | `/api/skills/*` | Multi-scope skill loader |
| Ordering | `/api/ordering/*` | Drag-sort persistence |
| Team members | `/api/team-members/*` | Personae |
| Teams | `/api/teams/*` | Groups |
| Model profiles | `/api/model-profiles/*` | Workspace-global |
| Workflow templates | `/api/workflow-templates/*` | Saved compositions |
| Spells | `/api/spells/*` | Contextual prompts |
| Master | `/api/master/*` | Cross-project for master projects |
| Alexa | `/api/alexa/*` | Voice ingress |
| Git | `/api/git/*` | Branch/worktree wiring |

The browser bundle never invokes a Tauri command for any of these — every call lands here.

---

## 2. WebSocket — entity bridge (`/`)

Path: `ws(s)://<host>/`. One per browser tab / Tauri window. JSON frames only — terminal bytes are **not** carried on this channel (they go to `/pty`, see §3).

### 2.1 Connect URL

`utils/serverConfig.ts` resolves `WS_URL` in this order:

1. `VITE_WS_URL` (overridable, used by Tauri staging: `ws://localhost:4569`).
2. If `!IS_TAURI` and `window` exists: same-origin → `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`.
3. Derived from `API_BASE_URL` (`http`→`ws`, `https`→`wss`).
4. Fallback `ws://localhost:4567`.

### 2.2 Auth gate (web only)

`server.ts:236-245` — before any path-based routing on `upgrade`:

```ts
if (authService.enabled) {
  const cookieToken = extractTokenFromCookie(req.headers.cookie);
  const queryToken  = url.searchParams.get('token');
  if (!cookieToken && !queryToken)        → 401, destroy
  if (!authService.verifyToken(token))    → 401, destroy
}
```

Both the bridge and `/pty` go through this gate. Tauri's cookie store carries the session if auth is enabled, but in practice the desktop app runs against a server without auth enabled.

### 2.3 Server fan-out (`WebSocketBridge`)

Implementation: `maestro-server/src/infrastructure/websocket/WebSocketBridge.ts` (not reproduced here — read it for buffer caps and exact event names).

- 50 ms message batching to amortize tiny entity updates.
- Per-entity throttling — sessions: 500 ms, tasks: 300 ms — to keep busy editing from saturating the channel.
- Per-client subscription filtering by `sessionIds`, `projectId`, `taskIds`. Clients send a subscription frame after connect.
- Immediate bypass for `session:spawn_request` and modal events — those cannot wait for the batch flush.
- `maxPayload: 1 MB` inbound (server-side cap).
- Server-side global cap: `MAX_WS_CLIENTS` (default 50) — additional connections are rejected at the `upgrade` step.

### 2.4 Client (`useMaestroStore.initWebSocket`)

`maestro-ui/src/stores/useMaestroStore.ts:1443` — opens `new WebSocket(WS_URL)`, subscribes to the active project/sessions, and dispatches incoming frames into the zustand store (projects, tasks, sessions, teams, spells, modals, animations). Tauri and browser use the same code path.

---

## 3. WebSocket — PTY channel (`/pty`)

Path: `ws(s)://<host>/pty?sessionId=<maestro-session-id>`. **Web only.** One socket per active session terminal. Carries the live PTY byte stream and a tiny control sub-protocol.

### 3.1 Why a separate channel

The bridge channel batches JSON every 50 ms and throttles per entity. Putting interactive keystrokes there would smear typing latency to ~50 ms minimum and risk drops under throttle. The PTY channel:

- Never batches.
- `maxPayload: 10 MB` (vs 1 MB on the bridge) — comfortably accepts pasted multi-MB blobs.
- `binaryType = 'nodebuffer'` (server) / `'arraybuffer'` (client) — bytes round-trip without intermediate string coercion.

### 3.2 Connection lifecycle

```
client          server
  │
  │── GET /pty?sessionId=<id> (Upgrade) ──▶
  │
  │     server.ts:upgrade handler:
  │       - auth gate (cookie or ?token=)
  │       - pathname === '/pty' → ptyWss.handleUpgrade
  │     PtyWebSocketServer.handleConnection:
  │       - parseSessionId  (missing → close 1008)
  │       - ws.binaryType = 'nodebuffer'
  │       - size = ptyHostService.getSize(sessionId)
  │       - if size:  send text frame {"type":"size","cols":n,"rows":n}
  │       - attached = ptyHostService.addSubscriber(sessionId, ws)
  │           addSubscriber replays the per-session 256 KiB ring buffer
  │           (binary frames), THEN adds ws to the live fan-out set
  │       - if !attached:  close 1011 'no live PTY for session'
  │
  │◀── text {"type":"size","cols":n,"rows":n} ──
  │◀── binary <scrollback>                    ──
  │◀── binary <scrollback>                    ──
  │
  │── binary <keystrokes>      ──▶  PTY.write()
  │── text {"type":"resize",cols,rows} ──▶  PTY.resize()
  │
  │◀── binary <live output>  ──
  │
  │     PTY exit:
  │       PtyHostService.onExit → close all subscriber sockets
  │       (server stops sending; client onclose fires; webTerminal cleans decoder)
  │
  │     OR client close:
  │       PtyWebSocketServer.ws.on('close') → removeSubscriber
```

### 3.3 Control / data frame matrix

| Direction | Frame type | Payload | Meaning |
|---|---|---|---|
| server → client | text | `{"type":"size","cols":n,"rows":n}` | Authoritative PTY size. Sent once on attach, **before** scrollback bytes. |
| server → client | text | `{"type":"exit","exitCode":n|null}` | PTY exited (also closes the socket). |
| server → client | binary | raw bytes | PTY output (scrollback first, then live). |
| client → server | binary | raw bytes | Keystrokes (`TextEncoder().encode(data)`). |
| client → server | text | `{"type":"resize","cols":n,"rows":n}` | Resize request — server validates `Number.isFinite` for both before forwarding to `PtyHostService.resize`. |

Anything else on either direction is ignored (server: control frame parse failure swallowed; client: `JSON.parse` failure falls through to "treat as PTY output", which is fine because PTY output normally arrives as binary anyway).

### 3.4 Why the leading `{type:'size'}` matters

The PTY's ring buffer holds bytes that were emitted at *some* width. If the client mounts an xterm at a different width and starts writing the replay into it, line-wraps happen at the wrong column → garbled history (the classic "broken box-drawing" symptom).

The fix in `PtyWebSocketServer.handleConnection` is to send the size **before** `addSubscriber` — `addSubscriber` is what flushes the ring, so by the time the client receives the first binary frame it has already seen the `size` control frame and resized its xterm. The client wires this in `useSessionStore` via `platform.terminal.onSize?.(handler)` and stashes the size in `serverPtySizes` for terminals that haven't mounted yet.

### 3.5 Per-session streaming UTF-8 decoder

`webTerminal._decodeFor(id, bytes)` uses one `TextDecoder({stream: true})` per session id. Required because:

- PTY frames arrive on arbitrary byte boundaries — a multi-byte UTF-8 glyph can straddle two frames.
- A non-streaming decode emits `�` (`�`) on incomplete tails.
- The streaming decoder buffers the incomplete tail until the next chunk arrives.
- Per-session, **not** global: two interleaved sessions would otherwise inject each other's partial bytes into the same decoder state.

Cleared in `webTerminal.closeSession(id)` and `ws.onclose`.

### 3.6 Resize race

`resize` can fire from `xterm-addon-fit` before the WebSocket's `onopen` has resolved (e.g. when a terminal mounts and immediately fits). `webTerminal._sendFrame` handles this by queuing the frame in `_pendingSends.get(id)` and flushing it from `ws.onopen`. The same queue is reused for any pre-open keystroke (in practice, keystrokes can't arrive before connect because the input is blocked, but the safety is worth the few lines).

### 3.7 Failure codes you might see

| Code | Reason | Likely cause |
|---|---|---|
| 1008 | `missing sessionId` | Client built the URL without `?sessionId=`. |
| 1011 | `no live PTY for session` | Server hasn't spawned a PTY for this id. Either the session never started, or `MAESTRO_PTY_HOST !== 'server'`, or a spawn/resume handler forgot to call `ptyHostService.spawn(...)` (the historical RESUME bug — see `architecture.md` §3.5). |

---

## 4. Spawn & resume: the call/return path

This is where `MAESTRO_PTY_HOST=server` actually changes behavior. Both endpoints are in `maestro-server/src/api/sessionRoutes.ts`.

### 4.1 `POST /api/sessions/spawn` (~lines 1885-1902)

```ts
await eventBus.emit('session:spawn', spawnEvent);   // (1) bridge event for Tauri shell

if (config.ptyHost === 'server') {                  // (2) server-hosted PTY path
  ptyHostService.spawn({
    sessionId: session.id,
    command, cwd,
    env: finalEnvVars,
  });
}
```

In Tauri: the bridge event arrives at the desktop shell, which spawns the PTY locally and reports the new terminal back via the regular `pty-output` event stream. `config.ptyHost` is `'tauri'` so the server-side `ptyHostService.spawn` does not run.

In web: `config.ptyHost` is `'server'`, so `ptyHostService.spawn` fires immediately. The bridge event is still emitted (some downstream subscribers listen for it for analytics/notifications), but **no one is listening for it on the desktop side**, because there is no desktop side. As soon as `spawn` returns, the PTY is registered; the browser then opens `/pty?sessionId=<id>` and `addSubscriber` succeeds.

### 4.2 `POST /api/sessions/:id/resume` (~lines 2129-2148)

The same mirror — and this one used to be missing:

```ts
await eventBus.emit('session:resume', resumeEvent);

if (config.ptyHost === 'server') {
  ptyHostService.spawn({
    sessionId: session.id,
    command, cwd,
    env: finalEnvVars,
  });
}
```

Before this branch existed, RESUME in the web build emitted `session:resume` but never started the PTY. The browser's PTY WebSocket attached to a non-existent session, the server replied `1011 'no live PTY'`, and resume hung. The Tauri path was fine because the Rust shell still listens for `session:resume` and spawns locally. The fix is the symmetric `ptyHostService.spawn(...)` call here.

### 4.3 `POST /api/sessions/:id/start-server-pty`

There is also an explicit endpoint (~`sessionRoutes.ts:474`) for cases where the caller wants to start the server PTY for a session that already exists. It requires `MAESTRO_PTY_HOST=server` — otherwise it returns:

```
400 { code: 'server_pty_disabled',
      message: 'Server-hosted PTY is disabled. Start with MAESTRO_PTY_HOST=server.' }
```

Useful as a manual recovery hook.

---

## 5. URL & env-var matrix

A quick lookup for what controls what:

| Setting | Where read | Effect |
|---|---|---|
| `MAESTRO_PTY_HOST=server` (env) | `Config.ts:126` | Server spawns/owns PTYs; spawn & resume routes start them. |
| `MAESTRO_PTY_HOST=tauri` (default) | same | Server emits events but does not start PTYs. |
| `PORT` (env) | `Config` | HTTP port (web launcher: 4570; staging: 4569; prod: 2357). |
| `DATA_DIR` / `SESSION_DIR` (env) | `Config` | Where entities and session files are persisted. |
| `MAX_WS_CLIENTS` (env) | `server.ts:220` | Bridge channel cap. Default 50. |
| `VITE_APP_MODE=browser` | `platform/detect.ts:4` | Forces `IS_TAURI=false` even when `__TAURI_INTERNALS__` is present. |
| `VITE_API_URL` | `serverConfig.ts:119` | Override REST base URL. Defaults to same-origin in web mode. |
| `VITE_WS_URL` | `serverConfig.ts:120` | Override bridge WS URL. Defaults to same-origin. |
| `VITE_PTY_WS_URL` | `serverConfig.ts:121` | Override PTY WS URL. Defaults to `${WS_URL}/pty`. |
| `SKIP_BUILD=1` (env, launcher) | `scripts/start-web.sh` | Skip the UI+server build step. |

---

## 6. Channel summary

```
Browser tab ────► HTTP  /                       ► express.static → maestro-ui/dist
              ──► HTTP  /api/auth/*             ► AuthService
              ──► HTTP  /api/*                  ► entity services (gated by auth middleware)
              ──► HTTP  /api/agent-logs/*       ► AgentLogService (web-only consumer)
              ──► WS    /                       ► WebSocketBridge (entity sync, batched JSON)
              ──► WS    /pty?sessionId=<id>     ► PtyWebSocketServer → PtyHostService (binary + tiny JSON)
```

Tauri client behavior:

```
Tauri shell  ────► HTTP  /api/*                 ► same entity REST
              ──► WS    /                       ► same bridge
              ──► invoke('create_session' / 'write_to_session' / 'resize_session' / 'close_session')
                                                 ► Rust shell → portable-pty
              ──► listen('pty-output' / 'pty-exit')
                                                 ► Rust shell event stream
              ──► invoke('list_claude_session_logs' / ...)
                                                 ► Rust shell file readers
```

Same entity-sync plane; different live-data plane. The whole point of `platform/` is to make those two live-data planes share a single call site.
