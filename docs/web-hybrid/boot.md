# Boot Sequence: Tauri vs Web

> Companion to `architecture.md`. Focused on the **startup path** — what runs, in what order, on each host, with file/line references.

---

## 1. Two startup paths, one entry

Both hosts boot the **same React entry**: `main.tsx` → `<App/>` (`maestro-ui/src/App.tsx`). Divergence begins at the first effect.

```
App.tsx ─┬─ useAuthStore.checkStatus()      ← (1) web-only
         ├─ initTheme / initRedesignTheme / initZoom
         ├─ initSessionStoreRefs(...)        ← installs platform.terminal listeners (web only inside)
         ├─ initApp(...)                     ← (2) the big branching boot
         ├─ initCentralPersistence()         ← no-op in web (see persistence.ts)
         ├─ initWorkspaceViewPersistence()
         └─ initActiveSessionSync()
```

The only host-only branches at the App-component level are:

| `App.tsx:170` | `if (!IS_TAURI) void checkAuthStatus();` |
| `App.tsx:434` | `if (!IS_TAURI) return;` inside `registerCloseHandler` — Tauri-only `onCloseRequested` |
| `App.tsx:520` | `if (!IS_TAURI && showLogin) return <LoginOverlay/>` |

Everything else flows through `initApp.ts`, where the boot diverges deeply.

---

## 2. `initApp.ts` — phase-by-phase

`initApp.ts` is the bootstrap that wires app state, terminal listeners, persisted state, and entity sync. It runs once on mount.

### Phase A — WebSocket entity sync (both hosts)

```ts
useMaestroStore.getState().initWebSocket();
```

Opens `new WebSocket(WS_URL)` against the server. This is the bridge channel — receives JSON entity events (project/task/session/team/spell create/update/delete + `session:spawn_request` etc.) and the UI's source of truth for everything except the local terminal stream. **Both hosts run this.**

### Phase B — Tauri PTY event listeners (Tauri only)

```ts
if (IS_TAURI) {
  await listen<PtyOutput>('pty-output', ...)
  await listen<PtyExit>('pty-exit', ...)
}
```

The Tauri shell forwards every PTY frame as a `pty-output` event; `initApp.ts` routes it into the live terminal or buffers it in `pendingData`. In the web build these listeners are skipped entirely — the equivalent wiring lives in `initSessionStoreRefs()` against `platform.terminal.on{Output,Size,Exit}` (see §3).

### Phase C — App menu / tray listeners (Tauri only)

```ts
if (IS_TAURI) await listen<AppMenuEventPayload>('app-menu', ...);
if (IS_TAURI) await listen<TrayMenuEventPayload>('tray-menu', ...);
```

There is no app menu or tray in the browser; both are skipped.

### Phase D — Home directory (Tauri only)

```ts
if (IS_TAURI) resolvedHome = await homeDir();
s.ui.getState().setHomeDir(resolvedHome);
```

In web mode `homeDir` stays `null` — used only by features that don't run in the browser anyway (path picker, FS explorer).

### Phase E — Startup flags (Tauri only)

```ts
const startupFlags = IS_TAURI
  ? await invoke<StartupFlags>('get_startup_flags').catch(() => null)
  : null;
```

`get_startup_flags` returns CLI flags passed to the Tauri shell (e.g. `--clear-data`). The web bundle has no such concept — `startupFlags` is always `null`.

### Phase F — Secure storage (Tauri only)

```ts
const stateMeta = IS_TAURI ? await invoke<PersistedStateMetaV1 | null>('load_persisted_state_meta') : null;
if (needsSecureStorage) {
  await invoke('prepare_secure_storage');
}
```

macOS Keychain–backed encryption of environments and recordings. The browser has no Keychain, no native crypto store, and no recording feature — entire block skipped.

### Phase G — Load persisted state (Tauri only)

```ts
if (IS_TAURI) diskState = await invoke<PersistedStateV1 | null>('load_persisted_state');
```

This loads the desktop app's last-known projects + sessions + active-session map from Rust-side storage. In web mode `diskState` is `null` — there is no equivalent file-backed state, because the canonical state lives on the server and gets reconciled in the next sync step.

### Phase H — Project sync with maestro-server (both hosts)

```ts
const serverProjects = await maestroClient.getProjects();
// merge with diskState.projects (web: diskState is the empty default)
```

Both hosts hit `GET /api/projects` and merge. In Tauri this picks up local-only edits made offline; in web there are no local-only edits to reconcile, so `mergedProjects` is just the server list (minus any IDs the user explicitly closed via `closedProjectIds`).

### Phase I — **Browser early-return** (`initApp.ts:545`)

This is the decisive divergence:

