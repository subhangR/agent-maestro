# Maestro Platform Self-Critique

> **Methodology:** Direct code inspection of all TypeScript source files; verified claims against runtime data in `~/.maestro/` and `~/hub/`. All scores are relative to a mature production-grade OSS project. Evidence paths include line numbers as of the current codebase state (branch: `integrate/msg-pipeline-to-main`).
>
> **Exclusions:** This report does not repeat architectural description already in `docs/arch-report/`. Claims without file paths are not made.

---

## 1. Subsystem Scorecard

| # | Subsystem | Score | Justification |
|---|---|---|---|
| 1 | Server domain & service layer | **7/10** | Clean DDD layering, Zod validation throughout, good DI wiring — but a structural defect in `SessionService.updateSession()` causes all tasks to stagnate permanently in `in_progress` after their sessions finish. |
| 2 | REST API and validation | **7/10** | Comprehensive route surface with Zod schemas and centralised error handling, but several routes (`/task-graphs/*/execute`, token analytics) are stubs or only exist as design plans — the API surface is wider than the implementation. |
| 3 | Persistence and migrations | **8/10** | Atomic writes, write batcher, two-tier session cache, parallel file loading, sentinel-guarded one-shot migrations — all well-designed. Weak point: no schema evolution story for additive Session/Task field changes at scale (relies on optional-field tolerance). |
| 4 | WebSocket and realtime | **8/10** | Dual-channel architecture (entity-sync + PTY), 50 ms batch window, per-entity throttling, subscription filtering, immediate-event bypass, epoch-based PTY reset, and offset resume are all production-grade. The `batchSet` microtask coalescer prevents render storms. |
| 5 | CLI and agent prompting | **5/10** | The prompt composition pipeline is technically excellent (multi-layer normalisation, XML injection, compact command rendering). However, `guardCommand()` is an explicit no-op (`command-permissions.ts:147–158`), making the entire permission and capability system purely decorative. Collab commands appear in every agent's prompt surface despite being unusable without a separate opt-in flag. |
| 6 | Orchestration and coordination semantics | **4/10** | The four-mode model is conceptually sound, but task status never auto-advances beyond `in_progress` (confirmed: 12 stuck tasks in `.maestro/`, 42 in `hub/`). TaskGraph has a `running` status field and `getReadyNodes()` logic but no execution engine to call it. Gemini/Hermes sessions throw on resume. Coordinator mode-flip doesn't affect the live agent prompt. |
| 7 | Desktop UI | **6/10** | The Zustand + `batchSet` + optimistic-update + lifecycle-lock architecture is well-engineered for realtime consistency. The PTY offset-resume path is solid. Weak points: 40+ stores add operational complexity; the `redesign/` component subtree is feature-flagged dead code that ships in every build; the mobile app's `batchSet` has a correctness fix over the desktop version that hasn't been back-ported. |
| 8 | Test coverage and CI | **4/10** | 55 server tests, 34 CLI tests, 81 UI tests. Hook dispatcher is exceptionally well covered (768-line test, 100+ cases). But: zero test gate in CI (`release.yml` and `architecture.yml` both skip tests), no coverage thresholds, 5 services with zero tests (`CommandUsageService`, `GitWorktreeService`, `OrderingService`, `SessionPromptService`, `TaskListService`), and TaskGraph execution logic has only cycle-detection coverage. |
| 9 | Deployment and release | **6/10** | Multi-platform Tauri CI/CD, gateway architecture with per-user server isolation, systemd hardening, nginx config — solid for a small team. Weak points: gateway Phase 1 default is `dev` auth (no Firebase verification), port ceiling of 100 concurrent users (4600–4699), no Docker image for headless server deployment. |
| 10 | Documentation | **4/10** | Over 100 files in `docs/` but completely un-navigable: design plans, implementation notes, historical decisions, completed audits, and live architecture docs share the same flat directory. No `docs/README.md` or index. `OPENSOURCE_READINESS_REPORT.md` called this out as a gap; it has not been addressed. |

---

## 2. Logically Broken or Incoherent Features

### 2.1 Task status permanently stagnates at `in_progress` — CRITICAL

**Files:** `maestro-server/src/application/services/SessionService.ts:144–167`

