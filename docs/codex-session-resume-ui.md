# Desktop Start/Resume — UI Audit & Fix (maestro-ui)

**Task:** `task_1783966650125_7te02o15n` (parent bug `task_1783966341485_xk210h1sr`)
**Branch:** `fix/codex-session-resume` · **Owner:** UI Specialist
**Boundary:** UI-owned changes only. CLI/server defects are *reported*, not edited — see the
sibling contract `docs/codex-session-resume-contract.md` for the CLI/server fix.

---

## 0. How the desktop actually launches a terminal (trace)

The UI **never assembles a provider command**. It runs the string the server emits, verbatim:

1. Resume: `SessionStatsView`/`SessionListItem`/`TeamView`/`SessionsSection` → `resumeSessionFlow(id)`
   (`useMaestroStore.ts:1483`) → `maestroClient.resumeSession()` → server.
2. Server decides `maestro worker init` (fresh) vs `maestro worker resume` (resume) in
   `buildMaestroSpawnCommand` (`maestro-server/src/api/sessionRoutes.ts:79`, subcommand chosen at
   `:2425` = `hadClaudeSessionId ? 'resume' : 'init'`) and emits `session:spawn`/`session:resume` over
   WebSocket with `data.command` + env.
3. UI WebSocket handler (`useMaestroStore.ts:438-494`) passes `message.data.command` **verbatim** into
   `useSessionStore.handleSpawnTerminalSession({ command, args: [], ... })`.
4. `handleSpawnTerminalSession` (`useSessionStore.ts:1281`) inlines env as shell exports and runs the
   command in a fresh Tauri PTY: `export K=V; <command>; exec $SHELL` (`:1311-1316`).

**Consequence:** the provider command shape (below) is owned by CLI+server. The UI's only
launch-relevant decision is **whether to _offer_ the Resume affordance** — which is the UI-owned defect
fixed here.

---

## 1. Four-case command matrix

`maestro worker init|resume` reads the manifest + env and the per-tool spawner builds the real args
(`claude-spawner.ts` / `codex-spawner.ts`). The UI runs the resulting string unchanged.

| Case | CLI subcommand | Provider command (built by spawner) | Session id source |
|---|---|---|---|
| **Claude fresh** | `maestro worker init` | `claude --plugin-dir … --model … --permission-mode … [--effort …] [--max-turns …] --session-id <MAESTRO_CLAUDE_SESSION_ID> <prompt>` | Server pre-generates `MAESTRO_CLAUDE_SESSION_ID = randomUUID()` and **seeds** it via `--session-id` (`sessionRoutes.ts:1909`). |
| **Claude resume** | `maestro worker resume` | `claude --plugin-dir … --model … --permission-mode … [--effort …] [--max-turns …] --append-system-prompt <sys> --resume <MAESTRO_CLAUDE_SESSION_ID>` | Replays the **same** pre-seeded `MAESTRO_CLAUDE_SESSION_ID` from env via `--resume`; re-appends the Maestro system prompt (`claude-spawner.ts` `buildResumeArgs`). |
| **Codex fresh** | `maestro worker init` | `codex --model … {--ask-for-approval … --sandbox … \| --dangerously-bypass-approvals-and-sandbox} [-c model_reasoning_effort=…] [-c service_tier="fast"] [--cd …] -c developer_instructions=<sys> <prompt>` | Codex generates its **own** rollout UUID; Maestro cannot pre-seed it. |
| **Codex resume** | `maestro worker resume` | `codex resume [<launch opts>] -c developer_instructions=<sys> <NATIVE_ID>` — **id required; no `--last`.** When no id is captured, the CLI **fresh-starts with full context** instead. | Native id captured eagerly (`LogDigestService.captureCodexSessionId`) and on-demand at resume (`resolveCodexSessionId`), from the rollout `session_meta.payload.id`; re-injects the system prompt via `-c developer_instructions` (`codex-spawner.ts` `buildResumeArgs`). |

---

## 2. Directive questions answered

**Q1 — What does Maestro use to resume Claude, and are all fresh-start `launchConfig` parameters that
remain meaningful preserved on resume?**

- **Resume key:** `claude --resume <MAESTRO_CLAUDE_SESSION_ID>` — a `randomUUID()` the server generates
  at fresh spawn, seeds onto the fresh process with `--session-id`, and replays on resume. Deterministic,
  no post-hoc discovery needed.
- **Preservation: YES.** `buildResumeArgs` calls `buildBaseArgs(manifest)` first, so resume re-applies
  **every meaningful launch flag**: `--plugin-dir` (hooks), each skill `--plugin-dir`, `--model`,
  permission mode (`--permission-mode` / `--dangerously-skip-permissions`), `--effort` (reasoning),
  `--max-turns`. It **also re-appends the Maestro system prompt** via `--append-system-prompt` (the
  invocation's appended system prompt is not restored by `--resume`). Only the session-identity flag
  (`--session-id`) and the dynamic **task** turn are intentionally dropped — correct, because `--resume`
  restores the existing conversation's message history rather than re-priming the task.

**Q2 — Parameter-order / command-shape defect for Codex?**

- **Pre-fix (root defect, CLI-owned):** `maestro worker resume` was **not provider-aware** — it
  hardcoded `ClaudeSpawner` and ran `claude --resume <uuid>` for *every* tool
  (`worker-resume.ts:30,78-89`), and `CodexSpawner` had **no** resume path at all. Codex resume launched
  the *wrong binary* with a flag Codex doesn't have (`--resume`/`--session-id` don't exist on Codex) and
  a UUID Codex never issued.