```ts
if (!IS_TAURI) {
  s.session.getState().setSessions([]);
  s.session.getState().setActiveId(null);
  s.session.getState().setHydrated(true);
  // schedule periodic update check (no-op in browser, but harmless)
  return;
}
```

The browser does **not** restore local terminal sessions. There are no local terminals to restore — the server owns the PTYs, and the user can re-attach to any live session by clicking it (which opens `/pty?sessionId=<id>` against the still-running server-side PTY). `useSessionStore` is seeded empty; the UI continues to render the entity-synced session list from `useMaestroStore` over WS.

### Phase J — Native session restoration (Tauri only)

After the early-return, Tauri still has work to do:

```ts
const backendSessions = await invoke<TerminalSessionInfo[]>('list_sessions');
// reconcile diskState.sessions with the live PTYs the Rust shell still holds
```

This is what gives the desktop app "session survives UI restart" behavior. In the web build the equivalent guarantee is provided by the server-hosted PTY: closing the browser tab detaches the WebSocket but does not kill the PTY (`addSubscriber` returns `false` on next attach only if the PTY actually exited).

---

## 3. `initSessionStoreRefs` — where web wires its PTY listeners

`useSessionStore.ts:71` — called from `App.tsx`. Body relevant to web mode:

```ts
if (!IS_TAURI) {
  void platform.terminal.onOutput((id, data) => { ...write to xterm or buffer... });
  void platform.terminal.onSize?.((id, size) => { serverPtySizes.set(id, size); resize live xterm });
  void platform.terminal.onExit((id, exitCode) => { ...mark exited, sync to server... });
}
```

These are the web counterparts to `initApp.ts`'s `pty-output` / `pty-exit` listeners. They are registered **once** (handlers go into module-level arrays `_outputHandlers`, `_sizeHandlers`, `_exitHandlers` inside `webTerminal`) and fan out across all WebSockets.

The Tauri equivalents do not run here — `initApp.ts` already attaches `listen('pty-output'|'pty-exit')` itself.

---

## 4. Authentication flow (web only)

Tauri desktop never authenticates — `useAuthStore.checkStatus()` short-circuits to `{authEnabled: false, authenticated: true}` and `<LoginOverlay/>` is never mounted.

The browser path is:

```
App effect (App.tsx:169)
  → useAuthStore.checkStatus()
    → GET /api/auth/status   (credentials: 'include')
      response: { authEnabled: boolean, authenticated: boolean }
  → if (authEnabled && !authenticated) showLogin = true
  → App renders <LoginOverlay/> instead of the workspace (App.tsx:520)

LoginOverlay submit:
  → useAuthStore.login(password)
    → POST /api/auth/login  { password }
    → server sets HttpOnly cookie
    → showLogin = false, workspace mounts
```

WS upgrades (`/`, `/pty`) are gated by the same cookie/token in `server.ts:236-245`, so an unauthenticated browser can't sneak a WebSocket connection past the HTTP guard.

`MaestroClient` (`utils/MaestroClient.ts:83`) also watches REST responses: a `401` while `!IS_TAURI` re-arms the login overlay.

---

## 5. Server-side boot (web mode)

`scripts/start-web.sh` orchestrates this:

1. `bun run build` in `maestro-ui/` — emits `maestro-ui/dist/` (verified by existence of `dist/index.html`, not by `tsc` exit code).
2. `bun run build` in `maestro-server/` — emits `maestro-server/dist/server.js` (same verification trick).
3. `exec node maestro-server/dist/server.js` with env:
   - `MAESTRO_PTY_HOST=server` — flips `Config.ptyHost` so spawn/resume call `ptyHostService.spawn(...)`.
   - `SERVER_URL=http://localhost:4570`, `PORT=4570`, `HOST=0.0.0.0`.
   - `DATA_DIR=~/.maestro/data`, `SESSION_DIR=~/.maestro/sessions` (overrideable).
   - `NODE_ENV=production`.

Inside the server (`server.ts`):

