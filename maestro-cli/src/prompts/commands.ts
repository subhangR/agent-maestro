/**
 * Command Reference Prompts
 *
 * All command-related prompt strings: descriptions, syntax, group metadata,
 * and the static commands reference block used in prompts.
 */

import { AgentMode } from "../types/manifest.js";

// ── Command group metadata (for compact command briefs) ─────

export const COMMAND_GROUP_META: Record<string, { prefix: string; description: string }> = {
  report: { prefix: 'maestro report', description: 'Status reporting' },
  task: { prefix: 'maestro task', description: 'Task management' },
  session: { prefix: 'maestro session', description: 'Session management' },
  project: { prefix: 'maestro project', description: 'Project management' },
  master: { prefix: 'maestro master', description: 'Cross-project workspace commands (master sessions only)' },
  'team-member': { prefix: 'maestro team-member', description: 'Team member management' },
  'team': { prefix: 'maestro team', description: 'Team management' },
  worker: { prefix: 'maestro worker', description: 'Worker initialization' },
  orchestrator: { prefix: 'maestro orchestrator', description: 'Orchestrator initialization' },
  show: { prefix: 'maestro show', description: 'UI display' },
  modal: { prefix: 'maestro modal', description: 'Modal interaction' },
};

// ── Static commands reference ──

export const COMMANDS_REFERENCE_HEADER = (mode: AgentMode) => `## Maestro ${mode} Commands`;

export const COMMANDS_REFERENCE_CORE = 'maestro {whoami|status|commands} — Core utilities';

export const COMMANDS_REFERENCE_TASK_MGMT = 'maestro task {list|get|create|edit|delete|children} — Task management';
export const COMMANDS_REFERENCE_TASK_REPORT = 'maestro task report {progress|complete|blocked|error} — Task report';
export const COMMANDS_REFERENCE_TASK_DOCS = 'maestro task docs {add|list} — Task docs';

export const COMMANDS_REFERENCE_SESSION_MGMT = 'maestro session {info|prompt} — Session management';
export const COMMANDS_REFERENCE_SESSION_REPORT = 'maestro session report {progress|complete|blocked|error} — Session report';
export const COMMANDS_REFERENCE_SESSION_DOCS = 'maestro session docs {add|list} — Session docs';

export const COMMANDS_REFERENCE_SHOW = 'maestro show {modal} — UI display';
export const COMMANDS_REFERENCE_MODAL = 'maestro modal {events} — Modal interaction';

// Coordinate-only commands
export const COMMANDS_REFERENCE_SESSION_COORD = 'maestro session {list|spawn|logs} — Session coordination';
export const COMMANDS_REFERENCE_SESSION_SPAWN = 'maestro session spawn --task <id> [--subject "<directive>"] [--message "<instructions>"] [--team-member-id <tmId>] [--launch-config <json>] — Spawn with initial directive';
export const COMMANDS_REFERENCE_SESSION_LOGS = 'maestro session logs [ids...] [--my-workers] [--last <n>] — Read worker text output from session logs; IDs may be separated by spaces or commas';

export const COMMANDS_REFERENCE_FOOTER = 'Run `maestro commands` for full syntax reference.';

// ── Compact command brief labels ────────────────────────────

export const COMPACT_BRIEF_CORE_LABEL = 'Core utilities';

// ── Command descriptions (used in COMMAND_REGISTRY) ─────────

