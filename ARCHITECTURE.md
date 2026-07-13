# maestro-mobile — Architecture (ratified)

> Ratified by Atlas from the 10 specialist planning docs in `planning/` after cross-review + consensus.
> Hard constraint: reuse the **existing maestro-server unchanged** (REST + entity-sync WebSocket + `/pty`), exactly like maestro-ui. Full connection contract: `MOBILE_APP_BUILD_ANALYSIS.md`.
> v1 connection model: **no auth — direct connection by IP/host:port** (user types the address, connects). `?token=` is a documented FUTURE seam only.

---

## 1. What this is

A standalone **Expo / React Native** app (the Atelier design) that is a *remote conductor* for a running maestro-server: browse and act on tasks, sessions, members, teams, spells, docs; spawn sessions; and attach live terminals. It is a fresh client over the same two pure-JS channels maestro-ui uses, plus the per-session PTY socket.

## 2. Layered architecture (strict, one-directional)

```
        ┌─────────────────────────────────────────────────────────┐
        │  features/  (screens + hooks)   ── split A / B ──        │
        │   A. maestro-panel: Tasks/Members/Teams/Skills/Lists/    │
        │      Graphs/ModelProfiles                                │
        │   B. session-panel: Sessions/detail/stats/timeline/      │
        │      prompts + spawn + terminal launch                   │
        └───────────────▲───────────────────────▲─────────────────┘
                        │ selectors             │ intents
        ┌───────────────┴───────┐   ┌───────────┴─────────────────┐
        │  state/ (Zustand 5)   │   │  components/ (presentational)│
        │  entityStore+batchSet │   │  primitives/controls/        │
        │  selectors, derive use│   │  composite (tiles, sheets)   │
        └───▲───────────▲───────┘   └───────────▲─────────────────┘
            │ ingest     │ fetch-actions          │ theme tokens
   ┌────────┴──────┐ ┌───┴─────────────┐  ┌───────┴─────────────────┐
   │ services/     │ │ services/api/   │  │ theme/ (tokens+svg data) │
   │  realtime/    │ │  MaestroClient  │  │  unistyles registry      │
   │  WS + /pty    │ │  serverConfig   │  └──────────────────────────┘
   └───────▲───────┘ └───────▲─────────┘
           │                 │
        ┌──┴─────────────────┴───┐
        │  domain/ (types + zod + │  ← drift-guarded vs maestro-server/src/types.ts
        │  derive/ status mapper) │
        └─────────────────────────┘
```

Import rule (acyclic): `domain` → `theme` → `components` → (`services`, `state`) → `features` → `navigation`. **No upward imports.** `components/` never imports `features/` or `state/`. `services/realtime` never imports `services/api` (avoids a WS↔REST cycle).

## 3. The eight modules (owners)

| Module | Owner | Responsibility |
|---|---|---|
| `domain/` | Lexicon | Hand-mirrored server entity types + enums; branded IDs; `derive/` (status-derivation mapper, tab predicates); zod v4 schemas at boundaries only (spawn body, WS-envelope parse); a compile-time **drift guard** importing `maestro-server/src/types.ts` and asserting mutual assignability (typecheck-only, never bundled). |
| `theme/` | Bedrock | `--pn-*` → typed JS token theme (light/dark same shape); `.t-*` → typography presets; offline-bundled fonts; `theme/svg/` = **data + assets only** (`paths.ts` M_ICONS/glyph/gauge geometry, `statusColors.ts` keyed off Lexicon's status union, logos); unistyles v3 registry (`StyleSheet.configure`) + `ThemeBoot`. |
| `services/api/` | Conduit | `serverConfig` (runtime host entry, `deriveWsUrl`), `MaestroClient` (native-fetch, ported 1:1 from maestro-ui, **no auth in v1**, injectable `getToken()` → null), typed error model. |
| `services/realtime/` | Pulse | Entity-sync WS client (bare origin, `Array.isArray` branch, backoff+jitter, ~20s ping, resync-on-open) → calls Ledger's `ingestBatch/ingestEvent`; `/pty` `PtyTransport` (per-session arraybuffer socket, streaming `TextDecoder` → **decoded string** out, send-before-open queue, `1011`→exit). deps: `mitt`, `netinfo`. |
| `state/` | Ledger | Zustand 5 `entityStore` (single `set()` writer), `batchSet` reconciler ported verbatim, `Record<BrandedId, Entity>` maps + ordering arrays, `optimisticPatch/rollback`, fetch-actions (call Conduit), `uiStore` (activeProjectId, realtime-status, theme mode), `prefsStore` (MMKV). Selectors consume `domain/derive`. |
| `components/` | Palette | RN re-author of Atelier: `primitives/` (Icon/StatusGlyph/Mark/Gauge/StatusDot/AgentAvatar/Avatar/Text), `controls/`, `composite/` (MTaskTile, MSessionTile, NowPlaying, sheet content primitives). Presentational + intent-callbacks; zero data access. |
| `navigation/` | Compass | expo-router v5; 5-slot tab bar + center Conduct FAB + persistent NowPlaying; per-tab native stacks; `@gorhom/bottom-sheet` v5 `SheetHost` + `useSheetStore` (replaces `window.MUI`); `terminal/[sessionId]` fullScreenModal; `maestro://` deep links; root `_layout` = **connect/host-entry** screen (no login). |
| `terminal/` | Relay | WebView-hosted xterm.js renderer (offline HTML asset) + soft-keyboard control-sequence accessory bar; consumes Pulse's `PtyTransport`; owns the **lazy attach** policy (attach-on-open + bg/fg detach+replay via the server's 256KB scrollback ring). |
| `whiteboard/` | Relay | WebView-hosted `@excalidraw/excalidraw`; loads a scene from a server **doc**, edits, saves back as a doc (`POST .../docs`, Excalidraw-scene JSON). Same WebView-bridge pattern as the terminal. No server change (scenes are docs, not Tauri assets). |
| `features/docs/` | Forge (shared) | Read-only DocViewer: markdown + Mermaid + Excalidraw-scene render from `GET .../docs`; hands off to `whiteboard/` for edit. |
| `__qa__` / tests | Sentinel | jest + jest-expo + `@testing-library/react-native` + MSW v2 + in-repo **Maelstrom** fake server (reproduces entity-sync array/single framing AND `/pty` binary protocol); per-package `tsc --noEmit` gate; phase-gate VERDICT verdicts. |

