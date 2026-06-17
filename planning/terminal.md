# planning/terminal.md — Terminal (`terminal/`)

**Owner:** ⌨️ Relay · **Scope:** `terminal/` — the live PTY renderer for maestro-mobile.
**Status:** PLANNING (no code yet). **Reuses the existing maestro-server with ZERO changes.**

This is the one mobile surface with no off-the-shelf equivalent. Everything else in the app is a port of proven code; the terminal renderer is the single net-new build. The **wire protocol is already solved** — `maestro-ui/src/platform/terminal.ts` (`webTerminal`, L82–219) is a complete, hardened, non-native `/pty` client we mirror almost verbatim. The novel work is the *renderer* (xterm in a WebView) and the *soft-keyboard* (control-sequence input), not the transport.

---

## 0. TL;DR decisions

| Decision | Choice | One-line why |
|---|---|---|
| Renderer | **WebView-hosted xterm.js**, bytes bridged via `postMessage` | Reuse the battle-tested VT engine; a native emulator is months of work for worse fidelity. |
| WebView lib | **`react-native-webview` ^13.12** (via `npx expo install`) | The only mature, Expo-supported WebView. No real alternative. |
| xterm packages | **`@xterm/xterm` ^5.5 + `@xterm/addon-fit` ^0.10**, *bundled into a static HTML asset at build time* (NOT a Metro dep) | Runs inside the WebView's own JS context, not RN. DOM renderer only. |
| Renderer addon | **DOM renderer (default). NO WebGL/Canvas addon.** | Project memory: WebGL/Canvas xterm addons crash in this stack ([[project-xterm-renderer-addon-deadend]]). |
| `/pty` transport ownership | **Pulse owns `services/realtime/ptyTransport`; Relay consumes it.** | Keeps file scopes disjoint; the transport is a sibling of the entity-sync WS. See §6. |
| Multibyte safety | per-session **streaming `TextDecoder({stream:true})`** (in the transport, Pulse) | A glyph (box-draw, emoji, `⏺`/`✻`) can straddle two frames → `�` without it. |
| Keyboard | hidden `TextInput` (text capture) + a custom **accessory control bar** (Esc/Tab/Ctrl/arrows/Ctrl-C) | No native soft keyboard emits control bytes; we synthesize them. |
| Reattach | **lazy attach on open + keep-alive while foregrounded**, warm-replay via server's 256 KB scrollback ring | Mobile bandwidth/battery; the server replays history on every (re)attach for free. |

