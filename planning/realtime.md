# planning/realtime.md — Realtime layer (Pulse)

Scope: `services/realtime/` — the **entity-sync WebSocket client** and the **`/pty` terminal transport** for maestro-mobile. This layer is the single nervous system between the unchanged maestro-server's two WebSocket channels and the rest of the app. It owns the sockets, the reconnect/heartbeat policy, byte decoding, and event normalization. It owns **no UI and no store** — it emits normalized, typed events that Ledger reconciles, and exposes a per-session terminal transport that Relay renders.

Grounded against the real maestro-ui implementations I am mirroring:
- `useMaestroStore.connectGlobal()` (`maestro-ui/src/stores/useMaestroStore.ts:740`) — entity-sync socket, `Array.isArray` branch (`:728`), backoff+jitter reconnect (`:780`), onopen full resync (`:751`), StrictMode stale-socket guard (`:778`).
- `webTerminal` transport (`maestro-ui/src/platform/terminal.ts:163`) — per-session `/pty` socket, `binaryType='arraybuffer'`, per-session streaming `TextDecoder` (`:71`), control-frame parsing (`:103`), 1011→exit (`:142`), pending-send queue (`:151`).
- `serverConfig` URL derivation (`maestro-ui/src/utils/serverConfig.ts`) — `WS_URL` = bare origin (no path), `PTY_WS_URL = WS_URL + '/pty'`.

---

## 1. Recommended architecture

Two independent socket subsystems behind one module-scoped service. **Neither lives inside the React tree** — they are singletons created once at app boot, exactly like maestro-ui keeps `globalWs` in module scope (not a hook). `useMaestroWebSocket.ts` is deprecated in the desktop app for this reason; we do not repeat it.

### 1.1 Entity-sync client (`EntitySyncClient`)