**What the code does:**

```typescript
// Lines 144–167 in SessionService.updateSession()
if (updates.status && ['stopped', 'completed', 'failed'].includes(updates.status)) {
  const taskSessionStatus = updates.status === 'completed' ? 'completed' : 'failed';
  for (const taskId of session.taskIds) {
    // ...
    await this.taskRepo.update(taskId, {
      taskSessionStatuses: { ...(task.taskSessionStatuses || {}), [id]: taskSessionStatus },
    });
    // task.status is NEVER touched here
  }
}
```

`updateSession()` writes only to `task.taskSessionStatuses[sessionId]` — the per-session sub-map — and never to `task.status`. Once `worker-init.ts:125` sets `task.status = 'in_progress'` at spawn time, no code path exists to advance it to `completed`.

**User-visible symptom:** Every task stays `in_progress` forever regardless of session outcomes. Users must manually mark tasks done. The kanban view and task filters are unreliable indicators of work state.

**Confirmed in production data:**
- `.maestro/data/tasks/`: 12 tasks in `in_progress`, all with every referenced session in `completed` or `stopped` state.
- `hub/` (multi-user gateway): 42 tasks in `in_progress`, 41 with all sessions terminal.

**This is the root cause of the "19 stuck tasks" mentioned by the coordinator.** The count varies by environment because `.maestro/` and `hub/` are separate data trees; the combined total is 54.

---

### 2.2 Permission system is an explicit, documented no-op — HIGH

**File:** `maestro-cli/src/services/command-permissions.ts:147–158`

```typescript
export async function guardCommand(_commandName: string): Promise<void> {
  // 0-gates policy: every session may run every command, regardless of mode or
  // manifest state. Permissions are still resolved for prompt display, but they
  // never block execution.
  return;
}
export function guardCommandSync(_commandName: string): boolean {
  // 0-gates policy — see guardCommand. Never blocks.
  return true;
}
```

Every CLI command calls `guardCommand()` at invocation time. The function is a no-op by design. The elaborate capability resolution pipeline (`capability-policy.ts`, `resolveCapabilitySet()`, group/command overrides, explicit allowlists) affects only what appears in the system prompt — it never gates actual execution.

**User-visible symptom:** A `worker` agent can spawn sessions, create tasks, and access `master` commands even if the manifest removes those command groups. A `coordinated-worker` can invoke `maestro coordinator enable` and then spawn sub-sessions. Permission settings on TeamMembers and ModelProfiles are cosmetic.

#### What enforcement would actually deny today, and why it is nearly nothing

**Q1 — Which commands would start being denied?**

If `guardCommand()` were changed to throw when a command is not in `CapabilitySet.allowedCommands`, the answer is: almost nothing, because the catalog itself is configured to allow everything everywhere.

`command-catalog.ts:23`:
```typescript
const DEFAULT_EXCLUDED_COMMANDS_BY_MODE: Partial<Record<AgentMode, string[]>> = {};
```

`capability-policy.ts:65`:
```typescript
const HARD_BLOCKED_COMMANDS_BY_MODE: Partial<Record<AgentMode, string[]>> = {};
```

Both exclusion maps are empty. `getDefaultCommandsForMode(mode)` (`command-catalog.ts:385–391`) filters the catalog by `allowedModes.includes(mode)`. Every entry in the catalog has `allowedModes: ALL_MODES` except two bootstrap commands:

| Command | `allowedModes` | Effect of enforcement |
|---|---|---|
| `worker:init` | `WORKER_MODES` only | Denied to `coordinator` / `coordinated-coordinator` |
| `orchestrator:init` | `COORDINATOR_MODES` only | Denied to `worker` / `coordinated-worker` |

Both are `hiddenFromPrompt: true` — internal bootstrap commands. No real agent calls them from inside a session. Zero production TeamMembers (0/8 in `hub/`, 0/5 in `.maestro/`) have `commandPermissions` set. No session manifest sets `allowedCommands`. The effective conclusion: **enforcing today would deny exactly two internal bootstrap commands to the wrong mode, and nothing else.** The `promptModes` field (which restricts which commands appear in agent prompts) is not the same as `allowedModes` — the many commands marked `promptModes: COORDINATOR_MODES` (e.g., `session:list`, `session:logs`, `session:watch`, `task:update`, `task:complete`) are still in `allowedModes: ALL_MODES` and would not be denied even under enforcement.

