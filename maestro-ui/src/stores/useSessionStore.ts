import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { platform, IS_TAURI } from '../platform';
import { TerminalSession, TerminalSessionInfo } from '../app/types/session';
import { PendingDataBuffer, RecentSessionKey, Prompt } from '../app/types/app-state';
import { TerminalRegistry } from '../SessionTerminal';
import {
  detectProcessEffect,
  getProcessEffectById,
  PROCESS_EFFECTS,
} from '../processEffects';
import { isSshCommandLine, sshTargetFromCommandLine, buildSshCommandAtRemoteDir, parsePort } from '../app/utils/ssh';
import { envVarsForProjectId } from '../app/utils/env';
import { createSession, closeSession } from '../services/sessionService';
import { maestroClient } from '../utils/MaestroClient';
import { formatError } from '../utils/formatters';
import { sleep } from '../utils/domUtils';
import { hasMeaningfulOutput } from '../services/terminalService';
import { shortenPathSmart } from '../pathDisplay';
import * as DEFAULTS from '../app/constants/defaults';
import type { MutableRefObject } from 'react';
import { useUIStore } from './useUIStore';
import { useProjectStore } from './useProjectStore';
import { useEnvironmentStore } from './useEnvironmentStore';
import { useAssetStore } from './useAssetStore';
import { useSshStore } from './useSshStore';
import { useWorkspaceStore, getActiveWorkspaceView } from './useWorkspaceStore';
import { useRecordingStore } from './useRecordingStore';
import { useAgentShortcutStore } from './useAgentShortcutStore';
import { usePersistentSessionStore } from './usePersistentSessionStore';

/* ------------------------------------------------------------------ */
/*  Module-level refs (not reactive state)                              */
/* ------------------------------------------------------------------ */

export const pendingExitCodes = new Map<string, number | null>();
export const closingSessions = new Map<string, number>();
export const agentIdleTimersRef = new Map<string, number>();
export const lastResizeAtRef = new Map<string, number>();
export const commandLifecycleSessionsRef = new Set<string>();
export const spawningSessionsRef = new Set<string>();

/**
 * Web mode only: the authoritative PTY dimensions the server reports on attach,
 * before it replays scrollback. A terminal that mounts after this arrives reads
 * it to size its xterm to the width the buffered output was authored at, so the
 * replay doesn't wrap at the wrong column. Cleared when the terminal adopts it.
 */
export const serverPtySizes = new Map<string, { cols: number; rows: number }>();

/**
 * Web mode only: sessions whose terminal has already fit to its pane and shipped
 * that size to the PTY. From that point the client's size is authoritative and
 * the server's one-shot `size` snapshot (sent at attach, e.g. 80x24) must NOT
 * resize the xterm grid: over a high-latency link that stale frame can land
 * AFTER the client fit, snapping the grid back to the snapshot while the PTY
 * stays at the fitted width — Claude then addresses the cursor at one width and
 * xterm renders at another, producing overlapping/garbled glyphs until the next
 * manual resize. Set when a terminal ships its first authoritative fit, cleared
 * on dispose/exit so a fresh mount re-adopts the server size before replay.
 */
export const clientFittedSessions = new Set<string>();

/**
 * Web mode only: the most recent cols/rows any terminal fit to. All session
 * terminals share one pane geometry, so this is the exact size the next spawned
 * terminal will fit to. We send it in the spawn/resume request so the server
 * boots the PTY at the real width — the agent then never renders at the 80x24
 * default and the startup glyph-overlap desync disappears. null until the first
 * terminal fits (the very first spawn falls back to a pane-pixel estimate).
 */
export let lastFittedSize: { cols: number; rows: number } | null = null;
export function setLastFittedSize(size: { cols: number; rows: number }): void {
  lastFittedSize = size;
}

/* ------------------------------------------------------------------ */
/*  DOM-bound refs initialized by App.tsx                               */
/* ------------------------------------------------------------------ */

let registryRef: MutableRefObject<TerminalRegistry> | null = null;
let pendingDataRef: MutableRefObject<PendingDataBuffer> | null = null;
let homeDirRef: MutableRefObject<string | null> | null = null;

function _isRendererReady(term: unknown): boolean {
  try {
    const anyTerm = term as any;
    const rs = anyTerm?._core?._renderService;
    const ref = rs?._renderer;
    const r = ref?.value ?? ref?._value ?? null;
    return Boolean(r?.dimensions);
  } catch {
    return false;
  }
}

