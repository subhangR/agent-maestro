# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Maestro is a multi-agent orchestration system for Claude agents. It consists of three packages in a Bun workspace monorepo:

- **maestro-server** — Express.js backend (REST + WebSocket), file-based persistence (JSON files in `~/.maestro/data/` or `~/.maestro-staging/data/`)
- **maestro-ui** — Tauri 2 desktop app with React 18, Zustand stores, xterm.js terminals, Monaco editor
- **maestro-cli** — Commander.js CLI that agents run inside sessions to interact with the server

## Build & Development Commands

```bash
# Install all workspace dependencies
bun install

# Development (starts staging server on port 4569 + Tauri UI on 4568, hot-reload)
bun run dev:all

# Individual packages
bun run dev:server          # Server only
bun run dev:ui              # UI only (Tauri dev)

# Build
bun run build:all           # Build all three packages
bun run build:server        # Server: tsc → dist/
bun run build:cli           # CLI: tsc → dist/
bun run build:ui            # UI: tsc + vite build

# Production (port 3001, data at ~/.maestro/)
bun run prod:build          # Build + install macOS app bundle
bun run prod                # Launch installed "Maestro Prod" app
```

## Testing

```bash
# Server (Jest, tests in maestro-server/test/)
cd maestro-server
bun run test                # Run all tests
bun run test:watch          # Watch mode
bun run test:coverage       # With coverage report

# UI (Vitest)
cd maestro-ui
bun run test                # Run all tests
bun run test:watch          # Watch mode

# CLI (Vitest)
cd maestro-cli
bun run test                # Run all tests
```

## Dual Environment Architecture

Staging and production run simultaneously without conflicts:

| | Staging | Production |
|---|---|---|
| Server port | 4569 | 3001 |
| UI (Vite) port | 4568 | n/a (installed app) |
| Data | `~/.maestro-staging/data/` | `~/.maestro/data/` |
| Mode | Tauri dev + hot-reload | Installed macOS app |

> Note: the server's default `PORT` is `4567`; the staging stack runs the server on `4569` with the Vite UI on `4568` (UI is wired to the server via `VITE_API_URL=http://localhost:4569/api`).

## Server Architecture (Clean Architecture + DI)

The server follows strict layered architecture:

- **Domain** (`src/domain/`) — Interfaces only: `ITaskRepository`, `IEventBus`, `ILogger`, etc.
- **Application** (`src/application/services/`) — Business logic services: `TaskService`, `SessionService`, `SpellService`, etc.
- **Infrastructure** (`src/infrastructure/`) — Implementations: `FileSystem*Repository`, `InMemoryEventBus`, `WebSocketBridge`, `Config`
- **API** (`src/api/`) — Express routes with Zod validation (`validation.ts`)

All dependencies are wired in `container.ts` via a manual DI container. The container exposes `initialize()` (creates data dirs, loads repos) and `shutdown()`.

### WebSocket Bridge

Real-time updates use a custom WebSocket bridge with:
- 50ms message batching, per-entity throttling (sessions: 500ms, tasks: 300ms)
- Client-side subscription filtering by `sessionIds`, `projectId`, `taskIds`
- Immediate bypass for spawn and modal events

## Core Domain Entities

- **Project** — Container with `workingDir`; `isMaster` flag enables cross-project access
- **Task** — Hierarchical (`parentId`/`childrenIds`), many-to-many with sessions via `sessionIds[]`, assigned via `teamMemberId`/`teamMemberIds[]`
- **Session** — A running Claude instance; tracks `taskIds[]`, `timeline[]`, `docs[]`, `teamMemberSnapshot`
- **TeamMember** — Agent persona with `mode` (worker/coordinator/coordinated-worker/coordinated-coordinator), `model`, `agentTool`, `commandPermissions`, `identity` prompt
- **Team** — Groups TeamMembers with a `leaderId` coordinator; supports `subTeamIds` for team-of-teams
- **Spell** — Contextual prompts invoked against entities (skill, task, session, team-member, etc.)
- **TaskList** — Ordered task collection (`orderedTaskIds[]`)

## Session Spawn Flow

1. UI sends `POST /api/sessions/spawn` with task IDs, team member, mode
2. Server creates Session, generates `MaestroManifest` (prompt context, skills, permissions)
3. Server emits `session:spawn_request` via WebSocket
4. UI receives event, spawns terminal via Tauri with env vars + manifest path
5. Terminal runs `maestro worker init` → reads manifest → generates system prompt → starts Claude

## CLI Prompt System

The CLI generates system prompts for agents via the `prompts/` and `prompting/` directories:
- `prompts/identity.ts` — Base identity prompt sections
- `prompts/commands.ts` — Available CLI commands filtered by permissions
- `prompts/spawner.ts` — Coordinator spawn instructions
- `prompting/` — `PromptComposer` assembles the full prompt from manifest data

Agent modes determine prompt behavior: workers get execution instructions, coordinators get delegation/synthesis instructions.

## UI State Management

23 Zustand stores in `src/stores/` manage independent concerns. Key stores:
- `useSessionStore`, `useProjectStore`, `useTaskStore` — server entity state
- `useWorkspaceStore`, `useUIStore` — layout and UI state
- `usePersistentSessionStore`, `useSpacesStore` — localStorage-persisted state

## Key Conventions

- The server uses CommonJS (`"module": "commonjs"` in tsconfig), while the CLI and UI use ESM (`"type": "module"`)
- All server API inputs are validated with Zod schemas in `maestro-server/src/api/validation.ts`
- File-based repos use atomic writes; each entity type has its own subdirectory under the data dir
- The four-mode agent model (worker/coordinator/coordinated-worker/coordinated-coordinator) replaced the legacy execute/coordinate modes — `normalizeMode()` in `types.ts` handles backward compatibility
- Skills are markdown files loaded by `MultiScopeSkillLoader` from multiple scopes (global, project, task)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