The permission system is not only not enforced — it is not configured to enforce anything meaningful on the default path.

**Q2 — Deliberate staged rollout with enforcement path written, or never implemented?**

**Deliberate decision, but the enforcement check was never written — only the scaffold was.**

Three separate code comments make the intent explicit:

`command-catalog.ts:21–22`:
```
// Any session may spawn/coordinate; coordination commands are gated for
// prompt visibility (promptModes) rather than execution. No mode-level exclusions.
```

`capability-policy.ts:63–64`:
```
// Any session may spawn/coordinate; no execution-level mode blocks. Coordination
// commands are kept out of a mode's prompt via promptModes, not hard-blocked here.
```

`command-permissions.ts:148–153`:
```
// 0-gates policy: every session may run every command, regardless of mode or
// manifest state. Permissions are still resolved for prompt display, but they
// never block execution. This is the single chokepoint all commands call, so
// making it a no-op guarantees nothing is ever gated.
```

The scaffold is complete: `guardCommand()` is called from every command, `CapabilitySet.allowedCommands` is computed per session, `HARD_BLOCKED_COMMANDS_BY_MODE` and `DEFAULT_EXCLUDED_COMMANDS_BY_MODE` exist as extension points. What is missing is not a disabled check — it is the check itself. The function body was intentionally left empty; no dormant enforcement logic awaits a flag flip. This was a deliberate design trade-off: use prompts to guide behaviour, not runtime gates to enforce it. The decision comment acknowledges the chokepoint and actively prevents anything from being gated.

**Q3 — Safest sequencing to turn enforcement on**

The single highest risk is not turning enforcement on — it is turning it on with the wrong exclusion configuration and silently denying commands that running agents depend on. The sequencing below avoids that:

**Phase 0 — Warn-only mode (two weeks minimum).**  
Change `guardCommand()` to read a `MAESTRO_COMMAND_GATE` env var (default `off`). When set to `warn`, log to stderr: `[GATE:warn] would deny command=<name> session=<id> mode=<mode>` and return without throwing. Deploy. Run real sessions. Inspect PTY transcripts and JSONL logs for would-deny events. This produces a data-driven picture of what is actually used versus what the catalog says should be restricted, without breaking anything.

**Phase 1 — Fill in the exclusion maps from phase 0 data.**  
Populate `DEFAULT_EXCLUDED_COMMANDS_BY_MODE` and `HARD_BLOCKED_COMMANDS_BY_MODE` based on what the data shows should be restricted. Write tests for each entry. Do not fill in exclusions that the phase 0 logs show running agents are legitimately calling.

**Phase 2 — Flip to `enforce` for new sessions only.**  
Add a `commandGate: 'warn' | 'enforce'` field to `MaestroManifest` (defaulting to `warn`). New spawns get `enforce`; existing running sessions stay on `warn`. This prevents a mid-session gate flip from interrupting in-flight work.

**Phase 3 — Remove the `warn` fallback.**  
After two release cycles with no deny-related issues, make `enforce` the unconditional default and remove the env var branch.

The reason not to simply flip enforcement on today, despite the fact that it would deny almost nothing: as soon as anyone sets a real `commandPermissions` restriction on a TeamMember, they will expect it to work. The unsafety is not in the current-state flip but in the false confidence that the system is sound when it is not. Phase 0 surfaces that reality before it causes operational incidents.

---

### 2.3 TaskGraph has a status model but no execution engine — HIGH

**Files:**
- `maestro-server/src/api/taskGraphRoutes.ts:1–94` (94 lines total, no execute endpoint)
- `maestro-server/src/application/services/TaskGraphService.ts` (methods: `createGraph`, `getGraph`, `listGraphs`, `updateGraph`, `deleteGraph`, `validateGraph`, `getReadyNodes`, `computeParallelLayers`)

The type system carries `status: 'pending' | 'running' | 'completed' | 'cancelled'` and `executionSessionId?: string` on `TaskGraph`. `TaskGraphService.getReadyNodes()` and `computeParallelLayers()` correctly compute execution order from the DAG. But:

