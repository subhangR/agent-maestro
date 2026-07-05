import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ValidationError } from '../../domain/common/Errors';

/**
 * Server-side port of the Tauri Rust filesystem commands (persist.rs / files.rs).
 *
 * Why this exists: the folder picker (New Project / New Session "Browse") and the
 * File Explorer / Code Editor read the host filesystem. In the Tauri desktop app
 * this is done via Rust `invoke` commands, which don't exist in the browser
 * web-ui. These HTTP-friendly methods give the browser the same capability over
 * REST, mirroring the Rust confinement rules so behaviour matches the desktop.
 *
 * Return shapes are camelCase to match the Rust `#[serde(rename_all = "camelCase")]`
 * structs, so the shared UI types work for both hosts.
 */

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024; // 2MB — matches files.rs
const BINARY_CHECK_BYTES = 8 * 1024;

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
}

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

/**
 * Returns the set of base directories the client is permitted to touch. Derived
 * from server-side state (never the client) — see createFsRoutes, which sources
 * it from the user's home dir + every registered project's working dir.
 */
export type AllowedRootsProvider = () => Promise<string[]> | string[];

/** Expand a leading `~` (or `~/...`) to the user's home directory. */
function expandHome(p: string): string {
  const trimmed = p.trim();
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export class WorkspaceFsService {
  /**
   * @param getAllowedRoots server-derived allowlist of permitted base dirs. The
   * client never chooses these; every request is confined to (or under) one of
   * them. Defaults to the user's home directory.
   */
  constructor(private readonly getAllowedRoots: AllowedRootsProvider = () => [os.homedir()]) {}

  /**
   * Browse directories for the folder picker. Lists only subdirectories of the
   * given path (defaulting to the home directory), confined to the allowlisted
   * roots so the client cannot enumerate arbitrary host directories.
   */
  async listDirectories(inputPath: string | null): Promise<DirectoryListing> {
    const expanded = inputPath ? expandHome(inputPath) : '';
    const desired = expanded.trim() === '' ? os.homedir() : expanded;

    await this.assertPermitted(desired);
    if (!(await isDirectory(desired))) {
      throw new ValidationError('not a directory');
    }

    const dirents = await fs.readdir(desired, { withFileTypes: true });
    const entries: DirectoryEntry[] = [];
    for (const dirent of dirents) {
      const full = path.join(desired, dirent.name);
      // Follow symlinks: stat (not the dirent type) decides if it's a directory.
      if (await isDirectory(full)) {
        entries.push({ name: dirent.name, path: full });
      }
    }
    entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    const parent = path.dirname(desired);
    return {
      path: desired,
      parent: parent === desired ? null : parent,
      entries,
    };
  }

  /**
   * Validate (and create if missing) a directory. Empty input → null. Mirrors
   * `validate_directory`: an existing dir returns its expanded path; a missing
   * one is created (recursively) and returned.
   */
  async validateDirectory(inputPath: string): Promise<string | null> {
    const expanded = expandHome(inputPath ?? '');
    if (expanded.trim() === '') return null;

    await this.assertPermitted(expanded);
    if (await isDirectory(expanded)) return expanded;

    try {
      await fs.mkdir(expanded, { recursive: true });
      return expanded;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ValidationError(`Failed to create directory: ${message}`);
    }
  }

  /** List entries (files + dirs) of a directory confined within `root`. */
  async listEntries(root: string, target: string): Promise<FsEntry[]> {
    const dir = await this.ensureWithinRoot(root, target);
    if (!(await isDirectory(dir))) {
      throw new ValidationError('not a directory');
    }

    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const entries: FsEntry[] = [];
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      let isDir = dirent.isDirectory();
      let size = 0;
      if (!dirent.isDirectory() && !dirent.isFile()) {
        // Symlink/other — follow it to decide type/size, skip if unreadable.
        try {
          const stat = await fs.stat(full);
          isDir = stat.isDirectory();
          size = stat.size;
        } catch {
          continue;
        }
      } else if (dirent.isFile()) {
        try {
          size = (await fs.stat(full)).size;
        } catch {
          size = 0;
        }
      }
      entries.push({ name: dirent.name, path: full, isDir, size: isDir ? 0 : size });
    }

    entries.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    return entries;
  }

  /** Read a UTF-8 text file confined within `root`. Rejects binary/oversized. */
  async readTextFile(root: string, target: string): Promise<string> {
    const file = await this.ensureWithinRoot(root, target);
    const stat = await fs.stat(file);
    if (!stat.isFile()) {
      throw new ValidationError('not a file');
    }
    if (stat.size > MAX_TEXT_FILE_BYTES) {
      throw new ValidationError(
        `file too large (${stat.size} bytes, max ${MAX_TEXT_FILE_BYTES} bytes)`
      );
    }

    const bytes = await fs.readFile(file);
    const checkLen = Math.min(bytes.length, BINARY_CHECK_BYTES);
    for (let i = 0; i < checkLen; i++) {
      if (bytes[i] === 0) {
        throw new ValidationError('binary files are not supported');
      }
    }
    return bytes.toString('utf8');
  }

  /** Overwrite an existing text file confined within `root`. */
  async writeTextFile(root: string, target: string, content: string): Promise<void> {
    const file = await this.ensureWithinRoot(root, target);
    if (!(await fs.stat(file)).isFile()) {
      throw new ValidationError('not a file');
    }
    await fs.writeFile(file, content, 'utf8');
  }

  /** Rename an entry (within its parent) confined within `root`. */
  async renameEntry(root: string, target: string, newName: string): Promise<string> {
    const canonRoot = await this.ensureParentWithinRoot(root, target);
    const from = target.trim();
    if (from === canonRoot) {
      throw new ValidationError('cannot rename root');
    }

    const name = newName.trim();
    if (name === '') throw new ValidationError('missing new name');
    if (name === '.' || name === '..') throw new ValidationError('invalid name');
    if (name.includes('/') || name.includes('\\')) {
      throw new ValidationError('name must not contain path separators');
    }

    const to = path.join(path.dirname(from), name);
    if (await pathExists(to)) {
      throw new ValidationError('target already exists');
    }
    await fs.lstat(from); // ensure source exists (mirrors symlink_metadata check)
    await fs.rename(from, to);
    return to;
  }

  /** Delete a file or directory (recursive) confined within `root`. */
  async deleteEntry(root: string, target: string): Promise<void> {
    const canonRoot = await this.ensureParentWithinRoot(root, target);
    const path0 = target.trim();
    if (path0 === canonRoot) {
      throw new ValidationError('cannot delete root');
    }
    const meta = await fs.lstat(path0);
    if (meta.isSymbolicLink() || meta.isFile()) {
      await fs.rm(path0, { force: false });
      return;
    }
    await fs.rm(path0, { recursive: true, force: false });
  }

  // --- confinement helpers (mirror files.rs) -------------------------------

  private async ensureRootDir(root: string): Promise<string> {
    const r = root.trim();
    if (!path.isAbsolute(r)) {
      throw new ValidationError('root must be absolute');
    }
    if (!(await isDirectory(r))) {
      throw new ValidationError('root is not a directory');
    }
    const real = await fs.realpath(r);
    await this.assertPermitted(real);
    return real;
  }

  // --- server-side allowlist (mitigates client-chosen arbitrary roots) -------

  /** Realpath'd, existing allowlisted base directories from server-side state. */
  private async allowedRoots(): Promise<string[]> {
    const raw = await this.getAllowedRoots();
    const resolved: string[] = [];
    for (const r of raw) {
      if (!r || !r.trim()) continue;
      try {
        resolved.push(await fs.realpath(r));
      } catch {
        // Skip roots that don't exist on disk (e.g. a project dir was removed).
      }
    }
    return resolved;
  }

  /**
   * Resolve a path to its on-disk location: the realpath if it exists, otherwise
   * the realpath of its nearest existing ancestor with the not-yet-created tail
   * re-appended (the tail cannot contain symlinks, so this is escape-safe).
   */
  private async realResolve(input: string): Promise<string> {
    let cur = path.resolve(input);
    const tail: string[] = [];
    for (;;) {
      try {
        const real = await fs.realpath(cur);
        return tail.length ? path.join(real, ...tail.reverse()) : real;
      } catch {
        const parent = path.dirname(cur);
        if (parent === cur) return path.resolve(input);
        tail.push(path.basename(cur));
        cur = parent;
      }
    }
  }

  /** Throw unless `input` resolves to a location within an allowlisted root. */
  private async assertPermitted(input: string): Promise<void> {
    if (input.split(/[\\/]/).includes('..')) {
      throw new ValidationError('path must not contain ".."');
    }
    const resolved = await this.realResolve(input);
    const roots = await this.allowedRoots();
    if (!roots.some((root) => isWithin(root, resolved))) {
      throw new ValidationError('path is not within an allowed workspace root');
    }
  }

  /** Resolve `target` and assert it lies within the canonical `root`. */
  private async ensureWithinRoot(root: string, target: string): Promise<string> {
    const canonRoot = await this.ensureRootDir(root);
    const t = target.trim();
    if (!path.isAbsolute(t)) {
      throw new ValidationError('path must be absolute');
    }
    let canon: string;
    try {
      canon = await fs.realpath(t);
    } catch {
      throw new ValidationError('path not found');
    }
    if (!isWithin(canonRoot, canon)) {
      throw new ValidationError('path is outside root');
    }
    return canon;
  }

  /** Assert the parent of `target` lies within the canonical `root`. */
  private async ensureParentWithinRoot(root: string, target: string): Promise<string> {
    const canonRoot = await this.ensureRootDir(root);
    const t = target.trim();
    if (!path.isAbsolute(t)) {
      throw new ValidationError('path must be absolute');
    }
    const parent = path.dirname(t);
    let canonParent: string;
    try {
      canonParent = await fs.realpath(parent);
    } catch {
      throw new ValidationError('parent not found');
    }
    if (!isWithin(canonRoot, canonParent)) {
      throw new ValidationError('path is outside root');
    }
    return canonRoot;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** True when `child` is `root` itself or nested under it (path-segment aware). */
function isWithin(root: string, child: string): boolean {
  if (child === root) return true;
  const rel = path.relative(root, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
