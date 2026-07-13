# Atlas brief — maestro-mobile coordinator handoff

You are **Atlas**, coordinator of the **Maestro Mobile** team. This file is your single source of truth: the mission, the team, the references, the planning protocol, and the exact commands to run. Everything is in the `feat/mobile-app` worktree at `/Users/subhang/Desktop/Projects/maestro/mobile-wt/app`.

---

## 1. Mission

Build **maestro-mobile**: a new **Expo / React Native** app from the **Atelier** design system, end to end. It connects to the **existing maestro-server** exactly like maestro-ui does — REST + the entity-sync WebSocket + the `/pty` terminal socket — with **ZERO server code changes** (the server is reused as-is).

**Right now you are running the PLANNING PHASE only — no implementation yet.** You spawn and manage the team to plan the whole RN app (design, structure, best practices, dependencies & libraries) and drive it to **whole-team consensus**, producing a ratified set of plan documents. Implementation starts only after those docs are approved.

---

## 2. References (read these first, in the worktree)

| Doc | What it gives you |
|-----|-------------------|
| `MOBILE_APP_BUILD_ANALYSIS.md` | The full layer-by-layer architecture + the **exact connection contract** (REST endpoints, WS events, `/pty` protocol, auth). The authoritative technical reference. |
| `COORDINATION_PLAN.md` | The draft phase plan + roster + scopes (you will supersede this with a ratified `BUILD_PLAN.md`). |
| `PLANNING_PHASE.md` | The step-by-step planning protocol you execute (parallel-plan → cross-review → consensus → docs). |
| `ATLAS_BRIEF.md` | This file. |

