# Codex Session Resume Contract (maestro-cli)

**Task:** `task_1783966619940_3p91bxq8j` — Verify and fix Codex session resume contract
**Branch:** `fix/codex-session-resume` · **Owner:** CLI Specialist
**Runtime evidence:** `codex-cli 0.144.1` (`/Users/bhargavveepuri/.bun/bin/codex`)

---

## 1. Official / live Codex resume command + parameters

Codex exposes resume through a **subcommand**, not a flag. There is **no `--resume` and no
`--session-id`** on any Codex surface (verified against `codex --help`, `codex resume --help`,
`codex exec --help`, `codex exec resume --help`).

| Surface | Usage (from live `--help`) | Interactive? |
|---|---|---|
| Interactive resume | `codex resume [OPTIONS] [SESSION_ID] [PROMPT]` | Yes (TUI) |
| Non-interactive resume | `codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]` | No (`--json`, `-o`) |

- `SESSION_ID` — "Session id (UUID) or session name. UUIDs take precedence if it parses." Maestro
  **always** passes a positively-captured id here; it never omits it to lean on `--last` (see §4).
- `--last` — "Continue the most recent session" / "without showing the picker". **Deliberately unused
  by Maestro** — it is CWD-scoped and can resume the wrong thread (see §4).
- `--all` — "Show all sessions (**disables cwd filtering**)." ⇒ **default resume is CWD-scoped.**
- Launch-config options valid on `codex resume`: `-m/--model`, `-s/--sandbox {read-only,workspace-write,danger-full-access}`,
  `-a/--ask-for-approval {untrusted,on-request,never}`, `-c key=value`, `-C/--cd <DIR>`,
  `--dangerously-bypass-approvals-and-sandbox`.

**Source (official manual):** the openai-docs helper
`/Users/bhargavveepuri/.codex/vendor_imports/skills/skills/.curated/openai-docs/scripts/fetch-codex-manual.mjs`
(the path in the directive, `~/.codex/skills/.system/openai-docs/...`, does **not** exist) fails in this
environment with `ManualFetchError: Manual response is missing x-content-sha256` (network integrity
check), so the authoritative evidence here is the **installed CLI help for 0.144.1**, which is the
runtime that actually launches. `codex resume --help` heading: *"Resume a previous interactive session
(picker by default; use --last to continue the most recent)."*

### Native session-id acquisition (proven)

Codex writes rollout files to `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<UUID>.jsonl`. Line 1 is a
`session_meta` event whose `payload.id` is the native session UUID and `payload.cwd` the working dir
(the UUID is also in the filename). Maestro recovers it post-spawn: the server's
`LogDigestService.resolveJsonlPath` already locates a session's rollout by matching the
`<session_id>sess_…</session_id>` marker that `PromptComposer` injects — read `payload.id` from that
file. Codex **cannot** be pre-seeded with an id.

**Eager capture (so the id is never lost):** the moment `resolveJsonlPath` locates a Codex rollout —
which happens on every digest/stats poll for an active session — `LogDigestService.captureCodexSessionId`
parses `payload.id` and persists it to `session.metadata.codexSessionId` (write-once, best-effort).
The resume route's on-demand `resolveCodexSessionId` scan is the backstop. This means the native id is
captured **all the time** while the session is alive, not only at resume, so a session that dies still
has its id on record.

---

## 2. Root cause

`maestro worker resume` was **not provider-aware** — it hardcoded Claude for every agent tool:

| File:line (pre-fix) | Defect |
|---|---|
| `maestro-cli/src/commands/worker-resume.ts:30` | `private spawner = new ClaudeSpawner();` — Claude only |
| `maestro-cli/src/commands/worker-resume.ts:78,80` | Args built as Claude `--resume <id>` |
| `maestro-cli/src/commands/worker-resume.ts:89` | `spawnWithUlimit('claude', args, …)` — **launches `claude` even for a Codex session** |
| `maestro-cli/src/services/codex-spawner.ts` | `CodexSpawner` had **no** `buildResumeArgs` — only fresh-start `buildCodexArgs` |

Result: resuming a Codex session ran `claude --resume <uuid>` — the wrong binary, with a flag Codex
doesn't have, and a `randomUUID` Codex never issued.

**Cross-package (reported to server specialist, not edited here):**
`maestro-server/src/api/sessionRoutes.ts:2318-2324` rejects non-Claude resume with
`agent_tool_not_resumable`, and `:2308-2314` fabricates `claudeSessionId = randomUUID()` — which must
**never** be passed to `codex resume`.

---

## 3. Fix (CLI-owned)

