/**
 * Tests for onNewSubmit terminal creation (Bug: "New terminals are not opening").
 *
 * Root cause (pre-fix): onNewSubmit resolved the working directory to '' because
 * its fallback was homeDirRef.current, which App.tsx wired as { current: null }
 * (permanently null). validate_directory('') then returned null, the submit hit a
 * silent early return, and the only feedback (setError) wrote to an unrendered
 * UIStore.error field — so clicking "Create Terminal" did nothing.
 *
 * Fix (verified here):
 *   - The cwd fallback uses useUIStore.homeDir (populated at startup) instead of
 *     the permanently-null homeDirRef.current.
 *   - Directory validation goes through platform.fs.validateDirectory, the unified
 *     provider that works in both desktop (Tauri invoke) and web (server REST)
 *     runtimes — so the [NEW TERMINAL] modal works in either build.
 *   - A failed validation surfaces a visible showNotice() toast instead of the
 *     dead setError path.
 *
 * Note: the desktop-vs-web behaviour of validateDirectory itself lives in
 * platform/fs.ts and is covered by its own tests; onNewSubmit no longer branches
 * on IS_TAURI, so these tests mock platform.fs.validateDirectory directly.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mutable mock state (hoisted so vi.mock factories may reference it) ───────
const h = vi.hoisted(() => ({
  homeDir: '/home/testuser' as string | null,
  activeProjectId: null as string | null,
  projects: [] as Array<{ id: string; basePath?: string | null }>,
  showNotice: vi.fn(),
  reportError: vi.fn(),
  validateDirectory: vi.fn(),
}));

// ── Mock platform: fs.validateDirectory is the unified (Tauri/web) validator ─
vi.mock('../platform', () => ({
  IS_TAURI: true,
  platform: {
    fs: {
      validateDirectory: h.validateDirectory,
    },
    terminal: {
      onOutput: vi.fn(() => () => {}),
      onSize: undefined,
      onExit: vi.fn(() => () => {}),
    },
  },
}));

// ── Mock Tauri invoke (onNewSubmit no longer calls it; the module still imports it)
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// ── Mock sessionService ────────────────────────────────────────────────────
vi.mock('../services/sessionService', () => ({
  createSession: vi.fn(),
  closeSession: vi.fn(),
}));

// ── Mock useUIStore ────────────────────────────────────────────────────────
vi.mock('../stores/useUIStore', () => ({
  useUIStore: {
    getState: vi.fn(() => ({
      homeDir: h.homeDir,
      showNotice: h.showNotice,
      reportError: h.reportError,
    })),
  },
}));

// ── Mock useProjectStore (driven by hoisted state) ─────────────────────────
vi.mock('../stores/useProjectStore', () => ({
  useProjectStore: {
    getState: vi.fn(() => ({
      activeProjectId: h.activeProjectId,
      projects: h.projects,
    })),
  },
}));

vi.mock('../stores/useEnvironmentStore', () => ({
  useEnvironmentStore: {
    getState: vi.fn(() => ({ environments: [] })),
  },
}));

vi.mock('../stores/useAssetStore', () => ({
  useAssetStore: {
    getState: vi.fn(() => ({
      ensureAutoAssets: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

// ── Stub stores used elsewhere in useSessionStore (not by onNewSubmit) ──────
vi.mock('../stores/useSshStore', () => ({
  useSshStore: { getState: vi.fn(() => ({})) },
}));
vi.mock('../stores/useWorkspaceStore', () => ({
  useWorkspaceStore: { getState: vi.fn(() => ({})) },
  getActiveWorkspaceView: vi.fn(),
}));
vi.mock('../stores/useRecordingStore', () => ({
  useRecordingStore: { getState: vi.fn(() => ({})) },
}));
vi.mock('../stores/useAgentShortcutStore', () => ({
  useAgentShortcutStore: { getState: vi.fn(() => ({ agentShortcutIds: [] })) },
}));
vi.mock('../stores/usePersistentSessionStore', () => ({
  usePersistentSessionStore: { getState: vi.fn(() => ({})) },
}));
vi.mock('../utils/MaestroClient', () => ({
  maestroClient: {
    on: vi.fn(),
    updateSession: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Imports (after all vi.mock calls) ──────────────────────────────────────
import { createSession } from '../services/sessionService';
import { useSessionStore } from '../stores/useSessionStore';

const mockCreateSession = createSession as ReturnType<typeof vi.fn>;

const submit = () =>
  useSessionStore
    .getState()
    .onNewSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);

describe('onNewSubmit — new terminal creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.homeDir = '/home/testuser';
    h.activeProjectId = null;
    h.projects = [];
    // validate_directory echoes the path it receives (simulates a valid dir)
    h.validateDirectory.mockImplementation((path: string) =>
      Promise.resolve(path || null),
    );
    mockCreateSession.mockResolvedValue({
      id: 'sess-1',
      name: 'my-terminal',
      exited: false,
      closing: false,
    });
    useSessionStore.setState({
      newName: 'my-terminal',
      newCommand: '',
      newPersistent: false,
      newCwd: '',
    });
  });

  it('falls back to useUIStore.homeDir as the cwd when the project has no basePath', async () => {
    // Regression for the original bug: the fallback was homeDirRef.current
    // (permanently null) → desiredCwd '' → validation failed → silent no-op.
    await submit();

    expect(h.validateDirectory).toHaveBeenCalledWith('/home/testuser');
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/home/testuser' }),
    );
  });

  it('prefers the active project basePath over homeDir', async () => {
    h.activeProjectId = 'proj-1';
    h.projects = [{ id: 'proj-1', basePath: '/work/project' }];

    await submit();

    expect(h.validateDirectory).toHaveBeenCalledWith('/work/project');
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/work/project' }),
    );
  });

  it('surfaces a visible notice and creates no terminal when validation fails', async () => {
    // Regression: failures used to go to setError (unrendered) → no feedback.
    h.validateDirectory.mockResolvedValue(null);

    await submit();

    expect(h.showNotice).toHaveBeenCalledWith(
      expect.stringContaining('Working directory'),
    );
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