- No API route triggers execution (there is no `POST /task-graphs/:id/execute`).
- `executionSessionId` is never set by the server.
- `status: 'running'` can only be written via `PATCH /task-graphs/:id` — by manual external write.
- No service method ever calls `getReadyNodes()` or `computeParallelLayers()` to spawn sessions.

**User-visible symptom:** The UI lets users build dependency graphs and visualise them, but clicking any hypothetical "run" button would have no effect. The `running` status guard in `TaskGraphService.updateGraph()` (line 94) protects a state that is never reached by the system itself.

---

### 2.4 Gemini and Hermes sessions cannot be resumed — MEDIUM

**File:** `maestro-cli/src/commands/worker-resume.ts:98–100`

```typescript
// gemini/hermes have no native resume-by-id.
default:
  throw new Error(`Cannot resume '${agentTool}' because it has no provider-native resume-by-id contract`);
```

`AgentTool` includes `'gemini'`, `'hermes'`, `'kimi'`, and `'glm'` (defined in `maestro-server/src/types.ts`). These providers are first-class citizens in TeamMember spawn configuration. Yet when a Gemini or Hermes session terminates and the user tries to resume it, the CLI throws a hard error. There is no fallback to a fresh start (which would lose conversation history but at least be functional).

**User-visible symptom:** Any Gemini or Hermes session that stops — due to crash, timeout, or the user stopping it — is permanently irrecoverable through the normal resume flow. The session entry persists in the server but cannot be restarted.

---

### 2.5 Collab commands appear in every agent prompt but are unusable by default — MEDIUM

**File:** `maestro-cli/src/prompting/command-catalog.ts:34–43`

```typescript
{ id: 'collab:auth',          allowedModes: ALL_MODES },
{ id: 'collab:context',       allowedModes: ALL_MODES },
{ id: 'collab:space:list',    allowedModes: ALL_MODES },
{ id: 'collab:space:show',    allowedModes: ALL_MODES },
{ id: 'collab:channel:list',  allowedModes: ALL_MODES },
{ id: 'collab:message:list',  allowedModes: ALL_MODES },
{ id: 'collab:message:send',  allowedModes: ALL_MODES },
{ id: 'collab:invite:create', allowedModes: ALL_MODES },
{ id: 'collab:share',         allowedModes: ALL_MODES },
{ id: 'collab:pull',          allowedModes: ALL_MODES },
```

None of these entries have `hiddenFromPrompt: true`. This means collab commands appear in the rendered `commands_reference` block of every spawned agent's system prompt. But the actual commands are gated by:

```typescript
// maestro-cli/src/commands/collab.ts:18
if (process.env.MAESTRO_COLLAB_CLI_ENABLED !== 'true') throw new CollabError('COLLAB_DISABLED', '...');
```

`MAESTRO_COLLAB_CLI_ENABLED` is not injected by the spawn flow (`spawner-env.ts` does not set it), and it is not present in any manifest or default env block. Agents see these commands in their capability summary, try them, and receive a `COLLAB_DISABLED` error.

**User-visible symptom:** Agents waste turns attempting collab operations that cannot succeed. The `capability_summary` block in every system prompt says `canUseSpells: true` and lists collab commands — implying they work.

---

### 2.6 `maestro coordinator enable` doesn't affect the live agent's command surface — MEDIUM

**File:** `maestro-server/src/api/sessionRoutes.ts:942–1029`

The `/mode` endpoint (`POST /api/sessions/:id/mode { role: 'coordinator' }`) updates the server-side session mode and calls `regenerateManifestForMode()` to rewrite the on-disk manifest JSON. But the running agent process loaded its manifest at spawn time into a module-level singleton. The CLI's `getOrLoadPermissions()` (`command-permissions.ts`) is cached for the session lifetime. A live agent that calls `maestro coordinator enable` will:

1. Successfully change the server record.
2. See the updated on-disk manifest (if it reads the file again).
3. But NOT get an updated command surface in its running Claude session — the `commands_reference` block injected into Claude's context at spawn time is immutable.

