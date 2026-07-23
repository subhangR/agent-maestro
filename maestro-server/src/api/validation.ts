import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ACTIONS_BY_EVENT } from '../types';

// --- Reusable patterns ---

// Safe ID: alphanumeric, hyphens, underscores (prevents command injection)
const safeId = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'ID must be alphanumeric with hyphens/underscores only');

// String with reasonable length limits
const shortString = z.string().min(1);
const longString = z.string();

// --- Enums ---

const taskStatusSchema = z.enum(['todo', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked']);
const taskSessionStatusSchema = z.enum(['working', 'blocked', 'completed', 'failed', 'skipped']);
const taskPrioritySchema = z.enum(['low', 'medium', 'high']);
const sessionStatusSchema = z.enum(['spawning', 'idle', 'working', 'completed', 'failed', 'stopped']);
const workerStrategySchema = z.enum(['simple', 'tree']);
const orchestratorStrategySchema = z.enum(['default', 'intelligent-batching', 'dag']);
const agentModeSchema = z.enum(['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator', 'execute', 'coordinate']);
const templateModeSchema = z.enum(['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator', 'execute', 'coordinate']);
const modelSchema = z.string().min(1);
const updateSourceSchema = z.enum(['user', 'session']);

const timelineEventTypeSchema = z.enum([
  'session_started', 'session_stopped',
  'task_started', 'task_completed', 'task_failed', 'task_skipped', 'task_blocked',
  'needs_input', 'progress', 'error', 'milestone'
]);

// --- Param schemas ---

export const idParamSchema = z.object({
  id: safeId,
});

export const idAndTaskIdParamSchema = z.object({
  id: safeId,
  taskId: safeId,
});

export const idAndModalIdParamSchema = z.object({
  id: safeId,
  modalId: safeId,
});

export const modeParamSchema = z.object({
  mode: agentModeSchema,
});

// --- Project schemas ---

// Canonical per-project GitHub repository URL: `https://github.com/<owner>/<repo>`.
// Strict on purpose (this is the trust boundary): https only, host must be exactly
// github.com, exactly one owner and one repo segment, no `.git` suffix, no trailing
// slash, no extra path/query. Owner/repo allow the characters GitHub permits. The
// repo segment may lead with a `.` (GitHub allows this, e.g. the special `.github`
// repo) but not be exactly the reserved segments `.` or `..`.
const githubRepoUrl = z
  .string()
  .regex(
    /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/(?!\.{1,2}$)[A-Za-z0-9._-]+$/,
    'githubUrl must be a canonical GitHub repository URL (https://github.com/owner/repo)'
  )
  .refine((v) => !/\.git$/i.test(v), 'githubUrl must not end with .git');

// Optional on the wire; an empty string is an explicit request to clear the saved URL.
const githubUrlField = githubRepoUrl.or(z.literal('')).optional();

export const createProjectSchema = z.object({
  name: shortString,
  workingDir: z.string().min(1).max(1000),
  description: z.string().max(500).optional(),
  githubUrl: githubUrlField,
  isMaster: z.boolean().optional(),
}).strict();

export const updateProjectSchema = z.object({
  name: shortString.optional(),
  workingDir: z.string().min(1).max(1000).optional(),
  description: z.string().max(500).optional(),
  githubUrl: githubUrlField,
  isMaster: z.boolean().optional(),
}).strict();

export const masterToggleSchema = z.object({
  isMaster: z.boolean(),
}).strict();

// --- Shared schemas ---

const permissionModeSchema = z.enum(['acceptEdits', 'interactive', 'readOnly', 'bypassPermissions']);
const launchProviderSchema = z.enum(['claude', 'openai', 'hermes', 'gemini']);
const launchReasoningEffortSchema = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const launchSpeedSchema = z.enum(['standard', 'fast']);
const launchAccessModeSchema = z.enum(['safe', 'acceptEdits', 'plan', 'fullAccess']);

// NOTE: intentionally NOT `.strict()`. launchConfig is the canonical, evolving
// launch shape; a newer/older UI may send extra keys (e.g. a future `temperature`).
// Unknown keys are stripped by Zod's default behavior, and `sanitizeLaunchConfig`
// re-derives the object from a strict allow-list before use — so dropping `.strict()`
// here buys forward/backward compatibility without weakening runtime safety.
const launchConfigSchema = z.object({
  provider: launchProviderSchema,
  model: z.string().min(1).max(200),
  reasoningEffort: launchReasoningEffortSchema.optional(),
  speed: launchSpeedSchema.optional(),
  accessMode: launchAccessModeSchema.optional(),
});

const memberLaunchOverrideSchema = z.object({
  launchConfig: launchConfigSchema.optional(),
  // Free string (not a strict enum) for backward compatibility with legacy/custom
  // agentTool values persisted before PR #83 (e.g. 'claude'). Route-level
  // normalization (launchConfigFromLegacy/providerForAgentTool) safely defaults
  // unknown tools to the Claude provider.
  agentTool: z.string().max(100).optional(),
  model: z.string().min(1).max(200).optional(),
  reasoningEffort: launchReasoningEffortSchema.optional(),
  permissionMode: permissionModeSchema.optional(),
  skillIds: z.array(z.string()).optional(),
  commandPermissions: z.object({
    groups: z.record(z.string(), z.boolean()).optional(),
    commands: z.record(z.string(), z.boolean()).optional(),
  }).optional(),
}).strict();

// --- Model profile schemas ---

export const createModelProfileSchema = z.object({
  name: shortString.max(100),
  description: z.string().max(500).optional(),
  launchConfig: launchConfigSchema,
}).strict();

export const updateModelProfileSchema = z.object({
  name: shortString.max(100).optional(),
  description: z.string().max(500).optional(),
  launchConfig: launchConfigSchema.optional(),
}).strict();

// --- Session prompt schemas ---

export const sendSessionPromptSchema = z.object({
  content: z.string().min(1, 'content is required'),
  mode: z.enum(['send', 'paste']).optional().default('send'),
  senderSessionId: safeId,
}).strict();

// --- Task schemas ---

export const createTaskSchema = z.object({
  projectId: safeId,
  parentId: safeId.optional(),
  title: z.string().optional().default(""),
  description: longString.optional(),
  priority: taskPrioritySchema.optional(),
  initialPrompt: longString.optional(),
  skillIds: z.array(safeId).optional(),
  referenceTaskIds: z.array(safeId).optional(),
  model: modelSchema.optional(),
  teamMemberId: safeId.optional(),
  teamMemberIds: z.array(safeId).optional(),
  teamId: safeId.nullable().optional(),
  memberOverrides: z.record(safeId, memberLaunchOverrideSchema).optional(),
  dangerousMode: z.boolean().optional(),
  useWorktree: z.boolean().optional(),
  dueDate: z.string().optional(),
  clientRequestId: z.string().max(200).optional(),
  spellIds: z.array(safeId).optional(),
}).strict();

export const updateTaskSchema = z.object({
  title: shortString.optional(),
  description: longString.optional(),
  status: taskStatusSchema.optional(),
  sessionStatus: taskSessionStatusSchema.optional(),  // Backward compat for session-source updates
  taskSessionStatuses: z.record(safeId, taskSessionStatusSchema).optional(),
  priority: taskPrioritySchema.optional(),
  sessionIds: z.array(safeId).optional(),
  skillIds: z.array(safeId).optional(),
  referenceTaskIds: z.array(safeId).optional(),
  agentIds: z.array(safeId).optional(),
  model: modelSchema.optional(),
  updateSource: updateSourceSchema.optional(),
  sessionId: safeId.optional(),
  teamMemberId: safeId.optional(),
  teamMemberIds: z.array(safeId).optional(),
  teamId: safeId.nullable().optional(),
  memberOverrides: z.record(safeId, memberLaunchOverrideSchema).optional(),
  dangerousMode: z.boolean().optional(),
  useWorktree: z.boolean().optional(),
  spellIds: z.array(safeId).optional(),
  dueDate: z.string().nullable().optional(),
}).strict();

const docKindSchema = z.enum(['markdown', 'diagram']);

// Allow larger content for diagram scene JSON (up to 10 MB)
const docContentSchema = z.string().max(10_000_000).optional();

export const addTaskDocSchema = z.object({
  title: shortString,
  filePath: z.string().min(1).max(2000),
  content: docContentSchema,
  kind: docKindSchema.optional(),
  sessionId: safeId,
}).strict();

export const updateDocContentSchema = z.object({
  content: z.string().max(10_000_000),
}).strict();

export const taskTimelineSchema = z.object({
  type: timelineEventTypeSchema.optional().default('progress'),
  message: shortString,
  sessionId: safeId,
}).strict();

export const listTasksQuerySchema = z.object({
  projectId: safeId.optional(),
  status: taskStatusSchema.optional(),
  parentId: z.union([safeId, z.literal('null')]).optional(),
}).strict();

// --- Task List schemas ---

export const createTaskListSchema = z.object({
  projectId: safeId,
  name: shortString,
  description: longString.optional(),
  orderedTaskIds: z.array(safeId).optional(),
}).strict();

export const updateTaskListSchema = z.object({
  name: shortString.optional(),
  description: longString.optional(),
  orderedTaskIds: z.array(safeId).optional(),
}).strict();

export const listTaskListsQuerySchema = z.object({
  projectId: safeId.optional(),
}).strict();

export const reorderTaskListSchema = z.object({
  orderedTaskIds: z.array(safeId),
}).strict();

// --- Task Graph schemas ---

const taskGraphNodeSchema = z.object({
  taskId: safeId,
  position: z.object({ x: z.number(), y: z.number() }),
  teamMemberId: safeId.optional(),
  memberOverrides: memberLaunchOverrideSchema.optional(),
}).strict();

const taskGraphEdgeSchema = z.object({
  id: z.string().max(100),
  sourceTaskId: safeId,
  targetTaskId: safeId,
  label: z.string().max(200).optional(),
}).strict();

export const createTaskGraphSchema = z.object({
  projectId: safeId,
  name: shortString,
  description: longString.optional(),
  nodes: z.array(taskGraphNodeSchema).optional(),
  edges: z.array(taskGraphEdgeSchema).optional(),
  coordinatorTeamMemberId: safeId.optional(),
  coordinatorModel: z.string().optional(),
}).strict();

export const updateTaskGraphSchema = z.object({
  name: shortString.optional(),
  description: longString.optional(),
  nodes: z.array(taskGraphNodeSchema).optional(),
  edges: z.array(taskGraphEdgeSchema).optional(),
  coordinatorTeamMemberId: safeId.optional(),
  coordinatorModel: z.string().optional(),
  status: z.enum(['draft', 'ready']).optional(),
}).strict();

export const listTaskGraphsQuerySchema = z.object({
  projectId: safeId.optional(),
  status: z.string().optional(),
}).strict();

// --- Team member schemas ---

export const teamMemberScopeSchema = z.enum(['project', 'global']);

export const createTeamMemberSchema = z.object({
  projectId: safeId,
  scope: teamMemberScopeSchema.optional(),
  name: shortString,
  role: shortString,
  identity: z.string().max(10000).optional(),
  avatar: shortString,
  model: z.string().max(100).optional(),
  modelProfileId: safeId.optional(),
  agentTool: z.string().max(100).optional(),
  mode: agentModeSchema.optional(),
  permissionMode: permissionModeSchema.optional(),
  strategy: z.string().max(100).optional(),
  skillIds: z.array(safeId).optional(),
  capabilities: z.object({
    can_spawn_sessions: z.boolean().optional(),
    can_edit_tasks: z.boolean().optional(),
    can_report_task_level: z.boolean().optional(),
    can_report_session_level: z.boolean().optional(),
  }).optional(),
  commandPermissions: z.object({
    groups: z.record(z.string(), z.boolean()).optional(),
    commands: z.record(z.string(), z.boolean()).optional(),
  }).optional(),
  workflowTemplateId: z.string().max(200).optional(),
  customWorkflow: z.string().max(10000).optional(),
  soundInstrument: z.string().max(100).optional(),
}).strict();

export const updateTeamMemberSchema = z.object({
  projectId: safeId,
  scope: teamMemberScopeSchema.optional(),
  name: shortString.optional(),
  role: shortString.optional(),
  identity: z.string().max(10000).optional(),
  avatar: shortString.optional(),
  model: z.string().max(100).optional(),
  // Empty string clears the binding (member falls back to its raw model).
  modelProfileId: z.string().regex(/^[a-zA-Z0-9_-]*$/, 'ID must be alphanumeric with hyphens/underscores only').max(100).optional(),
  agentTool: z.string().max(100).optional(),
  mode: agentModeSchema.optional(),
  permissionMode: permissionModeSchema.optional(),
  strategy: z.string().max(100).optional(),
  skillIds: z.array(safeId).optional(),
  status: z.enum(['active', 'archived']).optional(),
  capabilities: z.object({
    can_spawn_sessions: z.boolean().optional(),
    can_edit_tasks: z.boolean().optional(),
    can_report_task_level: z.boolean().optional(),
    can_report_session_level: z.boolean().optional(),
  }).optional(),
  commandPermissions: z.object({
    groups: z.record(z.string(), z.boolean()).optional(),
    commands: z.record(z.string(), z.boolean()).optional(),
  }).optional(),
  workflowTemplateId: z.string().max(200).optional(),
  customWorkflow: z.string().max(10000).optional(),
  memory: z.array(z.string().max(500)).optional(),
  soundInstrument: z.string().max(100).optional(),
}).strict();

// --- Session schemas ---

export const createSessionSchema = z.object({
  projectId: safeId,
  taskId: safeId.optional(),         // backward compat
  taskIds: z.array(safeId).optional(),
  name: shortString.optional(),
  agentId: safeId.optional(),
  claudeSessionId: z.string().uuid().optional(),
  strategy: z.union([workerStrategySchema, orchestratorStrategySchema]).optional(),
  status: sessionStatusSchema.optional(),
  env: z.record(z.string(), z.string().max(5000)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const updateSessionSchema = z.object({
  taskIds: z.array(safeId).optional(),
  status: sessionStatusSchema.optional(),
  agentId: safeId.optional(),
  claudeSessionId: z.string().uuid().optional(),
  completedAt: z.number().optional(),
  humanCompletedAt: z.number().nullable().optional(),
  archivedAt: z.number().nullable().optional(),
  env: z.record(z.string(), z.string().max(5000)).optional(),
  events: z.array(z.object({
    id: safeId,
    timestamp: z.number(),
    type: z.string().max(100),
    data: z.unknown().optional(),
  })).optional(),
  timeline: z.array(z.object({
    id: safeId,
    type: timelineEventTypeSchema,
    timestamp: z.number(),
    message: shortString.optional(),
    taskId: safeId.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
  needsInput: z.object({
    active: z.boolean(),
    message: z.string().max(1000).optional(),
    since: z.number().optional(),
  }).optional(),
}).strict();

export const sessionEventSchema = z.object({
  type: z.string().min(1).max(100),
  data: z.unknown().optional(),
}).strict();

export const sessionTimelineSchema = z.object({
  type: timelineEventTypeSchema.optional().default('progress'),
  message: shortString,
  taskId: safeId.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const listSessionsQuerySchema = z.object({
  projectId: safeId.optional(),
  taskId: safeId.optional(),
  status: z.string().optional(),    // Comma-separated list of statuses
  active: z.enum(['true', 'false']).optional(),
  parentSessionId: safeId.optional(),
  rootSessionId: safeId.optional(),
  teamSessionId: safeId.optional(),
  fields: z.enum(['full', 'summary']).optional(),
});

export const modeBodySchema = z.object({
  role: z.enum(['worker', 'coordinator']),
}).strict();

// --- Spawn session schema ---

const allStrategySchema = z.enum(['simple', 'tree', 'default', 'intelligent-batching', 'dag']);

// Terminal dimension reported by the browser; clamped so a malformed/hostile
// client can't drive the PTY winsize to an absurd value.
export const ptyDimensionSchema = z.number().int().min(1).max(1000);

export const spawnSessionSchema = z.object({
  projectId: safeId.optional(),
  taskIds: z.array(safeId).min(1),
  sessionName: shortString.optional(),
  skills: z.array(z.string().max(200)).optional(),
  sessionId: safeId.optional(),
  spawnSource: z.enum(['ui', 'session']).optional().default('ui'),
  mode: agentModeSchema.optional().default('worker'),
  strategy: allStrategySchema.optional().default('simple'),
  context: z.record(z.string(), z.unknown()).optional(),
  launchConfig: launchConfigSchema.optional(),
  // Free string (not a strict enum) so legacy clients/persisted spawn payloads
  // with older agentTool values still validate; normalized server-side.
  agentTool: z.string().max(100).optional(),
  model: z.string().min(1).max(200).optional(),
  reasoningEffort: launchReasoningEffortSchema.optional(),
  teamMemberId: safeId.optional(),
  teamMemberIds: z.array(safeId).optional(),
  delegateTeamMemberIds: z.array(safeId).optional(),
  teamId: safeId.nullable().optional(),
  initialDirective: z.object({
    subject: shortString,
    message: longString,
    fromSessionId: safeId.optional(),
  }).optional(),
  memberOverrides: z.record(safeId, memberLaunchOverrideSchema).optional(),
  permissionMode: permissionModeSchema.optional(),
  delegatePermissionMode: permissionModeSchema.optional(),
  useWorktree: z.boolean().optional(),
  // Web mode: the browser's measured terminal size, so the server-hosted PTY
  // boots at the real pane width instead of the 80x24 default. Spawning at the
  // wrong width makes the agent (Ink TUI) author its first frames at 80 cols,
  // which then desync against the wider xterm grid (overlapping glyphs) until a
  // manual resize. Optional: legacy/desktop callers omit it and fall back to 80x24.
  cols: ptyDimensionSchema.optional(),
  rows: ptyDimensionSchema.optional(),
}).strict();

// Web mode only: the browser asks the server to spawn a PTY it can then attach
// to over /pty?sessionId=<id>. Plain terminals have no spawn step otherwise, so
// the WS finds no live PTY, closes 1011, and the terminal dies instantly. This
// endpoint lets the client request the PTY first. sessionId is the id it will
// attach with; everything else is optional (empty command => interactive shell).
export const ptySpawnSchema = z.object({
  sessionId: z.string().min(1).max(200),
  command: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
  env: z.record(z.string(), z.string().max(5000)).optional(),
  cols: ptyDimensionSchema.optional(),
  rows: ptyDimensionSchema.optional(),
}).strict();

// --- Template schemas ---

export const createTemplateSchema = z.object({
  name: shortString,
  mode: templateModeSchema,
  content: longString,
}).strict();

export const updateTemplateSchema = z.object({
  name: shortString.optional(),
  content: longString.optional(),
}).strict();

// --- Spell schemas ---

const spellEntityTypeSchema = z.enum([
  'maestro', 'skill', 'team-member', 'task', 'doc', 'session', 'custom-prompt'
]);

export const invokeSpellSchema = z.object({
  entityType: spellEntityTypeSchema,
  entityId: safeId,
  // CLI may send `null` to mean "default spell"; server treats that as 'send'.
  spellName: z.string().min(1).max(100).nullable().optional(),
  // Either targetSessionId (single) or targetSessionIds[] (multi, P2 forward-compat).
  targetSessionId: safeId.optional(),
  targetSessionIds: z.array(safeId).optional(),
  // Match spellActivationSchema: clients may send `null` to mean "no invoker".
  invokerSessionId: safeId.nullable().optional(),
  projectId: safeId,
  // Loose passthrough for future per-spell args (CLI --args JSON).
  args: z.record(z.string(), z.any()).optional(),
}).strict();

export const listSpellEntitiesQuerySchema = z.object({
  projectId: safeId,
}).strict();

export const listSpellDefinitionsQuerySchema = z.object({
  entityType: spellEntityTypeSchema.optional(),
}).strict();

export const createCustomPromptSchema = z.object({
  name: shortString,
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
  content: longString,
  tags: z.array(z.string().max(50)).max(10).optional(),
  entityType: spellEntityTypeSchema.optional(),
}).strict();

export const updateCustomPromptSchema = z.object({
  name: shortString.optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
  content: longString.optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  entityType: spellEntityTypeSchema.optional(),
}).strict();

// --- Spell entity (v2 — multi-rule, discriminated unions) ---

const spellColorSchema = z.enum([
  'amber', 'rose', 'violet', 'sky', 'emerald', 'fuchsia', 'lime', 'cyan', 'indigo',
]);
const spellActionTypeSchema = z.enum([
  'inject-prompt', 'feed-context', 'run-command', 'continue-loop', 'notify-channel',
]);
const spellLoopTypeSchema = z.enum([
  'single-shot', 'continue-until-done', 'plan-execute', 'critic-refine',
]);
const spellHookEventSchema = z.enum([
  'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop',
  'SubagentStop', 'Notification', 'SessionStart', 'SessionEnd',
]);
/**
 * Reject regular-expression patterns prone to catastrophic backtracking.
 * The spell matcher runs `new RegExp(matcher).test(target)` on the hot hook
 * dispatch path; a pathological pattern (e.g. `(a+)+$`) would stall the
 * single-threaded Node event loop. Heuristic detection without an extra dep:
 *   1. pattern must compile as a valid RegExp
 *   2. reject nested quantifiers around groups: `(...+)+`, `(...*)*`, `(...+)*`, etc.
 *   3. reject quantifier on a disjunction-with-overlap: `(a|a)+`, `(a|ab)+`
 *   4. cap stars-of-stars constructs like `(a*)+`
 * Patterns failing these checks are rare in practice; legitimate matchers
 * (`Bash`, `Edit|Write`, `^src/.*\\.ts$`) all pass.
 */
function isSafeRegex(pattern: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
  } catch {
    return false;
  }
  // Nested quantifiers on a group: (X+)+ / (X*)* / (X+)* / (X*)+
  if (/\([^()]*[+*]\)[+*?]/.test(pattern)) return false;
  // Nested quantifier separated by a quantifier-friendly token, e.g. (a+){2,}
  if (/\([^()]*[+*]\)\{\d+,?\d*\}/.test(pattern)) return false;
  // Alternation where one branch is a prefix of another, quantified: (a|ab)+
  const altMatch = pattern.match(/\(([^()|]+)\|([^()|]+)\)[+*]/);
  if (altMatch) {
    const [, left, right] = altMatch;
    if (left === right || left.startsWith(right) || right.startsWith(left)) {
      return false;
    }
  }
  return true;
}

// Trigger — discriminated union on `type`. `schedule` is schema-ready but a
// rule that carries one is REJECTED at save in v1 (see spellRuleSchema below).
const spellHookTriggerSchema = z.object({
  type: z.literal('hook'),
  hookEvent: spellHookEventSchema,
  matcher: z
    .string()
    .max(500)
    .refine(isSafeRegex, {
      message: 'matcher must be a valid, non-backtracking regular expression',
    })
    .optional(),
}).strict();

const spellScheduleTriggerSchema = z.object({
  type: z.literal('schedule'),
  cron: z.string().max(200).optional(),
  intervalMs: z.number().int().positive().max(2_147_483_647).optional(),
}).strict();

const spellTriggerSchema = z.discriminatedUnion('type', [
  spellHookTriggerSchema,
  spellScheduleTriggerSchema,
]);

// Action config — discriminated union on `type` (PI-1). Each variant carries
// and requires only its own fields; run-command exposes no timeoutMs (async).
const spellActionConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('inject-prompt'),
    prompt: z.string().min(1).max(10_000),
  }).strict(),
  z.object({
    type: z.literal('feed-context'),
    prompt: z.string().min(1).max(10_000),
  }).strict(),
  z.object({
    type: z.literal('run-command'),
    command: z.string().min(1).max(1_000),
    args: z.array(z.string().max(2_000)).max(50).optional(),
    cwd: z.string().max(1_000).optional(),
    feedOutput: z.boolean().optional(),
  }).strict(),
  z.object({
    type: z.literal('continue-loop'),
    loopType: spellLoopTypeSchema.optional(),
    maxIterations: z.number().int().min(1).max(100).optional(),
  }).strict(),
  z.object({
    type: z.literal('notify-channel'),
    // C3: `channel` dropped — notify-channel is in-app only now. `level` drives
    // the toast/activity severity styling.
    message: z.string().max(2_000).optional(),
    level: z.enum(['info', 'success', 'warn']).optional(),
  }).strict(),
]);

// A single { trigger → action } rule. Cross-field checks (§11.4):
//   1. reject `schedule` triggers in v1 (no engine yet — no dead config accrues)
//   2. action.type must be allowed for the hook event (ACTIONS_BY_EVENT matrix)
const spellRuleSchema = z.object({
  id: safeId.optional(),
  label: z.string().max(100).optional(),
  enabled: z.boolean(),
  trigger: spellTriggerSchema,
  action: spellActionConfigSchema,
}).strict().superRefine((rule, ctx) => {
  if (rule.trigger.type === 'schedule') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['trigger', 'type'],
      message: 'Scheduled triggers are not available yet',
    });
    return;
  }
  const allowed = ACTIONS_BY_EVENT[rule.trigger.hookEvent] ?? [];
  if (!allowed.includes(rule.action.type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['action', 'type'],
      message: `Action "${rule.action.type}" is not allowed for hook event "${rule.trigger.hookEvent}"`,
    });
  }
});

export const createSpellSchema = z.object({
  name: shortString,
  description: z.string().max(1000),
  icon: z.string().max(10).optional(),
  color: spellColorSchema,
  rules: z.array(spellRuleSchema).min(1).max(20),
}).strict();

export const updateSpellSchema = z.object({
  name: shortString.optional(),
  description: z.string().max(1000).optional(),
  icon: z.string().max(10).optional(),
  color: spellColorSchema.optional(),
  rules: z.array(spellRuleSchema).min(1).max(20).optional(),
}).strict();

export const spellActivationSchema = z.object({
  targetSessionIds: z.array(safeId).min(1),
  // UI always sends `invokerSessionId: null` for UI-cast (no invoker session). The
  // route handler already does `invokerSessionId ?? null`, so the schema accepts
  // both `null` and omitted/string to keep the wire contract aligned.
  invokerSessionId: safeId.nullable().optional(),
  // C1 cast seam. single/broadcast behave identically; coordinate additionally
  // wires targets into an Ensemble. ensembleName only meaningful with coordinate.
  castMode: z.enum(['single', 'broadcast', 'coordinate']).optional(),
  ensembleName: shortString.optional(),
}).strict();

// C4: enable/disable an active spell (or one of its rules) in place.
export const toggleSpellSchema = z.object({
  sessionId: z.string().min(1),
  enabled: z.boolean(),
  ruleId: z.string().optional(),
}).strict();

// D8/FR-6.6: reset loop counter(s) for a spell active on a session.
export const resetLoopSchema = z.object({
  sessionId: z.string().min(1),
  ruleId: z.string().optional(),
}).strict();

// --- Hook dispatch (P2) ---

export const hookDispatchSchema = z.object({
  sessionId: safeId,
  event: spellHookEventSchema,
  // Hook payloads vary by event (tool_name, file_path, message, …). Accept
  // arbitrary JSON; the dispatcher pulls out the fields it cares about.
  payload: z.record(z.string(), z.any()).optional(),
  // C2: side-effect-free probe. Runs full matching + composition, executes
  // nothing, and returns a per-rule match report. Bypasses the self-only guard.
  dryRun: z.boolean().optional(),
}).strict();

// --- Ensemble (P4) ---

export const createEnsembleSchema = z.object({
  name: shortString,
  color: spellColorSchema,
  objective: z.string().min(1).max(2000),
  memberSessionIds: z.array(safeId).min(1),
  leaderSessionId: safeId.nullable().optional(),
  spellId: safeId,
  createdBy: safeId.nullable().optional(),
}).strict();

export const updateEnsembleSchema = z.object({
  name: shortString.optional(),
  color: spellColorSchema.optional(),
  objective: z.string().min(1).max(2000).optional(),
  leaderSessionId: safeId.nullable().optional(),
}).strict();

export const ensembleMemberSchema = z.object({
  sessionId: safeId,
  castBy: safeId.nullable().optional(),
}).strict();

export const ensembleMessageSchema = z.object({
  content: z.string().min(1).max(50000),
  senderSessionId: safeId.nullable().optional(),
}).strict();

// --- Alexa / Voice schemas ---

export const announceSchema = z.object({
  text: z.string().min(1).max(500),
  device: z.string().min(1).max(100).optional(),
}).strict();

export const alexaUtteranceSchema = z.object({
  query: z.string().min(1).max(1000),
  // Real Alexa session/device IDs (amzn1.echo-api.session.* / amzn1.ask.device.*)
  // routinely exceed 200 chars, so cap generously to avoid rejecting live traffic.
  alexaSessionId: z.string().max(512).optional(),
  deviceId: z.string().max(512).optional(),
}).strict();

// --- Clipboard image schemas ---

/**
 * Multipart text fields accepted alongside the uploaded blob. `sessionId` is
 * grouping/telemetry only — it never influences where the file is written.
 */
export const clipboardUploadFieldsSchema = z.object({
  sessionId: safeId.optional(),
}).strict();

/**
 * Path params for GET /api/clipboard/images/:date/:filename.
 *
 * Both segments are server-generated, so they can be pinned to exact shapes.
 * Anything containing `/`, `\` or `..` fails these regexes outright — the
 * repository's root-confinement check is the second line of defence.
 */
export const clipboardImageParamsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  filename: z
    .string()
    .regex(/^clip_\d+_[a-f0-9]+\.(png|jpg|jpeg|gif|webp)$/, 'invalid clipboard image filename'),
});

// --- Middleware factories ---

/**
 * Validate request body against a Zod schema.
 */
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate request params against a Zod schema.
 */
export function validateParams(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'Invalid URL parameters',
        details: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    next();
  };
}

/**
 * Validate request query against a Zod schema.
 */
export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: result.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    next();
  };
}

// --- Pagination ---

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const projectDocsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  kind: z.enum(['markdown', 'diagram']).optional(),
});

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export function extractPagination(query: Record<string, any>): PaginationParams {
  return {
    limit: Number(query.limit) || 100,
    offset: Number(query.offset) || 0,
  };
}

export function paginate<T>(items: T[], params: PaginationParams): PaginatedResponse<T> {
  const total = items.length;
  const sliced = items.slice(params.offset, params.offset + params.limit);
  return {
    data: sliced,
    pagination: {
      offset: params.offset,
      limit: params.limit,
      total,
      hasMore: params.offset + params.limit < total,
    },
  };
}
