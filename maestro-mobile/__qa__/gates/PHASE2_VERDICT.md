# SENTINEL VERDICT — Phase 2 (Shell + read surfaces)

**Status: PASS** (re-gate after metro fix `786a801`) — all 6 gate criteria pass, including
the Android Metro build that previously FAILED. The build now exits 0 with a populated,
isolation-clean bundle. Phase 2 is cleared.

> **History:** the FIRST gate was **FAIL** — a green tsc + green jest were necessary but
> NOT sufficient; only the serialized Expo export surfaced that the new DocsViewer
> `markdown-it → entities` chain could not resolve under the isolation metro config
> (nested `entities@2` unreachable; top-level `entities@6` lacks `lib/maps/`). Bedrock
> landed a tightly-scoped `resolveRequest` shim (commit `786a801`) and this re-gate
> verifies the fix end-to-end. The detailed first-FAIL root cause is retained below for
> the record.

Date: 2026-06-17 · Branch: feat/mobile-app · Commits under test: `1ea1fe0` (shell+tiles) + `1dd5c6f` (read surfaces + docs viewer) + `786a801` (metro entities shim)
Scope verified read-only from `__qa__/`. No app code modified. Git not run (Atlas integrates).

---

## RE-GATE result (after `786a801`)

```
EXPO BUILD (metro export, android) ........... ✓ PASS  (exit 0; dist/ = 77 files, 11M; hbc bundle 5.58 MB)
  ├─ bundle isolation: 'maestro-server' string ... 0 hits   (clean)
  ├─ bundle isolation: '__sync__' string ......... 0 hits   (clean)
  ├─ bundle isolation: server-only tokens ........ 0 hits   (FileSystemTaskRepository/InMemoryEventBus/WebSocketBridge)
  ├─ markdown-it bundled ......................... yes (4 string hits)
  ├─ entities map bundled (proof shim worked) .... yes ('aacute' from entities/lib/maps/entities.json — 2 hits)
  └─ mermaid bundled ............................. yes (7 hits)
tsc (app --noEmit) ........................... ✓ PASS  (exit 0)
jest (unit + integration) .................... ✓ PASS  (76/76, 9 suites)
read-surface no-regression sweep ............. ✓ PASS  (no m-data; useShallow 0 violations; no A↔B; components↛state/features)
```

The metro shim (`metro.config.js:30-39`) rewrites only `entities`/`entities/*` requests whose
`originModulePath` is inside `node_modules/markdown-it`, redirecting to its nested `entities@2`
copy. `disableHierarchicalLookup=true` and the blockList are untouched — and the bundle scan
confirms isolation held (zero server/`__sync__` leakage). The `aacute` HTML-entity name in the
Hermes bundle is positive proof the previously-missing `lib/maps/entities.json` is now resolved
and bundled — i.e. the exact failure is fixed, not merely worked around.

**VERDICT: PASS → Phase 2 closed.**

---
<!-- ===================== ORIGINAL FIRST-GATE (FAIL) RECORD BELOW ===================== -->
## (Archived) First gate — FAIL record

---

## Gate scorecard

```
1. tsc (app --noEmit) ............................ PASS  (exit 0)
   tsc drift guard (tsconfig.drift.json) ........ PASS  (server-types resolve, isolated)
2. all read surfaces render LIVE data ........... PASS  (no m-data constants; entity hooks + REST)
3. useShallow invariant ......................... PASS  (0 violations across features + components)
4. doc viewer renders 3 content kinds ........... PASS (code paths) — but see FAIL: markdown dep won't bundle
5. boundary-lint (A↔B + acyclic layers) ......... PASS  (no cross-stream imports; layers clean)
6. Maelstrom contract smoke ..................... PASS  (9/9)
   jest (unit + integration) .................... PASS  (76/76, 9 suites)
   ────────────────────────────────────────────
   EXPO BUILD (metro export, android) ........... ✗ FAIL  (exit 1 — unresolved module)
   expo-doctor .................................. 16/18 (2 waivers, see below)
```

