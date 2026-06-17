# maestro-mobile — Build Plan (ratified)

> Supersedes the draft `COORDINATION_PLAN.md`. Phased implementation with **disjoint file scopes** per worker, the **maestro-panel / session-panel** feature split, Atlas integrating + committing, and Sentinel gating every phase. **No implementation until the user approves this plan.**

## v1 scope (ratified by user, 2026-06-17)

- **Reachability:** Tailscale/VPN only — no-auth is acceptable because the private network is the boundary. Never expose publicly without auth.
- **Platform:** **Android-first.** App is RN/cross-platform, but dev-client, testing, and platform handling target Android first (system back button → nav/sheet dismiss; Android status/nav bars; Material press feedback; per-weight font families to avoid synthetic bolding). iOS is a later port.
- **Notifications:** **skipped in v1** (true background push needs a server-driven push service = a server change).
- **Native-only surfaces:** **DROP** file browser, code editor (Monaco), session recordings, SSH. **KEEP** the document/diagram **viewer** and the **Excalidraw whiteboard**.
- **Excalidraw (verified, no server change):** drawings are stored as **doc content** — a diagram is a doc whose content is Excalidraw-scene JSON (`isExcalidrawSceneJson()` in maestro-ui `docHelpers.ts`), persisted via the existing `POST/GET .../docs` endpoints (NOT Tauri `save_session_asset`, which is only a desktop local-file convenience). Mobile = WebView-hosted `@excalidraw/excalidraw` (same bridge pattern as the terminal), scene saved as a doc. **Owner: Relay** (WebView specialist).

## Roster → scope (file-disjoint)

| Member | Scope | Stream |
|---|---|---|
| 🪨 Bedrock | `theme/` (tokens, typography, fonts, `svg/` data+assets, unistyles registry, ThemeBoot) | foundation |
| 📐 Lexicon | `domain/` (entities, enums, ids, contracts, schemas, `derive/`, `__sync__` drift-guard) | foundation |
| 🔌 Conduit | `services/api/` (serverConfig, MaestroClient, errors) | core |
| 📡 Pulse | `services/realtime/` (EntitySyncClient, normalizeEvent, PtyTransport) | core |
| 🗃️ Ledger | `state/` (entityStore, batchSet, ingest, optimistic, selectors, uiStore, prefsStore) | core |
| 🎨 Palette | `components/` (primitives, controls, composite tiles, sheet content) | core |
| 🧭 Compass | `app/` + `navigation/` (router, tab bar, SheetHost, deep links, connect route) | shell |
| 🛠️ Forge | `features/` **Stream A** (tasks/members/teams/skills/lists/graphs/profiles/more) **+ Stream B** (sessions/spawn/connect/conduct/_shared) — spawned as **two disjoint workers** | features |
| ⌨️ Relay | `terminal/` (WebView xterm renderer, soft-keyboard bar, `measureTerminalSize`) **+ `whiteboard/`** (WebView-hosted Excalidraw, scene↔doc persistence) | terminal/whiteboard |
| ✅ Sentinel | `__qa__/` (Maelstrom, integration, gates) — independent verify at every phase | QA |

## Phase 0 — Foundation (parallel: Bedrock ∥ Lexicon ∥ Sentinel-scaffold)

