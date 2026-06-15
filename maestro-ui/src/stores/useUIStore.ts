import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { AppInfo } from '../app/types/app-state';
import { UpdateCheckState } from '../components/modals/UpdateModal';
import { formatError } from '../utils/formatters';
import * as DEFAULTS from '../app/constants/defaults';
import type { DocEntry } from '../app/types/maestro';

/* ------------------------------------------------------------------ */
/*  Helper functions (semver / github)                                  */
/* ------------------------------------------------------------------ */

function parseGithubRepo(value: string | null | undefined): { owner: string; repo: string } | null {
  const raw = value?.trim() ?? '';
  if (!raw) return null;

  const direct = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\.git)?\/?$/);
  if (direct) {
    return { owner: direct[1], repo: direct[2] };
  }

  try {
    const url = new URL(raw);
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    let repo = parts[1];
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);
    return { owner: parts[0], repo };
  } catch {
    return null;
  }
}

function parseSemver(input: string): number[] | null {
  const match = input.trim().match(/\d+(?:\.\d+)+/);
  if (!match) return null;
  const parts = match[0].split('.').filter(Boolean);
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return nums;
}

function compareSemver(a: string, b: string): number | null {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Module-level notice timer (replaces useRef)                         */
/* ------------------------------------------------------------------ */

let noticeTimerRef: number | null = null;

/* ------------------------------------------------------------------ */
/*  Helper: read clamped numeric value from localStorage                */
/* ------------------------------------------------------------------ */

function readClampedFromStorage(key: string, min: number, max: number, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(parsed)) {
      return Math.min(max, Math.max(min, parsed));
    }
  } catch {
    // best-effort
  }
  return fallback;
}

export type IconRailSection = 'tasks' | 'members' | 'teams' | 'skills' | 'lists' | 'graphs' | 'files' | null;

function readIconRailSection(): IconRailSection {
  try {
    const raw = localStorage.getItem(DEFAULTS.STORAGE_ICON_RAIL_SECTION_KEY);
    if (raw && ['tasks', 'members', 'teams', 'skills', 'lists', 'graphs', 'files'].includes(raw)) {
      return raw as IconRailSection;
    }
  } catch {
    // best-effort
  }
  return 'tasks';
}

function readBoolFromStorage(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
  } catch {
    // best-effort
  }
  return fallback;
}

function readProjectsListHeightMode(): 'auto' | 'manual' {
  try {
    const raw = localStorage.getItem(DEFAULTS.STORAGE_SIDEBAR_PROJECTS_LIST_MAX_HEIGHT_KEY);
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? 'manual' : 'auto';
  } catch {
    return 'auto';
  }
}

/* ------------------------------------------------------------------ */
/*  Store interface                                                     */
/* ------------------------------------------------------------------ */

interface UIState {
  // Notifications
  error: string | null;
  notice: string | null;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  reportError: (prefix: string, err: unknown) => void;
  showNotice: (message: string, timeoutMs?: number) => void;
  dismissNotice: () => void;

  // Icon rail + Maestro sidebar (left panel)
  iconRailActiveSection: IconRailSection;
  maestroSidebarWidth: number;
  setIconRailActiveSection: (section: IconRailSection) => void;
  toggleIconRailSection: (section: Exclude<IconRailSection, null>) => void;
  setMaestroSidebarWidth: (width: number) => void;
  persistMaestroSidebarWidth: (width: number) => void;

  // Sessions list — per-tile display toggles (the "View" menu)
  sessionShowTaskDetails: boolean;
  toggleSessionShowTaskDetails: () => void;
  sessionShowCompletedSubSessions: boolean;
  toggleSessionShowCompletedSubSessions: () => void;
  sessionShowBadges: boolean;
  toggleSessionShowBadges: () => void;
  sessionShowElapsed: boolean;
  toggleSessionShowElapsed: () => void;

  // Spaces panel (right) — null = collapsed, 'sessions' = expanded
  spacesRailActiveSection: 'sessions' | null;
  setSpacesRailActiveSection: (section: 'sessions' | null) => void;
  toggleSpacesPanel: () => void;

  // Layout
  sidebarWidth: number;
  rightPanelWidth: number;
  activeRightPanel: 'none' | 'maestro' | 'files';
  projectsListHeightMode: 'auto' | 'manual';
  projectsListMaxHeight: number;
  setSidebarWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setActiveRightPanel: (panel: 'none' | 'maestro' | 'files') => void;
  setProjectsListHeightMode: (mode: 'auto' | 'manual') => void;
  setProjectsListMaxHeight: (height: number | ((prev: number) => number)) => void;
  persistSidebarWidth: (value: number) => void;
  persistRightPanelWidth: (value: number) => void;

