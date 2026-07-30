import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

/** Identifies the gateway revision currently serving requests. */
export function getBuildInfo(): { commit: string } {
  // Explicit override (set by deploy script or CI).
  const configuredCommit = process.env.MAESTRO_COMMIT_SHA?.trim();
  if (configuredCommit) return { commit: configuredCommit };

  // Stamped at build time by `bun run build` (written to dist/.git-sha).
  // Prefer this over runtime git — if the repo is pulled without rebuilding
  // the stamp reflects the actual binary revision, not the repo HEAD.
  const stampFile = path.join(__dirname, '.git-sha');
  if (existsSync(stampFile)) {
    const sha = readFileSync(stampFile, 'utf8').trim();
    if (sha && sha !== 'unknown') return { commit: sha };
  }

  // Fallback: read from git at process start (works in local dev where there
  // is no stamp file but the source tree is a git checkout).
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
