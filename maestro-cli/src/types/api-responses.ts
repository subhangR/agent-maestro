/**
 * API response types for server data.
 * These represent the shape of data returned by the maestro-server API.
 */

export interface TaskResponse {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  parentId?: string | null;
  projectId?: string;
  teamMemberId?: string;
  teamMemberIds?: string[];
  teamId?: string | null;
  taskSessionStatuses?: Record<string, string>;
  dependencies?: string[];
  acceptanceCriteria?: string[];
  technicalNotes?: string;
  estimatedComplexity?: string;
  createdAt?: string;
  children?: TaskResponse[];
  metadata?: Record<string, unknown>;
}

export interface SessionResponse {
  id: string;
  name: string;
  status: string;
  projectId?: string;
  taskIds?: string[];
  teamMemberId?: string;
  teamMemberSnapshot?: { name?: string };
  parentSessionId?: string;
  needsInput?: { active: boolean; message?: string; since?: number };
  timeline?: TimelineEntry[];
  completedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface TimelineEntry {
  id?: string;
  type: string;
  timestamp: number;
  message?: string;
  taskId?: string;
}

export interface TeamResponse {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  leaderId?: string;
  memberIds?: string[];
  subTeamIds?: string[];
  status: string;
  projectId?: string;
}

export interface TeamMemberResponse {
  id: string;
  name: string;
  role: string;
  avatar: string;
  mode?: string;
  model?: string;
  agentTool?: string;
  permissionMode?: string;
  identity?: string;
  skillIds?: string[];
  capabilities?: Record<string, boolean>;
  commandPermissions?: {
    groups?: Record<string, boolean>;
    commands?: Record<string, boolean>;
  };
  memory?: string[];
  scope?: 'project' | 'global';
  status: string;
  isDefault?: boolean;
  projectId?: string;
}

export interface DocResponse {
  id: string;
  title: string;
  filePath: string;
  content?: string;
  addedAt: string;
}

export interface SpawnResponse {
  sessionId: string;
  status?: string;
}

export interface LogDigestResponse {
  sessionId: string;
  state: string;
  workerName?: string;
  taskIds?: string[];
  lastActivityTimestamp?: number;
  stuck?: { warning: string; silentDurationMs: number };
  entries?: { timestamp: number; source: string; text: string }[];
}

// ── Git Types ──

export interface GitFileChange {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | '?';
  insertions: number;
  deletions: number;
}

export interface GitDiffSummary {
  branch: string;
  baseBranch: string;
  baseCommit: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  filesChanged: number;
  insertions: number;
  deletions: number;
  commitCount: number;
  files: GitFileChange[];
}

export interface GitPrInfoResponse {
  url: string;
  number: number;
  state: 'OPEN' | 'MERGED' | 'CLOSED' | 'DRAFT';
  checks?: 'passing' | 'failing' | 'pending' | 'none';
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
}

export interface GitStatusResponse {
  hasWorktree: boolean;
  summary?: GitDiffSummary;
  pr?: GitPrInfoResponse;
}

export interface GitDiffResponse {
  diff: string;
}

export interface GitMergeResponse {
  success: boolean;
  message: string;
  conflicts?: string[];
}

// ── Spell Types ──

export type SpellEntityType = 'maestro' | 'skill' | 'team-member' | 'task' | 'doc' | 'session' | 'custom-prompt';

export interface SpellEntityResponse {
  entityId: string;
  entityType: SpellEntityType;
  name: string;
  description?: string;
  spells: SpellDefinitionResponse[];
}

export interface SpellDefinitionResponse {
  name: string | null;
  description?: string;
  entityId: string;
  entityType: SpellEntityType;
  entityName?: string;
}

export interface SpellInvokeResponse {
  status: 'sent' | 'failed';
  entityId: string;
  entityName?: string;
  spellName: string | null;
  targetSessionId: string;
  error?: string;
}

export interface SpellCustomPromptResponse {
  id: string;
  name: string;
  prompt: string;
  description?: string;
  createdAt: string;
}

// ── Multi-rule Spells (Mechanism A) ──
// Mirrors maestro-server/src/types.ts. Source of truth: 04-backend-contract.md.

export type SpellColorSlug =
  | 'amber' | 'rose' | 'violet' | 'sky' | 'emerald' | 'fuchsia' | 'lime' | 'cyan' | 'indigo';

export type SpellActionType =
  | 'inject-prompt' | 'feed-context' | 'run-command' | 'continue-loop' | 'notify-channel';

export type SpellLoopType =
  | 'single-shot' | 'continue-until-done' | 'plan-execute' | 'critic-refine';

export type SpellHookEvent =
  | 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit' | 'Stop'
  | 'SubagentStop' | 'Notification' | 'SessionStart' | 'SessionEnd';

export type SpellTrigger =
  | { type: 'hook'; hookEvent: SpellHookEvent; matcher?: string }
  | { type: 'schedule'; cron?: string; intervalMs?: number };

export type SpellActionConfig =
  | { type: 'inject-prompt'; prompt: string }
  | { type: 'feed-context'; prompt: string }
  | { type: 'run-command'; command: string; args?: string[]; cwd?: string; feedOutput?: boolean }
  | { type: 'continue-loop'; loopType?: SpellLoopType; maxIterations?: number }
  | { type: 'notify-channel'; channel?: string; message?: string };

export interface SpellRule {
  id: string;
  label?: string;
  enabled: boolean;
  trigger: SpellTrigger;
  action: SpellActionConfig;
}

export interface SpellRuleInput {
  id?: string;
  label?: string;
  enabled: boolean;
  trigger: SpellTrigger;
  action: SpellActionConfig;
}

export interface SpellResponse {
  id: string;
  name: string;
  description: string;
  icon?: string;
  color: SpellColorSlug;
  rules: SpellRule[];
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveSpellResponse {
  spellId: string;
  color: SpellColorSlug;
  enabled: boolean;
  ruleIterations: Record<string, number>;
  ensembleId?: string;
  castAt: number;
  castBy: string | null;
}

export interface CreateSpellPayload {
  name: string;
  description: string;
  icon?: string;
  color: SpellColorSlug;
  rules: SpellRuleInput[];
}

export interface UpdateSpellPayload {
  name?: string;
  description?: string;
  icon?: string;
  color?: SpellColorSlug;
  rules?: SpellRuleInput[];
}

export interface SpellActivateResponse {
  spell: SpellResponse;
  sessions: { sessionId: string; activeSpell: ActiveSpellResponse }[];
}

export interface SpellDeactivateResponse {
  spell: SpellResponse;
  sessionIds: string[];
}

export interface SpellResetLoopResponse {
  spell: SpellResponse;
  sessionId: string;
  activeSpell: ActiveSpellResponse;
}

// Session shape carrying live active spells (GET /api/sessions/:id).
export interface SessionWithActiveSpellsResponse extends SessionResponse {
  activeSpells?: ActiveSpellResponse[];
}

