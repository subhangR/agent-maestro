# maestro-mobile — Progress & remaining work

Branch `feat/mobile-app` (pushed to `origin`). App at `maestro-mobile/`. As of Phase 3 complete (gated PASS) on the cloud host.

## Commits (this effort)

```
73d634f test(mobile): Phase 3 re-gate PASS — W3 cycle cleared, W4 env waiver
c0cd41c fix(mobile): Phase 3 W3 — break navigation↔features import cycle
484ef79 feat(mobile): Phase 3 Wave 2b — register sheet bodies, wire pty, spell-read seam
22db5ed feat(mobile): Phase 3 Wave 2a — Forge mutations, spawn, reply-to-agent
90ef3da feat(mobile): Phase 3 Wave 1 — client write/spawn seam + measureTerminalSize
786a801 fix(mobile): Phase 2 — Metro entities resolution for DocsViewer markdown
1dd5c6f feat(mobile): Phase 2 Wave 2 — Forge read surfaces (Stream A ∥ B) + docs viewer
1ea1fe0 feat(mobile): Phase 2 Wave 1 — shell + bootstrapper (Compass) + composite tiles (Palette)
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
| 1 Connection core | ✅ DONE (gate PASS, on-device validated) | `services/api` (Conduit), `services/realtime` (Pulse), `state` (Ledger), `components` primitives+controls (Palette). Sentinel PASS across 3 layers: offline 76/76 jest, host-side live smoke, AND **on real hardware** (Android CPH2573): boot ✓ (**Phase-0 Waiver 1 CLEARED**), /health 200, REST live data, NO-AUTH (auth bytes none), entity-sync WS connect + live server→phone push (task create→WS event→batchSet). Verdict: `__qa__/gates/PHASE1_VERDICT.md`. |
| 2 Shell + read surfaces | ✅ DONE (gate PASS) | Compass shell/tab bar/SheetHost/connect + bootstrapper; Forge Stream A (tasks/members/teams/skills/lists/graphs/profiles) ∥ Stream B (sessions/detail/docs viewer); Palette composite tiles. All live store data, no mocks, boundary-clean, useShallow 0 violations. Metro markdown-it→entities bundle fix (`786a801`). Sentinel re-gate PASS: Android export exit 0 (bundle-level proof), isolation held. Verdict `__qa__/gates/PHASE2_VERDICT.md`. |
| 3 Actions & spawn | ✅ DONE (gate PASS) | Optimistic mutations (apply→commit→clear/rollback; creates wait for `*:created`), spawn (`spawnSource:'ui'` client-forced + measured `cols/rows` via `measureTerminalSize`, idempotent `session:spawn` reconcile), spell cast (`invokeSpell`), reply-to-agent via `/pty` `pty.write(encodeUtf8(text+CR))`. Ledger write+pty seams, Compass registry wiring. W3 navigation↔features cycle found + fixed (`c0cd41c`). W4: live PTY-server round-trip waived (env). Verdict `__qa__/gates/PHASE3_VERDICT.md`. |
| 4 Terminal | ✅ BUILT + gated (code-only; device/PTY deferred) | `src/terminal/TerminalView` — `react-native-webview` xterm.js bridged to `PtyTransport` (output→`term.write` via safe `JSON.stringify` injectJavaScript; keystrokes/resize→`pty.write`/`pty.resize`; balanced attach/detach; guarded by `hasPtyTransport`; exit-vs-no-PTY states). Wired into `app/terminal/[sessionId]` (W-INT). Sentinel PASS-WITH-WAIVERS: tsc/export/jest/Maelstrom green, bridge injection-safe + acyclic. **W-DEVICE: on-device render + live PTY streaming UNVERIFIED here** (no device; `node-pty` unbuildable on this VPS). Verdict `__qa__/gates/PHASE45_VERDICT.md`. |
| 5 Whiteboard + polish | ✅ BUILT + gated (code-only; device deferred) | `src/whiteboard/WhiteboardView` — WebView editable Excalidraw; scene↔doc round-trip via the docs API (`getSessionDocs`/`updateDocContent`/`addSessionDoc`/`addTaskDoc`, NOT `save_session_asset`), debounced save, consumes the `MaestroClientApi` docs seam (no cast), safe scene injection, read-only/offline handled. Wired into `app/whiteboard/[sessionId]` (W-INT — Excalidraw now bundles). **W-DEVICE: on-device render + live scene-doc persistence UNVERIFIED here.** Reconnect hardening / a11y / push-notifications: not done (push out of v1 scope). |

## IMMEDIATE next step on resume

**All five phases (0–5) are now BUILT and gated on this cloud host** — every gate is green at the code/build level (tsc app+drift, serialized android export exit 0 + isolation-clean, jest 76/76, Maelstrom 9/9). What remains is **on-device + live-server validation**, which this headless VPS cannot do:

1. **Android dev-client device boot** — needs a real device/emulator. Cleared in Phase 1 on the user's phone (CPH2573) on the Mac; never reproducible on this VPS.
2. **Live `MAESTRO_PTY_HOST=server` server** — `node-pty`'s native binary is unbuildable on this headless linux-x64 VPS (no prebuild; `npm rebuild` is a no-op), and the server hard-imports it at boot.

**To finish v1 on a device-capable host (the Mac/phone, as Phase 1 was):**
- **W-DEVICE (Phases 4–5):** build a dev-client / run on device; navigate to the terminal (`/terminal/[sessionId]`) and whiteboard (`/whiteboard/[sessionId]`) routes against a real `MAESTRO_PTY_HOST=server` server. Confirm: PTY keystroke↔output echo + resize + exit/no-PTY states; whiteboard scene load → edit → debounced save (`updateDocContent`/`addSessionDoc`) → reload persists.
- **W4 (Phase 3):** same live server — exercise create→`*:created` / update→`*:updated` / spawn→`session:spawn` round-trip.
- **CDN→inline assets:** xterm + Excalidraw currently load from a CDN with offline fallback; the VPN-only network may lack public internet, so inline the assets before production (TODO documented in `src/terminal`/`src/whiteboard`).
- **Thin Forge follow-up:** add a whiteboard launch affordance (session detail → `routes.whiteboard(sessionId)`); the terminal already has its entry path.
- Optional polish deferred in v1: reconnect hardening, a11y pass. (No push notifications in v1 — would need a server change.)

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
