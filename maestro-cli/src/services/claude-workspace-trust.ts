import { homedir } from 'os';
import { randomBytes } from 'crypto';
import { dirname, join, resolve } from 'path';
import { mkdir, readFile, realpath, rename, writeFile } from 'fs/promises';

type ClaudeConfig = Record<string, unknown> & {
  projects?: Record<string, Record<string, unknown>>;
};

/**
 * Maestro sessions are unattended launches: there may be no person watching the
 * raw PTY when Claude asks its first-run "trust this folder" question. Record the
 * same choice before spawning Claude so an automated task cannot stall behind a
 * prompt that the conversation view cannot display.
 *
 * This is deliberately best-effort. A malformed or unwritable Claude config must
 * not prevent the agent from launching; in that case Claude falls back to its
 * normal interactive trust flow.
 */
export async function trustClaudeWorkspace(
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (env.MAESTRO_AUTO_TRUST_WORKSPACE === 'false') return;

  try {
    const configDir = env.CLAUDE_CONFIG_DIR || env.HOME || homedir();
    const configPath = join(configDir, '.claude.json');
    const workspace = await realpath(resolve(cwd)).catch(() => resolve(cwd));

    let config: ClaudeConfig = {};
    try {
      config = JSON.parse(await readFile(configPath, 'utf8')) as ClaudeConfig;
    } catch {
      // Missing or malformed config: preserve Claude's normal launch behavior.
      // Only create a new file when no file exists; malformed JSON is not safe
      // for Maestro to overwrite.
      try {
        await readFile(configPath, 'utf8');
        return;
      } catch {
        config = {};
      }
    }

    const projects = config.projects && typeof config.projects === 'object'
      ? config.projects
      : {};
    const current = projects[workspace] && typeof projects[workspace] === 'object'
      ? projects[workspace]
      : {};
    if (current.hasTrustDialogAccepted === true) return;

    const next: ClaudeConfig = {
      ...config,
      projects: {
        ...projects,
        [workspace]: {
          ...current,
          hasTrustDialogAccepted: true,
        },
      },
    };

    await mkdir(dirname(configPath), { recursive: true });
    const tempPath = `${configPath}.maestro-${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await rename(tempPath, configPath);
  } catch {
    // Trust seeding is a UX safeguard, not a launch prerequisite.
  }
}
