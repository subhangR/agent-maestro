import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { ValidationError } from '../../domain/common/Errors';

const execFileAsync = promisify(execFile);

const WORKTREE_BASE = path.join(os.homedir(), '.maestro', 'worktrees');

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

export interface GitPrInfo {
  url: string;
  number: number;
  state: 'OPEN' | 'MERGED' | 'CLOSED' | 'DRAFT';
  checks?: 'passing' | 'failing' | 'pending' | 'none';
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
}

export interface GitCapabilities {
  hasGit: boolean;
  hasGh: boolean;
  ghAuthed: boolean;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function shortId(len = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < len; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Extract the PR url + number from `gh pr create` output. gh prints the PR URL
 * on its own line (sometimes preceded by status chatter), e.g.
 * `https://github.com/owner/repo/pull/42`.
 */
/**
 * Collapse `gh pr view --json statusCheckRollup` into a single rollup status.
 * The rollup is a heterogeneous array: GitHub Actions runs expose
 * `status`/`conclusion`, legacy commit statuses expose `state`. A single
 * failing/pending entry dominates the whole rollup (failing > pending > passing).
 */
export function rollupChecks(
  rollup: unknown,
): 'passing' | 'failing' | 'pending' | 'none' {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'none';

  let pending = false;
  for (const raw of rollup) {
    const c = (raw ?? {}) as { status?: string; conclusion?: string; state?: string };
    const conclusion = (c.conclusion ?? '').toUpperCase();
    const status = (c.status ?? '').toUpperCase();
    const state = (c.state ?? '').toUpperCase();

    // Check run still running, or commit status pending.
    if (
      (status && status !== 'COMPLETED') ||
      state === 'PENDING' ||
      state === 'EXPECTED'
    ) {
      pending = true;
      continue;
    }

    // Terminal failure on either a check run or a commit status.
    if (
      ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'].includes(conclusion) ||
      ['FAILURE', 'ERROR'].includes(state)
    ) {
      return 'failing';
    }
  }

  return pending ? 'pending' : 'passing';
}

export function parsePullRequestUrl(output: string): { url: string; number: number } {
  const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
  const url =
    [...lines].reverse().find(l => /https?:\/\/\S*\/pull\/\d+/.test(l)) ??
    lines[lines.length - 1] ??
    '';
  const match = url.match(/\/pull\/(\d+)/);
  const number = match ? parseInt(match[1], 10) : 0;
  return { url, number };
}

export class GitService {
  // ── repo ────────────────────────────────────────────────────────────────────

  async isGitRepo(dir: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: dir });
      return true;
    } catch {
      return false;
    }
  }

  async capabilities(dir: string): Promise<GitCapabilities> {
    const hasGit = await this.isGitRepo(dir);

    let hasGh = false;
    try {
      await execFileAsync('gh', ['--version']);
      hasGh = true;
    } catch { /* gh not installed */ }

    let ghAuthed = false;
    if (hasGh) {
      try {
        await execFileAsync('gh', ['auth', 'status']);
        ghAuthed = true;
      } catch { /* not authenticated */ }
    }

    return { hasGit, hasGh, ghAuthed };
  }

  async defaultBaseBranch(dir: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'],
        { cwd: dir }
      );
      // e.g. "origin/main" -> "main"
      return stdout.trim().replace(/^origin\//, '');
    } catch {
      // Fallback: try common branch names
      for (const name of ['main', 'master', 'staging', 'develop']) {
        try {
          await execFileAsync('git', ['rev-parse', '--verify', name], { cwd: dir });
          return name;
        } catch { /* try next */ }
      }
      return 'main';
    }
  }

  async currentBranch(dir: string): Promise<string> {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: dir }
    );
    return stdout.trim();
  }

  async headCommit(dir: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: dir });
    return stdout.trim();
  }

  // ── worktree ─────────────────────────────────────────────────────────────────

  async createWorktree(
    projectDir: string,
    sessionId: string,
    slug?: string
  ): Promise<{ worktreePath: string; branchName: string; baseCommit: string }> {
    // Capture base commit BEFORE creating worktree
    const baseCommit = await this.headCommit(projectDir);

    const taskSlug = slug ? slugify(slug) : slugify(sessionId.slice(0, 12));
    const branchName = `maestro/${taskSlug}-${shortId(4)}`;
    const worktreePath = path.join(WORKTREE_BASE, sessionId);

    await fs.mkdir(WORKTREE_BASE, { recursive: true });

    await execFileAsync(
      'git',
      ['worktree', 'add', '-b', branchName, worktreePath, 'HEAD'],
      { cwd: projectDir }
    );

    return { worktreePath, branchName, baseCommit };
  }

  async removeWorktree(
    projectDir: string,
    worktreePath: string,
    branchName: string
  ): Promise<void> {
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], {
        cwd: projectDir,
      });
    } catch (err) {
      console.warn(`[GitService] Failed to remove worktree at ${worktreePath}:`, err);
    }

    try {
      await execFileAsync('git', ['branch', '-D', branchName], { cwd: projectDir });
    } catch (err) {
      console.warn(`[GitService] Failed to delete branch ${branchName}:`, err);
    }
  }

  async worktreeExists(worktreePath: string): Promise<boolean> {
    try {
      await fs.access(worktreePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Stage a file (git add) within a repo directory. */
  async stageFile(repoDir: string, filePath: string): Promise<void> {
    await execFileAsync('git', ['add', filePath], { cwd: repoDir });
  }

  // ── diff ─────────────────────────────────────────────────────────────────────

  async diffSummary(worktreePath: string, baseCommit: string): Promise<GitDiffSummary> {
    const branch = await this.currentBranch(worktreePath);
    const baseBranch = await this.defaultBaseBranch(worktreePath);

    // Commit count since baseCommit
    const { stdout: commitCountRaw } = await execFileAsync(
      'git', ['rev-list', '--count', `${baseCommit}..HEAD`], { cwd: worktreePath }
    );
    const commitCount = parseInt(commitCountRaw.trim(), 10) || 0;

    // Ahead/behind vs remote base branch
    let ahead = commitCount;
    let behind = 0;
    try {
      const { stdout: abRaw } = await execFileAsync(
        'git', ['rev-list', '--left-right', '--count', `${baseBranch}...HEAD`],
        { cwd: worktreePath }
      );
      const parts = abRaw.trim().split('\t');
      behind = parseInt(parts[0], 10) || 0;
      ahead = parseInt(parts[1], 10) || 0;
    } catch { /* remote ref unavailable — keep fallback */ }

    // Dirty flag
    const { stdout: porcelainOut } = await execFileAsync(
      'git', ['status', '--porcelain'], { cwd: worktreePath }
    );
    const dirty = porcelainOut.trim().length > 0;

    // --- Committed changes ---
    const fileMap = new Map<string, GitFileChange>();

    const parseNumstat = (raw: string): Map<string, { ins: number; del: number }> => {
      const result = new Map<string, { ins: number; del: number }>();
      for (const line of raw.trim().split('\n').filter(Boolean)) {
        const parts = line.split('\t');
        if (parts.length < 3) continue;
        const ins = parseInt(parts[0], 10) || 0;
        const del = parseInt(parts[1], 10) || 0;
        // Handle rename "old => new" path; take last segment
        const filePath = parts.slice(2).join('\t');
        if (filePath) result.set(filePath, { ins, del });
      }
      return result;
    };

    try {
      const [{ stdout: committedNumstat }, { stdout: committedNameStatus }] = await Promise.all([
        execFileAsync('git', ['diff', '--numstat', `${baseCommit}..HEAD`], { cwd: worktreePath }),
        execFileAsync('git', ['diff', '--name-status', `${baseCommit}..HEAD`], { cwd: worktreePath }),
      ]);

      // Build status map from name-status
      const committedStatus = new Map<string, 'A' | 'M' | 'D' | 'R'>();
      for (const line of committedNameStatus.trim().split('\n').filter(Boolean)) {
        const parts = line.split('\t');
        const s = (parts[0]?.[0] ?? 'M') as 'A' | 'M' | 'D' | 'R';
        const filePath = parts[parts.length - 1];
        if (filePath) committedStatus.set(filePath, s);
      }

      for (const [filePath, { ins, del }] of parseNumstat(committedNumstat)) {
        fileMap.set(filePath, {
          path: filePath,
          status: committedStatus.get(filePath) ?? 'M',
          insertions: ins,
          deletions: del,
        });
      }
    } catch { /* no committed changes */ }

    // --- Uncommitted changes ---
    // Parse porcelain for status codes
    const uncommittedStatus = new Map<string, 'A' | 'M' | 'D' | 'R' | '?'>();
    for (const line of porcelainOut.trim().split('\n').filter(Boolean)) {
      if (line.length < 3) continue;
      const xy = line.slice(0, 2);
      const rawPath = line.slice(3);
      // Rename "old -> new" in porcelain v1
      const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ')[1] : rawPath;
      let status: 'A' | 'M' | 'D' | 'R' | '?';
      if (xy[0] === 'R' || xy[1] === 'R') status = 'R';
      else if (xy === '??') status = '?';
      else if (xy[0] === 'A' || xy[1] === 'A') status = 'A';
      else if (xy[0] === 'D' || xy[1] === 'D') status = 'D';
      else status = 'M';
      uncommittedStatus.set(filePath.trim(), status);
    }

    // Staged line counts
    try {
      const { stdout: stagedRaw } = await execFileAsync(
        'git', ['diff', '--numstat', '--cached'], { cwd: worktreePath }
      );
      for (const [filePath, { ins, del }] of parseNumstat(stagedRaw)) {
        const existing = fileMap.get(filePath);
        if (existing) {
          existing.insertions += ins;
          existing.deletions += del;
          existing.status = uncommittedStatus.get(filePath) ?? existing.status;
        } else {
          fileMap.set(filePath, {
            path: filePath,
            status: uncommittedStatus.get(filePath) ?? 'M',
            insertions: ins,
            deletions: del,
          });
        }
      }
    } catch { /* no staged changes */ }

    // Unstaged line counts
    try {
      const { stdout: unstagedRaw } = await execFileAsync(
        'git', ['diff', '--numstat'], { cwd: worktreePath }
      );
      for (const [filePath, { ins, del }] of parseNumstat(unstagedRaw)) {
        const existing = fileMap.get(filePath);
        if (existing) {
          existing.insertions += ins;
          existing.deletions += del;
          existing.status = uncommittedStatus.get(filePath) ?? existing.status;
        } else {
          fileMap.set(filePath, {
            path: filePath,
            status: uncommittedStatus.get(filePath) ?? 'M',
            insertions: ins,
            deletions: del,
          });
        }
      }
    } catch { /* no unstaged changes */ }

    // Any porcelain-only files (e.g. untracked) not yet in map
    for (const [filePath, status] of uncommittedStatus) {
      if (!fileMap.has(filePath)) {
        fileMap.set(filePath, { path: filePath, status, insertions: 0, deletions: 0 });
      }
    }

    const files = Array.from(fileMap.values());
    const insertions = files.reduce((s, f) => s + f.insertions, 0);
    const deletions = files.reduce((s, f) => s + f.deletions, 0);

    return {
      branch,
      baseBranch,
      baseCommit,
      ahead,
      behind,
      dirty,
      filesChanged: files.length,
      insertions,
      deletions,
      commitCount,
      files,
    };
  }

  async fullDiff(worktreePath: string, baseCommit: string, file?: string): Promise<string> {
    const fileArgs = file ? ['--', file] : [];

    // Committed changes since baseCommit
    let committedDiff = '';
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', `${baseCommit}..HEAD`, ...fileArgs],
        { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 }
      );
      committedDiff = stdout;
    } catch { /* no committed diff */ }

    // Uncommitted changes (staged + unstaged combined relative to HEAD)
    let uncommittedDiff = '';
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', 'HEAD', ...fileArgs],
        { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 }
      );
      uncommittedDiff = stdout;
    } catch { /* no uncommitted diff */ }

    const parts: string[] = [];
    if (committedDiff.trim()) parts.push(committedDiff.trimEnd());
    if (uncommittedDiff.trim()) parts.push(uncommittedDiff.trimEnd());
    return parts.join('\n');
  }

  // ── branch (D2) ───────────────────────────────────────────────────────────────

  /**
   * Rename the current branch of the worktree to `newName` (`git branch -m`).
   * Validates the name is a syntactically valid git branch ref (no spaces, no
   * control/reserved characters) before touching the repo. Throws ValidationError
   * (HTTP 400) for invalid names.
   */
  async renameBranch(worktreePath: string, newName: string): Promise<{ branchName: string }> {
    const name = (newName ?? '').trim();

    if (!name) {
      throw new ValidationError('Branch name cannot be empty');
    }
    if (/\s/.test(name)) {
      throw new ValidationError('Branch name cannot contain spaces');
    }

    // Defer to git for full ref-format rules (rejects names like "foo..bar",
    // leading "-", trailing "/", "@{", "~^:?*[", etc.). Purely lexical check.
    try {
      await execFileAsync('git', ['check-ref-format', '--branch', name], { cwd: worktreePath });
    } catch {
      throw new ValidationError(`"${name}" is not a valid git branch name`);
    }

    try {
      await execFileAsync('git', ['branch', '-m', name], { cwd: worktreePath });
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? '';
      const detail = (stderr || (err as Error).message || '').trim();
      throw new ValidationError(detail || `Failed to rename branch to "${name}"`);
    }

    return { branchName: name };
  }

  // ── merge (E1) ────────────────────────────────────────────────────────────────

  /** Files with unmerged ('U') status during an in-progress merge. */
  private async unmergedFiles(dir: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        'git', ['diff', '--name-only', '--diff-filter=U'], { cwd: dir }
      );
      return stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Merge `branchName` into `targetBranch` inside the main checkout (`projectDir`).
   * The worktree branch lives in its own worktree, so we switch the main checkout
   * to `targetBranch`, merge, then restore the original branch. On conflict the
   * merge is aborted so the working tree is left clean, and the conflicting file
   * list is returned with `success: false`.
   */
  async mergeBranch(
    projectDir: string,
    branchName: string,
    targetBranch: string
  ): Promise<{ success: boolean; message: string; conflicts?: string[] }> {
    // Refuse if the main checkout is dirty — switching branches would be unsafe.
    const { stdout: porcelain } = await execFileAsync(
      'git', ['status', '--porcelain'], { cwd: projectDir }
    );
    if (porcelain.trim().length > 0) {
      return {
        success: false,
        message: 'Target repository has uncommitted changes. Commit or stash them before merging.',
      };
    }

    const originalBranch = await this.currentBranch(projectDir);
    let switched = false;

    const restore = async () => {
      if (switched && originalBranch && originalBranch !== 'HEAD') {
        await execFileAsync('git', ['checkout', originalBranch], { cwd: projectDir }).catch(() => {});
      }
    };

    try {
      if (originalBranch !== targetBranch) {
        await execFileAsync('git', ['checkout', targetBranch], { cwd: projectDir });
        switched = true;
      }
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? '';
      return {
        success: false,
        message: (stderr || (err as Error).message).trim() || `Failed to checkout ${targetBranch}`,
      };
    }

    try {
      const { stdout } = await execFileAsync(
        'git', ['merge', '--no-edit', branchName], { cwd: projectDir }
      );
      await restore();
      return {
        success: true,
        message: stdout.trim() || `Merged ${branchName} into ${targetBranch}`,
      };
    } catch (err) {
      const conflicts = await this.unmergedFiles(projectDir);
      // Abort to keep the tree clean.
      await execFileAsync('git', ['merge', '--abort'], { cwd: projectDir }).catch(() => {});
      await restore();

      if (conflicts.length > 0) {
        return {
          success: false,
          message: `Merge aborted: conflicts in ${conflicts.length} file${conflicts.length === 1 ? '' : 's'}.`,
          conflicts,
        };
      }

      const e = err as { stderr?: string; stdout?: string };
      const detail = (e.stderr || e.stdout || (err as Error).message || '').trim();
      return {
        success: false,
        message: detail || `Failed to merge ${branchName} into ${targetBranch}`,
      };
    }
  }

  // ── pr ───────────────────────────────────────────────────────────────────────

  /**
   * Push the worktree branch to `origin` (setting upstream) and open a GitHub
   * pull request via `gh`. Returns the new PR's url + number. Requires `gh` to be
   * installed and authenticated — callers should gate on {@link capabilities}
   * first for a friendlier error. Throws ValidationError (HTTP 400) when the push
   * or `gh pr create` fails, surfacing git/gh's own message.
   */
  async createPullRequest(
    worktreePath: string,
    branchName: string,
    title: string,
    body: string,
    baseBranch: string
  ): Promise<GitPrInfo> {
    // 1. Publish the branch to origin (idempotent; -u sets upstream).
    try {
      await execFileAsync('git', ['push', '-u', 'origin', branchName], { cwd: worktreePath });
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? '';
      const detail = (stderr || (err as Error).message || '').trim();
      throw new ValidationError(`Failed to push branch '${branchName}' to origin: ${detail}`);
    }

    // 2. Open the pull request.
    let stdout = '';
    try {
      ({ stdout } = await execFileAsync(
        'gh',
        ['pr', 'create', '--title', title, '--body', body, '--base', baseBranch, '--head', branchName],
        { cwd: worktreePath }
      ));
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? '';
      const detail = (stderr || (err as Error).message || '').trim();
      throw new ValidationError(detail || 'Failed to create pull request');
    }

    const { url, number } = parsePullRequestUrl(stdout);
    if (!url) {
      throw new ValidationError('Pull request was created but gh returned no URL to parse');
    }

    return { url, number, state: 'OPEN' };
  }

  /**
   * Look up an existing pull request for `branchOrNumber` (a PR number or the
   * head branch) via `gh pr view --json`. Returns live state, check rollup and
   * review decision, or `null` when no PR exists / `gh` is unavailable — callers
   * treat a missing PR as "none" rather than an error.
   */
  async getPullRequest(
    worktreePath: string,
    branchOrNumber: string
  ): Promise<GitPrInfo | null> {
    const ref = (branchOrNumber ?? '').trim();
    if (!ref) return null;

    let stdout = '';
    try {
      ({ stdout } = await execFileAsync(
        'gh',
        ['pr', 'view', ref, '--json', 'state,statusCheckRollup,reviewDecision,url,number'],
        { cwd: worktreePath }
      ));
    } catch {
      // No PR for this ref, gh missing, or unauthenticated — surface as "no PR".
      return null;
    }

    let data: {
      url?: string;
      number?: number;
      state?: string;
      statusCheckRollup?: unknown;
      reviewDecision?: string | null;
    };
    try {
      data = JSON.parse(stdout);
    } catch {
      return null;
    }

    if (!data.url || typeof data.number !== 'number') return null;

    const state = (data.state ?? 'OPEN').toUpperCase() as GitPrInfo['state'];
    const reviewDecision = (data.reviewDecision || null) as GitPrInfo['reviewDecision'];

    return {
      url: data.url,
      number: data.number,
      state,
      checks: rollupChecks(data.statusCheckRollup),
      reviewDecision,
    };
  }
}

// Backward-compat alias
export { GitService as GitWorktreeService };
