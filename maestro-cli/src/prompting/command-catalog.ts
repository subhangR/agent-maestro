import type { AgentMode } from '../types/manifest.js';

export interface CommandCatalogEntry {
  id: string;
  description: string;
  syntax: string;
  group: string;
  allowedModes: AgentMode[];
  // Modes in which the command is surfaced in the prompt/help listing.
  // Defaults to allowedModes. Lets a command be executable everywhere
  // (allowedModes) while staying hidden from a given mode's prompt.
  promptModes?: AgentMode[];
  isCore?: boolean;
  hiddenFromPrompt?: boolean;
}

const ALL_MODES: AgentMode[] = ['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator'];
const COORDINATOR_MODES: AgentMode[] = ['coordinator', 'coordinated-coordinator'];
const WORKER_MODES: AgentMode[] = ['worker', 'coordinated-worker'];

// Any session may spawn/coordinate; coordination commands are gated for
// prompt visibility (promptModes) rather than execution. No mode-level exclusions.
const DEFAULT_EXCLUDED_COMMANDS_BY_MODE: Partial<Record<AgentMode, string[]>> = {};

const COMMAND_DEFINITIONS: Array<Omit<CommandCatalogEntry, 'syntax'>> = [
  // Core commands
  { id: 'announce', description: 'Speak a short message aloud via Alexa (Voice Monkey)', group: 'root', allowedModes: ALL_MODES },
  { id: 'whoami', description: 'Print current context', group: 'root', allowedModes: ALL_MODES, isCore: true },
  { id: 'status', description: 'Show project status', group: 'root', allowedModes: ALL_MODES, isCore: true },
  { id: 'commands', description: 'Show available commands', group: 'root', allowedModes: ALL_MODES, isCore: true },

  // Task commands
  { id: 'task:list', description: 'List tasks', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:get', description: 'Get task details', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:create', description: 'Create new task', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:edit', description: 'Edit task fields', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:delete', description: 'Delete a task', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:update', description: 'Update task status/priority', group: 'task', allowedModes: COORDINATOR_MODES },
  { id: 'task:complete', description: 'Mark task completed', group: 'task', allowedModes: COORDINATOR_MODES },
  { id: 'task:block', description: 'Mark task blocked', group: 'task', allowedModes: COORDINATOR_MODES },
  { id: 'task:children', description: 'List child tasks', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:tree', description: 'Show task tree', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:report:progress', description: 'Report task progress', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:report:complete', description: 'Report task completion', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:report:blocked', description: 'Report task blocked', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:report:error', description: 'Report task error', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:docs:add', description: 'Add doc to task', group: 'task', allowedModes: ALL_MODES },
  { id: 'task:docs:list', description: 'List task docs', group: 'task', allowedModes: ALL_MODES },

  // Session commands
  { id: 'session:list', description: 'List sessions', group: 'session', allowedModes: ALL_MODES, promptModes: COORDINATOR_MODES },
  { id: 'session:siblings', description: 'List sibling sessions (other active workers spawned by the same coordinator)', group: 'session', allowedModes: ALL_MODES },
  { id: 'session:info', description: 'Get session info', group: 'session', allowedModes: ALL_MODES, promptModes: COORDINATOR_MODES },
  { id: 'session:watch', description: 'Watch domain events (status changes, explicit reports) via WebSocket. Use session logs for agent output.', group: 'session', allowedModes: ALL_MODES, promptModes: COORDINATOR_MODES },
  { id: 'session:spawn', description: 'Spawn new session', group: 'session', allowedModes: ALL_MODES, promptModes: COORDINATOR_MODES },
  { id: 'session:logs', description: 'Read worker text output from session logs', group: 'session', allowedModes: ALL_MODES, promptModes: COORDINATOR_MODES },
  { id: 'session:prompt', description: 'Send an input prompt to another active session', group: 'session', allowedModes: ALL_MODES },
  { id: 'session:register', description: 'Register session', group: 'session', allowedModes: ALL_MODES, isCore: true, hiddenFromPrompt: true },
  { id: 'session:complete', description: 'Complete session', group: 'session', allowedModes: ALL_MODES, isCore: true, hiddenFromPrompt: true },
  { id: 'session:report:progress', description: 'Report work progress', group: 'session', allowedModes: ALL_MODES },
  { id: 'session:report:complete', description: 'Report completion', group: 'session', allowedModes: ALL_MODES },
  { id: 'session:report:blocked', description: 'Report blocker', group: 'session', allowedModes: ALL_MODES },
  { id: 'session:report:error', description: 'Report error', group: 'session', allowedModes: ALL_MODES },
  { id: 'session:docs:add', description: 'Add doc to session', group: 'session', allowedModes: ALL_MODES },
  { id: 'session:docs:list', description: 'List session docs', group: 'session', allowedModes: ALL_MODES },

  // Legacy report aliases
  { id: 'report:progress', description: 'Report work progress', group: 'report', allowedModes: ALL_MODES, hiddenFromPrompt: true },
  { id: 'report:complete', description: 'Report completion', group: 'report', allowedModes: ALL_MODES, hiddenFromPrompt: true },
  { id: 'report:blocked', description: 'Report blocker', group: 'report', allowedModes: ALL_MODES, hiddenFromPrompt: true },
  { id: 'report:error', description: 'Report error', group: 'report', allowedModes: ALL_MODES, hiddenFromPrompt: true },

  // Project commands
  { id: 'project:list', description: 'List projects', group: 'project', allowedModes: COORDINATOR_MODES },
  { id: 'project:get', description: 'Get project details', group: 'project', allowedModes: COORDINATOR_MODES },
  { id: 'project:create', description: 'Create project', group: 'project', allowedModes: COORDINATOR_MODES },
  { id: 'project:delete', description: 'Delete project', group: 'project', allowedModes: COORDINATOR_MODES },
  { id: 'project:set-master', description: 'Designate project as master', group: 'project', allowedModes: COORDINATOR_MODES },
  { id: 'project:unset-master', description: 'Remove master designation from project', group: 'project', allowedModes: COORDINATOR_MODES },

  // Coordinator commands
  { id: 'coordinator:enable', description: 'Promote this session to coordinator role (unlocks session spawn)', group: 'coordinator', allowedModes: ALL_MODES, promptModes: ALL_MODES },
  { id: 'coordinator:disable', description: 'Demote this session to worker role (re-locks session spawn)', group: 'coordinator', allowedModes: ALL_MODES, promptModes: ALL_MODES },
  { id: 'coordinator:status', description: 'Show current coordinator mode and role', group: 'coordinator', allowedModes: ALL_MODES, promptModes: ALL_MODES },

  // Master commands
  { id: 'master:projects', description: 'List all projects across workspace', group: 'master', allowedModes: ALL_MODES },
  { id: 'master:tasks', description: 'List tasks across all projects', group: 'master', allowedModes: ALL_MODES },
  { id: 'master:sessions', description: 'List sessions across all projects', group: 'master', allowedModes: ALL_MODES },
  { id: 'master:context', description: 'Full workspace overview', group: 'master', allowedModes: ALL_MODES },

  // Init commands
  { id: 'worker:init', description: 'Initialize worker-mode session', group: 'worker', allowedModes: WORKER_MODES, hiddenFromPrompt: true },
  { id: 'orchestrator:init', description: 'Initialize coordinator-mode session', group: 'orchestrator', allowedModes: COORDINATOR_MODES, hiddenFromPrompt: true },

  // Team member commands
  // create/list/get/edit are grantable to worker modes through explicit command overrides
  { id: 'team-member:create', description: 'Create a new team member', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:list', description: 'List team members', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:get', description: 'Get team member details', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:edit', description: 'Edit a team member', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:archive', description: 'Archive a team member', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:unarchive', description: 'Unarchive a team member', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:delete', description: 'Delete a team member (must be archived first)', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:reset', description: 'Reset a default team member to original settings', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:update-identity', description: 'Update own identity/persona (self-awareness)', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:memory:append', description: 'Append an entry to team member memory', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:memory:list', description: 'List team member memory entries', group: 'team-member', allowedModes: ALL_MODES },
  { id: 'team-member:memory:clear', description: 'Clear team member memory', group: 'team-member', allowedModes: ALL_MODES },

  // Team commands
  { id: 'team:list', description: 'List teams', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:get', description: 'Get team details', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:create', description: 'Create a new team', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:edit', description: 'Edit a team', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:delete', description: 'Delete a team (must be archived first)', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:archive', description: 'Archive a team', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:unarchive', description: 'Unarchive a team', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:add-member', description: 'Add members to a team', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:remove-member', description: 'Remove members from a team', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:add-sub-team', description: 'Add a sub-team', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:remove-sub-team', description: 'Remove a sub-team', group: 'team', allowedModes: COORDINATOR_MODES },
  { id: 'team:tree', description: 'Show team hierarchy tree', group: 'team', allowedModes: COORDINATOR_MODES },

  // UI commands
  { id: 'show:modal', description: 'Show HTML modal in UI', group: 'show', allowedModes: ALL_MODES },
  { id: 'modal:events', description: 'Listen for modal user actions', group: 'modal', allowedModes: ALL_MODES },

  // Spell commands
  { id: 'spell:entities', description: 'List available spell entities', group: 'spell', allowedModes: ALL_MODES },
  { id: 'spell:list', description: 'List spells for entity or all', group: 'spell', allowedModes: ALL_MODES },
  { id: 'spell:invoke', description: 'Invoke a spell on a target session', group: 'spell', allowedModes: ALL_MODES },
  { id: 'spell:create', description: 'Create a custom prompt spell', group: 'spell', allowedModes: ALL_MODES },
  { id: 'spell:delete', description: 'Delete a custom prompt spell', group: 'spell', allowedModes: ALL_MODES },

  // Command-log (CLI command-usage audit trail)
  { id: 'command-log:list', description: 'List tracked CLI commands for a session', group: 'command-log', allowedModes: ALL_MODES, hiddenFromPrompt: true },
  { id: 'command-log:stats', description: 'Show CLI command usage stats for a session', group: 'command-log', allowedModes: ALL_MODES, hiddenFromPrompt: true },
  { id: 'command-log:sessions', description: 'List sessions with a tracked command log', group: 'command-log', allowedModes: ALL_MODES, hiddenFromPrompt: true },

  // Internal commands
  { id: 'track-file', description: 'Track file modification', group: 'root', allowedModes: ALL_MODES, isCore: true, hiddenFromPrompt: true },
  { id: 'debug-prompt', description: 'Show system and task prompts sent to agent', group: 'root', allowedModes: ALL_MODES, isCore: true, hiddenFromPrompt: true },
];

const COMMAND_SYNTAX_MAP: Record<string, string> = {
  'announce': 'maestro announce "<text>" [--device <name>]',
  'whoami': 'maestro whoami',
  'status': 'maestro status',
  'commands': 'maestro commands',
  'track-file': 'maestro track-file <filePath>',
  'command-log:list': 'maestro command-log list [--session <id>] [--failed] [--command <prefix>] [--limit <n>]',
  'command-log:stats': 'maestro command-log stats [--session <id>]',
  'command-log:sessions': 'maestro command-log sessions',
  'debug-prompt': 'maestro debug-prompt [--manifest <path>] [--session <id>] [--system-only] [--task-only|--initial-only] [--raw]',

  // Legacy report aliases
  'report:progress': 'maestro report progress "<message>"',
  'report:complete': 'maestro report complete "<summary>"',
  'report:blocked': 'maestro report blocked "<reason>"',
  'report:error': 'maestro report error "<description>"',

  // Task commands
  'task:list': 'maestro task list [taskId] [--status <status>] [--priority <priority>] [--project-id <id>] [--all-projects]',
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
  'session:list': 'maestro session list [--team-member-id <tmId>] [--active] [--project-id <id>] [--all-projects]',
  'session:siblings': 'maestro session siblings',
  'session:info': 'maestro session info [sessionId]',
  'session:watch': 'maestro session watch <sessionId1>,<sessionId2>,...',
  'session:spawn': 'maestro session spawn --task <id> [--project <id>] [--team-member-id <tmId>] [--launch-config <json>]',
  'session:logs': 'maestro session logs [ids] [--my-workers] [--last <n>] [--full] [--max-length <n>]',
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

  // Coordinator commands
  'coordinator:enable': 'maestro coordinator enable',
  'coordinator:disable': 'maestro coordinator disable',
  'coordinator:status': 'maestro coordinator status',

  // Master commands
  'master:projects': 'maestro master projects',
  'master:tasks': 'maestro master tasks [--project <id>]',
  'master:sessions': 'maestro master sessions [--project <id>] [--active]',
  'master:context': 'maestro master context',

  // Team member commands
  'team-member:create': 'maestro team-member create "<name>" --role "<role>" --avatar "<emoji>" --mode <worker|coordinator|coordinated-worker|coordinated-coordinator> [--model <model>] [--agent-tool <tool>] [--identity "<instructions>"]',
  'team-member:list': 'maestro team-member list [--all] [--status <active|archived>] [--mode <worker|coordinator|coordinated-worker|coordinated-coordinator>] [--project-id <id>] [--all-projects]',
  'team-member:get': 'maestro team-member get <teamMemberId>',
  'team-member:edit': 'maestro team-member edit <teamMemberId> [--name "<name>"] [--role "<role>"] [--avatar "<emoji>"] [--mode <worker|coordinator|coordinated-worker|coordinated-coordinator>] [--model <model>] [--agent-tool <tool>] [--identity "<instructions>"]',
  'team-member:archive': 'maestro team-member archive <teamMemberId>',
  'team-member:unarchive': 'maestro team-member unarchive <teamMemberId>',
  'team-member:delete': 'maestro team-member delete <teamMemberId>',
  'team-member:reset': 'maestro team-member reset <teamMemberId>',
  'team-member:update-identity': 'maestro team-member update-identity <teamMemberId> --identity "<new instructions>"',
  'team-member:memory:append': 'maestro team-member memory append <teamMemberId> --entry "<text to remember>"',
  'team-member:memory:list': 'maestro team-member memory list <teamMemberId>',
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

  // Spell commands
  'spell:entities': 'maestro spell entities [--type <entityType>] [--project <projectId>]',
  'spell:list': 'maestro spell list [entityId] [--type <entityType>] [--project-id <id>] [--all-projects]',
  'spell:invoke': 'maestro spell invoke <entityId> [spellName] --target <sessionId> [--args <json>]',
  'spell:create': 'maestro spell create "<name>" --prompt "<text>" [--description "<text>"]',
  'spell:delete': 'maestro spell delete <entityId>',

  // Init commands
  'worker:init': 'maestro worker init',
  'orchestrator:init': 'maestro orchestrator init',

  // UI commands
  'show:modal': 'maestro show modal --id <id> --html-file <path>',
  'modal:events': 'maestro modal events --id <id> [--json]',
};

function fallbackSyntax(commandId: string): string {
  const parts = commandId.split(':');
  if (parts.length === 1) {
    return `maestro ${commandId}`;
  }
  return `maestro ${parts.join(' ')}`;
}

export const COMMAND_CATALOG: CommandCatalogEntry[] = COMMAND_DEFINITIONS.map((definition) => ({
  ...definition,
  syntax: COMMAND_SYNTAX_MAP[definition.id] || fallbackSyntax(definition.id),
}));

const COMMAND_BY_ID = new Map(COMMAND_CATALOG.map((entry) => [entry.id, entry] as const));

export const MASTER_COMMAND_IDS = ['master:projects', 'master:tasks', 'master:sessions', 'master:context'];

export const COMMAND_GROUP_META: Record<string, { prefix: string; description: string }> = {
  coordinator: { prefix: 'maestro coordinator', description: 'Coordinator mode management' },
  report: { prefix: 'maestro report', description: 'Status reporting' },
  task: { prefix: 'maestro task', description: 'Task management' },
  session: { prefix: 'maestro session', description: 'Session management' },
  project: { prefix: 'maestro project', description: 'Project management' },
  master: { prefix: 'maestro master', description: 'Cross-project workspace commands (master sessions only)' },
  'team-member': { prefix: 'maestro team-member', description: 'Team member management' },
  team: { prefix: 'maestro team', description: 'Team management' },
  worker: { prefix: 'maestro worker', description: 'Worker initialization' },
  orchestrator: { prefix: 'maestro orchestrator', description: 'Orchestrator initialization' },
  show: { prefix: 'maestro show', description: 'UI display' },
  modal: { prefix: 'maestro modal', description: 'Modal interaction' },
  spell: { prefix: 'maestro spell', description: 'Spell management and invocation' },
  'command-log': { prefix: 'maestro command-log', description: 'CLI command-usage audit trail' },
};

export function getCommandCatalog(): CommandCatalogEntry[] {
  return COMMAND_CATALOG;
}

export function getCommandById(commandId: string): CommandCatalogEntry | undefined {
  return COMMAND_BY_ID.get(commandId);
}

export function getPromptModes(entry: CommandCatalogEntry): AgentMode[] {
  return entry.promptModes ?? entry.allowedModes;
}

export function isCommandVisibleInPrompt(commandId: string, mode: AgentMode): boolean {
  const entry = getCommandById(commandId);
  if (!entry) return false;
  if (entry.hiddenFromPrompt) return false;
  return getPromptModes(entry).includes(mode);
}

export function getCommandSyntax(commandId: string): string {
  return getCommandById(commandId)?.syntax || fallbackSyntax(commandId);
}

export function getCoreCommandIds(): string[] {
  return COMMAND_CATALOG.filter((entry) => entry.isCore).map((entry) => entry.id);
}

export function getCommandIdsByGroup(group: string): string[] {
  return COMMAND_CATALOG.filter((entry) => entry.group === group).map((entry) => entry.id);
}

export function groupCommandsByParent(
  commandIds: string[],
  mode: AgentMode,
  options: { excludePromptHidden?: boolean } = {},
): Record<string, CommandCatalogEntry[]> {
  const selected = new Set(commandIds);
  const grouped: Record<string, CommandCatalogEntry[]> = {};

  for (const entry of COMMAND_CATALOG) {
    if (!selected.has(entry.id)) continue;
    if (!getPromptModes(entry).includes(mode)) continue;
    if (options.excludePromptHidden && entry.hiddenFromPrompt) continue;

    const group = entry.group || 'root';
    if (!grouped[group]) {
      grouped[group] = [];
    }
    grouped[group].push(entry);
  }

  return grouped;
}

export function getAllCommandIds(): string[] {
  return COMMAND_CATALOG.map((entry) => entry.id);
}

export function getDefaultCommandsForMode(mode: AgentMode): string[] {
  const excluded = new Set(DEFAULT_EXCLUDED_COMMANDS_BY_MODE[mode] || []);
  return COMMAND_CATALOG
    .filter((entry) => entry.allowedModes.includes(mode))
    .map((entry) => entry.id)
    .filter((commandId) => !excluded.has(commandId));
}