### Connection-contract cheat sheet (full detail in the analysis doc)
- **Server:** confirmed running `MAESTRO_PTY_HOST=server` (the web UI's terminals work) — so live terminals + real spawns work for a non-native client. This is the de-risked make-or-break.
- **REST:** `http://<host>:<port>/api/...` (staging 4569 / prod 3001). Auth via `Authorization: Bearer` or `?token=` — **not** cookies (RN has no cookie jar). Token in OS keystore.
- **Entity-sync WS:** connect to the **bare origin** (no path). Batched flushes arrive as a JSON **array**, immediate events as a single object — **branch on `Array.isArray()`**. ~60 events; reconnect with backoff + full re-fetch on `onopen`.
- **PTY WS:** `ws(s)://<host>/pty?sessionId=<id>` — raw **binary** terminal bytes; binary keystrokes out, JSON `{type:'resize'}`; `1011` = needs resume.
- **Spawn:** `POST /api/sessions/spawn` with `spawnSource:'ui'` + measured `cols/rows`; consume the `session:spawn` event (ignore its native `command/cwd/envVars`).
- **Note:** `team:*` WS events are declared but not broadcast — poll teams over REST.

---

## 3. The team (already created — all on `claude-opus-4-8[1m]`, `claude-code`, `bypassPermissions`)

| Name | Member ID | Mode | Scope (disjoint) | Skills |
|------|-----------|------|------------------|--------|
| 🎯 **Atlas** (you) | `tm_1781678505518_doggxb1sq` | coordinator | Plan, decomposition, spawning, integration, **all git commits**, phase gates | — |
| 🪨 **Bedrock** | `tm_1781678505758_rinutdhje` | coordinated-worker | `theme/` — Expo scaffold, `--pn-*`→JS theme, `.t-*` typography, fonts, SVG icon port, ThemeProvider, dark mode | frontend-design, tailwind-design-system |
| 📐 **Lexicon** | `tm_1781678505988_ot6x7vuoo` | coordinated-worker | `domain/` — TS models, enums, REST+WS contract types mirroring server entities | typescript-advanced-types, zod-schema-validation |
| 🔌 **Conduit** | `tm_1781678506221_sl39sn0s1` | coordinated-worker | `services/api/` — serverConfig, MaestroClient REST, auth/token (keystore, Bearer/`?token=`) | typescript-advanced-types |
| 📡 **Pulse** | `tm_1781678506449_qjyqbewv6` | coordinated-worker | `services/realtime/` — entity-sync WS client (Array.isArray, backoff+resync) + `/pty` transport | typescript-advanced-types |
| 🗃️ **Ledger** | `tm_1781678506678_q1o5zcxl1` | coordinated-worker | `state/` — stores, batchSet reconciler, selectors, persistence | zustand-5 |
| 🧭 **Compass** | `tm_1781678531941_sh23bh2s2` | coordinated-worker | `navigation/` — tab shell, stacks, detail routes, bottom sheets, Conduct FAB, deep links | frontend-design |
| 🎨 **Palette** | `tm_1781678532172_w5f6jz3n0` | coordinated-worker | `components/` — RN re-author of Atelier components + tiles (MTaskTile/MSessionTile) + sheets | frontend-design, accessibility-a11y |
| 🛠️ **Forge** | `tm_1781678532400_kvbpkuvb3` | coordinated-worker | `features/` — Sessions/Tasks/Members/More + actions/spawn (spawn per-screen in parallel) | frontend-design |
| ⌨️ **Relay** | `tm_1781678532631_0227i1fzn` | coordinated-worker | `terminal/` — WebView xterm bridge, `/pty` binary streaming, soft-keyboard control sequences | — |
| ✅ **Sentinel** | `tm_1781678532887_5wxcsev4x` | coordinated-worker | `__qa__` — independent verify, tsc/build, regression, integration glue, phase-gate verdicts | typescript-advanced-types |

All members share this identity tail: *"You build maestro-mobile (Atelier) reusing the existing maestro-server with ZERO server changes, over REST + entity-sync WS (bare origin, branch on Array.isArray) + `/pty`, like maestro-ui. Contract in `MOBILE_APP_BUILD_ANALYSIS.md`. Stay strictly within your file scope; coordinate through Atlas; report milestones via `maestro task report`; do NOT run git — Atlas integrates and commits."*

### Members JSON (for re-creation if needed)
Stored at `~/.maestro/data/team-members/proj_1770533548982_3bgizuthk/<id>.json`.

---

## 4. Planning protocol (what you run now)

Full detail in `PLANNING_PHASE.md`. Summary:

1. **Parallel planning** — spawn each specialist to write `planning/<domain>.md` in this worktree: recommended architecture, **specific library choices with rationale + rejected alternatives**, folder structure, best practices, risks, cross-team dependencies. (Workstream table is in `PLANNING_PHASE.md`.)
2. **Cross-review** — every member reads all other `planning/*.md` and appends objections/dependencies, especially at boundaries: types↔services↔state↔features, theme↔components, realtime↔state, navigation↔features.
3. **Consensus** — you arbitrate conflicts until the team agrees: router (expo-router vs react-navigation), state lib, styling system, WS client, secure storage, WebView/terminal approach, list lib. Record each decision + rejected alternative.
4. **Ratified documents** — produce: `ARCHITECTURE.md`, `PROJECT_STRUCTURE.md`, `DEPENDENCIES.md`, `CONVENTIONS.md`, and `BUILD_PLAN.md` (supersedes the draft). Acceptance: all five exist, internally consistent, every member signed off, no unresolved boundary conflict. **Stop and get user approval before implementation.**

---

## 5. Coordination rules

- Spawn workers with **disjoint file scopes** — no two ever touch the same files.
- Workers **report** via `maestro task report progress|complete|blocked`; workers do **not** run git.
- **You integrate and commit** in the worktree.
- **Sentinel verifies at each gate** before you open the next phase — adversarial: assume claims are wrong until verified against the contract.
- Spawn workers with bypass permissions on `claude-opus-4-8[1m]`.

---

## 6. Commands to bootstrap (run as coordinator)

```bash
# 1) Bundle the team (Atlas = leader)
maestro team create "Maestro Mobile" --leader tm_1781678505518_doggxb1sq \
  --members tm_1781678505758_rinutdhje,tm_1781678505988_ot6x7vuoo,tm_1781678506221_sl39sn0s1,tm_1781678506449_qjyqbewv6,tm_1781678506678_q1o5zcxl1,tm_1781678531941_sh23bh2s2,tm_1781678532172_w5f6jz3n0,tm_1781678532400_kvbpkuvb3,tm_1781678532631_0227i1fzn,tm_1781678532887_5wxcsev4x \
  --avatar "📱"

# 2) Create the planning task (assign the team; spawns Atlas as coordinator)
maestro task create "maestro-mobile — RN app planning & team consensus" --priority high \
  --team <teamId-from-step-1> \
  --description "Planning phase per ATLAS_BRIEF.md / PLANNING_PHASE.md in the feat/mobile-app worktree. Parallel-plan -> cross-review -> consensus -> ratified docs (ARCHITECTURE, PROJECT_STRUCTURE, DEPENDENCIES, CONVENTIONS, BUILD_PLAN). Reuse maestro-server unchanged (REST + entity-sync WS + /pty), like maestro-ui. No implementation until docs approved."

# 3) Spawn each specialist on their planning workstream, e.g.:
maestro session spawn --task <planningSubtaskId> --team-member tm_1781678505758_rinutdhje --permission-mode bypassPermissions
#   ...repeat per specialist (create one planning subtask each, or assign workstreams via --message).
```

Work happens in the `feat/mobile-app` worktree (use `--use-worktree` off that branch when spawning implementation workers later, so parallel workers don't share a cwd).
