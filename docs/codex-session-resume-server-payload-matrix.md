# Codex Session Resume — Server Payload & Parameter-Preservation Matrix

**Task:** `task_1783966665915_t9zvrwmtn` — Audit server resume payload and parameter preservation
**Package:** `maestro-server` (server-owned fix only; CLI/UI changes tracked separately on the same branch)
**Branch/worktree:** `fix/codex-session-resume` @ `.claude/worktrees/codex-session-resume`

---

## 1. Root cause (one line, file:line)

`maestro-server/src/api/sessionRoutes.ts` resume route:

1. **Hard block** — every `agentTool !== 'claude-code'` returned `400 agent_tool_not_resumable`
   (original **L2318**), so Codex could never resume at all.
2. **Wrong native id** — the route **unconditionally** minted `claudeSessionId = randomUUID()`
   (original **L2310**) and forwarded it as `MAESTRO_CLAUDE_SESSION_ID` in the resume env for
   *all* providers (original **L2434**). Even with the gate removed, a Codex resume would carry a
   Claude-only UUID that Codex never used, so `codex resume <id>` would target a non-existent thread.

The Codex native id is **not** server-mintable: it is the rollout's `session_meta.payload.id`,
assigned by Codex itself and only present once Codex has written a rollout file.

---

## 2. Field matrix — spawn (authoritative) vs. resume (before → after)

Legend: **P** = persisted on Session, **E** = passed in launch env, **V** = in `session:spawn`/`session:resume` event.

| Field | Fresh spawn (source of truth) | Resume BEFORE (bug) | Resume AFTER (fix) | Intent |
|---|---|---|---|---|
| `taskIds` | from request → Session.taskIds (P,V) | `session.taskIds` (P,V) | unchanged | **preserved** |
| `agentTool` | `agentToolForProvider(launchConfig.provider)` → `metadata.agentTool` (P) | read only for the 400 gate | read for gate + branch; **now in env `MAESTRO_AGENT_TOOL`** (E) + event `agentTool` (V) | **preserved + newly propagated** |
| `launchConfig` (provider/model) | request → `metadata.launchConfig` (P) | re-read from `metadata.launchConfig`, model re-resolved | unchanged | **intentionally recomputed** (manifest regen) |
| Claude native id | `randomUUID()` pre-seeded → `--session-id` (P: `claudeSessionId`, E) | re-minted if missing; **always** put in env | Claude branch only: mint-if-missing + env; **removed from Codex env** | **preserved for Claude; correctly withheld from Codex** |
| Codex native id | *not mintable* — Codex writes `session_meta.payload.id` into rollout | **never captured → LOST** | recovered via `LogDigestService.resolveCodexSessionId` (rollout `sess_` marker lookup), cached to `metadata.codexSessionId`, set as `MAESTRO_CODEX_SESSION_ID` **only when proven** | **was accidentally lost; now recovered or safely omitted** |
| `workingDir`/`cwd` | `worktreePath || project.workingDir` (P) | same | unchanged | **preserved** |
| manifest / `MAESTRO_MANIFEST_PATH` | generated at spawn | regenerated (fresh file) | unchanged | **intentionally recomputed** |
| permission flags | request → `metadata` (P) | `resumePermissionMode` → `MAESTRO_PERMISSION_MODE` | unchanged | **preserved** |
| env (`DATA_DIR`, `SESSION_DIR`, `MAESTRO_SERVER_URL`, auth, worktree, PATH, `MAESTRO_CLI_PATH`) | built at spawn | rebuilt (`...session.env` + refreshed dynamics) | unchanged | **intentionally recomputed** |
| subcommand | `init` (worker/orchestrator) | `resume` iff `hadClaudeSessionId` else `init` | **`resume` for Codex OR `hadClaudeSessionId`**, else `init` | **fixed for Codex** |
| response body | n/a | `{ claudeSessionId }` always | `{ agentTool, codexSessionId? | claudeSessionId? }` provider-aware | **honest echo** |

**Intentionally recomputed** (correct): launchConfig re-read, manifest regen, dynamic env, CLI-path
resolution — resume rebuilds these by design.
**Accidentally lost** (fixed): the Codex native thread id was never captured, and the Claude UUID was
leaked to non-Claude providers.

---

## 3. The fix (server-owned), by file:line (post-change)

**`maestro-server/src/api/sessionRoutes.ts`** (resume route):
- L2308–2320 — gate relaxed to `RESUMABLE_AGENT_TOOLS = ['claude-code','codex']`; `isCodex` flag.
- L2346–2385 — provider-aware native-id branch (after cwd + CLI-path guard):
  - Codex: use `metadata.codexSessionId`, else `logDigestService.resolveCodexSessionId(session.id, cwd)`
    and cache to `metadata.codexSessionId`; `console.warn` fallback when unrecoverable (never fabricates).
  - Claude: mint `claudeSessionId` when missing (unchanged behavior).