**User-visible symptom:** The documented pattern "a worker that wants to dynamically enable coordinator capabilities" (from `02-cli-agentic.md §6.2`) does not work for an already-running agent. The agent must stop and be re-spawned to receive coordinator capabilities in its prompt.

---

### 2.7 Mobile push notifications are wired in code but never deployed — MEDIUM

**File:** `maestro-gateway/src/collabFcm.ts` (entire file, ~80 lines)

The header of this file reads:
```
// NOT IMPORTED BY index.ts YET — wiring instructions are documented at the top of the file.
```

`sendMobilePushToRecipients()` and its FCM payload builders exist and appear correct, but `functions/src/index.ts` does not import this module. The `fanoutMessageNotification` Cloud Function at `functions/src/index.ts` sends Web Push (desktop) notifications only. Mobile users receive zero push notifications for Collab messages.

**User-visible symptom:** Mobile app users (maestro-mobile) never receive push notifications for new messages in Collab Spaces, despite the feature being described in architecture docs and the notification profile UI being present.

---

### 2.8 `collab message watch` polls at 2-second intervals instead of streaming — LOW

**File:** `maestro-cli/src/commands/collab.ts:187–196`

```typescript
message.command('watch').action(guarded(async (options) => {
  // ...
  while (true) {
    // ... fetch messages via Firestore REST
    await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
  }
}));
```

Every other realtime channel in Maestro uses WebSocket streaming (entity-sync bridge, PTY channel, Firestore onSnapshot in the UI). The `collab message watch` command instead busy-polls the Firestore REST API every 2 seconds. This is inconsistent with the architecture and means agents watching for messages will see up to 2-second delay and produce unnecessary API calls during quiescent periods.

---

### 2.9 Spawn-failure ghost sessions — LOW-MEDIUM

**File:** `maestro-server/src/application/services/SessionService.ts:78–86` and `maestro-server/src/api/sessionRoutes.ts` (spawn handler)

Session creation at spawn time passes `_suppressCreatedEvent: true` to defer the `session:created` WebSocket broadcast until after PTY setup and manifest generation. If manifest generation fails (60-second timeout, `generateManifestViaCLI()`), the session file exists on disk but `session:created` is never emitted. The UI never discovers the session. These orphaned session records accumulate silently.

**User-visible symptom:** If a spawn fails mid-flight (manifest timeout, CLI path error, etc.), the server holds a session record that no client ever sees. The `GET /api/sessions` endpoint will return it, but the UI never observes it because the WebSocket event was suppressed.

---

## 3. Stuck-Task Verdict

**Question:** Are the 19 in-progress tasks whose sessions completed a product defect, a prompt defect, or expected behaviour?

**Verdict: Product defect.** Specifically, a missing code path in `SessionService.updateSession()`.

**Evidence:**

The mechanism by which a task could auto-advance to `completed` would require code equivalent to:

```typescript
// This code does NOT exist anywhere in the codebase
const allSessions = task.taskSessionStatuses ?? {};
if (Object.values(allSessions).every(s => s === 'completed')) {
  await this.taskRepo.update(taskId, { status: 'completed', completedAt: Date.now() });
}
```

