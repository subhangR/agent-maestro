# Session Log API — Windows Path Wiring Audit

**Date:** 2026-06-12
**Scope:** Verify the session-log APIs resolve Claude (and Codex) log files correctly on Windows, where Claude Code stores transcripts under a differently-shaped path than on macOS/Linux.

## TL;DR

The Windows-facing **Tauri log viewer works** for the normal case, and the **server-side digest service works but in a degraded (slow) fallback mode**. The root cause is that path-encoding logic is duplicated in 3 places and **only the Rust core encoder is separator-agnostic**; the two JS/TS copies assume POSIX `/` separators and silently misbehave on Windows backslash paths.

On this machine the real transcript dir is:

```
C:\Users\chpra\.claude\projects\C--Users-chpra-agent-maestro\*.jsonl
```

Claude Code encodes the project dir by replacing **every non-alphanumeric char** in the absolute cwd with `-`. So `C:\Users\chpra\agent-maestro` → `C--Users-chpra-agent-maestro` (the `:` and each `\` each become a `-`, which is why there is a double dash after `C`).

## How the log path is resolved (two independent code paths)

| Consumer | Path resolver | Separator handling | Windows verdict |
|---|---|---|---|
| UI log viewer / stats (`SessionLogModal`, `TerminalStrip`, `SessionStatsView`) → Tauri commands `list/read/tail_claude_session_log` | `encode_project_path` in `maestro-ui/src-tauri/src/claude_logs.rs` | Replaces **all** non-alphanumerics → `-` | ✅ Works (verified against real on-disk dir) |
| Server REST `GET /api/sessions/:id/log-digest`, `/log-digests`, `/:id/stats` (coordinator observation, `maestro session observe`) → `LogDigestService` | `getClaudeProjectsDirs` in `maestro-server/src/application/services/LogDigestService.ts` | Replaces **only `/`** → `-` | ⚠️ Primary lookup broken on Windows; saved by full-scan fallback |
| UI ancestor-walk recovery | `cwdCandidates` in `maestro-ui/src/components/session-log/TerminalStrip.tsx` | Splits/strips on **`/` only** | ⚠️ Feature dead on Windows (primary lookup still works) |

The `cwd` passed to all consumers is the live PTY-reported working directory (`active.cwd` / `logSession.cwd`), i.e. a Windows backslash path like `C:\Users\chpra\agent-maestro`.

---

## Findings

### 1. Tauri `claude_logs.rs` — CORRECT on Windows ✅
`maestro-ui/src-tauri/src/claude_logs.rs:39-44`

```rust
fn encode_project_path(cwd: &str) -> String {
    cwd.trim_end_matches('/')
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}
```

Because it maps *every* non-alphanumeric char (including `:` and `\`) to `-`, it produces `C--Users-chpra-agent-maestro` for the Windows cwd, which matches the real directory. `dirs::home_dir()` returns `C:\Users\chpra`, and `.join(".claude").join("projects")` composes correctly with `\`. Commands are registered in `main.rs:223-225` and deps (`dirs = "5"`, `regex = "1"`) are present in `Cargo.toml:23-24`. **Verified end-to-end against the live filesystem — this path works.**

**Edge case (minor):** `trim_end_matches('/')` only strips a trailing forward slash. A cwd with a trailing backslash (`...\agent-maestro\`) would encode to `...-agent-maestro-` and miss. PTY cwds normally have no trailing separator, so low risk — but worth hardening to `trim_end_matches(['/', '\\'])`.

### 2. Server `LogDigestService.getClaudeProjectsDirs` — BROKEN primary lookup on Windows ⚠️
`maestro-server/src/application/services/LogDigestService.ts:470-501`

```ts
// Encode path: / → - (mirrors Rust extract_maestro_session_id)
const encoded = workingDir.replace(/\//g, '-');
const cleanEncoded = encoded.startsWith('-') ? encoded.slice(1) : encoded;
dirs.push(join(claudeProjectsBase, cleanEncoded));
```

- On Windows `workingDir = "C:\Users\chpra\agent-maestro"` contains **no forward slashes**, so `.replace(/\//g, '-')` is a no-op. The string stays `C:\Users\chpra\agent-maestro`.
- `join("C:\Users\chpra\.claude\projects", "C:\Users\chpra\agent-maestro")` produces a nonsensical path; `readdir` throws and is swallowed.
- The comment claims it "mirrors Rust" but it does **not** — Rust replaces all non-alphanumerics; this replaces only `/`. (It is also subtly wrong even on macOS for usernames containing `.`, `_`, or spaces, e.g. `jane.doe`.)

**Why it still functions:** lines 483-498 fall back to scanning **every** directory under `~/.claude/projects`, reading the first 256 KB of every `.jsonl` and matching the embedded `<session_id>sess_…</session_id>` tag. So digests/stats are still found on Windows — but at the cost of scanning all projects on every 60 s cache miss instead of going straight to the right folder. Correctness OK, performance degraded, and the degradation grows with the number of Claude projects on the machine.

**Fix:** replace the encoder with the same all-non-alphanumeric scheme as Rust:
```ts
const encoded = workingDir.replace(/[^a-zA-Z0-9]/g, '-');
dirs.push(join(claudeProjectsBase, encoded));
```
(Drop the leading-dash strip — Claude keeps the leading `-` on POSIX; on Windows the leading char is the drive letter so there is none. Mirror Rust exactly.)

### 3. UI `cwdCandidates` — ancestor-walk recovery dead on Windows ⚠️
`maestro-ui/src/components/session-log/TerminalStrip.tsx:53-67`

```ts
const normalized = cwd.trim().replace(/\/+$/, '');   // strips trailing "/" only
...
const slash = current.lastIndexOf('/');              // finds "/" only
```

This feature re-scans parent directories so a log is still found if the agent `cd`-ed into a subtree after spawn. On Windows (backslash paths) `lastIndexOf('/')` is `-1`, so **zero ancestors** are generated and the recovery never triggers. The primary single-cwd lookup still works (Rust encodes the one candidate correctly), so this is a lost resilience feature, not a hard break. Trailing-backslash stripping is also missed (same edge case as #1).

**Fix:** normalize on both separators — `replace(/[/\\]+$/, '')` and `Math.max(lastIndexOf('/'), lastIndexOf('\\'))`.

### 4. Codex logs — unaffected ✅
`codex_logs.rs` and `LogDigestService.getCodexSessionFiles` enumerate `~/.codex/sessions` recursively with no path encoding, so they are separator-agnostic and fine on Windows.

---

## Recommendation / priority

1. **(Medium)** Fix #2 in `LogDigestService` — biggest functional impact (server digests fall back to full-scan on every Windows machine). One-line encoder change; consider extracting a single shared `encodeClaudeProjectDir()` helper so the 3 copies can't drift again.
2. **(Low)** Fix #3 `cwdCandidates` to restore ancestor recovery on Windows.
3. **(Low)** Harden #1 Rust `trim_end_matches` to also strip trailing `\`.
4. Add a Windows-path unit test to each (`claude_logs.rs` tests currently only cover POSIX inputs — see `claude_logs.rs:209-246`).

**Net:** No user-visible breakage in the normal Windows flow for the Tauri viewer; the server digest API works but is silently inefficient. All three issues stem from the same duplicated, POSIX-assuming encoder — consolidating it is the durable fix.