- **One** global socket to the **bare origin** (`WS_URL`, no path). **v1 has NO auth** (ratified user directive): the user types `host:port`, taps connect — no token/login/cookie/Bearer/`?token=`. `?token=` is retained only as a documented **FUTURE seam** for when server auth is enabled. The server routes any non-`/pty` upgrade to the entity-sync bridge.
- **No subscribe handshake** on connect — the bridge fans all ~60 events to every client; maestro-ui never sends `{type:'subscribe'}`. We default to "receive all" and treat the documented subscription filter as an unverified bandwidth optimization (see Risks).
- **`Array.isArray(parsed)` branch is mandatory.** A 50ms batched flush arrives as a JSON **array** of envelopes; `IMMEDIATE_EVENTS` (spawn/resume/prompt_send/modal/spell/ensemble) arrive as a **single** envelope object. Getting this wrong silently drops half the stream. Mirror `handleMessage` (`:728`): `const messages = Array.isArray(parsed) ? parsed : [parsed]`.
- Each envelope is `{ type, event, data, timestamp }` with `type === event`. The normalizer (1.3) turns each into a typed `RealtimeEvent` from Lexicon's union and emits it.
- **Reconnect:** exponential backoff `min(1000 * 2^attempts, 30000)` + `0–50%` jitter, identical to `:780`. Reset `attempts=0` on `onopen`. Keep the **stale-socket guard** (`if (current !== ws) return` before scheduling a reconnect) — even without React StrictMode, AppState-driven reconnects can leave a zombie socket whose late `onclose` would otherwise schedule a spurious reconnect and cause duplicate `prompt_send` fan-out.
- **App-level ping (heartbeat):** the bridge pushes **no** heartbeat; it only replies `pong` to a client `{type:'ping'}`. RN has no browser keep-alive and the OS aggressively suspends background sockets, so we run our own interval (~20s) sending `{type:'ping'}` and treat a missing `pong` within a window (or a `NetInfo` drop) as a dead socket → force reconnect. This also keeps us under the server's "terminate clients stuck >30s" backpressure rule.
- **onopen = full resync.** maestro-ui re-fetches model profiles + the active project's tasks/sessions/teamMembers/teams/taskLists on every `onopen` (`:755`). **Ratified seam:** on open, `EntitySyncClient` calls `ledger.resyncProject(activeProjectId)` directly (Ledger owns the fetch-actions, which call Conduit's typed REST). `activeProjectId` is read from `uiStore` via `getState()` (the desktop's `activeProjectIdRef` equivalent). Realtime depends on `state` only (one-directional, acyclic — Ledger never imports realtime); it does **not** import `services/api`. WS-down windows drop events; the resync is what makes a reconnect authoritative.

### 1.2 PTY transport (`PtyTransport`)

A near-verbatim port of `webTerminal` (`terminal.ts:163`), which is already the proven non-Tauri transport. Per-session sockets, keyed by maestro `sessionId`:

- `ws://<host>/pty?sessionId=<id>`, `binaryType = 'arraybuffer'`. (No `&token=` in v1 — no auth; future seam only.)
- **Server→client:** one `{type:'size',cols,rows}` text frame on attach (before scrollback replay) → binary frames (256KB scrollback replayed first, then live) → `{type:'exit',exitCode}` on real process exit.
- **Client→server:** binary frame = keystroke bytes; `{type:'resize',cols,rows}` text frame.
- **Per-session streaming `TextDecoder({stream:true})`** (`terminal.ts:71`) so a multi-byte UTF-8 glyph split across two frames (box-drawing, emoji, Claude's ⏺/✻) doesn't render as `�`. **Must be per-session** so interleaved sessions don't bleed partial bytes.
- **Close codes:** `1008` = missing sessionId (programmer error); `1011` = no live PTY → fire `onExit` (session over / needs resume); plain close = we merely detached, the server PTY keeps running and is re-attachable — **do not** fire exit.
- **Pending-send queue** (`terminal.ts:151`): a `resize`/keystroke issued before `onopen` is buffered and flushed on open. Keep this; the first resize from the renderer routinely races the socket.
- **Attach policy is Relay's, not mine:** the transport exposes `attach`/`detach`; Relay drives **lazy attach-on-open + bg/fg detach+replay** (ratified). The server replays its 256KB scrollback ring on every (re)attach, so foregrounding restores context for free — no client-side terminal persistence.

### 1.3 Event normalization (`eventNormalizer`)

- Input: a raw frame. Output: a Lexicon-typed `{ event, data }` envelope. **Ratified seam (Pulse↔Ledger):** I own transport + `Array.isArray` decode + envelope-normalize and call **`ledger.ingestBatch(envelopes[])`** for an array flush or **`ledger.ingestEvent(envelope)`** for a single immediate envelope. The `switch(event)` reconciliation (`task:*`, `session:*`, …) and `batchSet` are **Ledger's** — I never touch the store's `set`. This is a direct imperative call (not a generic pub/sub) so the whole array coalesces under Ledger's one `queueMicrotask`.
- **No runtime Zod on the hot path.** The server already validated on write; per-message Zod parsing of a 60-event firehose is a battery/jank risk on device. Use Lexicon's compile-time types and a `__DEV__`-only assertion that warns on unknown event names (catches contract drift without shipping the cost).
- The normalizer is the **only** place that knows envelope wire shape; Ledger consumes `{event,data}` and applies entity-shape knowledge in its reducer.

### 1.4 Public surface (`index.ts`)

```
createRealtime({ getWsUrl, getPtyWsUrl, ledger }) → {
  entitySync: { connect(), disconnect(), setActiveProject(id), status$ },
  pty: PtyTransport,   // attach/detach/write(bytes)/resize/onOutput(string)/onExit/onSize  (Relay-agreed)
}
```

The entity-sync client holds a reference to Ledger's `ingestBatch`/`ingestEvent`/`resyncProject` (injected, not imported, so the dependency direction is explicit). URLs come from Conduit's `serverConfig` (bare `WS_URL`/`PTY_WS_URL`; **no token getter in v1** — no auth). A thin `RealtimeProvider` (or a boot call in app root) starts `entitySync.connect()` once and wires AppState/NetInfo.

**`/pty` `PtyTransport` interface (ratified with Relay):** `attach(id)` / `detach(id)` (close, PTY keeps running) / `write(id, bytes: Uint8Array)` (Relay produces the raw bytes — UTF-8 text *and* control sequences — I just frame+send) / `resize(id, cols, rows)` / `onOutput(id, text: string)` / `onSize(id, {cols,rows})` / `onExit(id, code|null)`. I own the socket, framing, the per-session streaming decoder, the send-before-open queue, and `1011→onExit(null)`; I hand Relay **pre-decoded strings** (single decoder lives here, WebView stays trivial). **Relay owns renderer + attach policy:** v1 is **lazy attach-on-open + bg/fg detach+replay** (ratified — Atlas accepts lazy over eager-reattach-all); my transport is mechanism, Relay drives *when* to attach.

---

## 2. Library choices (with rationale + rejected alternatives)

### 2.1 WebSocket client → **React Native's built-in global `WebSocket`** (no library)
RN ships a WHATWG-ish `WebSocket` backed by native iOS/Android sockets. It supports `binaryType='arraybuffer'`, binary receive as `ArrayBuffer`, and binary send via `ArrayBuffer`/typed-array — everything both channels need. maestro-ui uses the platform `WebSocket` directly; matching that keeps the port near-verbatim.
- **Reject `socket.io-client`** — the server is raw `ws`, not Socket.IO; protocol mismatch, won't connect.
- **Reject `react-native-use-websocket` / `react-use-websocket`** — hook-based, ties the socket to a component's lifecycle and re-render cycle. Our socket must outlive any screen (it's app-global and survives navigation), exactly why maestro-ui keeps it in module scope, not a hook.
- **Reject `@stomp/stompjs`** — STOMP framing the server doesn't speak.
- **Reject `reconnecting-websocket`** — it would hide the reconnect loop, but we need bespoke control: onopen-resync, the stale-socket guard, app-level ping, and AppState/NetInfo integration. Hand-rolling ~40 lines (already proven at `:740`) is clearer than fighting a generic wrapper.

### 2.2 Streaming UTF-8 decode → **Hermes built-in `TextDecoder` if it honors `{stream:true}`, else a zero-dep hand-rolled `StreamingUtf8Decoder`**
This is the single most load-bearing realtime dependency and the highest-risk one (see §5.1). Hermes added `TextEncoder`/`TextDecoder`, but **streaming-mode support is not guaranteed** across the Expo SDK we land on. Plan: probe at boot; if `new TextDecoder().decode(bytes,{stream:true})` correctly holds a split multibyte tail, use it; otherwise fall back to a ~40-line incremental decoder that buffers the trailing incomplete UTF-8 sequence between frames.
- **Reject `text-encoding`** (the classic polyfill) — unmaintained since 2017, ~64KB, and its streaming support is shaky. Dead weight if Hermes already has it.
- **Reject `fastestsmallesttextencoderdecoder` / `fast-text-encoding`** — no `{stream:true}`; they'd reintroduce the `�` bug on glyph boundaries, which is the entire reason the desktop uses a streaming decoder.
- **Reject `@stardazed/streams-text-encoding`** — pulls a WHATWG streams polyfill we don't otherwise need.

### 2.3 Event emitter → **`mitt@^3.0.1`** (≈200 bytes) for the public realtime event bus
Tiny, typed, framework-agnostic, no deps. Cleaner than the hand-rolled handler arrays `webTerminal` uses (`_outputHandlers` etc.), and gives Ledger a single typed `on('event', …)` subscribe point.
- **Reject `eventemitter3`** — fine but larger and untyped-by-default; mitt's generic map fits Lexicon's event union directly.
- **Reject RN's `DeviceEventEmitter` / `EventEmitter`** — RN-internal, string-typed, semver-unstable, intended for native module bridging.

### 2.4 Network reachability → **`@react-native-community/netinfo@^11`**
Lets us detect offline/online and switch transitions to drive immediate reconnect (instead of waiting out a backoff timer) and to suspend pings while offline. Expo-supported.
- **Reject polling `navigator.onLine`** — unreliable/absent on RN.

### 2.5 App lifecycle → **`AppState` from `react-native`** (built-in)
Foreground/background transitions drive: reconnect entity-sync on resume, reattach `/pty` sockets, pause heartbeat while backgrounded. No library needed.

**Net new deps for this layer: `mitt`, `@react-native-community/netinfo` (+ a conditional decoder fallback file).** Everything else is RN built-ins.

---

## 3. Folder structure (`services/realtime/`)

```
services/realtime/
  index.ts                    # createRealtime() factory + public types; the only import surface
  entitySync/
    EntitySyncClient.ts       # singleton socket: connect, message branch (Array.isArray), onopen resync hook, status
    reconnect.ts              # backoff(attempts) = min(1000*2^n, 30000) + 0–50% jitter; pure, unit-tested
    heartbeat.ts              # {type:'ping'} interval + pong/NetInfo liveness watchdog
    eventNormalizer.ts        # envelope {type,event,data,timestamp} → Lexicon RealtimeEvent; __DEV__ unknown-event warn
  pty/
    PtyTransport.ts           # per-session socket manager; implements the shared TerminalTransport interface
    streamingDecoder.ts       # per-session TextDecoder({stream:true}) or zero-dep fallback
    frames.ts                 # parse/build control frames: {type:size|exit} in, {type:resize} out
  lifecycle/
    appState.ts               # AppState foreground/background → reconnect + reattach
    netinfo.ts                # NetInfo online/offline → reconnect-now / pause-ping
  types.ts                    # re-exports Lexicon event/envelope types + local Status/Transport interfaces
  __tests__/
    reconnect.test.ts         # backoff/jitter bounds
    eventNormalizer.test.ts   # array vs single branch; each event group
    streamingDecoder.test.ts  # split-multibyte glyph across frame boundary
```

Rationale: `entitySync/` and `pty/` are fully independent (different sockets, lifecycles, framing) and split cleanly; `lifecycle/` holds the two cross-cutting reconnect drivers; `index.ts` is the only thing other teams import.

---

## 4. Best practices

- **Singleton sockets, module scope, started once.** Never instantiate per-screen. Survive navigation; one entity-sync socket app-wide; at most one `/pty` socket per session id (`_ensureSocket` dedupes, `terminal.ts:82`).
- **Idempotent reconnect.** `connect()` no-ops if already connecting/open (mirror the `globalConnecting` guard, `:741`). The stale-socket guard prevents zombie-close reconnect storms.
- **Decode bytes, never strings, for PTY output** — and always through the per-session streaming decoder; control frames arrive as **text** frames and are parsed separately (try/parse, fall through to output on failure, `terminal.ts:103`).
- **Queue sends before open** (`_pendingSends`) so the renderer's first resize/keystroke isn't lost.
- **Trust the server, validate at the dev boundary only.** No per-message Zod on the firehose; `__DEV__` assertions catch drift.
- **Resync over replay.** Don't try to buffer/replay missed entity events across a disconnect; just re-fetch on `onopen`. (PTY is the exception — the server replays 256KB scrollback for us.)
- **No auth in v1** — connect straight to `host:port`. If/when auth returns, the seam is `?token=` in the WS URL (never cookies — RN has no cookie jar, and the browser-style `WebSocket` constructor can't set an `Authorization` header). Keep the URL builder token-ready but pass nothing in v1.

---

## 5. Risks

### 5.1 Hermes streaming `TextDecoder` gap — **highest realtime-specific risk**
If the shipped Hermes lacks `{stream:true}`, naive decoding mangles every box-drawing/emoji glyph that straddles a frame. Mitigation: boot-time probe + zero-dep fallback decoder (§2.2). Must be verified on a real device early, not assumed.

### 5.2 RN WebSocket binary **send** semantics
Receive-as-arraybuffer is solid; **sending** a `Uint8Array` keystroke frame has historically had rough edges on some RN versions (Blob vs ArrayBuffer handling). Verify `ws.send(new TextEncoder().encode(data))` actually delivers raw bytes (not a stringified array) against the server early; fall back to sending an `ArrayBuffer` if needed.

### 5.3 OS background socket teardown
iOS/Android suspend sockets on background; they may silently die without a clean `onclose`. Mitigation: AppState resume → force reconnect entity-sync + reattach all mounted `/pty` sockets; heartbeat watchdog catches half-open sockets.

### 5.4 Reconnect storms / duplicate fan-out
Multiple zombie sockets = server broadcasts `prompt_send` to all of them = duplicate PTY injection (the exact bug the desktop's stale-guard fixes, `:771`). Single global socket + stale-guard + idempotent `connect()` are mandatory, not optional.

### 5.5 `team:*` events not broadcast
The bridge declares but doesn't emit `team:*`. Realtime will never surface team mutations; Ledger/Forge must REST-poll teams. Not a realtime bug — but I must document the gap so nobody waits on a team event that never comes.

### 5.6 Subscription filter unverified
maestro-ui receives all events unfiltered. The `{type:'subscribe', sessionIds/projectId/taskIds}` filter is documented but its actual wire-narrowing is unconfirmed. v1 = receive-all (correct, proven). Treat filtering purely as a later bandwidth optimization, gated on verification.

### 5.7 Heartbeat vs server backpressure
Server terminates clients with >1MB buffered or stuck >30s. On a slow link a flood could buffer; our ~20s ping must not itself be the thing that's stuck. Keep ping cheap; watch for buffered-amount if RN exposes it (it may not).

---

## 6. Cross-team dependencies & open questions

**→ Lexicon (`domain/`):** *blocking for normalizer.*
1. Provide the canonical `WsEnvelope = { type: string; event: string; data: unknown; timestamp: number }` and a **discriminated union `RealtimeEvent`** keyed by event name (mirroring server `domain/events/DomainEvents.ts` `TypedEventMap`) so my `eventNormalizer` can `switch` exhaustively and Ledger gets typed `data`.
2. Confirm the canonical lists of **immediate** vs **batched** events (so I can assert/log, though I branch on `Array.isArray` regardless).
3. Confirm payload shapes for the `notify:*` group (used later for push) and `session:status_changed`.

**→ Conduit (`services/api/`):** *blocking for connect.*
4. Own `serverConfig` (port of `serverConfig.ts`) and **export `WS_URL` (bare origin, no path) + `PTY_WS_URL` (`WS_URL + '/pty'`)** derived from the runtime `host:port` the user enters (stored in AsyncStorage per consensus). I will NOT duplicate URL derivation. Confirm this lives in `services/api` and realtime imports it.
5. ~~WS auth~~ **MOOT in v1** (no auth, ratified). `?token=` stays a documented future seam only; no `getToken()` needed now.

**→ Ledger (`state/`):** *blocking for the emit boundary.*
6. **Who coalesces?** Proposal: realtime emits individual normalized events; **Ledger** batches them into Zustand (microtask or `InteractionManager`) — the desktop's `batchSet` is store-side, and Ledger owns stores. Confirm so I don't double-batch.
7. **Resync wiring:** realtime fires `onResync(projectId)`; Ledger (or Forge) calls Conduit's fetchers. Confirm the callback ownership so realtime stays free of `api`/`state` imports (no cycle).
8. Confirm Ledger sets the active project via `entitySync.setActiveProject(id)` so the `onResync` knows what to re-fetch.

**→ Relay (`terminal/`):** *interface contract.*
9. Agree the shared `TerminalTransport` interface I expose (`createSession/write/resize/closeSession/onOutput(id,text)/onExit(id,code)/onSize(id,{cols,rows})`). I own the socket, decoding, and frames; Relay owns the WebView xterm renderer + keystroke capture.
10. **Who measures and emits `cols/rows`?** Renderer measures; renderer (via my `resize`) sends `{type:'resize'}`. The same `cols/rows` must also go into Forge's spawn body — confirm the measurement source of truth so spawn and first-resize agree.

**→ Forge / Compass (`features/`, `navigation/`):** *boot + lifecycle.*
11. Who calls `entitySync.connect()` at app boot and after login, and `setActiveProject()` on project switch (both drive resync). Propose app-root boot for connect, Compass/Forge for project switch.

**→ Whole team / Atlas:** confirm the `MAESTRO_PTY_HOST=server` target is live (ATLAS_BRIEF says yes — desktop web terminals work) so the `/pty` transport has something to attach to; otherwise `/pty` always closes 1011 and the terminal track is dead-on-arrival.

---

## 7. Summary of decisions

| Decision | Choice | Rejected |
|---|---|---|
| Entity-sync transport | RN built-in `WebSocket`, module-scoped singleton | socket.io, react-use-websocket, reconnecting-websocket |
| Message branch | `Array.isArray(parsed)` → batched vs immediate | assuming one shape |
| Reconnect | `min(1000·2^n, 30000)` + 0–50% jitter, stale-guard, idempotent | generic wrapper |
| Heartbeat | self-issued `{type:'ping'}` ~20s + NetInfo watchdog | relying on server heartbeat (none) |
| Resync | full re-fetch on `onopen` via `onResync` callback | event replay/buffering |
| PTY transport | verbatim `webTerminal` port; per-session socket, arraybuffer | shared socket, JSON framing |
| UTF-8 decode | Hermes streaming `TextDecoder`, else zero-dep fallback | text-encoding, fast-text-encoding |
| Event bus | `mitt@^3` | eventemitter3, DeviceEventEmitter |
| Reachability | `@react-native-community/netinfo@^11` | navigator.onLine |
| Validation | compile-time Lexicon types + `__DEV__` assert | per-message Zod on hot path |
| WS→state seam | direct `ledger.ingestBatch/ingestEvent` + `resyncProject` on open | generic pub/sub bus |
| PTY interface | Relay-agreed `attach/detach/write(bytes)/resize/onOutput(string)/onExit/onSize`, decoder in Pulse | raw bytes to renderer; decoder in WebView |
| Auth (v1) | **none** — direct `host:port` connect | token/login; `?token=` deferred to future seam |
```
