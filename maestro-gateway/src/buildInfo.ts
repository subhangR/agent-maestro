import { execFileSync } from 'child_process';

/** Identifies the gateway revision currently serving requests. */
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
    // A packaged gateway may not include its source checkout.
  }

  return { commit: 'unknown' };
}
