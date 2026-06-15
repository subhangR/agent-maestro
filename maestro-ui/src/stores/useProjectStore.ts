import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { IS_TAURI } from '../platform/detect';
import { MaestroProject } from '../app/types/maestro';
import { EnvironmentConfig } from '../app/types/app';
import { defaultProjectState, envVarsForProjectId } from '../app/utils/env';
import { maestroClient } from '../utils/MaestroClient';
import { createSession } from '../services/sessionService';
import { useSessionStore } from './useSessionStore';
import { useUIStore } from './useUIStore';
import { useEnvironmentStore } from './useEnvironmentStore';
import { useAssetStore } from './useAssetStore';
import { useProjectDialogStore } from './useProjectDialogStore';
import { DEFAULT_SOUND_INSTRUMENT } from '../app/constants/defaults';

// Module-level ref (not reactive state)
export const lastActiveByProject = new Map<string, string>();

interface ProjectState {
  projects: MaestroProject[];
  activeProjectId: string;
  activeSessionByProject: Record<string, string>;
  closedProjectIds: string[];
  setProjects: (projects: MaestroProject[] | ((prev: MaestroProject[]) => MaestroProject[])) => void;
  setActiveProjectId: (id: string) => void;
  setActiveSessionByProject: (
    v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  setClosedProjectIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  selectProject: (projectId: string) => void;
  moveProject: (projectId: string, targetProjectId: string, position: 'before' | 'after') => void;
  openNewProject: () => void;
  openProjectSettings: (projectId: string) => void;
  openRenameProject: () => void;
  onProjectSubmit: (e: React.FormEvent) => Promise<void>;
  checkAndDeleteProject: (projectId: string) => Promise<void>;
  deleteActiveProject: () => Promise<void>;
  closeProject: (projectId: string) => Promise<void>;
  fetchSavedProjects: () => Promise<MaestroProject[]>;
  reopenProject: (projectId: string) => Promise<void>;
  toggleMasterProject: (projectId: string) => Promise<void>;
}

/**
 * Module-level helper that reads from useSessionStore.getState() to find
 * the best active session for a given project.
 */
function pickActiveSessionId(projectId: string): string | null {
  const { sessions } = useSessionStore.getState();
  const last = lastActiveByProject.get(projectId);
  if (last && sessions.some((s) => s.id === last)) {
    return last;
  }
  const first = sessions.find((s) => s.projectId === projectId);
  return first ? first.id : null;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const initial = defaultProjectState();
  return {
    projects: initial.projects,
    activeProjectId: initial.activeProjectId,
    activeSessionByProject: {},
    closedProjectIds: [],

    setProjects: (projects) =>
      set((s) => ({
        projects: typeof projects === 'function' ? projects(s.projects) : projects,
      })),
    setActiveProjectId: (id) => set({ activeProjectId: id }),
    setActiveSessionByProject: (v) =>
      set((s) => ({
        activeSessionByProject: typeof v === 'function' ? v(s.activeSessionByProject) : v,
      })),
    setClosedProjectIds: (ids) =>
      set((s) => ({
        closedProjectIds: typeof ids === 'function' ? ids(s.closedProjectIds) : ids,
      })),

    selectProject: (projectId) => {
      set({ activeProjectId: projectId });
      useSessionStore.getState().setActiveId(pickActiveSessionId(projectId));
    },

    moveProject: (projectId, targetProjectId, position) =>
      set((state) => {
        if (projectId === targetProjectId) return state;
        const project = state.projects.find((p) => p.id === projectId);
        if (!project) return state;
        const next = state.projects.filter((p) => p.id !== projectId);
        const targetIndex = next.findIndex((p) => p.id === targetProjectId);
        if (targetIndex < 0) return state;
        const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
        next.splice(insertIndex, 0, project);
        const unchanged =
          state.projects.length === next.length &&
          state.projects.every((p, i) => p.id === next[i]?.id);
        return unchanged ? state : { projects: next };
      }),

    openNewProject: () => {
      useSessionStore.getState().setNewOpen(false);
      const homeDir = useUIStore.getState().homeDir;
      const dlg = useProjectDialogStore.getState();
      dlg.setProjectMode('new');
      dlg.setProjectTitle('');
      dlg.setProjectBasePath(homeDir ?? '');
      dlg.setProjectEnvironmentId('');
      dlg.setProjectAssetsEnabled(true);
      dlg.setProjectSoundInstrument(DEFAULT_SOUND_INSTRUMENT);
      dlg.setProjectSoundConfig(undefined);
      dlg.setProjectOpen(true);
    },

    openProjectSettings: (projectId) => {
      const { projects } = get();
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      useSessionStore.getState().setNewOpen(false);
      const dlg = useProjectDialogStore.getState();
      dlg.setProjectMode('rename');
      dlg.setProjectTitle(project.name);
      dlg.setProjectBasePath(project.basePath ?? '');
      dlg.setProjectEnvironmentId(project.environmentId ?? '');
      dlg.setProjectAssetsEnabled(project.assetsEnabled ?? true);
      dlg.setProjectSoundInstrument(project.soundConfig?.instrument ?? project.soundInstrument ?? DEFAULT_SOUND_INSTRUMENT);
      dlg.setProjectSoundConfig(project.soundConfig);
      dlg.setProjectOpen(true);
    },

    openRenameProject: () => {
      get().openProjectSettings(get().activeProjectId);
    },

    onProjectSubmit: async (e) => {
      e.preventDefault();
      const { activeProjectId, projects } = get();
      const dlg = useProjectDialogStore.getState();
      const {
        projectTitle,
        projectBasePath,
        projectMode,
        projectEnvironmentId,
        projectAssetsEnabled,
        projectSoundInstrument,
        projectSoundConfig,
      } = dlg;
      const title = projectTitle.trim();
      if (!title) return;

      const { setError, reportError, homeDir } = useUIStore.getState();
      const { environments } = useEnvironmentStore.getState();
      const { ensureAutoAssets } = useAssetStore.getState();

      const desiredBasePath = projectBasePath.trim() || homeDir || '';
      let validatedBasePath: string | null;
      if (IS_TAURI) {
        validatedBasePath = await invoke<string | null>('validate_directory', {
          path: desiredBasePath,
        }).catch(() => null);
        if (!validatedBasePath) {
          setError('Project base path must be an existing directory.');
          return;
        }
      } else {
        if (!desiredBasePath || !desiredBasePath.startsWith('/')) {
          setError('Project base path must be an absolute server path (starting with /).');
          return;
        }
        validatedBasePath = desiredBasePath;
      }

      const environmentId =
        projectEnvironmentId &&
        environments.some((e: EnvironmentConfig) => e.id === projectEnvironmentId)
          ? projectEnvironmentId
          : null;

      if (projectMode === 'rename') {
        try {
          await maestroClient.updateProject(activeProjectId, {
            name: title,
            workingDir: validatedBasePath,
          });
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === activeProjectId
                ? {
                    ...p,
                    name: title,
                    basePath: validatedBasePath,
                    environmentId,
                    assetsEnabled: projectAssetsEnabled,
                    soundInstrument: projectSoundConfig?.instrument ?? projectSoundInstrument,
                    soundConfig: projectSoundConfig,
                  }
                : p,
            ),
          }));
          dlg.setProjectOpen(false);
        } catch (err) {
          reportError('Failed to update project', err);
        }
        return;
      }

      try {
        const serverProject = await maestroClient.createProject({
          name: title,
          workingDir: validatedBasePath,
          description: '',
        });
        const project: MaestroProject = {
          id: serverProject.id,
          name: serverProject.name,
          workingDir: serverProject.workingDir,
          createdAt: serverProject.createdAt,
          updatedAt: serverProject.updatedAt,
          basePath: serverProject.workingDir,
          environmentId,
          assetsEnabled: projectAssetsEnabled,
          soundInstrument: projectSoundConfig?.instrument ?? projectSoundInstrument,
          soundConfig: projectSoundConfig,
        };
        set((s) => ({
          projects: [...s.projects, project],
          activeProjectId: serverProject.id,
        }));
        dlg.setProjectOpen(false);

        try {
          await ensureAutoAssets(validatedBasePath, serverProject.id, projectAssetsEnabled);
          const { applyPendingExit, setSessions, setActiveId } = useSessionStore.getState();
          const createdRaw = await createSession({
            projectId: serverProject.id,
            cwd: validatedBasePath,
            envVars: envVarsForProjectId(serverProject.id, [...projects, project], environments),
          });
          const s = applyPendingExit(createdRaw);
          setSessions((prev) => [...prev, s]);
          setActiveId(s.id);
        } catch (err) {
          reportError('Failed to create session', err);
          useSessionStore.getState().setActiveId(null);
        }
      } catch (err) {
        reportError('Failed to create project on server', err);
      }
    },

    checkAndDeleteProject: async (projectId) => {
      const { projects } = get();
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;

      try {
        const [tasks, allSessions] = await Promise.all([
          maestroClient.getTasks(projectId).catch(() => []),
          maestroClient.getSessions().catch(() => []),
        ]);
        const projectSessions = allSessions.filter(
          (s: any) => s.projectId === projectId && ['spawning', 'idle', 'working'].includes(s.status),
        );

        if (tasks.length > 0 || projectSessions.length > 0) {
          const parts: string[] = [];
          if (tasks.length > 0) parts.push(`${tasks.length} task${tasks.length > 1 ? 's' : ''}`);
          if (projectSessions.length > 0) parts.push(`${projectSessions.length} active session${projectSessions.length > 1 ? 's' : ''}`);
          useProjectDialogStore.setState({
            deleteProjectError: `Cannot delete "${project.name}": project has ${parts.join(' and ')}. Remove them first.`,
            deleteProjectId: projectId,
            confirmDeleteProjectOpen: true,
          });
          return;
        }

        useProjectDialogStore.setState({
          deleteProjectError: null,
          deleteProjectId: projectId,
          confirmDeleteProjectOpen: true,
        });
      } catch {
        useProjectDialogStore.setState({
          deleteProjectError: null,
          deleteProjectId: projectId,
          confirmDeleteProjectOpen: true,
        });
      }
    },

    deleteActiveProject: async () => {
      const dlg = useProjectDialogStore.getState();
      const projectId = dlg.deleteProjectId;
      if (!projectId) return;
      const { projects } = get();
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;

      const {
        sessions,
        cleanupSessionResources,
        setSessions,
        setActiveId,
      } = useSessionStore.getState();
      const { reportError } = useUIStore.getState();

      try {
        await maestroClient.deleteProject(projectId);
      } catch (err) {
        reportError('Failed to delete project on server', err);
        return;
      }

      // Clean up local sessions for this project
      const idsToClose = sessions
        .filter((s) => s.projectId === projectId)
        .map((s) => s.id);
      for (const id of idsToClose) cleanupSessionResources(id);
      setSessions((prev) => prev.filter((s) => s.projectId !== projectId));
      lastActiveByProject.delete(projectId);
      set((s) => {
        const next = { ...s.activeSessionByProject };
        delete next[projectId];
        return { activeSessionByProject: next };
      });

      const remaining = projects.filter((p) => p.id !== projectId);
      if (remaining.length === 0) {
        set((s) => ({
          projects: [],
          activeProjectId: '',
          closedProjectIds: s.closedProjectIds.filter((id) => id !== projectId),
        }));
        useProjectDialogStore.setState({
          confirmDeleteProjectOpen: false,
          deleteProjectId: null,
        });
        setActiveId(null);
        return;
      }

      const nextProjectId = remaining[0].id;
      set((s) => ({
        projects: remaining,
        activeProjectId: nextProjectId,
        closedProjectIds: s.closedProjectIds.filter((id) => id !== projectId),
      }));
      useProjectDialogStore.setState({
        confirmDeleteProjectOpen: false,
        deleteProjectId: null,
      });
      setActiveId(pickActiveSessionId(nextProjectId));
    },

    closeProject: async (projectId) => {
      const { projects, activeProjectId } = get();
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;

      const {
        sessions,
        onClose,
        setSessions,
        setActiveId,
      } = useSessionStore.getState();
      const { reportError } = useUIStore.getState();

      // Close all local sessions for this project
      const projectSessions = sessions.filter((s) => s.projectId === projectId && !s.exited && !s.closing);
      for (const s of projectSessions) {
        try {
          await onClose(s.id);
        } catch (err) {
          reportError('Failed to close session', err);
        }
      }

      // Remove any remaining sessions from the UI
      setSessions((prev) => prev.filter((s) => s.projectId !== projectId));
      lastActiveByProject.delete(projectId);
      set((s) => {
        const next = { ...s.activeSessionByProject };
        delete next[projectId];
        return { activeSessionByProject: next };
      });

      // Remove project from UI (but NOT from server); track it as closed
      const remaining = projects.filter((p) => p.id !== projectId);
      if (remaining.length === 0) {
        set((s) => ({
          projects: [],
          activeProjectId: '',
          closedProjectIds: s.closedProjectIds.includes(projectId)
            ? s.closedProjectIds
            : [...s.closedProjectIds, projectId],
        }));
        setActiveId(null);
        return;
      }

      const nextProjectId = activeProjectId === projectId ? remaining[0].id : activeProjectId;
      set((s) => ({
        projects: remaining,
        activeProjectId: nextProjectId,
        closedProjectIds: s.closedProjectIds.includes(projectId)
          ? s.closedProjectIds
          : [...s.closedProjectIds, projectId],
      }));
      if (activeProjectId === projectId) {
        setActiveId(pickActiveSessionId(nextProjectId));
      }
    },

    fetchSavedProjects: async () => {
      const { projects } = get();
      const openIds = new Set(projects.map((p) => p.id));
      try {
        const allProjects = await maestroClient.getProjects();
        return allProjects.filter((p) => !openIds.has(p.id));
      } catch {
        return [];
      }
    },

    reopenProject: async (projectId) => {
      const { projects } = get();
      if (projects.some((p) => p.id === projectId)) {
        // Already open, just select it
        get().selectProject(projectId);
        return;
      }

      const { reportError } = useUIStore.getState();
      const { setActiveId } = useSessionStore.getState();

      try {
        const serverProject = await maestroClient.getProject(projectId);
        const project: MaestroProject = {
          id: serverProject.id,
          name: serverProject.name,
          workingDir: serverProject.workingDir,
          createdAt: serverProject.createdAt,
          updatedAt: serverProject.updatedAt,
          basePath: serverProject.workingDir,
          environmentId: null,
        };
        set((s) => ({
          projects: [...s.projects, project],
          activeProjectId: project.id,
          closedProjectIds: s.closedProjectIds.filter((id) => id !== projectId),
        }));
        setActiveId(null);
      } catch (err) {
        reportError('Failed to reopen project', err);
      }
    },

    toggleMasterProject: async (projectId) => {
      const { projects } = get();
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      const newIsMaster = !project.isMaster;
      // Optimistic update
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === projectId ? { ...p, isMaster: newIsMaster } : p,
        ),
      }));
      try {
        const updated = await maestroClient.setProjectMaster(projectId, newIsMaster);
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, isMaster: updated.isMaster } : p,
          ),
        }));
      } catch (err) {
        // Revert on error
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, isMaster: project.isMaster } : p,
          ),
        }));
        useUIStore.getState().reportError('Failed to update master project status', err);
      }
    },
  };
});

