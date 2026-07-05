# Planning — `domain/` (Lexicon)

**Author:** 📐 Lexicon · **Scope:** `domain/` — TS domain models, enums, and the REST + WebSocket + PTY contract types that mirror the existing maestro-server entities **exactly**, with zero server changes.

**Status:** planning only. No app code yet. This doc is the proposed contract for cross-team review by Conduit (`services/api/`), Pulse (`services/realtime/`), Ledger (`state/`), Forge (`features/`), Compass, Palette, and Sentinel.

---

## 0. TL;DR — the decisions

| Decision | Choice | One-line why |
|---|---|---|
| Modeling style | **Hand-mirrored TS interfaces** in `domain/`, organized by concern | Matches the proven maestro-ui precedent (`src/app/types/maestro.ts` "Canonical types matching maestro-server/src/types.ts"); keeps the RN bundle clean of server (CJS) code |
| Validation lib | **zod v4** (`^4.3.6`) — boundary-only, not blanket | Pins to the **same major the server validates with** (`maestro-server` uses `zod@^4.3.6`); `z.infer` gives single-source request types; skill `zod-schema-validation` applies |
| Where zod runs | Only on (a) request bodies the app *sends*, (b) the WS envelope parse, (c) auth/login. Read entities are **types-only** | Validate at boundaries we construct or that can arrive malformed on version skew; trust the rest to avoid perf + bundle cost |
| Sync strategy | Mirror + **compile-time drift guard** (`domain/__sync__/`) that imports `maestro-server/src/types.ts` (dev-only, never bundled) and asserts mutual assignability | The worktree *is* the monorepo, so server source is reachable at typecheck time — we get drift detection the UI never had, without bundling CJS server code |
| ID typing | **Branded string types** (`TaskId`, `SessionId`, …), zero-runtime | Catches "passed a taskId where a sessionId was expected" at compile time across 11 entity types |
| Display divergence | Server enums are source of truth; **explicit mapping layers** in `domain/derive/` translate to the Atelier design's display vocabulary | The design's `m-data.jsx` enums diverge from the server (see §4) — reconcile in one authoritative place, not ad-hoc in features |

---

## 1. Architecture for `domain/`

`domain/` is the **shared vocabulary** package for the whole app. It is pure TypeScript: no React, no fetch, no WebSocket, no platform APIs. Everything downstream (Conduit's REST client, Pulse's WS/PTY transports, Ledger's stores, Forge's screens) imports its types and pure helpers from here and **nowhere else** invents an entity shape.

Three layers, inner→outer:

1. **Primitives & enums** — branded IDs, timestamp aliases, and every closed enum (statuses, modes, tools, spell taxonomy). Zero dependencies.
2. **Entities** — the persisted server objects (`Task`, `Session`, …), mirrored field-for-field from `maestro-server/src/types.ts`.
3. **Contracts** — the wire shapes: REST request/response types, the WS envelope + `TypedEventMap`, and the `/pty` frame protocol. Plus `schemas/` (zod) for the boundary subset and `derive/` (pure functions) for server→display reconciliation.