export function initSessionStoreRefs(
  registry: MutableRefObject<TerminalRegistry>,
  pendingData: MutableRefObject<PendingDataBuffer>,
  homeDir: MutableRefObject<string | null>,
) {
  registryRef = registry;
  pendingDataRef = pendingData;
  homeDirRef = homeDir;

  if (!IS_TAURI) {
    void platform.terminal.onOutput((id, data) => {
      if (closingSessions.has(id)) return;
      useSessionStore.getState().markAgentWorkingFromOutput(id, data);

      const entry = registryRef?.current.get(id);
      if (entry && _isRendererReady(entry.term)) {
        entry.term.write(data);
        return;
      }

      if (!pendingDataRef?.current) return;
      if (
        !pendingDataRef.current.has(id) &&
        pendingDataRef.current.size >= DEFAULTS.MAX_PENDING_SESSIONS
      ) {
        const oldest = pendingDataRef.current.keys().next().value as string | undefined;
        if (oldest) pendingDataRef.current.delete(oldest);
      }
      const buffer = pendingDataRef.current.get(id) ?? [];
      buffer.push(data);
      if (buffer.length > DEFAULTS.MAX_PENDING_CHUNKS_PER_SESSION) {
        buffer.splice(0, buffer.length - DEFAULTS.MAX_PENDING_CHUNKS_PER_SESSION);
      }
      pendingDataRef.current.delete(id);
      pendingDataRef.current.set(id, buffer);
    });

    void platform.terminal.onSize?.((id, size) => {
      if (!size.cols || !size.rows) return;
      // Once the client owns the size (has fit + shipped), the server's stale
      // attach snapshot must not touch the grid — see clientFittedSessions.
      if (clientFittedSessions.has(id)) return;
      // Remember it for terminals that haven't mounted yet (applied on mount).
      serverPtySizes.set(id, size);
      // If the terminal already exists, match the PTY width now so the scrollback
      // the server is about to replay renders at the column it was authored at.
      const entry = registryRef?.current.get(id);
      if (entry) {
        try {
          entry.term.resize(size.cols, size.rows);
        } catch {
          // ignore — a stale/closing term
        }
      }
    });

    void platform.terminal.onExit((id, exitCode) => {
      useSessionStore.getState().clearAgentIdleTimer(id);
      lastResizeAtRef.delete(id);
      serverPtySizes.delete(id);
      clientFittedSessions.delete(id);

      if (closingSessions.has(id)) {
        const timeout = closingSessions.get(id);
        if (timeout != null) window.clearTimeout(timeout);
        closingSessions.delete(id);
        return;
      }

      const { sessions } = useSessionStore.getState();
      const exitingSession = sessions.find((s) => s.id === id);

      useSessionStore.getState().setSessions((prev: TerminalSession[]) => {
        let found = false;
        const next = prev.map((s) => {
          if (s.id !== id) return s;
          found = true;
          return { ...s, exited: true, exitCode: exitCode ?? null, agentWorking: false, recordingActive: false };
        });
        if (!found) pendingExitCodes.set(id, exitCode ?? null);
        return next;
      });

      if (exitingSession?.maestroSessionId) {
        void maestroClient.updateSession(exitingSession.maestroSessionId, {
          status: 'stopped',
          completedAt: Date.now(),
        }).catch(() => {});
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const RESIZE_OUTPUT_SUPPRESS_MS = 900;

/* ------------------------------------------------------------------ */
/*  Store interface                                                     */
/* ------------------------------------------------------------------ */

interface SessionState {
  sessions: TerminalSession[];
  activeId: string | null;
  hydrated: boolean;
  newOpen: boolean;
  newName: string;
  newCommand: string;
  newPersistent: boolean;
  newCwd: string;
  sessionOrderByProject: Record<string, string[]>;
  recentSessionKeys: RecentSessionKey[];

  // Setters
  setSessions: (sessions: TerminalSession[] | ((prev: TerminalSession[]) => TerminalSession[])) => void;
  setActiveId: (id: string | null | ((prev: string | null) => string | null)) => void;
  setHydrated: (hydrated: boolean | ((prev: boolean) => boolean)) => void;
  setNewOpen: (open: boolean) => void;
  setNewName: (name: string) => void;
  setNewCommand: (command: string) => void;
  setNewPersistent: (persistent: boolean) => void;
  setNewCwd: (cwd: string) => void;
  setSessionOrderByProject: (
    v: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>),
  ) => void;
  setRecentSessionKeys: (
    keys: RecentSessionKey[] | ((prev: RecentSessionKey[]) => RecentSessionKey[]),
  ) => void;
  resetNewSessionForm: () => void;

  // Session lifecycle
  applyPendingExit: (session: TerminalSession) => TerminalSession;
  cleanupSessionResources: (id: string) => void;
  clearAgentIdleTimer: (id: string) => void;
  markAgentWorkingFromOutput: (id: string, data: string) => void;
  onSessionResize: (id: string) => void;
  onCwdChange: (id: string, cwd: string) => void;
  onCommandChange: (id: string, commandLine: string, source?: 'osc' | 'input') => void;

  // Session actions
  onClose: (id: string) => Promise<void>;
  quickStart: (preset: { id: string; title: string; command: string | null }) => Promise<void>;
  onNewSubmit: (e: React.FormEvent) => Promise<void>;
  onSshConnect: () => Promise<void>;
  attachPersistentSession: (persistId: string) => Promise<void>;
  handleOpenTerminalAtPath: (
    path: string,
    provider: 'local' | 'ssh',
    sshTarget: string | null,
  ) => Promise<void>;

  // Prompt sender
  sendPromptToSession: (sessionId: string, prompt: Prompt, mode: 'paste' | 'send') => Promise<void>;
  sendPromptToActive: (prompt: Prompt, mode: 'paste' | 'send') => Promise<void>;
  sendPromptFromCommandPalette: (prompt: Prompt, mode: 'paste' | 'send') => Promise<void>;

  // Replay
  sendNextReplayStep: () => Promise<void>;

  // Maestro sessions
  handleJumpToSessionFromTask: (maestroSessionId: string) => void;
  handleAddTaskToSessionRequest: (taskId: string) => void;
  handleSpawnTerminalSession: (sessionInfo: {
    maestroSessionId: string;
    name: string;
    command: string | null;
    args: string[];
    cwd: string;
    envVars: Record<string, string>;
    projectId: string;
  }) => Promise<void>;

  // Ordering
  reorderSessions: (draggedPersistId: string, targetPersistId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Derived selectors (pure functions reading from getState)            */
/* ------------------------------------------------------------------ */

export function getActive(): TerminalSession | null {
  const { sessions, activeId } = useSessionStore.getState();
  return sessions.find((s) => s.id === activeId) ?? null;
}

export function getActiveIsSsh(): boolean {
  const active = getActive();
  if (!active) return false;
  return isSshCommandLine(active.launchCommand ?? active.restoreCommand ?? null);
}

export function getActiveSshTarget(): string | null {
  const active = getActive();
  if (!active) return null;
  const isSsh = isSshCommandLine(active.launchCommand ?? active.restoreCommand ?? null);
  if (!isSsh) return null;
  const stored = active.sshTarget?.trim() ?? '';
  if (stored) return stored;
  return sshTargetFromCommandLine(active.launchCommand ?? active.restoreCommand ?? null);
}

export function getProjectSessions(projectId: string): TerminalSession[] {
  const { sessions } = useSessionStore.getState();
  return sessions.filter((s) => s.projectId === projectId);
}

export function getSessionCountByProject(projectId: string): number {
  return getProjectSessions(projectId).length;
}

export function getWorkingAgentCountByProject(projectId: string): number {
  return getProjectSessions(projectId).filter((s) => s.agentWorking).length;
}

export function getQuickStarts(agentShortcutIds: string[]): Array<{
  id: string;
  title: string;
  command: string | null;
  iconSrc: string | null;
}> {
  const presets: Array<{ id: string; title: string; command: string | null; iconSrc: string | null }> =
    [];
  const seen = new Set<string>();
  for (const id of agentShortcutIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const effect = getProcessEffectById(id);
    if (!effect) continue;
    presets.push({
      id: effect.id,
      title: effect.label,
      command: effect.matchCommands[0] ?? effect.label,
      iconSrc: effect.iconSrc ?? null,
    });
  }

  const pinned = new Set(presets.map((p) => p.id));
  const rest = PROCESS_EFFECTS.filter((e) => !pinned.has(e.id))
    .slice()
    .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()))
    .map((effect) => ({
      id: effect.id,
      title: effect.label,
      command: effect.matchCommands[0] ?? effect.label,
      iconSrc: effect.iconSrc ?? null,
    }));

  return [
    ...presets,
    ...rest,
    { id: 'shell', title: 'shell', command: null as string | null, iconSrc: null as string | null },
  ];
}

export function getCommandSuggestions(agentShortcutIds: string[]): string[] {
  const { sessions } = useSessionStore.getState();
  const quickStarts = getQuickStarts(agentShortcutIds);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  sessions
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((s) => {
      add(s.launchCommand ?? null);
      add((s.restoreCommand ?? null) as string | null);
    });

  for (const preset of quickStarts) add(preset.command ?? null);
  for (const effect of PROCESS_EFFECTS) for (const cmd of effect.matchCommands) add(cmd);

  return out.slice(0, 50);
}

export function getAgentShortcuts(agentShortcutIds: string[]) {
  const seen = new Set<string>();
  return agentShortcutIds
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => getProcessEffectById(id))
    .filter((effect): effect is NonNullable<ReturnType<typeof getProcessEffectById>> =>
      Boolean(effect),
    );
}

export function getSortedSessions(projectId: string): TerminalSession[] {
  const { sessions, sessionOrderByProject } = useSessionStore.getState();
  const filtered = sessions.filter((s) => s.projectId === projectId);
  const order = sessionOrderByProject[projectId] ?? [];

  if (order.length === 0) {
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }

  return filtered.sort((a, b) => {
    const indexA = order.indexOf(a.persistId);
    const indexB = order.indexOf(b.persistId);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return 1;
    if (indexB !== -1) return -1;
    return b.createdAt - a.createdAt;
  });
}

/* ------------------------------------------------------------------ */
/*  Store creation                                                      */
/* ------------------------------------------------------------------ */

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeId: null,
  hydrated: false,
  newOpen: false,
  newName: '',
  newCommand: '',
  newPersistent: true,
  newCwd: '',
  sessionOrderByProject: (() => {
    try {
      const raw = localStorage.getItem(DEFAULTS.STORAGE_SESSION_ORDER_BY_PROJECT_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (
          typeof k === 'string' &&
          Array.isArray(v) &&
          v.every((id) => typeof id === 'string')
        ) {
          out[k] = v;
        }
      }
      return out;
    } catch {
      return {};
    }
  })(),
  recentSessionKeys: (() => {
    try {
      const raw = localStorage.getItem(DEFAULTS.STORAGE_RECENT_SESSIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (entry: unknown): entry is { projectId: string; persistId: string } =>
            Boolean(entry) &&
            typeof (entry as Record<string, unknown>).projectId === 'string' &&
            typeof (entry as Record<string, unknown>).persistId === 'string',
        )
        .map((entry) => ({ projectId: entry.projectId, persistId: entry.persistId }))
        .slice(0, 50);
    } catch {
      return [];
    }
  })(),

  /* ---------------------------------------------------------------- */
  /*  Setters                                                          */
  /* ---------------------------------------------------------------- */

  setSessions: (sessions) =>
    set((s) => ({
      sessions: typeof sessions === 'function' ? sessions(s.sessions) : sessions,
    })),
  setActiveId: (id) =>
    set((s) => {
      const next = typeof id === 'function' ? id(s.activeId) : id;
      // Activating any terminal/space supersedes an inspected-stats view. This
      // must fire even when next === activeId: inspecting a session leaves
      // activeId untouched, so re-clicking the already-active tab (e.g. a
      // whiteboard you're "behind") is the only way back — an equality
      // short-circuit here would strand the stats view over that tab.
      if (next != null) {
        useUIStore.getState().setInspectedSessionId(null);
      }
      return { activeId: next };
    }),
  setHydrated: (hydrated) =>
    set((s) => ({
      hydrated: typeof hydrated === 'function' ? hydrated(s.hydrated) : hydrated,
    })),
  setNewOpen: (open) => set({ newOpen: open }),
  setNewName: (name) => set({ newName: name }),
  setNewCommand: (command) => set({ newCommand: command }),
  setNewPersistent: (persistent) => set({ newPersistent: persistent }),
  setNewCwd: (cwd) => set({ newCwd: cwd }),
  setSessionOrderByProject: (v) =>
    set((s) => ({
      sessionOrderByProject: typeof v === 'function' ? v(s.sessionOrderByProject) : v,
    })),
  setRecentSessionKeys: (keys) =>
    set((s) => ({
      recentSessionKeys: typeof keys === 'function' ? keys(s.recentSessionKeys) : keys,
    })),
  resetNewSessionForm: () =>
    set({ newName: '', newCommand: '', newPersistent: true, newCwd: '' }),

  /* ---------------------------------------------------------------- */
  /*  Session lifecycle                                                */
  /* ---------------------------------------------------------------- */

  applyPendingExit: (session) => {
    const pending = pendingExitCodes.get(session.id);
    if (pending === undefined) return session;
    pendingExitCodes.delete(session.id);

    // The pty-exit handler may have fired before this session was added to
    // the store, which means it couldn't send the server-side status update
    // (it didn't know the maestroSessionId yet). Send it now as a fallback.
    if (session.maestroSessionId) {
      void maestroClient.updateSession(session.maestroSessionId, {
        status: 'stopped',
        completedAt: Date.now(),
      }).catch(() => {});
    }

    return {
      ...session,
      exited: true,
      exitCode: pending,
      agentWorking: false,
      recordingActive: false,
    };
  },

  cleanupSessionResources: (id) => {
    get().clearAgentIdleTimer(id);
    lastResizeAtRef.delete(id);
    if (!closingSessions.has(id)) {
      const timeout = window.setTimeout(() => {
        closingSessions.delete(id);
        pendingDataRef?.current.delete(id);
      }, DEFAULTS.SESSION_CLOSE_CLEANUP_TIMEOUT_MS);
      closingSessions.set(id, timeout);
    }
    pendingDataRef?.current.delete(id);
    void closeSession(id).catch(() => { /* best-effort session close */ });
  },

  clearAgentIdleTimer: (id) => {
    const existing = agentIdleTimersRef.get(id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      agentIdleTimersRef.delete(id);
    }
  },

  markAgentWorkingFromOutput: (id, data) => {
    const { sessions, activeId } = get();
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    // Maestro agent terminals carry no process effectId (they're identified by
    // maestroSessionId + metadata.agentTool), but they still stream bytes and
    // must drive the live/streaming indicators.
    if ((!session.effectId && !session.maestroSessionId) || session.exited || session.closing) return;
    if (!data) return;

    const lastResize = lastResizeAtRef.get(id);
    if (
      lastResize !== undefined &&
      Date.now() - lastResize < RESIZE_OUTPUT_SUPPRESS_MS
    )
      return;
    if (!hasMeaningfulOutput(data)) return;
    if (session.persistent && !session.agentWorking && activeId !== id) return;

    if (!session.agentWorking) {
      set((s) => ({
        sessions: s.sessions.map((s2) =>
          s2.id === id ? { ...s2, agentWorking: true } : s2,
        ),
      }));
    }

    // Schedule agent idle — for process-effect terminals AND maestro agent
    // sessions (no effectId, default idle timeout) so agentWorking resets when
    // the byte stream stops.
    get().clearAgentIdleTimer(id);
    if (session.effectId || session.maestroSessionId) {
      const effect = getProcessEffectById(session.effectId);
      const idleAfterMs = effect?.idleAfterMs ?? DEFAULTS.AGENT_IDLE_TIMEOUT_MS;
      const timeout = window.setTimeout(() => {
        agentIdleTimersRef.delete(id);
        set((s) => ({
          sessions: s.sessions.map((s2) => {
            if (s2.id !== id) return s2;
            if (!s2.agentWorking) return s2;
            return { ...s2, agentWorking: false };
          }),
        }));
      }, idleAfterMs);
      agentIdleTimersRef.set(id, timeout);
    }
  },

  onSessionResize: (id) => {
    lastResizeAtRef.set(id, Date.now());
  },

  onCwdChange: (id, cwd) => {
    const trimmed = cwd.trim();
    if (!trimmed) return;
    commandLifecycleSessionsRef.add(id);
    get().clearAgentIdleTimer(id);
    set((s) => ({
      sessions: s.sessions.map((s2) => {
        if (s2.id !== id) return s2;
        const nextCwd = s2.cwd !== trimmed ? trimmed : s2.cwd;
        if (nextCwd === s2.cwd && !s2.agentWorking && !s2.effectId) return s2;
        return {
          ...s2,
          cwd: nextCwd,
          effectId: null,
          agentWorking: false,
          processTag: null,
        };
      }),
    }));
  },

  onCommandChange: (id, commandLine, source = 'input') => {
    const trimmed = commandLine.trim();

    if (source === 'osc') {
      commandLifecycleSessionsRef.add(id);
      if (!trimmed) {
        get().clearAgentIdleTimer(id);
        set((s) => ({
          sessions: s.sessions.map((s2) => {
            if (s2.id !== id) return s2;
            if (!s2.effectId && !s2.agentWorking) return s2;
            return { ...s2, effectId: null, agentWorking: false, processTag: null };
          }),
        }));
        return;
      }
      const effect = detectProcessEffect({ command: trimmed, name: null });
      const nextEffectId = effect?.id ?? null;
      get().clearAgentIdleTimer(id);
      set((s) => ({
        sessions: s.sessions.map((s2) => {
          if (s2.id !== id) return s2;
          const nextRestoreCommand = effect && !s2.persistent ? trimmed : null;
          if (
            s2.effectId === nextEffectId &&
            (s2.restoreCommand ?? null) === nextRestoreCommand &&
            !s2.agentWorking
          ) {
            return s2;
          }
          return {
            ...s2,
            effectId: nextEffectId,
            agentWorking: false,
            restoreCommand: nextRestoreCommand,
            processTag: null,
          };
        }),
      }));
      return;
    }

    if (commandLifecycleSessionsRef.has(id)) return;
    if (!trimmed) return;

    const effect = detectProcessEffect({ command: trimmed, name: null });
    const nextEffectId = effect?.id ?? null;
    get().clearAgentIdleTimer(id);
    set((s) => ({
      sessions: s.sessions.map((s2) => {
        if (s2.id !== id) return s2;
        const nextRestoreCommand = effect && !s2.persistent ? trimmed : null;
        if (
          s2.effectId === nextEffectId &&
          (s2.restoreCommand ?? null) === nextRestoreCommand &&
          !s2.agentWorking
        )
          return s2;
        return {
          ...s2,
          effectId: nextEffectId,
          agentWorking: false,
          restoreCommand: nextRestoreCommand,
          processTag: null,
        };
      }),
    }));
  },

  /* ---------------------------------------------------------------- */
  /*  Session actions                                                  */
  /* ---------------------------------------------------------------- */

  onClose: async (id) => {
    const { sessions, clearAgentIdleTimer, setSessions, setActiveId } = get();
    clearAgentIdleTimer(id);
    lastResizeAtRef.delete(id);
    const session = sessions.find((s) => s.id === id) ?? null;
    const wasPersistent = Boolean(session?.persistent && !session?.exited);

    if (session?.maestroSessionId) {
      const maestroId = session.maestroSessionId;
      if (!IS_TAURI) {
        // Browser/server-PTY mode: an explicit close must actually terminate the
        // server-hosted PTY. Merely flipping status would leave a zombie process
        // running headless. This is the only user path that kills a server PTY;
        // tab close / reload only detaches (see platform/terminal.ts).
        void maestroClient.stopSessionPty(maestroId).catch(() => {
          void maestroClient.updateSession(maestroId, {
            status: 'stopped',
            completedAt: Date.now(),
          }).catch(() => {});
        });
      } else {
        void maestroClient.updateSession(maestroId, {
          status: 'stopped',
          completedAt: Date.now(),
        }).catch(() => { /* best-effort server status update */ });
      }
    }
    if (session?.recordingActive) {
      try {
        await invoke('stop_session_recording', { id });
      } catch {
        // ignore
      }
    }

    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, closing: true } : s)),
    );

    if (!closingSessions.has(id)) {
      const timeout = window.setTimeout(() => {
        closingSessions.delete(id);
        pendingDataRef?.current.delete(id);
      }, DEFAULTS.SESSION_CLOSE_CLEANUP_TIMEOUT_MS);
      closingSessions.set(id, timeout);
    }
    pendingDataRef?.current.delete(id);

    let killErr: string | null = null;
    let killedPersistent = false;
    let closeErr: unknown | null = null;
    try {
      try {
        await closeSession(id);
      } catch (err) {
        closeErr = err;
      }

      if (wasPersistent && session?.persistId) {
        try {
          await invoke('kill_persistent_session', { persistId: session.persistId });
          killedPersistent = true;
        } catch (err) {
          killErr = formatError(err);
        } finally {
          void usePersistentSessionStore.getState().refreshPersistentSessions();
        }
      }

      if (closeErr) throw closeErr;
    } catch (err) {
      const timeout = closingSessions.get(id);
      if (timeout !== undefined) window.clearTimeout(timeout);
      closingSessions.delete(id);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, closing: false } : s)),
      );
      useUIStore.getState().reportError('Failed to close session', err);
      return;
    }

    const { showNotice } = useUIStore.getState();
    if (wasPersistent && session) {
      if (killedPersistent) {
        showNotice(`Closed "${session.name}" and killed persistent terminal.`);
      } else if (killErr) {
        showNotice(
          `Closed "${session.name}" but failed to kill persistent terminal.`,
        );
      } else {
        showNotice(`Closed "${session.name}".`);
      }
    }

    setSessions((prev) => {
      const closing = prev.find((s) => s.id === id);
      const next = prev.filter((s) => s.id !== id);
      setActiveId((prevActive) => {
        if (prevActive !== id) return prevActive;
        if (!closing) return next.length ? next[0].id : null;
        const sameProject = next.filter((s) => s.projectId === closing.projectId);
        return sameProject.length ? sameProject[0].id : null;
      });
      return next;
    });
  },

  quickStart: async (preset) => {
    const { activeProjectId, projects } = useProjectStore.getState();
    const activeProject =
      projects.find((p: MaestroProjectLike) => p.id === activeProjectId) ?? null;
    const { environments } = useEnvironmentStore.getState();
    const { ensureAutoAssets } = useAssetStore.getState();
    const { reportError } = useUIStore.getState();

    try {
      const cwd = activeProject?.basePath ?? homeDirRef?.current ?? null;
      if (cwd) await ensureAutoAssets(cwd, activeProjectId);
      const createdRaw = await createSession({
        projectId: activeProjectId,
        name: preset.title,
        launchCommand: null,
        cwd,
        envVars: envVarsForProjectId(activeProjectId, projects, environments),
      });
      const s = get().applyPendingExit(createdRaw);
      set((st) => ({ sessions: [...st.sessions, s], activeId: s.id }));
      const commandLine = (preset.command ?? '').trim();
      if (commandLine) {
        void platform.terminal.write(s.id, `${commandLine}\r`, 'ui').catch((err) =>
          reportError(`Failed to start ${preset.title}`, err),
        );
      }
    } catch (err) {
      reportError(`Failed to start ${preset.title}`, err);
    }
  },

  onNewSubmit: async (e) => {
    e.preventDefault();
    const {
      newName,
      newCommand,
      newPersistent,
      newCwd,
      applyPendingExit,
      setSessions,
      setActiveId,
      setNewOpen,
      resetNewSessionForm,
    } = get();
    const { activeProjectId, projects } = useProjectStore.getState();
    const activeProject =
      projects.find((p: MaestroProjectLike) => p.id === activeProjectId) ?? null;
    const { environments } = useEnvironmentStore.getState();
    const { ensureAutoAssets } = useAssetStore.getState();
    const { reportError, showNotice, homeDir } = useUIStore.getState();

    const name = newName.trim() || undefined;
    try {
      const launchCommand = newCommand.trim() || null;
      const desiredCwd =
        newCwd.trim() || activeProject?.basePath || homeDir || '';
      const validatedCwd = await platform.fs.validateDirectory(desiredCwd).catch(() => null);
      if (!validatedCwd) {
        showNotice('Working directory must be an existing folder.');
        return;
      }
      await ensureAutoAssets(validatedCwd, activeProjectId);
      const createdRaw = await createSession({
        projectId: activeProjectId,
        name,
        launchCommand,
        persistent: newPersistent,
        cwd: validatedCwd,
        envVars: envVarsForProjectId(activeProjectId, projects, environments),
      });
      const s = applyPendingExit(createdRaw);
      setSessions((prev) => [...prev, s]);
      setActiveId(s.id);
      setNewOpen(false);
      resetNewSessionForm();
    } catch (err) {
      reportError('Failed to create session', err);
    }
  },

  onSshConnect: async () => {
    const { activeProjectId, projects } = useProjectStore.getState();
    const activeProject =
      projects.find((p: MaestroProjectLike) => p.id === activeProjectId) ?? null;
    const { environments } = useEnvironmentStore.getState();
    const { ensureAutoAssets } = useAssetStore.getState();
    const { reportError } = useUIStore.getState();
    const ssh = useSshStore.getState();

    ssh.setSshError(null);
    const target = ssh.sshHost.trim();
    if (!target) {
      ssh.setSshError('Pick an SSH host.');
      return;
    }

    for (const [idx, f] of ssh.sshForwards.entries()) {
      const listenPort = parsePort(f.listenPort);
      if (!listenPort) {
        ssh.setSshError(`Forward #${idx + 1}: invalid listen port.`);
        return;
      }
      if (f.type !== 'dynamic') {
        if (!f.destinationHost.trim()) {
          ssh.setSshError(`Forward #${idx + 1}: destination host is required.`);
          return;
        }
        const destPort = parsePort(f.destinationPort);
        if (!destPort) {
          ssh.setSshError(`Forward #${idx + 1}: invalid destination port.`);
          return;
        }
      }
    }

    const command = ssh.getSshCommandPreview();
    if (!command) {
      ssh.setSshError('Invalid SSH configuration.');
      return;
    }

    try {
      const desiredCwd = activeProject?.basePath ?? homeDirRef?.current ?? '';
      const validatedCwd = await platform.fs.validateDirectory(desiredCwd).catch(() => null);
      if (!validatedCwd) {
        ssh.setSshError('Working directory must be an existing folder.');
        return;
      }
      await ensureAutoAssets(validatedCwd, activeProjectId);

      const name = `ssh ${target}`;
      const createdRaw = await createSession({
        projectId: activeProjectId,
        name,
        launchCommand: ssh.sshPersistent ? null : command,
        restoreCommand: ssh.sshPersistent ? command : null,
        persistent: ssh.sshPersistent,
        cwd: validatedCwd,
        envVars: envVarsForProjectId(activeProjectId, projects, environments),
      });
      const s = get().applyPendingExit(createdRaw);
      set((st) => ({ sessions: [...st.sessions, s], activeId: s.id }));
      ssh.setSshManagerOpen(false);

      if (ssh.sshPersistent) {
        void (async () => {
          try {
            await platform.terminal.write(s.id, command, 'system');
            await sleep(30);
            await platform.terminal.write(s.id, '\r', 'system');
          } catch (err) {
            reportError('Failed to start SSH inside persistent session', err);
          }
        })();
      }
    } catch (err) {
      ssh.setSshError(formatError(err));
    }
  },

  attachPersistentSession: async (persistId) => {
    const { sessions, applyPendingExit, setSessions, setActiveId } = get();
    const { activeProjectId, projects, setActiveProjectId } =
      useProjectStore.getState();
    const activeProject =
      projects.find((p: MaestroProjectLike) => p.id === activeProjectId) ?? null;
    const { environments } = useEnvironmentStore.getState();
    const { ensureAutoAssets } = useAssetStore.getState();
    const { reportError } = useUIStore.getState();

    const existing =
      sessions.find((s) => s.persistId === persistId) ?? null;
    if (existing && !existing.exited && !existing.closing) {
      setActiveProjectId(existing.projectId);
      setActiveId(existing.id);
      return;
    }

    const cwd = activeProject?.basePath ?? homeDirRef?.current ?? null;
    try {
      if (cwd) await ensureAutoAssets(cwd, activeProjectId);
      const createdRaw = await createSession({
        projectId: activeProjectId,
        name: `persist ${persistId.slice(0, 8)}`,
        persistent: true,
        persistId,
        cwd,
        envVars: envVarsForProjectId(activeProjectId, projects, environments),
      });
      const created = applyPendingExit(createdRaw);
      setSessions((prev) => [...prev, created]);
      setActiveId(created.id);
    } catch (err) {
      reportError('Failed to attach persistent session', err);
    }
  },

  handleOpenTerminalAtPath: async (path, provider, sshTarget) => {
    const desiredPath = path.trim();
    if (!desiredPath) return;
    const { activeProjectId, projects } = useProjectStore.getState();
    const activeProject =
      projects.find((p: MaestroProjectLike) => p.id === activeProjectId) ?? null;
    const { environments } = useEnvironmentStore.getState();
    const { ensureAutoAssets } = useAssetStore.getState();
    const { showNotice, reportError } = useUIStore.getState();
    const envVars = envVarsForProjectId(activeProjectId, projects, environments);
    const { sessions, activeId, applyPendingExit, setSessions, setActiveId } =
      get();
    const active = sessions.find((s) => s.id === activeId) ?? null;

    if (provider === 'local') {
      const validatedCwd = await platform.fs.validateDirectory(desiredPath).catch(() => null);
      if (!validatedCwd) {
        showNotice('Working directory must be an existing folder.');
        return;
      }
      await ensureAutoAssets(validatedCwd, activeProjectId);
      try {
        const createdRaw = await createSession({
          projectId: activeProjectId,
          name:
            desiredPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || undefined,
          cwd: validatedCwd,
          envVars,
        });
        const s = applyPendingExit(createdRaw);
        setSessions((prev) => [...prev, s]);
        setActiveId(s.id);
      } catch (err) {
        reportError('Failed to create session', err);
      }
      return;
    }

    const target = (sshTarget ?? '').trim();
    if (!target) {
      showNotice('Missing SSH target.');
      return;
    }
    const localDesiredCwd =
      activeProject?.basePath ?? homeDirRef?.current ?? '';
    const localValidatedCwd = await platform.fs.validateDirectory(localDesiredCwd).catch(() => null);
    if (localValidatedCwd) {
      await ensureAutoAssets(localValidatedCwd, activeProjectId);
    }

    const baseCommandLine =
      (active?.restoreCommand ?? active?.launchCommand ?? '').trim() || null;
    const launchCommand = buildSshCommandAtRemoteDir({
      baseCommandLine,
      target,
      remoteDir: desiredPath,
    });

    const activeWorkspaceView = getActiveWorkspaceView();
    try {
      const createdRaw = await createSession({
        projectId: activeProjectId,
        name: `ssh ${target}: ${shortenPathSmart(desiredPath, 48)}`,
        launchCommand,
        cwd: localValidatedCwd ?? localDesiredCwd ?? null,
        envVars,
        sshTarget: target,
        sshRootDir:
          (activeWorkspaceView?.fileExplorerRootDir ??
            activeWorkspaceView?.codeEditorRootDir ??
            active?.sshRootDir) ?? null,
      });
      const s = applyPendingExit(createdRaw);
      setSessions((prev) => [...prev, s]);
      setActiveId(s.id);
    } catch (err) {
      reportError('Failed to create SSH session', err);
    }
  },

  /* ---------------------------------------------------------------- */
  /*  Prompt sender                                                    */
  /* ---------------------------------------------------------------- */

  sendPromptToSession: async (sessionId, prompt, mode) => {
    const { reportError } = useUIStore.getState();
    if (mode === 'paste') {
      try {
        registryRef?.current.get(sessionId)?.term.focus();
        await platform.terminal.write(sessionId, prompt.content, 'user');
      } catch (err) {
        reportError('Failed to send prompt', err);
      }
      return;
    }
    const text = prompt.content.replace(/[\r\n]+$/, '');
    try {
      registryRef?.current.get(sessionId)?.term.focus();
      if (text) await platform.terminal.write(sessionId, text, 'user');
      if (text) await sleep(30);
      await platform.terminal.write(sessionId, '\r', 'user');
    } catch (err) {
      reportError('Failed to send prompt', err);
    }
  },

  sendPromptToActive: async (prompt, mode) => {
    const { activeId, sendPromptToSession } = get();
    if (!activeId) return;
    await sendPromptToSession(activeId, prompt, mode);
  },

  sendPromptFromCommandPalette: async (prompt, mode) => {
    const { activeProjectId, projects } = useProjectStore.getState();
    const activeProject =
      projects.find((p: MaestroProjectLike) => p.id === activeProjectId) ?? null;
    const { environments } = useEnvironmentStore.getState();
    const { ensureAutoAssets } = useAssetStore.getState();
    const { reportError } = useUIStore.getState();
    const { agentShortcutIds } = useAgentShortcutStore.getState();
    const {
      sessions,
      activeId,
      sendPromptToSession,
      sendPromptToActive,
      applyPendingExit,
      setSessions,
      setActiveId,
    } = get();

    const activeSession = activeId
      ? sessions.find((s) => s.id === activeId) ?? null
      : null;
    const defaultAgentId = agentShortcutIds[0] ?? null;
    const effect =
      getProcessEffectById(activeSession?.effectId) ??
      getProcessEffectById(defaultAgentId);

    if (!effect) {
      await sendPromptToActive(prompt, mode);
      return;
    }

    const cwd =
      activeSession?.cwd ??
      activeProject?.basePath ??
      homeDirRef?.current ??
      null;
    try {
      if (cwd) await ensureAutoAssets(cwd, activeProjectId);
      const createdRaw = await createSession({
        projectId: activeProjectId,
        name: prompt.title?.trim() ? prompt.title.trim() : effect.label,
        launchCommand: effect.matchCommands[0] ?? effect.label,
        cwd,
        envVars: envVarsForProjectId(activeProjectId, projects, environments),
      });
      const s = applyPendingExit(createdRaw);
      setSessions((prev) => [...prev, s]);
      setActiveId(s.id);
      await sleep(50);
      await sendPromptToSession(s.id, prompt, mode);
    } catch (err) {
      reportError('Failed to start new session for prompt', err);
    }
  },

  /* ---------------------------------------------------------------- */
  /*  Replay                                                           */
  /* ---------------------------------------------------------------- */

  sendNextReplayStep: async () => {
    const rec = useRecordingStore.getState();
    const { activeProjectId, projects, setActiveProjectId } =
      useProjectStore.getState();
    const { environments } = useEnvironmentStore.getState();
    const { reportError } = useUIStore.getState();
    const { sessions, activeId, applyPendingExit, setSessions, setActiveId } =
      get();
    const active = sessions.find((s) => s.id === activeId) ?? null;
    const activeProject =
      projects.find((p: MaestroProjectLike) => p.id === activeProjectId) ?? null;

    if (!rec.replaySteps.length) return;
    if (rec.replayIndex >= rec.replaySteps.length) return;

    // Ensure replay target session
    let targetId = rec.replayTargetSessionId;
    if (!targetId) {
      const recording = rec.replayRecording;
      const cwd =
        recording?.meta?.cwd ??
        active?.cwd ??
        activeProject?.basePath ??
        homeDirRef?.current ??
        null;
      const projectId =
        (recording?.meta?.projectId &&
          projects.some(
            (p: MaestroProjectLike) => p.id === recording.meta?.projectId,
          )
          ? recording.meta.projectId
          : null) ?? activeProjectId;
      const bootstrapCommand = (() => {
        const fromMeta = recording?.meta?.bootstrapCommand?.trim() ?? '';
        if (fromMeta) return fromMeta;
        const effect = getProcessEffectById(recording?.meta?.effectId ?? null);
        return effect?.matchCommands?.[0] ?? null;
      })();
      const name = recording?.meta?.name?.trim()
        ? `replay: ${recording.meta.name.trim()}`
        : bootstrapCommand
          ? `replay ${bootstrapCommand}`
          : 'replay';

      try {
        const createdRaw = await createSession({
          projectId,
          name,
          launchCommand: bootstrapCommand,
          cwd,
          envVars: envVarsForProjectId(projectId, projects, environments),
        });
        const created = applyPendingExit(createdRaw);
        setSessions((prev) => [...prev, created]);
        setActiveProjectId(projectId);
        setActiveId(created.id);
        rec.setReplayTargetSessionId(created.id);
        targetId = created.id;
      } catch (err) {
        reportError('Failed to create replay session', err);
        return;
      }
    }
    if (!targetId) return;

    const chunk = rec.replaySteps[rec.replayIndex];
    try {
      registryRef?.current.get(targetId)?.term.focus();
      const newlineMatch = chunk.match(/[\r\n]+$/);
      const trailing = newlineMatch?.[0] ?? '';
      const body = trailing ? chunk.slice(0, -trailing.length) : chunk;
      if (body) await platform.terminal.write(targetId, body, 'system');
      if (trailing) {
        if (body) await sleep(30);
        const enterCount = trailing.replace(/[^\r\n]/g, '').length;
        for (let i = 0; i < enterCount; i++) {
          await platform.terminal.write(targetId, '\r', 'system');
          if (i < enterCount - 1) await sleep(10);
        }
      }
      rec.setReplayIndex(rec.replayIndex + 1);
    } catch (err) {
      reportError('Failed to replay input', err);
    }
  },

  /* ---------------------------------------------------------------- */
  /*  Maestro sessions                                                 */
  /* ---------------------------------------------------------------- */

  handleJumpToSessionFromTask: (maestroSessionId) => {
    const { sessions, setActiveId } = get();
    const uiSession = sessions.find(
      (s) => s.maestroSessionId === maestroSessionId,
    );
    if (uiSession) setActiveId(uiSession.id);
  },

  handleAddTaskToSessionRequest: (_taskId) => {
    // TODO: implement session selection modal
  },

  handleSpawnTerminalSession: async (sessionInfo) => {
    // Use maestroSessionId for deduplication (unique per spawn)
    const dedupKey = sessionInfo.maestroSessionId;

    if (spawningSessionsRef.has(dedupKey)) {
      return;
    }

    spawningSessionsRef.add(dedupKey);

    try {
      // Build export prefix to inline env vars into the command string.
      // portable-pty's CommandBuilder::env() does not reliably pass env vars
      // to the child process on macOS, so we export them in the shell command.
      // On Windows, use `set` syntax instead of `export`, and use `&` instead of `;`.
      const isWindows = /Win/.test(navigator.platform);
      let command: string | undefined;
      if (sessionInfo.command) {
        if (isWindows) {
          // portable-pty's CommandBuilder::env() is unreliable, so inline env
          // vars using `set K=V&&` syntax for cmd.exe (analogous to `export` on Unix).
          // Use `&&` (not `&`) so cmd.exe chains them sequentially, and avoid
          // quoting around the set assignment to prevent quote-nesting issues.
          const envSets = Object.entries(sessionInfo.envVars || {})
            .filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
            .map(([k, v]) => `set ${k}=${v}`)
            .join('&& ');
          const envPrefix = envSets ? `${envSets}&& ` : '';
          command = `${envPrefix}${sessionInfo.command}`;
        } else {
          const envExports = Object.entries(sessionInfo.envVars || {})
            .filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
            .map(([k, v]) => `export ${k}=${JSON.stringify(v)}`)
            .join('; ');
          const envPrefix = envExports ? `${envExports}; ` : '';
          command = `${envPrefix}${sessionInfo.command}; exec $SHELL`;
        }
      }

      const info = await platform.terminal.createSession({
        name: sessionInfo.name,
        command: command ?? null,
        cwd: sessionInfo.cwd,
        envVars: sessionInfo.envVars,
        persistent: false,
        persistId: sessionInfo.maestroSessionId ?? '',
        maestroSessionId: sessionInfo.maestroSessionId,
      });

      const rawSession: TerminalSession = {
        ...info,
        projectId: sessionInfo.projectId,
        maestroSessionId: sessionInfo.maestroSessionId,
        persistId: '',
        persistent: false,
        createdAt: Date.now(),
        launchCommand: sessionInfo.command,
        sshTarget: null,
        sshRootDir: null,
        cwd: sessionInfo.cwd,
        agentWorking: false,
        exited: false,
      };

      // Apply any pending exit that arrived before invoke('create_session')
      // returned (race condition when the spawned process crashes immediately).
      const newSession = get().applyPendingExit(rawSession);

      set((s) => ({
        sessions: [...s.sessions, newSession],
        activeId: newSession.id,
      }));

      setTimeout(() => {
        spawningSessionsRef.delete(dedupKey);
      }, 2000);
    } catch (err) {
      spawningSessionsRef.delete(dedupKey);
      useUIStore.getState().reportError('Failed to spawn terminal session', err);
    }
  },

  /* ---------------------------------------------------------------- */
  /*  Ordering                                                         */
  /* ---------------------------------------------------------------- */

  reorderSessions: (draggedPersistId, targetPersistId) => {
    const { activeProjectId } = useProjectStore.getState();
    if (!activeProjectId) return;
    const { sessions, sessionOrderByProject } = get();

    const projectSessions = sessions.filter(
      (s) => s.projectId === activeProjectId,
    );
    const currentOrder = sessionOrderByProject[activeProjectId] ?? [];
    const projectSessionPersistIds = projectSessions.map((s) => s.persistId);

    let newOrder: string[];
    if (currentOrder.length === 0) {
      newOrder = [...projectSessionPersistIds];
    } else {
      const ordered = currentOrder.filter((id) =>
        projectSessionPersistIds.includes(id),
      );
      const missing = projectSessionPersistIds.filter(
        (id) => !currentOrder.includes(id),
      );
      newOrder = [...ordered, ...missing];
    }

    const draggedIndex = newOrder.indexOf(draggedPersistId);
    const targetIndex = newOrder.indexOf(targetPersistId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedPersistId);

    const next = { ...sessionOrderByProject, [activeProjectId]: newOrder };
    set({ sessionOrderByProject: next });
    try {
      localStorage.setItem(
        DEFAULTS.STORAGE_SESSION_ORDER_BY_PROJECT_KEY,
        JSON.stringify(next),
      );
    } catch {
      // best-effort
    }
  },
}));

// Internal type alias to avoid circular imports
type MaestroProjectLike = { id: string; basePath?: string | null; environmentId?: string | null; assetsEnabled?: boolean };