**VERDICT: FAIL** — the application does not produce an Android bundle.

---

## ✗ BLOCKER — Metro bundle fails (app does not build)

`NODE_ENV=production npx expo export --platform android` aborts (exit 1):

```
Error: Unable to resolve module entities/lib/maps/entities.json
  from node_modules/markdown-it/lib/common/entities.js
Import stack:
  react-native-markdown-display → markdown-it → entities/lib/maps/entities.json
  ← src/features/docs/DocsViewer.tsx (import "react-native-markdown-display")
  ← src/features/sessions/SessionDetailScreen.tsx (import "../docs")
  ← app/(tabs)/(sessions)/session/[id].tsx
```

### Root cause (two config facts collide with a nested dependency)

1. `src/features/docs/DocsViewer.tsx` (NEW in Phase 2) imports `react-native-markdown-display`,
   which pulls `markdown-it@10.0.0`. markdown-it pins `entities@~2.0.0`; its module
   `markdown-it/lib/common/entities.js:6` does `require('entities/lib/maps/entities.json')`.
2. npm installed that as a **nested** copy:
   `node_modules/markdown-it/node_modules/entities/lib/maps/entities.json` ✓ (exists).
3. The **hoisted top-level** `node_modules/entities` is `entities@6.0.1` — restructured to
   `dist/`, with **no `lib/maps/`** and an `exports` map that does not expose that subpath.
4. `metro.config.js:16` pins `resolver.nodeModulesPaths = [<projectRoot>/node_modules]` and
   `metro.config.js:17` sets `resolver.disableHierarchicalLookup = true` (the deliberate
   monorepo-isolation override that keeps `../maestro-server` + `__sync__` out of the bundle).
   Together these forbid Metro from walking into `markdown-it/node_modules/entities`, so
   `entities` resolves to the wrong top-level v6 → the JSON map is missing → **fatal**.

This is invisible to tsc and jest: both use node / jest-expo resolution (which DO walk
nested node_modules), not Metro's isolation-constrained resolver. Only a real export
surfaces it.

### Severity

Hard FAIL. DocsViewer is a live import (reachable from the Sessions detail screen), not
dead code, so the whole Android bundle fails. The phase's central claim — "all surfaces
render live data on device" — is **unverifiable on device** because no bundle is produced.
The export aborts at the FIRST fatal resolution; additional latent bundle issues cannot be
ruled out until this is fixed and the export re-run.

### Owner & fix (Conduit / Bedrock — metro.config.js + deps; NOT a read-surface code bug)

Pick one, least-invasive first (all preserve the `__sync__` / `maestro-server` isolation):

- **A. `resolveRequest` shim** in `metro.config.js` — special-case `entities/lib/maps/*`
  (or any `entities` request originating in `markdown-it`) to resolve from
  `markdown-it/node_modules/entities`. Smallest blast radius.
- **B. Add the nested dir** to `resolver.nodeModulesPaths`
  (`path.resolve(projectRoot,'node_modules/markdown-it/node_modules')`) — broader, but simple.
- **C. Dependency dedupe** — force a single `entities` whose layout markdown-it accepts
  (e.g. a package.json `overrides`/resolution + reinstall under the NODE_ENV=development rule),
  then re-verify the export.

Do **not** simply set `disableHierarchicalLookup = false` — that re-opens the isolation hole
the override exists to close (would let `../maestro-server` CJS leak into the bundle).

After the fix: re-run `__qa__/gates/run-gate.sh --with-export` (serialized, alone) to confirm
a clean bundle before Phase 3 opens.

---

## ✓ Criterion 1 — typecheck (app + drift) — PASS