- **Correct shape (now built by the sibling fix):** Codex resume is a **subcommand with a positional id**,
  not a flag: `codex resume [OPTIONS] [SESSION_ID]`. Order matters — `resume` must be arg 0, the
  `-c developer_instructions=<sys>` override is an OPTION before the positional, and the native id is
  the trailing positional. `codex-spawner.ts` `buildResumeArgs` produces exactly
  `['resume', ...launchOpts, '-c', 'developer_instructions=…', id]`. There is **no `--last` variant** —
  when no id is captured, `resolveResumeInvocation` returns `null` and the CLI fresh-starts with full
  context. ✅ Verified correct.
- **UI-owned command-shape defect: none.** The UI runs the server string verbatim and never assembles
  `claude`/`codex` args, so it cannot introduce a parameter-order defect. The UI defect was purely the
  **resume gate** never offering Codex (§3).

---

## 3. UI-owned root cause & fix

**Root cause:** the "can this session be resumed?" decision was **duplicated across 5 call sites**, each
hardcoding `agentTool === 'claude-code'`, with **no shared predicate**. Even after CLI/server gained
Codex resume, the desktop would never surface a Resume button for Codex sessions, and the five copies
could silently drift.

| Site (pre-fix) | Gate |
|---|---|
| `SessionListItem.tsx:215` | `(session.metadata?.agentTool \|\| "claude-code") === "claude-code"` |
| `SessionStatsView.tsx:498` | `agentTool === "claude-code"` |
| `TeamView.tsx:60` (`isResumable`) | `… === 'claude-code'` composed with terminal-status check |
| `SessionsSection.tsx:233` (history dropdown) | `((hs.metadata as any)?.agentTool \|\| 'claude-code') === 'claude-code'` |
| `SessionsSection.tsx:531` (bottom button) | `(maestroSession.metadata?.agentTool \|\| 'claude-code') === 'claude-code'` |

**Fix:** one source of truth in `agentTools.ts` — `RESUMABLE_AGENT_TOOLS = ["claude-code", "codex"]`
and `isAgentToolResumable(agentTool?)`. All 5 sites now call it. Missing/legacy `agentTool` still
defaults to `claude-code` (resumable), preserving original single-agent behavior. Gemini/Hermes remain
non-resumable (no proven native-id path). Stale copy ("Resume is only available for Claude Code
sessions", "Resume this Claude session") updated to tool-neutral wording.

**Why the UI can safely offer Codex resume now:** it only *offers* the action — the actual `codex resume`
command is assembled by the CLI/server, which now support it.

---

## 4. Changed files (UI only)

| File | Change |
|---|---|
| `maestro-ui/src/app/constants/agentTools.ts` | **NEW** `RESUMABLE_AGENT_TOOLS` + `isAgentToolResumable()` shared predicate |
| `maestro-ui/src/components/maestro/SessionListItem.tsx` | Gate → predicate; tooltip copy |
| `maestro-ui/src/components/maestro/SessionStatsView.tsx` | Gate → predicate; tooltip copy |
| `maestro-ui/src/components/maestro/TeamView.tsx` | `isResumable` → predicate (composed with terminal status); exported for test |
| `maestro-ui/src/components/SessionsSection.tsx` | Both gates → predicate; button copy |
| `maestro-ui/src/__tests__/resumeGate.test.ts` | **NEW** predicate unit tests (6) |
| `maestro-ui/src/__tests__/teamViewResumeGate.test.ts` | **NEW** TeamView consumer tests (5) |
| `maestro-ui/src/__tests__/SessionStatsView.test.tsx` | Updated to new contract: Codex enables, Gemini disables |

## 5. Verification

- **TDD:** RED confirmed before each production change (predicate `is not a function`; TeamView
  codex+terminal `expected false to be true`), then GREEN.
- **Focused:** `resumeGate` 6/6, `teamViewResumeGate` 5/5, `SessionStatsView` 19/19.
- **Full UI Vitest:** 397/398 pass. The 1 failure — `ResourcesView.test.tsx > clicking a doc calls
  openDocument + setActiveId` — is **pre-existing** (fails identically on the stashed baseline; touches
  no code changed here).
- **Typecheck:** `bunx tsc --noEmit` → exit 0, clean.

## 6. Cross-package (reported, not edited by UI)

CLI + server changes required to make Codex resume actually run are owned by siblings and documented in
`docs/codex-session-resume-contract.md`: provider-aware `maestro worker resume`, `CodexSpawner.buildResumeArgs`,
server native-id capture from the Codex rollout, and lifting the server's HTTP-400 Codex resume rejection
(`sessionRoutes.ts:2318-2324`). The UI change composes with these but does not depend on their internals —
it runs whatever command the server emits.
