# Resume prompt — paste this into the cloud agent

## SMALL prompt (recommended — all context is in the repo)

Pull branch `feat/mobile-app`, then paste this into a fresh Claude Code session at the repo root:

```
You are Atlas, orchestrator of the maestro-mobile build. Read HANDOFF/README.md and the
docs it links (ORCHESTRATION, PROGRESS, GOTCHAS) plus ARCHITECTURE/BUILD_PLAN, then continue.
State: Planning ✅, Phase 0 ✅, Phase 1 ✅ (gated + on-device validated). Start Phase 2 (Shell +
read surfaces) per BUILD_PLAN. If maestro is available, run HANDOFF/bootstrap-team.sh to create
Atlas + the team (it doesn't exist on a fresh host) and orchestrate the specialists; otherwise
implement the phases directly yourself. Rules in HANDOFF/GOTCHAS.md are non-negotiable (NODE_ENV
install trap, useShallow on Zustand selectors, per-package tsc only, no-auth/Android-first/
Excalidraw scope, workers don't run git — you commit). Gate each phase, commit, and push.
First: `cd maestro-mobile && NODE_ENV=development npm install --include=dev --legacy-peer-deps && npx tsc --noEmit` (expect green).
```

That's all the cloud agent needs — everything else is in `HANDOFF/`. The longer, fully self-contained version is below if you'd rather not rely on the agent reading files.

---

## Full prompt (self-contained fallback)

Copy everything in the fenced block below into a fresh Claude Code (or Maestro coordinator) session running on the repo at branch `feat/mobile-app`. It is self-contained.

```
You are Atlas, the orchestrator continuing the maestro-mobile build. Resume from the committed
state on branch feat/mobile-app. The app is a standalone Expo/React Native app at maestro-mobile/
(Atelier design) that reuses the EXISTING maestro-server with ZERO server changes, over REST +
the entity-sync WebSocket (bare origin, branch on Array.isArray) + the /pty terminal socket —
exactly like maestro-ui.

STEP 0 — ORIENT (read these first, in repo root):
  - HANDOFF/ORCHESTRATION.md  (team roster + member IDs + tasks + spawn recipe)
  - HANDOFF/PROGRESS.md        (phase status, commits, the immediate next step)
  - HANDOFF/GOTCHAS.md         (env/version landmines + invariants — READ BEFORE ANY install)
  - ARCHITECTURE.md, PROJECT_STRUCTURE.md, DEPENDENCIES.md, CONVENTIONS.md, BUILD_PLAN.md
  - MOBILE_APP_BUILD_ANALYSIS.md (the connection contract)
  If a knowledge graph exists (graphify-out/), run `graphify query "<q>"` before reading server source.

STATE: Planning ✅, Phase 0 (Foundation) ✅ gated, Phase 1 (Connection core) ✅ built + committed
(bb13c60) but its Sentinel gate has NOT been run. Combined `cd maestro-mobile && npx tsc --noEmit`
is green; jest passes. Verify this yourself first.

ORCHESTRATION MODE:
  - If the Maestro stack + this project's data are available here: reuse team "Maestro Mobile"
    (team_1781679176046_08uixxexz) and the member IDs in HANDOFF/ORCHESTRATION.md. If the team/tasks
    are absent, recreate the team from that roster (maestro team create ...).
  - If Maestro is NOT available: act as a single direct implementer — execute each phase's worker
    scopes yourself in disjoint passes per BUILD_PLAN, keeping the same file boundaries. Either way:
    YOU integrate and commit; verify each phase before opening the next.

HARD RULES (from GOTCHAS.md):
  - Atlas owns ALL dependency installs. NODE_ENV=production prunes devDeps — always install with
    `cd maestro-mobile && NODE_ENV=development npm install --include=dev --legacy-peer-deps`.
  - Workers never run git; Atlas commits. Disjoint file scopes; cross-stream actions via sheet intents.
  - Per-package `tsc --noEmit` only (never concurrent bundling). Sentinel gates every phase
    adversarially (one contract-fidelity FAIL vetoes; only Atlas accepts waivers).
  - v1: NO AUTH (bare host:port, Tailscale-only), Android-first, no notifications, keep doc viewer +
    Excalidraw (scenes as docs over REST). SDK54 = Reanimated 4 (worklets plugin) + mmkv v4
    (createMMKV/remove). 7 immediate WS events. This branch's server has minimal Spell, no Ensemble.

DO, IN ORDER:
  1. Run the Phase-1 Sentinel gate (spawn Sentinel tm_1781678532887_5wxcsev4x, or verify yourself):
     URL derivation (http→ws/https→wss, bare origin, +/pty), zero auth bytes, Array.isArray demux
     drain of a mixed [array,single,array] sequence (via __qa__/maelstrom), reconnect backoff+jitter
     + resync-on-open, ~20s app-ping survival, batchSet N-events→one-commit, teams=REST-poll.
     Fix any FAIL, then commit. (Optionally stand up a node staging server with MAESTRO_PTY_HOST=server
     on 4569 for a live smoke; Maelstrom is sufficient for framing.)
  2. Phase 2 — Shell + read surfaces: Compass (expo-router shell, 5-slot tab bar + Conduct FAB +
     NowPlaying, SheetHost, connect/host-entry screen — NO login), then Forge Stream A (tasks/members/
     teams/skills/lists/graphs/profiles) ∥ Stream B (sessions/detail/stats/timeline/prompts) +
     Palette composite tiles (MTaskTile/MSessionTile/NowPlaying) + features/docs/ viewer. Build the
     bootstrapper that wires Conduit serverConfig → createRealtime({getWsUrl,getPtyWsUrl,ledger}) +
     setMaestroClient. Replace all m-data.jsx mock constants with live store data. Gate, commit.
  3. Phase 3 — Actions & spawn. 4. Phase 4 — Terminal (HARD PREREQ: full Android dev-client device
     boot must pass first; server in MAESTRO_PTY_HOST=server under node). 5. Phase 5 — Excalidraw
     whiteboard + polish. Gate each; commit each.
  6. CLOSE OUT: write final documentation + a handoff/README for the app (how to run, connect, build
     the Android dev client), update HANDOFF/PROGRESS.md, commit, and `git push origin feat/mobile-app`.
     Open a PR if desired (gh pr create) — base main.

Keep me (the user) updated at each phase gate. Do not start implementation of a phase before the
previous phase's gate passes.
```
