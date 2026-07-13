# Navigation plan — `navigation/` (Compass)

**Scope:** the app shell and every way the user moves through it — the 4-tab bar, per-tab native stacks, detail routes, the center "Conduct" FAB, the NowPlaying strip, the full-screen TerminalSheet, the family of bottom sheets, and deep linking. I build the **skeleton Forge plugs screens into**; I consume Palette's components, Bedrock's theme, and Ledger's state. I own routing, not screen bodies.

Grounded in the Atelier specimens (`Maestro Design System - mobile/mobile-app/`): `m-app.jsx` (shell), `m-screens.jsx` (4 screens), `m-overlays.jsx` (sheets + NowPlaying + TerminalSheet), `m-docs.jsx` (doc/diagram/docs sheets). The specimen is a single-component tab switch with overlays fired through an imperative bus (`MUI.openSheet/openTerminal/openPicker/openDoc`). My job is to turn that into a real, routable, deep-linkable navigator without losing the imperative "open a sheet from any deep tile" ergonomics.

---

## 1. Recommended architecture

### 1.1 Router: **expo-router v5** (file-based, on SDK 54)

**Decision: expo-router**, not bare react-navigation.

expo-router *is* react-navigation under the hood (same `@react-navigation/*` native-stack + bottom-tabs primitives), so we lose none of its power; we gain:
- **File-based routes** → the route tree is the folder tree, which is exactly the kind of self-documenting structure a 10-agent team needs to avoid collisions. Forge adds a screen by adding a file; I own the layout (`_layout.tsx`) files.
- **Deep linking for free** — every route is automatically URL-addressable; `maestro://task/abc123` resolves with zero hand-written linking config. This matters because push notifications (from `notify:*` WS events) must deep-link straight to an entity.
- **Typed routes** (`experiments.typedRoutes`) → `router.push('/session/[id]')` is type-checked, which de-risks the navigation↔features boundary with Forge.
- **Modal presentation** as a first-class route option (`presentation: 'modal' | 'fullScreenModal' | 'transparentModal'`) — the TerminalSheet and form sheets can be real routes (back-stack, hardware-back, deep-linkable) rather than imperative overlays.

**Rejected — bare `@react-navigation/native` (v7):** more boilerplate (manual `NavigationContainer`, `linking` config, a hand-maintained param-list type), and deep links must be wired by hand. The only reason to pick it is finer control over the navigator tree, which expo-router's `_layout` files already give us via `<Stack>`/`<Tabs>` with `screenOptions`. Not worth the ergonomics loss.

**Rejected — a hand-rolled switch (what the specimen does, `useState('sessions')`):** zero back-stack, no deep linking, no per-tab history, no hardware-back handling. Fine for a static specimen, unacceptable for a real app.

> **Hard dependency on Bedrock:** the exact Expo SDK + expo-router version must be pinned in Bedrock's foundation plan. I'm assuming **SDK 54 / expo-router ~5.x / react-native-reanimated 4 / react-native-gesture-handler ~2.28 / react-native-screens ~4.x**. If Bedrock pins a different SDK, the router major may shift — flagging as open question Q1.

### 1.2 Navigator shape

```
RootStack (Stack, headerShown:false)
├── (tabs)                         ← the 4-tab shell + custom tab bar + NowPlaying
│   ├── (sessions)/                ← per-tab native Stack
│   │   ├── index                  Sessions home  (m-screens SessionsScreen)
│   │   └── session/[id]           Session detail (stats/timeline/prompts)
│   ├── (tasks)/
│   │   ├── index                  Tasks home     (m-screens TasksScreen)
│   │   └── task/[id]              Task detail    (subtask tree)
│   ├── (members)/
│   │   ├── index                  Members home
│   │   ├── member/[id]            Member detail
│   │   └── team/[id]              Team detail
│   └── (more)/
│       ├── index                  More menu
│       ├── skills | spells | lists | files | recordings | resources | settings | about
│       └── ...                    (Forge owns bodies; I own the routes)
├── terminal/[sessionId]           ← full-screen modal route (presentation:'fullScreenModal')
└── (sheets host)                  ← global imperative sheet layer (see §3), NOT a route
```

