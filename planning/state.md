# State Layer Plan — `state/` (Ledger 🗃️)

> The store layer for maestro-mobile. Mirrors maestro-ui's `useMaestroStore` reconciliation engine: `Record<id, entity>` maps, a `batchSet` coalescer (N events → 1 render via `queueMicrotask`), selectors, and persistence. Consumes Pulse's WS events + Conduit's REST fetches; exposes clean hooks to Forge's screens; uses Lexicon's types. Server is reused unchanged — REST + entity-sync WS (bare origin, branch on `Array.isArray`) + `/pty`, exactly like maestro-ui.

---

## 1. Recommended architecture

### 1.1 Single normalized entity store, mirroring `useMaestroStore`

maestro-ui keeps one big Zustand store (`useMaestroStore`) holding every server entity as a `Record<string, Entity>` map keyed by id:

```ts
tasks:         Record<string, MaestroTask>
taskLists:     Record<string, TaskList>
sessions:      Record<string, MaestroSession>
teamMembers:   Record<string, TeamMember>
modelProfiles: Record<string, ModelProfile>
teams:         Record<string, Team>
loading:       Record<string, boolean>   // keyed by op, e.g. "tasks", "sessions"
errors:        Record<string, string>
taskOrdering / sessionOrdering / taskListOrdering: Record<string, string[]>  // projectId -> orderedIds
lastUsedTeamMember: Record<string, string>  // persisted
```

I recommend we **keep this exact shape** on mobile. It is proven, the reconciliation logic ports almost verbatim, and the `Record` map is the right structure for entity-sync (O(1) upsert/delete by id, trivial last-writer-wins merge). Deviating would mean re-deriving reconciliation invariants the desktop already solved (status-only patches, optimistic lifecycle overrides, batched flushes).

**Decision: one normalized entity store, not per-entity stores.** maestro-ui actually has 23 Zustand stores, but the *server-entity* reconciliation all lives in `useMaestroStore` — the others are UI/layout/persistence concerns. On mobile we want the same separation:

- **`entityStore`** (the big one) — all server entities + the batchSet reconciler. This is the heart of my scope.
- **`uiStore`** — ephemeral UI state (active tab, active project id, selected session). Compass/Forge mostly own *what* goes here; I provide the store primitive.
- **`prefsStore`** — small persisted prefs (`lastUsedTeamMember`, theme override, server URL list, last active project). Persisted via MMKV.