## 4. Data flow

**Reads (server → UI):**
1. Pulse's WS receives a frame → branches on `Array.isArray` (batched array vs immediate single) → normalizes to a typed envelope → calls `ledger.ingestBatch(array)` / `ledger.ingestEvent(single)`.
2. Ledger's `batchSet` coalesces N events into **one** React render via a single `queueMicrotask`; writes `Record<id,entity>` maps.
3. On WS `onopen`, Pulse calls `ledger.resyncProject(activeProjectId)` (full re-fetch of the active project — the reconnect *is* a resync, like desktop).
4. Screens read via pure `select*(state,args)` selectors wrapped in `useShallow`; tiles render from `domain/derive` (e.g. `toUiSessionStatus`), never raw status.

**Writes (UI → server):**
1. A tile emits an intent callback (`onEditStatus(id)`, `onRun(id)`, …); the feature layer handles it.
2. Inline field edits apply an **optimistic** `optimisticPatch` then call Ledger's fetch-action → Conduit's typed `MaestroClient`; rollback on error.
3. Creates do **not** optimistically insert — they wait for the `*:created` WS echo (single source of truth).
4. **Spawn:** `POST /api/sessions/spawn` with `spawnSource:'ui'` + measured `cols/rows`; then consume the `session:spawn` WS event keyed by session id, **ignoring** its native `command/cwd/envVars`.

**Terminal:**
- Relay opens `/pty?sessionId=<id>` via Pulse's `PtyTransport`; renders streamed bytes in WebView xterm; sends keystrokes as binary, resizes as JSON `{type:'resize'}`; `1011` → session-over/needs-resume. Requires server `MAESTRO_PTY_HOST=server` (confirmed live).
- **Reply-to-agent (prompt sender):** mobile writes keystrokes over the live session's `/pty` socket (the mobile equivalent of desktop `write_to_session`) — no synthetic `senderSessionId`. Synthetic-sender deferred.

## 5. Cross-cutting decisions

- **No auth (v1) — Tailscale/VPN only:** every channel connects to the bare `host:port`; the private network is the security boundary. `getToken()` returns null; `?token=` retained only as a future seam. (Server actually accepts cookie + `?token=` — never `Authorization: Bearer`; preserved as future reference in `services/api`.)
- **No entity persistence (v1):** only tiny prefs (theme mode, last host) persist (MMKV); entities are always re-fetched on connect.
- **Android-first (v1):** RN/cross-platform, but dev-client + testing + platform handling (system back, status/nav bars, Material press, per-weight fonts) target Android first; iOS is a later port. Phone-only (tablet two-pane deferred).
- **No notifications (v1):** background push would require a server-driven push service (a server change) — out of scope.
- **Scope:** drop file browser / Monaco editor / recordings / SSH; **keep** the document viewer (read-only, server-backed) and the Excalidraw whiteboard (WebView + doc persistence).
- **Dev client required:** unistyles v3 + react-native-webview + react-native-mmkv + svg + gorhom all preclude Expo Go.

## 6. Module boundary contracts (the seams that must agree)

| Seam | Contract |
|---|---|
| realtime ↔ state | Pulse owns transport + `Array.isArray` decode + normalize; calls `ledger.ingestBatch/ingestEvent` + `resyncProject`. Ledger owns reducer + `batchSet` + maps (only `set()` writer). One-directional. |
| realtime ↔ terminal | `PtyTransport`: `attach/detach/write(id,Uint8Array)/resize/onOutput(id,string)/onSize/onExit(id,code\|null)`. Pulse = socket+framing+single streaming decoder; Relay = renderer + attach policy. **`measureTerminalSize()` (cols/rows) has ONE owner: Relay** — exported from `terminal/`; session-panel calls it at spawn time (no second impl). Reply-to-agent: session-panel `sendKeys(id,text)` → Relay → `Pulse.write`. |
| theme ↔ components | `theme/svg/` = data/assets only; `components/primitives/` authors the components importing it. Token key-names locked to Palette's enumeration. |
| domain ↔ all | Lexicon publishes entity types, request/response payload types (Conduit), and `derive/` status mapper + tab predicates (Bedrock/Palette/Ledger/Forge consume, never re-implement). |
| navigation ↔ features | Shared `navigation/routes.ts` route-name + param shapes; `SheetHost`/`SheetRequest` union owned by Compass, content rows by Palette. |
| state ↔ features | Pure `select*(state,args)` selectors + `useShallow`; single `entityStore`; `useSessionStore`/`useTaskStore` are selector namespaces over it. |
| api ↔ state | Conduit exports pure `buildServerConfig` + client; Ledger owns the active ServerConfig/host-persistence store and the fetch-actions that call the client. |
