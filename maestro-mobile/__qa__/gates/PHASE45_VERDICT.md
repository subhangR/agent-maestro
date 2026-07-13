# SENTINEL VERDICT — Phases 4 (Terminal) + 5 (Whiteboard)

**Status: PASS-WITH-WAIVERS** — every listed gate criterion passes at the code level: the
xterm/PtyTransport bridge and the Excalidraw scene↔doc round-trip are correct by inspection
(both injection surfaces safe, lifecycle balanced, no casts, no synthetic data), boundaries are
acyclic, and the build/regression is green. The device/PTY items are an accepted pre-waiver. ONE
material, non-criterion finding the gate must surface: **the two components are BUILT but not yet
WIRED into the running app** (the terminal route still renders a stub; `WhiteboardView` has zero
consumers and is tree-shaken out of the bundle) — so the deferred on-device validation has nothing
to attach to until that wiring lands. Not a code defect, but "built" ≠ "usable"; recorded as W-INT.

Date: 2026-06-17 · Branch: feat/mobile-app · Commit under test: `6d0fb6d`
Scope verified read-only from `__qa__/`. No app code modified. Git not run (Atlas integrates).

---

## Scorecard

```
1. tsc (app + drift) ............................ PASS  (both exit 0, independently re-run)
2. PtyTransport bridge correctness ............. PASS  (safe injection · balanced lifecycle · guarded · onExit number|null · no synthetic data)
3. Whiteboard scene↔doc round-trip ............. PASS  (docs API not save_session_asset · debounced · seam direct, NO cast · safe scene injection · read-only handled)
4. Boundaries + invariants ..................... PASS  (acyclic · no Zustand selector → useShallow N/A · deps declared · CDN/offline caveat documented)
5. Regression (export + jest + Maelstrom) ...... PASS  (android export exit 0, isolation-clean; jest 76/76; Maelstrom 9/9)
6. Device/PTY validation ....................... WAIVER (pre-accepted) — see W-DEVICE
   ───────────────────────────────────────────
   FINDING: components built but NOT wired into routes → W-INT (prerequisite for W-DEVICE)
```

**VERDICT: PASS-WITH-WAIVERS.** No listed criterion fails; W-INT + W-DEVICE are integration/
environment items, not code defects.

---

