import { execFileSync } from 'child_process';

/**
 * Identifies the source revision that is actually running. Deploy systems can
 * set MAESTRO_COMMIT_SHA explicitly; source checkouts fall back to git.
 */
export function getBuildInfo(): { commit: string } {
  const configuredCommit = process.env.MAESTRO_COMMIT_SHA?.trim();
  if (configuredCommit) return { commit: configuredCommit };

  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (commit) return { commit };
  } catch {
    // Packaged builds may not include a .git directory.
  }

  return { commit: 'unknown' };
}
