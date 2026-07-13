# maestro-mobile — Dependencies (ratified)

> Every runtime/dev library, why it's in, and what was rejected. **Versions track the Expo SDK** — pin to whatever the selected SDK bundles for the native modules (treat numbers below as "what Expo 54 ships"), not hard pins. Standalone npm app (NOT in the bun workspace).

## Platform

| Package | Version | Why | Rejected |
|---|---|---|---|
| `expo` | SDK **54** | Managed/CNG workflow, OTA-capable, manages compatible native-module versions, config plugins for fonts. | Bare RN (more native maintenance for no v1 gain). |
| `react-native` | 0.81 (SDK-pinned) | The SDK's RN. **New Architecture ON.** | — |
| `react` / `react-dom` | 19 (SDK-pinned) | SDK default. | — |
| `typescript` | ~5.6 | Types + the drift-guard against server types. | — |

> **Dev client required (no Expo Go).** unistyles v3, react-native-webview, react-native-mmkv, react-native-svg, and gorhom bottom-sheet all need native modules / a custom dev client. Accepted team-wide.

## Domain & validation (Lexicon)

| Package | Version | Why | Rejected |
|---|---|---|---|
| `zod` | ^4.3 | **Boundary-only** parse (spawn body, WS-envelope, host input). Matches server's zod major. | Runtime validation of every read entity (perf; reads are types-only). io-ts/yup (zod matches server). |

Domain types are **hand-mirrored** + a compile-time **drift guard** importing `maestro-server/src/types.ts` (the worktree is the monorepo; typecheck-only, Metro-excluded). No codegen tool — server emits no OpenAPI; hand-mirror matches maestro-ui's proven pattern.

## Data — REST + realtime (Conduit, Pulse)

| Package | Version | Why | Rejected |
|---|---|---|---|
| *(native `fetch`)* | — | `MaestroClient` ported 1:1 from maestro-ui; no client lib needed. **No auth in v1.** | axios/ky (extra dep for what fetch does); **TanStack Query** (Zustand+`batchSet` IS the cache; a query cache would double-store the WS-reconciled entities). |
| *(native `WebSocket`)* | — | Entity-sync + `/pty`; RN's WebSocket supports binary (arraybuffer). | socket.io/reconnecting-websocket (server is raw WS; we port the proven maestro-ui reconnect). |
| `mitt` | ^3.0 | Tiny typed emitter for realtime → normalized events (internal). | EventEmitter (heavier; mitt is ~200B). |
| `@react-native-community/netinfo` | ^11 | Reachability → drive reconnect/backoff intelligently. | Polling (battery). |

## State & storage (Ledger)