// Internal type alias to avoid importing TerminalSession in the module scope (circular import risk)
type SessionLike = { id: string; projectId: string; persistId: string };

/* ------------------------------------------------------------------ */
/*  Sync lastActiveByProject + activeSessionByProject on session switch */
/* ------------------------------------------------------------------ */

/**
 * Call once after stores are created (e.g. from initApp or App mount).
 * Subscribes to useSessionStore so that whenever activeId changes we
 * record the mapping projectId → sessionId / persistId for later
 * restoration when the user switches projects.
 */
export function initActiveSessionSync(): () => void {
  let prevActiveId: string | null = useSessionStore.getState().activeId;

  const unsub = useSessionStore.subscribe((state) => {
    const { activeId, sessions } = state;
    if (activeId === prevActiveId) return;
    prevActiveId = activeId;

    if (!activeId) return;
    const session = sessions.find((s) => s.id === activeId);
    if (!session) {
      return;
    }

    // Update module-level map (used by pickActiveSessionId at runtime)
    lastActiveByProject.set(session.projectId, activeId);

    // Update persisted record (saved to disk via persistence.ts)
    useProjectStore.getState().setActiveSessionByProject((prev) => {
      if (prev[session.projectId] === session.persistId) return prev;
      return { ...prev, [session.projectId]: session.persistId };
    });
  });

  return unsub;
}