1. `createContainer(); container.initialize()` — instantiates services + DI (including `PtyHostService`).
2. `AuthService` constructed — throws synchronously on misconfiguration **before** the port is bound (so a misconfigured deploy fails fast, doesn't half-start).
3. Express setup: helmet, CORS (localhost + `tauri://localhost`), JSON parser (50 MB), compression (skipping `text/event-stream`).
4. `/api/auth/*` mounted **before** the auth guard.
5. Auth guard mounted (`createAuthMiddleware`).
6. All entity routes mounted under `/api`.
7. `createAgentLogRoutes()` mounted at `/api` — the `/api/agent-logs/*` surface that web `webLogs` calls into.
8. Static SPA: `existsSync(maestro-ui/dist)` → `express.static(...)` + SPA `index.html` fallback (skipping `/api`, `/ws`, `/pty`).
9. HTTP listen on `config.port`. Writes the server URL into `${dataDir}/server-url` so the maestro CLI inside agents can auto-discover it.
10. Two `WebSocketServer({noServer:true})` instances created — `wss` (bridge) and `ptyWss` (PTY, `maxPayload: 10 MB`).
11. `upgrade` handler routes by `pathname` and applies auth gating to both.
12. `new PtyWebSocketServer(ptyWss, ptyHostService, logger)` — wires the PTY protocol described in `wiring.md` §3.
13. `SIGINT`/`SIGTERM` handlers close all sockets, run `wsBridge.shutdown()`, `ptyHostService` is shut down via `container.shutdown()`, and the HTTP server closes. Hard 5 s force-exit timeout as a backstop.

---

## 6. The order, end-to-end (web mode)

```
1. user opens http://localhost:4570
2. server.ts → express.static → returns maestro-ui/dist/index.html
3. browser loads bundle.js  (built with VITE_APP_MODE=browser, so IS_TAURI === false)
4. main.tsx → <App/> mounts
5. App effect 1: useAuthStore.checkStatus → GET /api/auth/status
       if authEnabled && !authenticated → <LoginOverlay/>, stop here until login
6. App effect 2: bootstrap
       - initTheme / initRedesignTheme / initZoom
       - initSessionStoreRefs(...) → wires platform.terminal.on{Output,Size,Exit} (web impls)
       - initApp(...) ↓
            - useMaestroStore.initWebSocket() → opens WS_URL (bridge)
            - skips Tauri pty-output / pty-exit / app-menu / tray-menu listeners
            - skips homeDir / startup flags / secure storage / load_persisted_state
            - GET /api/projects → mergedProjects
            - early-return: setSessions([]); setActiveId(null); setHydrated(true)
7. Bridge WS pushes session list, task list, projects, team members → UI renders.
8. User clicks a running session → SessionTerminal mounts → opens
       new WebSocket(`${PTY_WS_URL}?sessionId=<maestroSessionId>`)
   Server replies: text frame {type:'size',cols,rows} → binary scrollback → live stream.
9. User clicks "Resume" on a stopped session →
       POST /api/sessions/:id/resume
   Server emits session:resume AND (because ptyHost==='server') calls ptyHostService.spawn(...).
   Browser's /pty WS attaches, scrollback streams, terminal is live.
10. User opens Session Log strip → TerminalStrip calls platform.logs.list →
       GET /api/agent-logs/list?provider=claude&cwd=... → AgentLogService → file list.
       Polled every 2 s with /api/agent-logs/tail using the running offset.
```

The Tauri sequence differs at steps 6–10:

- Step 6 runs every Tauri-only branch and `invoke('list_sessions')` to recover live PTYs.
- Step 8 uses `invoke('create_session')` + `listen('pty-output')` instead of `/pty` WS.
- Step 9 spawns the PTY locally in response to the `session:resume` bridge event.
- Step 10 uses `invoke('list_claude_session_logs')` etc. instead of REST.

---

## 7. Failure modes worth knowing

| Symptom | What happened |
|---|---|
| Browser opens `/pty`, server closes `1011 'no live PTY for session'` | `MAESTRO_PTY_HOST` is `'tauri'`, or spawn/resume route forgot to call `ptyHostService.spawn`. The recent fix at `sessionRoutes.ts:2129-2148` is what addressed this for RESUME specifically. |
| Browser opens `/pty`, server closes `1008 'missing sessionId'` | Client built the URL without `?sessionId=` — should never happen with `webTerminal.createSession`, which always appends `opts.maestroSessionId ?? opts.persistId`. |
| Garbled scrollback (wrap at wrong column) | The server's leading `{type:'size'}` control frame didn't reach the client, or arrived after binary data. Check both `PtyWebSocketServer.handleConnection` and the client-side `onmessage` order. |
| Multi-byte glyphs (⏺ / box-drawing / emoji) render as `�` | The per-session `TextDecoder({stream:true})` was bypassed (someone replaced it with a per-frame decoder), or a session-id is being reused across glyph boundaries without resetting the decoder. |
| Session Log strip is empty in the browser | Either `cwd` mismatch (Claude path-encodes the cwd; trailing slash differences matter) or `~/.claude/projects/<encoded>/` doesn't exist. `AgentLogService.list` returns `[]` silently in both cases. |
| Resume hangs in browser, works in Tauri | The classic asymmetry: server emitted `session:resume` but didn't `ptyHostService.spawn`. Fixed in `sessionRoutes.ts:2133`. |
| Server hosts UI but PTY events never fire | Running under `bun` instead of `node`. `node-pty`'s `onData` is the canary; either start under `node` (the launcher does) or run `bun run postinstall` to restore the `spawn-helper` exec bit and then still run under `node`. |
