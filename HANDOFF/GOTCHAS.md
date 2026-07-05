# maestro-mobile — Gotchas & hard-won conventions

Read this before touching deps, the toolchain, or the contract. These cost real time to discover.

## Environment / toolchain landmines

1. **`NODE_ENV=production` prunes devDeps (THE big one).** The shell has `NODE_ENV=production`, so any `npm install` / `npx expo install` runs with `omit=dev` and silently **prunes all devDependencies** (typescript, jest…), breaking tsc/jest for everyone in the shared `maestro-mobile/node_modules`.
   - **Rule: Atlas owns ALL installs.** Workers do NOT run installs (they import already-declared deps). If a worker needs a new dep, it asks Atlas.
   - **Correct install:** `cd maestro-mobile && NODE_ENV=development npm install --include=dev --legacy-peer-deps` (a `maestro-mobile/.npmrc` already pins `legacy-peer-deps=true` for React 19 peer ranges).
   - If devDeps got pruned, restore with the same command.
2. **Standalone npm app inside a bun monorepo.** `maestro-mobile/` is NOT in the root bun `workspaces`; it has its own `package-lock.json` (tracked via a `.gitignore` negation) and its own `node_modules`. Install from inside `maestro-mobile/`.
3. **Custom dev client required (no Expo Go).** unistyles v3 + react-native-webview + react-native-mmkv + svg + gorhom all need native modules.
4. **Per-package `tsc --noEmit` only — never concurrent bundling.** Concurrent `expo export`/bundle builds SIGTERM each other. `expo export` is serialized, Sentinel-only.

## Version realities (SDK 54)

- **Reanimated 4** (not 3.16) → babel plugin is `react-native-worklets/plugin` (last). `react-native-worklets` is a dep.
- **react-native-mmkv v4** (Nitro): use `createMMKV({id})` + `.remove(key)` — NOT `new MMKV()` / `.delete()`. Lazy-require it so JS test runners don't load the native module.
- **react-native-url-polyfill/auto** is imported first in `index.ts` (Hermes `URL` is partial; `serverConfig` uses `new URL()`).
- Expo SDK 54 / RN 0.81 / React 19; New Architecture ON.

## Contract corrections (verified vs server source)

- **IMMEDIATE WS events = exactly 7** (not the ~13 an earlier draft of `MOBILE_APP_BUILD_ANALYSIS.md` listed): `session:spawn`, `session:resume`, `session:prompt_send`, `session:modal`, `session:modal_action`, `session:modal_closed`, `spell:invoked`. Everything else is batched. (`WebSocketBridge.ts` L16-24.)
- **No `Authorization: Bearer`** on the server — it only reads the `maestro_auth` cookie + `?token=` query. **v1 uses NO AUTH** anyway (bare host:port). `?token=` is a documented future seam only.
- **This branch's server has minimal Spell, no Ensemble, no SPELL_COLORS** (those are on `staging`). Domain mirrors only the real types — do not invent shapes.
- **Mixed timestamps** are intentional: epoch ms on Task/Session/Spell; ISO strings on TeamMember/Team/ModelProfile. Mirror, don't normalize.

## Product/scope decisions (user-ratified, 2026-06-17)

- **No auth; connect by IP/host:port; Tailscale/VPN-only** (the private network is the security boundary).
- **Android-first** (iOS later). Handle system back button, status/nav bars, Material press, per-weight fonts.
- **No notifications in v1** (background push would need a server change).
- **Drop** file browser / Monaco editor / recordings / SSH. **Keep** the document/diagram viewer + the **Excalidraw whiteboard** (scenes persist as **docs** via `POST/GET .../docs` — `isExcalidrawSceneJson`; NOT Tauri `save_session_asset`).
- **UI split** into Stream A (maestro-panel) ∥ Stream B (session-panel) atop a shared component lib; cross-stream actions only via Compass `sheets.open` intents — never a direct cross-feature import. Straddle files (`features/conduct/`, `features/_shared/`) are owned by Stream B.

## Architecture invariants (enforce in review / boundary-lint)

- Acyclic imports: `domain → theme → components → (services, state) → features → navigation`. `components/` never imports `state/` or `features/`. `services/realtime` never imports `services/api` (it gets URLs + a ledger handle injected).
- ONE Zustand `entityStore` is the only `set()` writer; `useSessionStore`/etc. are selector namespaces over it. Pulse calls `ledger.ingestBatch/ingestEvent`; `batchSet` coalesces N events → one render via a single `queueMicrotask`.
- The drift-guard (`src/domain/__sync__`) typechecks under `tsconfig.drift.json` ONLY (server type-errors never enter the app gate); excluded from the app tsconfig + Metro blockList.
