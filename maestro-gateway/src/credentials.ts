import { GatewayConfig } from './config';

/**
 * Resolves the agent credential env injected into a per-user instance at spawn.
 *
 * This is the seam where subscription pooling lives. For L1 (single shared
 * Claude + Codex subscription) the shared impl returns the same config dir for
 * everyone (A10). Future strategies — per-instance copy, or a per-seat pool /
 * router across N subscriptions — drop in behind this interface without touching
 * the supervisor. See docs/trusted-hub/DESIGN-A.md §3.5 / §10.
 */
export interface CredentialSource {
  resolve(uid: string): Record<string, string>;
}

/**
 * L1 strategy: every user's instance points at the ONE shared logged-in config
 * dir (e.g. ~/.claude on the box). All pooled agents authenticate through the
 * same subscription. Concurrent OAuth-refresh isolation is the deferred crux.
 */
export class SharedCredentialSource implements CredentialSource {
  constructor(private readonly config: GatewayConfig) {}

  resolve(_uid: string): Record<string, string> {
    const env: Record<string, string> = {};
    if (this.config.sharedClaudeConfigDir) {
      env.CLAUDE_CONFIG_DIR = this.config.sharedClaudeConfigDir;
    }
    if (this.config.sharedCodexHome) {
      env.CODEX_HOME = this.config.sharedCodexHome;
    }
    return env;
  }
}
