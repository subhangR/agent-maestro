# maestro-mobile — planning phase (coordinator-run)

A ready-to-execute brief for **Atlas** (coordinator) to spawn and manage the team through a **parallel-plan → cross-review → consensus → ratified documents** cycle, before any implementation. No code is written in this phase.

> Why this is a doc and not a live Maestro task yet: the session that prepared this is a *worker* and cannot create tasks/teams or spawn. Instantiate via the commands at the bottom from a coordinator session.

## Objective

Plan the entire React Native (Expo) application — **design, structure, best practices, dependencies & libraries** — agreed by **whole-team consensus**. Hard constraint: reuse the existing maestro-server **unchanged** (REST + entity-sync WebSocket + `/pty`), exactly like maestro-ui. Connection contract: `MOBILE_APP_BUILD_ANALYSIS.md`.

## Step 1 — Parallel planning (one workstream per specialist)

Each member writes `planning/<domain>.md` in the `feat/mobile-app` worktree: their recommended architecture, **specific library choices with rationale + alternatives rejected**, folder structure for their scope, best practices, risks, and open questions / cross-team dependencies.

| Member | Workstream | Must decide (with rationale) |
|--------|-----------|------------------------------|
| 🪨 Bedrock | Foundation & theme | Expo SDK version, RN version, TS config, monorepo-or-standalone, fonts loading, `react-native-svg`, theme architecture (`--pn-*`→tokens), light/dark strategy |
| 📐 Lexicon | Domain & types | Type modeling of server entities, validation lib (zod?), how contract types stay in sync with server, shared enums |
| 🔌 Conduit | API services | REST client design (fetch wrapper vs library), secure token storage (`expo-secure-store`?), env/config, error model |
| 📡 Pulse | Realtime | WebSocket client (native `WebSocket` vs lib), reconnect/backoff, `/pty` binary transport, event normalization |
| 🗃️ Ledger | State | State lib (zustand? jotai? redux-toolkit?), persistence (`react-native-mmkv`?), reconciler design, selector patterns |
| 🧭 Compass | Navigation | `expo-router` vs `react-navigation`, bottom-sheet lib (`@gorhom/bottom-sheet`?), deep linking, tab/stack structure |
| 🎨 Palette | UI components | Styling approach (StyleSheet vs `unistyles` vs `tamagui`/`nativewind`?), component API, a11y, animation lib (`reanimated`?) |
| 🛠️ Forge | Features / screens | Screen composition, data-hook patterns, optimistic updates, list virtualization (`FlashList`?) |
| ⌨️ Relay | Terminal | WebView lib (`react-native-webview`), xterm host bridge, keyboard/IME handling, scrollback |
| ✅ Sentinel | QA / integration | Test stack (jest + RN testing library?), typecheck/build gates, CI, consensus arbitration criteria |

## Step 2 — Cross-review

Every member reads all other `planning/*.md` and appends an objections/dependencies section at boundaries that must agree: **types ↔ services ↔ state ↔ features**, theme ↔ components, realtime ↔ state, navigation ↔ features. Flag any conflicting library choices.

## Step 3 — Consensus (Atlas arbitrates)

Atlas resolves cross-cutting conflicts until the team agrees, at minimum: router (expo-router vs react-navigation), state lib, styling system, WS client, secure storage, WebView/terminal approach, list lib. Each decision recorded with the rationale and the rejected alternative.

## Step 4 — Ratified documents (the deliverable)

Atlas produces, from the converged plans:
- `ARCHITECTURE.md` — layers, data flow, module boundaries
- `PROJECT_STRUCTURE.md` — the agreed folder tree
- `DEPENDENCIES.md` — every library + version + why
- `CONVENTIONS.md` — coding standards, naming, styling, testing
- `BUILD_PLAN.md` — ratified phase plan superseding the draft `COORDINATION_PLAN.md`

Acceptance: all five exist, internally consistent, every member has signed off, no unresolved boundary conflict.

## Instantiate (run from a coordinator session)

```
# 1) bundle the team
maestro team create "Maestro Mobile" --leader tm_1781678505518_doggxb1sq \
  --members tm_1781678505758_rinutdhje,tm_1781678505988_ot6x7vuoo,tm_1781678506221_sl39sn0s1,tm_1781678506449_qjyqbewv6,tm_1781678506678_q1o5zcxl1,tm_1781678531941_sh23bh2s2,tm_1781678532172_w5f6jz3n0,tm_1781678532400_kvbpkuvb3,tm_1781678532631_0227i1fzn,tm_1781678532887_5wxcsev4x \
  --avatar "📱"

# 2) create the planning task assigned to the team (spawns Atlas as coordinator)
maestro task create "maestro-mobile — RN app planning & team consensus" --priority high \
  --team <teamId-from-step-1> \
  --description "<paste this file's Objective + Steps>"

# 3) Atlas then spawns each specialist on their planning workstream (Step 1),
#    runs cross-review (Step 2), arbitrates consensus (Step 3), and writes the docs (Step 4).
```
