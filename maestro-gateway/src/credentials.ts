import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GatewayConfig } from './config';
import { Logger } from './logger';
import { InstanceHandle } from './types';

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
  /** Env injected into the user's instance (inherited by every agent PTY). */
  resolve(uid: string): Record<string, string>;
  /** Optional one-time filesystem setup for the workspace (dirs, config files). */
  prepare?(handle: InstanceHandle): void;
}

/** Fan-out to several sources: merge their env, run all their prepare() hooks. */
export class CompositeCredentialSource implements CredentialSource {
  constructor(private readonly sources: CredentialSource[]) {}

  resolve(uid: string): Record<string, string> {
    return this.sources.reduce<Record<string, string>>(
      (env, s) => ({ ...env, ...s.resolve(uid) }),
      {},
    );
  }

  prepare(handle: InstanceHandle): void {
    for (const s of this.sources) s.prepare?.(handle);
  }
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

/**
 * Self-service per-user GitHub credentials.
 *
 * Unlike the shared Claude sub, GitHub identity is PER USER. We do NOT store any
 * token in the gateway — instead we point each user's git/gh at folders inside
 * their OWN workspace and pre-wire git to use `gh` for auth:
 *   GH_CONFIG_DIR      = ~/hub/<uid>/gh          (gh auth login persists here)
 *   GIT_CONFIG_GLOBAL  = ~/hub/<uid>/git/config  (user.* + gh credential helper)
 *
 * So a user runs `gh auth login` ONCE in their own terminal; the login is saved
 * in their workspace and reused by every terminal/agent in that workspace only.
 * The owner provisions nothing; there is no central token file.
 *
 * NOTE (soft isolation, D9): this gives correct attribution + push scope, not
 * confidentiality — the shared OS user means another user's agent can still read
 * ~/hub/<uid>/gh. Hardening (loopback broker / per-user OS accounts) is deferred.
 * See docs/trusted-hub/GITHUB-CREDENTIALS.md.
 */
export class GitHubCredentialSource implements CredentialSource {
  constructor(private readonly config: GatewayConfig, private readonly logger: Logger) {}

  private ghDir(uid: string): string {
    return path.join(this.config.hubDir, uid, 'gh');
  }
  private gitConfigPath(uid: string): string {
    return path.join(this.config.hubDir, uid, 'git', 'config');
  }

  resolve(uid: string): Record<string, string> {
    if (!this.config.githubCredentials) return {};
    return {
      GH_CONFIG_DIR: this.ghDir(uid),
      GIT_CONFIG_GLOBAL: this.gitConfigPath(uid),
    };
  }

  prepare(handle: InstanceHandle): void {
    if (!this.config.githubCredentials) return;
    try {
      fs.mkdirSync(this.ghDir(handle.uid), { recursive: true });
      const cfgPath = this.gitConfigPath(handle.uid);
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      // Only seed if absent — never clobber a user's later `git config` edits.
      if (!fs.existsSync(cfgPath)) {
        const email = handle.email || `${handle.uid}@users.noreply.github.com`;
        const name = handle.email ? handle.email.split('@')[0] : handle.uid;
        fs.writeFileSync(cfgPath, buildUserGitConfig(name, email), 'utf-8');
        this.logger.info(`seeded per-user git config uid=${handle.uid}`, { path: cfgPath });
      }
    } catch (err) {
      this.logger.warn(`failed to prepare GitHub creds for uid=${handle.uid}`, err);
    }
  }
}

/**
 * A per-user global gitconfig that (a) sets a default identity so commits work
 * out of the box (editable by the user) and (b) wires `gh` as the https
 * credential helper so `git push` reuses whatever `gh auth login` stored — the
 * empty `helper =` first resets any inherited helper (mirrors `gh auth setup-git`).
 */
function buildUserGitConfig(name: string, email: string): string {
  return [
    '# Managed by maestro-gateway — your private per-workspace git config.',
    '# Edit user.name / user.email freely. The credential.helper lines let',
    '# `git push` reuse your `gh auth login` (run it once in a terminal).',
    '[user]',
    `\tname = ${name}`,
    `\temail = ${email}`,
    '[credential "https://github.com"]',
    '\thelper = ',
    '\thelper = !gh auth git-credential',
    '[credential "https://gist.github.com"]',
    '\thelper = ',
    '\thelper = !gh auth git-credential',
    '[init]',
    '\tdefaultBranch = main',
    '',
  ].join('\n');
}
