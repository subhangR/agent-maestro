import { promises as fs, realpathSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceFsService } from '../src/application/services/WorkspaceFsService';

/**
 * Tests for the server-side filesystem service that backs the browser web-ui's
 * folder picker and file explorer (mirrors the Tauri Rust commands in
 * persist.rs / files.rs). The desktop app uses native `invoke`; the browser has
 * none, so these REST-friendly methods give it parity.
 */
describe('WorkspaceFsService', () => {
  let svc: WorkspaceFsService;
  let root: string; // canonical temp workspace root

  beforeEach(async () => {
    const raw = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-fs-'));
    root = realpathSync(raw); // macOS tmpdir is a symlink → canonicalize for confinement comparisons
    // Allowlist the temp workspace + home (server-derived in production).
    svc = new WorkspaceFsService(() => [root, os.homedir()]);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('listDirectories', () => {
    it('returns only subdirectories, sorted, with a parent', async () => {
      await fs.mkdir(path.join(root, 'beta'));
      await fs.mkdir(path.join(root, 'Alpha'));
      await fs.writeFile(path.join(root, 'file.txt'), 'x');

      const listing = await svc.listDirectories(root);

      expect(listing.path).toBe(root);
      expect(listing.parent).toBe(path.dirname(root));
      expect(listing.entries.map((e) => e.name)).toEqual(['Alpha', 'beta']);
      expect(listing.entries[0].path).toBe(path.join(root, 'Alpha'));
    });

    it('defaults to the home directory when path is null', async () => {
      const listing = await svc.listDirectories(null);
      expect(listing.path).toBe(os.homedir());
    });

    it('expands a leading ~ to the home directory', async () => {
      const listing = await svc.listDirectories('~');
      expect(listing.path).toBe(os.homedir());
    });

    it('rejects a path that is not a directory', async () => {
      const file = path.join(root, 'a.txt');
      await fs.writeFile(file, 'x');
      await expect(svc.listDirectories(file)).rejects.toThrow(/not a directory/i);
    });
  });

  describe('validateDirectory', () => {
    it('returns null for an empty path', async () => {
      expect(await svc.validateDirectory('')).toBeNull();
      expect(await svc.validateDirectory('   ')).toBeNull();
    });

    it('returns the expanded path for an existing directory', async () => {
      expect(await svc.validateDirectory(root)).toBe(root);
    });

    it('creates a missing directory and returns its path', async () => {
      const target = path.join(root, 'created', 'nested');
      const result = await svc.validateDirectory(target);
      expect(result).toBe(target);
      const stat = await fs.stat(target);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('listEntries', () => {
    it('lists entries with isDir/size, directories first then alphabetical', async () => {
      await fs.mkdir(path.join(root, 'src'));
      await fs.writeFile(path.join(root, 'README.md'), 'hello');
      await fs.writeFile(path.join(root, 'apple.txt'), 'aa');

      const entries = await svc.listEntries(root, root);

      expect(entries.map((e) => e.name)).toEqual(['src', 'apple.txt', 'README.md']);
      const dir = entries.find((e) => e.name === 'src')!;
      expect(dir.isDir).toBe(true);
      expect(dir.size).toBe(0);
      const file = entries.find((e) => e.name === 'apple.txt')!;
      expect(file.isDir).toBe(false);
      expect(file.size).toBe(2);
    });

    it('rejects a path outside the root', async () => {
      const outside = realpathSync(os.tmpdir());
      await expect(svc.listEntries(root, outside)).rejects.toThrow(/outside root/i);
    });

    it('rejects a non-absolute root', async () => {
      await expect(svc.listEntries('relative/root', root)).rejects.toThrow(/absolute/i);
    });
  });

  describe('readTextFile', () => {
    it('reads a UTF-8 text file within root', async () => {
      const file = path.join(root, 'note.md');
      await fs.writeFile(file, 'line one\nline two');
      expect(await svc.readTextFile(root, file)).toBe('line one\nline two');
    });

    it('rejects a binary file', async () => {
      const file = path.join(root, 'bin.dat');
      await fs.writeFile(file, Buffer.from([0x00, 0x01, 0x02, 0x00]));
      await expect(svc.readTextFile(root, file)).rejects.toThrow(/binary/i);
    });

    it('rejects a path outside root', async () => {
      const outside = path.join(realpathSync(os.tmpdir()), 'elsewhere.txt');
      await fs.writeFile(outside, 'secret');
      try {
        await expect(svc.readTextFile(root, outside)).rejects.toThrow(/outside root/i);
      } finally {
        await fs.rm(outside, { force: true });
      }
    });

    it('rejects a directory', async () => {
      await expect(svc.readTextFile(root, root)).rejects.toThrow(/not a file/i);
    });
  });

  describe('writeTextFile', () => {
    it('overwrites an existing file', async () => {
      const file = path.join(root, 'edit.txt');
      await fs.writeFile(file, 'old');
      await svc.writeTextFile(root, file, 'new content');
      expect(await fs.readFile(file, 'utf8')).toBe('new content');
    });

    it('rejects writing to a non-existent file (editor only saves files it opened)', async () => {
      const file = path.join(root, 'missing.txt');
      await expect(svc.writeTextFile(root, file, 'x')).rejects.toThrow(/not a file|not found/i);
    });
  });

  describe('renameEntry', () => {
    it('renames a file within root', async () => {
      const file = path.join(root, 'old.txt');
      await fs.writeFile(file, 'x');
      const renamed = await svc.renameEntry(root, file, 'new.txt');
      expect(renamed).toBe(path.join(root, 'new.txt'));
      expect(await fs.readFile(renamed, 'utf8')).toBe('x');
    });

    it('rejects a name containing a path separator', async () => {
      const file = path.join(root, 'a.txt');
      await fs.writeFile(file, 'x');
      await expect(svc.renameEntry(root, file, 'b/c.txt')).rejects.toThrow(/separator/i);
    });

    it('rejects when the target already exists', async () => {
      await fs.writeFile(path.join(root, 'a.txt'), 'a');
      await fs.writeFile(path.join(root, 'b.txt'), 'b');
      await expect(svc.renameEntry(root, path.join(root, 'a.txt'), 'b.txt')).rejects.toThrow(/already exists/i);
    });
  });

  describe('deleteEntry', () => {
    it('deletes a file within root', async () => {
      const file = path.join(root, 'gone.txt');
      await fs.writeFile(file, 'x');
      await svc.deleteEntry(root, file);
      await expect(fs.stat(file)).rejects.toThrow();
    });

    it('deletes a directory recursively', async () => {
      const dir = path.join(root, 'sub');
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, 'inner.txt'), 'x');
      await svc.deleteEntry(root, dir);
      await expect(fs.stat(dir)).rejects.toThrow();
    });

    it('refuses to delete the root itself', async () => {
      // The root's parent lies outside the root, so confinement blocks it first.
      await expect(svc.deleteEntry(root, root)).rejects.toThrow(/outside root|cannot delete root/i);
    });
  });

  describe('server-side allowlist (rejects client-chosen arbitrary roots)', () => {
    it('rejects a root that is not in the allowlist', async () => {
      const other = realpathSync(await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-other-')));
      try {
        await fs.writeFile(path.join(other, 'a.txt'), 'x');
        const locked = new WorkspaceFsService(() => [root]); // only `root` is allowed
        await expect(locked.listEntries(other, other)).rejects.toThrow(/allowed workspace root/i);
        await expect(locked.readTextFile(other, path.join(other, 'a.txt'))).rejects.toThrow(
          /allowed workspace root/i,
        );
        await expect(locked.listDirectories(other)).rejects.toThrow(/allowed workspace root/i);
      } finally {
        await fs.rm(other, { recursive: true, force: true });
      }
    });

    it('rejects browsing a directory outside the allowlist', async () => {
      const locked = new WorkspaceFsService(() => [root]);
      // The temp dir's parent is an ancestor of `root`, so it is not allowlisted.
      await expect(locked.listDirectories(path.dirname(root))).rejects.toThrow(/allowed workspace root/i);
    });

    it('rejects validating/creating a directory outside the allowlist', async () => {
      const locked = new WorkspaceFsService(() => [root]);
      await expect(locked.validateDirectory(path.join(os.tmpdir(), 'maestro-should-not-exist'))).rejects.toThrow(
        /allowed workspace root/i,
      );
    });

    it('rejects a path containing ".."', async () => {
      await expect(svc.listDirectories(`${root}/../escape`)).rejects.toThrow(/\.\./);
    });

    it('allows creating a new directory under an allowlisted root', async () => {
      const target = path.join(root, 'fresh', 'nested');
      expect(await svc.validateDirectory(target)).toBe(target);
    });
  });
});
