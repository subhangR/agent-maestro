import { invoke } from '@tauri-apps/api/core';
import { API_BASE_URL } from '../utils/serverConfig';
import type { DirectoryListing } from '../app/types/app-state';

export type { DirectoryListing, DirectoryEntry } from '../app/types/app-state';

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

/**
 * Host filesystem access used by the folder picker ("Browse") and the File
 * Explorer / Code Editor. Two backends with identical shapes:
 *   - Tauri desktop → Rust `invoke` commands (persist.rs / files.rs)
 *   - Browser web-ui → server REST endpoints (/api/fs/*)
 * so callers are host-agnostic, mirroring platform/logs.ts.
 */
export interface FsProvider {
  /** Browse subdirectories of `path` (null → home). For the folder picker. */
  listDirectories(path: string | null): Promise<DirectoryListing>;
  /** Validate (creating if missing) a directory. Empty input → null. */
  validateDirectory(path: string): Promise<string | null>;
  /** List entries of a directory confined within `root`. */
  listEntries(root: string, path: string): Promise<FsEntry[]>;
  /** Read a UTF-8 text file confined within `root`. */
  readTextFile(root: string, path: string): Promise<string>;
  /** Overwrite an existing text file confined within `root`. */
  writeTextFile(root: string, path: string, content: string): Promise<void>;
  /** Rename an entry confined within `root`; returns the new absolute path. */
  renameEntry(root: string, path: string, newName: string): Promise<string>;
  /** Delete an entry (file or directory) confined within `root`. */
  deleteEntry(root: string, path: string): Promise<void>;
}

export const tauriFs: FsProvider = {
  listDirectories: (path) => invoke<DirectoryListing>('list_directories', { path }),
  validateDirectory: (path) => invoke<string | null>('validate_directory', { path }),
  listEntries: (root, path) => invoke<FsEntry[]>('list_fs_entries', { root, path }),
  readTextFile: (root, path) => invoke<string>('read_text_file', { root, path }),
  writeTextFile: (root, path, content) => invoke<void>('write_text_file', { root, path, content }),
  renameEntry: (root, path, newName) => invoke<string>('rename_fs_entry', { root, path, newName }),
  deleteEntry: (root, path) => invoke<void>('delete_fs_entry', { root, path }),
};

/** Surface the server's structured error message so callers can display it. */
async function throwHttpError(res: Response, fallback: string): Promise<never> {
  let message = `${fallback} (${res.status})`;
  try {
    const body = await res.json();
    if (body && typeof body.message === 'string') message = body.message;
  } catch {
    /* non-JSON body — keep the fallback message */
  }
  throw new Error(message);
}

async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`);
  if (!res.ok) return throwHttpError(res, 'filesystem request failed');
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return throwHttpError(res, 'filesystem request failed');
  return res.json() as Promise<T>;
}

export const webFs: FsProvider = {
  listDirectories: (path) =>
    getJson<DirectoryListing>('/fs/list-directories', path ? { path } : {}),
  async validateDirectory(path) {
    const { path: validated } = await postJson<{ path: string | null }>('/fs/validate-directory', { path });
    return validated;
  },
  listEntries: (root, path) => getJson<FsEntry[]>('/fs/list-entries', { root, path }),
  async readTextFile(root, path) {
    const { content } = await getJson<{ content: string }>('/fs/read-file', { root, path });
    return content;
  },
  async writeTextFile(root, path, content) {
    await postJson<{ ok: true }>('/fs/write-file', { root, path, content });
  },
  async renameEntry(root, path, newName) {
    const { path: renamed } = await postJson<{ path: string }>('/fs/rename', { root, path, newName });
    return renamed;
  },
  async deleteEntry(root, path) {
    await postJson<{ ok: true }>('/fs/delete', { root, path });
  },
};
