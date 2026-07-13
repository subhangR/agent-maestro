// Mirrors maestro-server/src/types.ts TeamMember + TeamMemberSnapshot — do not edit shape without re-running the drift guard.
import type { Iso8601 } from '../primitives';
import type {
  AgentMode,
  AgentTool,
  PermissionMode,
  TeamMemberStatus,
  TeamMemberScope,
  SystemTeamMemberKind,
} from '../enums';

export interface TeamMemberCapabilities {
  can_spawn_sessions?: boolean;
  can_edit_tasks?: boolean;
  can_report_task_level?: boolean;
  can_report_session_level?: boolean;
}

export interface CommandPermissions {
  groups?: Record<string, boolean>;
  commands?: Record<string, boolean>;
}

export interface TeamMember {
  id: string;
  projectId: string;
  /** Set for auto-seeded system members (non-deletable, recreated on startup). */
  systemKind?: SystemTeamMemberKind;
  /** 'project' (default) or 'global' — global members shared across all projects. */
  scope?: TeamMemberScope;
  name: string;
  role: string;
  /** Custom instructions / persona prompt (optional; empty means no persona). */
  identity?: string;
  avatar: string;
  /** Fallback when no modelProfileId. */
  model?: string;
  /** Points at a ModelProfile; resolved to a launch config at spawn. */
  modelProfileId?: string;
  agentTool?: AgentTool;
  mode?: AgentMode;
  permissionMode?: PermissionMode;
  /** Deprecated: kept for backward compatibility. */
  strategy?: string;
  skillIds?: string[];
  isDefault: boolean;
  status: TeamMemberStatus;

  capabilities?: TeamMemberCapabilities;
  commandPermissions?: CommandPermissions;

  workflowTemplateId?: string;
  customWorkflow?: string;

  /** Important details the agent remembers across sessions. */
  memory?: string[];

  /** The instrument this member "plays" in the session ensemble. */
  soundInstrument?: string;

  createdAt: Iso8601;
  updatedAt: Iso8601;
}

export interface TeamMemberSnapshot {
  name: string;
  avatar: string;
  role: string;
  model?: string;
  agentTool?: AgentTool;
  permissionMode?: PermissionMode;
}