- `CodexSpawner.buildResumeArgs(manifest, sessionId, codexSessionId)` — builds `codex resume [opts] <id>`
  with the launch config reapplied. The native id is **required** (no `--last` guess). The Maestro
  role/system prompt **is** re-injected via `-c developer_instructions=<sys>` — Codex's documented
  per-session additive channel (the provider analog of Claude's `--append-system-prompt`), applied per
  invocation, so resume re-supplies it exactly like a fresh spawn. The dynamic task turn is **not**
  re-passed (the restored conversation already holds it).
- `ClaudeSpawner.buildResumeArgs(manifest, sessionId, claudeSessionId)` — reapplies the launch config
  and **re-appends** the Maestro system prompt via `--append-system-prompt <sys>` before `--resume <id>`.
  `--resume` restores the conversation's message history, not the invocation's appended system prompt,
  so the static role instructions must be re-appended.
- `WorkerResumeCommand.resolveResumeInvocation({agentTool, sessionId, manifest, claudeSessionId, codexSessionId, mode})`
  — pure, unit-testable; returns `{bin, args}` per tool (`claude` vs `codex`), or `null` for
  gemini/hermes **and for a Codex session with no captured id** (→ fresh start). `execute()` spawns
  `invocation.bin`; the fresh-start fallback routes through the agent-tool-aware `AgentSpawner` factory
  (which re-injects the full system prompt + task + env under the same session id).
- New env contract consumed by the CLI: **`MAESTRO_CODEX_SESSION_ID`** (captured native id; optional)
  and **`MAESTRO_AGENT_TOOL`** (fallback hint; manifest `agentTool` is primary).

**Tests (RED → GREEN):** `tests/services/codex-spawner.test.ts`, `tests/services/claude-spawner.test.ts`,
`tests/commands/worker-resume.test.ts`. Full CLI suite: **466 passed**. `tsc`: **clean**.

---

## 4. Start-vs-Resume parameter matrix

| Aspect | Fresh start (`worker init`) | Resume (`worker resume`) |
|---|---|---|
| **Claude bin/verb** | `claude … --session-id <uuid>` | `claude … --resume <uuid>` |
| **Claude id source** | Maestro pre-seeds `MAESTRO_CLAUDE_SESSION_ID` | Same id (deterministic) |
| **Codex bin/verb** | `codex <flags> <prompt>` (interactive TUI) | `codex resume <flags> <id>` (id required) |
| **Codex id source** | Codex self-generates rollout UUID | Captured `MAESTRO_CODEX_SESSION_ID`; **no id → fresh start** |
| **Model** | `--model <m>` | `--model <m>` (reapplied) |
| **Sandbox / approval** | `--sandbox` / `--ask-for-approval` (or `--dangerously-bypass-…`) | Same, reapplied |
| **Working dir** | `--cd <dir>` | `--cd <dir>` (reapplied) |
| **System prompt** | Claude `--append-system-prompt <sys>`; Codex `-c developer_instructions=<sys>` | **Re-applied** per invocation via the **same** provider-specific mechanism |
| **Task prompt** | Appended as the initial user turn | **Not** re-appended (conversation restored) |
| **gemini / hermes** | native fresh start | no native resume → fresh start (same id) |

### Why there is no `--last` fallback

`--last` picks the newest-by-mtime session **in the cwd**. Two+ Codex sessions sharing one cwd
(non-worktree sessions on `project.workingDir`, or a manual `codex` run there) ⇒ `--last` can
**silently resume the wrong conversation**. Because a wrong-thread resume is worse than a clean
restart, Maestro removed the `--last` fallback entirely: resume runs **only** against a
positively-captured native id, and otherwise **fresh-starts with full context** (system prompt + task
+ env re-injected under the same Maestro session id). Eager capture (§1) makes the id available almost
always, so fresh-start is the rare tail case (session died before Codex flushed its first rollout).

### System-prompt re-injection on resume (official mechanisms)

Both providers apply the invocation's system prompt **per invocation**, and neither restores it from
the resumed conversation — so resume must re-supply it, using each provider's documented channel:

- **Claude Code CLI** — `--append-system-prompt <prompt>` ("append custom text to the end of the
  default system prompt"). Re-appended before `--resume <id>`.
- **Codex CLI** — `-c developer_instructions=<prompt>` ("additional user instructions injected per
  session, before AGENTS.md"): it **adds to** Codex's built-in base prompt rather than replacing it.
  Re-passed before the positional `<id>`.

This is the exact mechanism each provider uses on a fresh spawn, so resume preserves the agent's
Maestro identity, commands, and permissions.

### End-to-end contract (server ↔ CLI)

1. The `agent_tool_not_resumable` gate is relaxed for `codex` (still rejects gemini/hermes).
2. The native Codex id is captured eagerly (`LogDigestService.captureCodexSessionId` on rollout
   locate) and on-demand at resume (`resolveCodexSessionId`), stored on `session.metadata.codexSessionId`.
3. On resume, the server sets `MAESTRO_CODEX_SESSION_ID` **only when captured**; it omits it otherwise
   so the CLI fresh-starts with full context. The fabricated Claude `randomUUID` is **never** passed to
   Codex (and is stripped from the persisted Codex session env).