- L2468 — `subcommand = isCodex || hadClaudeSessionId ? 'resume' : 'init'`.
- L2475–2500 — env: `MAESTRO_AGENT_TOOL` always; Codex deletes `MAESTRO_CLAUDE_SESSION_ID` and sets
  `MAESTRO_CODEX_SESSION_ID` only when resolved; Claude keeps `MAESTRO_CLAUDE_SESSION_ID`.
- L2549 — `session:resume` event carries `agentTool`.
- L2560–2568 — response echoes `agentTool` + only the applicable native id.

**`maestro-server/src/application/services/LogDigestService.ts`**:
- L102 — pure `extractCodexSessionIdFromRolloutHead(head)` (parses `session_meta.payload.id`).
- L503 — `async resolveCodexSessionId(sessionId, workingDir)` reuses `resolveJsonlPath` (same `sess_`
  rollout lookup as digests) + `readHead(1MB)` + the pure parser. Returns `null` if no rollout yet.

**`maestro-server/src/types.ts`**:
- L1122 — `SpawnRequestEvent.agentTool?: AgentTool` (optional; set on resume).

---

## 4. Tests & typecheck

- **RED captured first** — before the fix, the 4 route contract assertions failed exactly as designed
  (Codex → 400; Claude event `agentTool` undefined).
- **Focused GREEN** — `jest session-resume-provider --runInBand --forceExit`: **13/13 passed**
  (3 pure-parser unit tests + 3 eager-capture unit tests + 7 route-contract tests incl. Codex-not-blocked,
  forwards-real-id, omits-id-on-fresh-start, Claude regression guard, gemini-still-400).
- **Full server suite** — `bun run test`: **39 suites, 349 passed + 8 todo / 357, 0 failed.**
- **Typecheck** — `bunx tsc --noEmit`: **exit 0, clean.**
- New file: `maestro-server/test/session-resume-provider.test.ts`.

> Note: two Codex route tests take ~3s each because `resolveCodexSessionId` performs the *real*
> `~/.codex/sessions` + `~/.claude/projects` rollout scan (only `child_process.spawn` is mocked) and
> correctly returns `null` → fresh-start. `--forceExit` is used only to sidestep the FileSystem-repo
> open-handle lingering (a test-infra artifact); the RED run proved there is no hang.

---

## 5. No-id behavior (fresh-start, no `--last`)

The native Codex id is captured **eagerly** while the session is alive:
`LogDigestService.captureCodexSessionId` fires whenever `resolveJsonlPath` locates the rollout (every
digest/stats poll), persisting `session_meta.payload.id` to `metadata.codexSessionId` (write-once).
The resume route's on-demand `resolveCodexSessionId` scan is the backstop.

When no id can still be recovered (no persisted `metadata.codexSessionId` and the injected `sess_`
marker matches no rollout under `~/.codex/sessions` — e.g. the session died before Codex flushed its
first rollout), the server:
- **omits** `MAESTRO_CODEX_SESSION_ID` (never fabricates a UUID),
- emits `console.warn`: `[resume] No Codex rollout id for session <id>; CLI will fresh-start with full
  context (no --last guess).`

The CLI then **fresh-starts with full context** (system prompt + task + env re-injected under the same
session id) — deliberately **not** `codex resume --last`, which could resume the wrong thread.

---

## 6. Cross-package contract (CLI)

`maestro-cli` `worker-resume` branches on the server contract:
- `MAESTRO_AGENT_TOOL=codex` with `MAESTRO_CODEX_SESSION_ID` set → `codex resume [opts]
  -c developer_instructions=<sys> "$MAESTRO_CODEX_SESSION_ID"`. With **no** id →
  `resolveResumeInvocation` returns `null` → fresh start (no `--last`).
- `MAESTRO_AGENT_TOOL=claude-code` (or unset) → `claude … --append-system-prompt <sys>
  --resume "$MAESTRO_CLAUDE_SESSION_ID"`.
- Must **not** read `MAESTRO_CLAUDE_SESSION_ID` for a Codex run (server no longer sets it).

---

## 7. Known risks

- **Wrong-thread resume is structurally prevented** — the `--last` fallback was removed entirely, so a
  resume runs only against a positively-captured native id; otherwise it fresh-starts. Eager capture
  keeps the id available almost always.
- **Rollout-scan latency** — `resolveCodexSessionId` scans `~/.codex/sessions` on a cache miss; the
  60s path cache in `LogDigestService` amortizes repeat resumes, and the recovered id is persisted to
  `metadata.codexSessionId` (eagerly, and at resume) so subsequent resumes skip the scan entirely.
- **First resume before Codex flushes a rollout** returns `null` → fresh start with full context
  (expected; the agent relaunches with its tasks and Maestro context under the same session id).
