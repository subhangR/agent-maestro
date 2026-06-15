import { MutableRefObject } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { homeDir } from '@tauri-apps/api/path';
import { TerminalSession, TerminalSessionInfo } from '../app/types/session';
import { MaestroProject } from '../app/types/maestro';
import {
  PtyOutput,
  PtyExit,
  AppMenuEventPayload,
  StartupFlags,
  TrayMenuEventPayload,
  PendingDataBuffer,
  PersistedStateV1,
  PersistedStateMetaV1,
} from '../app/types/app-state';
import { TerminalRegistry } from '../SessionTerminal';
import { coercePtyDataToString } from '../services/terminalService';
import { createSession, closeSession, detachSession } from '../services/sessionService';
import { maestroClient } from '../utils/MaestroClient';
import { envVarsForProjectId } from '../app/utils/env';
import {
  loadWorkspaceViewStorageV1,
  coerceCodeEditorPersistedState,
  coerceFileExplorerPersistedState,
  projectIdFromWorkspaceKey,
} from '../utils/workSpaceStorage';
import { formatError, cleanAgentShortcutIds } from '../utils/formatters';
import { detectProcessEffect, commandTagFromCommandLine } from '../processEffects';
import { WorkspaceView } from '../app/types/workspace';
import { makeId } from '../app/utils/id';
import { sleep } from '../utils/domUtils';
import * as DEFAULTS from '../app/constants/defaults';
import { useSessionStore, pendingExitCodes, closingSessions, agentIdleTimersRef, lastResizeAtRef } from './useSessionStore';
import { useProjectStore, lastActiveByProject } from './useProjectStore';
import { useUIStore } from './useUIStore';
import { usePromptStore } from './usePromptStore';
import { useEnvironmentStore } from './useEnvironmentStore';
import { useAssetStore } from './useAssetStore';
import { useAgentShortcutStore } from './useAgentShortcutStore';
import { useWorkspaceStore } from './useWorkspaceStore';
import { useSecureStorageStore } from './useSecureStorageStore';
import { useMaestroStore } from './useMaestroStore';
import { IS_TAURI } from '../platform';

/**
 * Initialise the application. Replaces the old useAppInit hook.
 *
 * Sets up Tauri event listeners, loads persisted state from disk,
 * syncs projects with the maestro server, and restores terminal sessions.
 *
 * @returns A cleanup function that tears down listeners, timers, and sessions.
 */