- `npx tsc --noEmit` → exit 0.
- `tsc -p tsconfig.drift.json` (isolated, resolves server types via `src/domain/__sync__`) → clean.
- Isolation invariants hold: app `tsconfig` excludes `src/domain/__sync__`; metro `blockList`
  excludes `__sync__` + `../maestro-server`.
- Suppression scan: **no** `@ts-nocheck` / `@ts-ignore` / `@ts-expect-error` in `src/ app/`.

## ✓ Criterion 2 — every read surface renders LIVE server data — PASS

- No `m-data` / mock constants: the only `m-data` hits are design-source *comments* in
  `src/domain/derive/{sessionStatus,mode,agentTool}.ts` (referencing the original `m-data.jsx`),
  not data. Grep for `MOCK_/mock[A-Z]/FAKE_/DUMMY_/SAMPLE_` and array-of-object literals in
  feature/component bodies → **none**. App tab screens all mount real `@/features/*` screens
  (placeholders removed).
- Data sources, per surface:
  - **tasks** → `useOpenTasks` / `useProjectTasks` / `useTask` / `useTaskTree` / `useSessionsForTask` (entity store, WS-fed)
  - **sessions** → `useSessionsByTab` / `useLiveSessions` / `useProjectSessions` / `useSession`
  - **members** → `useMembersWithLiveCounts` / `useTeamMember` / `useProjectSessions`
  - **teams** → `useProjectTeams` / `useTeam` / `useProjectMembers` (REST-poll-fed store, per contract)
  - **graphs** → `useEntityStore(useShallow(s => Object.values(s.taskGraphs)…))`; `taskGraphs`
    populated by `state/ingest.ts:226` (WS ingest) — live.
  - **lists** → live REST: `useRest(() => getMaestroClient().getTaskLists(pid))` → `/task-lists?projectId=` (`MaestroClient.ts:246`)
  - **profiles** → live REST: `useRest(() => getMaestroClient().getModelProfiles())` (`MaestroClient.ts:612`)
  - **skills** → derived live from `useProjectMembers().skillIds` + `useProjectTasks().skillIds`
    (deduped w/ usage counts; no skill REST endpoint exists in the v1 client — documented in-file).
  - composite tiles (`MTaskTile`/`MSessionTile`/`NowPlaying`) are prop-driven (typed `*Props`, no embedded data).
- `useRest` is a real one-shot fetch hook (`features/more/kit.tsx:144`) that invokes the client and exposes loading/error/reload.

## ✓ Criterion 3 — useShallow invariant — PASS (0 violations)

- `src/state/hooks.ts` is exemplary: atomic single-entity reads (`useTask/useSession/…`)
  return reference-stable values (no `useShallow` needed); **every** list/array selector
  (`useProjectTasks`, `useOpenTasks`, `useSessionsByTab`, `useProjectMembers`,
  `useMembersWithLiveCounts`, `useProjects`, …) wraps in `useShallow`.
- All 15 direct `use*Store(` call sites in `src/features` + `src/components` audited:
  14 are scalar/stable reads (`s.activeProjectId`, `s.themeMode`, `s.lastHost`,
  `s.realtimeStatus`, `s.setThemeMode`); the one object/array selector —
  `features/graphs/GraphsScreen.tsx:26` (`Object.values(...).filter(...)`) — **correctly**
  wraps in `useShallow`.
- No custom stores bypass the rule; the object-literal `setState((prev) => ({…}))` matches in
  `state/fetchActions.ts` / `state/ingest.ts` are **writers**, not render subscriptions — not applicable.

## ✓ Criterion 4 — doc viewer renders the 3 content kinds — PASS (code paths)

