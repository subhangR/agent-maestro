# maestro-mobile — Build Plan (ratified)

> Supersedes the draft `COORDINATION_PLAN.md`. Phased implementation with **disjoint file scopes** per worker, the **maestro-panel / session-panel** feature split, Atlas integrating + committing, and Sentinel gating every phase. **No implementation until the user approves this plan.**

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
| ⌨️ Relay | `terminal/` (WebView xterm renderer, soft-keyboard bar, `measureTerminalSize`) | terminal |
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

**Delivers:** all surfaces render **live** server data; A and B are file-disjoint; cross-stream actions only via `sheets.open`.
**Gate (Sentinel):** every screen renders live data; boundary-lint proves no A↔B cross-import; no `m-data` constants remain.

## Phase 3 — Actions & spawn (Forge A ∥ Forge B ∥ Conduit)

- Mutations: create/edit/assign/pin/complete tasks, create/edit members, cast spells, manage lists/graphs (optimistic on inline edits; creates wait for `*:created`).
- Spawn (Stream B): `POST /sessions/spawn` (`spawnSource:'ui'`, `cols/rows` from Relay's `measureTerminalSize()`) + idempotent `session:spawn` reconcile.
- Reply-to-agent resolved via `/pty` `sendKeys` (no synthetic sender).

**Gate (Sentinel):** round-trip create/edit reconciles; spawn creates a real session (server in `MAESTRO_PTY_HOST=server`).

## Phase 4 — Terminal (Relay)

- WebView xterm renderer + `/pty` transport (binary keystrokes, JSON resize, streaming decoder, `{type:size|exit}`, `1011`=resume); soft-keyboard control-sequence bar; lazy attach-on-open + bg/fg replay.

**Gate (Sentinel):** live terminal attaches + echoes against `MAESTRO_PTY_HOST=server` (node, not bun); reattach replays scrollback.

## Phase 5 — Polish & integration (Sentinel + all)

- Background/foreground reconnect hardening, optional WS subscription filtering, push from `notify:*`, empty/error states, a11y pass (reduced-motion, Dynamic Type, AA contrast), diagram board (Skia/SVG) or graceful read-only fallback, theming QA.

**Gate:** final verify across the contract checklist.

## Mechanics (unchanged)

- Workers report via `maestro task report progress|complete|blocked`; **workers never run git**.
- **Atlas integrates + commits** after each worker completes; opens the next phase only after Sentinel's VERDICT passes.
- Sentinel is **adversarial**: assume claims are wrong until verified against `MOBILE_APP_BUILD_ANALYSIS.md`. One contract-fidelity FAIL vetoes a gate.
- Spawn implementation workers with `--use-worktree` off `feat/mobile-app` so parallel workers don't share a cwd, on `claude-opus-4-8[1m]`, bypass permissions.

## De-risked / open

- ✅ `MAESTRO_PTY_HOST=server` confirmed live (web UI terminals work) → `/pty` proven for non-native clients.
- ✅ No-auth direct connection (user directive) — simplest possible connect.
- ⚠️ Confirm the deployed target box runs PTY host under **node** (not bun) before Phase 4.
- ⚠️ Diagram board (rough.js) has no RN equivalent — Phase 5 Skia/SVG or read-only fallback.
