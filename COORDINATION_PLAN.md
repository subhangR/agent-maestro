# maestro-mobile — team & coordination plan

Build the Atelier mobile app end-to-end against the **existing** maestro-server with **zero server changes**, connecting over REST + the entity-sync WebSocket + the `/pty` terminal socket exactly like maestro-ui. Full connection contract: `MOBILE_APP_BUILD_ANALYSIS.md` (same folder). Worktree: `feat/mobile-app` at `/Users/subhang/Desktop/Projects/maestro/mobile-wt/app`.

All members: model `claude-opus-4-8[1m]`, agent-tool `claude-code`, permission-mode `bypassPermissions`.

## Roster

| Name | Member ID | Mode | Scope (disjoint) |
|------|-----------|------|------------------|
| 🎯 Atlas | `tm_1781678505518_doggxb1sq` | coordinator | Plan, decomposition, spawning, integration, **all git commits**, phase gates |
| 🪨 Bedrock | `tm_1781678505758_rinutdhje` | coordinated-worker | `theme/` — Expo scaffold, `--pn-*`→JS theme, `.t-*` typography, fonts, SVG icon port, ThemeProvider, dark mode |
| 📐 Lexicon | `tm_1781678505988_ot6x7vuoo` | coordinated-worker | `domain/` — TS domain models, enums, REST+WS contract types mirroring server entities |
| 🔌 Conduit | `tm_1781678506221_sl39sn0s1` | coordinated-worker | `services/api/` — serverConfig, MaestroClient REST, auth/token (keystore, Bearer/`?token=`) |
| 📡 Pulse | `tm_1781678506449_qjyqbewv6` | coordinated-worker | `services/realtime/` — entity-sync WS client (Array.isArray branch, backoff+resync) + `/pty` transport |
| 🗃️ Ledger | `tm_1781678506678_q1o5zcxl1` | coordinated-worker | `state/` — stores, batchSet reconciler, selectors, persistence |
| 🧭 Compass | `tm_1781678531941_sh23bh2s2` | coordinated-worker | `navigation/` — 4-tab shell, stacks, detail routes, bottom sheets, Conduct FAB, deep links |
| 🎨 Palette | `tm_1781678532172_w5f6jz3n0` | coordinated-worker | `components/` — RN re-author of Atelier components + tiles (MTaskTile/MSessionTile) + sheet shells |
| 🛠️ Forge | `tm_1781678532400_kvbpkuvb3` | coordinated-worker | `features/` — wire Sessions/Tasks/Members/More + actions/spawn (spawned per-screen in parallel) |
| ⌨️ Relay | `tm_1781678532631_0227i1fzn` | coordinated-worker | `terminal/` — WebView xterm bridge, `/pty` binary streaming, soft-keyboard control sequences |
| ✅ Sentinel | `tm_1781678532887_5wxcsev4x` | coordinated-worker | `__qa__` — independent verify, tsc/build, regression, integration glue, phase-gate verdicts |

## Phase plan (Atlas drives)

| Phase | Members (parallel within phase) | Delivers | Gate before next |
|-------|--------------------------------|----------|------------------|
| **0 — Foundation** | Bedrock ∥ Lexicon *(commit untracked Atelier assets first)* | Expo scaffold, theme+typography+fonts+SVG icons; domain types/enums/contract types | Sentinel: tsc passes, theme renders, types compile |
| **1 — Connection core** | Conduit ∥ Pulse ∥ Ledger ∥ Palette(start) | REST client + auth; entity-sync WS + `/pty` transport; stores+reconciler; RN component library | Sentinel: live fetch + WS reconcile against a running server |
| **2 — Shell + read surfaces** | Compass → Forge×4 | Tab/stack/sheet nav; Sessions/Tasks/Members/More read-only wired to stores; mock constants removed | Sentinel: all 4 screens render live server data |
| **3 — Actions & spawn** | Forge ∥ Conduit | Task/member mutations, spell cast; spawn flow (`spawnSource:'ui'`, `cols/rows`, consume `session:spawn`) | Sentinel: round-trip create/edit + spawn creates a real session |
| **4 — Terminal** | Relay | WebView xterm + `/pty` (binary keystrokes, JSON resize, streaming TextDecoder, 1011=resume); reattach per alive session | Sentinel: live terminal attaches + echoes against `MAESTRO_PTY_HOST=server` |
| **5 — Polish & integration** | Sentinel + all | Reconnect hardening, push from `notify:*`, empty/error states, a11y, theming QA | Final verify |

## Mechanics

- Atlas decomposes each phase into Maestro tasks and spawns coordinated-worker sessions **with disjoint package scopes** — no two workers touch the same files.
- Workers report milestones via `maestro task report progress|complete|blocked`. Workers do **not** run git.
- **Atlas integrates and commits** in the worktree after each worker reports complete.
- **Sentinel independently verifies** at each phase gate before Atlas opens the next phase. Sentinel is adversarial: assume claims are wrong until verified against the contract.
- Confirmed de-risked: the deployed server already runs `MAESTRO_PTY_HOST=server` (the web UI's terminals work), so the `/pty` path is proven for non-native clients.

## Spawn reference (run by a coordinator session)

```
# Bundle into a team (coordinator-mode command):
maestro team create "Maestro Mobile" --leader tm_1781678505518_doggxb1sq \
  --members tm_1781678505758_rinutdhje,tm_1781678505988_ot6x7vuoo,tm_1781678506221_sl39sn0s1,tm_1781678506449_qjyqbewv6,tm_1781678506678_q1o5zcxl1,tm_1781678531941_sh23bh2s2,tm_1781678532172_w5f6jz3n0,tm_1781678532400_kvbpkuvb3,tm_1781678532631_0227i1fzn,tm_1781678532887_5wxcsev4x \
  --avatar "📱"

# Phase 0 (example): spawn Bedrock + Lexicon on their tasks, useWorktree off the feat/mobile-app branch.
```