  // Slide panel
  slidePanelOpen: boolean;
  slidePanelTab: string;
  slidePanelWidth: number;
  setSlidePanelOpen: (open: boolean) => void;
  setSlidePanelTab: (tab: string) => void;
  setSlidePanelWidth: (width: number) => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Maestro create task trigger (consumed by MaestroPanel)
  createTaskRequested: boolean;
  setCreateTaskRequested: (requested: boolean) => void;

  // Maestro board trigger (consumed by MaestroPanel)
  showBoardRequested: boolean;
  setShowBoardRequested: (requested: boolean) => void;

  // Team view overlay — root maestro session id of the re-rootable hierarchy
  teamViewRootId: string | null;
  setTeamViewRootId: (sessionId: string | null) => void;

  // Task detail overlay (covers workspace area)
  taskDetailOverlay: { taskId: string; projectId: string } | null;
  setTaskDetailOverlay: (overlay: { taskId: string; projectId: string } | null) => void;

  // Session detail overlay (covers workspace area)
  sessionDetailOverlay: { sessionId: string; projectId: string } | null;
  setSessionDetailOverlay: (overlay: { sessionId: string; projectId: string } | null) => void;

  // Inspected (inactive) maestro session — drives the SessionStatsView in the
  // center pane when the user selects a session whose PTY has exited or is gone.
  inspectedSessionId: string | null;
  setInspectedSessionId: (id: string | null) => void;

  // App update
  appInfo: AppInfo | null;
  updatesOpen: boolean;
  updateCheckState: UpdateCheckState;
  updateBannerDismissedVersion: string | null;
  setAppInfo: (info: AppInfo | null) => void;
  setUpdatesOpen: (open: boolean) => void;
  setUpdateCheckState: (state: UpdateCheckState) => void;
  dismissUpdateBanner: () => void;
  checkForUpdates: () => Promise<void>;
  loadAppInfo: () => Promise<void>;

  // Responsive layout
  responsiveMode: boolean;
  activeMobilePanel: 'sidebar' | 'terminal' | 'maestro';
  setResponsiveMode: (mode: boolean) => void;
  setActiveMobilePanel: (panel: 'sidebar' | 'terminal' | 'maestro') => void;

  // Home directory
  homeDir: string | null;
  setHomeDir: (dir: string | null) => void;

  // Doc overlay — shown on top of the current view when a doc/diagram is opened
  docOverlay: DocEntry | null;
  setDocOverlay: (doc: DocEntry | null) => void;
}

/* ------------------------------------------------------------------ */
/*  Store creation                                                      */
/* ------------------------------------------------------------------ */

