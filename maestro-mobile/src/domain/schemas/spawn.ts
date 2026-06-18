// zod v4 — boundary validation for the OUTBOUND spawn body.
// Mirrors maestro-server/src/api/validation.ts `spawnSessionSchema` (.strict()).
// Validating before the round-trip turns the server's opaque 400 into a precise
// client-side error. This is the ONE schema we author with care.
//
// NOTE: opt-in import (NOT in the domain barrel) so type-only screens never pull
// zod into their dependency graph: `import { spawnSessionRequestSchema } from
// '@/domain/schemas/spawn'`.
import { z } from 'zod';
import { AGENT_MODES, LAUNCH_PROVIDERS, LAUNCH_REASONING_EFFORTS, PERMISSION_MODES } from '../enums';

// Server constraints (validation.ts): safeId, shortString, longString.
const safeId = z.string().min(1).max(200);
const shortString = z.string().max(500);
const longString = z.string().max(100_000);

const launchConfigSchema = z
  .object({
    provider: z.enum(LAUNCH_PROVIDERS),
    model: z.string().min(1).max(200),
    reasoningEffort: z.enum(LAUNCH_REASONING_EFFORTS).optional(),
    speed: z.enum(['standard', 'fast']).optional(),
    accessMode: z.enum(['safe', 'acceptEdits', 'plan', 'fullAccess']).optional(),
  })
  // server: intentionally NOT .strict() — launchConfig is the evolving canonical
  // surface, re-derived server-side from an allow-list.
  .loose();

const memberLaunchOverrideSchema = z
  .object({
    launchConfig: launchConfigSchema.optional(),
    agentTool: z.string().max(100).optional(),
    model: z.string().min(1).max(200).optional(),
    reasoningEffort: z.enum(LAUNCH_REASONING_EFFORTS).optional(),
    permissionMode: z.enum(PERMISSION_MODES).optional(),
    skillIds: z.array(safeId).optional(),
    commandPermissions: z
      .object({
        groups: z.record(z.string(), z.boolean()).optional(),
        commands: z.record(z.string(), z.boolean()).optional(),
      })
      .optional(),
  })
  .loose();

export const spawnSessionRequestSchema = z
  .object({
    projectId: safeId.optional(),
    taskIds: z.array(safeId).min(1),
    sessionName: shortString.optional(),
    skills: z.array(z.string().max(200)).optional(),
    sessionId: safeId.optional(),
    // Mobile always sends 'ui'; the schema keeps the server default for parity.
    spawnSource: z.enum(['ui', 'session']).optional().default('ui'),
    mode: z.enum(AGENT_MODES).optional().default('worker'),
    strategy: z
      .enum(['simple', 'tree', 'default', 'intelligent-batching', 'dag'])
      .optional()
      .default('simple'),
    context: z.record(z.string(), z.unknown()).optional(),
    launchConfig: launchConfigSchema.optional(),
    // Free string (not a strict enum) — legacy agentTool values still validate.
    agentTool: z.string().max(100).optional(),
    model: z.string().min(1).max(200).optional(),
    reasoningEffort: z.enum(LAUNCH_REASONING_EFFORTS).optional(),
    teamMemberId: safeId.optional(),
    teamMemberIds: z.array(safeId).optional(),
    delegateTeamMemberIds: z.array(safeId).optional(),
    teamId: safeId.nullable().optional(),
    initialDirective: z
      .object({
        subject: shortString,
        message: longString,
        fromSessionId: safeId.optional(),
      })
      .optional(),
    memberOverrides: z.record(safeId, memberLaunchOverrideSchema).optional(),
    permissionMode: z.enum(PERMISSION_MODES).optional(),
    delegatePermissionMode: z.enum(PERMISSION_MODES).optional(),
    useWorktree: z.boolean().optional(),
  })
  .strict();

/** The validated outbound spawn body (single source for Conduit's request type). */
export type SpawnSessionRequest = z.infer<typeof spawnSessionRequestSchema>;