export const CMD_DESC = {
  // Core
  whoami: 'Print current context',
  status: 'Show project status',
  commands: 'Show available commands',

  // Task
  'task:list': 'List tasks',
  'task:get': 'Get task details',
  'task:create': 'Create new task',
  'task:edit': 'Edit task fields',
  'task:delete': 'Delete a task',
  'task:update': 'Update task status/priority',
  'task:complete': 'Mark task completed',
  'task:block': 'Mark task blocked',
  'task:children': 'List child tasks',
  'task:tree': 'Show task tree',
  'task:report:progress': 'Report task progress',
  'task:report:complete': 'Report task completion and close task (transitions status to completed)',
  'task:report:blocked': 'Report task blocked',
  'task:report:error': 'Report task error',
  'task:docs:add': 'Add doc to task',
  'task:docs:list': 'List task docs',

  // Session
  'session:list': 'List sessions',
  'session:siblings': 'List sibling sessions (other active workers spawned by the same coordinator)',
  'session:info': 'Get session info',
  'session:watch': 'Watch domain events (status changes, explicit reports) via WebSocket — does NOT show agent text output; use session logs for that',
  'session:spawn': 'Spawn new session',
  'session:logs': 'Read worker text output from session logs',
  'session:prompt': 'Send an input prompt to another active session',
  'session:register': 'Register session',
  'session:complete': 'Complete session',
  'session:report:progress': 'Report work progress',
  'session:report:complete': 'Report completion',
  'session:report:blocked': 'Report blocker',
  'session:report:error': 'Report error',
  'session:docs:add': 'Add doc to session',
  'session:docs:list': 'List session docs',

  // Legacy report
  'report:progress': 'Report work progress',
  'report:complete': 'Report completion',
  'report:blocked': 'Report blocker',
  'report:error': 'Report error',

  // Project
  'project:list': 'List projects',
  'project:get': 'Get project details',
  'project:create': 'Create project',
  'project:delete': 'Delete project',
  'project:set-master': 'Designate project as master',
  'project:unset-master': 'Remove master designation from project',

  // Master (cross-project, master sessions only)
  'master:projects': 'List all projects across workspace',
  'master:tasks': 'List tasks across all projects',
  'master:sessions': 'List sessions across all projects',
  'master:context': 'Full workspace overview',

  // Init
  'worker:init': 'Initialize worker-mode session',
  'orchestrator:init': 'Initialize coordinator-mode session',

  // Team member
  'team-member:create': 'Create a new team member',
  'team-member:list': 'List team members',
  'team-member:get': 'Get team member details',
  'team-member:edit': 'Edit a team member',
  'team-member:archive': 'Archive a team member',
  'team-member:unarchive': 'Unarchive a team member',
  'team-member:delete': 'Delete a team member (must be archived first)',
  'team-member:reset': 'Reset a default team member to original settings',
  'team-member:update-identity': 'Update own identity/persona (self-awareness)',
  'team-member:memory:append': 'Append an entry to team member memory',
  'team-member:memory:list': 'List team member memory entries',
  'team-member:memory:edit': 'Edit a single team member memory entry in place',
  'team-member:memory:remove': 'Remove a single team member memory entry',
  'team-member:memory:clear': 'Clear team member memory',

  // Team
  'team:list': 'List teams',
  'team:get': 'Get team details',
  'team:create': 'Create a new team',
  'team:edit': 'Edit a team',
  'team:delete': 'Delete a team (must be archived first)',
  'team:archive': 'Archive a team',
  'team:unarchive': 'Unarchive a team',
  'team:add-member': 'Add members to a team',
  'team:remove-member': 'Remove members from a team',
  'team:add-sub-team': 'Add a sub-team',
  'team:remove-sub-team': 'Remove a sub-team',
  'team:tree': 'Show team hierarchy tree',

  // Show/Modal
  'show:modal': 'Show HTML modal in UI',
  'modal:events': 'Listen for modal user actions',

  // Utility
  'track-file': 'Track file modification',
  'debug-prompt': 'Show system and task prompts sent to agent',
} as const;

// ── Command syntax (used for help and prompt generation) ────

