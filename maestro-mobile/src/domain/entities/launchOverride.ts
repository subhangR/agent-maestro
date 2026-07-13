// Mirrors maestro-server/src/types.ts LaunchConfig + MemberLaunchOverride — do not edit shape without re-running the drift guard.
import type {
  LaunchProvider,
  LaunchReasoningEffort,
  LaunchSpeed,
  LaunchAccessMode,
  AgentTool,
  PermissionMode,
} from '../enums';

export interface LaunchConfig {
  provider: LaunchProvider;
  model: string;
  reasoningEffort?: LaunchReasoningEffort;
  speed?: LaunchSpeed;
  accessMode?: LaunchAccessMode;
}

/** Per-member launch override for team launch configuration. */
export interface MemberLaunchOverride {
  launchConfig?: LaunchConfig;
  /** Legacy launch override; normalized into launchConfig. */
  agentTool?: AgentTool;
  /** Legacy launch override; normalized into launchConfig. */
  model?: string;
  /** Legacy launch override; normalized into launchConfig. */
  reasoningEffort?: LaunchReasoningEffort;
  permissionMode?: PermissionMode;
  skillIds?: string[];
  commandPermissions?: {
    groups?: Record<string, boolean>;
    commands?: Record<string, boolean>;
  };
}