## ✓ Criterion 1 — tsc (app + drift) — PASS
`npx tsc --noEmit` exit 0 (0 lines); `tsc -p tsconfig.drift.json` exit 0. Independently re-run
(not just trusting Atlas's pre-run).

## ✓ Criterion 2 — PtyTransport bridge correctness — PASS (read adversarially)

`src/terminal/TerminalView.tsx`:
- **Output → xterm is injection-safe.** `writeToTerm` injects
  `window.__term && window.__term.write(${JSON.stringify(text)});true;` (L93-95). `JSON.stringify`
  on the decoded string yields a properly-quoted JS string literal — quotes/backslashes/control
  chars escaped. The one historical gap (U+2028/U+2029 being valid JSON but illegal in JS string
  literals) is **closed**: ES2019's JSON-superset made them legal in string literals, and the
  injected code runs in the WebView's engine (WKWebView/JSC or Android Chromium/V8 — both ES2019+).
  Verified by `eval` of a raw-U+2028 JSON string (no throw). No code-execution hole — a string that
  closed the literal would only produce a SyntaxError, never arbitrary execution.
- **Output buffered before `ready`.** `readyRef`/`pendingRef` queue writes until the WebView posts
  `{type:'ready'}`, then flush (L86-96, L145-151). No early-write loss.
- **Keystrokes/resize map correctly.** `onMessage` → `{type:'data'}` → `pty.write(id, encodeUtf8(data))`
  (a real `Uint8Array`, L161); `{type:'resize'}` → `pty.resize(id, cols, rows)` (L163). JSON.parse is
  try/caught (L140-143). No synthetic data is ever injected — only real keystrokes are forwarded.
- **Lifecycle is balanced (no leak).** `useEffect([connected, sessionId])` (L99-135): resets render
  state → `pty.attach(id)` → seeds an initial `pty.resize` → subscribes `onOutput/onSize/onExit`;
  the cleanup calls **all three** unsubscribes + `pty.detach(id)` + clears refs. A `sessionId`
  change tears down the old attach before re-attaching. Unmount detaches.
- **Guarded by `hasPtyTransport()`.** `connected` gates: the effect early-returns if `!connected`
  (L100), `onMessage` early-returns before any `pty` access (L157), and pre-connect renders a
  `Placeholder` (L168). No `getPtyTransport()` throw path.
- **`onExit` distinguishes exited vs no-live-PTY.** `ExitState = {code:number|null}|undefined`;
  render shows `[process exited · code N]` for a number and `No live PTY — resume…` for `null`
  (L195-201). The seam type matches exactly: `PtyClientApi.onExit(id, (code: number | null))`
  (`client.ts:187`). `write: Uint8Array` (L179) and `onOutput: (text:string)` (L183) also match the bridge.

## ✓ Criterion 3 — whiteboard scene↔doc round-trip — PASS

`src/whiteboard/WhiteboardView.tsx` + `editorHtml.ts` + `scene.ts` + `docsPort.ts`:
- **Load** (L59-109): `fetchSceneDocs` → `getSessionDocs`/`getTaskDocs`/`getProjectDocs` →
  `pickSceneDoc` (matches `docId`, else first `isExcalidrawSceneJson`, else first `kind:'diagram'`)
  → inject the scene; empty scenes seed `EMPTY_SCENE`. `isExcalidrawSceneJson` mirrors DocsViewer.
- **Save via the docs API, NOT `save_session_asset`** (L112-147): existing doc →
  `updateDocContent(owner, id, content)`; brand-new board → `addTaskDoc(...,'diagram')` or
  `addSessionDoc(...,'diagram')`. The only `save_session_asset` mentions are negative references in
  comments/README ("NOT a Tauri save_session_asset"). `savingRef` prevents overlapping saves.
- **Debounced** — `editorHtml.ts` `onChange` debounces serialize+post at **800 ms** (`setTimeout`
  + `clearTimeout`).
- **Consumes the seam directly, NO cast.** `getDocsClient()` returns `getMaestroClient()` with no
  cast — `WhiteboardDocsClient` is a structural subset of `MaestroClientApi`, which now declares all
  docs methods (`client.ts:110-127`), and the concrete `MaestroClient` implements them
  (`MaestroClient.ts:467-511`). Confirmed **zero** `as unknown as`/`as any`/`@ts-ignore` in
  `src/whiteboard` or `src/terminal`.
- **Scene injection is safe.** `buildEditorHtml` embeds the server scene as
  `JSON.parse(${JSON.stringify(sceneJson)} || '{}')` (a quoted JS string literal, then parsed) —
  same safe pattern as the terminal; `themeName`/asset-path also `JSON.stringify`'d. Excalidraw
  `UIOptions` disable `loadScene`/`saveToActiveFile`/`export` (no local file access).
- **Read-only handled gracefully** (L120-131, L186, L201-208): no owning session → a clear banner
  notice; never crashes. (Server doc-writes are session-scoped, so `ownerSessionId` is required.)

## ✓ Criterion 4 — boundaries + invariants — PASS
- **Acyclic.** Neither `src/state` nor `src/services` imports `terminal`/`whiteboard` (grep clean).
  Both modules import only `@/state`, `@/theme`, `@/domain`, `@/components` + `react`/`react-native`/
  `react-native-webview`/`react-native-unistyles` — all permitted layers.
- **useShallow N/A.** `terminal`/`whiteboard` use only the imperative `@/state` functions
  (`getPtyTransport`/`hasPtyTransport`/`getMaestroClient`/`hasMaestroClient`) + `useTheme`/`useThemeName`
  — **no Zustand object/array selector**, so the Phase-1 reload-bug vector doesn't apply here.
- **No new undeclared deps.** Only `react-native-webview` + `react-native-unistyles` (both already in
  `package.json`).
- **CDN/offline caveat documented + honest.** TerminalView header (L21-27), `editorHtml.ts` header,
  and `whiteboard/README.md` all state that xterm/Excalidraw load from a CDN with a graceful offline
  fallback, that the VPN-only network may lack public internet, and that **production must inline the
  assets** (tracked TODO). The runtime fallbacks exist (`showFallback`/`fail` → `{type:'fallback'}`/
  `{type:'error'}` panels).

## ✓ Criterion 5 — regression — PASS
- **Android export exit 0** (`/tmp/mobile-export5`, 77 files, 11M). Bundle isolation intact:
  `maestro-server` 0 / `__sync__` 0. Phase-2 metro shim + markdown still fine.
- **jest 76/76** (9 suites). **Maelstrom 9/9** (entity-sync framing + pty protocol).

## ⚠ Criterion 6 — device/PTY validation — WAIVER (W-DEVICE, pre-accepted)
On-device dev-client render of the terminal + whiteboard, **live PTY streaming** (keystroke↔output
round-trip, resize, exit/no-PTY states), and **live scene-doc persistence** (load → edit → debounced
save → reload) are UNVERIFIED here: this host is headless (no emulator/dev-client) and `node-pty`
won't build (so no `/pty` stream) — the same class as Phase-1's device-boot and Phase-3's W4.

---

## ⛔ W-INT (NEW — prominent) — components built but NOT wired into the app

Adversarial bundle/route check shows the two Phase-4/5 components are **not integrated**, so even on
a device there is currently nothing to validate end-to-end:

- **Terminal route is still a stub.** `app/terminal/[sessionId].tsx` renders `<TerminalBodyStub/>`
  ("Relay mounts the xterm WebView + /pty stream here.", L73-86), with the header comment marking the
  unfilled seam: *"SEAM (D-Relay-1): replace `<TerminalBodyStub/>` with Relay's `<TerminalScreen
  sessionId=…/>` from src/terminal."* The real `<TerminalView/>` is **never rendered** anywhere.
  (It is bundled only as a side-effect — `RunConfigSheet` imports `measureTerminalSize` from the
  `@/terminal` barrel, which statically re-exports `TerminalView`; the `xterm.min.js`/`window.__term`
  strings in the hbc come from that, not from a mount point.)
- **`WhiteboardView` has zero consumers.** Nothing imports `@/whiteboard`; it is **tree-shaken out of
  the bundle** — `excalidraw.production.min.js`, `EXCALIDRAW_ASSET_PATH`, and `serializeAsJSON` are
  all absent from the export (0 hits). There is no whiteboard route/host at all.

This is consistent with the directive's "BUILT code-only" framing and is **not a code-quality
defect** — but it is a material integration gap the gate must not gloss over: a reader of "Phase 4+5
done" would wrongly assume the terminal/whiteboard work in the app. **W-INT is a prerequisite for
clearing W-DEVICE** — there is nothing to render on-device until the wiring lands.

**To clear (Relay/Compass):** replace `TerminalBodyStub` with `<TerminalView sessionId=…/>` in
`app/terminal/[sessionId].tsx`; add a whiteboard route/host that mounts `<WhiteboardView/>` (session/
task/project-scoped). Then re-run the export and confirm the Excalidraw CDN strings now bundle.

## To clear W-DEVICE (device-capable host, after W-INT)
1. Build a dev-client / run on an emulator or device; navigate to the (now-wired) terminal + whiteboard.
2. Stand up a real server with a working `node-pty` (`MAESTRO_PTY_HOST=server`); confirm: keystrokes
   echo, output streams into xterm, FitAddon resize reaches the PTY, and `onExit` shows exited vs
   no-live-PTY.
3. Whiteboard: load a scene doc, edit, confirm the debounced save persists via `updateDocContent`/
   `addSessionDoc`/`addTaskDoc`, and that a reload shows the edits.
4. Verify the CDN assets load on the VPN-only network — if not, execute the documented "inline the
   assets" TODO before production.

## Waivers
- **W1 (carried)** declare `expo-constants`. · **W2 (carried)** metro `disableHierarchicalLookup`
  intentional (+entities shim). · **W-DEVICE (pre-accepted)** on-device + live-PTY + live-persistence
  unverified. · **W-INT (NEW)** components built but unwired (terminal route = stub; whiteboard
  unmounted/unbundled) — prerequisite for W-DEVICE.

## Bottom line
The Relay code is **correct and safe**: the xterm bridge injects via `JSON.stringify` (no hole),
balances attach/detach, guards on `hasPtyTransport`, and distinguishes exit vs no-PTY; the whiteboard
round-trips scenes through the real docs seam with no casts, a debounced save, safe scene injection,
and graceful read-only/offline handling; boundaries are acyclic and the build/regression is green.
The honest catch is **integration, not code**: both components are built but not yet mounted (terminal
route is a stub; whiteboard isn't bundled), so the deferred on-device validation can't begin until
that wiring lands. **Verdict: PASS-WITH-WAIVERS** — no listed criterion fails; W-INT (wire it) and
W-DEVICE (then validate on a device-capable host) are the outstanding, clearly-scoped follow-ups.
