import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GatewayConfig } from './config';
import { Logger } from './logger';

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

/**
 * One-time prep of the shared Claude config dir so pooled instances DON'T show the
 * interactive first-run onboarding wizard.
 *
 * Claude reads `$CLAUDE_CONFIG_DIR/.claude.json` for settings; when that file is
 * fresh it lacks `hasCompletedOnboarding` and the CLI shows Welcome/theme/trust-folder
 * on first launch. All pooled instances share ONE CLAUDE_CONFIG_DIR (pooled identity
 * by design), so seeding it once covers everyone. We merge a few prefs from the
 * box's home `~/.claude.json` (the config the plain, no-CLAUDE_CONFIG_DIR server uses)
 * if present. NEVER touches `.credentials.json` (the OAuth token) or the home file.
 */
export function prepareSharedClaudeConfig(config: GatewayConfig, logger: Logger): void {
  const dir = config.sharedClaudeConfigDir;
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, '.claude.json');

    let current: Record<string, any> = {};
    try {
      current = JSON.parse(fs.readFileSync(target, 'utf-8'));
    } catch {
      /* fresh/absent → start from {} */
    }
    if (current.hasCompletedOnboarding === true) return; // already good

    let home: Record<string, any> = {};
    try {
      home = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8'));
    } catch {
      /* no home config → seed minimal */
    }

    const seeded: Record<string, any> = {
      ...current,
      hasCompletedOnboarding: true,
    };
    if (home.theme && !seeded.theme) seeded.theme = home.theme;
    // Carry the home config's trusted-folder entries so pooled agents don't get a
    // per-folder "trust this directory?" prompt for known paths.
    if (home.projects && !seeded.projects) seeded.projects = home.projects;

    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(seeded, null, 2), 'utf-8');
    fs.renameSync(tmp, target);
    logger.info('seeded shared Claude config (onboarding complete)', { path: target });
  } catch (err) {
    logger.warn('failed to seed shared Claude config — interactive onboarding may show', err);
  }
}
