# SENTINEL VERDICT — Phase 3 (Actions & spawn)

**Status: PASS-WITH-WAIVERS** — the action/spawn/reply/optimistic surfaces are correct and
the build is clean, but there is ONE real architectural defect (a `navigation ↔ features`
runtime import **cycle** that violates the stated acyclic boundary in criterion 5) plus the
Phase-1-style environment waiver (live disposable server can't boot here). The cycle is
build-clean and analytically likely-benign, but it literally breaches criterion 5's
"no features→navigation" rule — **if Atlas/Compass treat the acyclic boundary as a HARD gate
invariant, this converts to FAIL.** Either way it should be fixed before Phase 4 (one-line
decoupling; see W3).

Date: 2026-06-17 · Branch: feat/mobile-app · Commits under test: `90ef3da` (Wave1 seams) + `22db5ed` (Wave2a mutations/spawn/reply) + `484ef79` (Wave2b registry+pty+spell)
Scope verified read-only from `__qa__/`. No app code modified. Git not run (Atlas integrates).

---

## Gate scorecard

```
1. tsc (app + drift) ............................ PASS  (both exit 0)
2. THE OPTIMISTIC CONTRACT ..................... PASS  (apply→commit→clear/rollback; creates never insert; idempotent reconcile)
3. SPAWN (schema.parse, measured size, no src). PASS  (spawnSource forced 'ui' client-side; cols/rows measured)
4. REPLY (pty.write Uint8Array, guarded) ....... PASS  (encodeUtf8(text+CR); hasPtyTransport + REPLYABLE guard; no synthetic sender)
5. useShallow + boundaries + no placeholders ... PASS-WITH-WAIVERS
   ├─ useShallow (0 violations) ................ PASS
   ├─ Stream A↔B isolation ..................... PASS  (none; cross-stream only via sheets.open)
   ├─ components/ pure ......................... PASS
   ├─ 4 real sheet bodies (no placeholder) ..... PASS  (command/createTask/editMember/runConfig all wired)
   └─ navigation→features ONE-WAY (acyclic) .... ✗ VIOLATED  → W3 (proven cycle, build-clean, likely-benign, device-unverified)
6. Regression (export + jest + Maelstrom) ...... PASS  (android export exit 0, isolation clean, markdown intact; jest 76/76; Maelstrom 9/9)
7. LIVE round-trip (disposable server) ......... WAIVER (W4)  (node-pty native unbuildable in this headless VPS — framing proven via Maelstrom + real-reducer jest)
```

---

## ✓ Criterion 1 — tsc (app + drift) — PASS
`npx tsc --noEmit` exit 0; `tsc -p tsconfig.drift.json` exit 0 (server types resolve in isolation).

## ✓ Criterion 2 — the optimistic contract — PASS (audited every mutation site)

**The helper** (`src/features/_shared/optimistic.ts`) is correct: `optimisticPatch` → `commit()`
→ `clearOptimistic` on success / `rollback(token)` on failure.

**The primitives** (`src/state/optimistic.ts`) are sound and adversary-resistant:
- `optimisticPatch` returns **null when the entity isn't in the store** → a create can never
  optimistically insert (the create-no-insert guarantee, enforced at the primitive).
- records an **override** (`applyOverrides`) so an in-flight WS full-replace can't bounce an
  un-confirmed field back (the generalized `pendingLifecycle`).
- `rollback` restores the captured `prev` values + drops the override.

**Every mutation site matches the contract:**
| Site | Op | Path |
|---|---|---|
| `tasks/CreateTaskSheet.tsx:114` | edit task | `optimisticEdit('tasks', …)` + `res.ok` checked |
| `tasks/CreateTaskSheet.tsx:133` | **create task** | `getMaestroClient().createTask(payload)` — **no insert** ("the task:created WS event delivers it") |
| `tasks/TaskDetailScreen.tsx:60/65/83` | complete / pin / assign | `optimisticEdit('tasks', …)` + `flag()` surfaces error on `!ok` |
| `tasks/TaskDetailScreen.tsx:99` | delete | `deleteTask()` direct + `router.back()` — no optimistic removal (waits for `task:deleted`) |
| `members/TeamMemberSheet.tsx:112` | edit member | `optimisticEdit('teamMembers', …)` |
| `members/TeamMemberSheet.tsx:133` | **create member** | `createTeamMember(payload)` — **no insert** (WS `*:created` delivers) |
| `graphs/GraphsScreen.tsx:51` / `lists/ListsScreen.tsx:51` | **create** graph/list | client call direct — **no insert** |

No feature calls `optimisticPatch` / `useEntityStore.setState` / `batchSet` / `ingestEvent`
directly (only `_shared/optimistic.ts` touches the primitive) → no illegal store writes.

**Adversarial checks both hold:**
- **Rollback restores on a rejected commit** — proven by `optimistic.test.ts:20-26` (apply →
  reject → `rollback` → prior value restored) against the REAL primitive; the helper's `catch`
  calls `rollback(token)`.
- **No double-insert when `*:created`/`session:spawn` arrives for a just-created entity** —
  structural + tested: (a) creates never insert (above), so there is exactly ONE insert path
  (ingest); (b) the store is an **id-keyed `Record`**, so `*:created` is an idempotent UPSERT,
  never an append — `ingest.test.ts` proves `session:created`/`task:created` upsert and
  `session:updated` full-replaces an existing row. Derived lists come from `Object.values`, so
  no array can double-count. RunConfigSheet's spawn likewise does NOT insert ("Session lands via
  session:spawn (idempotent ingest) — don't insert it.").

## ✓ Criterion 3 — spawn — PASS

`features/sessions/RunConfigSheet.tsx`: `measureTerminalSize()` → `{cols, rows}` (108) →
`spawnSessionRequestSchema.parse({ taskIds:[…], …, cols, rows })` (110) → `spawnSession(request)` (124).
- **Never sets `spawnSource`** (comment L8). The schema (`domain/schemas/spawn.ts`) has
  `spawnSource: z.enum(['ui','session']).optional().default('ui')`, so the local parse fills `'ui'`,
  and the **client forces it** anyway: `MaestroClient.ts:414` `{ ...data, spawnSource: 'ui' as const }`
  then re-parses. Double-guaranteed.
- `cols/rows` are `ptyDimension` (int 1-1000); the measured pane size flows through. Schema is
  `.strict()`, mirroring the server's `spawnSessionSchema` — turns a server 400 into a precise
  client error.

## ✓ Criterion 4 — reply (pty.write) — PASS

`features/sessions/SessionDetailScreen.tsx:52-56`: `pty.attach(sid)` (idempotent) then
`pty.write(sid, encodeUtf8(text + '\r'))`.
- bytes are a real `Uint8Array` via `_shared/utf8.ts` `encodeUtf8` (TextEncoder + a correct
  surrogate-pair fallback); CR (`\r` = 0x0d) appended — the agent's PTY receives a submitted line.
- **guarded**: `canReply = session != null && REPLYABLE.has(status) && hasPtyTransport()` (L39);
  send early-returns if `!canReply`.
- **no synthetic sender**: `sendReply` only writes bytes + clears the input (`setReply('')`); it
  does NOT fabricate a local echo/timeline message — the agent's own output reflects the reply.
- The pty seam is dependency-inverted: `getPtyTransport/hasPtyTransport/setPtyTransport` live in
  `state/client.ts` (which imports **no** `services`); Compass injects `rt.pty` at boot
  (`navigation/bootstrap.ts:94 setPtyTransport(rt.pty)`) and nulls it on teardown (L134).

## ◐ Criterion 5 — useShallow + boundaries + placeholders — PASS-WITH-WAIVERS

**PASS sub-checks:**
- **useShallow — 0 violations.** Every object/array store selector is wrapped; the only inline
  object selector (`graphs/GraphsScreen.tsx:34` `Object.values(...).filter(...)`) uses `useShallow`.
  All other `use*Store` call sites read scalars. (The Phase-1 reload bug cannot recur.)
- **Stream A↔B isolation holds.** No A feature imports `sessions`/`conduct`; no B feature imports
  an A feature. Cross-stream actions go only through `sheets.open` intents.
- **components/ is pure.** No `src/components/**` import of `state` / `features` / `services`.
- **No leftover placeholder for the four.** `registry.tsx` wires real bodies for
  `command`/`createTask`/`editMember`/`runConfig`; `project`/`picker`/`doc`/`diagram`/`docs`
  remain on the placeholder/Phase-2 viewers (legitimately out of Phase-3 scope).

**✗ VIOLATION (W3) — `navigation ↔ features` runtime import cycle.** Criterion 5 requires
`navigation→features` to be ONE-WAY. It is not. A value-import cycle (type-only edges excluded)
was proven mechanically:

```
1. navigation/sheets/index.ts:30   export { SHEET_REGISTRY } from './registry'   (value)
2. navigation/sheets/registry.tsx:20-23   import { CommandSheet/CreateTaskSheet/… } from '@/features/{conduct,tasks,members,sessions}'
3. src/features/tasks/index.ts:2   export { TasksScreen } from './TasksScreen'
4. src/features/tasks/TasksScreen.tsx:12   import { routes, sheets } from '../../../navigation'   (value)
5. navigation/index.ts (barrel)   export { sheets, SheetHost, … } from './sheets'   → back to (1)
```

The cycle exists because the `sheets` barrel co-exports the leaf action API (`sheets`,
`useSheetStore`, types — which features legitimately consume) together with `SheetHost` +
`SHEET_REGISTRY` (which import the feature bodies). Nine feature screens close the loop by
importing the navigation mega-barrel for `routes`/`sheets`. (`SHEET_REGISTRY` snapshots the
feature component refs at module-eval time, so a cycle-induced mid-init read could in principle
capture `undefined` → an unrenderable sheet.)

- **Build impact: none.** The Android export builds (exit 0); Metro does not emit cycle errors
  at export time (those are runtime warnings).
- **Runtime impact: likely benign but NOT proven here.** `routes`/`sheets` are read lazily inside
  components/handlers (not at module top level), and `SHEET_REGISTRY` evaluates eagerly at root
  (`app/_layout.tsx:19,41` mounts `<SheetHost>`), so the registry most likely pulls feature
  barrels fresh-and-complete. But the exact eval order is **bundler-order-dependent** and could
  not be verified host-side: jest cannot evaluate the `SheetHost → @gorhom/bottom-sheet →
  reanimated → unistyles → react-native-nitro-modules` chain (a native TurboModule absent in the
  JS env — the same "JS-only is insufficient" wall as Phase-1's device-boot waiver).
- **Owed:** on dev-client boot, confirm no `Require cycle:` warning breaks sheet rendering, and
  that opening createTask / editMember / runConfig / command renders a real body (not blank).
- **Fix (Compass-owned, cheap):** split the imperative `sheets` action API (`sheets` +
  `useSheetStore` + types — leaf, no feature imports) from `SheetHost` + `SHEET_REGISTRY`
  (host-only, imported by `app/_layout`, never by features); have feature screens import `routes`
  from `navigation/routes` and `sheets` from that leaf, **never the mega-barrel**. Then the only
  surviving edge is `navigation→features` (one-way). Alternatively, `React.lazy` the four bodies
  in `registry.tsx` so it no longer statically imports the feature barrels.

## ✓ Criterion 6 — regression — PASS
- **Android export exit 0** (`/tmp/mobile-export3`, 77 files, 11M, 5.58 MB hbc). Bundle isolation
  intact: `maestro-server` 0 hits, `__sync__` 0 hits; markdown fix intact (`markdown-it` + the
  `aacute` entities-map token bundled). Phase-2's metro shim still holds.
- **jest 76/76** (9 suites). **Maelstrom 9/9** (batched=ARRAY / immediate=SINGLE / pty framing / close codes).

## ⚠ Criterion 7 — live round-trip — WAIVER (W4)

A disposable `maestro-server` could **not** be stood up in this environment, and I did not fake it
(per the directive). Attempts + exact blockers:
1. `bun maestro-server/src/server.ts` (PORT=4599, temp DATA_DIR, MAESTRO_PTY_HOST=server) →
   **`Failed to load native module: pty.node`** — `node-pty@1.1.0` ships no linux-x64 prebuild and
   bun's cache copy is unbuilt. The server hard-imports `node-pty` at boot regardless of PTY host.
2. `npm rebuild node-pty` → reports success but produces **no** `build/Release/*.node` (node-pty
   1.x prebuildify no-op here).
3. `npm run build` (tsc → dist, to run under `node`) → fails (only missing `@types/jest`/`@types/node`,
   but devDeps aren't installed and installing them is out of QA scope).

I deliberately did **not** exercise create/update/spawn against the LIVE orchestration server —
the directive forbids touching live orchestration data, and no temp instance was reachable.

**What the round-trip would have proven is already proven by host-side proxies against REAL code:**
- **WS framing** (the create→`*:created`, update→`*:updated` echo shape) — **Maelstrom 9/9** drives
  real `ws` sockets through the actual batched-array-vs-immediate-single demux + pty protocol.
- **Reconcile** (the "observe the WS event land" step) — `state/__tests__/ingest.test.ts` runs the
  REAL ingest reducer: `session:created`/`task:created` upsert, `session:updated` full-replace,
  `status_changed` patch, `*:deleted` remove, batched flush → ONE commit, mixed-entity coalesce.
- **Optimistic round-trip end** — `state/__tests__/optimistic.test.ts` runs the REAL primitive:
  rollback-restores, null-on-absent (create-no-insert), override-survives-replace, clear→authoritative.

**To clear W4:** on a host with a working `node-pty` (or a prebuilt server), run the disposable
server (temp data dir, spare port) and exercise create→`*:created` / update→`*:updated` /
spawn→`session:spawn`. This is identical in spirit to Phase-1's on-device boot waiver.

---

## Waivers carried / opened

- **W1 (carried)** — declare `expo-constants` in package.json (resolves transitively today). Bedrock.
- **W2 (carried)** — metro `disableHierarchicalLookup=true` is intentional; the Phase-2 entities
  shim is its targeted exception. Keep.
- **W3 (NEW, must-fix)** — `navigation↔features` import cycle violates the acyclic boundary
  (criterion 5). Build-clean, likely-benign, device-unverified. Fix per above before Phase 4;
  verify no cycle-induced blank sheet on dev-client boot. **Compass-owned.** *(If the acyclic
  boundary is a hard gate invariant, this item is a FAIL, not a waiver — Atlas's call.)*
- **W4 (NEW, environment)** — live disposable-server round-trip not executed (`node-pty` native
  unbuildable here). Framing proven via Maelstrom + real-reducer jest; not faked.

## Bottom line

Phase-3's substance is **correct**: the optimistic contract is implemented exactly to spec
(apply→commit→clear/rollback, creates never insert, idempotent id-keyed reconcile, rollback
proven), spawn forces `spawnSource:'ui'` with a measured PTY size through a strict schema, reply
writes real UTF-8 bytes through a guarded, dependency-inverted PTY seam with no synthetic sender,
useShallow is clean, A↔B isolation holds, and the app still builds + bundles isolation-clean. The
**one defect** is a real `navigation↔features` import cycle (W3) that breaches criterion 5's
acyclic boundary — build-clean and probably harmless, but it should be decoupled (cheap fix) and
device-checked. The live round-trip is an honest environment waiver (W4), with the framing already
proven against the real modules. **Verdict: PASS-WITH-WAIVERS** — clear to open Phase 4 once Atlas
rules on W3 (fix-now recommended) and accepts W4.
