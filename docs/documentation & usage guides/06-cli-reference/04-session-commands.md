# Session Commands

Manage agent sessions. Sessions are running instances of AI agents (Claude, Codex, Gemini) that execute tasks.

## maestro session list

List sessions with optional filters.

### Syntax

```
maestro session list [options]
```

### Arguments

None.

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--task <taskId>` | string | — | Filter by task ID |
| `--team-member-id <tmId>` | string | — | Filter by team member ID |
| `--active` | boolean | `false` | Show only active sessions (`working`, `idle`, `spawning`) |
| `--siblings` | boolean | `false` | Show sibling sessions (spawned by the same coordinator) |
| `--my-workers` | boolean | `false` | Show worker sessions spawned by this session |

### Example

```bash
maestro session list --active
```

```
┌───────────────────────────────┬──────────────────────────┬──────────┬─────────────┬───────┐
│ ID                            │ Name                     │ Status   │ Team Member │ Tasks │
├───────────────────────────────┼──────────────────────────┼──────────┼─────────────┼───────┤
│ sess_17726525_abc12           │ Worker: Auth module      │ working  │ Pro         │ 1     │
│ sess_17726530_def34           │ Worker: API endpoints    │ idle     │ Builder     │ 2     │
└───────────────────────────────┴──────────────────────────┴──────────┴─────────────┴───────┘
```

### Related Commands

- `maestro session info` — Get detailed session info
- `maestro session siblings` — Shortcut for sibling sessions

---

## maestro session siblings

List sibling sessions — other active sessions spawned by the same coordinator. Shortcut for `session list --siblings`.

### Syntax

```
maestro session siblings
```

### Arguments

None.

### Flags

None.

### Example

```bash
maestro session siblings
```

```
┌───────────────────────────────┬──────────────────────────┬──────────┬──────────┬──────────────┐
│ ID                            │ Name                     │ Role     │ Status   │ Tasks        │
├───────────────────────────────┼──────────────────────────┼──────────┼──────────┼──────────────┤
│ sess_17726530_def34           │ Worker: API endpoints    │ Builder  │ working  │ task_def456  │
│ sess_17726535_ghi56           │ Worker: Database setup   │ Pro      │ idle     │ task_ghi789  │
└───────────────────────────────┴──────────────────────────┴──────────┴──────────┴──────────────┘

To message a sibling:
  maestro session prompt <ID> --message "<your message>"
```

### Related Commands

- `maestro session list` — Full session listing
- `maestro session prompt` — Send a message to a sibling

---

## maestro session info

Get session info. Defaults to the current session if no ID is specified.

### Syntax

```
maestro session info [sessionId]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `sessionId` | No | Session ID (defaults to current session via `MAESTRO_SESSION_ID`) |

### Flags

None.

### Example

```bash
maestro session info
```

```
  ID:     sess_17726525_abc12
  Name:   Worker: Auth module
  Status: working
  Tasks:  task_abc123
```

### Related Commands

- `maestro session list` — List all sessions

---

## maestro session spawn

Spawn a new session with full task context. This is the primary way coordinators create worker sessions.

### Syntax

```
maestro session spawn --task <id> [options]
```

### Arguments

None.

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--task <id>` | string | **Required** | Task ID to assign to the new session |
| `--skill <skill>` | string | `maestro-worker` | Skill to load (`maestro-worker`, `maestro-orchestrator`, or custom skill name) |
| `--name <name>` | string | Auto-generated | Session name |
| `--reason <reason>` | string | — | Reason for spawning this session |
| `--include-related` | boolean | `false` | Include related/dependent tasks in session context |
| `--agent-tool <tool>` | string | — | Agent tool: `claude-code`, `codex`, or `gemini` |
| `--model <model>` | string | — | Model to use (e.g. `sonnet`, `opus`, `haiku`, or native model names) |
| `--team-member-id <id>` | string | — | Team member ID to run this session as |
| `--subject <subject>` | string | — | Initial directive subject (embedded in manifest) |
| `--message <message>` | string | — | Initial directive message body (requires `--subject`) |

### Example

```bash
maestro session spawn \
  --task task_abc123 \
  --skill maestro-worker \
  --team-member-id tm_pro_001 \
  --model opus \
  --subject "Write Section 6" \
  --message "Create comprehensive CLI reference docs"
```

```
Spawning maestro-worker session: Worker: Add user authentication
   Task: Add user authentication
   Priority: high
   Agent Tool: claude-code
   Model: opus
   Session ID: sess_17726540_jkl78

   Waiting for Agent Maestro to open terminal window...