**Why per-tab native stacks (not one shared stack):** iOS users expect each tab to keep its own history (switch away from a deep task detail, come back, it's still there). `@react-navigation/native-stack` (native `UINavigationController`/`Fragment`) gives free swipe-back, large-title transitions, and the right perf. Each tab group is a `Stack` in its own `_layout.tsx`.

**Why detail routes are pushed screens, not sheets:** session/task/member detail are deep, scrollable, navigable-onward (task → child task → session). Native-stack push gives correct back-gesture + breadcrumb semantics. **Transient** things (forms, pickers, the Conduct menu, doc viewers) are bottom sheets (§3). Rule of thumb I'll hold the line on: **push for "a place," sheet for "an action."**

---

## 2. The tab bar, Conduct FAB, and NowPlaying (the custom shell)

This is the most bespoke part and lives entirely in `(tabs)/_layout.tsx` with a **custom `tabBar` render prop**. The default `<Tabs>` bar can't express the center-FAB-with-two-tabs-on-each-side layout or the NowPlaying strip floating above it.

```
┌─────────────────────────────────┐
│           screen body           │
│                                 │
├─────────────────────────────────┤
│  ▸ NowPlaying strip (when live) │  ← persistent, hidden on More tab
├──────┬──────┬────┬──────┬───────┤
│ Sess │ Task │ ⊕  │ Memb │ More  │  ← 5 slots; center = Conduct FAB
└──────┴──────┴────┴──────┴───────┘
```

- **4 real tabs** (Sessions / Tasks / Members / More) + a **center pseudo-slot** holding the Conduct FAB. The FAB is **not a route** — it's a `Pressable` that fires `sheets.open('command')`. In expo-router I register only 4 `<Tabs.Screen>`s and inject the FAB into the custom bar between index 1 and 2 (mirrors `m-tab--add` in `m-app.jsx`).
- **NowPlaying strip placement:** rendered **inside the custom tab bar component, above the bar row**, so it persists across tab switches (it's part of the tabs layout, not any single screen). Per the specimen it's **hidden on the More tab** (`tab !== 'more'`) and when there's no active session. Tapping it opens `terminal/[sessionId]` for the active session. The "active session" id + its live status/say/ctx come from **Ledger's state** (a `useActiveSession()` selector) — dependency D-Ledger-1.
- **Tab badges:** the Sessions tab shows a "needs input" dot (`m-tab__wait`); badge counts come from Ledger selectors over the session map (needs-input count) — dependency D-Ledger-2.

**Library for the FAB/strip animation:** plain `react-native-reanimated` (already in the stack for gestures) — no extra dep. The strip slide and FAB press use `Animated`/`withSpring`.

---

## 3. Bottom sheets — the sheet family

The specimen has a large sheet family, all fired imperatively from deep tiles: `CommandSheet` (Conduct), `ProjectSheet` (project switcher), `CreateTaskSheet`, `TeamMemberSheet` (new/edit), `RunConfigSheet`, `PickerSheet` (single/multi select — the mobile translation of every desktop dropdown), `DocSheet`, `DiagramSheet`, `DocsSheet`. Plus the full-screen `TerminalSheet`.

### 3.1 Library: **@gorhom/bottom-sheet v5**

**Decision: `@gorhom/bottom-sheet` ^5.x** (with `react-native-reanimated` + `react-native-gesture-handler`, which we need anyway).

Rationale:
- It's the de-facto RN bottom sheet — snap points, dynamic sizing (`enableDynamicSizing` fits the form sheets that vary in height), gesture-driven dismiss, a backdrop component (the `m-scrim`), and a `BottomSheetScrollView`/`BottomSheetTextInput` that correctly handle the keyboard inside a sheet (critical for `CreateTaskSheet`/`TeamMemberSheet` which are form-heavy with textareas).
- `BottomSheetModal` + `BottomSheetModalProvider` gives a **portal/stack of sheets** — exactly the imperative "open from anywhere" model the `MUI` bus needs, and supports stacking (the specimen's `raise` flag = a picker opened *on top of* a form sheet; gorhom handles z-stacking natively).
- Keyboard handling (`keyboardBehavior`, `keyboardBlurBehavior`) is the single hardest part of RN forms and gorhom solves it; rolling our own would burn days.

**Rejected — expo-router modal routes for *every* sheet:** great for full-screen/standalone sheets, but a route-per-sheet is the wrong model for **pickers fired from inside another sheet** (a route can't easily render *over* a non-route sheet, and the `raise`/stacked case breaks). We use modal *routes* only for the things that benefit from being deep-linkable/back-stacked (TerminalSheet — see §4); the rest stay imperative gorhom sheets.

**Rejected — `react-native-actions-sheet`:** lighter and route-free, but weaker keyboard handling and snap-point control, smaller ecosystem. The form-heavy sheets make gorhom's keyboard story decisive.

**Rejected — bare `Modal` + custom pan:** reinventing gorhom badly; no.

### 3.2 Sheet orchestration: a typed imperative `SheetHost` (replaces the `MUI` bus)

The specimen's `MUI.openSheet/openPicker/...` is a global mutable bus. I'll replace it with a **typed, store-backed sheet controller** so any component (a deep `MTaskTile` inside a `FlashList`) can open a sheet without prop-drilling:

- A single `<SheetHost>` mounted once at the root inside `BottomSheetModalProvider`, owning all `BottomSheetModal` refs.
- A tiny **Zustand store** (`useSheetStore`) — `open(type, params)` / `close()` — or React context with imperative methods. **Decision: Zustand store**, because Ledger already standardizes on Zustand 5 (consistency, and selectors are cheap). This is a small navigation-owned store, coordinated with Ledger so we don't fragment state libs — dependency D-Ledger-3.
- A discriminated-union param type: `type SheetRequest = {type:'command'} | {type:'createTask', taskId?:string} | {type:'editMember', memberId?:string} | {type:'runConfig', taskId:string} | {type:'projectSwitcher'} | {type:'picker', config:PickerConfig} | {type:'doc', docRef} | {type:'diagram', docRef} | {type:'docs', kind:'markdown'|'diagram'}`. This union is a **cross-team contract with Palette** (who authors the sheet bodies) and **Lexicon** (param entity ids) — dependency D-Palette-1.
- **Division of labor:** I own the `SheetHost`, the store, the open/close API, snap points, backdrop, and keyboard config. **Palette** authors the *content* of each sheet (the form fields, the picker rows) as plain components I render inside `BottomSheetView`. Clean seam: I give them a `<Sheet>`-shaped slot, they fill it.

### 3.3 PickerSheet — the universal dropdown replacement

Every desktop `<select>`/dropdown becomes a `PickerSheet` (single or `multi`), opened via `sheets.open({type:'picker', config})` and stackable on top of a form (the `raise` case). I provide the generic picker shell + stacking; Palette styles the rows. This is heavily reused (priority, model, agent, mode, permissions, assignees) so it must be rock-solid and is a Phase-0 deliverable.

---

## 4. The TerminalSheet — full-screen modal route

The terminal is **not** a gorhom bottom sheet; it's a **full-screen modal route** `terminal/[sessionId]` with `presentation: 'fullScreenModal'` (the specimen's `m-term` slides up full-height with its own header/branch bar/input).

Why a route (not an imperative overlay):
- It must be **deep-linkable** (`maestro://terminal/<sessionId>`) so a push notification ("needs input") opens straight into the live terminal.
- It must own the **hardware back / swipe-down-to-dismiss** with its own back-stack entry.
- It's the single heaviest screen (hosts Relay's WebView xterm bridge) — isolating it as a route keeps it out of the tab stacks' memory until opened.

**Seam with Relay (terminal owner):** I own the *route, header, branch bar, NowPlaying→terminal handoff, and dismiss/back behavior*. **Relay** owns everything *inside* the body — the `react-native-webview` xterm host, the `/pty` binary stream, the soft-keyboard control row, the input field send. I render `<TerminalScreen sessionId={id} />` (Relay's component) inside my route frame — dependency D-Relay-1. The live stat strip + input/Resume affordance (`m-tstrip`, `m-term__input`) belong to Relay; I just give them the modal frame.

Opened from: NowPlaying tap, any `MSessionTile` tap, the `session/[id]` detail "open terminal" CTA, and deep links.

---

## 5. Deep linking & notifications

- **Scheme:** `maestro://` (set in `app.json` `scheme`), plus optional universal/app links if we host an associated domain later.
- **Route map (auto from file tree):**
  - `maestro://` → Sessions home
  - `maestro://task/<id>` / `maestro://session/<id>` / `maestro://member/<id>` / `maestro://team/<id>` → detail
  - `maestro://terminal/<sessionId>` → live terminal modal
  - `maestro://project/<id>` → switch active project then land on Sessions (project switch is a Ledger action, not a screen — I intercept and redirect)
- **Notification wiring:** `notify:*` WS events (Pulse) → a local/push notification (Phase 5) whose `data.url` is one of the above. On tap, `expo-router`'s linking resolves it. The mapping from `notify:*` payload → deep-link URL is a **navigation↔realtime contract** — dependency D-Pulse-1. Conduit/Pulse emit the event; I own the URL builder (`linking/buildDeepLink.ts`).
- **Connect gate (NO AUTH in v1 — per user directive):** there is no login/token/Bearer/`?token=` in v1. The root `_layout` instead checks for a configured **host (`http://<ip>:<port>`)** in storage (Conduit-owned, AsyncStorage). If none, it redirects to a `/(connect)` host-entry screen (type address → tap Connect → probe `GET /health` → persist host → enter tabs). Same redirect-in-`_layout` mechanism, just gating on host-configured instead of authed. Deep links are deferred until a host is connected. `?token=` is kept only as a documented FUTURE seam in `linking/`/connect, not wired. Coordinates with Conduit (runtime host config) — dependency D-Conduit-1.

---

## 6. Folder structure (`navigation/` scope)

I own the route/layout files under `app/` (expo-router's required dir) **plus** a `navigation/` support folder for the non-route machinery. Forge owns the *screen body* components the route files import.

```
app/                                  # expo-router route tree (LAYOUTS = mine; SCREENS = Forge's bodies)
├── _layout.tsx                       # RootStack: providers (Gesture, BottomSheetModal, Theme, SheetHost), host-configured gate
├── (tabs)/
│   ├── _layout.tsx                   # Tabs + custom tabBar (FAB + NowPlaying)  ← mine, core
│   ├── (sessions)/_layout.tsx        # native Stack
│   ├── (sessions)/index.tsx          # imports Forge's <SessionsScreen/>
│   ├── (sessions)/session/[id].tsx   # imports Forge's <SessionDetail/>
│   ├── (tasks)/_layout.tsx
│   ├── (tasks)/index.tsx
│   ├── (tasks)/task/[id].tsx
│   ├── (members)/_layout.tsx
│   ├── (members)/index.tsx
│   ├── (members)/member/[id].tsx
│   ├── (members)/team/[id].tsx
│   └── (more)/_layout.tsx + index.tsx + leaf routes
├── terminal/[sessionId].tsx          # fullScreenModal frame  → renders Relay's <TerminalScreen/>
└── (connect)/index.tsx                # NO-AUTH v1 host-entry gate (body = Conduit/Forge; route = mine)

navigation/                           # non-route navigation machinery (all mine)
├── tabBar/
│   ├── CustomTabBar.tsx              # 5-slot bar + center FAB
│   ├── ConductFab.tsx
│   ├── NowPlaying.tsx                # strip (data via Ledger selector)
│   └── tabIcons.ts
├── sheets/
│   ├── SheetHost.tsx                 # single host, all BottomSheetModal refs
│   ├── useSheetStore.ts             # Zustand open/close + SheetRequest union
│   ├── sheetRegistry.ts             # type → Palette component map
│   └── PickerSheet.tsx              # generic picker shell (rows from Palette)
├── linking/
│   ├── linkingConfig.ts             # scheme, prefixes
│   └── buildDeepLink.ts             # notify:* payload → maestro:// URL
├── routes.ts                         # typed route-name constants + param types (shared w/ Forge)
└── guards.ts                         # host-configured redirect helper (connect gate)
```

`routes.ts` (typed route names + param shapes) is the **explicit contract surface with the feature streams** — they import names/params from here; I never hardcode strings in their screens and they never hardcode mine.

### 6.1 Route ownership under the MAESTRO-PANEL / SESSION-PANEL split (user directive 2)

The route tree absorbs the A/B feature split **without any file collision**, because every file under `app/` (the route/layout files) is **Compass-owned and thin** — each just imports one feature body + wires nav/sheet callbacks. The two feature streams stay disjoint in `features/`:

| Route group (Compass-owned) | Renders body from | Stream |
|---|---|---|
| `(tabs)/(sessions)/*`, `terminal/[sessionId]` | `features/sessions/*` | **B — Session panel** (list/detail/stats/timeline/prompts + spawn + terminal handoff) |
| `(tabs)/(tasks)/*`, `(tabs)/(members)/*`, `(tabs)/(more)/*` (skills/lists/graphs/teams/model-profiles) | `features/tasks/*`, `features/members/*`, `features/more/*` | **A — Maestro panel** |

- Both streams import **read-only** from `navigation/routes.ts` (shared constant) and call the same `sheets.open(...)` API — neither writes a Compass file, neither writes the other's `features/` subtree. No two writers on one file.
- The **sheet registry** (`navigation/sheets/sheetRegistry.ts`) is a single Compass-owned map that imports disjoint body components from both streams — a one-way import, not a shared-write point.
- **One straddle to flag (Forge's internal call, not a navigation collision):** the Conduct `CommandSheet` triggers both stream-B actions (spawn agent/terminal) and stream-A actions (new task/member/team, cast spell). The sheet *body* must live in exactly one stream — I recommend a small shared `features/conduct/` module (or stream-B, since spawn dominates) so both streams stay file-disjoint while my SheetHost simply renders whatever body is registered for `type:'command'`.

---

## 7. Best practices I'll hold

- **Lazy-mount heavy routes:** `terminal/*` and the diagram viewer mount only on navigation (route isolation does this for free).
- **One BottomSheetModalProvider, one SheetHost** — no nested providers; avoids the classic "sheet renders behind the tab bar" z-index bug.
- **`react-native-screens` enabled** (native-stack) for memory + native transitions; `enableFreeze()` so backgrounded tab screens stop re-rendering on WS firehose updates.
- **Typed routes on** — compile-time safety across the Forge seam.
- **Back-handling:** TerminalSheet and modal sheets each own hardware-back; never let a sheet swallow back without dismissing.
- **No business logic in route files** — they wire params → Forge component + sheet/nav callbacks only. Keeps the navigation↔features seam thin.
- **Safe-area:** `react-native-safe-area-context` consumed in the tab bar + headers (tab bar must clear the home indicator; NowPlaying sits above it).

---

## 8. Risks

1. **Custom tab bar + center FAB + persistent NowPlaying** is the fiddliest layout in the app (safe-area, keyboard avoidance, the strip must not jump when the keyboard opens). Mitigate: build it as a standalone Phase-0 deliverable with all states (no-session / live / needs-input / More-tab-hidden) before any screen wiring.
2. **Sheet stacking + keyboard** (picker `raise`d over a form with a focused textarea) is a known gorhom pain point. Mitigate: prototype the `CreateTaskSheet` → `PickerSheet` stack early; it exercises every hard case at once.
3. **expo-router major tied to SDK** — if Bedrock's SDK pin moves, my `_layout` API may shift (Q1). Low effort to adjust but blocks if undecided.
4. **Imperative sheets vs route-based modals split** could confuse contributors ("why is the terminal a route but the picker isn't?"). Mitigate: document the "place vs action" rule in CONVENTIONS.md.
5. **Deep-link → connect-gate race** (link arrives before host is configured). Mitigate: defer the pending deep link until the host-configured check resolves in root `_layout`.

---

## 9. Cross-team dependencies & open questions

**Dependencies (need agreement before/early in build):**
- **D-Forge-1 (critical):** agree the **route names + param shapes in `routes.ts`** and the screen-body component contract (each route imports one Forge component + receives nav/sheet callbacks). This is the navigation↔features seam — must be locked in consensus.
- **D-Palette-1:** the `SheetRequest` discriminated union and the slot contract (I provide the sheet frame + keyboard handling; Palette provides the body component per `type`). Agree the `PickerConfig` shape (used everywhere).
- **D-Ledger-1/2/3:** `useActiveSession()` selector for NowPlaying; needs-input/badge count selectors for tab badges; agreement that the small `useSheetStore` lives in `navigation/` but follows Ledger's Zustand 5 conventions (no second state lib).
- **D-Relay-1:** the `terminal/[sessionId]` route renders Relay's `<TerminalScreen sessionId>`; I own the frame/header/dismiss, Relay owns the body/stream/keyboard-control-row. Agree the prop boundary.
- **D-Pulse-1:** `notify:*` payload → deep-link URL mapping (I own `buildDeepLink`, Pulse defines the payload). Needed for Phase-5 push.
- **D-Conduit-1:** runtime host config (persisted `http://<ip>:<port>` in AsyncStorage) + a `GET /health` probe helper; the root layout reads "host configured?" to gate the `(connect)` redirect. (No auth in v1; `?token=` is a documented FUTURE seam only.)
- **D-Bedrock-1 (Q1):** Expo SDK + expo-router/reanimated/gesture-handler/screens versions pinned in foundation; ThemeProvider mounted above my navigators so tab bar/headers read theme tokens.

**Open questions for consensus:**
- **Q1:** Final Expo SDK / expo-router version (Bedrock). I assume SDK 54 / expo-router 5.
- **Q2:** Are **session/task/member detail** push-screens (my recommendation) or expanded bottom sheets? Affects Forge's screen composition. I recommend push.
- **Q3:** Project switch — modal sheet (specimen) vs a full route? I recommend keeping it a **sheet** (`ProjectSheet`) since it's an action, with `maestro://project/<id>` deep link intercepting to set active project then redirect to Sessions.
- **Q4:** Should the **More tab's** leaf items (Skills, Spells, Lists, Files, Recordings, Resources, Settings, About) be push-routes under `(more)/` or sheets? I lean push-routes for the content-heavy ones (Skills/Spells/Lists), sheets for viewers (Docs/Diagrams). Needs a Forge call.
- **Q5:** Do we need an **iPad/tablet** two-pane layout, or phone-only? The specimen is phone-only (`ios-frame.jsx`); confirm so I don't over-build the navigator.

---

*Compass — navigation/. Awaiting cross-review, esp. Forge (routes.ts) and Palette (SheetRequest union).*