export function initApp(
  registry: MutableRefObject<TerminalRegistry>,
  pendingData: MutableRefObject<PendingDataBuffer>,
): () => void {
  let cancelled = false;
  const unlisteners: Array<() => void> = [];

  // Store references – ESM imports are safe here because all cross-store
  // accesses happen inside functions (deferred until runtime).
  const stores = () => ({
    session: useSessionStore,
    project: useProjectStore,
    ui: useUIStore,
    prompt: usePromptStore,
    environment: useEnvironmentStore,
    asset: useAssetStore,
    agentShortcut: useAgentShortcutStore,
    workspace: useWorkspaceStore,
    secureStorage: useSecureStorageStore,
  });

  // Pending tray action state (module level, since it was a useState before)
  let pendingTrayAction: TrayMenuEventPayload | null = null;

  const isTerminalRendererReady = (term: unknown): boolean => {
    try {
      const anyTerm = term as any;
      const core = anyTerm?._core;
      const renderService = core?._renderService;
      const rendererRef = renderService?._renderer;
      const renderer = rendererRef?.value ?? rendererRef?._value ?? null;
      return Boolean(renderer && renderer.dimensions);
    } catch {
      return false;
    }
  };

  const setup = async () => {
    const s = stores();

    // ──── MAESTRO WEBSOCKET ────
    // Initialize WebSocket connection to maestro-server for real-time updates
    useMaestroStore.getState().initWebSocket();

    // ──── PTY OUTPUT LISTENER ────
    if (IS_TAURI) {
      const unlistenOutput = await listen<PtyOutput>('pty-output', (event) => {
        if (cancelled) return;
        const { id, data } = event.payload as { id: string; data?: unknown };
        const text = coercePtyDataToString(data);
        if (!text) return;

        const sessionStore = s.session.getState();
        if (closingSessions.has(id)) return;

        sessionStore.markAgentWorkingFromOutput(id, text);

        const entry = registry.current.get(id);
        if (entry && isTerminalRendererReady(entry.term)) {
          entry.term.write(text);
          return;
        }

        // Buffer the data
        if (
          !pendingData.current.has(id) &&
          pendingData.current.size >= DEFAULTS.MAX_PENDING_SESSIONS
        ) {
          const oldest = pendingData.current.keys().next().value as string | undefined;
          if (oldest) pendingData.current.delete(oldest);
        }
        const buffer = pendingData.current.get(id) || [];
        buffer.push(text);
        if (buffer.length > DEFAULTS.MAX_PENDING_CHUNKS_PER_SESSION) {
          buffer.splice(0, buffer.length - DEFAULTS.MAX_PENDING_CHUNKS_PER_SESSION);
        }
        pendingData.current.delete(id);
        pendingData.current.set(id, buffer);
      });
      unlisteners.push(unlistenOutput);
    }

    // ──── PTY EXIT LISTENER ────
    if (IS_TAURI) {
      const unlistenExit = await listen<PtyExit>('pty-exit', (event) => {
        if (cancelled) return;
        const { id, exit_code } = event.payload;

        const sessionStore = s.session.getState();
        sessionStore.clearAgentIdleTimer(id);
        lastResizeAtRef.delete(id);

        // Consume closing session (if it was being closed, just clean up the timeout)
        if (closingSessions.has(id)) {
          const timeout = closingSessions.get(id);
          if (timeout != null) window.clearTimeout(timeout);
          closingSessions.delete(id);
          return;
        }

        const { sessions } = sessionStore;
        const exitingSession = sessions.find((sess) => sess.id === id);

        sessionStore.setSessions((prev: TerminalSession[]) => {
          let found = false;
          const next = prev.map((sess) => {
            if (sess.id !== id) return sess;
            found = true;
            return {
              ...sess,
              exited: true,
              exitCode: exit_code ?? null,
              agentWorking: false,
              recordingActive: false,
            };
          });
          if (!found) pendingExitCodes.set(id, exit_code ?? null);
          return next;
        });

        // Sync terminal exit to Maestro server
        // Always send 'stopped' — the CLI's SessionEnd hook handles 'completed'.
        // The pty-exit is only a fallback for abnormal exits.
        if (exitingSession?.maestroSessionId) {
          void maestroClient.updateSession(exitingSession.maestroSessionId, {
            status: 'stopped',
            completedAt: Date.now(),
          }).catch(() => {});
        }
      });
      unlisteners.push(unlistenExit);
    }

    // ──── APP MENU LISTENER ────
    if (IS_TAURI) {
      const unlistenMenu = await listen<AppMenuEventPayload>('app-menu', (event) => {
        if (cancelled) return;
        if (event.payload.id === 'help-check-updates') {
          s.ui.getState().setUpdatesOpen(true);
          void s.ui.getState().checkForUpdates();
        }
      });
      unlisteners.push(unlistenMenu);
    }

    // ──── TRAY MENU LISTENER ────
    if (IS_TAURI) {
      const unlistenTray = await listen<TrayMenuEventPayload>('tray-menu', (event) => {
        if (cancelled) return;
        pendingTrayAction = event.payload;
      });
      unlisteners.push(unlistenTray);
    }

    if (cancelled) {
      unlisteners.forEach((fn) => fn());
      return;
    }

    // ──── HOME DIRECTORY ────
    let resolvedHome: string | null = null;
    if (IS_TAURI) {
      try {
        resolvedHome = await homeDir();
      } catch {
        resolvedHome = null;
      }
    }
    s.ui.getState().setHomeDir(resolvedHome);

    // ──── STARTUP FLAGS ────
    const startupFlags = IS_TAURI
      ? await invoke<StartupFlags>('get_startup_flags').catch(() => null)
      : null;
    if (startupFlags?.clearData) {
      try {
        localStorage.removeItem(DEFAULTS.STORAGE_PROJECTS_KEY);
        localStorage.removeItem(DEFAULTS.STORAGE_ACTIVE_PROJECT_KEY);
        localStorage.removeItem(DEFAULTS.STORAGE_SESSIONS_KEY);
        localStorage.removeItem(DEFAULTS.STORAGE_ACTIVE_SESSION_BY_PROJECT_KEY);
        localStorage.removeItem(DEFAULTS.STORAGE_WORKSPACE_VIEW_BY_KEY);
      } catch {
        // Best-effort
      }
      s.ui.getState().showNotice('Cleared saved app data for a fresh start.', 8000);
    }

    // ──── SECURE STORAGE ────
    const stateMeta = IS_TAURI
      ? await invoke<PersistedStateMetaV1 | null>('load_persisted_state_meta').catch(() => null)
      : null;
    const metaMode = stateMeta?.secureStorageMode ?? null;
    const needsSecureStorage = Boolean(
      stateMeta &&
        stateMeta.schemaVersion === 1 &&
        metaMode === 'keychain' &&
        stateMeta.encryptedEnvironmentCount > 0,
    );
    if (needsSecureStorage) {
      s.ui
        .getState()
        .showNotice(
          'macOS Keychain access is needed to decrypt/encrypt your environments + recordings. You may see 1\u20132 prompts (first run can create the encryption key). Choose \u201CAlways Allow\u201D to avoid future prompts.',
          60000,
        );
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      try {
        await invoke('prepare_secure_storage');
        s.ui
          .getState()
          .showNotice(
            'Secure storage enabled: environments + recording inputs are encrypted at rest (key stored in macOS Keychain).',
            20000,
          );
      } catch (err) {
        if (!cancelled) {
          s.secureStorage
            .getState()
            .setPersistenceDisabledReason(
              `Secure storage is locked (changes won't be saved): ${formatError(err)}`,
            );
        }
      }
    }

    // ──── LOAD PERSISTED STATE ────
    let diskState: PersistedStateV1 | null = null;
    if (IS_TAURI) {
      try {
        diskState = await invoke<PersistedStateV1 | null>('load_persisted_state');
      } catch (err) {
        const msg = formatError(err);
        if (!cancelled) {
          s.secureStorage
            .getState()
            .setPersistenceDisabledReason(
              `Failed to load saved state (changes won't be saved until restart): ${msg}`,
            );
        }
        diskState = null;
      }
    } else {
      // Browser/web mode: persistence.ts saves to localStorage (not the Tauri
      // native store), so restore from there. Without this, closedProjectIds is
      // lost on reload and every server project re-opens as a tab.
      try {
        const raw = localStorage.getItem(DEFAULTS.STORAGE_PERSISTED_STATE_KEY);
        diskState = raw ? (JSON.parse(raw) as PersistedStateV1) : null;
      } catch {
        diskState = null;
      }
    }

    let state: PersistedStateV1 | null = diskState;

    if (!state) {
      state = {
        schemaVersion: 1,
        projects: [],
        activeProjectId: '',
        sessions: [],
        activeSessionByProject: {},
      };
    }

    if (cancelled) return;

    // Map loaded projects from Rust format (title) to app format (name)
    state.projects = state.projects.map((p) => {
      const rustProject = p as any;
      return {
        id: p.id,
        name: rustProject.title || rustProject.name || 'Untitled Project', // Map 'title' back to 'name'
        workingDir: rustProject.workingDir || rustProject.basePath || '',
        createdAt: rustProject.createdAt || Date.now(),
        updatedAt: rustProject.updatedAt || Date.now(),
        basePath: p.basePath ?? null,
        environmentId: (p as { environmentId?: string | null }).environmentId ?? null,
        assetsEnabled: (p as { assetsEnabled?: boolean }).assetsEnabled ?? true,
        soundInstrument: (p as { soundInstrument?: string }).soundInstrument ?? 'piano',
        soundConfig: (p as { soundConfig?: any }).soundConfig ?? undefined,
      };
    });

    // Migrate legacy soundInstrument to soundConfig
    state.projects = state.projects.map((p: any) => {
      if (p.soundInstrument && !p.soundConfig) {
        return {
          ...p,
          soundConfig: {
            instrument: p.soundInstrument,
          },
        };
      }
      return p;
    });

    const projectById = new Map(state.projects.map((p) => [p.id, p]));

    const activeProjectId = projectById.size === 0
      ? ''
      : projectById.has(state.activeProjectId)
        ? state.activeProjectId
        : state.projects[0].id;

    const activeSessionByProject = Object.fromEntries(
      Object.entries(state.activeSessionByProject).filter(([projectId]) =>
        projectById.has(projectId),
      ),
    );

    // ──── SYNC PROJECTS WITH MAESTRO SERVER ────
    // Load closed project IDs from persisted state so we don't re-open them on restart
    const closedProjectIds = new Set<string>(
      (state as { closedProjectIds?: string[] }).closedProjectIds ?? [],
    );

    try {
      const serverProjects = await maestroClient.getProjects();
      const serverProjectsById = new Map(serverProjects.map((p) => [p.id, p]));
      const localProjectsById = new Map(state.projects.map((p) => [p.id, p]));

      const mergedProjects: MaestroProject[] = [];

      for (const serverProj of serverProjects) {
        // Skip projects that were explicitly closed by the user
        if (closedProjectIds.has(serverProj.id)) continue;

        const localProj = localProjectsById.get(serverProj.id);
        mergedProjects.push({
          id: serverProj.id,
          name: serverProj.name,
          workingDir: serverProj.workingDir,
          createdAt: serverProj.createdAt,
          updatedAt: serverProj.updatedAt,
          basePath: serverProj.workingDir || null,
          environmentId: localProj?.environmentId ?? null,
          assetsEnabled: localProj?.assetsEnabled ?? true,
          soundInstrument: localProj?.soundInstrument ?? 'piano',
          soundConfig: localProj?.soundConfig,
        });
      }

      for (const localProj of state.projects) {
        if (!serverProjectsById.has(localProj.id)) {
          try {
            const created = await maestroClient.createProject({
              name: localProj.name,
              workingDir: localProj.workingDir,
              createdAt: localProj.createdAt,
              updatedAt: localProj.updatedAt,
              description: '',
            });
            mergedProjects.push({
              id: created.id,
              name: created.name,
              workingDir: created.workingDir,
              createdAt: created.createdAt,
              updatedAt: created.updatedAt,
              environmentId: localProj.environmentId,
              assetsEnabled: localProj.assetsEnabled ?? true,
              soundInstrument: localProj.soundInstrument ?? 'piano',
              soundConfig: localProj.soundConfig,
            });
          } catch {
            mergedProjects.push(localProj);
          }
        }
      }

      if (mergedProjects.length > 0) {
        state.projects = mergedProjects;
      }
    } catch {
    }

    // ──── SET STORE STATE ────
    s.project.getState().setProjects(state.projects);
    s.project.getState().setActiveProjectId(activeProjectId);
    s.project.getState().setActiveSessionByProject(activeSessionByProject);
    s.project.getState().setClosedProjectIds(Array.from(closedProjectIds));

    // ──── WORKSPACE VIEW RESTORATION ────
    const workspaceStorage = loadWorkspaceViewStorageV1();
    if (workspaceStorage?.schemaVersion === 1) {
      const validProjectIds = new Set(state.projects.map((p) => p.id));
      const nextWorkspaceViews: Record<string, WorkspaceView> = {};
      for (const [workspaceKey, stored] of Object.entries(workspaceStorage.views)) {
        const projectId = projectIdFromWorkspaceKey(workspaceKey) ?? stored.projectId;
        if (!projectId || !validProjectIds.has(projectId)) continue;

        const base = s.workspace.getState().createInitialWorkspaceView(projectId);
        const fileExplorerRootDir = stored.fileExplorerRootDir ?? base.fileExplorerRootDir;
        const codeEditorRootDir = stored.codeEditorRootDir ?? base.codeEditorRootDir;
        const rootOverride = fileExplorerRootDir ?? codeEditorRootDir ?? null;

        const codeEditorPersistedState = coerceCodeEditorPersistedState(
          stored.codeEditorPersistedState,
        );
        const codeEditorActiveFilePath =
          stored.codeEditorActiveFilePath ??
          codeEditorPersistedState?.activePath ??
          base.codeEditorActiveFilePath;

        nextWorkspaceViews[workspaceKey] = {
          ...base,
          projectId,
          fileExplorerOpen:
            typeof stored.fileExplorerOpen === 'boolean'
              ? stored.fileExplorerOpen
              : base.fileExplorerOpen,
          fileExplorerRootDir,
          fileExplorerPersistedState: coerceFileExplorerPersistedState(
            stored.fileExplorerPersistedState,
            rootOverride,
          ),
          codeEditorOpen:
            typeof stored.codeEditorOpen === 'boolean'
              ? stored.codeEditorOpen
              : base.codeEditorOpen,
          codeEditorRootDir,
          codeEditorActiveFilePath,
          codeEditorPersistedState,
          openFileRequest: null,
          codeEditorFsEvent: null,
        };
      }
      s.workspace.getState().setWorkspaceViewByKey(nextWorkspaceViews);
    }

    // ──── SECURE STORAGE MODE ────
    const loadedSecureStorageMode =
      ((state as { secureStorageMode?: string | null }).secureStorageMode ?? metaMode) as import('../app/types/app-state').SecureStorageMode | null;
    s.secureStorage.getState().setSecureStorageMode(loadedSecureStorageMode ?? null);

    // ──── PROMPTS ────
    s.prompt.getState().setPrompts(state.prompts ?? []);

    // ──── ENVIRONMENTS ────
    s.environment.getState().setEnvironments(state.environments ?? []);
    const encryptedEnvCount = (state.environments ?? []).filter((e: any) =>
      (e.content ?? '').trimStart().startsWith('enc:v1:'),
    ).length;
    if (encryptedEnvCount > 0) {
      if (loadedSecureStorageMode === 'keychain') {
        s.ui
          .getState()
          .showNotice(
            `Some environments could not be decrypted (${encryptedEnvCount}). Check macOS Keychain access.`,
            9000,
          );
      } else {
        s.ui
          .getState()
          .showNotice(
            `Some environments are encrypted (${encryptedEnvCount}). Enable macOS Keychain encryption to unlock them.`,
            12000,
          );
      }
    }

    // ──── ASSET SETTINGS ────
    s.asset.getState().setAssetSettings(state.assetSettings ?? { autoApplyEnabled: true });

    // ──── AGENT SHORTCUTS ────
    s.agentShortcut.getState().setAgentShortcutIds(() => {
      const loaded = state!.agentShortcutIds ?? null;
      if (!loaded) return cleanAgentShortcutIds(DEFAULTS.DEFAULT_AGENT_SHORTCUT_IDS);
      const cleaned = cleanAgentShortcutIds(loaded);
      if (loaded.length > 0 && cleaned.length === 0) {
        return cleanAgentShortcutIds(DEFAULTS.DEFAULT_AGENT_SHORTCUT_IDS);
      }
      return cleanAgentShortcutIds([...cleaned, 'hermes', 'gemini']);
    });

    // ──── ASSETS ────
    s.asset.getState().setAssets(() => {
      const loaded = (state!.assets ?? [])
        .map((a: any) => ({
          ...a,
          name: a.name?.trim?.() ? a.name.trim() : a.name,
          relativePath: a.relativePath?.trim?.() ? a.relativePath.trim() : a.relativePath,
          autoApply: a.autoApply ?? true,
        }))
        .filter((a: any) => a && a.id && a.relativePath && a.name);
      if (loaded.length) return loaded;
      return [
        {
          id: makeId(),
          name: 'AGENTS.md',
          relativePath: 'AGENTS.md',
          content:
            '# AGENTS.md\n\n<INSTRUCTIONS>\n- Add project-specific agent instructions here.\n</INSTRUCTIONS>\n',
          createdAt: Date.now(),
          autoApply: true,
        },
      ];
    });

    // ──── BROWSER EARLY-RETURN ────
    // In browser mode there are no native PTY sessions; entity sync runs over REST+WS.
    if (!IS_TAURI) {
      s.session.getState().setSessions([]);
      s.session.getState().setActiveId(null);
      s.session.getState().setHydrated(true);
      const updateCheckTimeout = window.setTimeout(() => {
        void s.ui.getState().checkForUpdates();
      }, 5000);
      unlisteners.push(() => window.clearTimeout(updateCheckTimeout));
      const updateCheckInterval = window.setInterval(() => {
        void s.ui.getState().checkForUpdates();
      }, 30 * 60 * 1000);
      unlisteners.push(() => window.clearInterval(updateCheckInterval));

      // ──── BROWSER REATTACH ────
      // Server-hosted PTYs outlive any single tab: closing a /pty WebSocket only
      // detaches a subscriber, it never kills the process. On a fresh browser
      // load the terminal store starts empty, so nothing reconnects to sessions
      // that are still running on the server (reload / new device). Re-open a
      // /pty socket for each live server session — handleSpawnTerminalSession in
      // web mode just opens the socket keyed by maestroSessionId (the server
      // replays its scrollback ring); it does NOT spawn a new process, so this is
      // a pure reattach. Dead/gone sessions self-correct: the server closes the
      // socket with 1011 and the adapter marks them exited.
      void (async () => {
        try {
          await useMaestroStore.getState().fetchSessions();
          if (cancelled) return;
          const ALIVE = new Set(['spawning', 'idle', 'working']);
          // Reattach EVERY live session, not just the active project's: the
          // browser can host PTYs across projects and the user may switch to any
          // of them. Filtering by active project silently drops live terminals,
          // so clicking the session later falls through to the stats view.
          const liveSessions = Object.values(useMaestroStore.getState().sessions)
            .filter((ms) => Boolean(ms?.id) && ALIVE.has(ms.status));
          for (const ms of liveSessions) {
            if (cancelled) return;
            // In web mode the local terminal id === maestroSessionId, so this
            // both opens the /pty socket and links the session in the sidebar.
            await useSessionStore.getState().handleSpawnTerminalSession({
              maestroSessionId: ms.id,
              name: ms.name || '',
              command: null,
              args: [],
              cwd: '',
              envVars: {},
              projectId: ms.projectId || '',
            });
          }
          // Open a live terminal instead of the empty hero / a stale stats view.
          // Switch the active project to match, or the project-filtered sidebar
          // wouldn't surface the session whose terminal we just focused.
          const focus = liveSessions[0];
          if (focus && !cancelled) {
            if (focus.projectId) useProjectStore.getState().setActiveProjectId(focus.projectId);
            useSessionStore.getState().setActiveId(focus.id);
          }
        } catch {
          // best-effort reattach; live session:spawn events still populate tabs
        }
      })();

      return;
    }

    // ──── RESTORE SESSIONS ────
    const envVarsForProject = (projectId: string): Record<string, string> | null => {
      return envVarsForProjectId(projectId, state!.projects, state!.environments ?? []);
    };

    // Before restoring sessions, discover alive backend PTYs
    let aliveBackendSessions = new Map<string, TerminalSessionInfo>();
    try {
      const backendSessions = await invoke<TerminalSessionInfo[]>('list_sessions');
      for (const bs of backendSessions) {
        aliveBackendSessions.set(bs.id, bs);
      }
    } catch {
      // Backend may not support list_sessions — fall through to create new sessions
    }

    const persisted = state.sessions
      .filter((sess) => projectById.has(sess.projectId))
      .sort((a, b) => a.createdAt - b.createdAt);

    const restored: TerminalSession[] = [];
    for (const sess of persisted) {
      if (cancelled) break;
      try {
        const aliveBackend = sess.backendSessionId
          ? aliveBackendSessions.get(sess.backendSessionId)
          : null;

        let created: TerminalSession;
        if (aliveBackend) {
          // RECONNECT to existing PTY — don't create a new one
          const effect = detectProcessEffect({
            command: sess.launchCommand,
            name: sess.name,
          });
          created = {
            id: aliveBackend.id,
            name: sess.name,
            command: aliveBackend.command,
            projectId: sess.projectId,
            persistId: sess.persistId,
            persistent: sess.persistent ?? false,
            createdAt: sess.createdAt,
            launchCommand: sess.launchCommand,
            restoreCommand: sess.restoreCommand ?? null,
            sshTarget: sess.sshTarget ?? null,
            sshRootDir: sess.sshRootDir ?? null,
            lastRecordingId: sess.lastRecordingId ?? null,
            cwd: aliveBackend.cwd ?? sess.cwd,
            effectId: effect?.id ?? null,
            processTag: sess.launchCommand ? commandTagFromCommandLine(sess.launchCommand) : null,
            maestroSessionId: sess.maestroSessionId ?? null,
          };
          // Remove from alive map so we can detect truly orphaned PTYs later
          aliveBackendSessions.delete(aliveBackend.id);
        } else {
          // PTY is dead — create a new one
          created = await createSession({
            projectId: sess.projectId,
            name: sess.name,
            launchCommand: sess.launchCommand,
            restoreCommand: sess.restoreCommand ?? null,
            sshTarget: sess.sshTarget ?? null,
            sshRootDir: sess.sshRootDir ?? null,
            lastRecordingId: sess.lastRecordingId ?? null,
            cwd: sess.cwd ?? projectById.get(sess.projectId)?.basePath ?? resolvedHome ?? null,
            envVars: envVarsForProject(sess.projectId),
            persistent: sess.persistent ?? false,
            persistId: sess.persistId,
            createdAt: sess.createdAt,
          });
        }

        const applied = s.session.getState().applyPendingExit(created);
        // Restore maestroSessionId from persisted state
        if (sess.maestroSessionId) {
          applied.maestroSessionId = sess.maestroSessionId;
        }
        restored.push(applied);

        // Only run restore command for NEW sessions (not reconnected ones)
        if (!aliveBackend) {
          const restoreCmd =
            (sess.persistent
              ? null
              : sess.launchCommand
                ? null
                : (sess.restoreCommand ?? null)?.trim()) ?? null;
          if (restoreCmd) {
            const singleLine = restoreCmd.replace(/\r?\n/g, ' ');
            void (async () => {
              try {
                if (singleLine) {
                  await invoke('write_to_session', {
                    id: applied.id,
                    data: singleLine,
                    source: 'system',
                  });
                  await sleep(30);
                }
                await invoke('write_to_session', {
                  id: applied.id,
                  data: '\r',
                  source: 'system',
                });
              } catch {
                // Best-effort restore
              }
            })();
          }
        }
      } catch (err) {
        if (!cancelled) s.ui.getState().reportError('Failed to restore session', err);
      }
    }

    // Clean up orphaned backend sessions (alive but not in persisted state)
    for (const [orphanedId] of aliveBackendSessions) {
      void closeSession(orphanedId).catch(() => {});
    }

    // ──── RECONCILE WITH MAESTRO SERVER ────
    // Mark server sessions as stopped if we don't have a local terminal for them
    // (they were orphaned by a crash/restart)
    const getLocalMaestroIds = (): Set<string> => {
      const { sessions } = s.session.getState();
      return new Set(
        sessions
          .filter((rs): rs is typeof rs & { maestroSessionId: string } => Boolean(rs.maestroSessionId) && !rs.exited)
          .map((rs) => rs.maestroSessionId),
      );
    };

    const cleanupOrphanedSessions = async () => {
      try {
        const serverSessions = await maestroClient.getSessions();
        const localIds = getLocalMaestroIds();
        for (const serverSession of serverSessions) {
          if (
            ['spawning', 'idle', 'working'].includes(serverSession.status) &&
            !localIds.has(serverSession.id)
          ) {
            // Skip recently-spawning sessions to avoid racing with resume flow.
            // A session in 'spawning' with recent activity is likely being resumed
            // and its PTY hasn't been created yet.
            if (
              serverSession.status === 'spawning' &&
              serverSession.lastActivity &&
              Date.now() - serverSession.lastActivity < 60_000
            ) {
              continue;
            }
            void maestroClient.updateSession(serverSession.id, {
              status: 'stopped',
              completedAt: Date.now(),
            }).catch(() => {});
          }
        }
      } catch {
        // Server might not be running — best effort
      }
    };

    // Run initial cleanup
    await cleanupOrphanedSessions();

    // Run periodic cleanup every 30 seconds
    const orphanCleanupInterval = window.setInterval(() => {
      void cleanupOrphanedSessions();
    }, 30_000);
    unlisteners.push(() => window.clearInterval(orphanCleanupInterval));

    if (cancelled) {
      await Promise.all(restored.map((sess) => closeSession(sess.id).catch(() => {})));
      return;
    }

    if (restored.length === 0) {
      if (!activeProjectId) {
        // No projects — empty state
        s.session.getState().setSessions([]);
        s.session.getState().setActiveId(null);
        s.session.getState().setHydrated(true);
        return;
      }
      let first: TerminalSession;
      try {
        const basePath =
          projectById.get(activeProjectId)?.basePath ?? resolvedHome ?? null;
        const createdRaw = await createSession({
          projectId: activeProjectId,
          cwd: basePath,
          envVars: envVarsForProject(activeProjectId),
        });
        first = s.session.getState().applyPendingExit(createdRaw);
      } catch (err) {
        if (!cancelled) s.ui.getState().reportError('Failed to create session', err);
        s.session.getState().setSessions([]);
        s.session.getState().setActiveId(null);
        s.session.getState().setHydrated(true);
        return;
      }
      if (cancelled) {
        await closeSession(first.id).catch(() => {});
        return;
      }
      s.session.getState().setSessions([first]);
      s.session.getState().setActiveId(first.id);
      s.session.getState().setHydrated(true);
      return;
    }

    // Populate lastActiveByProject
    for (const p of state.projects) {
      const desired = activeSessionByProject[p.id];
      const session =
        (desired
          ? restored.find((sess) => sess.projectId === p.id && sess.persistId === desired)
          : null) ??
        restored.find((sess) => sess.projectId === p.id) ??
        null;
      if (session) lastActiveByProject.set(p.id, session.id);
    }

    s.session.getState().setSessions(restored);
    const desired = activeSessionByProject[activeProjectId];
    const active =
      (desired
        ? restored.find(
            (sess) =>
              sess.projectId === activeProjectId && sess.persistId === desired,
          )
        : null) ??
      restored.find((sess) => sess.projectId === activeProjectId) ??
      null;
    s.session.getState().setActiveId(active ? active.id : null);
    s.session.getState().setHydrated(true);

    // ──── PERIODIC UPDATE CHECK ────
    // Initial check after a short delay so it doesn't block boot
    const updateCheckTimeout = window.setTimeout(() => {
      void s.ui.getState().checkForUpdates();
    }, 5000);
    unlisteners.push(() => window.clearTimeout(updateCheckTimeout));

    // Repeat every 30 minutes
    const updateCheckInterval = window.setInterval(() => {
      void s.ui.getState().checkForUpdates();
    }, 30 * 60 * 1000);
    unlisteners.push(() => window.clearInterval(updateCheckInterval));
  };

  void setup().catch((err) => {
    if (cancelled) return;
    const s = stores();
    s.ui.getState().reportError('Startup failed', err);
    s.session.getState().setHydrated(true);
  });

  // Return cleanup function
  return () => {
    cancelled = true;
    unlisteners.forEach((fn) => fn());

    // Clean up Maestro WebSocket
    useMaestroStore.getState().destroyWebSocket();

    const s = stores();
    const sessionStore = s.session.getState();

    // Clean up timers
    for (const [, timeout] of closingSessions) window.clearTimeout(timeout);
    closingSessions.clear();
    for (const [, timeout] of agentIdleTimersRef) window.clearTimeout(timeout);
    agentIdleTimersRef.clear();
    lastResizeAtRef.clear();
    pendingExitCodes.clear();

    // Only close/detach sessions on true app shutdown, NOT during HMR
    const isHmr = import.meta.hot != null;
    if (!isHmr && IS_TAURI) {
      const { sessions } = sessionStore;
      for (const sess of sessions) {
        // Mark active maestro sessions as stopped before closing PTY
        if (sess.maestroSessionId && !sess.exited) {
          void maestroClient.updateSession(sess.maestroSessionId, {
            status: 'stopped',
            completedAt: Date.now(),
          }).catch(() => {});
        }
        if (sess.persistent && !sess.exited) void detachSession(sess.id).catch(() => {});
        else void closeSession(sess.id).catch(() => {});
      }
    }
  };
}
