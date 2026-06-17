# maestro-mobile — Conventions (ratified)

> Coding standards, naming, styling, state, and testing rules every worker follows. Resolves the cross-review's minor consistency items.

## 1. Language & modules

- **TypeScript everywhere**, function components, `strict` on. No default exports for components/utilities (named exports → better autoimport/refactor); route files use Expo's default-export convention.
- **Path alias** `@/*` → `src/*`. Import order: external → `@/domain` → `@/theme` → `@/components` → `@/services` → `@/state` → `@/features` → relative.
- **Acyclic imports** (enforced by boundary-lint): `domain → theme → components → (services, state) → features → navigation`. Never upward. `components/` never imports `state/` or `features/`. `services/realtime` never imports `services/api`.

## 2. Domain & types (single source of truth = the server)

- All entity types live in `@/domain`; **no parallel shapes** anywhere. Components/features import Lexicon types verbatim.
- **Branded IDs** (`SessionId`, `TaskId`, …) key all stores and props.
- Status/tab/label derivations come from `@/domain/derive` (`toUiSessionStatus`, tab predicates, `modeDisplayLabel`, `toDisplayTool`, `SPELL_COLORS`) — **never re-implement** in a tile or selector.
- **Mirror the server's mixed timestamps** (epoch ms on Task/Session/Spell; ISO strings on TeamMember/Team/ModelProfile) — do not normalize.
- zod **only at boundaries** (spawn body, WS-envelope parse, host input). Reads are types-only.
- The drift-guard (`domain/__sync__`) is typecheck-only under `tsconfig.drift.json`, excluded from the app tsconfig + Metro blockList. Sentinel owns verifying its isolation.

## 3. Connection (v1 = NO AUTH)

- The app connects directly to a user-entered **`host:port`**. Flow: connect screen → `GET /health` probe → persist host (Ledger config/prefs) → enter tabs.
- `MaestroClient` sends **no** auth header/cookie; `getToken()` returns `null`. The entity-sync WS and `/pty` connect to the **bare origin** with **no `?token=`**.
- `?token=` is retained in URL builders as a **documented future seam only** (passes nothing in v1). No `(auth)/login` route, no `/auth/status` redirect in v1. (Server reality, kept as future reference: it accepts the `maestro_auth` cookie + `?token=` — never `Authorization: Bearer`.)

## 4. State (Ledger owns the write path)

- **ONE `entityStore`** is the only `set()` writer. `useSessionStore`/`useTaskStore`/etc. are **selector namespaces over that one store** — *not* separate stores. (Supersedes any `useSessionStore/useProjectStore/useRealtimeStore` multi-store naming in earlier drafts.)
- `activeProjectId`, `realtimeStatus` (`connected`), and `themeMode` live in **`uiStore`**. Host string + prefs in **`prefsStore`** (MMKV).
- Reads via **pure `select*(state, args)`** functions wrapped in `useShallow`. Selectors consume `@/domain/derive`.
- **Realtime → state seam:** Pulse calls `ledger.ingestBatch(array)` / `ledger.ingestEvent(single)` / `ledger.resyncProject(activeProjectId)`. Pulse never touches `set`. `batchSet` coalesces a flush into **one** render via a single `queueMicrotask`.
- **Mutations:** inline field edits use `optimisticPatch` + rollback-on-error (single writer). **Creates wait for the `*:created` WS echo** (no optimistic insert). Spawn inserts from the 201 body and **idempotently reconciles** the `session:spawn` event.
- `fields=summary` for list fetches, `full` for detail, with a reducer **merge-guard** so a summary can't clobber a populated entity.

## 5. Components (presentational + intent-out)

