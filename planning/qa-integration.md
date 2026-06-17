# QA & Integration plan — Sentinel

Scope owner: **Sentinel** (`__qa__/`). Cross-cutting: I own the test stack, the typecheck/build gates, integration glue, the consensus-arbitration criteria, and the per-phase adversarial verification that proves each worker's claims against the connection contract in `MOBILE_APP_BUILD_ANALYSIS.md`. I work read-only in every other module and never run git (Atlas integrates and commits).

My posture is adversarial: **every worker claim is assumed wrong until I have reproduced it against the contract.** "tsc passes" is not "it works"; "I wired the WS" is not "events reconcile into state." I verify behavior, not assertions.

---

## 1. Test stack

### Decision: Jest + jest-expo + @testing-library/react-native + MSW + Maelstrom (custom contract harness)

| Layer | Tool | Version | Why |
|---|---|---|---|
| Runner | `jest` via `jest-expo` preset | jest-expo `~52` (matches Expo SDK 52) | `jest-expo` ships the RN transformer, `transformIgnorePatterns` for the Expo/RN module soup, and the native mock surface (`react-native`, `expo-*`). Hand-rolling a bare `jest` config for RN is days of `transformIgnorePatterns` whack-a-mole. |
| Component/render | `@testing-library/react-native` | `^12.4` | The RN-native RTL. User-centric queries (`getByRole`, `getByText`), no enzyme-style internals coupling. Pairs with `@testing-library/jest-native` matchers (`toBeVisible`, `toHaveStyle`). |
| HTTP mocking | `msw` (Mock Service Worker) | `^2.x` | Intercepts at the `fetch` layer so `MaestroClient` is tested unmodified — no DI of a fake client. One handler set models the real `/api` surface; the **same handlers** become the contract fixtures (section 6). `msw/native` supports RN. |
| WS / PTY simulation | **Maelstrom** — a small in-repo fake server (`__qa__/harness/`) | n/a (we own it) | No off-the-shelf mock models the entity-sync bridge's *array-vs-single* framing or the `/pty` binary protocol. I build a thin `ws`-backed fake that emits real envelope shapes (batched arrays + immediate singles), 1011 closes, and binary PTY frames. This is the single most important QA asset — it is the only way to test the two hardest contract points without a live server. |
| E2E (deferred to Phase 5) | `maestro` (Wix Detox) | `^20` | Real device/simulator gray-box E2E for the terminal + spawn happy path. Heavy; gated to Phase 5 so it never blocks earlier gates. |

**Rejected alternatives:**
- **Vitest** — maestro-ui uses it, so it's tempting for consistency. Rejected: no first-class RN/Expo preset; you fight the native module resolution that `jest-expo` solves for free. Vitest's speed win doesn't pay for the RN integration tax.
- **`nock` / `fetch-mock`** for HTTP — rejected in favor of MSW because MSW handlers double as the living contract spec and run identically in node tests and (later) in-app dev mocking.
- **`react-test-renderer` directly** — too low-level; RTL wraps it with the queries we actually want.
- **Appium** for E2E — rejected vs Detox: Detox's synchronization (auto-waits for the RN bridge to idle) makes terminal-stream tests far less flaky.
- **Mock the WS with a plain `jest.fn()` EventEmitter** — rejected: it cannot reproduce the array/single batching or binary frames, which is exactly where bugs hide. A real `ws` loopback (Maelstrom) is worth the ~150 lines.

### Coverage policy
No global % gate (vanity metric on a UI app). Instead, **named must-cover units**: `serverConfig` URL derivation, the WS envelope demux (`Array.isArray` branch), `batchSet` reconciler, the streaming `TextDecoder` PTY decode, auth-token attachment on REST + WS URLs. These are the contract-critical pure functions; they get exhaustive tests. Everything else gets smoke + interaction tests.

---

## 2. Typecheck gate — per-package `tsc`, never a workspace build

**Decision: the typecheck gate is `tsc --noEmit -p <tsconfig>` per package, run by me, never a full `expo`/`vite`/`bun run build:*`.**

> **Project memory (load-bearing):** many workers running full `bun run build:ui`-style bundles concurrently **SIGTERM-kill each other's builds**. The verified mitigation is per-package `tsc -b` / `tsc --noEmit`. I will **never** run a bundling build as a routine gate, and I will instruct Atlas that no two workers should ever fire a bundle simultaneously.

