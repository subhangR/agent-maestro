# Loop, Graph, and Harness Engine Audit

**Date:** 2026-07-29  
**Branch:** integrate/msg-pipeline-to-main  
**Author:** Automated audit session

---

## Executive Summary

This audit covers three engines:
1. **Loop Engine** — SpellService + HookDispatcherService loop mechanics
2. **Graph Engine** — TaskGraphService DAG execution
3. **Harness Engine** — Session/worker lifecycle, task status propagation

**Root cause of the 19 stuck `in_progress` tasks**: `worker-init.ts` auto-sets `task.status = 'in_progress'` at session start, but nothing ever auto-advances it to `completed` when all sessions finish. Sessions completing via `maestro session report complete` only updates `session.status` and `task.taskSessionStatuses[sessionId]`, leaving `task.status` permanently at `in_progress`. This is fixed in this session.

---

## HARNESS ENGINE FINDINGS

### H1 — CRITICAL: `task.status` stuck `in_progress` after all sessions complete

**Files:**
- `maestro-cli/src/commands/worker-init.ts:123–125` — sets `task.status = 'in_progress'` at session start  
- `maestro-server/src/application/services/SessionService.ts:145–167` — on session terminal, updates only `taskSessionStatuses`, not `task.status`
- `maestro-cli/src/commands/report.ts:54–58` — `maestro session report complete` sets `session.status = 'completed'` only

**Severity:** CRITICAL

**Description:**  
At worker-init, line 125: `api.patch('/api/tasks/${task.id}', { status: 'in_progress' })` — task status promoted to `in_progress`.

When `maestro session report complete` runs:
1. `POST /api/sessions/{id}/timeline` (adds a `task_completed` timeline event)
2. `PATCH /api/sessions/{id}` with `{status: 'completed'}`

`SessionService.updateSession()` at lines 145–167 propagates terminal session status to `task.taskSessionStatuses[sessionId] = 'completed'` — but never touches `task.status`. So `task.status` stays `in_progress` forever.

There is no reconciliation path: no event, no job, no hook that checks "all sessions for this task have completed, advance task.status."

**Evidence:** 19 tasks currently stuck at `in_progress` with all their sessions at `completed` status.

**Proposed Fix (implemented):**  
In `SessionService.updateSession()`, after updating `taskSessionStatuses`, check if all sessions in `task.sessionIds` have terminal entries in `taskSessionStatuses`. If yes and `task.status === 'in_progress'`, auto-advance `task.status` to `completed` (all completed) or `failed` (any failed).

---

### H2 — HIGH: `deactivateSpell` not serialized — concurrent write race on `activeSpells`

**File:** `maestro-server/src/application/services/SpellService.ts:1131–1155`

**Severity:** HIGH

**Description:**  
Every other mutation of `session.activeSpells` is wrapped in `withSessionLock`:
- `activateSpell` (line 1047): uses `withSessionLock`
- `toggleSpell` (line 994): uses `withSessionLock`
- `resetLoop` (line 1170): uses `withSessionLock`
- `cleanupDeletedSpellFromSessions` (line 968): uses `withSessionLock`

But `deactivateSpell` (lines 1140–1144) does a raw read-modify-write without any lock:
```typescript
const session = await this.sessionRepo.findById(sessionId);
const nextActive = (session.activeSpells ?? []).filter(a => a.spellId !== spellId);
await this.sessionRepo.update(sessionId, { activeSpells: nextActive });
```

If a concurrent `activateSpell` (for a different spell) interleaves between the read and the write, the newly activated spell would be silently dropped from `activeSpells`.

**Proposed Fix (implemented):**  
Wrap the per-session update block inside `withSessionLock`.

---

### H3 — MEDIUM: Agent process exit never auto-marks session as `stopped`

**File:** `maestro-cli/src/commands/worker-init.ts:195–197`

**Severity:** MEDIUM

**Description:**  
The agent process `on('exit')` handler is a no-op:
```typescript
spawnResult.process.on('exit', async (code) => {
  // Silent exit
});
```

If the agent exits without calling `maestro session report complete` (crash, OOM, token exhaustion, user SIGINT), the session stays at `working` or `idle` indefinitely. These sessions never reach a terminal state, and their tasks are never auto-advanced (even with the H1 fix, because there will always be a session in non-terminal state).

**Proposed Fix (implemented):**  
On process exit, issue `PATCH /api/sessions/{sessionId}` with `{ status: 'stopped' }` unless the process exited cleanly (code=0). The server-side guard in `SessionService.updateSession()` prevents overwriting `completed` with `stopped`.

---

### H4 — MEDIUM: No reconciliation path for already-stuck `in_progress` tasks (IMPLEMENTED)