| Package | Version | Why | Rejected |
|---|---|---|---|
| `zustand` | ^5 | Ports `useMaestroStore`'s `batchSet` reconciler verbatim; single store + selector namespaces. | Jotai/Redux-Toolkit (atomic/boilerplate mismatch with the Record-map reconciler); valtio/proxy (proxy churn on high-rate WS batches). |
| `react-native-mmkv` | ^3 | Sync, fast, pre-paint reads for tiny prefs (theme mode, last host). Behind a swappable `StateStorage` iface. | AsyncStorage as primary (async; can't read theme pre-paint) — kept as **fallback** in the iface. Entities are NOT persisted in v1. |

## Navigation & sheets (Compass)

| Package | Version | Why | Rejected |
|---|---|---|---|
| `expo-router` | ^5 | File-based routing, native stacks, deep links, typed routes; first-class in Expo. | bare `@react-navigation` (more wiring; expo-router sits on it anyway); the specimen's hand-rolled switch (no real stack/deep-link). |
| `@gorhom/bottom-sheet` | ^5 | The entire Atelier sheet family via one typed `SheetHost`; gesture/keyboard/backdrop handled; reanimated-backed. | react-native's Modal (no gesture/snap); custom (reinventing gorhom). |
| `react-native-screens` / `react-native-safe-area-context` | SDK-pinned | Native stack primitives + insets (sheets, tab bar). | — |

## UI — styling, animation, vector (Palette, Bedrock)

| Package | Version | Why | Rejected |
|---|---|---|---|
| `react-native-unistyles` | ^3 | Consumes Bedrock's `--pn-*` JS theme directly; **variants** API kills boolean-prop soup; **dark switch with no React re-render** (C++/Nitro) — ideal for the always-on status pulse + live tiles; `rt.insets`/`rt.screen`. | **Tamagui** (its own token system fights Atelier's source of truth); **NativeWind** (Atelier isn't Tailwind; would duplicate the theme); **plain StyleSheet** (no variants, context re-render on theme switch) — kept as documented **fallback** (`StyleSheet + useTheme()`) for zero native-runtime risk. |
| `react-native-reanimated` | **4.x (SDK 54 ships v4, not 3.16)** | UI-thread status-dot pulse, cursor blink, sheet slide, tile expand; matches Atelier's cubic-bezier eases; honors reduced-motion. **v4 moves the babel plugin to `react-native-worklets/plugin`** (add `react-native-worklets`); API otherwise compatible. | RN `Animated` (JS-driven, janks on gesture sheets + always-on pulse). |
| `react-native-gesture-handler` | ~2.20 (SDK-pinned) | Required by gorhom + expo-router; gesture-driven sheets. | — |
| `react-native-svg` | ~15 | Icon/Glyph/Mark/Gauge port (inline SVG → `<Svg><Path>`); `currentColor` via `color` prop. **Owned by Bedrock** (data + dep); Palette authors the components. | Skia (overkill for 16px line icons; reserve for the deferred diagram board). |
| `moti` | ^0.29 | *Optional* declarative enter/exit sugar (NowPlaying mount, toasts). | framer-motion / motion-for-react (web-first, immature on RN). |
| `@expo-google-fonts/*` + `expo-font` | SDK-pinned | Offline-embedded Newsreader + Hanken Grotesk + JetBrains Mono (static instances; Newsreader variable axis dropped). | Runtime Google Fonts CDN (no offline; flash). |

## Lists & forms (Forge)

| Package | Version | Why | Rejected |
|---|---|---|---|
| `@shopify/flash-list` | ^2 | Virtualized Sessions/Tasks lists; `getItemType` for recycling expanding tiles. | `FlatList` (worse recycling for heterogeneous tiles) — **kept for Members** (small, simple). |
| `react-hook-form` | ^7 | Create/edit forms (task, member, run-config) with zod resolver reusing Lexicon schemas. | Formik (heavier, less perf); uncontrolled hand-rolled (revalidation pain). |
| `@hookform/resolvers` | ^3 | Bridges react-hook-form ↔ zod. | — |

## Terminal + whiteboard (Relay)

| Package | Version | Why | Rejected |
|---|---|---|---|
| `react-native-webview` | ^13.12 | Hosts xterm.js (terminal) **and** Excalidraw (whiteboard), bridged via `postMessage`. One WebView competency, two consumers. | Native VT emulator / native canvas board (large net-new builds, no parity). |
| `@xterm/xterm` | ^5.5 | Inlined into an **offline** HTML asset; **DOM renderer only**. | WebGL/Canvas addons (crash in this stack — see project memory); CDN load (no offline). |
| `@excalidraw/excalidraw` | ^0.17 | The same web component the desktop uses; hosted in a WebView, scene loaded/saved as a **server doc** (Excalidraw-scene JSON via `POST/GET .../docs`) — no Tauri, no server change. | Native RN drawing lib (no Excalidraw parity; desktop scenes wouldn't interop); rough.js board (read-only, no edit). |

## QA / tooling (Sentinel)

| Package | Version | Why |
|---|---|---|
| `jest` + `jest-expo` | SDK-pinned | RN/Expo-aware test runner. |
| `@testing-library/react-native` | ^12 | Component/interaction tests; a11y assertions. |
| `msw` | ^2 | Mocks REST at the network boundary. |
| *Maelstrom* (in-repo, no dep) | — | Fake server reproducing entity-sync **array/single** framing + the `/pty` **binary** protocol — the only way to test the two hardest contract points. |
| `eslint` + `@typescript-eslint` + boundary-lint | SDK/latest | Enforce the acyclic import rule + A/B file-disjointness. |

## Gate rule (memory-driven)

Typecheck gate = **per-package `tsc --noEmit` only** — never concurrent bundling builds (`bun run build:*`-style full builds SIGTERM each other; see project memory). `expo export` runs serialized, Sentinel-only. The drift-guard runs under a **dedicated `tsconfig.drift.json`** so server type-errors never enter the app gate, and `__sync__` is excluded from the app tsconfig + Metro blockList.
