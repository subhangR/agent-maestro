# Maestro CLI

Command-line interface for the Maestro multi-agent orchestration system. Interact with Maestro agents, manage tasks, and control sessions from your terminal.

## Features

- **Task Management** - Create, list, update, and delete tasks
- **Session Control** - Start, stop, and monitor agent sessions
- **Agent Orchestration** - Coordinate multiple agents from the command line
- **Server Integration** - Connect to maestro-server for centralized management
- **Rich CLI Output** - Colorful tables, spinners, and formatted output

## Installation

### Global Installation

```bash
# Install globally
npm install -g @maestro/cli

# Or link for development
cd maestro-cli
npm install
npm run build
npm link
```

### Local Development

```bash
cd maestro-cli
npm install
npm run build
npm start
```

## Quick Start

```bash
# Check installation
maestro --version

# Get help
maestro --help

# List all tasks
maestro task list

# Create a new task
maestro task create "Implement feature X"

# Check project status
maestro status
```

## Commands

### Tasks

```bash
# List all tasks
maestro task list

# Create a task
maestro task create "Task description"

# Get task details
maestro task get <task-id>

# Update task status
maestro task update <task-id> --status completed

# Delete task
maestro task delete <task-id>

# Show task tree
maestro task tree

# Report task progress (from within a session)
maestro task report progress <task-id> "Working on implementation"

# Report task completion
maestro task report complete <task-id> "Feature implemented and tested"
```

### Sessions

```bash
# List sessions
maestro session list

# Get session info
maestro session info [session-id]

# Spawn a worker session for a task
maestro session spawn --task <task-id>

# List sibling sessions
maestro session siblings

# Send a prompt to another session
maestro session prompt <session-id> --message "Your message"

# Watch sessions in real-time
maestro session watch <session-ids>

# Read session logs
maestro session logs <session-id> [<session-id> ...]  # spaces or commas

# Report session progress
maestro session report progress "Making good progress"

# Report session completion
maestro session report complete "All tasks finished"
```

### Teams

```bash
# List teams
maestro team list

# Create a team
maestro team create "Frontend Team" --leader <member-id>

# Get team details
maestro team get <team-id>

# Show team hierarchy
maestro team tree <team-id>
```

### Team Members

```bash
# List team members
maestro team-member list

# Create a team member
maestro team-member create "Alice" --role "Frontend Dev" --avatar "👩‍💻" --mode worker

# Get team member details
maestro team-member get <member-id>

# Edit a team member
maestro team-member edit <member-id> --model opus
```

### Other Commands

```bash
# Show project status summary
maestro status

# Show available commands based on permissions
maestro commands

# Show session identity
maestro whoami
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MAESTRO_SERVER_URL` | Server URL | `http://localhost:3000` |
| `MAESTRO_API_URL` | Alias for server URL | - |
| `MAESTRO_PROJECT_ID` | Current project ID | - |
| `MAESTRO_SESSION_ID` | Current session ID | - |
| `MAESTRO_TASK_IDS` | Comma-separated task IDs for current session | - |
| `MAESTRO_COORDINATOR_SESSION_ID` | Parent coordinator session ID | - |
| `MAESTRO_MANIFEST_PATH` | Path to the session manifest file | - |
| `MAESTRO_DEBUG` | Enable debug logging (`true`/`false`) | `false` |
| `MAESTRO_RETRIES` | Max API retry attempts | `3` |
| `MAESTRO_RETRY_DELAY` | Base retry delay in ms | `1000` |
| `MAESTRO_IS_MASTER` | Whether this is a master session | `false` |
| `MAESTRO_MODE` | Agent mode (worker/coordinator) | `worker` |
| `MAESTRO_CLI_VERSION` | Override reported CLI version | - |
| `MAESTRO_PROMPT_IDENTITY_V2` | Use v2 identity prompts (`true`/`false`) | `true` |
| `MAESTRO_PROMPT_IDENTITY_COORDINATOR_POLICY` | Coordinator identity policy (`permissive`/`strict`) | `strict` |
| `MAESTRO_MANIFEST_FAILURE_POLICY` | Manifest failure behavior (`permissive`/`safe-degraded`) | `safe-degraded` |
| `MAESTRO_INITIAL_DIRECTIVE` | Initial directive for manifest generation | - |
| `MAESTRO_MEMBER_OVERRIDES` | Team member overrides for manifest generation | - |
| `DATA_DIR` | Override data storage directory | `~/.maestro/data` |
| `SESSION_DIR` | Override session directory | - |

## Global Options

All commands support these global options:

```bash
--json              Output in JSON format (for scripting)
--server <url>      Override server URL
--project <id>      Override project ID
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
npm run format
```

### Running Locally

```bash
# Build and run
npm run build
node dist/index.js --help

# Or use npm start
npm start -- --help
```

## Documentation

For detailed documentation, see the [main Maestro documentation](../maestro-docs/)

## License

AGPL-3.0-only - See LICENSE file in root directory
