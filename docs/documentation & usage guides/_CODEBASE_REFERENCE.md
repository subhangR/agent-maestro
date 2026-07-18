# Maestro Codebase Reference (For Documentation Writers)

## What is Maestro?

Maestro is a multi-agent orchestration platform for managing multiple Claude (or Codex/Gemini) AI sessions across projects. Three packages:

- **maestro-server** - Express + WebSocket HTTP backend (port 2357 prod, 3000 dev)
- **maestro-ui** - Tauri + React desktop application
- **maestro-cli** - Node.js CLI tool (`maestro` command)

All data stored as plain JSON files on disk at `~/.maestro/data/` (no database).

## Installation Methods

1. **Full install**: `./install.sh` (macOS, builds everything including desktop app, requires Rust)
2. **Server-only**: `./install.sh --server-only` (skip desktop app, no Rust needed)
3. **Docker**: `docker compose up` (cross-platform)
4. **Dev mode**: `bun run dev:all` (starts server + UI in dev mode)

Prerequisites: Node 18+, Rust (for desktop app only), bun (auto-installed by install.sh)

After install: CLI at `~/.maestro/bin/maestro`, server at `~/.maestro/bin/maestro-server`, desktop app at `/Applications/Maestro.app`

## Core Data Models

### Project
```typescript
interface Project {
  id: string;
  name: string;
  workingDir: string;
  description?: string;
  isMaster?: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### Task
```typescript
// Statuses: 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled' | 'blocked' | 'archived'
// Priorities: 'low' | 'medium' | 'high'
interface Task {
  id: string; projectId: string; parentId: string | null;
  title: string; description: string; status: TaskStatus; priority: TaskPriority;
  taskSessionStatuses?: Record<string, TaskSessionStatus>; // Per-session status
  sessionIds: string[]; skillIds: string[]; dependencies: string[];
  teamMemberId?: string; teamMemberIds?: string[];
  createdAt: number; updatedAt: number; startedAt: number | null; completedAt: number | null;
}
```

### Session
```typescript
// Statuses: 'spawning' | 'idle' | 'working' | 'completed' | 'failed' | 'stopped'
interface Session {
  id: string; projectId: string; taskIds: string[]; name: string;
  status: SessionStatus; env: Record<string, string>;
  events: SessionEvent[]; timeline: SessionTimelineEvent[]; docs: DocEntry[];
  needsInput?: { active: boolean; message?: string };
  teamMemberId?: string; teamMemberSnapshot?: TeamMemberSnapshot;
  parentSessionId?: string | null; rootSessionId?: string | null;
  startedAt: number; lastActivity: number; completedAt: number | null;
}
```

### TeamMember
```typescript
interface TeamMember {
  id: string; projectId: string; name: string; role: string;
  identity?: string; avatar: string; model?: string;
  agentTool?: 'claude-code' | 'codex' | 'gemini';
  mode?: 'worker' | 'coordinator' | 'coordinated-worker' | 'coordinated-coordinator';
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  skillIds?: string[]; memory?: string[];
  capabilities?: { can_spawn_sessions?, can_edit_tasks?, can_report_task_level?, can_report_session_level? };
  commandPermissions?: { groups?: Record<string, boolean>; commands?: Record<string, boolean> };
}
```

### Team
```typescript
interface Team {
  id: string; projectId: string; name: string; description?: string;
  avatar?: string; leaderId: string; memberIds: string[]; subTeamIds: string[];
  status: 'active' | 'archived';
}
```

### TaskList
```typescript
interface TaskList {
  id: string; projectId: string; name: string; description?: string;
  orderedTaskIds: string[];
}
```

### MaestroManifest
```typescript
interface MaestroManifest {
  manifestVersion: string; mode: AgentMode;
  tasks: TaskData[]; session: SessionConfig;
  skills?: string[]; agentTool?: AgentTool;
  teamMemberId?: string; teamMemberName?: string; teamMemberIdentity?: string;
  teamMemberMemory?: string[]; teamMemberCapabilities?: Record<string, boolean>;
  coordinatorSessionId?: string;
  isMaster?: boolean; masterProjects?: MasterProjectInfo[];
}
```

## Four Agent Modes

| Mode | Description |
|------|-------------|
| `worker` | Standalone executor (no parent coordinator) |
| `coordinator` | Standalone orchestrator (spawns workers, monitors) |
| `coordinated-worker` | Executor spawned BY a coordinator |
| `coordinated-coordinator` | Coordinator spawned by another coordinator |

## Complete CLI Commands

### Global
- `maestro whoami [--json]` - Show current context
- `maestro status` - Project overview
- `maestro commands [--check <cmd>]` - Show allowed commands
- `maestro debug-prompt [--manifest|--session|--system-only|--task-only|--raw]` - Show rendered prompt

### Project (6)
- `project create <name>`, `project list`, `project get <id>`, `project delete <id>`
- `project set-master <id>`, `project unset-master <id>`

### Task (13+)
- `task create [title] --title --desc --priority --parent`
- `task list [taskId] --status --priority --all`
- `task get <id>`, `task edit <id>`, `task update <id>`, `task complete <id>`, `task block <id>`, `task delete <id> --cascade`
- `task children <taskId> --recursive`, `task tree`
- `task report {progress|complete|blocked|error} <taskId> <message>`
- `task docs {add|list} <taskId>`

### Session (16+)
- `session spawn --task --tasks --mode --skill --team-member-id --agent-tool --model --permission-mode --name --context`
- `session list --project --task --status`, `session siblings`, `session info [id]`
- `session watch <ids> --timeout`, `session logs [ids...] --format --tail --follow` (log IDs accept spaces or commas)
- `session prompt <targetId> --message`
- `session register`, `session complete`, `session needs-input`, `session resume-working`
- `session report {progress|complete|blocked|error} <message>`
- `session docs {add|list}`

### Report (shortcut)
- `report {progress|complete|blocked|error} <message>`

### Skill (5)
- `skill list --project-path --scope`, `skill info <name>`, `skill validate`
- `skill install <owner/repo>`, `skill browse [query]`

### Manifest
- `manifest generate --mode --project-id --task-ids --skills --model --agent-tool --team-member-id --output`

### Team (12)
- `team create <name> --desc --leader --members --avatar`
- `team list --all --status`, `team get <id>`, `team edit <id>`
- `team archive <id>`, `team unarchive <id>`, `team delete <id>`
- `team add-member <id> <memberIds>`, `team remove-member <id> <memberIds>`
- `team add-sub-team <id> <subTeamId>`, `team remove-sub-team <id> <subTeamId>`, `team tree <id>`

### Team Member (11)
- `team-member create <name> --role --avatar --identity --model --agent-tool --mode --permission-mode --skill-ids`
- `team-member list --all --status`, `team-member get <id>`, `team-member edit <id>`
- `team-member archive <id>`, `team-member unarchive <id>`, `team-member delete <id>`
- `team-member reset <id>`, `team-member update-identity <id>`
- `team-member memory {append|list|clear} <id>`

### Task List (4)
- `task-list create`, `task-list list`, `task-list get <id>`, `task-list reorder <id>`

### Master (4)
- `master projects`, `master tasks --project`, `master sessions --project`, `master context`

### UI (2)
- `show modal <filePath>`, `modal events <modalId>`

All commands support `--json` for machine-readable output.

## All API Endpoints (~50+)

### Projects: `/api/projects`
GET /, POST /, GET /:id, PUT /:id, DELETE /:id, PUT /:id/master

### Tasks: `/api/tasks`
GET /, POST /, GET /:id, PATCH /:id, DELETE /:id, GET /:id/children
POST /:id/timeline, GET /:id/docs, POST /:id/docs, POST /:id/images, GET /:id/images/:imageId, DELETE /:id/images/:imageId

### Sessions: `/api/sessions`
GET /, POST /, GET /:id, PATCH /:id, DELETE /:id, POST /spawn
POST /:id/events, POST /:id/timeline, GET /:id/timeline
GET /:id/docs, POST /:id/docs, GET /:id/log-digest
POST /:id/modal, POST /:id/modal/:modalId/actions, POST /:id/modal/:modalId/close
GET /:id/tasks, POST /:id/tasks/:taskId, DELETE /:id/tasks/:taskId
POST /:id/prompt

### Task Lists: `/api/task-lists`
GET /, POST /, GET /:id, PATCH /:id, DELETE /:id
POST /:id/tasks/:taskId, DELETE /:id/tasks/:taskId, PUT /:id/reorder

### Skills: `/api/skills`
GET /, GET /:id, GET /mode/:mode, POST /:id/reload

### Teams: `/api/teams`
GET /, POST /, GET /:id, PATCH /:id, DELETE /:id
POST /:id/archive, POST /:id/unarchive
POST /:id/members, DELETE /:id/members
POST /:id/sub-teams, DELETE /:id/sub-teams

### Team Members: `/api/team-members`
GET /, POST /, GET /:id, PATCH /:id, DELETE /:id
POST /:id/archive, POST /:id/unarchive
POST /:id/memory, POST /:id/reset

### Ordering: `/api/ordering`
GET /:entityType/:projectId, PUT /:entityType/:projectId

### Master: `/api/master`
GET /projects, GET /tasks, GET /sessions, GET /context

### Utility
GET /health, GET /ws-status

## Session Spawn Flow

1. UI/CLI calls `POST /api/sessions/spawn`
2. Server creates Session record (status: 'spawning')
3. Server generates manifest via `maestro manifest generate` CLI
4. Manifest written to `~/.maestro/sessions/<session-id>/manifest.json`
5. Server emits `session:created` WebSocket event
6. UI receives event, calls Tauri `create_session()` to spawn PTY
7. PTY runs `maestro worker init` (or `orchestrator init`)
8. CLI reads manifest, builds Claude command with `--append-system-prompt` + task XML
9. Claude starts with full Maestro context

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `MAESTRO_API_URL` | Server URL (default: http://localhost:3000) |
| `MAESTRO_PROJECT_ID` | Current project ID |
| `MAESTRO_SESSION_ID` | Current session ID |
| `MAESTRO_TASK_IDS` | Comma-separated task IDs |
| `MAESTRO_ROLE` | worker or orchestrator |
| `MAESTRO_MANIFEST_PATH` | Path to manifest JSON |

## Data Storage

```
~/.maestro/
├── config                    # MAESTRO_API_URL
├── bin/                      # CLI + server binaries
├── data/
│   ├── projects/<id>.json
│   ├── tasks/<id>.json
│   ├── sessions/<id>.json
│   ├── task-lists/<id>.json
│   ├── team-members/<projectId>.json
│   ├── teams/<projectId>.json
│   └── orderings/
└── sessions/<id>/manifest.json
```

## Skills System

Skills = markdown instruction files at:
- Global: `~/.claude/skills/<name>/SKILL.md` or `~/.agents/skills/<name>/SKILL.md`
- Project: `<project>/.claude/skills/<name>/SKILL.md` or `<project>/.agents/skills/<name>/SKILL.md`

Project-scoped skills override global. Skills are injected into Claude's system prompt via `--plugin-dir` flags.

## Built-in Workflow Templates

| ID | Mode | Description |
|----|------|-------------|
| `execute-simple` | worker | Single task direct execution |
| `execute-tree` | worker | Tree-based with dependency ordering |
| `coordinate-default` | coordinator | Decompose → spawn workers → monitor → verify |
| `coordinate-batching` | coordinator | Group independent tasks into parallel batches |
| `coordinate-dag` | coordinator | DAG-based execution in topological waves |