No such aggregation exists in `SessionService`, `TaskService`, or any hook. The only path by which `task.status` changes after spawn is a direct `PATCH /api/tasks/:id` call (from the CLI's `task update` command or the UI). There is no automatic propagation.

**Why this is not a prompt defect:** The prompt does instruct workers to call `maestro task report complete <taskId>`. A disciplined agent will do this. But there is no fallback: if the agent stops (crash, timeout, or Stop hook not calling `session complete`) without calling the task report command, the task is permanently stuck. The platform has no recovery mechanism. Even in well-behaved sessions where the CLI hook does fire `session complete`, that hook updates `session.status`, not `task.status`.

**Why this is not expected behaviour:** The type system carries `Task.completedAt` and `Task.startedAt` timestamps; a design where completion is exclusively manual would not need a computed `completedAt` field. The `TaskSessionStatus` sub-map itself exists precisely to support aggregate status derivation — the infrastructure for the fix is already there.

**Confirmed from runtime data:**
- `.maestro/data/tasks/`: 12 tasks stuck in `in_progress`. Python verification script confirmed every referenced session is in `completed` or `stopped` state.
- `hub/` (multi-user gateway): 42 tasks stuck in `in_progress`. 41 of 42 have all sessions terminal; 1 has an active session.

The exact count ("19") cited in the coordinator directive likely refers to a specific project or point in time. The confirmed total across all observed environments is 54.

---

## 4. Prioritized Fix List

Ranked by user impact divided by implementation effort. "First step" means the single most important change to make — not a full specification.

| Rank | Issue | Impact | Effort | First Step |
|---|---|---|---|---|
| 1 | **Task status auto-propagation** | Critical | Low (30 lines) | In `SessionService.updateSession()` after `taskSessionStatuses` update: check if all values are terminal; if so, set `task.status = 'completed'` and `task.completedAt = Date.now()`. |
| 2 | **CI test gate** | High | Trivial (5 lines) | Add `run: cd maestro-server && bun run test` step to `.github/workflows/release.yml` before the build matrix. |
| 3 | **Collab commands hidden from prompt** | Medium | Low (10 lines) | Add `hiddenFromPrompt: true` to the 10 collab entries in `command-catalog.ts:34–43`. They should only appear if/when the user explicitly opts in via env var. |
| 4 | **TaskGraph execution stub** | High | High | Either (a) add a `POST /task-graphs/:id/execute` route that calls `getReadyNodes()` and spawns sessions sequentially, or (b) add `@deprecated` JSDoc to the status fields and remove them from the type to be honest about the feature's state. |
| 5 | **Coverage thresholds** | Medium | Low | Add `coverageThreshold: { global: { lines: 70 } }` to `maestro-server/jest.config.ts` and fail CI if breached. |
| 6 | **Gemini/Hermes resume fallback** | Medium | Medium | In `worker-resume.ts` default case: instead of throwing, fall back to `spawner.spawn(manifest, sessionId)` (fresh start) and log a warning that conversation history is lost. |
| 7 | **`coordinator enable` prompt update** | Medium | Medium | After mode flip succeeds, emit `session:prompt_send` to the running agent with a system note summarising the new coordinator command surface. This is a prompt injection, not a full re-spawn. |
| 8 | **Wire `collabFcm.ts`** | Medium | Low | Import `sendMobilePushToRecipients` in `functions/src/index.ts` and call it from `fanoutMessageNotification` after the web-push block. The infrastructure is already built. |
| 9 | **Docs navigation index** | Medium | Low | Create `docs/README.md` that separates design docs (historical, reference-only) from active architecture docs and active implementation guides. |
| 10 | **`collab message watch` streaming** | Low | Medium | Replace the `setTimeout` poll loop with Firestore `onSnapshot` using the Firebase REST streaming API or the JS SDK's `onSnapshot()`. The CLI already uses Firebase REST for other operations. |

---

## 5. Reproduced In This Session

This report was written by a coordinated-worker agent (sess_1785357400954_fon8dth25) assigned to task `task_1785357259877_cqwsy0prk`. Upon completing the analysis, the agent called both `maestro task report complete` and `maestro session report complete`, then went idle. The session reached `completed` status. The task remained in `in_progress`. A sibling worker (sess_1785357318695_2vq7m386t) exhibited the identical outcome minutes earlier. The coordinator had to interrupt both agents to close the loop manually.

This is the same failure signature as the 54 pre-existing stuck tasks documented in §3.

### Exact mechanism

**Step 1 — Agent calls `maestro task report complete <taskId> "<summary>"`**

`maestro-cli/src/commands/task.ts:554–558`:
```typescript
await api.patch(`/api/tasks/${taskId}`, {
  sessionStatus: 'completed',
  updateSource: 'session',
  sessionId,
});
```

This sends `PATCH /api/tasks/:id { sessionStatus: 'completed' }`, which the server handles by writing `task.taskSessionStatuses[sessionId] = 'completed'`. It does **not** touch `task.status`.

**Step 2 — Agent calls `maestro session report complete "<summary>"`**

`maestro-cli/src/commands/report.ts:53–56`:
```typescript
if (subcommand === 'complete') {
  await api.patch(`/api/sessions/${sessionId}`, { status: 'completed' });
}
```

This sets `session.status = 'completed'`. `SessionService.updateSession()` at lines 144–167 then writes `task.taskSessionStatuses[sessionId] = 'completed'` — identical to what step 1 already did. `task.status` is still never touched.

**Result:** Task stays `in_progress`. Session is `completed`. The task appears to have active work in flight when nothing is running.

### What the identity instruction says

`maestro-cli/src/prompts/identity.ts:28`:
```
'When all assigned tasks are complete, finalize the session by running `maestro session report complete "<summary>"`.'
```

`maestro-cli/src/prompts/identity.ts:92` (coordinated-worker variant):
```
'When all assigned work is done, finalize the session by running `maestro session report complete "<summary>"`.'
```

Neither instruction mentions `maestro task complete <taskId>`. A compliant agent following the identity instruction exactly will call `session report complete` but never `task complete`. The gap in the prompt explains why every well-behaved worker still leaves tasks stuck.

### The command that would actually close the loop

`maestro task complete <taskId>` (`maestro-cli/src/commands/task.ts:372`):
```typescript
await api.patch(`/api/tasks/${taskId}`, { status: 'completed' });
```

This is the only CLI command that writes `task.status = 'completed'`. It exists. It works. It is not mentioned in either the worker or coordinated-worker identity instruction.

### Where the server-side fix should live

Even if every agent called `maestro task complete`, a crash, timeout, or Stop hook that exits before that call is made would produce a stuck task. The server-side fix is in `SessionService.updateSession()` at `maestro-server/src/application/services/SessionService.ts:155–160`. After the existing `taskSessionStatuses` write, aggregate: if all values are terminal, set `task.status = 'completed'`.

### Two independent gaps, same symptom

| Gap | Location | Fix |
|---|---|---|
| Prompt omits `maestro task complete` | `identity.ts:28` and `identity.ts:92` | Add "call `maestro task complete <taskId>`" before `session report complete` in both instructions |
| Server never aggregates `taskSessionStatuses` to `task.status` | `SessionService.ts:144–167` | After writing `taskSessionStatuses`, check if all values terminal → set `task.status` |

Either fix alone reduces the failure rate. Both fixes together are required for reliability: the prompt fix handles the case where no crash occurs; the server fix handles crashes and any other path that skips the CLI call.

---

## 6. What Could Not Be Verified

| Item | Reason |
|---|---|
| **Tauri UI feature flags and `redesign/` component activation** | Cannot run the Tauri app in this environment. Could not verify which feature flags are checked at runtime and whether `redesign/` components are reachable in any UI path. |
| **Gateway Phase 2 Firebase auth in production** | `MAESTRO_GATEWAY_AUTH=dev` is the default and no Firebase credentials are present in this environment. Cannot confirm Firebase token verification works end-to-end. |
| **PTY scrollback snapshot accuracy** | The `TerminalStateMirror` headless-xterm snapshot path (gap > 0 replay) requires a real PTY process and is tested only by isolated unit tests (`terminal-state-mirror.test.ts`). Cross-session snapshot correctness with real agent output was not verified. |
| **Alexa/VoiceMonkey integration** | `VM_TOKEN` is not configured. The `POST /api/alexa/utterance` and `POST /api/announce` routes were inspected but not invoked. |
| **Mobile app (maestro-mobile) end-to-end** | No Expo/React Native environment. Cannot verify `PtyTransport` WebView bridge, Firebase push delivery, or `EntitySyncClient` reconnect logic under real network conditions. |
| **Windows-specific spawn path** | `spawnWithUlimit()` has a Windows branch (`.cmd` shim resolution, no `exec`). Cannot test on Windows. |
| **Spell `run-command` binary allowlist enforcement** | `MAESTRO_SPELL_CMD_ALLOWLIST` was not set during inspection. Tests exist but were not run against live spell dispatch. |
| **`loop-graph-harness-audit.md`** | This file did not exist at inspection time; the worker writing it had not completed. |

---

*Report written by: Platform Self-Critique Worker (sess_1785357400954_fon8dth25)*  
*Branch: `integrate/msg-pipeline-to-main`*  
*Date: 2026-07-29*