**Pre-work (resolves cross-review must-fixes — done before any feature code):**
- Pin Atelier specimens into git (currently untracked) before building against them.
- Scaffold standalone Expo SDK 54 app (CNG, New Arch), **custom dev client**, path aliases, eslint boundary-lint.
- Lexicon: `domain/` types + enums + `derive/` + `__sync__` drift-guard under dedicated `tsconfig.drift.json`; Metro blockList for `__sync__`.
- Bedrock: `theme/` tokens (light/dark), typography, offline fonts, `svg/` **data+assets only**, unistyles registry, `ThemeBoot`. (Icon *components* are Palette's — no component files in `theme/`.)
- Sentinel: Maelstrom skeleton + per-package `tsc` gate + the **Phase-0 native dev-client smoke**.

**Delivers:** app boots on a dev client; theme renders light/dark; domain types + derive compile; drift-guard isolated.
**Gate (Sentinel):** dev-client boot smoke passes; `tsc --noEmit` green per package; drift-guard typechecks without leaking server errors into the app gate; theme tokens match Palette's locked key-names.

## Phase 1 — Connection core (parallel: Conduit ∥ Pulse ∥ Ledger ∥ Palette-start)

- Conduit: `serverConfig` (runtime host, `deriveWsUrl`), `MaestroClient` ported 1:1, **no auth**, typed errors.
- Pulse: EntitySyncClient (bare origin, `Array.isArray`, backoff+jitter, ping, resync-on-open) → Ledger ingest; `PtyTransport`.
- Ledger: `entityStore` + `batchSet` (verbatim port), ingest/optimistic, selectors, `uiStore`/`prefsStore`.
- Palette (start): primitives + controls (Icon/StatusGlyph/Mark/Gauge/StatusDot/Text/Button/Badge/…).

**Delivers:** connect by IP → live REST fetch + WS reconcile into stores; component library renders from theme.
**Gate (Sentinel):** against a running staging server (4569) + Maelstrom — entities populate via REST, WS batches reconcile in one render, reconnect triggers full resync, **zero auth bytes** on the wire.

## Phase 2 — Shell + read surfaces (Compass → Forge A ∥ Forge B, + Palette tiles)

- Compass: expo-router tree, 5-slot tab bar + Conduct FAB + NowPlaying mount, per-tab stacks, `SheetHost`, **connect screen** (no login), deep links.
- Palette: composite tiles (`MTaskTile`, `MSessionTile`, `NowPlaying`) + sheet content primitives.
- **Forge Stream A** (maestro-panel): Tasks/Members/Teams(REST-poll)/Skills/Lists/Graphs/Profiles read-only, wired to Ledger selectors; mock `m-data` constants removed.
- **Forge Stream B** (session-panel): Sessions list/tiles/detail/stats/timeline/prompts read-only; owns `_shared/` + `conduct/` bodies.
- **Document/diagram viewer** (`features/docs/`, shared read-only): renders server docs via `GET .../docs` — markdown + Mermaid + Excalidraw scenes (read-only render here; editing is Phase 5).

**Delivers:** all surfaces render **live** server data; doc/diagram viewer works; A and B are file-disjoint; cross-stream actions only via `sheets.open`.
**Gate (Sentinel):** every screen renders live data; doc viewer renders the three content kinds; boundary-lint proves no A↔B cross-import; no `m-data` constants remain.

## Phase 3 — Actions & spawn (Forge A ∥ Forge B ∥ Conduit)

- Mutations: create/edit/assign/pin/complete tasks, create/edit members, cast spells, manage lists/graphs (optimistic on inline edits; creates wait for `*:created`).
- Spawn (Stream B): `POST /sessions/spawn` (`spawnSource:'ui'`, `cols/rows` from Relay's `measureTerminalSize()`) + idempotent `session:spawn` reconcile.
- Reply-to-agent resolved via `/pty` `sendKeys` (no synthetic sender).

**Gate (Sentinel):** round-trip create/edit reconciles; spawn creates a real session (server in `MAESTRO_PTY_HOST=server`).

## Phase 4 — Terminal (Relay)

- WebView xterm renderer + `/pty` transport (binary keystrokes, JSON resize, streaming decoder, `{type:size|exit}`, `1011`=resume); soft-keyboard control-sequence bar; lazy attach-on-open + bg/fg replay.

**Gate (Sentinel):** live terminal attaches + echoes against `MAESTRO_PTY_HOST=server` (node, not bun); reattach replays scrollback.

## Phase 5 — Whiteboard, polish & integration (Relay + Sentinel + all)

- **Excalidraw whiteboard (Relay):** WebView-hosted `@excalidraw/excalidraw` (reuses the terminal's `react-native-webview` + bridge pattern); load a scene from a doc, edit, save back as a doc via `POST .../docs` (scene JSON). No server change.
- Background/foreground reconnect hardening, optional WS subscription filtering, empty/error states, a11y pass (reduced-motion, Dynamic Type, AA contrast), theming QA.
- **No notifications in v1** (per scope).

**Gate (Sentinel):** whiteboard round-trips a scene to a server doc and back; final verify across the contract checklist.

## Mechanics (unchanged)

- Workers report via `maestro task report progress|complete|blocked`; **workers never run git**.
- **Atlas integrates + commits** after each worker completes; opens the next phase only after Sentinel's VERDICT passes.
- Sentinel is **adversarial**: assume claims are wrong until verified against `MOBILE_APP_BUILD_ANALYSIS.md`. One contract-fidelity FAIL vetoes a gate.
- Spawn implementation workers with `--use-worktree` off `feat/mobile-app` so parallel workers don't share a cwd, on `claude-opus-4-8[1m]`, bypass permissions.

## De-risked / open

- ✅ `MAESTRO_PTY_HOST=server` confirmed live (web UI terminals work) → `/pty` proven for non-native clients.
- ✅ No-auth direct connection over Tailscale (user directive) — simplest possible connect; network is the boundary.
- ✅ Excalidraw whiteboard feasible with no server change — scenes persist as docs over REST (`isExcalidrawSceneJson`/`docHelpers.ts`); WebView-hosted editor.
- ⚠️ Confirm the deployed target box runs PTY host under **node** (not bun) before Phase 4 (and `MAESTRO_PTY_HOST=server` on the actual Android-target server).
- ⚠️ Verify the exact write endpoint for an Excalidraw scene per entity (task vs session docs) at Phase 5 start — `POST /api/tasks/:id/docs` is the proven path; confirm session-doc write parity.