export const CMD_SYNTAX: Record<string, string> = {
  'whoami': 'maestro whoami',
  'status': 'maestro status',
  'commands': 'maestro commands',
  'track-file': 'maestro track-file <filePath>',
  // Legacy report aliases
  'report:progress': 'maestro report progress "<message>"',
  'report:complete': 'maestro report complete "<summary>"',
  'report:blocked': 'maestro report blocked "<reason>"',
  'report:error': 'maestro report error "<description>"',
  // Task commands
  'task:list': 'maestro task list [taskId] [--status <status>] [--priority <priority>]',
  'task:get': 'maestro task get <taskId>',
  'task:create': 'maestro task create "<title>" [-d "<description>"] [--priority <high|medium|low>] [--parent <parentId>]',
  'task:edit': 'maestro task edit <taskId> [--title "<title>"] [--desc "<description>"] [--priority <priority>]',
  'task:delete': 'maestro task delete <taskId> [--cascade]',
  'task:update': 'maestro task update <taskId> [--status <status>] [--priority <priority>] [--title "<title>"]',
  'task:complete': 'maestro task complete <taskId>',
  'task:block': 'maestro task block <taskId> --reason "<reason>"',
  'task:children': 'maestro task children <taskId> [--recursive]',
  'task:tree': 'maestro task tree [--root <taskId>] [--depth <n>] [--status <status>]',
  'task:report:progress': 'maestro task report progress <taskId> "<message>"',
  'task:report:complete': 'maestro task report complete <taskId> "<summary>"',
  'task:report:blocked': 'maestro task report blocked <taskId> "<reason>"',
  'task:report:error': 'maestro task report error <taskId> "<description>"',
  'task:docs:add': 'maestro task docs add <taskId> "<title>" --file <filePath>',
  'task:docs:list': 'maestro task docs list <taskId>',
  // Session commands
  'session:list': 'maestro session list [--team-member-id <tmId>] [--active]',
  'session:siblings': 'maestro session siblings',
  'session:info': 'maestro session info [sessionId]',
  'session:watch': 'maestro session watch <sessionId1>,<sessionId2>,...',
  'session:spawn': 'maestro session spawn --task <id> [--team-member-id <tmId>] [--launch-config <json>]',
  'session:logs': 'maestro session logs [ids...] [--my-workers] [--last <n>] [--full] [--max-length <n>]',
  'session:prompt': 'maestro session prompt <targetSessionId> --message "<text>" [--mode send|paste]',
  'session:register': 'maestro session register',
  'session:complete': 'maestro session complete',
  'session:report:progress': 'maestro session report progress "<message>"',
  'session:report:complete': 'maestro session report complete "<summary>"',
  'session:report:blocked': 'maestro session report blocked "<reason>"',
  'session:report:error': 'maestro session report error "<description>"',
  'session:docs:add': 'maestro session docs add "<title>" --file <filePath>',
  'session:docs:list': 'maestro session docs list',
  // Project commands
  'project:list': 'maestro project list',
  'project:get': 'maestro project get <projectId>',
  'project:create': 'maestro project create "<name>"',
  'project:delete': 'maestro project delete <projectId>',
  'project:set-master': 'maestro project set-master <projectId>',
  'project:unset-master': 'maestro project unset-master <projectId>',
  // Master commands (master sessions only)
  'master:projects': 'maestro master projects',
  'master:tasks': 'maestro master tasks [--project <id>]',
  'master:sessions': 'maestro master sessions [--project <id>]',
  'master:context': 'maestro master context',
  // Team member commands
  'team-member:create': 'maestro team-member create "<name>" --role "<role>" --avatar "<emoji>" --mode <worker|coordinator|coordinated-worker|coordinated-coordinator> [--model <model>] [--agent-tool <tool>] [--identity "<instructions>"]',
  'team-member:list': 'maestro team-member list [--all] [--status <active|archived>] [--mode <worker|coordinator|coordinated-worker|coordinated-coordinator>]',
  'team-member:get': 'maestro team-member get <teamMemberId>',
  'team-member:edit': 'maestro team-member edit <teamMemberId> [--name "<name>"] [--role "<role>"] [--avatar "<emoji>"] [--mode <worker|coordinator|coordinated-worker|coordinated-coordinator>] [--model <model>] [--agent-tool <tool>] [--identity "<instructions>"]',
  'team-member:archive': 'maestro team-member archive <teamMemberId>',
  'team-member:unarchive': 'maestro team-member unarchive <teamMemberId>',
  'team-member:delete': 'maestro team-member delete <teamMemberId>',
  'team-member:reset': 'maestro team-member reset <teamMemberId>',
  'team-member:update-identity': 'maestro team-member update-identity <teamMemberId> --identity "<new instructions>"',
  'team-member:memory:append': 'maestro team-member memory append <teamMemberId> --entry "<text to remember>"',
  'team-member:memory:list': 'maestro team-member memory list <teamMemberId>',
  'team-member:memory:edit': 'maestro team-member memory edit <teamMemberId> <index> --entry "<new text>"',
  'team-member:memory:remove': 'maestro team-member memory remove <teamMemberId> <index>',
  'team-member:memory:clear': 'maestro team-member memory clear <teamMemberId>',
  // Team commands
  'team:list': 'maestro team list [--all] [--status <active|archived>]',
  'team:get': 'maestro team get <teamId>',
  'team:create': 'maestro team create "<name>" --leader <teamMemberId> [--members <id1,id2,...>] [--description "<text>"] [--avatar "<emoji>"]',
  'team:edit': 'maestro team edit <teamId> [--name "<name>"] [--leader <teamMemberId>] [--description "<text>"] [--avatar "<emoji>"]',
  'team:delete': 'maestro team delete <teamId>',
  'team:archive': 'maestro team archive <teamId>',
  'team:unarchive': 'maestro team unarchive <teamId>',
  'team:add-member': 'maestro team add-member <teamId> <memberIds...>',
  'team:remove-member': 'maestro team remove-member <teamId> <memberIds...>',
  'team:add-sub-team': 'maestro team add-sub-team <teamId> <subTeamId>',
  'team:remove-sub-team': 'maestro team remove-sub-team <teamId> <subTeamId>',
  'team:tree': 'maestro team tree <teamId>',
  'debug-prompt': 'maestro debug-prompt [--manifest <path>] [--session <id>] [--system-only] [--task-only|--initial-only] [--raw]',
  'worker:init': 'maestro worker init',
  'orchestrator:init': 'maestro orchestrator init',
};

// ── Guard error messages ────────────────────────────────────

export const COMMAND_NOT_ALLOWED_PREFIX = "Command '";
export const COMMAND_NOT_ALLOWED_SUFFIX = "' is not allowed for ";
export const COMMAND_NOT_ALLOWED_HINT = 'Run "maestro commands" to see available commands.';

export function formatCommandNotAllowed(commandName: string, mode: string): string {
  return `${COMMAND_NOT_ALLOWED_PREFIX}${commandName}${COMMAND_NOT_ALLOWED_SUFFIX}${mode} mode.\n${COMMAND_NOT_ALLOWED_HINT}`;
}

// ── CLI output labels ───────────────────────────────────────

export const AVAILABLE_COMMANDS_HEADER = (mode: AgentMode) => `\nAvailable ${mode} Commands:`;
export const AVAILABLE_COMMANDS_SEPARATOR = '-------------------';
export const HIDDEN_COMMANDS_LABEL = (count: number) => `(${count} commands hidden based on mode)`;