**Hard prerequisite (operational, not code):** the target server MUST run `MAESTRO_PTY_HOST=server` **and under node, not bun** (node-pty's `onData` is silent under bun; bun strips the spawn-helper exec bit — [[project-node-pty-bun-incompatibility]]). Per Atlas' brief this is **confirmed live** (the web UI's terminals work). If a future target reverts to the default `tauri` mode, every `/pty` attach closes `1011` and the terminal feature is dead — the rest of the app is unaffected.

---

## 1. Why WebView + xterm.js (and what I rejected)

**Chosen: a `react-native-webview` hosting a self-contained xterm.js page.** RN's `WebSocket` already speaks binary (`binaryType='arraybuffer'`), so the `/pty` transport ports directly; the only thing with no RN primitive is the *terminal grid renderer*, and xterm.js is the same engine maestro-ui, maestro-web, and VS Code all use. Embedding it in a WebView buys us: correct VT100/xterm escape handling, reflow, selection, scrollback, link detection, and theming — none of which we want to reimplement.

Rejected alternatives:

- **Native VT emulator in RN (parse escapes → `<Text>` grid).** Rejected: re-implementing a correct xterm parser (CSI/OSC/DEC modes, wide chars, reflow, scroll regions) is a multi-month effort and will diverge from what the agent TUIs (Claude Code, codex) actually emit. High risk, low payoff. No maintained RN library does this well — `react-native-terminal*` packages are toys or abandoned.
- **WebGL/Canvas xterm renderer addon.** Rejected outright: known to crash in this project's stack ([[project-xterm-renderer-addon-deadend]]). The DOM renderer is correct and fast enough for a phone-sized grid (≤ ~50 cols × ~30 rows).
- **PWA / browser tab (reuse maestro-web's xterm directly).** Out of scope here — that's the whole-app stack decision (analysis §6); within a native RN app the WebView is the path.
- **Loading xterm from a CDN (unpkg) like the Atelier specimens / maestro-web POC do.** Rejected: requires network at terminal-open time, breaks offline, and is a supply-chain/integrity risk. We **bundle xterm into a local HTML asset** instead.

---

## 2. Architecture

```
┌──────────────────────────── React Native (Relay: terminal/) ─────────────────────────────┐
│                                                                                            │
│  TerminalScreen  ── mounts ──▶  TerminalView                                               │
│   (Compass route)                 │                                                        │
│                                   ├─ useTerminalSession(sessionId)                         │
│                                   │     │  subscribes to Pulse ptyTransport for this id    │
│                                   │     │  onOutput(text) ─▶ batched ─▶ inject into WebView│
│                                   │     │  WebView onMessage(keystroke) ─▶ transport.write │
│                                   │     │  onSize / onExit / 1011(resume) handling         │
│                                   │     ▼                                                  │
│                                   ├─ <WebView source={{html: xtermHost}}/>  ◀── postMessage│
│                                   │        (xterm.js DOM renderer, FitAddon)               │
│                                   │                                                        │
│                                   └─ KeyboardAccessoryBar + HiddenInput                    │
│                                          control bytes ─▶ transport.write                  │
└────────────────────────────────────────────┬───────────────────────────────────────────-┘
                                              │  (Pulse) services/realtime/ptyTransport
                                              ▼
                              ws(s)://<host>/pty?sessionId=<id>   (binary out/in + JSON ctrl)
                                              │
                              maestro-server PtyWebSocketServer ◀── PtyHostService (node-pty)
```

**Two JS contexts, one bridge.** The RN side owns the socket (via Pulse), the keyboard, sizing, and lifecycle. The WebView side owns *only* rendering. They communicate over a tiny typed `postMessage` protocol (§4.3). PTY output flows RN→WebView; keystrokes/resizes flow WebView→RN (then to the socket).

**Why the socket lives on the RN side, not in the WebView:** auth token (`?token=`), reconnect/backoff, app background/foreground, and the streaming decoder all belong with the rest of the realtime layer (Pulse). The WebView stays a dumb, replaceable renderer — if we ever swap to a native emulator, the transport contract is unchanged.

---

## 3. The `/pty` wire contract (mirrors `webTerminal`, verbatim)

Confirmed by reading `maestro-ui/src/platform/terminal.ts` and `MOBILE_APP_BUILD_ANALYSIS.md` §2.6/§3:

**URL:** `${PTY_WS_URL}?sessionId=<id>` where `PTY_WS_URL = deriveWsUrl(API_BASE_URL) + '/pty'` (from Conduit's `serverConfig`, derived from the runtime `host:port` the user enters). **v1 has NO auth** (ratified directive) — connect directly, no `&token=`. `?token=` is retained only as a documented **FUTURE seam**. `ws.binaryType = 'arraybuffer'`.

**Server → client**
- text frame `{type:'size',cols,rows}` — once, on attach, **before** scrollback replay. Use it to fit the WebView grid to what the server already allocated.
- **binary** frames = raw PTY bytes. Scrollback (≤256 KB ring) replayed first, then live output. Decode with a **per-session streaming `TextDecoder({stream:true})`**.
- text frame `{type:'exit',exitCode}` — real process exit → session over.

**Client → server**
- **binary** frame = keystroke bytes (`new TextEncoder().encode(...)` for text; raw control bytes for the accessory bar).
- text frame `{type:'resize',cols,rows}` — on every fit/orientation change.

**Close codes**
- `1008` = missing `sessionId` (a bug on our side — never ship this).
- `1011` = **no live PTY** → treat as session-over / needs **resume** (`POST /api/sessions/:id/resume`, owned by Conduit/Forge). Surface a "Session ended — Resume?" affordance.
- plain close (no code) = we merely detached; **PTY keeps running**, reattach replays scrollback. Do **not** treat as exit.

**Send-before-open queue:** a `resize` can be issued before `onopen` fires (FitAddon runs on mount). Mirror `webTerminal`'s `_pendingSends` queue — buffer frames, flush on open. (Pulse owns this in the transport.)

---

## 4. Folder structure for `terminal/`

```
terminal/
  index.ts                       # public exports (TerminalScreen, measureTerminalSize, types)
  TerminalScreen.tsx             # full-screen / bottom-sheet container; mounted by Compass (navigation/)
  TerminalView.tsx               # WebView + bridge + keyboard composition for ONE session
  webview/
    xterm-host.html.ts           # exports the self-contained HTML string (xterm js+css inlined at build)
    buildXtermHost.ts            # build-time script that inlines @xterm/* into xterm-host.html.ts
    bridge.ts                    # typed RN<->WebView message protocol (enums + (de)serialize)
  keyboard/
    KeyboardAccessoryBar.tsx     # Esc · Tab · Ctrl(sticky) · ← ↑ ↓ → · Ctrl-C row (above keyboard)
    HiddenInput.tsx              # off-screen TextInput capturing soft-keyboard text → keystrokes
    controlSequences.ts          # pure map: key/modifier → escape/control byte sequence
  hooks/
    useTerminalSession.ts        # wires Pulse ptyTransport <-> WebView for a sessionId; lifecycle
    useReattachOnBoot.ts         # reattach alive sessions (consumes Ledger's alive-session selector)
    useTerminalFit.ts            # debounced resize; bridges FitAddon dims -> transport.resize
    useAppStateReattach.ts       # background/foreground: detach on background, reattach+replay on fg
  theme/
    xtermTheme.ts                # xterm ITheme matching Atelier pn-term palette (Bedrock tokens)
  utils/
    measureTerminalSize.ts       # estimate cols/rows for spawn (before WebView mounts) — used by Forge
  __fixtures__/
    sampleTranscript.ts          # canned bytes for rendering tests w/o a live server
```

**Build-time note:** `@xterm/xterm` + `@xterm/addon-fit` are **devDependencies**, not runtime RN deps. `buildXtermHost.ts` inlines their JS+CSS into a single HTML string committed as `xterm-host.html.ts`, loaded via `<WebView source={{ html }}/>`. This guarantees offline operation and avoids `file://` asset-path differences between iOS and Android.

---

## 5. Library choices (with versions + rationale + rejected)

| Need | Choice | Version | Rationale | Rejected |
|---|---|---|---|---|
| WebView | `react-native-webview` | `^13.12` (let `npx expo install` pin to the SDK) | Only mature WebView for Expo; supports `injectJavaScript`, `onMessage`, `source={{html}}`, `keyboardDisplayRequiresUserAction={false}`. | — none viable. |
| VT engine | `@xterm/xterm` | `^5.5.0` | Industry-standard, same engine as maestro-ui/web/VS Code. Scoped package (renamed from `xterm`). **Build-time only.** | Old unscoped `xterm` (deprecated naming); native emulator (§1); `react-native-terminal*` (unmaintained). |
| Fit/sizing | `@xterm/addon-fit` | `^0.10.0` | Computes cols/rows from the WebView viewport for the `resize` frame. **Build-time only.** | Manual char-metric math (error-prone across DPR/fonts). |
| Renderer | xterm **DOM renderer** (built in) | — | Correct + fast enough for phone grids. | `@xterm/addon-webgl` / canvas — **crash** in this stack ([[project-xterm-renderer-addon-deadend]]). |
| App lifecycle | RN `AppState` | (core) | Detect background→foreground to detach/reattach sockets. | 3rd-party lifecycle libs — unnecessary. |
| Keyboard input | RN `TextInput` (hidden) | (core) | Captures soft-keyboard text + IME composition; we forward committed text as keystrokes. | WebView-native `<input>` focus (unreliable focus/scroll on RN WebView; keyboard avoidance fights the sheet). |

**Fonts:** xterm theme uses **JetBrains Mono** (the Atelier `--pn-mono`), bundled into the HTML as a `@font-face` (offline). Bedrock owns the app-wide font assets; I consume the same `.woff2` inside the WebView.

**Palette (from `Terminal-CONTRACT.md` §3a, theme-invariant — terminal stays dark in both light/dark app themes):**
`background #1c1a16` (dark-app override `#100E0A`), `foreground #cfc9bb`, `cursor/brightYellow #d99a4e`, dim/`brightBlack #8a8474`, green/`l-ok #7bb98e`. I'll fill the full 16-color ANSI ramp in `xtermTheme.ts` keyed off these.

---

## 6. Cross-team dependencies & the Pulse boundary (the important one)

### 6.1 Pulse (`services/realtime/`) — the `/pty` transport boundary
Per ATLAS_BRIEF, Pulse owns the entity-sync WS **and** the `/pty` transport. To keep file scopes disjoint, **Pulse owns the socket; Relay owns the renderer.** I need Pulse to expose a transport that mirrors `webTerminal` exactly:

```ts
// services/realtime/ptyTransport.ts  (Pulse)
export interface PtyTransport {
  attach(sessionId: string): void;                 // _ensureSocket + queue flush on open
  detach(sessionId: string): void;                 // ws.close(); PTY keeps running server-side
  write(sessionId: string, bytes: Uint8Array): void;          // binary keystroke frame
  resize(sessionId: string, cols: number, rows: number): void; // JSON {type:'resize'}
  onOutput(h: (id: string, text: string) => void): () => void; // text post streaming-decode
  onSize(h:   (id: string, s: {cols:number; rows:number}) => void): () => void;
  onExit(h:   (id: string, code: number | null) => void): () => void; // {type:'exit'} OR close 1011
}
```
**Asks for Pulse (all confirmed in `planning/realtime.md`):** (a) per-session streaming `TextDecoder({stream:true})`; (b) send-before-open pending queue; (c) `binaryType='arraybuffer'`; (d) `1011`→`onExit(null)`, plain-close ≠ exit; (e) **no `?token=` in v1** (no auth). Resolved: Pulse hands Relay **pre-decoded `string`** (single decoder lives in Pulse, WebView stays trivial). Minor naming to confirm at impl: Pulse's index surface uses `attach/detach`; my `useTerminalSession` will call those (treat `createSession/closeSession` as aliases).

### 6.2 Conduit (`services/api/`)
- `serverConfig` must export `PTY_WS_URL` (= `deriveWsUrl(API) + '/pty'`), derived from the runtime `host:port`. **No auth token in v1** (`?token=` is a future seam only).
- `POST /api/sessions/:id/resume` and `POST /api/sessions/:id/pty/stop` — Relay (or the session-panel feature) calls these via Conduit's client on resume / explicit stop.

### 6.3 Ledger (`state/`)
- Need a selector for **alive sessions** (`status ∈ {spawning,idle,working,run,wait}`) for `useReattachOnBoot`. Need `session.status` updates (driven by entity-sync) so the terminal can show the live status dot and react to `completed/failed`.

### 6.4 Forge (`features/`) — spawn sizing — SINGLE OWNER: RELAY (ratified, Sentinel must-fix #3)
- At spawn, `POST /api/sessions/spawn` wants `cols/rows` **before** any WebView exists. **`measureTerminalSize()` has exactly ONE implementation, owned and exported by Relay** (`terminal/utils/measureTerminalSize.ts`). The session-panel feature (Forge) **CALLS** it at spawn time and puts the result in the spawn body — it does **not** write its own sizing math. Relay's helper estimates from the terminal-sheet dimensions ÷ JetBrains Mono cell advance (cell metrics from Bedrock); the real size is corrected by the first FitAddon `resize` after mount. No second implementation anywhere.

### 6.5 Compass (`navigation/`)
- `TerminalScreen` is mounted as a **full-screen route or a tall bottom sheet** (Atelier's `TerminalSheet`). I need: keyboard-avoidance behavior, safe-area insets, and a stable mount (don't unmount on tab switch, or the socket churns). **Open question:** does Compass keep the terminal mounted+hidden (like maestro-ui's `terminalHidden`) or unmount on close? **Recommendation: keep mounted while the session is alive and foregrounded** so scrollback isn't re-replayed on every peek.

### 6.6 Palette (`components/`) — owns the *chrome*, I own the *renderer*
- The `pn-term-bar` (status dot, session name, agent·model, branch) and any input row are Atelier chrome → Palette's components. I render only the xterm body + accessory bar. Boundary mirrors `Terminal-CONTRACT.md`: chrome ≠ live xterm output.

---

## 7. Soft-keyboard → control sequences

The soft keyboard emits text but no control bytes. Two input paths feed `transport.write`:

1. **HiddenInput (text):** an off-screen `TextInput` holds focus while the terminal is open. Committed characters (incl. IME composition results) are encoded UTF-8 and sent as binary. Backspace → `0x7f`, Enter → `\r` (`0x0d`).
2. **KeyboardAccessoryBar (control):** a row pinned above the keyboard (`InputAccessoryView` on iOS / sticky view on Android) with the keys agent TUIs need. `controlSequences.ts` (pure, unit-testable):

| Key | Bytes |
|---|---|
| Esc | `\x1b` |
| Tab | `\x09` |
| Ctrl-C | `\x03` |
| Ctrl + `<letter>` (sticky Ctrl) | `letter.toUpperCase().charCodeAt(0) & 0x1f` |
| ↑ ↓ → ← | `\x1b[A` `\x1b[B` `\x1b[C` `\x1b[D` |
| Home/End (optional) | `\x1b[H` / `\x1b[F` |

Sticky-Ctrl UX: tap Ctrl to arm (highlight), next key applies the mask, then disarms. Matches how iSH/Termius accessory bars behave.

---

## 8. Lifecycle: reattach, background, scrollback

- **Boot (`useReattachOnBoot`):** read alive sessions from Ledger. **Lazy by default** — don't open N sockets on cold start; open on first view. (The identity brief says "reattach per alive session on boot"; for mobile bandwidth/battery I recommend *attach-on-open + keep-alive*, and will flag this to Atlas as a deliberate deviation. If Atlas insists on eager warm reattach, it's a one-line switch.)
- **Open:** `attach(sessionId)` → server sends `{type:'size'}` then replays scrollback (≤256 KB) → WebView renders history instantly, then live output streams.
- **Background (`useAppStateReattach`):** iOS suspends sockets within seconds. On `background`, `detach` (PTY keeps running). On `active`, `attach` again — the 256 KB scrollback replay restores recent context for free. No client-side terminal persistence needed.
- **xterm `scrollback`:** set generously (e.g. 5000 lines) so the replayed ring fits; the server ring (256 KB), not the client, is the source of history.
- **Explicit stop:** user taps Stop → `POST /api/sessions/:id/pty/stop` (via Conduit) → server emits `{type:'exit'}`.

---

## 9. Performance

- **Output batching RN→WebView:** `injectJavaScript` per frame is costly. Coalesce decoded chunks on a ~16 ms / `requestAnimationFrame` cadence into one `term.write(chunk)` call. xterm has its own internal write buffer too, so this is belt-and-suspenders for burst output (e.g. a `cat` of a big file).
- **Encoding across the bridge:** decoded text is sent as a JSON-escaped string via `injectJavaScript('window.__term.write(' + JSON.stringify(text) + ')')`. (Base64 only if we later send raw bytes.)
- **Keystroke path is low-volume** — send immediately, no batching.
- **DOM renderer only** — phone grids are small; WebGL is both unnecessary and a known crash ([[project-xterm-renderer-addon-deadend]]).

---

## 10. Risks

1. **`MAESTRO_PTY_HOST=server` + node-not-bun** (make-or-break, operational). Confirmed live per Atlas; re-verify on any new target box. ([[project-node-pty-bun-incompatibility]])
2. **WebView ↔ RN bridge throughput** under burst output. Mitigation: rAF batching (§9). Verify with a stress fixture early.
3. **Keyboard focus & avoidance inside a bottom sheet** — the hidden `TextInput` must hold focus without the sheet/keyboard fighting. Joint risk with Compass (§6.5). Prototype on a real device early.
4. **iOS socket suspension on background** — handled by detach/replay (§8), but the reattach UX (brief "reconnecting…" flash) needs design polish with Palette.
5. **Full agent-spawn-over-`/pty` on a headless box may be unproven end-to-end** (analysis §8 flags only the raw shell path as confirmed). Sentinel should integration-test a real `maestro worker init` over `/pty`, not just an echo shell.
6. **HTML asset size** (xterm bundled ≈ a few hundred KB) inflates the app bundle slightly. Acceptable; it's offline + integrity-safe vs CDN.

---

## 11. Open questions for the team — status after cross-review

1. ~~**Pulse:** decoded `string` vs raw bytes to the renderer?~~ **RESOLVED** — pre-decoded `string`; decoder in Pulse. `PtyTransport` = `attach/detach/write(bytes)/resize/onOutput(id,string)/onSize/onExit`.
2. ~~**Atlas:** lazy vs eager reattach?~~ **RESOLVED** — lazy attach-on-open + bg/fg detach+replay (Atlas accepted lazy).
3. ~~**Compass:** keep mounted vs unmount on close?~~ **RESOLVED** — `terminal/[sessionId]` is a `fullScreenModal` route; it unmounts on dismiss, which is **fine** because the socket is a Pulse module-scoped singleton (survives the route) and reopening replays the 256 KB scrollback. Dismiss = detach, reopen = reattach. Consistent with §8.
4. **Forge ↔ Relay (cols/rows ownership):** Forge owns the spawn-time `cols/rows` computation; Relay/Compass provide the **terminal-sheet dimensions** and Bedrock provides **mono cell metrics**. To stay file-disjoint, the measurement lives in ONE place — I propose Relay exports a `terminalSheetMetrics` constant + a `measureTerminalSize(sheetW, sheetH, cell)` pure helper that Forge calls (rather than two implementations). Confirm with Forge.
5. **Prompt-over-`/pty` (session-panel reply):** the resolved prompt-sender (write keystrokes over the live `/pty` socket) routes through Relay. The session-panel "send reply" UI calls a Relay `sendKeys(sessionId, text)` that encodes UTF-8 + `\r` and calls Pulse's `write`. I own this small API; the reply UI is the session-panel feature's. Confirm with Forge/session-panel.
6. ~~**Conduit:** auth token for `?token=`?~~ **MOOT in v1** — no auth; `serverConfig` just needs `PTY_WS_URL` from the runtime `host:port`.
7. **Sentinel:** plan an end-to-end test of a real agent (`maestro worker init`) streaming over `/pty` on the server-host config — not just a raw shell echo.

**Stream placement:** `terminal/` is its own top-level scope, file-disjoint from both feature streams. It lives under the **SESSION PANEL** stream conceptually (Sessions/spawn/terminal), consumed by the session-panel features and mounted by Compass's `terminal/[sessionId]` route.
