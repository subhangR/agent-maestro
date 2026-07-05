import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webFs } from '../platform/fs';
import { API_BASE_URL } from '../utils/serverConfig';

/**
 * The browser web-ui talks to the server's /api/fs/* endpoints for filesystem
 * access (the Tauri desktop shell uses native invoke). These tests pin the
 * request shapes and response unwrapping so the folder picker + File Explorer
 * keep working in browser mode.
 */
describe('webFs provider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function ok(body: unknown) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  }

  it('listDirectories GETs /fs/list-directories with the path param', async () => {
    const listing = { path: '/home/u', parent: '/home', entries: [] };
    fetchMock.mockReturnValueOnce(ok(listing));

    const result = await webFs.listDirectories('/home/u');

    expect(result).toEqual(listing);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/fs/list-directories?path=%2Fhome%2Fu`);
  });

  it('listDirectories omits the query string when path is null', async () => {
    fetchMock.mockReturnValueOnce(ok({ path: '/home/u', parent: '/home', entries: [] }));
    await webFs.listDirectories(null);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/fs/list-directories`);
  });

  it('validateDirectory POSTs the path and unwraps the result', async () => {
    fetchMock.mockReturnValueOnce(ok({ path: '/made/dir' }));

    const result = await webFs.validateDirectory('/made/dir');

    expect(result).toBe('/made/dir');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/fs/validate-directory`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ path: '/made/dir' });
  });

  it('readTextFile returns the unwrapped content', async () => {
    fetchMock.mockReturnValueOnce(ok({ content: 'hello world' }));
    expect(await webFs.readTextFile('/root', '/root/a.txt')).toBe('hello world');
  });

  it('listEntries GETs with root and path', async () => {
    const entries = [{ name: 'a.txt', path: '/root/a.txt', isDir: false, size: 2 }];
    fetchMock.mockReturnValueOnce(ok(entries));
    expect(await webFs.listEntries('/root', '/root')).toEqual(entries);
  });

  it('surfaces the server error message on a failed request', async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: true, message: 'path is outside root' }),
      } as Response),
    );

    await expect(webFs.readTextFile('/root', '/etc/passwd')).rejects.toThrow('path is outside root');
  });
});
