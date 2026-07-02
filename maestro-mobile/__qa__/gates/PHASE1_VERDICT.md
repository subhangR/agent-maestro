# SENTINEL VERDICT — Phase 1 (Connection core) + on-device test

**Status: PASS (contract/code) · BLOCKED-ON-ENV (device boot = Waiver 1 NOT cleared)**

Date: 2026-06-17 · Server: live maestro-server @ :4569 (node, `MAESTRO_PTY_HOST=server`, staging data)

## Gates

```
tsc(--noEmit, app + harness) ........ PASS (exit 0; harness typechecks vs REAL modules)
jest (unit + integration) ........... 76/76 PASS (9 suites)
  - existing ........................ 69 (serverConfig, eventNormalizer, reconnect,
                                          streamingDecoder, batchSet, ingest,
                                          optimistic, selectors)
  - new adversarial gate ............ 7 (__qa__/integration/phase1-contract.test.ts)
live-server WS framing smoke ........ PASS (real bridge, host-side)
expo export (serialized) ............ SKIPPED (device build attempted instead; see below)
Android dev-client device boot ...... BLOCKED — disk full (NOT a code failure)
```

## Contract checks (Phase 1) — 7/7 verified

1. **URL derivation** — http→ws, https→wss, bare origin (no path), +`/pty`, host preserved, throws on garbage. *(serverConfig.test.ts)*
2. **Zero-auth (WS)** — connects to bare origin, no path, no `?token=`, sends NO subscribe/auth handshake (only pings). *(new gate)*
3. **Zero-auth (REST)** — MaestroClient sends no `Authorization`, no `Cookie`, no `credentials:'include'`, no `?token=`. *(new gate)* + verified by inspection (MaestroClient.ts L114-127).
4. **Array.isArray demux DRAIN** — drove the REAL `EntitySyncClient` with a mixed `[array, single, array]` sequence → 2 `ingestBatch` + 1 `ingestEvent`, no dropped half. The canonical bug is genuinely distinguished. *(new gate)*
5. **Reconnect** — backoff doubles 1s→30s cap + 0–50% jitter *(reconnect.test)*; `onopen` triggers `resyncProject(activeProject)` *(new gate)*; unanswered ping → forceReconnect *(new gate)*.
6. **App-ping survival** — client pings itself on its 20s interval (server pushes none) and survives once a pong is seen. *(new gate)*
7. **batchSet coalescing** — 50 updaters in one tick → ONE commit, all survive *(batchSet.test)*.
8. **Teams = REST-poll** — `team:*` declared-but-not-broadcast (ws.ts §177); `fetchTeams` sources teams via REST `getTeams`, not WS. *(new gate)*

## Live-bridge fidelity (host-side, real server — covers QA risk §10.1)

Connected node→`ws://localhost:4569` (bare origin, **no auth bytes**), created a task over REST, observed the echo:
- Frame arrived as an **ARRAY/batched** envelope (the `Array.isArray` branch) — exactly as the contract predicts for `task:created` (a batched, non-immediate event).
- Envelope shape `{ type, event, data, timestamp }` — **matches** the harness fixtures + `normalizeEvent` exactly.
- Proves the REAL bridge framing, not just Maelstrom.

## Claims audited

- Conduit "serverConfig derives bare-origin ws + /pty, zero auth" → **CONFIRMED** (serverConfig.test + REST zero-auth gate + live smoke).
- Pulse "Array.isArray demux + onopen resync + app ping" → **CONFIRMED** (new behavioral gate drives the real client; live smoke shows real batched-array framing).
- Ledger "batchSet N→one commit" → **CONFIRMED** (batchSet.test).

## BLOCKED — needs USER action (only Atlas accepts the waiver)

- **Device boot (Phase-0 Waiver 1) is NOT cleared.** `expo run:android` built the dev client but Gradle FAILED: *"No space left on device"* (Data volume 100%, 2.6 GB free; `~/.gradle` = 9.8 GB). No APK installed. This is an **environment** blocker, not a code defect.
- On-device live REST/WS/reconnect + theme/font render: **not verified** (no app on device).
- Retry path once disk is freed: (1) free ≥ several GB; (2) Metro port 8081 is taken by `@will/mobile` — close it or run our Metro on 8083 + `adb reverse`; (3) re-run `expo run:android`.

## Temp harness (Atlas: revert before prod commit)

- `index.ts` → `registerRootComponent(__DEV__ ? DevHarnessRoot : RootScaffold)` with a `// TEMP: phase-1 device test harness` marker. Revert this one line.
- Harness file `__qa__/devharness/DevHarness.tsx` may stay (under `__qa__`, not bundled in prod since the entry no longer references it after revert).
- New gate test `__qa__/integration/phase1-contract.test.ts` is permanent QA.

## Rationale

Phase-1 connection-core **code/contract is PASS**: typecheck green, 76/76 behavioral tests green against the REAL modules, and the live production bridge confirms bare-origin + zero-auth + batched-array framing + exact envelope shape. The only open item is the physical device boot, blocked purely by host disk space — which Atlas should either clear (user frees disk → I retry) or accept as a standing waiver into Phase 2. **No contract-fidelity FAIL.**