- **Data in, intents out.** Domain components take typed entities + intent callbacks (`onEditStatus`, `onRun`, …); they never read a store or call the API. Editable state is **controlled props**, not internal `useState` (local state allowed only for pure view affordances: expanded/collapsed).
- No `window`-style global bus — sheets open via Compass's `useSheets().open({type,...})` (`SheetController` context).
- **Variants over booleans**: `<Badge variant="status" status=…/>`, not `isPrimary` soup (unistyles variants).
- **Theme only through the theme** — no hardcoded hex/space/radius; all from `theme.*`. SVG fills use `theme.colors.*` (CSS vars don't exist in RN); icons cascade via an explicit `color` prop.
- Typography via `<Text variant=…>` mapping the `.t-*` scale; `allowFontScaling` on with a capped `maxFontSizeMultiplier` (~1.3) on dense rows.
- `forwardRef` on inputs; stable `id` keys (never array index) for recursive trees; `React.memo` + stable callbacks on list rows.

## 6. Styling

- `react-native-unistyles` v3 `StyleSheet.create((theme, rt) => …)`, co-located at file bottom. Fallback (if ever needed): `StyleSheet` + `useTheme()`. No magic numbers.
- Theme registry/config owned by Bedrock (`theme/unistyles.ts`); `ThemeBoot` mounts above the expo-router navigator; mode persisted via Ledger `prefsStore.theme` (sync MMKV, pre-paint), `setThemeMode` exposed by Bedrock.

## 7. Navigation & features (A/B disjointness)

- `app/` route files are thin and **Compass-owned**, each importing exactly one feature body.
- **A/B rule:** a stream-A folder never imports a stream-B folder, and vice-versa. **Cross-stream actions dispatch `sheets.open({type,...})` typed intents** through Compass — never a direct cross-feature import.
- **Straddle files have a single owner = stream B (session-panel):** `features/conduct/` (CommandSheet body) and `features/_shared/` (`useScreenStatus`, optimistic helpers). Stream A imports them read-only; they freeze after Phase 0.
- `SheetHost` + `useSheetStore` + the typed `SheetRequest` union + `SheetController` are Compass's; Palette authors the content primitives (`SheetHeader/SheetHandle/PickerRow/SheetSection`); sheet bodies are composed by Forge/Compass.
- `NowPlaying` component is Palette's; **mounted** by Compass as tab chrome (reads `useActiveSession`).

## 8. Terminal

- Renderer = WebView-hosted xterm.js (offline HTML, DOM renderer). `PtyTransport` (Pulse) interface: `attach/detach/write(id,Uint8Array)/resize/onOutput(id,string)/onSize/onExit(id,code|null)`; Pulse owns socket+framing+single streaming decoder (→ **string**); Relay owns renderer + **lazy** attach policy (attach-on-open, bg/fg detach+replay via the 256KB scrollback ring).
- **`measureTerminalSize()` (cols/rows) has ONE owner: Relay**; session-panel calls it at spawn time. Reply-to-agent: `sendKeys(id,text)` → `Pulse.write` (no synthetic sender session).
- Requires server `MAESTRO_PTY_HOST=server` (confirmed); server PTY runs under node, not bun.

## 9. Testing & gates (Sentinel)

- `jest` + `jest-expo` + `@testing-library/react-native`; assert a11y roles/labels/state. MSW for REST; **Maelstrom** fake server for the entity-sync array/single framing + `/pty` binary protocol.
- **Typecheck gate = per-package `tsc --noEmit` only — never concurrent bundling.** `expo export` serialized, Sentinel-only. Plus: no-auth verification (assert zero auth sent), A/B file-disjoint boundary lint, drift-guard isolation check, and a **Phase-0 native dev-client smoke** (the native-heavy stack must boot a real dev client at Phase 0, not just JS export).
- **Phase-gate VERDICT block** (Sentinel issues): one contract-fidelity **FAIL vetoes** the gate; only Atlas may accept a PASS-WITH-WAIVERS.

## 10. Accessibility

- ≥44×44 touch targets (expand hit area with `hitSlop`, keep visual size). Roles + `accessibilityState` on every interactive element. **Status never by color alone** (always dot + word — a built-in WCAG 1.4.1 win; never drop the text). Gate always-on animations on reduced-motion. WCAG AA contrast audit on status colors in both themes (Bedrock).

## 11. Git (Atlas only)

- Workers **never** run git. Atlas integrates and commits in the worktree after each worker reports complete. Sentinel verifies each phase gate before Atlas opens the next phase.

## 12. Platform (Android-first) & connection scope

- **Android is the primary target** in v1 (iOS is a later port). Handle Android specifics: hardware/system **back button** → pop nav stack / dismiss the top sheet (never exit the app from a detail); Android status + navigation bars (edge-to-edge + insets); Material press feedback (`android_ripple` where it fits Atelier); per-weight font families (no synthetic bolding). The dev client + CI device target is Android.
- **Connection is Tailscale/VPN-only** (no auth — the private network is the boundary). The connect screen accepts a `host:port`; never assume public exposure.
- **WebView surfaces** (terminal, whiteboard) share one `react-native-webview` competency (Relay). Offline-bundled HTML assets; bridge via `postMessage`.
- **Docs/diagrams** are read via `GET .../docs`; an Excalidraw drawing is a **doc** whose content is scene JSON (detect with the `isExcalidrawSceneJson` pattern) — saved via `POST .../docs`, never a native asset write.