export const useUIStore = create<UIState>((set, get) => ({
  // -- Notifications --
  error: null,
  notice: null,
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),
  reportError: (prefix, err) => {
    set({ error: `${prefix}: ${formatError(err)}` });
  },
  showNotice: (message, timeoutMs = 4500) => {
    set({ notice: message });
    if (noticeTimerRef !== null) {
      window.clearTimeout(noticeTimerRef);
    }
    noticeTimerRef = window.setTimeout(() => {
      noticeTimerRef = null;
      set({ notice: null });
    }, timeoutMs);
  },
  dismissNotice: () => {
    set({ notice: null });
    if (noticeTimerRef !== null) {
      window.clearTimeout(noticeTimerRef);
      noticeTimerRef = null;
    }
  },

  // -- Icon rail + Maestro sidebar --
  iconRailActiveSection: readIconRailSection(),
  maestroSidebarWidth: readClampedFromStorage(
    DEFAULTS.STORAGE_MAESTRO_SIDEBAR_WIDTH_KEY,
    DEFAULTS.MIN_MAESTRO_SIDEBAR_WIDTH,
    DEFAULTS.MAX_MAESTRO_SIDEBAR_WIDTH,
    DEFAULTS.DEFAULT_MAESTRO_SIDEBAR_WIDTH,
  ),
  setIconRailActiveSection: (section) => {
    set({ iconRailActiveSection: section });
    try {
      if (section) {
        localStorage.setItem(DEFAULTS.STORAGE_ICON_RAIL_SECTION_KEY, section);
      } else {
        localStorage.removeItem(DEFAULTS.STORAGE_ICON_RAIL_SECTION_KEY);
      }
    } catch {
      // best-effort
    }
  },
  toggleIconRailSection: (section) => {
    const current = get().iconRailActiveSection;
    const next = current === section ? null : section;
    get().setIconRailActiveSection(next);
  },
  setMaestroSidebarWidth: (width) => set({ maestroSidebarWidth: width }),
  persistMaestroSidebarWidth: (value) => {
    try {
      localStorage.setItem(DEFAULTS.STORAGE_MAESTRO_SIDEBAR_WIDTH_KEY, String(value));
    } catch {
      // best-effort
    }
  },

  // -- Sessions list: per-tile display toggles (the "View" menu) --
  sessionShowTaskDetails: readBoolFromStorage(DEFAULTS.STORAGE_SESSION_SHOW_TASK_DETAILS_KEY, false),
  toggleSessionShowTaskDetails: () => {
    const next = !get().sessionShowTaskDetails;
    set({ sessionShowTaskDetails: next });
    try {
      localStorage.setItem(DEFAULTS.STORAGE_SESSION_SHOW_TASK_DETAILS_KEY, next ? '1' : '0');
    } catch {
      // best-effort
    }
  },
  // Defaults to true: spawn trees show every sub-session until the user opts to hide finished ones.
  sessionShowCompletedSubSessions: readBoolFromStorage(DEFAULTS.STORAGE_SESSION_SHOW_COMPLETED_SUBSESSIONS_KEY, true),
  toggleSessionShowCompletedSubSessions: () => {
    const next = !get().sessionShowCompletedSubSessions;
    set({ sessionShowCompletedSubSessions: next });
    try {
      localStorage.setItem(DEFAULTS.STORAGE_SESSION_SHOW_COMPLETED_SUBSESSIONS_KEY, next ? '1' : '0');
    } catch {
      // best-effort
    }
  },
  sessionShowBadges: readBoolFromStorage(DEFAULTS.STORAGE_SESSION_SHOW_BADGES_KEY, false),
  toggleSessionShowBadges: () => {
    const next = !get().sessionShowBadges;
    set({ sessionShowBadges: next });
    try {
      localStorage.setItem(DEFAULTS.STORAGE_SESSION_SHOW_BADGES_KEY, next ? '1' : '0');
    } catch {
      // best-effort
    }
  },
  sessionShowElapsed: readBoolFromStorage(DEFAULTS.STORAGE_SESSION_SHOW_ELAPSED_KEY, false),
  toggleSessionShowElapsed: () => {
    const next = !get().sessionShowElapsed;
    set({ sessionShowElapsed: next });
    try {
      localStorage.setItem(DEFAULTS.STORAGE_SESSION_SHOW_ELAPSED_KEY, next ? '1' : '0');
    } catch {
      // best-effort
    }
  },

  // -- Spaces panel (right) --
  spacesRailActiveSection: 'sessions' as 'sessions' | null,
  setSpacesRailActiveSection: (section) => set({ spacesRailActiveSection: section }),
  toggleSpacesPanel: () => {
    const current = get().spacesRailActiveSection;
    set({ spacesRailActiveSection: current === null ? 'sessions' : null });
  },

  // -- Layout --
  sidebarWidth: readClampedFromStorage(
    DEFAULTS.STORAGE_SIDEBAR_WIDTH_KEY,
    DEFAULTS.MIN_SIDEBAR_WIDTH,
    DEFAULTS.MAX_SIDEBAR_WIDTH,
    DEFAULTS.DEFAULT_SIDEBAR_WIDTH,
  ),
  rightPanelWidth: readClampedFromStorage(
    DEFAULTS.STORAGE_RIGHT_PANEL_WIDTH_KEY,
    DEFAULTS.MIN_RIGHT_PANEL_WIDTH,
    DEFAULTS.MAX_RIGHT_PANEL_WIDTH,
    DEFAULTS.DEFAULT_RIGHT_PANEL_WIDTH,
  ),
  activeRightPanel: 'maestro',
  projectsListHeightMode: readProjectsListHeightMode(),
  projectsListMaxHeight: readClampedFromStorage(
    DEFAULTS.STORAGE_SIDEBAR_PROJECTS_LIST_MAX_HEIGHT_KEY,
    DEFAULTS.MIN_SIDEBAR_PROJECTS_LIST_MAX_HEIGHT,
    DEFAULTS.MAX_SIDEBAR_PROJECTS_LIST_MAX_HEIGHT,
    DEFAULTS.DEFAULT_SIDEBAR_PROJECTS_LIST_MAX_HEIGHT,
  ),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),
  setProjectsListHeightMode: (mode) => set({ projectsListHeightMode: mode }),
  setProjectsListMaxHeight: (height) =>
    set((state) => ({
      projectsListMaxHeight:
        typeof height === 'function' ? height(state.projectsListMaxHeight) : height,
    })),
  persistSidebarWidth: (value) => {
    try {
      localStorage.setItem(DEFAULTS.STORAGE_SIDEBAR_WIDTH_KEY, String(value));
    } catch {
      // best-effort
    }
  },
  persistRightPanelWidth: (value) => {
    try {
      localStorage.setItem(DEFAULTS.STORAGE_RIGHT_PANEL_WIDTH_KEY, String(value));
    } catch {
      // best-effort
    }
  },

  // -- Slide panel --
  slidePanelOpen: false,
  slidePanelTab: '',
  slidePanelWidth: 400,
  setSlidePanelOpen: (open) => set({ slidePanelOpen: open }),
  setSlidePanelTab: (tab) => set({ slidePanelTab: tab }),
  setSlidePanelWidth: (width) => set({ slidePanelWidth: width }),

  // -- Command palette --
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  // -- Maestro create task trigger --
  createTaskRequested: false,
  setCreateTaskRequested: (requested) => set({ createTaskRequested: requested }),

  // -- Maestro board trigger --
  showBoardRequested: false,
  setShowBoardRequested: (requested) => set({ showBoardRequested: requested }),

  // -- Team view overlay --
  teamViewRootId: null,
  setTeamViewRootId: (sessionId) => set({ teamViewRootId: sessionId }),

  // -- Task detail overlay --
  taskDetailOverlay: null,
  setTaskDetailOverlay: (overlay) => set({ taskDetailOverlay: overlay }),

  sessionDetailOverlay: null,
  setSessionDetailOverlay: (overlay) => set({ sessionDetailOverlay: overlay }),

  inspectedSessionId: null,
  setInspectedSessionId: (id) => set({ inspectedSessionId: id }),

  // -- App update --
  appInfo: null,
  updatesOpen: false,
  updateCheckState: { status: 'idle' },
  updateBannerDismissedVersion: null,
  setAppInfo: (info) => set({ appInfo: info }),
  setUpdatesOpen: (open) => set({ updatesOpen: open }),
  setUpdateCheckState: (state) => set({ updateCheckState: state }),
  dismissUpdateBanner: () => {
    const { updateCheckState } = get();
    if (updateCheckState.status === 'updateAvailable') {
      set({ updateBannerDismissedVersion: updateCheckState.latestVersion });
    }
  },
  loadAppInfo: async () => {
    try {
      const info = await invoke<AppInfo>('get_app_info');
      set({ appInfo: info });
    } catch {
      // best-effort
    }
  },
  checkForUpdates: async () => {
    set({ updateCheckState: { status: 'checking' } });

    let info: AppInfo | null = null;
    try {
      info = await invoke<AppInfo>('get_app_info');
      set({ appInfo: info });
    } catch {
      info = null;
    }

    if (!info) {
      set({ updateCheckState: { status: 'error', message: 'Unable to read app info.' } });
      return;
    }

    const repo = parseGithubRepo(info.homepage);
    if (!repo) {
      set({
        updateCheckState: {
          status: 'error',
          message: 'Update source not configured. Set bundle.homepage to your GitHub repo URL.',
        },
      });
      return;
    }

    const fallbackReleaseUrl = `https://github.com/${repo.owner}/${repo.repo}/releases/latest`;
    const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`;

    try {
      const response = await fetch(apiUrl, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }
      const data = (await response.json()) as { tag_name?: string };
      const tag = data.tag_name?.trim();
      if (!tag) {
        set({ updateCheckState: { status: 'error', message: 'Latest release has no tag name.' } });
        return;
      }

      const current = info.version;
      const cmp = compareSemver(tag, current);

      const releaseUrl = fallbackReleaseUrl;
      const isNewer =
        cmp === null
          ? tag.trim().replace(/^v/i, '') !== current.trim().replace(/^v/i, '')
          : cmp > 0;

      if (isNewer) {
        set({
          updateCheckState: {
            status: 'updateAvailable',
            latestVersion: tag,
            releaseUrl,
          },
        });
        return;
      }

      set({
        updateCheckState: {
          status: 'upToDate',
          latestVersion: tag,
          releaseUrl,
        },
      });
    } catch (err) {
      set({
        updateCheckState: {
          status: 'error',
          message: `Update check failed: ${formatError(err)}`,
        },
      });
    }
  },

  // -- Responsive layout --
  responsiveMode: false,
  activeMobilePanel: 'terminal',
  setResponsiveMode: (mode) => set({ responsiveMode: mode }),
  setActiveMobilePanel: (panel) => set({ activeMobilePanel: panel }),

  // -- Home directory --
  homeDir: null,
  setHomeDir: (dir) => set({ homeDir: dir }),

  // -- Doc overlay --
  docOverlay: null,
  setDocOverlay: (doc) => set({ docOverlay: doc }),
}));

/* ------------------------------------------------------------------ */
/*  Global error handlers                                               */
/* ------------------------------------------------------------------ */

/**
 * Initialise global error / unhandled-rejection handlers that forward
 * to the UI store's reportError.  Call once during app bootstrap.
 */
export function initGlobalErrorHandlers(): () => void {
  const handleError = (event: ErrorEvent) => {
    useUIStore.getState().reportError('Unexpected error', event.error ?? event.message);
  };
  const handleRejection = (event: PromiseRejectionEvent) => {
    useUIStore.getState().reportError('Unhandled promise rejection', event.reason);
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