**Files:**
- `maestro-server/src/application/services/SessionService.ts` — `reconcileStuckTasks()` + `tryAutoAdvanceTask()`
- `maestro-server/src/api/taskRoutes.ts` — `POST /api/tasks/reconcile-stuck`

**Severity:** MEDIUM (54 tasks confirmed stuck across audit of `.maestro` and `hub` data dirs)

**Description:**  
H1 fixed the forward path but the 54 tasks already stuck at `in_progress` with all sessions terminal remained stuck. No startup reconciliation existed.

**Fix implemented:**
- Extracted the H1 inline auto-advance logic into `tryAutoAdvanceTask(taskId)` — one shared private method called by both the live H1 path (`updateSession`) and the H4 reconciliation sweep, so they cannot drift apart.
- Added `reconcileStuckTasks({ dryRun?: boolean })` — scans all `in_progress` tasks, checks whether all `sessionIds` have terminal `taskSessionStatuses`, and advances them using `tryAutoAdvanceTask`. Defaults to **dry-run** (reports what would change, never mutates) to give the operator control before applying.
- Exposed as `POST /api/tasks/reconcile-stuck` (query `?dryRun=false` or body `{ dryRun: false }` to apply). NOT called on startup.

---

### H5 — HIGH: `maestro task report complete` does NOT complete the task — misleading name causes stuck tasks (IMPLEMENTED)

**Files:**
- `maestro-cli/src/commands/task.ts:538–568` — `taskReport complete` handler
- `maestro-cli/src/prompts/identity.ts:28` — `WORKER_IDENTITY_INSTRUCTION` finalization
- `maestro-cli/src/prompts/identity.ts:92` — `COORDINATED_WORKER_IDENTITY_INSTRUCTION` finalization

**Severity:** HIGH

**Description:**  
`maestro task report complete <taskId>` only PATCHes `/api/tasks/:id` with `{ sessionStatus: 'completed', updateSource: 'session', sessionId }`, which writes to `task.taskSessionStatuses[sessionId]` — it never touches `task.status`. The task stays `in_progress`.

`maestro task complete <taskId>` is the command that actually sets `task.status = 'completed'`. These two commands have names that strongly imply equivalent finality but behave very differently.

**Empirical confirmation:** Reproduced live on the coordinator task tree — nine of nine child tasks remained `in_progress` after all workers called `maestro task report complete`.

The identity prompt at both line 28 and line 92 instructs agents to finalize with `maestro session report complete` only, mentioning `maestro task {report,complete,blocked}` for milestones without clarifying which command actually closes the task. A fully-obedient agent following these instructions leaves every task open.

**Fix implemented:**
- `maestro-cli/src/commands/task.ts:539` — updated description from `'Report task completion (does NOT complete session)'` to `'Record this session\'s contribution to a task (does NOT complete the task or session — use \`task complete <taskId>\` to close the task)'`
- `maestro-cli/src/prompts/identity.ts:28` (`WORKER_IDENTITY_INSTRUCTION`) — finalization instruction now names `maestro task complete <taskId>` as the command that closes the task, distinguishes it from `maestro task report complete`, and notes that multi-session tasks must not be unilaterally closed.
- `maestro-cli/src/prompts/identity.ts:92` (`COORDINATED_WORKER_IDENTITY_INSTRUCTION`) — same fix applied.

---

## LOOP ENGINE FINDINGS

### L1 — MEDIUM: Loop counter preserved on re-activation — exhausted loops don't restart

**File:** `maestro-server/src/application/services/SpellService.ts:1054–1057`

**Severity:** MEDIUM

**Description:**  
`activateSpell()` preserves existing `ruleIterations` from prior activations for any rule IDs that still exist:
```typescript
for (const [ruleId, count] of Object.entries(prior?.ruleIterations ?? {})) {
  if (validRuleIds.has(ruleId)) ruleIterations[ruleId] = count;
}
```

If a loop ran to exhaustion (5/5 iterations), was deactivated, then reactivated, the counter still shows 5/5 — the loop is immediately exhausted with no iterations available. The agent must know to call `maestro spell reset-loop` explicitly. This is commented as intentional (F8) but is not communicated to the agent in the system prompt.

**Proposed Fix:**  
Add a `resetOnReactivate: boolean` option to `activateSpell`. Default false (preserves backward compat). When true, always clear `ruleIterations`. Alternatively, document in system prompt that reactivating a spell does NOT reset its loop counter.

**Not implemented** — behavior is documented as intentional in source comments.

---

### L2 — MEDIUM: `continue-loop` action on non-Stop events silently downgrades to stdout hint

**File:** `maestro-server/src/application/services/HookDispatcherService.ts:672–683`

**Severity:** MEDIUM