Auth tokens do **not** live in any of these — they belong in the OS keystore (Conduit's `expo-secure-store`), not in app state or MMKV.

### 1.2 The batchSet reconciler (the core engine)

This is the single most important thing to port correctly. From `useMaestroStore.ts:250-272`:

```ts
type PendingUpdate = (state: State) => Partial<State>;
let pendingUpdates: PendingUpdate[] = [];
let batchScheduled = false;

function batchSet(updater: PendingUpdate) {
  pendingUpdates.push(updater);
  if (!batchScheduled) {
    batchScheduled = true;
    queueMicrotask(() => {
      batchScheduled = false;
      const updates = pendingUpdates;
      pendingUpdates = [];
      if (updates.length === 0) return;
      if (updates.length === 1) { set(updates[0]); return; }
      set((state) => {
        const merged: Partial<State> = {};
        for (const fn of updates) Object.assign(merged, fn(state));
        return merged;
      });
    });
  }
}
```

Why it matters on mobile even more than desktop: a single WS flush from the bridge is a JSON **array** of up to ~dozens of envelopes (50ms batching server-side). Pulse will hand us that array; if each envelope triggered its own `set()`, we'd get N synchronous re-renders of every subscribed screen. `queueMicrotask` coalescing collapses the whole array (plus anything else queued in the same tick) into **one** `set()` → one notification → one React commit. On a phone with a weaker JS thread and a FlatList of session tiles, this is the difference between smooth and janky.

**Caveat to verify (open question Q4):** `Object.assign(merged, fn(state))` merges *top-level keys*. Two updates that both write `tasks` — the second `{ ...prev.tasks, [id]: t }` wins and **includes the first** because each `fn` reads the *current committed* `state` (the merge reads `state`, not `merged`). This is correct in maestro-ui because each updater does a full spread of the live map. We must preserve that "read live state, spread the whole map" contract — an updater that reads `merged` instead of `state` would drop sibling writes. I'll encode this as a lint-level convention + a unit test that fires 50 task upserts in one tick and asserts all 50 survive one commit.

### 1.3 Optimistic lifecycle overrides (port verbatim)

`useMaestroStore.ts:288-302` keeps a `pendingLifecycle: Map<id, {humanCompletedAt?, archivedAt?}>` so a stale server `session:updated` full-replace can't bounce a tile between Active/Completed/Archived tabs while a human-initiated write is in flight. `applyPendingLifecycle(session)` re-applies the override on top of every inbound session before it lands in the map; the override clears when the server confirms. **Mobile needs this too** — arguably more, because mobile network round-trips are slower, so the in-flight window is longer and flicker is more likely. Port `pendingLifecycle`, `applyPendingLifecycle`, `clearPendingLifecycleField` as-is.

### 1.4 Status-only fast path (port verbatim)

`session:status_changed` (`useMaestroStore.ts:413-422`) does a lightweight in-place patch (`{...existing, status, lastActivity, needsInput}`) instead of a full session replace, and skips if the session isn't already in the map. This is a high-frequency event (live status dots). Keep the fast path.

### 1.5 normalize on ingest

`normalizeSession` (`useMaestroStore.ts:304-319`) guarantees `taskIds/timeline/events` are arrays and `status` defaults to `spawning`. Mobile keeps the same defensive normalization on the WS write path so screens never crash on a partial payload. Lexicon's types should make most fields non-optional, but the server can emit summary vs full session shapes (`?fields=full|summary`) — normalize bridges that gap.

---

## 2. Library choices (with rationale + rejected alternatives)

### 2.1 State library — **Zustand 5** (`zustand@^5.0.2`)

**Chosen.** Rationale:
- maestro-ui uses Zustand. The entire reconciliation engine (`batchSet`, `set`/`get` closures, the `create<State>((set,get)=>{...})` factory) ports **verbatim** — same API on RN, zero adaptation. This is the single biggest argument: we're porting proven code, not rewriting it.
- The `batchSet` pattern depends on imperatively calling `set()` from a non-React WS callback. Zustand's store-outside-React model is exactly that. Jotai/Redux would force us to reshape the reconciler.
- Tiny (~1KB), no provider needed, selector subscriptions with `useStore(s => s.tasks[id])` give per-component granularity for free.
- v5 is RN-compatible (uses `useSyncExternalStore`, supported by React Native's React 18+). The `zustand-5` skill is assigned to me precisely for this.

**Rejected:**
- **Jotai** — atom-based, bottom-up. Great for derived/fine-grained state, but our model is one big normalized map reconciled imperatively from a WS callback. Mapping "N entity events in a microtask → atoms" means either one giant atom (defeats the point) or per-entity atom families with manual GC on delete — more machinery, and it diverges from the desktop engine we're mirroring. No win.
- **Redux Toolkit + RTK Query** — `createEntityAdapter` actually models normalized `{ids, entities}` nicely and RTK Query could auto-cache REST. But: (a) heavy boilerplate (slices, actions, dispatch) for a 10-person 1-month build; (b) RTK Query's caching/invalidation fights our **WS-is-source-of-truth** model — we don't poll-and-cache, we get pushed deltas; (c) zero code reuse from maestro-ui. The migration cost buys nothing we need.
- **Legend-State / Valtio (proxy-based)** — seductive auto-tracking and fine-grained RN renders, but proxy mutation semantics clash with our "spread the whole map, read live state" batchSet contract, and it's a third paradigm nobody on the desktop side validated. Too risky for the core data layer.

**Verdict: Zustand 5. The reconciliation engine is the asset; Zustand is what lets us reuse it.**

### 2.2 Persistence — **react-native-mmkv** (`react-native-mmkv@^3`) via a Zustand `persist` storage adapter

**Chosen.** Rationale:
- **Synchronous** reads/writes (JSI-backed). This matters: on cold start we want to hydrate `prefsStore` (last active project, theme, lastUsedTeamMember) *synchronously* before first paint so there's no flash of default state. AsyncStorage's promise-based API forces an async hydration gate.
- ~30× faster than AsyncStorage; encryption support built in (useful if we ever cache anything sensitive — though tokens stay in keystore regardless).
- Clean Zustand integration: wrap MMKV in a `StateStorage` adapter and pass to `persist` middleware.

```ts
// state/persist/mmkvStorage.ts
import { MMKV } from 'react-native-mmkv';
const storage = new MMKV({ id: 'maestro-prefs' });
export const mmkvStorage: StateStorage = {
  getItem: (k) => storage.getString(k) ?? null,
  setItem: (k, v) => storage.set(k, v),
  removeItem: (k) => storage.delete(k),
};
```

**Rejected:**
- **AsyncStorage** — async-only (hydration flash problem above), slower, but the universal fallback. *Risk:* MMKV needs a config plugin / dev client and does **not** run in stock Expo Go (it's a native module). Decision below.
- **expo-secure-store** — this is for **secrets only** (tokens). It's keychain-backed, small-value-only, and slow for general state. Conduit owns it for the auth token. Not a general persistence layer; I won't put entity/pref data there.
- **redux-persist / WatermelonDB / SQLite** — WatermelonDB/SQLite are for large offline-first relational datasets we don't have; our persisted footprint is tiny (prefs + maybe a small entity snapshot). Overkill.

**MMKV-vs-Expo-Go open question (Q1, for Bedrock):** MMKV requires a custom dev client (`expo-dev-client` + `expo prebuild` or EAS). If Bedrock scaffolds with a dev client (recommended anyway for `react-native-svg`, WebView, secure-store — all native), MMKV is free. **If** the team wants stock Expo Go for early iteration, I'll ship an `AsyncStorage` adapter behind the same `StateStorage` interface and swap to MMKV at the dev-client cutover — the persist layer is abstracted so the store code never knows the difference.

### 2.3 What persists vs what doesn't

| Slice | Persist? | Store | Why |
|---|---|---|---|
| `prefsStore`: lastActiveProjectId, theme, lastUsedTeamMember, serverUrl(s) | **Yes** (MMKV) | prefs | Tiny, user-scoped, needed synchronously on boot |
| Auth token | **No** (keystore, Conduit) | — | Secret; `expo-secure-store` |
| `entityStore`: tasks/sessions/teamMembers/teams/etc. | **No** (default) — *optional snapshot, see below* | entity | Server is source of truth; we full-resync on every WS `onopen` |
| `loading` / `errors` | **No** | entity | Ephemeral |
| `uiStore`: active tab, selected ids | **No** (mostly) | ui | Ephemeral; maybe last tab persisted |

**Entity snapshot (deferred, Phase 5):** maestro-ui does **not** persist entities — it relies on a fast full-resync on `onopen`. Mobile has a stronger case for a *read-only cold-start snapshot* (show last-known tasks/sessions instantly while the WS reconnects, à la optimistic UI). But this risks showing stale data and complicates reconciliation (snapshot vs live merge). **Recommendation: do NOT persist entities in v1.** Match desktop: resync on connect, show a skeleton until first fetch resolves. Revisit a snapshot only if cold-start latency is a real complaint. Flag for consensus.

---

## 3. The store-update interface — cross-team contract (esp. realtime ↔ state)

**This is the most important boundary and I want it nailed in consensus.** Question: *who owns the WS→store write path?*

In maestro-ui it's fused — `connectGlobal()`, `handleSingleMessage`, and `batchSet` all live **inside** `useMaestroStore.ts`. The store owns the socket. On mobile we have a dedicated realtime specialist (Pulse, `services/realtime/`), so we must decide the seam.

**My recommended split (proposed to Pulse):**

- **Pulse owns the transport:** opens the entity-sync WS to the bare origin, `binaryType`, reconnect with exponential backoff + jitter (cap 30s), app-level ping, `Array.isArray` branching (array flush vs single immediate envelope), and **decoding** each frame into a normalized `{ event, data }` envelope. Pulse also owns `/pty` (separate concern, feeds Relay's terminal, not the entity store).
- **Ledger (me) owns the reducer:** I expose a single imperative entry point the store publishes:

  ```ts
  // state/entityStore.ts — exposed on the store instance
  ingestEvent(envelope: { event: string; data: unknown }): void  // one envelope → batchSet
  ingestBatch(envelopes: Array<{event,data}>): void               // array flush → loop ingestEvent (all coalesced by the same microtask)
  resyncProject(projectId: string): Promise<void>                 // full re-fetch via Conduit, called by Pulse on onopen
  ```

  Pulse calls `ingestBatch(parsed)` when `Array.isArray(parsed)`, else `ingestEvent(parsed)`. The `switch(event)` reconciliation (`task:*`, `session:*`, `team_member:*`, `spell:*`, etc.) lives **in my reducer**, because it's pure state mutation and it's where the entity-shape knowledge lives. `batchSet` is mine; Pulse never touches the store's `set`.

- **`onopen` resync handshake:** Pulse, on socket open, calls `entityStore.resyncProject(activeProjectId)` which re-fetches model-profiles + the active project's tasks/sessions/teamMembers/teams/taskLists (mirrors `useMaestroStore` `connectGlobal.onopen` at L751-789). The store reads `activeProjectId` from `uiStore`. **Open question Q2 for Pulse + Compass:** where does `activeProjectId` live so both the reducer and the socket can read it? Proposal: `uiStore.activeProjectId`, and the entity store imports it via `useUiStore.getState()` (cross-store read, same as desktop's `activeProjectIdRef`).

**Why this seam:** transport churn (reconnect, backpressure, binary framing) is genuinely separable from entity reconciliation (shape knowledge, optimistic overrides, ordering). It keeps `batchSet` single-owner (no two modules calling `set`), and it lets Pulse unit-test the socket with a fake `ingestBatch` and me unit-test the reducer with synthetic envelopes — no socket needed.

**Alternative considered (rejected): Pulse owns everything including the reducer (full `useMaestroStore` port into `services/realtime`).** Rejected because it puts entity-shape + persistence + selectors in the realtime package, blurring scopes and making Forge depend on `services/realtime` for hooks. The store should be the dependency hub, not the socket.

**Cross-team summary of who calls whom:**

```
Conduit (REST)  --fetch results-->  Ledger.resyncProject / fetchTasks / fetchSessions  --> batchSet
Pulse (WS)      --ingestBatch/ingestEvent-->  Ledger reducer (switch on event)          --> batchSet
Pulse (WS onopen) --resyncProject(activeProjectId)--> Ledger --> Conduit fetches
Forge (screens) --useEntityStore(selector)-->  Ledger selectors/hooks
Lexicon         --types-->  Ledger (entity shapes, event payload map)
```

---

## 4. Selector patterns

Zustand re-renders a component whenever its selector's return value changes by reference. With `Record` maps, naive selectors are a footgun. Conventions I'll enforce + provide as a hook library Forge consumes:

### 4.1 Atomic selectors for single entities (cheap, stable)
```ts
const task = useEntityStore(s => s.tasks[id]);          // re-renders only when THIS task's ref changes
const status = useEntityStore(s => s.sessions[id]?.status);  // even narrower
```
Because `batchSet` spreads the whole map but replaces only changed entity refs, `s.tasks[id]` is reference-stable for untouched tasks → no spurious re-render. **This is the key payoff of the `Record<id,entity>` + immutable-spread design.**

### 4.2 Derived lists — memoized, NOT inline `Object.values().filter()`
Inline `s => Object.values(s.tasks).filter(...)` returns a **new array every render** → infinite re-render risk / wasted renders. Two-tier approach:
- Selector returns the **map** (stable ref); component memoizes the derived list with `useMemo` keyed on the map + filter args.
- Or provide purpose-built hooks that use `useShallow` (Zustand 5's shallow comparator) for array/object returns:
  ```ts
  import { useShallow } from 'zustand/react/shallow';
  export const useProjectTaskIds = (projectId: string) =>
    useEntityStore(useShallow(s => s.taskOrdering[projectId] ?? []));
  ```
- **Ordering arrays (`taskOrdering`, `sessionOrdering`) are the canonical list source** — components iterate the ordered id array and pull entities by id with atomic selectors. This keeps list-order stable and per-row renders isolated (the FlatList row subscribes to its own `tasks[id]`).

### 4.3 Hook library I expose to Forge (`state/hooks/`)
Purpose-built, named, memoized hooks — Forge never writes raw selectors:
```
useTask(id) / useSession(id) / useTeamMember(id)
useProjectTasks(projectId)         // ordered, filtered to project
useSessionsForTask(taskId)
useActiveSessions(projectId)       // status in running/working/needs-input
useTaskTree(rootId)                // hierarchical (parentId/childrenIds)
useLoading(key) / useError(key)
```
This is the clean interface Forge's screens consume — they get reactive, granular, render-optimized data without touching store internals.

### 4.4 Stable action access
Actions (`fetchTasks`, `ingestEvent`, optimistic mutators) are defined once in the store and are reference-stable, so components grab them with `useEntityStore(s => s.fetchTasks)` or via a `useEntityActions()` shallow-selected bundle without causing re-renders.

---

## 5. Folder structure (`state/`)

```
state/
  entityStore.ts            # the big normalized store: maps + batchSet + reducer (ingestEvent/ingestBatch) + fetch actions
  reducer/
    index.ts                # switch(event) dispatcher -> per-domain handlers
    tasks.ts                # task:created|updated|deleted|session_added|session_removed
    sessions.ts             # session:* incl. status_changed fast-path, spawn, optimistic lifecycle
    teamMembers.ts          # team_member:*
    teams.ts                # REST-poll only (no WS) — upsert from fetch
    taskLists.ts            # task_list:*
    spells.ts               # spell:invoked|activated|deactivated (active-spells slice)
    misc.ts                 # model_profile:*, custom_prompt:*, notify:* fan-out
  reconcile/
    batchSet.ts             # the queueMicrotask coalescer (store-scoped factory)
    normalize.ts            # normalizeSession + entity defaults
    pendingLifecycle.ts     # optimistic override map + apply/clear
  selectors/
    tasks.ts  sessions.ts  members.ts  teams.ts   # pure selector fns (testable without React)
  hooks/
    index.ts                # useTask, useSession, useProjectTasks, useActiveSessions, ... (Section 4.3)
    useEntityActions.ts
  prefsStore.ts             # MMKV-persisted: lastActiveProjectId, theme, lastUsedTeamMember, serverUrls
  uiStore.ts                # ephemeral: activeTab, activeProjectId, selected ids (coordinate w/ Compass)
  persist/
    mmkvStorage.ts          # StateStorage adapter (MMKV; AsyncStorage fallback behind same iface)
  ordering.ts               # taskOrdering/sessionOrdering helpers (insert/move/remove by id)
  __tests__/
    batchSet.test.ts        # 50 events/1 tick -> 1 commit, all survive
    reducer.tasks.test.ts   # synthetic envelopes
    pendingLifecycle.test.ts
    selectors.test.ts
  index.ts                  # public surface: stores + hooks (the only thing other packages import)
```

`index.ts` is the **only** import surface for Forge/Compass/Pulse/Conduit — internal reducer/reconcile files are private. Keeps scopes disjoint.

---

## 6. Best practices

- **Single writer to `set()`:** only the store's own actions/reducer call `set`/`batchSet`. Pulse and Conduit call *actions* (`ingestBatch`, `resyncProject`), never `set` directly. Prevents the multi-writer races the desktop avoided by colocating.
- **Always spread the whole map, read live `state`:** `(prev) => ({ tasks: { ...prev.tasks, [id]: t } })`. Never read `merged` inside a batched updater (Section 1.2).
- **Atomic-by-id reads in lists:** FlatList rows subscribe to `tasks[id]`, not the whole map. Combined with immutable spreads → only changed rows re-render.
- **`useShallow` for any selector returning an array/object** (Zustand 5).
- **No derived state in the store** — derive in selectors/hooks with `useMemo`. Store holds only normalized server truth + ordering + UI flags.
- **Normalize on ingest, not on read** — every entity passes through `normalize*` once at the write boundary.
- **Persist is opt-in per store**, abstracted behind `StateStorage` so MMKV↔AsyncStorage is a one-line swap.
- **Reducer handlers are pure + unit-tested** against synthetic envelopes — no socket, no network needed to test reconciliation.
- **Keep `loading`/`errors` keyed by operation** (`"tasks"`, `"sessions:spawn"`) exactly like desktop, so screens show per-section spinners.

---

## 7. Risks

1. **batchSet merge subtlety (Section 1.2).** If a contributor writes an updater that reads `merged`/closure-captured state instead of live `state`, sibling writes in the same tick silently drop. *Mitigation:* the 50-events/1-tick unit test + a documented updater contract + code review at the reducer boundary.
2. **Render storms on big projects.** A project with hundreds of tasks/sessions getting a burst of WS events. batchSet handles the coalescing; the remaining risk is non-atomic selectors. *Mitigation:* enforce atomic-by-id + `useShallow`; FlatList virtualization (Forge/Compass own the list, but I provide the ordered-id selectors that make per-row subscription possible).
3. **MMKV ↔ Expo Go (Q1).** Native module; not in stock Expo Go. *Mitigation:* AsyncStorage fallback behind `StateStorage`; lobby for a dev client (needed anyway).
4. **`activeProjectId` ownership (Q2).** The resync handshake needs a single agreed source of truth readable from a non-React socket callback. *Mitigation:* settle in consensus — proposal `uiStore.activeProjectId` read via `getState()`.
5. **Optimistic-override leaks.** If a `clearPendingLifecycleField` is missed (server never confirms, request errors), an override could stick and mask real updates. *Mitigation:* port desktop's clear-on-confirm-and-on-error exactly; add a TTL/timeout sweep if we see leaks.
6. **`team:*` not broadcast over WS** (per analysis §3.4). Teams must be REST-poll, so the teams map can go stale between polls. *Mitigation:* `teams.ts` reducer only upserts from fetches; Forge triggers a teams re-fetch on the Teams screen focus; document teams as eventually-consistent.
7. **Summary vs full session payloads** (`?fields=full|summary`). A summary fetch could overwrite a fuller session in the map with a thinner one. *Mitigation:* `normalizeSession` + a merge rule that doesn't blow away populated arrays with empty ones on summary ingests (verify against desktop behavior).
8. **`notify:*` events** are signals, not entity state. *Mitigation:* route them to a notifications side-channel (and later push notifications, Phase 5), not into the entity maps.

---

## 8. Cross-team dependencies & open questions

| # | Question | Who | My proposal |
|---|---|---|---|
| Q1 | MMKV (dev client) vs AsyncStorage (Expo Go)? | **Bedrock** (scaffold), consensus | Dev client + MMKV; AsyncStorage fallback ready behind `StateStorage` |
| Q2 | Where does `activeProjectId` live (readable from a non-React WS callback)? | **Pulse, Compass** | `uiStore.activeProjectId`, read via `getState()` |
| Q3 | **Who owns the WS→store write path?** (the big one) | **Pulse** | Pulse owns transport + decode + `Array.isArray` branch; calls my `ingestBatch`/`ingestEvent`; reducer is mine. (Section 3) |
| Q4 | Confirm the batchSet "read live state, spread whole map" contract is preserved in our port | **Sentinel** (verify), me | Encode as test + convention |
| Q5 | Entity cold-start snapshot in v1, or resync-only like desktop? | consensus | **Resync-only in v1**; snapshot deferred to Phase 5 |
| Q6 | Exact event→payload shapes for the reducer `switch` | **Lexicon** | I need a typed `TypedEventMap` mirror (server's `domain/events/DomainEvents.ts`) so reducer handlers are type-checked |
| Q7 | Does Conduit's REST client return already-typed entities, and does it own `fetchTasks/fetchSessions` or do I call its raw methods inside my actions? | **Conduit** | I own the fetch *actions* (loading/error/ordering bookkeeping); I call Conduit's typed REST methods inside them — mirrors desktop where fetchTasks lives in the store and calls `maestroClient` |
| Q8 | `/pty` terminal byte stream stays OUT of the entity store, right? | **Pulse, Relay** | Yes — terminal bytes are Relay's; the store only holds session *metadata*, never PTY output |
| Q9 | Spawn flow: optimistic session insert on `POST /spawn` 201, or wait for `session:spawn` WS event? | **Forge, Pulse** | Insert from the 201 response body (`session`) immediately (set, not batchSet, like desktop L440) AND reconcile the WS event idempotently by id |

---

## 9. Summary of key decisions

- **State lib: Zustand 5** — ports the desktop reconciliation engine verbatim; rejected Jotai (paradigm mismatch), RTK (boilerplate + caching fights WS push), proxy libs (clash with spread contract).
- **Persistence: react-native-mmkv** (sync, fast) for tiny prefs only; AsyncStorage fallback behind a `StateStorage` interface; tokens in keystore (Conduit), entities NOT persisted in v1.
- **Reconciler: port `batchSet` + `pendingLifecycle` + status-only fast-path + `normalizeSession` verbatim.** Entity maps are `Record<id, entity>`; ordering lives in `*Ordering` id-arrays.
- **Seam with Pulse:** Pulse owns the socket + `Array.isArray` branch + decode; **I own the reducer + batchSet**; Pulse calls `ingestBatch`/`ingestEvent`; `onopen` triggers my `resyncProject`.
- **Selectors:** atomic-by-id for entities, `useShallow` + ordered-id arrays for lists, a named hook library (`state/hooks/`) as the only surface Forge touches.

---

## 10. Cross-review addendum (post-consensus)

Read at my boundaries: `realtime.md` (Pulse), `domain-types.md` (Lexicon), `api-services.md` (Conduit), `features.md` (Forge). **SIGN-OFF** — no blocking objection. The ratified WS→state seam matches what Pulse and I already agreed. Resolutions to the boundary questions:

**vs Pulse (realtime).** Aligned. Pulse owns transport + `Array.isArray` decode + normalize and calls my `ingestBatch`/`ingestEvent`; **I own the reducer + `batchSet`** (resolves Pulse Q6 "who coalesces" — I do, store-side, exactly like desktop). Pulse fires `onResync(projectId)` and `setActiveProject(id)`; I wire `onResync` → my `resyncProject` → Conduit fetchers, and I drive `setActiveProject` whenever `uiStore.activeProjectId` changes. Pulse stays free of `api`/`state` imports (no cycle). **Realtime `connected` flag:** Pulse owns no store, but Forge needs a reactive `connected` for offline banners — so Pulse pushes status via a `setRealtimeStatus(status)` action into **`uiStore`**; Forge reads `useUiStore(s => s.connected)`. (One small agreement to confirm with Pulse + Forge.)

**vs Lexicon (domain).** Agreed to **branded-ID-keyed maps** — `Record<SessionId, Session>`, `Record<TaskId, Task>`, etc. (Lexicon Q5: yes). My selectors **consume `domain/derive/`** and never re-implement: `toUiSessionStatus(session)` for the 8-state display union, and the tab-precedence predicates `isArchivedTab/isCompletedTab/isActiveTab` for `useSessionsByTab`. My `pendingLifecycle` optimistic override of `humanCompletedAt`/`archivedAt` feeds those derive predicates — so the optimism + tab rule compose correctly. `session:status_changed` is a **partial** (`{id,status,lastActivity,needsInput}`) → my fast-path **shallow-merges**, never replaces (matches Lexicon §6). Reducer `switch` consumes Lexicon's `WsEvent` union with a `never` default so a new server event is a compile error.

**vs Conduit (api).** **CQ-1 (resolved, I own it):** the active `ServerConfig` lives in a store I own (`configStore`, or a slice of `uiStore`); Conduit exports the pure `buildServerConfig` + `/health` validate; I persist only the **raw host string** via the swappable `StateStorage` adapter. Changing host = rebuild config + tell Pulse to reconnect. **CQ-2 (resolved by consensus): NO TanStack Query** — raw `MaestroClient` + my stores. **CQ-5 (resolved, my call):** list fetches default to `fields=summary` (mobile data); detail fetches use `full`. My reducer's session-merge rule **must not clobber a populated session with a thinner summary** (don't overwrite non-empty `timeline`/`events`/`taskIds` with empty) — I'll encode this in `normalizeSession`/merge + a unit test. **No-auth (directive 1):** I carry **no token slice** anywhere; `?token=` is a documented FUTURE seam only.

**vs Forge (features).** **Selector contract (Forge Q3, resolved):** I export **pure `select*(state, ...args)` functions** as the canonical, testable surface (`selectSessionsByProject`, `selectTaskTree`, `selectOpenTasks`, `selectMembersWithLiveCounts`, `selectSessionsByTab`); Forge composes them with `useShallow`. I also ship thin convenience hooks (`state/hooks/`) wrapping those same functions — same logic, two ergonomics. **Single store clarification:** there is **one** `entityStore` (not separate `useSessionStore`/`useTaskStore`) — required so Pulse's single `ingestBatch` coalesces a mixed-entity flush into **one** render pass and to mirror desktop's single `useMaestroStore` writer. Forge's per-entity store names map to selector namespaces over the one store. **Optimistic single-writer (Forge §6, agreed):** I expose `optimisticPatch(entityType, id, partial)` + `rollback(token)` (generalizes `pendingLifecycle` to arbitrary fields); Forge's `shared/optimistic.ts` wraps it so optimistic edits and WS echoes share **one** setter path. Creates are **not** optimistically synthesized — they wait for the `*:created` echo (agreed; nothing on my side resists this).

**Net changes to my plan:** (1) selectors consume `domain/derive` rather than re-implementing status/tab logic; (2) add `optimisticPatch`/`rollback` actions (generalize `pendingLifecycle`); (3) own the `configStore`/host-persistence (CQ-1); (4) add a `connected`/realtime-status field to `uiStore` set by Pulse; (5) summary-vs-full merge guard in the session reducer; (6) drop the token slice entirely (no auth v1). None conflict with any sibling doc.
