# maestro-mobile — HANDOFF

Continue the Atlas-orchestrated build of **maestro-mobile** (Atelier Expo/React Native app reusing the existing maestro-server with zero server changes) on another machine / the cloud.

## What this is

A multi-agent ("Maestro") orchestration: a coordinator (Atlas) decomposes the build into phases, spawns specialist workers on disjoint file scopes, integrates + commits their output, and gates each phase with an adversarial QA agent (Sentinel). Branch: `feat/mobile-app` (pushed to `origin`). App lives at `maestro-mobile/`.

## Read in this order

1. **[RESUME_PROMPT.md](RESUME_PROMPT.md)** — the prompt to paste into a fresh cloud agent to continue. **Start here.**
2. **[PROGRESS.md](PROGRESS.md)** — phase status, commit list, the immediate next step (run the Phase-1 gate), remaining phases.
3. **[ORCHESTRATION.md](ORCHESTRATION.md)** — coordinator + team roster + every Maestro entity ID (team, members, tasks, sessions) + the spawn recipe.
4. **[GOTCHAS.md](GOTCHAS.md)** — environment/version landmines (the `NODE_ENV` devDep prune, mmkv v4, Reanimated 4, 7 WS events…) and architecture invariants. **Read before touching deps.**

Plus the ratified design docs at repo root: `ARCHITECTURE.md`, `PROJECT_STRUCTURE.md`, `DEPENDENCIES.md`, `CONVENTIONS.md`, `BUILD_PLAN.md`, and the connection contract `MOBILE_APP_BUILD_ANALYSIS.md`.

## Current state (one line)

Planning ✅ · Phase 0 Foundation ✅ (gated) · Phase 1 Connection core ✅ built + committed (`bb13c60`) — **Sentinel gate pending** · Phases 2–5 remaining.

## To continue

1. On the cloud host, get the branch: `git clone … && git checkout feat/mobile-app` (or pull).
2. `cd maestro-mobile && NODE_ENV=development npm install --include=dev --legacy-peer-deps` then `npx tsc --noEmit` (expect green).
3. Paste `RESUME_PROMPT.md` into the agent and go.
