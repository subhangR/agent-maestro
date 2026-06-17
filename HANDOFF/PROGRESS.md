# maestro-mobile — Progress & remaining work

Branch `feat/mobile-app` (pushed to `origin`). App at `maestro-mobile/`. As of Phase 1 build complete.

## Commits (this effort)

```
bb13c60 feat(mobile): Phase 1 — connection core (api + realtime + state + components)
0d171ed feat(mobile): Phase 0 theme follow-up — AA status-text tokens, deps, test wiring
1d01b18 feat(mobile): Phase 0 domain/ + QA harness (Lexicon + Sentinel)
2808a00 feat(mobile): Phase 0 theme — tokens, typography, fonts, svg data, unistyles
62ceeef feat(mobile): Phase 0 scaffold — standalone Expo SDK54 app at maestro-mobile/
86ee5a5 chore(mobile): pin Atelier design specimens + set app root to maestro-mobile/
329e123 docs(mobile): fold in user v1 scope decisions
9232cf1 docs(mobile): ratified planning phase for maestro-mobile (Atelier RN app)
```

## Phase status

| Phase | State | Notes |
|---|---|---|
| Planning | ✅ DONE | 5 ratified docs (`ARCHITECTURE`/`PROJECT_STRUCTURE`/`DEPENDENCIES`/`CONVENTIONS`/`BUILD_PLAN`) + 10 plans in `planning/`. 10/10 team sign-off. |
| 0 Foundation | ✅ DONE (gate PASS) | Expo SDK54 scaffold, `theme/`, `domain/` + drift-guard, `__qa__/` Maelstrom. app tsc + drift tsc green; Maelstrom smoke 9/9; `expo prebuild` clean. |
| 1 Connection core | ✅ BUILT + committed | `services/api` (Conduit), `services/realtime` (Pulse), `state` (Ledger), `components` primitives+controls (Palette). Combined tsc green; jest passing (state 28, realtime 23, api 18). **Sentinel gate NOT yet run.** |
| 2 Shell + read surfaces | ⏳ NEXT | Compass (expo-router shell/tab bar/SheetHost/connect screen) → Forge Stream A (tasks/members/teams/skills/lists/graphs/profiles) ∥ Stream B (sessions/detail/stats/timeline) + Palette composite tiles + `features/docs/` viewer. Wire to live stores; remove all mock constants. |
| 3 Actions & spawn | ⬜ | Mutations (optimistic), spell cast, spawn (`spawnSource:'ui'` + `cols/rows`, consume `session:spawn`), reply-to-agent via `/pty` sendKeys. |
| 4 Terminal | ⬜ | Relay WebView xterm + `/pty`. **HARD PREREQ: full Android dev-client device boot must pass first (Phase-0 Waiver 1).** Server must run `MAESTRO_PTY_HOST=server` under node. |
| 5 Whiteboard + polish | ⬜ | Relay `whiteboard/` (WebView Excalidraw, scene↔doc via `POST/GET .../docs`); reconnect hardening; a11y; (no push notifications in v1). |

## IMMEDIATE next step on resume

1. **Run the Phase-1 Sentinel gate** (it was committed but not gated). Spawn Sentinel (`tm_1781678532887_5wxcsev4x`) to adversarially verify against Maelstrom (and a live server if available): URL derivation (http→ws/https→wss, bare origin, +`/pty`), NO-AUTH (zero auth bytes), `Array.isArray` demux drain of a mixed `[array, single, array]` sequence, reconnect backoff+jitter + resync-on-open, ~20s app-ping survival, `batchSet` N-events→one-commit coalescing, teams=REST-poll. One contract-fidelity FAIL vetoes; only Atlas accepts waivers.
2. On PASS → open **Phase 2**.

## Phase-1 module seams (for Phase 2 wiring)

- **Bootstrapper (still TODO — Phase 2):** wire Conduit `buildServerConfig(host)` → `createRealtime({getWsUrl, getPtyWsUrl, ledger})` from `@/services/realtime`, and `setMaestroClient(client)` into `@/state`. Connect screen writes host → `prefsStore.lastHost` → triggers realtime `start()`.
- Pulse → `import { ingestBatch, ingestEvent, resyncProject } from '@/state'`; `uiStore.setRealtimeStatus`.
- Forge → `@/state` hooks (`useTask`/`useSession`/`useSessionsByTab`/`useMembersWithLiveCounts`/…), pure `select*`, `optimisticPatch/rollback`.
- Palette tiles (Phase 2) → consume `@/domain` types + `derive` (`toUiSessionStatus`), `@/theme` tokens (incl `*Text` AA status tokens), `@/components` primitives/controls.

## Deferred / open

- Bedrock polish (low pri): add an `onBrand` foreground color token (retire Palette's local `BRASS_INK`); add translucent border tokens for exact Badge/Tag parity.
- Phase-0 Waiver 1: full Android dev-client **device boot** — must run before Phase 4.
- Stand up a live server (node, `MAESTRO_PTY_HOST=server`, port 4569) for live REST/WS/PTY smokes in Phases 2–4 (Maelstrom covers framing meanwhile).
- This branch's server has **minimal Spell, no Ensemble/SPELL_COLORS** — rich spell UI out of scope unless the server gains them.