**Principle: the server is the source of truth and is immutable.** We never model what we wish the server returned; we model what it *does* return (confirmed by reading `types.ts`, `DomainEvents.ts`, and the analysis doc's contract). Where the Atelier design wants a different shape, that translation is an explicit, tested function in `derive/` — never a silently different interface.

---

## 2. Folder structure for `domain/`

```
domain/
  index.ts                  # barrel: re-export enums, entities, contracts, derive (NOT schemas — opt-in)
  primitives.ts             # branded IDs, EpochMs, Iso8601, JsonObject

  enums/
    index.ts
    task.ts                 # TaskStatus, TaskPriority, TaskSessionStatus (+ const arrays)
    session.ts              # SessionStatus, SessionTimelineEventType
    mode.ts                 # AgentMode, LegacyAgentMode, AgentModeInput + normalizeMode/isWorkerMode/isCoordinatorMode/isCoordinatedMode
    launch.ts               # AgentTool, LaunchProvider, LaunchReasoningEffort, LaunchSpeed, LaunchAccessMode, PermissionMode
    spell.ts                # SpellAction, SpellLoopType, SpellHookEvent, SpellFailMode, SpellColorSlug, SPELL_COLORS, SpellEntityType
    taskGraph.ts            # TaskGraphStatus

  entities/
    index.ts
    project.ts              # Project
    task.ts                 # Task, TaskImage
    session.ts              # Session, SessionEvent, SessionTimelineEvent, ActiveSpell, needsInput
    doc.ts                  # DocEntry
    teamMember.ts           # TeamMember, TeamMemberSnapshot, TeamMemberStatus, TeamMemberScope, capabilities, commandPermissions
    team.ts                 # Team, TeamSnapshot, TeamTreeNode, TeamTreeMember, TeamStatus
    spell.ts                # Spell, SpellTrigger, SpellDefinition, SpellEntity, CustomPrompt
    taskList.ts             # TaskList
    taskGraph.ts            # TaskGraph, TaskGraphNode, TaskGraphEdge
    modelProfile.ts         # ModelProfile, LaunchConfig
    ensemble.ts             # Ensemble
    sessionPrompt.ts        # SessionPrompt, Huddle, HuddleSessionRef
    launchOverride.ts       # MemberLaunchOverride

  contracts/
    index.ts
    rest/
      requests.ts           # Create*/Update* payloads + SpawnSessionRequest
      responses.ts          # SuccessEnvelope, ErrorEnvelope, SpawnSessionResponse, list shapes, git/* responses
      endpoints.ts          # typed route catalog (path template + method + req/res) — Conduit's contract surface
    ws/
      envelope.ts           # WsEnvelope<T>, IMMEDIATE_EVENTS, isBatched()
      events.ts             # WsEventMap (mirror of TypedEventMap), WsEventName, WsEventPayload, WsEvent discriminated union
    pty/
      protocol.ts           # PtyServerFrame, PtyClientFrame, PTY_CLOSE_CODES

  schemas/                  # zod — boundary validation ONLY (opt-in import, not in barrel)
    index.ts
    spawn.ts                # spawnSessionRequestSchema (mirrors server spawnSessionSchema, .strict)
    wsEnvelope.ts           # parseWsMessage(raw) -> WsEvent[] (safe, branches on Array.isArray, drops unknown)
    # NOTE: NO auth.ts in v1 (directive 1 — direct host:port connect, no token/login). FUTURE seam only.

  derive/                   # pure server->display reconciliation (shared by Ledger + Forge)
    index.ts
    sessionStatus.ts        # toUiSessionStatus(session): 'run'|'wait'|'idle'|... ; isActive/isCompletedTab/isArchivedTab predicates
    agentTool.ts            # toDisplayTool / displayToolLabel ; provider<->tool maps
    mode.ts                 # modeDisplayLabel (Worker/Coordinator/Co-Worker/Co-Coordinator)
    spellColor.ts           # SERVER_SLUG_TO_HEX (mirror of SPELL_COLORS)

  __sync__/
    server-drift-guard.ts   # dev-only: import maestro-server types, assert mutual assignability (typecheck-time)

  README.md                 # the sync contract + "do not invent entity shapes" rule
```

Rationale for the split: enums and entities are imported *everywhere* and must have zero runtime weight beyond the few const arrays + helper fns. `schemas/` is deliberately **outside the barrel** (`import { spawnSessionRequestSchema } from '@/domain/schemas/spawn'`) so that a screen that only needs the `Task` *type* never pulls zod into its dependency graph. `derive/` is the one place server→Atelier display logic lives.

---

## 3. Modeling each entity (mirror map)

All field shapes confirmed against `maestro-server/src/types.ts`. Entities mirror **exactly** (same optionality, same nullability — e.g. `parentId: string | null`, `dueDate: string | null`, `completedAt: number | null`).

| Domain file | Server entities mirrored | Notes |
|---|---|---|
| `project.ts` | `Project` | `isMaster?` flips cross-project access |
| `task.ts` | `Task`, `TaskImage` | `parentId/childrenIds` hierarchy; `sessionIds[]` M:N; `taskSessionStatuses: Record<SessionId,TaskSessionStatus>`; `teamMemberId`/`teamMemberIds[]`/`teamId`; `pinned`, `spellIds`, `memberOverrides` |
| `session.ts` | `Session`, `SessionEvent`, `SessionTimelineEvent`, `ActiveSpell` | `taskIds[]`; spawn-chain via `parentSessionId`/`rootSessionId`/`teamSessionId`; `needsInput{active,message,since}`; `humanCompletedAt`/`archivedAt` drive tabs (see §4.4); `activeSpells[]` |
| `doc.ts` | `DocEntry` | `kind: 'markdown'\|'diagram'`; content now in `contentFilePath` |
| `teamMember.ts` | `TeamMember`, `TeamMemberSnapshot` | `mode`, `agentTool`, `modelProfileId`→`model` fallback, `permissionMode`, `commandPermissions{groups,commands}`, `capabilities`, `memory[]`, `scope`, `systemKind` |
| `team.ts` | `Team`, `TeamSnapshot`, `TeamTreeNode`, `TeamTreeMember` | `leaderId`, `memberIds[]`, `subTeamIds[]` team-of-teams; tree from `GET /teams/:id/tree` |
| `spell.ts` | `Spell`, `SpellTrigger`, `SpellDefinition`, `SpellEntity`, `CustomPrompt` | `action`/`loopType`/`trigger`/`failMode`; `color: SpellColorSlug` |
| `taskList.ts` | `TaskList` | `orderedTaskIds[]` |
| `taskGraph.ts` | `TaskGraph`, `TaskGraphNode`, `TaskGraphEdge` | DAG; `status: TaskGraphStatus` |
| `modelProfile.ts` | `ModelProfile`, `LaunchConfig` | `launchConfig{provider,model,reasoningEffort?,speed?,accessMode?}`; ISO timestamps |
| `ensemble.ts` | `Ensemble` | `memberSessionIds[]`, `leaderSessionId`, `objective`, `spellId` |
| `sessionPrompt.ts` | `SessionPrompt`, `Huddle`, `HuddleSessionRef` | cross-project prompt log; huddle = connected component |
| `launchOverride.ts` | `MemberLaunchOverride` | per-member launch override, used by Task/TaskGraph/Spawn |

**Timestamp convention to preserve (footgun):** the server is *inconsistent* on purpose — `number` (epoch ms) on `Task`/`Session`/`Spell`/`Ensemble`/`DocEntry`, but **ISO 8601 strings** on `TeamMember`/`Team`/`ModelProfile`. Mirror this exactly. We encode it with `EpochMs` and `Iso8601` aliases so the difference is visible at every field and Ledger/Forge never guess. **Do not "normalize" timestamps in the domain layer** — that would diverge from the wire.

---

## 4. Enums + the design-vs-server reconciliation (the core domain job)

The Atelier design's `m-data.jsx` enums **diverge from the server** in four places. Server is authoritative; the design strings become display labels produced by `derive/`. This reconciliation is the single most important thing this layer gets right — get it wrong and every tile shows the wrong status.

### 4.1 Task status / priority
- **`TaskStatus`** (server entity, 7): `todo | in_progress | in_review | completed | cancelled | blocked | archived`.
  - ⚠️ The CLI manifest's `TaskStatus` is a 6-value subset (no `archived`). **Use the server entity's 7-value union** — that's what REST/WS deliver.
- **`TaskPriority`** (server entity, 3): `low | medium | high`.
  - ⚠️ The CLI's `TaskData.priority` adds `'critical'`, but the **server `Task` entity is 3-value**. Mobile uses 3. Flag for Forge: no "critical" chip.
- **`TaskSessionStatus`** (5): `working | blocked | completed | failed | skipped` — the per-session map `Task.taskSessionStatuses`.

### 4.2 Session status (the big one)
- **`SessionStatus`** (server, 6): `spawning | idle | working | completed | failed | stopped`.
- The Atelier design lists **8**: adds `run` and `wait`. **These are NOT server statuses.** They are *derived display states*:
  - `wait` ⇐ `session.needsInput?.active === true` (regardless of base status)
  - `run`  ⇐ `status === 'working'` (the design's word for "actively running")
- Deliverable: `derive/sessionStatus.ts → toUiSessionStatus(session): UiSessionStatus` implementing `needsInput.active ? 'wait' : map(status)`. **Forge/Palette must render from `toUiSessionStatus`, never from raw `status`**, or the "needs input" dot is lost.

### 4.3 Modes & agent tools
- **`AgentMode`** (canonical, 4): `worker | coordinator | coordinated-worker | coordinated-coordinator`; legacy aliases `execute | coordinate`. Port `normalizeMode`, `isWorkerMode`, `isCoordinatorMode`, `isCoordinatedMode` **verbatim** from server `types.ts` into `enums/mode.ts`. Design labels (`Worker/Coordinator/Co-Worker/Co-Coordinator`) live in `derive/mode.ts → modeDisplayLabel`.
- **`AgentTool`** (server, 4): `claude-code | codex | hermes | gemini`.
  - ⚠️ Design uses `claude | codex | gemini | terminal` — mismatch on both ends (`claude`→`claude-code`; no `hermes`; `terminal` isn't a server tool). `derive/agentTool.ts` owns `toDisplayTool`/`displayToolLabel`; **never** persist a design string back to the server.
- Launch enums (mirror exactly): `LaunchProvider = claude|openai|hermes|gemini`, `LaunchReasoningEffort = minimal|low|medium|high|xhigh|max`, `LaunchSpeed = standard|fast`, `LaunchAccessMode = safe|acceptEdits|plan|fullAccess`, `PermissionMode = acceptEdits|interactive|readOnly|bypassPermissions`.

### 4.4 Session tab derivation (cross-team, belongs here)
The Sessions screen's Active/Completed/Archived tabs are **not** a single status field. Precedence (from `Session` fields):
`archivedAt != null` → **Archived** (wins) ; else `humanCompletedAt != null` → **Completed** ; else → **Active**.
Deliverable: pure predicates `isArchivedTab/isCompletedTab/isActiveTab(session)` in `derive/sessionStatus.ts`, consumed by both Ledger selectors and Forge. Putting this in `domain/derive/` (not in a store) prevents Forge and Ledger from drifting on the rule.

### 4.5 Spell taxonomy (mirror verbatim)
`SpellAction` (6), `SpellLoopType` (4), `SpellHookEvent` (6), `SpellFailMode` (open|closed), `SpellEntityType` (7), and `SPELL_COLORS` (9 slug→hex). Re-export `SPELL_COLORS` as a const array and `derive/spellColor.ts` exposes `SERVER_SLUG_TO_HEX` — mirroring the existing `maestro-ui/src/app/constants/spellColors.ts` pattern so ring colors match the desktop.

---

## 5. REST contract types (`contracts/rest/`)

- **Request bodies** mirror server payloads exactly: `CreateTaskPayload`/`UpdateTaskPayload`, `CreateSessionPayload`/`UpdateSessionPayload`, `SpawnSessionPayload`, `Create/Update` for TeamMember/Team/TaskList/TaskGraph/ModelProfile/Spell/Ensemble/CustomPrompt, `UpdateOrderingPayload`, `SpellInvocationPayload`.
- **Response envelopes** (from the analysis doc + `api-responses.ts`):
  - Success: raw entity JSON **or** `SuccessEnvelope = { success: true } & Record<string,unknown>`.
  - Error: `ErrorEnvelope = { error: true; code: string; message: string }`. `code` includes `VALIDATION_ERROR` (400 from a `.strict()` schema).
  - Spawn: `SpawnSessionResponse = { success: true; sessionId: SessionId; manifestPath: string; message: string; session: Session }`.
  - Git: `GitStatusResponse`, `GitDiffSummary`, `GitFileChange`, `GitPrInfoResponse`, `GitDiffResponse`, `GitMergeResponse` (mirror `api-responses.ts`).
- **`endpoints.ts`** — an opinionated typed route catalog: each endpoint as `{ method, path: (params)=>string, Req, Res }`. This is **for Conduit**: it lets `MaestroClient` be generated/checked against one table instead of 120 ad-hoc method signatures. Open question for Conduit (§9) — adopt the catalog or keep free-form methods.

### 5.1 The spawn body — get it exactly right
`POST /api/sessions/spawn` is validated by the server's `spawnSessionSchema` (`.strict()` — extra keys → 400). `schemas/spawn.ts` mirrors it as the **one zod schema** we author with care:
- `taskIds: string[]` (≥1, required); `projectId?`; `sessionName?`
- `mode?` ∈ AgentMode (default `worker`)
- `spawnSource?` — **mobile always sends `'ui'`** (`'session'` needs an `X-Session-Id` coordinator header → 403)
- `launchConfig{provider,model,reasoningEffort?,speed?,accessMode?}` (non-strict) **or** legacy `agentTool/model/reasoningEffort`
- `teamMemberId(s)`, `delegateTeamMemberIds`, `teamId`, `memberOverrides`, `permissionMode`, `useWorktree`, `initialDirective{subject,message}`
- `cols?`/`rows?` (int 1..1000) — the measured PTY size (Relay supplies these)

Validating *outbound* with zod here catches a malformed spawn before the round-trip and turns the server's opaque 400 into a precise client-side error.

---

## 6. WebSocket contract types (`contracts/ws/`)

- **Envelope:** `WsEnvelope<T> = { type: string; event: string; data: T; timestamp: number }` where `type === event` (per analysis §2.2).
- **The Array.isArray rule is encoded in the type and the parser.** Batched flushes arrive as `WsEnvelope[]`; immediate events as a single `WsEnvelope`. `schemas/wsEnvelope.ts → parseWsMessage(raw: string): WsEvent[]` always returns an array (wrapping the single-object case), safe-parses, and **drops unknown event names** so a server version bump never crashes the client. Pulse consumes only this — never `JSON.parse` directly.
- **`WsEventMap`** mirrors the server's `TypedEventMap` (≈60 events) → `WsEventName = keyof WsEventMap`, `WsEventPayload<K>`, and a discriminated `WsEvent` union for exhaustive `switch` handling in Ledger.
- **`IMMEDIATE_EVENTS`** const set (un-batched): `session:spawn|resume|prompt_send|modal|modal_action|modal_closed`, `spell:invoked|activated|deactivated`, `ensemble:created|updated|disbanded|message`. Informational for clients (the server decides batching) but documents which arrive solo.
- ⚠️ **`team:*` events are declared in `TypedEventMap` but NOT broadcast by the bridge.** We still type them, but `derive`/docs mark teams **REST-poll-only**. Pulse + Ledger must not assume live team updates. (Flag in §9 to verify against `WebSocketBridge` subscribed-event list.)
- `session:status_changed` payload is **not** a full `Session` — it's `{ id; status: string; lastActivity: string; needsInput? }`. Ledger must shallow-merge, not replace. Typed precisely so this isn't missed.

---

## 7. PTY protocol types (`contracts/pty/`)

For Relay's `/pty?sessionId=<id>` transport (`binaryType=arraybuffer`):
- `PtyServerFrame = { type:'size'; cols:number; rows:number } | { type:'exit'; exitCode:number }` (text frames) **plus** raw binary (`ArrayBuffer`) = PTY output (scrollback replayed first, then live).
- `PtyClientFrame = { type:'resize'; cols:number; rows:number }` (text) **plus** raw binary = keystroke bytes.
- `PTY_CLOSE_CODES = { MISSING_SESSION_ID: 1008, NO_LIVE_PTY: 1011 }` — `1011` ⇒ session over / needs resume; plain close ⇒ detached, PTY keeps running, re-attachable.
- Note for Relay (not domain's job, but typed here): binary frames split multibyte UTF-8 across boundaries → use a per-session streaming `TextDecoder({stream:true})`.

These are *type-only* (no zod) — binary frames aren't JSON; the two control frames are tiny and Relay-internal.

---

## 8. Keeping contract types in sync with the server (the strategy)

**Constraint:** server is source of truth and immutable; no shared npm types package exists; maestro-ui's established practice is to **hand-mirror** (`src/app/types/maestro.ts`, header "Canonical types matching maestro-server/src/types.ts") and maintain explicit mapping constants. We adopt that proven approach and **strengthen it** because, unlike a published app, this worktree contains the server source.

Three mechanisms, in order of strength:

1. **Hand-mirror with provenance.** Every `domain/entities/*.ts` and enum file carries a header: `// Mirrors maestro-server/src/types.ts <Entity> — do not edit shape without re-running the drift guard.` Same discipline the UI already uses successfully.
2. **Compile-time drift guard (`domain/__sync__/server-drift-guard.ts`).** A dev-only module that `import type`s the server's types via relative path (`../../maestro-server/src/types`) and asserts **mutual assignability** in both directions, e.g.:
   ```ts
   import type { Task as ServerTask } from '../../../maestro-server/src/types';
   import type { Task as MobileTask } from '../entities/task';
   const _a: ServerTask = {} as MobileTask;  // mobile ⊆ server
   const _b: MobileTask = {} as ServerTask;  // server ⊆ mobile
   ```

   **Isolation contract (ratified — Sentinel must-fix #4; Sentinel owns enforcement):** the guard runs under a **dedicated `tsconfig.drift.json`**, NOT the app `tsconfig`. This is a hard isolation boundary so that **type errors originating in the server source can never enter the app's typecheck gate** — only a genuine *mismatch* between the mirror and the server fails, and it fails in its own dedicated check. Three-part contract:
   - **`tsconfig.drift.json`** (Sentinel-owned, separate gate): `include`s only `domain/__sync__/**` + the two type sources; this is the *only* tsconfig that reaches into `../maestro-server`. A pre-existing server-side type error surfaces here as a drift-check failure, isolated from the app build.
   - **App `tsconfig.json`** `exclude`s `domain/__sync__/**` and never references `maestro-server` — the app gate (`tsc --noEmit` per package) stays 100% app-local and fast.
   - **Metro `blockList`** excludes `domain/__sync__/**` and `maestro-server/**` so no server (CJS) code can reach the RN bundle even transitively.

   This gives us drift detection the desktop UI never had, while keeping the app gate clean. *(Falls back gracefully: if a standalone-package decision later removes server source from the tree, `tsconfig.drift.json` + the guard file are dropped and we rely on mechanism 1 + 3.)*
3. **A documented, periodic diff ritual** in `domain/README.md`: when the server entity file changes, re-run the guard; mapping tables (`derive/*`) get a unit test that enumerates every server enum value so a *new* server status fails the test loudly rather than rendering as a blank chip.

**Why not import server types directly into the app at runtime?** `maestro-server` is CommonJS and `types.ts` carries runtime exports (`SPELL_COLORS`, `normalizeMode`, …). Bundling it into an Expo/Metro (ESM) app drags CJS interop and the whole server module graph in. Mirroring keeps the app self-contained and the bundle clean — the guard recovers the safety without the coupling.

---

## 9. Library choices — rationale + rejected alternatives

| Concern | Chosen | Version | Rejected (why) |
|---|---|---|---|
| Runtime validation (boundary) | **zod** | `^4.3.6` | **valibot** (smaller bundle, but server validates with zod v4 — parity matters more than KBs for a contract layer; smaller ecosystem). **io-ts** (needs fp-ts; FP style alien to the rest). **yup** (weaker TS inference, no `infer`). **typia** (needs a compiler transform — clashes with Metro/Babel). ** Hand-written guards** (no single-source `infer`, drift-prone). |
| Pin to **v4 not v3** | match server | — | Server `maestro-server/package.json` declares `zod@^4.3.6`. Using v3 risks subtle schema-behavior divergence on the one schema that must match the server's (`spawnSessionSchema`). |
| Nominal IDs | **TS branded types** (`type TaskId = string & { __brand:'TaskId' }`) | — built-in | **ts-brand / newtype-ts** libs (extra dep for a 1-line pattern). **Plain `string`** (loses all cross-entity ID safety across 11 entities). |
| Type-level drift assertion | **plain `tsc` assignability assertions** in `__sync__/` | built-in | **tsd** / **expect-type** (separate runner; we already run `tsc` via Sentinel — no new tool). |
| Enum representation | **string-literal unions + `as const` arrays** | built-in | **TS `enum`** (generates runtime objects, poor tree-shaking, nominal headaches, doesn't match the server's literal-union style). |
| Date handling | **none in domain** (raw `number`/`string` as the server sends) | — | Any date lib here would imply normalization, diverging from the wire. Formatting belongs to a UI util, not the contract. |

---

## 10. Best practices this layer enforces

- **No entity shape is invented outside `domain/`.** Reviews reject `interface` declarations of server data anywhere else (Conduit/Pulse/Ledger/Forge import from here).
- **Optionality/nullability mirrors the server exactly** — `x?: T` vs `x: T | null` are distinct and both appear in the server; copy faithfully.
- **`derive/` is the only place server→display translation lives** — status, tool, mode, color. Features call `toUiSessionStatus`, never re-implement.
- **zod stays out of the barrel** so type-only consumers don't pull it in.
- **Exhaustive switches** on the `WsEvent` / `TaskStatus` / `SessionStatus` unions use a `never` default so a new server value is a compile error, not a silent miss.
- **Branded IDs at the boundary**: REST/WS parsers cast to branded IDs once; everything downstream stays type-safe.

---

## 11. Risks

1. **Server drift** — the central risk of any mirror. Mitigated by the §8 compile-time guard + enum-coverage tests. Residual risk if the standalone-package decision later severs server-source access (guard degrades to manual review).
2. **Enum divergence between server `types.ts` and CLI `manifest.ts`** (TaskStatus 7-vs-6, priority `critical`, AgentTool sets). We anchor on the **server entity** file for everything REST/WS delivers; documented in §4 so no one mirrors the wrong file.
3. **`team:*` not broadcast** — if Ledger/Pulse assume live team events, team UI goes stale. Domain marks teams REST-poll-only; needs verification against the bridge's subscribed-event list (§9 open question).
4. **`session:status_changed` partial payload** — typed as a partial, but if Ledger replaces instead of merges, fields are lost. Called out in §6.
5. **zod v4 specifics** — v4 changed some APIs vs v3; the team must not copy v3 snippets. Pinning + the skill mitigate.
6. **Timestamp inconsistency** mistaken for a bug and "fixed" — explicitly documented (§3) as intentional wire fidelity.

---

## 12. Cross-team dependencies & open questions

**For Conduit (`services/api/`):**
- Q1 (RESOLVED): Conduit declines the `endpoints.ts` catalog for v1 and keeps free-form ported `MaestroClient` methods, **still typed by my `contracts/rest/requests.ts` + `responses.ts`**. Fine by me — I ship the request/response types regardless; `endpoints.ts` becomes an optional post-v1 refactor (I'll keep it out of v1 to avoid dead surface).
- Q2 (RESOLVED — auth out of v1): Directive 1 drops auth from v1. Conduit verified in server source that the middleware reads **only** the `maestro_auth` cookie + the `?token=` query param — **`Authorization: Bearer` is NOT accepted** (the analysis doc was wrong on this). FUTURE auth seam is `?token=` only; **no domain auth types ship in v1** (no `schemas/auth.ts`, no login/status payloads).
- Dependency: Conduit imports request/response types + `schemas/spawn.ts` from domain.

**For Pulse (`services/realtime/`):**
- Q3: Confirm the WS envelope is exactly `{type,event,data,timestamp}` with `type===event` on the wire (analysis says so; please verify against `WebSocketBridge` serialization). `contracts/ws/envelope.ts` depends on it.
- Q4: Confirm `team:*` is genuinely not broadcast (verify the bridge's subscribed-event list) so I can mark teams REST-poll authoritatively.
- Dependency: Pulse consumes `WsEventMap`, `WsEvent`, `parseWsMessage`, `PtyServerFrame`/`PtyClientFrame`, `PTY_CLOSE_CODES`.

**For Ledger (`state/`):**
- Q5: Stores key entities by branded ID (`Record<SessionId, Session>`) — agree to import the branded-ID types so selectors are type-safe end to end?
- Dependency: Ledger imports all entities + `derive/` predicates (tab derivation, `toUiSessionStatus`). **The tab-precedence rule and session-status derivation live in `domain/derive/`, not in stores** — please consume, don't re-implement.

**For Forge (`features/`) & Palette (`components/`):**
- Q6: All tiles render via `derive/` (status/tool/mode/color). Confirm you'll consume `toUiSessionStatus`/`modeDisplayLabel`/`toDisplayTool` rather than mapping raw enums in components — this is what keeps the "needs input" (`wait`) state visible.
- Note: no `critical` task priority (server is 3-value); session UI statuses are 8 (derived) over 6 server values.

**For Bedrock (`theme/`):**
- Q7: `SPELL_COLORS` slug→hex lives in domain `derive/spellColor.ts` (wire fidelity), but the *theme tokens* are yours. Let's agree the spell ring hexes reference the server palette, not re-pick colors, so rings match desktop.

**For Sentinel (`__qa__`):**
- Dependency / ratified isolation contract (must-fix #4, **Sentinel-owned**): the §8 drift guard runs under a **dedicated `tsconfig.drift.json`** (separate gate) so server-source type errors never enter the app `tsc --noEmit` gate; the app `tsconfig` `exclude`s `domain/__sync__/**` and Metro `blockList`s `domain/__sync__/**` + `maestro-server/**`. Sentinel owns wiring + verifying these three. Enum-coverage unit tests for `derive/` mapping tables are also part of the phase gate.

---

## 13. Suggested consensus decisions to ratify (domain-relevant)

1. **State lib:** Ledger owns it, but domain stays state-lib-agnostic (pure types/fns) — no objection to zustand-5.
2. **Validation:** zod v4, boundary-only — ratify §0.
3. **Sync strategy:** mirror + compile-time drift guard — ratify §8.
4. **ID typing:** branded strings across the app — needs Ledger + Conduit buy-in (Q5).
5. **`endpoints.ts` catalog:** adopt or not — Conduit decides (Q1).

---

## 14. Cross-review addendum (post-consensus)

Read at my boundaries: `api-services.md` (Conduit), `realtime.md` (Pulse), `state.md` (Ledger). **SIGN-OFF** — no blocking objection. All three already consume exactly what `domain/` publishes.

- **vs Conduit:** consumes `contracts/rest/requests.ts` + `responses.ts` + `schemas/spawn.ts`; declined the `endpoints.ts` catalog (Q1 resolved — I keep the request/response **types** as the central surface, drop the catalog for v1). Folded in Conduit's source-verified correction: server accepts **cookie + `?token=` only, not `Authorization: Bearer`** — my future-seam note now says `?token=`. My `MaestroApiError`/`ErrorEnvelope` shapes align.
- **vs Pulse:** consumes `WsEnvelope`, the discriminated `WsEvent`/`RealtimeEvent` union (mirror of server `TypedEventMap`), the immediate-vs-batched event lists, `notify:*` + `session:status_changed` (partial) shapes, and `PtyServerFrame`/`PtyClientFrame`/`PTY_CLOSE_CODES`. Pulse keeps zod off the hot path and uses my compile-time types + a `__DEV__` unknown-event assert — matches my "zod boundary-only" stance. Confirmed: teams REST-poll-only (`team:*` not broadcast).
- **vs Ledger:** agreed branded-ID-keyed maps (Q5 yes); Ledger's selectors consume `domain/derive/` (`toUiSessionStatus`, `isArchivedTab/isCompletedTab/isActiveTab`) instead of re-implementing; `session:status_changed` is shallow-merged as a partial; reducer `switch` uses my `WsEvent` union with a `never` default so a new server event is a compile error.

**Net changes to my plan (from directives + review):** (1) **drop all auth types from v1** — removed `schemas/auth.ts`; `?token=` documented as the only future seam (cookie/Bearer not modeled). (2) Corrected the auth future-seam to `?token=` (Bearer is not server-accepted). (3) Dropped `endpoints.ts` from v1 (Conduit's call) — request/response types remain the published surface. (4) **UI split (directive 2) has zero impact on `domain/`** — domain is the shared read-only vocabulary for *both* the Maestro-panel and Session-panel feature streams; both import the same entities/derive/contracts, no file-disjointness concern since `domain/` is foundational and consumed, not split. No conflict with any sibling doc.

**Drift-guard reachability (Atlas focus, confirmed):** `maestro-server/src/types.ts` is present in this worktree and has **zero top-level imports**, so `import type` from `domain/__sync__/server-drift-guard.ts` resolves and typechecks cleanly with no transitive graph. Verified in-worktree.

**Drift-guard isolation (ratified must-fix #4, confirmed with Sentinel):** the guard typechecks under a **dedicated `tsconfig.drift.json`** (Sentinel-owned, separate gate) — so server-source type errors never pollute the app gate; only a real mirror-vs-server mismatch fails, in its own check. The app `tsconfig` `exclude`s `domain/__sync__/**` and never references `maestro-server`; Metro `blockList`s `domain/__sync__/**` + `maestro-server/**` so server (CJS) code never ships. Sentinel owns enforcing all three.