Gate command (typecheck):
```bash
# fast, no emit, no bundler, safe to run while others work
npx tsc --noEmit -p tsconfig.json
```
- `strict: true` in the base tsconfig is mandatory (Lexicon owns the config; I verify the flag is on and unwaived). A worker who turns off `strict` or sprinkles `// @ts-expect-error` to pass the gate **fails the gate** — I grep for suppression directives as part of verification.
- Module boundary enforcement: I add `eslint-plugin-boundaries` (or `dependency-cruiser`) config so a layer can only import its allowed neighbors (e.g. `components/` must not import `services/`; `features/` orchestrates). This catches scope violations mechanically instead of by code review.

---

## 3. Expo build gate

**Decision: two tiers — a cheap per-PR gate and an expensive pre-merge gate. Only the cheap one runs concurrently.**

| Tier | Command | When | Concurrency-safe? |
|---|---|---|---|
| Typecheck (primary) | `tsc --noEmit` per package | every phase gate, every integration | ✅ yes |
| Static export sanity | `npx expo export --platform ios --output-dir /tmp/__qa_export_<phase>` | once per phase gate, **serialized** (I run it alone) | ⚠️ Metro bundle — run ALONE |
| `expo-doctor` + config | `npx expo-doctor` | per phase gate | ✅ yes |
| Native build (EAS) | `eas build --profile preview` or local `expo run:ios` | Phase 4 + final only | ❌ heavy, manual |