`src/features/docs/DocsViewer.tsx` resolves kind via `detectDocKind` (excalidraw → mermaid → markdown) and has all three render paths:
- **markdown** → `react-native-markdown-display` (native RN render), themed styles. ⚠ this is the dep that fails to bundle (see BLOCKER).
- **mermaid** → read-only `WebView` (`mermaidHtml`), CDN mermaid@10 with raw-source offline fallback; handles `` ```mermaid `` fences and bare keyword bodies.
- **excalidraw** → read-only `WebView` (`excalidrawHtml`) that statically paints
  rectangle/ellipse/diamond/line/arrow/freedraw/text onto a fit-to-view `<canvas>`, with an "unreadable scene" fallback.

Editing is correctly deferred to Phase 5. Code paths are complete; the markdown path is
blocked only by the bundle failure above (fix the dep resolution and all three render).

## ✓ Criterion 5 — boundary-lint — PASS

- **No Stream A↔B cross-imports**: A (`tasks/members/teams/skills/lists/graphs/profiles`)
  imports no `features/sessions|conduct`; B (`sessions/conduct`) imports no A feature. (both grep sets empty)
- Within-stream imports only, all A→A: `more/MoreScreen.tsx` hosts the A screens
  (Graphs/Lists/Profiles/Skills/Teams) as the More tab; `teams/TeamDetailScreen.tsx:15` reuses
  `MemberRow` from `../members`. No cross-stream component reuse.
- **Acyclic layers hold**:
  - `src/components/**` imports only `@/domain`, `@/theme`, and relative sibling
    primitives/controls — **never** `state/`, `features/`, or `services/`.
  - `src/services/realtime/**` does **not** import `services/api`.
- Cross-stream actions are routed only via Compass sheets (`conduct/CommandSheet.tsx` uses a
  static `ACTIONS` UI menu config — not entity data).

## ✓ Criterion 6 — contract harness + tests — PASS

- **Maelstrom smoke 9/9 PASS**: ping→pong; batched=ARRAY; immediate=SINGLE object;
  immediate-not-array; pty size-frame-first; binary scrollback; size-precedes-bytes;
  1011 (no-PTY); 1008 (missing sessionId).
- **jest 76/76 PASS** (9 suites: phase1-contract, serverConfig, eventNormalizer, ingest,
  optimistic, reconnect, streamingDecoder, batchSet, selectors).

---

## Waivers (carried — non-blocking, root-config hygiene, Bedrock-owned)

- **W1 — `expo-constants` undeclared.** expo-doctor flags it as a missing `expo-router` peer
  dep. It **does resolve** transitively (`node_modules/expo-constants` present) and is not
  imported by app code, so it is not a boot blocker today; declare it in `package.json` for
  hygiene/determinism. Not a Phase-2 read-surface defect.
- **W2 — metro `disableHierarchicalLookup` mismatch.** expo-doctor wants `false`; the value is
  `true` **by design** (monorepo isolation, documented in `metro.config.js`). Keep it — but it
  is the proximate cause of the BLOCKER, so the fix must add a targeted resolver exception
  rather than disabling the override.

---

## Bottom line

Read-surface code quality is **excellent** — live data everywhere, the useShallow invariant
that caused the Phase-1 reload bug is clean, boundaries and layers hold, contract framing is
proven, 76 tests + 9 contract checks green. **But the app does not build for Android** because
the Phase-2 DocsViewer's `markdown-it → entities` chain cannot resolve under the isolation
metro config. That is a hard, shippable-blocking FAIL and it must be fixed + the serialized
export re-run clean before Phase 3 opens.

**One FAIL vetoes → Phase 2 = FAIL.** Hand to Conduit/Bedrock for the metro/dep fix; re-gate
on a clean `run-gate.sh --with-export`.

> **UPDATE (re-gate):** Bedrock landed the metro `resolveRequest` shim (`786a801`); the
> serialized Android export now exits 0 with a populated, isolation-clean bundle (server/`__sync__`
> zero leakage; markdown-it + entities map + mermaid bundled). All 6 criteria pass. **Final
> Phase-2 verdict = PASS** — see the RE-GATE section at the top of this file. W1/W2 remain as
> non-blocking carried waivers (W2's override is intentionally kept; the shim is the targeted
> exception it called for).