```

### Related Commands

- `maestro session watch` — Watch spawned sessions in real-time
- `maestro session logs` — Read output from spawned sessions

---

## maestro session watch

Watch spawned sessions in real-time via WebSocket. Outputs status changes, progress events, and completion/failure notifications. Automatically exits when all watched sessions complete.

### Syntax

```
maestro session watch <sessionIds> [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `sessionIds` | Yes | Comma-separated session IDs to watch |

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--timeout <ms>` | string | `0` | Auto-exit after N milliseconds (`0` = no timeout) |

### Example

```bash
maestro session watch sess_abc123,sess_def456 --timeout 300000
```

```
[session:watch] Watching 2 session(s): sess_abc123, sess_def456
[session:watch] Connected. Listening for events...
[10:30:15] sess_abc123 status: working
[10:31:02] sess_abc123 progress: Implementing JWT middleware
[10:32:45] sess_def456 status: working
[10:35:12] sess_abc123 COMPLETED: Worker: Auth module
[10:38:30] sess_def456 COMPLETED: Worker: API endpoints
[session:watch] All watched sessions have finished.
```

### Related Commands

- `maestro session spawn` — Spawn sessions to watch
- `maestro session logs` — Read session output logs

---

## maestro session logs

Read text output from session JSONL logs. Useful for coordinator observation of worker sessions.

### Syntax

```
maestro session logs [ids...] [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `ids...` | No | One or more session IDs separated by spaces and/or commas (required unless `--my-workers` is used) |

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--my-workers` | boolean | `false` | Read logs for all workers under this coordinator session |
| `--last <n>` | string | `5` | Number of text entries per session |
| `--full` | boolean | `false` | Return full untruncated text entries |
| `--max-length <n>` | string | `150` | Max character length per text entry |

### Example

```bash
maestro session logs sess_abc123 sess_def456
maestro session logs sess_abc123,sess_def456
maestro session logs --my-workers --last 3
```

```
● sess_abc123 [active] — Worker: Auth module (2m 30s)
  > Implementing JWT validation middleware...
  > Added token refresh endpoint at /api/auth/refresh
  > Running test suite for auth module

● sess_def456 [active] — Worker: API endpoints (1m 45s)
  > Creating REST endpoints for user management
  > Added pagination support to GET /users
  > Writing integration tests
```

### Related Commands

- `maestro session watch` — Real-time session monitoring
- `maestro session list --my-workers` — List worker sessions

---

## maestro session prompt

Send an input prompt to another active Maestro session. Used for inter-session communication.

### Syntax

```
maestro session prompt <targetSessionId> --message <message> [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `targetSessionId` | Yes | Session ID to send the prompt to |

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--message <message>` | string | **Required** | The prompt message to send |
| `--mode <mode>` | string | `send` | `send` (type + Enter) or `paste` (type only) |

### Example

```bash
maestro session prompt sess_def456 --message "The auth module is complete. You can now integrate it."
```

```
✔ ✓ Prompt sent to session sess_def456
```

### Related Commands

- `maestro session siblings` — Find sibling sessions to message
- `maestro session list` — List all sessions

---

## maestro session register

Register the current session with the server. Typically called automatically by the SessionStart hook.

### Syntax

```
maestro session register
```

### Arguments

None.

### Flags

None.

### Example

```bash
maestro session register
```

### Related Commands

- `maestro session complete` — Mark session as completed

---

## maestro session complete

Mark the current session as completed. Typically called automatically by the SessionEnd hook.

### Syntax

```
maestro session complete
```

### Arguments

None.

### Flags

None.

### Example

```bash
maestro session complete
```

### Related Commands

- `maestro session register` — Register a session
- `maestro session report complete` — Report completion with a summary message

---

## maestro session needs-input

Mark the current session as needing user input. Typically called automatically by the Stop hook.

### Syntax

```
maestro session needs-input
```

### Arguments

None.

### Flags

None.

### Example

```bash
maestro session needs-input
```

### Related Commands

- `maestro session resume-working` — Resume to working status

---

## maestro session resume-working

Resume session to working status. Typically called automatically by the UserPromptSubmit hook.

### Syntax

```
maestro session resume-working
```

### Arguments

None.

### Flags

None.

### Example

```bash
maestro session resume-working
```

### Related Commands

- `maestro session needs-input` — Mark as needing input

---

## maestro session docs add

Add a documentation entry to the current session.

### Syntax

```
maestro session docs add <title> --file <filePath> [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `title` | Yes | Title of the document |

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--file <filePath>` | string | **Required** | File path for the document |
| `--content <content>` | string | — | Content of the doc (reads file if not provided) |

### Example

```bash
maestro session docs add "Implementation Notes" --file ./notes/auth-impl.md
```

```
✔ Doc added to session
  Title: Implementation Notes
  File:  ./notes/auth-impl.md
```

### Related Commands

- `maestro session docs list` — List session docs
- `maestro task docs add` — Add docs to a task

---

## maestro session docs list

List documentation entries for the current session.

### Syntax

```
maestro session docs list
```

### Arguments

None.

### Flags

None.

### Example

```bash
maestro session docs list
```

```
┌──────────┬──────────────────────┬───────────────────────┬─────────────────────┐
│ ID       │ Title                │ File Path             │ Added At            │
├──────────┼──────────────────────┼───────────────────────┼─────────────────────┤
│ doc_001  │ Implementation Notes │ ./notes/auth-impl.md  │ 3/5/2026, 10:30 AM  │
└──────────┴──────────────────────┴───────────────────────┴─────────────────────┘
```

### Related Commands

- `maestro session docs add` — Add a doc to the session