Rationale: `expo export` runs the Metro bundler end-to-end (resolves every import, catches missing-asset / native-module-not-linked errors `tsc` can't see) but it's the same class of resource-hungry bundle that SIGTERMs under concurrency. So I serialize it and run it **myself** at the gate, after workers have stopped, never as a background check while they build. `expo-doctor` is cheap and catches version-mismatch drift (Expo SDK ↔ RN ↔ native modules) which is the #1 silent Expo failure.

---

## 4. CI approach

**Decision: GitHub Actions, but staged in. Phase 0-1: local gates only (run by me). Phase 2+: a single CI workflow.**

```yaml
# .github/workflows/mobile-ci.yml (added at Phase 2)
on: [pull_request]   # PRs target feat/mobile-app
jobs:
  check:
    steps:
      - bun install            # workspace install (app is NOT in the bun workspace per project memory — see risks)
      - npx tsc --noEmit       # per-package
      - npx eslint .           # + boundaries plugin
      - npx jest --ci --maxWorkers=2   # capped workers; RN tests are memory-heavy
      - npx expo-doctor
      - npx expo export --platform ios   # the serialized bundle sanity check; runs alone in CI so no SIGTERM risk
```

Rationale: during the multi-agent build there is no remote CI feedback loop — Atlas integrates locally and I gate locally. Wiring CI before the project structure stabilizes is churn. Once Phase 2 lands a stable structure, one workflow gives regression protection on every integration PR. `--maxWorkers=2` because jest-expo workers each boot a heavy RN env; unbounded workers OOM small CI runners. **Note:** maestro-mobile is a standalone Expo package (npm, *not* in the bun workspace per project memory `maestro-mobile design system`) — CI installs its own deps; confirm with Bedrock/Atlas whether it's `npm`/`bun`/`pnpm` inside the app dir.

---

## 5. Consensus arbitration criteria (input to Atlas)

When two workers' plans conflict at a boundary, I provide Atlas an objective scoring rubric so arbitration isn't vibes. Each contested decision is scored 1-5 on:

1. **Contract fidelity** — does it implement the `MOBILE_APP_BUILD_ANALYSIS.md` contract *exactly* (array/single demux, bare-origin WS, `?token=`, binary PTY)? Non-negotiable; a 1 here vetoes regardless of other scores.
2. **Proven-precedent reuse** — does it port maestro-ui's hardened code (`useMaestroStore`, `MaestroClient`, `webTerminal`) vs invent new? Reuse wins; the contract doc explicitly calls the ported path "low-risk."
3. **Boundary cleanliness** — fewest cross-layer imports; clearest single owner. Penalize anything that makes two workers touch one file.
4. **RN/Expo idiom** — first-class in Expo SDK 52, no ejection, no abandoned packages (check last-publish < 12mo, weekly downloads).
5. **Testability** — can I verify it with Jest + Maelstrom without a live server? An untestable choice loses.

**Arbitration outputs I hand Atlas:** for each of the known contested decisions (router: expo-router vs react-navigation; state lib; styling; WS client; secure storage; WebView terminal; list lib) — a one-line recommendation, the score table, and the **rejected alternative with the specific reason**. Ties break toward "closest to maestro-ui's proven implementation." I do **not** make the call (Atlas arbitrates); I make the call *defensible*.

---

## 6. Per-phase adversarial verification — the gate checklists

Each phase ends with me producing a **verdict** (section 7). I assume every claim is false until reproduced. Checklists are tied line-by-line to the contract.

### Phase 0 — Foundation & design port
- [ ] `tsc --noEmit` clean across all scaffolded packages; `strict:true` present and **no** `@ts-nocheck`/`@ts-expect-error` added to pass it (I grep).
- [ ] `expo export --platform ios` succeeds (run by me, serialized) — proves Metro resolves the scaffold.
- [ ] `expo-doctor` clean — no SDK/RN/native-module version drift.
- [ ] Theme: spot-check ≥10 `--pn-*` tokens against `colors_and_type.css` — values match exactly (hex, not "close"). Dark-mode swap (`data-theme=dark` → JS theme) flips the paper/ink ramp.
- [ ] Fonts bundled offline (Newsreader/Hanken/JetBrains Mono) — **not** Google Fonts CDN (RN can't lazy-load web fonts; CDN = broken type in airplane mode). I verify the font files are in assets, not a URL.
- [ ] SVG port: Icon/Glyph/Mark/Gauge render via `react-native-svg`, not stray `<svg>` DOM (which silently no-ops in RN).
- [ ] **Native dev-client smoke (pulled forward to Phase 0):** the stack is native-module-heavy and foundational — unistyles v3 (Nitro/C++ + babel plugin), react-native-mmkv, react-native-webview, react-native-svg, @gorhom/bottom-sheet, reanimated. `expo export` only validates the JS/Metro graph; it does NOT compile native. So Phase 0 must also produce a real custom dev-client build (`expo run:ios`/EAS) that boots — otherwise a missing native link surfaces only at Phase 4. I verify the dev client launches, not just that export bundles.
- [ ] **Domain drift-guard runs in isolation:** Lexicon's `domain/__sync__/server-drift-guard.ts` imports `maestro-server/src/types.ts` (typecheck-only). I confirm it typechecks under a dedicated tsconfig that resolves server source WITHOUT (a) dragging server type errors into the app gate, and (b) leaking into the Metro bundle (assert it's in `tsconfig.exclude` + Metro `blockList`). A drift-guard that can't run in isolation, or that bundles CJS server code, fails the gate.

### Phase 1 — Data layer (the contract heart)
- [ ] **URL derivation** (`serverConfig`): unit test asserts `http→ws`, `https→wss`, host preserved, **WS has no path** (bare origin), `PTY = WS + '/pty'`. A wrong derivation here breaks everything downstream silently.
- [ ] **No-auth (v1 directive):** assert the app sends **zero** auth machinery — no `Authorization` header, no `?token=` on REST or either WS URL, no `credentials:'include'`, no Cookie. Connection is bare user-typed `host:port`. `getToken()` (the documented future seam) returns `null` and `withToken()` is inert. A leftover credential/cookie is a FAIL (it can break against the open server or leak). Boot path: `GET {serverUrl}/health` 200 → accept host. (Note: the authoritative `MOBILE_APP_BUILD_ANALYSIS.md` §3 claims the server accepts `Authorization: Bearer`; Conduit verified in `authMiddleware.ts` that it does **not** — only cookie + `?token=`. Moot in v1; flagged so the future-auth seam uses `?token=`, never Bearer.)
- [ ] **WS demux:** feed Maelstrom a batched **array** flush and an **immediate single** envelope; assert both are dispatched. A handler that only reads `parsed.type` (ignoring `Array.isArray`) **drops half the events** — this is the canonical bug; I test it explicitly with a mixed sequence.
- [ ] **Reconnect:** kill Maelstrom mid-stream; assert exponential backoff + jitter and that `onopen` triggers a **full re-fetch** of the active project's entities (resync), not a silent partial state.
- [ ] **App-level ping:** assert the client sends pings (bridge does not push heartbeats) and survives a 30s idle without being reaped.
- [ ] No-subscribe default: client receives all events without sending a subscribe handshake (matches `useMaestroStore`).

### Phase 2 — Read-only surfaces
- [ ] Every surface renders from **live REST+WS**, not `m-data.jsx` constants — I grep the wired screens for residual hardcoded fixtures; any import of `m-data` in a feature screen is a fail.
- [ ] WS event → state reconciliation: emit each event group from Maelstrom (`task:updated`, `session:status_changed`, `notify:*`, …) and assert the corresponding tile updates **without a refetch**.
- [ ] **Teams are REST-poll** (the `team:*` events are declared-but-not-broadcast gap): assert the team surface does NOT wait on a WS event for updates — it polls. A team screen subscribed to `team:*` will appear frozen; I verify the poll exists.
- [ ] `batchSet` coalescing: fire N events in one tick; assert one render pass (or the store's batched commit), not N.
- [ ] Empty/loading/error states exist for every surface (no infinite spinner on 4xx).

### Phase 3 — Actions & spawn
- [ ] **Spawn body** matches `spawnSessionSchema` exactly (`.strict`): `taskIds` (≥1), `spawnSource:'ui'` (never `'session'`), measured `cols/rows` ints 1..1000, `launchConfig` or legacy fields — and **no extra keys** (strict schema → 400). I diff the request body against the schema field list in §3.3.
- [ ] On the `session:spawn` event, the client **ignores `command/cwd/envVars`** and only opens `/pty` keyed by session id. A client that tries to act on the native payload is wrong — I assert those fields are untouched.
- [ ] `prompt` sender-session: verify whatever product decision was made (synthetic session vs alternate path) actually attaches a valid `senderSessionId` and never self-prompts (server forbids it → error).
- [ ] Mutations optimistic-update then reconcile against the authoritative WS echo (no double-apply, no stale overwrite). Inline edits optimistic; creates wait for `*:created` echo (no synthesized id).
- [ ] **A/B file-disjointness (boundary lint):** the maestro-panel stream (Tasks/Members/Teams/Skills/Lists/Graphs/ModelProfiles) and session-panel stream (Sessions/detail/stats/timeline/prompts/spawn/terminal-handoff) must NOT import each other and must NOT both write any file under `features/shared` or `features/conduct`. I assert single-owner on every shared file; a cross-stream import or co-write fails the gate. (Pre-req: Atlas assigns owners for `features/shared/` + `features/conduct/useSpawnFlow` — see consistency verdict.)
- [ ] **cols/rows single source:** spawn body's `cols/rows` come from Relay's `measureTerminalSize()` (one impl), consumed by the session-panel spawn flow — assert Forge does not re-implement the measurement.

### Phase 4 — Terminal (highest risk)
- [ ] `binaryType='arraybuffer'` on the `/pty` socket; keystrokes sent as **binary** frames, resize as **JSON** `{type:'resize',cols,rows}`.
- [ ] **Streaming `TextDecoder({stream:true})` per session** — feed Maelstrom a multibyte glyph (box-drawing/emoji) split across two binary frames; assert it renders as one glyph, not replacement chars. This is the subtle decode bug the contract explicitly warns about.
- [ ] Attach order: server sends `{type:'size'}` text frame once, then scrollback (binary), then live. Assert the client handles size-before-bytes.
- [ ] **1011 close = needs-resume**, not a crash: simulate 1011; assert the client surfaces resume affordance, doesn't infinite-reconnect. 1008 = missing sessionId (programmer error surfaced).
- [ ] Reattach-on-boot: for every alive session, a `/pty` socket reopens (mirrors web reattach).
- [ ] `POST /api/sessions/:id/pty/stop` fires on explicit stop only (not on background/detach — plain close keeps PTY alive).
- [ ] Soft-keyboard control sequences (Ctrl-C=0x03, arrows, ESC) map to correct bytes.

### Phase 5 — Polish
- [ ] Background→foreground reconnect doesn't dupe sockets or leak.
- [ ] `notify:*` → push notifications fire once each (no storm).
- [ ] Accessibility: tiles have roles/labels; contrast meets WCAG AA against the `--pn-*` ramp.
- [ ] Subscription filtering (if used) actually narrows the wire (verify against the contract's "unverified" flag — I test whether `{type:'subscribe'}` reduces received events before we rely on it for bandwidth).

---

## 7. Phase-gate verdict format (the contract Atlas uses)

At each gate I post one verdict block to Atlas via `maestro session prompt`. Atlas does **not** open the next phase until the verdict is `PASS` (or `PASS-WITH-WAIVERS` that Atlas explicitly accepts).

```
SENTINEL VERDICT — Phase <n> (<name>)
Status: PASS | FAIL | PASS-WITH-WAIVERS
Gates:
  tsc(--noEmit, all pkgs) ......... PASS/FAIL
  expo export (ios, serialized) ... PASS/FAIL/SKIPPED
  expo-doctor ..................... PASS/FAIL
  jest (unit+integration) ......... <pass>/<total>
  boundary lint ................... PASS/FAIL
Contract checks (this phase): <m>/<n> verified
Claims audited:
  <worker>: "<claim>" -> CONFIRMED | REFUTED (<evidence>)
Blockers (FAIL reasons):
  - <file:line> <what's wrong vs contract §x.y>
Waivers (if PASS-WITH-WAIVERS):
  - <deferred item> — owner <worker>, due Phase <n+1>, risk <low/med>
Regression: <none | list>
Verdict rationale: <2-3 lines>
```

Rules: a single **contract-fidelity FAIL vetoes the gate** regardless of other greens. Every "CONFIRMED" must cite the test or repro that proves it — no unverified confirmations. Waivers must name an owner and a due phase, else they're blockers.

---

## 8. Integration glue ownership

I own the seams between modules (no one else's scope covers them):
- **`__qa__/harness/`** — Maelstrom fake server (WS + PTY + REST via MSW handlers), shared fixtures mirroring `DomainEvents.ts` `TypedEventMap` shapes.
- **`__qa__/contract/`** — the contract fixtures: real envelope samples, a spawn-body golden file, PTY frame sequences. These are the single source of truth tests assert against.
- **Integration tests** that cross layers (services→state→features) live in `__qa__/integration/`, not in any single worker's folder, so they don't collide with module-local unit tests.
- I do **not** edit workers' source to fix integration bugs — I file a precise repro (`file:line`, contract §) to Atlas/the owner. My only writes are under `__qa__/`.

---

## 9. Folder structure (`__qa__/`)

```
__qa__/
  harness/
    maelstrom.ts          # fake WS+PTY server (ws loopback); emits array/single + binary frames
    msw-handlers.ts        # REST handlers modeling /api (doubles as contract spec)
    server.ts              # MSW node setup, beforeAll/afterEach wiring
  contract/
    events.fixtures.ts     # sample envelopes per TypedEventMap group (batched & immediate)
    spawn-body.golden.ts   # the exact spawnSessionSchema-valid body
    pty-frames.fixtures.ts # size/exit text frames + multibyte-split binary sequences
  integration/
    data-layer.test.ts     # Phase 1 contract checks
    surfaces.test.ts       # Phase 2 reconciliation
    spawn.test.ts          # Phase 3 spawn body + session:spawn handling
    terminal.test.ts       # Phase 4 PTY protocol + TextDecoder
  unit/                    # contract-critical pure-fn tests (serverConfig, demux, batchSet, decode)
  gates/
    run-gate.sh            # tsc + expo-doctor + jest + (serialized) expo export, emits the verdict block
  jest.config.ts           # jest-expo preset + transformIgnorePatterns
  jest.setup.ts            # RTL matchers, MSW server, Maelstrom lifecycle
```

Tests co-locate critical fixtures here so workers can import the contract fixtures for their own module tests (one source of truth), but the cross-layer assertions stay in `__qa__` to avoid collisions.

---

## 10. Risks

1. **Maelstrom fidelity drift** — if my fake server's framing diverges from the real bridge, tests pass but prod breaks. Mitigation: I cross-check Maelstrom's envelope shapes against `DomainEvents.ts`/`WebSocketBridge.ts` (read-only) at Phase 1, and do at least one **live-server smoke** against the real staging server (4569) per major phase, not only the fake.
2. **`expo export` SIGTERM under concurrency** (project memory) — mitigated by serializing it and running it myself only when workers are idle. The risk is a worker fires a bundle during my gate; I coordinate timing through Atlas.
3. **The app may not be in the bun workspace** (project memory: maestro-mobile is standalone npm) — my CI/install assumptions could be wrong. Open question for Atlas/Bedrock (§11).
4. **Live terminal untested end-to-end on a headless box** (contract §8 unknown) — only the raw `/dev/pty-test` path is proven; full agent-spawn-over-`/pty` with CLI init is unverified. I flag terminal Phase-4 PASS as conditional until a real headless spawn is observed.
5. **`team:*` / subscribe-filter unknowns** (contract §3.5, §8) — I verify the actual wire behavior before any code relies on it; until then teams = REST-poll, no subscribe-bandwidth assumptions.
6. **Auth Bearer-vs-`?token=` parity unconfirmed** (contract §8) — `authMiddleware.ts` wasn't fully read. I verify both paths against the live server early in Phase 1 before Conduit hard-codes one.
7. **node-vs-bun PTY** (project + contract memory): the *server* PTY must run under node. Not my code, but my live-terminal smoke is invalid if the target runs the PTY host under bun — I confirm the runtime before trusting a terminal PASS.

---

## 11. Cross-team dependencies & open questions

**Dependencies (what I need from whom):**
- **Lexicon (domain):** the TS types for `TypedEventMap` envelope shapes and the spawn body — my contract fixtures must mirror these exactly. I need them stable by end of Phase 1.
- **Conduit (api):** `serverConfig` URL derivation + auth token attachment — my Phase 1 unit tests target these directly.
- **Pulse (realtime):** the WS demux + `/pty` transport — Maelstrom is built to exercise exactly Pulse's surface; we must agree on the client API shape early so my harness drives it.
- **Ledger (state):** `batchSet` reconciler — I assert coalescing behavior; need the store's commit semantics defined.
- **Bedrock/Atlas:** the package manager + whether maestro-mobile is in the bun workspace → drives my CI install step.

**Open questions for Atlas / the team (need decisions):**
1. **Package manager inside the app dir** (npm/bun/pnpm) and workspace membership — blocks CI config.
2. **Expo SDK version** — pins jest-expo, Detox, and every native-module version. I need this fixed before writing `jest.config`.
3. **`prompt` sender-session model** (synthetic session vs alternate path) — I can't write the Phase-3 prompt verification until the product decision lands.
4. **Is a live staging server (4569) reachable from the build environment** for my per-phase live smoke? If not, I'm limited to Maelstrom fidelity (higher risk — see §10.1).
5. **WebView-xterm vs native VT** for the terminal — changes whether Phase-4 tests target a WebView `postMessage` bridge or a native renderer. Tied to Relay's plan.
6. **Who decides PASS-WITH-WAIVERS acceptance** — I propose Atlas holds sole authority to accept a waiver; I only flag and score.

---

## 12. Decisions summary (for the ratified docs)

| Decision | Choice | Rejected | Reason |
|---|---|---|---|
| Test runner | jest + jest-expo | vitest | no RN/Expo preset in vitest |
| Component testing | @testing-library/react-native | react-test-renderer raw | too low-level |
| HTTP mock | MSW v2 (`msw/native`) | nock/fetch-mock | handlers double as contract spec |
| WS/PTY mock | in-repo Maelstrom (`ws` loopback) | jest.fn EventEmitter | can't reproduce array/single + binary framing |
| E2E | Detox (Phase 5 only) | Appium | Detox auto-sync = less flaky terminal tests |
| Typecheck gate | per-pkg `tsc --noEmit` | `bun run build:*` | concurrent bundles SIGTERM each other |
| Build sanity | serialized `expo export` + `expo-doctor` | concurrent bundling | same SIGTERM risk |
| CI | GH Actions from Phase 2, `--maxWorkers=2` | CI from day 0 | structure churn before stable |
| Boundary enforcement | eslint-plugin-boundaries / dependency-cruiser | manual review | mechanical scope-violation catch |