**Description:**  
`composeResult()` only emits `exitCode: 2` (the signal that makes Claude re-enter the loop) on `Stop` and `SubagentStop` events:
```typescript
const isStopEvent = event === 'Stop' || event === 'SubagentStop';
if (continuing.length > 0 && isStopEvent) {
  // → exitCode 2 (loop continues)
}
// Otherwise:
return { exitCode: 0, stdout, ... continued: false }
```

If a `continue-loop` rule fires on e.g. `PreToolUse`, the outcome includes `continue: true` but the final result has `exitCode: 0` and `continued: false`. The loop does NOT actually continue — the stdout hint is returned but Claude won't re-enter. No warning is logged.

**Proposed Fix:**  
In `dryRunRule` for `continue-loop`, include a note in `report.skipReason` when the event is not Stop/SubagentStop. Or, in `dispatchLocked`, warn when a `continue-loop` rule fires on a non-Stop event.

**Not implemented** — fixing this requires clarifying intended behavior with the team.

---

### L3 — LOW: No server-side cap on `maxIterations` (potential DoS via long-running loops)

**File:** `maestro-server/src/application/services/HookDispatcherService.ts:304`

**Severity:** LOW

**Description:**  
```typescript
const cap = Math.max(1, action.maxIterations ?? 1);
```

No upper bound. A spell with `maxIterations: 10000` would loop 10000 times before stopping. While each iteration requires a full Claude turn, this could tie up a session for hours.

**Proposed Fix:**  
Add a server-side constant `MAX_LOOP_ITERATIONS = 100` and clamp: `const cap = Math.min(MAX_LOOP_ITERATIONS, Math.max(1, action.maxIterations ?? 1))`.

**Not implemented** — requires product decision on acceptable cap.

---

## GRAPH ENGINE FINDINGS

> **Note:** Per task scope, TaskGraphService.ts was NOT modified. Findings only.

### G1 — MEDIUM: Failed upstream tasks silently block downstream nodes forever

**File:** `maestro-server/src/application/services/TaskGraphService.ts:201–219`

**Severity:** MEDIUM

**Description:**  
`getReadyNodes()` takes a `completedTaskIds` Set and marks tasks ready when all upstream deps are complete. There is no `failedTaskIds` concept. If an upstream task fails (not in `completedTaskIds`), downstream tasks waiting on it will never appear in `ready` — they just hang.

No mechanism exists to:
- Detect that an upstream task has failed
- Mark downstream tasks as `blocked` or `cancelled`
- Stop the orchestrator from waiting forever

**Proposed Fix:**  
Add `failedTaskIds?: Set<string>` to `getReadyNodes()`. Return a `blockedNodes: string[]` alongside `ready`. When an upstream dep is in `failedTaskIds`, mark the downstream task as blocked/cancelled rather than just "not ready."

---

### G2 — LOW: Non-deterministic topological sort order within a layer

**File:** `maestro-server/src/application/services/TaskGraphService.ts:228–259`

**Severity:** LOW

**Description:**  
Kahn's algorithm processes zero-in-degree nodes in insertion order. For the same graph, the topological order may differ between runs (e.g., after server restart if data is loaded in different order). This makes parallel execution non-deterministic and tests fragile.

**Proposed Fix:**  
Sort the initial queue: `for (const [id, degree] of [...inDegree].sort((a, b) => a[0].localeCompare(b[0]))) {`

---

### G3 — LOW: `topologicalSort` and `computeParallelLayers` both reconstruct the in-degree graph

**File:** `maestro-server/src/application/services/TaskGraphService.ts:228–349`

**Severity:** LOW

**Description:**  
Both methods independently build `inDegree` and `adjacency` from `edges`. These should be unified into one private helper that returns both the topological order and the layers in a single pass.

**Proposed Fix:**  
Extract `buildDependencyGraph(nodeIds, edges)` returning `{inDegree, adjacency}`. Both `topologicalSort` and `computeParallelLayers` call it.

---

## Implementation Summary

### Implemented in this session

| ID | Severity | File | Change |
|----|----------|------|--------|
| H1 | CRITICAL | SessionService.ts | Auto-advance task.status when all sessions reach terminal state |
| H2 | HIGH | SpellService.ts | Serialize deactivateSpell with withSessionLock |
| H3 | MEDIUM | worker-init.ts | Auto-mark session stopped on agent process exit |

### Tests added

- `maestro-server/test/harness-task-auto-complete.test.ts` — H1 coverage
- `maestro-server/test/harness-deactivate-serialized.test.ts` — H2 coverage
- `maestro-server/test/loop-continue-loop.test.ts` — Loop engine coverage

### Graph findings (deferred — TaskGraphService.ts owned by another worker)

G1, G2, G3 documented above. Highest priority is G1 (failed upstream blocking). Recommend implementing after task graph worker completes their work.
