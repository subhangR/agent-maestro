import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

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

export const createProjectSchema = z.object({
  name: shortString,
  workingDir: z.string().min(1).max(1000),
  description: z.string().max(500).optional(),
  isMaster: z.boolean().optional(),
}).strict();

export const updateProjectSchema = z.object({
  name: shortString.optional(),
  workingDir: z.string().min(1).max(1000).optional(),
  description: z.string().max(500).optional(),
  isMaster: z.boolean().optional(),
}).strict();

export const masterToggleSchema = z.object({
  isMaster: z.boolean(),
}).strict();

// --- Shared schemas ---

const permissionModeSchema = z.enum(['acceptEdits', 'interactive', 'readOnly', 'bypassPermissions']);

const memberLaunchOverrideSchema = z.object({
  agentTool: z.string().optional(),
  model: z.string().optional(),
  permissionMode: permissionModeSchema.optional(),
  skillIds: z.array(z.string()).optional(),
  commandPermissions: z.object({
    commands: z.record(z.string(), z.boolean()),
  }).optional(),
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
  memberOverrides: z.record(safeId, memberLaunchOverrideSchema).optional(),
  dangerousMode: z.boolean().optional(),
  useWorktree: z.boolean().optional(),
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
  memberOverrides: z.record(safeId, memberLaunchOverrideSchema).optional(),
  dangerousMode: z.boolean().optional(),
  useWorktree: z.boolean().optional(),
}).strict();

export const addTaskDocSchema = z.object({
  title: shortString,
  filePath: z.string().min(1).max(2000),
  content: z.string().max(100000).optional(),
  sessionId: safeId,
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
  status: sessionStatusSchema.optional(),
  active: z.enum(['true', 'false']).optional(),
  parentSessionId: safeId.optional(),
  rootSessionId: safeId.optional(),
  teamSessionId: safeId.optional(),
  fields: z.enum(['full', 'summary']).optional(),
});

// --- Spawn session schema ---

const allStrategySchema = z.enum(['simple', 'tree', 'default', 'intelligent-batching', 'dag']);

export const spawnSessionSchema = z.object({
  projectId: safeId,
  taskIds: z.array(safeId).min(1),
  sessionName: shortString.optional(),
  skills: z.array(z.string().max(200)).optional(),
  sessionId: safeId.optional(),
  spawnSource: z.enum(['ui', 'session']).optional().default('ui'),
  mode: agentModeSchema.optional().default('worker'),
  strategy: allStrategySchema.optional().default('simple'),
  context: z.record(z.string(), z.unknown()).optional(),
  model: modelSchema.optional(),
  agentTool: z.string().optional(),
  teamMemberId: safeId.optional(),
  teamMemberIds: z.array(safeId).optional(),
  delegateTeamMemberIds: z.array(safeId).optional(),
  initialDirective: z.object({
    subject: shortString,
    message: longString,
    fromSessionId: safeId.optional(),
  }).optional(),
  memberOverrides: z.record(safeId, memberLaunchOverrideSchema).optional(),
  permissionMode: permissionModeSchema.optional(),
  delegatePermissionMode: permissionModeSchema.optional(),
  useWorktree: z.boolean().optional(),
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
  spellName: z.string().min(1).max(100),
  targetSessionId: safeId,
  projectId: safeId,
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
