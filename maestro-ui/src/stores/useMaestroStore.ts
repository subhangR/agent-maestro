import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { platform } from '../platform';
import { maestroClient } from '../utils/MaestroClient';
import type {
  MaestroTask,
  MaestroSession,
  CreateTaskPayload,
  UpdateTaskPayload,
  TaskList,
  CreateTaskListPayload,
  UpdateTaskListPayload,
  CreateSessionPayload,
  UpdateSessionPayload,
  Ordering,
  TeamMember,
  CreateTeamMemberPayload,
  UpdateTeamMemberPayload,
  ModelProfile,
  CreateModelProfilePayload,
  UpdateModelProfilePayload,
  Team,
  CreateTeamPayload,
  UpdateTeamPayload,
  WorkflowTemplate,
} from '../app/types/maestro';
import { useSessionStore } from './useSessionStore';
import { useUIStore } from './useUIStore';
import { WS_URL } from '../utils/serverConfig';
import { playEventSound, soundManager } from '../services/soundManager';
import { usePromptAnimationStore, selectPromptSurface, type PromptSurface } from './usePromptAnimationStore';
import { buildTeamGroups } from '../utils/teamGrouping';

/**
 * Resolve cosmetic metadata for a prompt animation (sender accent + display names).
 * Best-effort: any missing piece simply degrades the animation, never blocks delivery.
 */
function resolvePromptAnimationMeta(
  maestroSessions: Record<string, MaestroSession>,
  teams: Record<string, Team>,
  senderMaestroSessionId: string | null,
  targetMaestroSessionId: string,
): { accent?: string; senderName?: string; targetName?: string; senderInitial?: string; edgeTravel?: boolean } {
  const senderName = senderMaestroSessionId
    ? maestroSessions[senderMaestroSessionId]?.name
    : undefined;
  const targetName = maestroSessions[targetMaestroSessionId]?.name;

  // Parent/child pair → tree variant can route along the spawn-edge connector.
  let edgeTravel = false;
  if (senderMaestroSessionId) {
    const sender = maestroSessions[senderMaestroSessionId];
    const target = maestroSessions[targetMaestroSessionId];
    edgeTravel =
      sender?.parentSessionId === targetMaestroSessionId ||
      target?.parentSessionId === senderMaestroSessionId;
  }

  let accent: string | undefined;
  if (senderMaestroSessionId) {
    try {
      const localSessions = useSessionStore.getState().sessions;
      const { sessionColorMap } = buildTeamGroups(localSessions, maestroSessions, teams);
      accent = sessionColorMap.get(senderMaestroSessionId)?.teamColor.primary;
    } catch {
      // best-effort accent only
    }
  }

  const senderInitial = senderName?.trim()?.[0]?.toUpperCase();
  return { accent, senderName, targetName, senderInitial, edgeTravel };
}

// Global WebSocket singleton
let globalWs: WebSocket | null = null;
let globalConnecting = false;
let globalReconnectTimeout: number | null = null;
let globalReconnectAttempts = 0;


export interface AgentModal {
  sessionId: string;
  modalId: string;
  title: string;
  html: string;
  filePath?: string;
  timestamp: number;
}

interface MaestroState {
  tasks: Record<string, MaestroTask>;
  taskLists: Record<string, TaskList>;
  sessions: Record<string, MaestroSession>;
  teamMembers: Record<string, TeamMember>;
  modelProfiles: Record<string, ModelProfile>;
  teams: Record<string, Team>;
  activeModals: AgentModal[];
  loading: Record<string, boolean>;
  errors: Record<string, string>;
  wsConnected: boolean;
  activeProjectIdRef: string | null;
  // Currently in-flight session resume — drives "Resuming…" UI in tile + stats.
  resumingSessionId: string | null;
  // Ordering state
  taskOrdering: Record<string, string[]>;    // projectId -> orderedIds
  sessionOrdering: Record<string, string[]>; // projectId -> orderedIds
  taskListOrdering: Record<string, string[]>; // projectId -> ordered list ids
  // Workflow templates
  workflowTemplates: WorkflowTemplate[];
  // Last used team member per task (persisted to localStorage)
  lastUsedTeamMember: Record<string, string>;
  fetchTasks: (projectId: string) => Promise<void>;
  fetchTask: (taskId: string) => Promise<void>;
  fetchTaskLists: (projectId: string) => Promise<void>;
  fetchTaskList: (listId: string) => Promise<void>;
  fetchSessions: (taskId?: string) => Promise<void>;
  fetchSession: (sessionId: string) => Promise<void>;
  createTask: (data: CreateTaskPayload) => Promise<MaestroTask>;
  updateTask: (taskId: string, updates: UpdateTaskPayload) => Promise<MaestroTask>;
  deleteTask: (taskId: string) => Promise<void>;
  createTaskList: (data: CreateTaskListPayload) => Promise<TaskList>;
  updateTaskList: (listId: string, updates: UpdateTaskListPayload) => Promise<TaskList>;
  deleteTaskList: (listId: string) => Promise<void>;
  addTaskToList: (listId: string, taskId: string) => Promise<void>;
  removeTaskFromList: (listId: string, taskId: string) => Promise<void>;
  reorderTaskListTasks: (listId: string, orderedTaskIds: string[]) => Promise<void>;
  createMaestroSession: (data: CreateSessionPayload) => Promise<MaestroSession>;
  updateMaestroSession: (sessionId: string, updates: UpdateSessionPayload) => Promise<MaestroSession>;
  deleteMaestroSession: (sessionId: string) => Promise<void>;
  addTaskToSession: (sessionId: string, taskId: string) => Promise<void>;
  removeTaskFromSession: (sessionId: string, taskId: string) => Promise<void>;
  clearNeedsInput: (maestroSessionId: string) => void;
  checkAndClearNeedsInputForActiveSession: () => void;
  showAgentModal: (modal: AgentModal) => void;
  closeAgentModal: (modalId: string) => void;
  clearCache: () => void;
  hardRefresh: (projectId: string) => Promise<void>;
  initWebSocket: () => void;
  destroyWebSocket: () => void;
  // Ordering actions
  fetchTaskOrdering: (projectId: string) => Promise<void>;
  fetchSessionOrdering: (projectId: string) => Promise<void>;
  saveTaskOrdering: (projectId: string, orderedIds: string[]) => Promise<void>;
  saveSessionOrdering: (projectId: string, orderedIds: string[]) => Promise<void>;
  fetchTaskListOrdering: (projectId: string) => Promise<void>;
  saveTaskListOrdering: (projectId: string, orderedIds: string[]) => Promise<void>;
  // Team member actions
  fetchTeamMembers: (projectId: string) => Promise<void>;
  createTeamMember: (data: CreateTeamMemberPayload) => Promise<TeamMember>;
  updateTeamMember: (id: string, projectId: string, updates: UpdateTeamMemberPayload) => Promise<TeamMember>;
  deleteTeamMember: (id: string, projectId: string) => Promise<void>;
  archiveTeamMember: (id: string, projectId: string) => Promise<void>;
  unarchiveTeamMember: (id: string, projectId: string) => Promise<void>;
  resetDefaultTeamMember: (id: string, projectId: string) => Promise<void>;
  // Model profile actions (workspace-global)
  fetchModelProfiles: () => Promise<void>;
  createModelProfile: (data: CreateModelProfilePayload) => Promise<ModelProfile>;
  updateModelProfile: (id: string, updates: UpdateModelProfilePayload) => Promise<ModelProfile>;
  deleteModelProfile: (id: string) => Promise<void>;
  setLastUsedTeamMember: (taskId: string, teamMemberId: string) => void;
  fetchWorkflowTemplates: () => Promise<void>;
  // Team actions
  fetchTeams: (projectId: string) => Promise<void>;
  createTeam: (data: CreateTeamPayload) => Promise<Team>;
  updateTeam: (id: string, projectId: string, updates: UpdateTeamPayload) => Promise<Team>;
  deleteTeam: (id: string, projectId: string) => Promise<void>;
  archiveTeam: (id: string, projectId: string) => Promise<void>;
  unarchiveTeam: (id: string, projectId: string) => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;
  /**
   * High-level resume flow used by tile + stats view:
   *   - sets resumingSessionId for spinner UI
   *   - calls the bare resumeSession
   *   - clears humanCompletedAt / archivedAt so the resumed session returns to Open
   */
  resumeSessionFlow: (sessionId: string) => Promise<void>;
  updateSessionMode: (sessionId: string, mode: string) => void;
  setSessionHumanComplete: (sessionId: string, complete: boolean) => Promise<void>;
  setSessionArchived: (sessionId: string, archived: boolean) => Promise<void>;
}

// Module-level debounce timer for lastUsedTeamMember localStorage persistence
let lastUsedTeamMemberSaveTimer: number | null = null;

// Debounced entity refetch — collects IDs for 200ms then fetches once per ID
const pendingTaskRefetches = new Set<string>();
const pendingSessionRefetches = new Set<string>();
let taskRefetchTimer: ReturnType<typeof setTimeout> | null = null;
let sessionRefetchTimer: ReturnType<typeof setTimeout> | null = null;
const REFETCH_DEBOUNCE_MS = 200;

function debouncedFetchTask(taskId: string, fetchFn: (id: string) => void) {
  pendingTaskRefetches.add(taskId);
  if (!taskRefetchTimer) {
    taskRefetchTimer = setTimeout(() => {
      taskRefetchTimer = null;
      const ids = [...pendingTaskRefetches];
      pendingTaskRefetches.clear();
      ids.forEach(fetchFn);
    }, REFETCH_DEBOUNCE_MS);
  }
}

function debouncedFetchSession(sessionId: string, fetchFn: (id: string) => void) {
  pendingSessionRefetches.add(sessionId);
  if (!sessionRefetchTimer) {
    sessionRefetchTimer = setTimeout(() => {
      sessionRefetchTimer = null;
      const ids = [...pendingSessionRefetches];
      pendingSessionRefetches.clear();
      ids.forEach(fetchFn);
    }, REFETCH_DEBOUNCE_MS);
  }
}

export const useMaestroStore = create<MaestroState>((set, get) => {
  // --- Batched set() for WebSocket handlers ---
  // Accumulates pure state updates within a single microtask, then flushes them
  // as a single set() call so N WebSocket messages → 1 subscriber notification.
  type PendingUpdate = (state: MaestroState) => Partial<MaestroState>;
  let pendingUpdates: PendingUpdate[] = [];
  let batchScheduled = false;

  function batchSet(updater: PendingUpdate) {
    pendingUpdates.push(updater);
    if (!batchScheduled) {
      batchScheduled = true;
      queueMicrotask(() => {
        batchScheduled = false;
        const updates = pendingUpdates;
        pendingUpdates = [];
        if (updates.length === 0) return;
        if (updates.length === 1) {
          set(updates[0]);
          return;
        }
        set((state) => {
          let merged: Partial<MaestroState> = {};
          for (const fn of updates) {
            Object.assign(merged, fn(state));
          }
          return merged;
        });
      });
    }
  }

  // High-frequency events to exclude from detailed logging (reduce noise)
  const HIGH_FREQUENCY_EVENTS = new Set([
    'heartbeat',
    'ping',
    'pong',
    'status:ping',
    'keepalive',
  ]);

  // Normalize session data to ensure required fields exist (mutates in-place)
  // Lifecycle fields the human controls optimistically (human-complete toggle,
  // archive/close). While a write is in flight we keep the locally-set value so
  // a stale server `session:updated` full-replace can't bounce the tile between
  // the Active/Completed/Archived tabs (flicker / tab-jump).
  const pendingLifecycle = new Map<string, { humanCompletedAt?: number | null; archivedAt?: number | null }>();

  const applyPendingLifecycle = (session: MaestroSession): MaestroSession => {
    if (!session) return session;
    const override = pendingLifecycle.get(session.id);
    if (!override) return session;
    return { ...session, ...override };
  };

  const clearPendingLifecycleField = (sessionId: string, field: 'humanCompletedAt' | 'archivedAt') => {
    const override = pendingLifecycle.get(sessionId);
    if (!override) return;
    delete override[field];
    if (Object.keys(override).length === 0) pendingLifecycle.delete(sessionId);
  };

  const normalizeSession = (session: Partial<MaestroSession>): MaestroSession => {
    if (!session) return session as MaestroSession;
    if (!Array.isArray(session.taskIds)) {
      session.taskIds = [];
    }
    if (!Array.isArray(session.timeline)) {
      session.timeline = [];
    }
    if (!Array.isArray(session.events)) {
      session.events = [];
    }
    if (!session.status) {
      session.status = 'spawning';
    }
    return session as MaestroSession;
  };

  const setLoading = (key: string, isLoading: boolean) => {
    set((prev) => {
      if (isLoading === !!prev.loading[key]) return prev;
      if (isLoading) return { loading: { ...prev.loading, [key]: true } };
      const { [key]: _, ...rest } = prev.loading;
      return { loading: rest };
    });
  };

  const setError = (key: string, error: string | null) => {
    set((prev) => {
      if (!error && !prev.errors[key]) return prev;
      if (error) return { errors: { ...prev.errors, [key]: error } };
      const { [key]: _, ...rest } = prev.errors;
      return { errors: rest };
    });
  };

  /**
   * Play a sound for a session-related event using team member instruments when available.
   * Falls back to project/global instrument if session has no team members registered.
   */
  const playSessionAwareSound = (eventType: string, sessionOrData: { teamMemberIds?: string[]; teamMemberId?: string } | null) => {
    let teamMemberIds: string[] = [];
    if (sessionOrData?.teamMemberIds?.length) {
      teamMemberIds = sessionOrData.teamMemberIds;
    } else if (sessionOrData?.teamMemberId) {
      teamMemberIds = [sessionOrData.teamMemberId];
    }
    if (teamMemberIds.length > 0) {
      soundManager.playSessionEventSound(eventType as any, teamMemberIds).catch(() => {});
    } else {
      playEventSound(eventType as any);
    }
  };

  /** Process a single WebSocket message (extracted for batched array support). */
  const handleSingleMessage = (message: any) => {
    const shouldLogDetails = !HIGH_FREQUENCY_EVENTS.has(message.event);

    switch (message.event) {
      case 'task:created':
      case 'task:updated': {
        const taskData = message.data;
        // Ensure taskSessionStatuses is always an object (never null/undefined)
        if (!taskData.taskSessionStatuses || typeof taskData.taskSessionStatuses !== 'object') {
          taskData.taskSessionStatuses = {};
        }
        const prevTask = get().tasks[taskData.id];
        batchSet((prev) => ({ tasks: { ...prev.tasks, [taskData.id]: taskData } }));
        // Only play sound on task creation or status change — not on field edits (title, description, etc.)
        const isNew = message.event === 'task:created' && !prevTask;
        const statusChanged = prevTask && prevTask.status !== taskData.status;
        if (isNew || statusChanged) {
          playEventSound(message.event as any);
        }
        break;
      }
      case 'task:deleted': {
        batchSet((prev) => {
          const { [message.data.id]: _, ...tasks } = prev.tasks;
          return { tasks };
        });
        // Play sound for event
        playEventSound(message.event as any);
        break;
      }
      case 'session:created': {
        const session = normalizeSession(message.data.session || message.data);
        batchSet((prev) => ({ sessions: { ...prev.sessions, [session.id]: session } }));
        // Play sound using team member instruments when available
        playSessionAwareSound(message.event, session);
        break;
      }
      case 'session:updated': {
        const updatedSession = applyPendingLifecycle(normalizeSession(message.data));
        batchSet((prev) => ({ sessions: { ...prev.sessions, [updatedSession.id]: updatedSession } }));
        // Play sound using team member instruments (only if not a high-frequency update)
        if (shouldLogDetails) {
          playSessionAwareSound(message.event, updatedSession);
        }
        break;
      }
      case 'session:status_changed': {
        // Lightweight status-only update — patch existing session in-place
        const { id, status, lastActivity, needsInput } = message.data;
        const existing = get().sessions[id];
        if (existing) {
          const updated = { ...existing, status, lastActivity, needsInput };
          batchSet((prev) => ({ sessions: { ...prev.sessions, [id]: updated } }));
        }
        break;
      }
      case 'session:deleted': {
        // Grab session before removing so we can play its team member sounds
        const deletedSession = get().sessions[message.data.id];
        batchSet((prev) => {
          const { [message.data.id]: _, ...sessions } = prev.sessions;
          return { sessions };
        });
        playSessionAwareSound(message.event, deletedSession || message.data);
        break;
      }
      case 'session:spawn': {
        const session = normalizeSession(message.data.session || message.data);
        if (!session?.id) {
          break;
        }
        set((prev) => ({ sessions: { ...prev.sessions, [session.id]: session } }));
        void useSessionStore.getState().handleSpawnTerminalSession({
          maestroSessionId: session.id,
          name: session.name || '',
          command: message.data.command ?? null,
          args: [],
          cwd: message.data.cwd || '',
          envVars: message.data.envVars || {},
          projectId: message.data.projectId || '',
        });
        playSessionAwareSound('session:created', session);
        break;
      }
      case 'session:resume': {
        const session = normalizeSession(message.data.session || message.data);
        if (!session?.id) {
          break;
        }
        set((prev) => ({ sessions: { ...prev.sessions, [session.id]: session } }));

        // Resume is idempotent: replace ANY existing terminal(s) for this maestro
        // session — not just exited ones. A crashed/working session often has a
        // stale terminal tab that the UI never marked as exited; leaving it would
        // duplicate tabs and leak the old PTY.
        const sessionStore = useSessionStore.getState();
        const existingTerminals = sessionStore.sessions.filter(
          (s) => s.maestroSessionId === session.id
        );
        if (existingTerminals.length > 0) {
          for (const term of existingTerminals) {
            // Close the underlying PTY for any terminal still believed to be live.
            if (!term.exited) {
              sessionStore.cleanupSessionResources(term.id);
            }
          }
          const staleIds = new Set(existingTerminals.map((s) => s.id));
          sessionStore.setSessions((prev) => prev.filter((s) => !staleIds.has(s.id)));
        }

        // Spawn new terminal (replaces the removed one)
        void sessionStore.handleSpawnTerminalSession({
          maestroSessionId: session.id,
          name: session.name || '',
          command: message.data.command ?? null,
          args: [],
          cwd: message.data.cwd || '',
          envVars: message.data.envVars || {},
          projectId: message.data.projectId || '',
        });
        playSessionAwareSound('session:created', session);
        break;
      }
      case 'session:prompt_send': {
        const {
          sessionId: maestroSessionId,
          content,
          mode: promptMode,
          senderSessionId,
          senderProjectId,
          targetProjectId,
        } = message.data;

        // Trigger the travel animation (cosmetic, best-effort — never blocks PTY write below).
        const railVisible = useUIStore.getState().spacesRailActiveSection === null;
        const surface: PromptSurface = selectPromptSurface(
          senderProjectId ?? null,
          targetProjectId ?? null,
          railVisible,
        );
        const meta = resolvePromptAnimationMeta(
          get().sessions,
          get().teams,
          senderSessionId || null,
          maestroSessionId,
        );
        usePromptAnimationStore.getState().addAnimation({
          surface,
          senderMaestroSessionId: senderSessionId || null,
          targetMaestroSessionId: maestroSessionId,
          senderProjectId: senderProjectId ?? null,
          targetProjectId: targetProjectId ?? null,
          content: content || '',
          direction: 'forward',
          ...meta,
        });

        const sessions = useSessionStore.getState().sessions;
        const terminalSession = sessions.find(
          (s) => s.maestroSessionId === maestroSessionId && !s.exited
        );
        if (!terminalSession) {
          break;
        }
        // Write directly to PTY with 'system' source to distinguish programmatic input from user keyboard input
        const ptyId = terminalSession.id;
        const text = content.replace(/[\r\n]+$/, '');
        (async () => {
          try {
            if (promptMode === 'paste') {
              await platform.terminal.write(ptyId, text, 'system');
            } else {
              if (text) {
                await platform.terminal.write(ptyId, text, 'system');
                await new Promise(r => setTimeout(r, 200));
              }
              await platform.terminal.write(ptyId, '\r', 'system');
            }
          } catch {
            // best-effort write to session – ignore failures
          }
        })();
        break;
      }
      case 'spell:invoked': {
        const { sessionId: maestroSessionId, content, entityType, entityId, spellName } = message.data;

        // Find terminal session for this maestro session
        const spellSessions = useSessionStore.getState().sessions;
        const terminalSession = spellSessions.find(
          (s) => s.maestroSessionId === maestroSessionId && !s.exited
        );
        if (!terminalSession) break;

        // Inject prompt into PTY (same pattern as session:prompt_send)
        const spellPtyId = terminalSession.id;
        const spellText = content.replace(/[\r\n]+$/, '');
        (async () => {
          try {
            if (spellText) {
              await platform.terminal.write(spellPtyId, spellText, 'system');
              await new Promise(r => setTimeout(r, 200));
            }
            await platform.terminal.write(spellPtyId, '\r', 'system');
          } catch {
            // best-effort
          }
        })();

        // Trigger prompt animation (spell delivery has no sender → target pulse only).
        const spellMeta = resolvePromptAnimationMeta(
          get().sessions,
          get().teams,
          null,
          maestroSessionId,
        );
        usePromptAnimationStore.getState().addAnimation({
          surface: 'rail',
          senderMaestroSessionId: null,
          targetMaestroSessionId: maestroSessionId,
          content: `[Spell: ${spellName}] ${content.slice(0, 50)}...`,
          direction: 'forward',
          ...spellMeta,
        });

        break;
      }
      case 'task:session_added':
      case 'task:session_removed': {
        if (message.data?.taskId) debouncedFetchTask(message.data.taskId, get().fetchTask);
        // Use session's team member sounds if available
        const tsSession = message.data?.sessionId ? get().sessions[message.data.sessionId] : null;
        playSessionAwareSound(message.event, tsSession || null);
        break;
      }
      case 'session:task_added':
      case 'session:task_removed': {
        if (message.data?.sessionId) debouncedFetchSession(message.data.sessionId, get().fetchSession);
        // Use session's team member sounds if available
        const stSession = message.data?.sessionId ? get().sessions[message.data.sessionId] : null;
        playSessionAwareSound(message.event, stSession || null);
        break;
      }
      // Notification events — play dedicated sounds using team member ensemble if available
      case 'notify:task_completed':
      case 'notify:task_failed':
      case 'notify:task_blocked':
      case 'notify:task_session_completed':
      case 'notify:task_session_failed':
      case 'notify:session_completed':
      case 'notify:session_failed':
      case 'notify:needs_input':
      case 'notify:progress': {
        // Try to get team member IDs from the associated session for ensemble sound
        const sessionId = message.data?.sessionId;
        let teamMemberIds: string[] = [];
        if (sessionId) {
          const session = get().sessions[sessionId];
          if (session?.teamMemberIds?.length) {
            teamMemberIds = session.teamMemberIds;
          } else if (session?.teamMemberId) {
            teamMemberIds = [session.teamMemberId];
          }
        }
        if (teamMemberIds.length > 0) {
          soundManager.playSessionEventSound(message.event as any, teamMemberIds).catch(() => { /* best-effort sound */ });
        } else {
          playEventSound(message.event as any);
        }
        break;
      }
      case 'session:modal': {
        const modalData = message.data as AgentModal;
        get().showAgentModal(modalData);
        break;
      }
      case 'team_member:created':
      case 'team_member:updated':
      case 'team_member:archived': {
        const teamMember = message.data;
        batchSet((prev) => ({ teamMembers: { ...prev.teamMembers, [teamMember.id]: teamMember } }));
        // Sync instrument with sound manager
        if (teamMember.soundInstrument) {
          soundManager.registerTeamMember(teamMember.id, teamMember.soundInstrument);
        }
        // Play sound for event
        playEventSound(message.event as any);
        break;
      }
      case 'team_member:deleted': {
        batchSet((prev) => {
          const { [message.data.id]: _, ...teamMembers } = prev.teamMembers;
          return { teamMembers };
        });
        // Unregister from sound manager
        soundManager.unregisterTeamMember(message.data.id);
        // Play sound for event
        playEventSound(message.event as any);
        break;
      }
      case 'model_profile:created':
      case 'model_profile:updated': {
        const modelProfile = message.data;
        batchSet((prev) => ({ modelProfiles: { ...prev.modelProfiles, [modelProfile.id]: modelProfile } }));
        break;
      }
      case 'model_profile:deleted': {
        batchSet((prev) => {
          const { [message.data.id]: _, ...modelProfiles } = prev.modelProfiles;
          return { modelProfiles };
        });
        break;
      }
      case 'task_list:created':
      case 'task_list:updated':
      case 'task_list:reordered': {
        const taskList = message.data;
        batchSet((prev) => ({ taskLists: { ...prev.taskLists, [taskList.id]: taskList } }));
        break;
      }
      case 'task_list:deleted': {
        batchSet((prev) => {
          const { [message.data.id]: _, ...taskLists } = prev.taskLists;
          return { taskLists };
        });
        break;
      }
      case 'task_graph:created':
      case 'task_graph:updated':
      case 'task_graph:deleted': {
        // Delegate to the task graph store
        const { useTaskGraphStore } = require('./useTaskGraphStore');
        useTaskGraphStore.getState().handleWsEvent(message.event, message.data);
        break;
      }
      case 'team:created':
      case 'team:updated':
      case 'team:archived': {
        const team = message.data;
        batchSet((prev) => ({ teams: { ...prev.teams, [team.id]: team } }));
        playEventSound(message.event as any);
        break;
      }
      case 'team:deleted': {
        batchSet((prev) => {
          const { [message.data.id]: _, ...teams } = prev.teams;
          return { teams };
        });
        playEventSound(message.event as any);
        break;
      }
      case 'session:mode_changed': {
        const { sessionId, mode } = message.data;
        batchSet((prev) => {
          const existing = prev.sessions[sessionId];
          if (!existing) return {};
          return { sessions: { ...prev.sessions, [sessionId]: { ...existing, mode } } };
        });
        break;
      }
    }
  };

  /** Handle incoming WebSocket message — supports both single-object and batched array formats. */
  const handleMessage = (event: MessageEvent) => {
    try {
      const parsed = JSON.parse(event.data);
      const messages = Array.isArray(parsed) ? parsed : [parsed];
      for (const message of messages) {
        handleSingleMessage(message);
      }
    } catch {
      // best-effort WebSocket message handling – ignore parse/processing errors
    }
  };

  const connectGlobal = () => {
    if (globalConnecting || (globalWs && globalWs.readyState === WebSocket.OPEN)) {
      return;
    }
    globalConnecting = true;
    if (globalWs) { globalWs.close(); globalWs = null; }

    try {
      const ws = new WebSocket(WS_URL);
      globalWs = ws;

      ws.onopen = () => {
        set({ wsConnected: true });
        globalConnecting = false;
        globalReconnectAttempts = 0;
        get().fetchModelProfiles();
        const { activeProjectIdRef } = get();
        if (activeProjectIdRef) {
          get().fetchTasks(activeProjectIdRef);
          get().fetchSessions();
          get().fetchTeamMembers(activeProjectIdRef);
          get().fetchTeams(activeProjectIdRef);
          get().fetchTaskLists(activeProjectIdRef);
        }
      };

      ws.onmessage = handleMessage;

      ws.onerror = () => {
      };

      ws.onclose = () => {
        // Guard: if this WebSocket is no longer the active one (replaced by a newer
        // connection or intentionally destroyed), ignore this close event entirely.
        // Without this guard, React StrictMode's double-invoke of effects creates
        // a stale ws1 whose onclose fires after ws2 is established, nulling globalWs
        // and scheduling a spurious reconnect (ws3). This causes the server to
        // broadcast session:prompt_send to ws1+ws2+ws3, tripling PTY injection.
        if (globalWs !== ws) return;

        const baseDelay = Math.min(1000 * Math.pow(2, globalReconnectAttempts), 30000);
        const jitter = Math.random() * baseDelay * 0.5; // 0-50% jitter
        const delay = baseDelay + jitter;
        set({ wsConnected: false });
        globalConnecting = false;
        globalWs = null;
        if (globalReconnectTimeout) clearTimeout(globalReconnectTimeout);
        globalReconnectTimeout = window.setTimeout(() => {
          globalReconnectAttempts++;
          connectGlobal();
        }, delay);
      };
    } catch {
      globalConnecting = false;
    }
  };

  // Load lastUsedTeamMember from localStorage
  const loadLastUsedTeamMember = (): Record<string, string> => {
    try {
      const stored = localStorage.getItem('maestro:lastUsedTeamMember');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  };

  return {
    tasks: {},
    taskLists: {},
    sessions: {},
    teamMembers: {},
    modelProfiles: {},
    teams: {},
    activeModals: [],
    loading: {},
    errors: {},
    wsConnected: false,
    activeProjectIdRef: null,
    resumingSessionId: null,
    taskOrdering: {},
    sessionOrdering: {},
    taskListOrdering: {},
    workflowTemplates: [],
    lastUsedTeamMember: loadLastUsedTeamMember(),

    fetchTasks: async (projectId) => {
      const key = `tasks:${projectId}`;
      set({ activeProjectIdRef: projectId });
      setLoading(key, true);
      setError(key, null);
      try {
        const tasks = await maestroClient.getTasks(projectId);
        set((prev) => {
          const updated = { ...prev.tasks };
          for (const task of tasks) {
            if (!task.taskSessionStatuses || typeof task.taskSessionStatuses !== 'object') {
              task.taskSessionStatuses = {};
            }
            updated[task.id] = task;
          }
          return { tasks: updated };
        });
      } catch (err) {
        setError(key, err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(key, false);
      }
    },

    fetchTask: async (taskId) => {
      const key = `task:${taskId}`;
      setLoading(key, true);
      setError(key, null);
      try {
        const task = await maestroClient.getTask(taskId);
        if (!task.taskSessionStatuses || typeof task.taskSessionStatuses !== 'object') {
          task.taskSessionStatuses = {};
        }
        set((prev) => ({ tasks: { ...prev.tasks, [task.id]: task } }));
      } catch (err) {
        setError(key, err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(key, false);
      }
    },

    fetchTaskLists: async (projectId) => {
      const key = `taskLists:${projectId}`;
      setLoading(key, true);
      setError(key, null);
      try {
        const lists = await maestroClient.getTaskLists(projectId);
        set((prev) => {
          // Remove old entries for this project, then add fresh data
          const taskLists: Record<string, TaskList> = {};
          for (const [id, list] of Object.entries(prev.taskLists)) {
            if (list.projectId !== projectId) taskLists[id] = list;
          }
          for (const list of lists) {
            taskLists[list.id] = list;
          }
          const existing = prev.taskListOrdering[projectId];
          let nextOrdering: Record<string, string[]>;
          if (!existing || existing.length === 0) {
            nextOrdering = { ...prev.taskListOrdering, [projectId]: lists.map((list) => list.id) };
          } else {
            const listIds = lists.map((list) => list.id);
            const merged = [
              ...existing.filter((id) => listIds.includes(id)),
              ...listIds.filter((id) => !existing.includes(id)),
            ];
            nextOrdering = { ...prev.taskListOrdering, [projectId]: merged };
          }
          return { taskLists, taskListOrdering: nextOrdering };
        });
      } catch (err) {
        setError(key, err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(key, false);
      }
    },

    fetchTaskList: async (listId) => {
      const key = `taskList:${listId}`;
      setLoading(key, true);
      setError(key, null);
      try {
        const list = await maestroClient.getTaskList(listId);
        set((prev) => ({ taskLists: { ...prev.taskLists, [list.id]: list } }));
      } catch (err) {
        setError(key, err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(key, false);
      }
    },

    fetchSessions: async (taskId) => {
      const key = taskId ? `sessions:task:${taskId}` : 'sessions';
      setLoading(key, true);
      setError(key, null);
      try {
        const sessions = await maestroClient.getSessions(taskId);
        set((prev) => {
          const updated = { ...prev.sessions };
          for (const session of sessions) {
            updated[session.id] = applyPendingLifecycle(normalizeSession(session));
          }
          return { sessions: updated };
        });
      } catch (err) {
        setError(key, err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(key, false);
      }
    },

    fetchSession: async (sessionId) => {
      const key = `session:${sessionId}`;
      setLoading(key, true);
      setError(key, null);
      try {
        const session = applyPendingLifecycle(normalizeSession(await maestroClient.getSession(sessionId)));
        set((prev) => ({ sessions: { ...prev.sessions, [session.id]: session } }));
        for (const taskId of session.taskIds) {
          if (!get().tasks[taskId]) get().fetchTask(taskId);
        }
      } catch (err) {
        setError(key, err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(key, false);
      }
    },

    createTask: async (data) => {
      const task = await maestroClient.createTask(data);
      // Optimistic update — add task to store immediately instead of waiting for WebSocket event
      if (!task.taskSessionStatuses || typeof task.taskSessionStatuses !== 'object') {
        task.taskSessionStatuses = {};
      }
      set((prev) => ({ tasks: { ...prev.tasks, [task.id]: task } }));
      return task;
    },
    updateTask: async (taskId, updates) => {
      const task = await maestroClient.updateTask(taskId, updates);
      // Optimistic update — apply changes immediately instead of waiting for WebSocket event
      if (!task.taskSessionStatuses || typeof task.taskSessionStatuses !== 'object') {
        task.taskSessionStatuses = {};
      }
      set((prev) => ({ tasks: { ...prev.tasks, [task.id]: task } }));
      return task;
    },
    deleteTask: async (taskId) => {
      await maestroClient.deleteTask(taskId);
      // Optimistic update — remove from store immediately instead of waiting for WebSocket event
      set((prev) => {
        const { [taskId]: _, ...tasks } = prev.tasks;
        return { tasks };
      });
    },
    createTaskList: async (data) => {
      const list = await maestroClient.createTaskList(data);
      set((prev) => {
        const existing = prev.taskListOrdering[list.projectId] || [];
        return {
          taskLists: { ...prev.taskLists, [list.id]: list },
          taskListOrdering: existing.includes(list.id)
            ? prev.taskListOrdering
            : { ...prev.taskListOrdering, [list.projectId]: [...existing, list.id] },
        };
      });
      return list;
    },
    updateTaskList: async (listId, updates) => {
      const prevList = get().taskLists[listId];
      if (prevList) {
        set((prev) => ({
          taskLists: { ...prev.taskLists, [listId]: { ...prevList, ...updates } },
        }));
      }
      try {
        const list = await maestroClient.updateTaskList(listId, updates);
        set((prev) => ({ taskLists: { ...prev.taskLists, [list.id]: list } }));
        return list;
      } catch (err) {
        if (prevList) {
          set((prev) => ({ taskLists: { ...prev.taskLists, [listId]: prevList } }));
        }
        throw err;
      }
    },
    deleteTaskList: async (listId) => {
      const prevList = get().taskLists[listId];
      if (prevList) {
        set((prev) => {
          const { [listId]: _, ...taskLists } = prev.taskLists;
          const existing = prev.taskListOrdering[prevList.projectId] || [];
          return {
            taskLists,
            taskListOrdering: { ...prev.taskListOrdering, [prevList.projectId]: existing.filter((id) => id !== listId) },
          };
        });
      }
      try {
        await maestroClient.deleteTaskList(listId);
      } catch (err) {
        if (prevList) {
          set((prev) => {
            const existing = prev.taskListOrdering[prevList.projectId] || [];
            return {
              taskLists: { ...prev.taskLists, [listId]: prevList },
              taskListOrdering: existing.includes(listId)
                ? prev.taskListOrdering
                : { ...prev.taskListOrdering, [prevList.projectId]: [...existing, listId] },
            };
          });
        }
        throw err;
      }
    },
    addTaskToList: async (listId, taskId) => {
      const prevList = get().taskLists[listId];
      if (!prevList) {
        throw new Error('Task list not found');
      }
      if (!prevList.orderedTaskIds.includes(taskId)) {
        set((prev) => ({
          taskLists: { ...prev.taskLists, [listId]: { ...prevList, orderedTaskIds: [...prevList.orderedTaskIds, taskId] } },
        }));
      }
      try {
        const list = await maestroClient.addTaskToList(listId, taskId);
        set((prev) => ({ taskLists: { ...prev.taskLists, [list.id]: list } }));
      } catch (err) {
        if (prevList) {
          set((prev) => ({ taskLists: { ...prev.taskLists, [listId]: prevList } }));
        }
        throw err;
      }
    },
    removeTaskFromList: async (listId, taskId) => {
      const prevList = get().taskLists[listId];
      if (!prevList) {
        throw new Error('Task list not found');
      }
      set((prev) => ({
        taskLists: { ...prev.taskLists, [listId]: { ...prevList, orderedTaskIds: prevList.orderedTaskIds.filter((id) => id !== taskId) } },
      }));
      try {
        const list = await maestroClient.removeTaskFromList(listId, taskId);
        set((prev) => ({ taskLists: { ...prev.taskLists, [list.id]: list } }));
      } catch (err) {
        set((prev) => ({ taskLists: { ...prev.taskLists, [listId]: prevList } }));
        throw err;
      }
    },
    reorderTaskListTasks: async (listId, orderedTaskIds) => {
      const prevList = get().taskLists[listId];
      if (!prevList) {
        throw new Error('Task list not found');
      }
      set((prev) => ({
        taskLists: { ...prev.taskLists, [listId]: { ...prevList, orderedTaskIds } },
      }));
      try {
        const list = await maestroClient.reorderTaskListTasks(listId, orderedTaskIds);
        set((prev) => ({ taskLists: { ...prev.taskLists, [list.id]: list } }));
      } catch (err) {
        set((prev) => ({ taskLists: { ...prev.taskLists, [listId]: prevList } }));
        throw err;
      }
    },
    createMaestroSession: async (data) => await maestroClient.createSession(data),
    updateMaestroSession: async (sessionId, updates) => await maestroClient.updateSession(sessionId, updates),
    deleteMaestroSession: async (sessionId) => { await maestroClient.deleteSession(sessionId); },
    addTaskToSession: async (sessionId, taskId) => { await maestroClient.addTaskToSession(sessionId, taskId); },
    removeTaskFromSession: async (sessionId, taskId) => { await maestroClient.removeTaskFromSession(sessionId, taskId); },

    clearNeedsInput: (maestroSessionId) => {
      const session = get().sessions[maestroSessionId];
      if (!session?.needsInput?.active) return;
      // Optimistically update local state
      set((prev) => {
        const s = prev.sessions[maestroSessionId];
        if (!s) return prev;
        return { sessions: { ...prev.sessions, [maestroSessionId]: { ...s, needsInput: { active: false } } } };
      });
      // PATCH server
      maestroClient.updateSession(maestroSessionId, { needsInput: { active: false } }).catch(() => { /* best-effort server update */ });
    },

    checkAndClearNeedsInputForActiveSession: () => {
      const activeId = useSessionStore.getState().activeId;
      if (!activeId) return;
      const activeLocalSession = useSessionStore.getState().sessions.find((s) => s.id === activeId);
      if (!activeLocalSession?.maestroSessionId) return;
      const maestroSession = get().sessions[activeLocalSession.maestroSessionId];
      if (!maestroSession?.needsInput?.active) return;
      const { activeProjectIdRef } = get();
      if (activeProjectIdRef !== maestroSession.projectId) return;
      get().clearNeedsInput(activeLocalSession.maestroSessionId);
    },

    showAgentModal: (modal) => {
      set((prev) => {
        // Don't add duplicate modals
        if (prev.activeModals.some((m) => m.modalId === modal.modalId)) return prev;
        return { activeModals: [...prev.activeModals, modal] };
      });
    },

    closeAgentModal: (modalId) => {
      set((prev) => ({
        activeModals: prev.activeModals.filter((m) => m.modalId !== modalId),
      }));
    },

    clearCache: () => set({
      tasks: {},
      taskLists: {},
      sessions: {},
      teamMembers: {},
      modelProfiles: {},
      teams: {},
      activeModals: [],
      loading: {},
      errors: {},
      taskOrdering: {},
      sessionOrdering: {},
      taskListOrdering: {},
      workflowTemplates: [],
    }),

    hardRefresh: async (projectId) => {
      get().clearCache();
      if (projectId) {
        await Promise.all([
          get().fetchTasks(projectId),
          get().fetchTaskLists(projectId),
          get().fetchTaskListOrdering(projectId),
          get().fetchSessions(),
          get().fetchTeamMembers(projectId),
          get().fetchTeams(projectId),
        ]);
      }
    },

    fetchTaskOrdering: async (projectId) => {
      try {
        const ordering = await maestroClient.getOrdering(projectId, 'task');
        set((prev) => ({ taskOrdering: { ...prev.taskOrdering, [projectId]: ordering.orderedIds } }));
      } catch {
      }
    },

    fetchSessionOrdering: async (projectId) => {
      try {
        const ordering = await maestroClient.getOrdering(projectId, 'session');
        set((prev) => ({ sessionOrdering: { ...prev.sessionOrdering, [projectId]: ordering.orderedIds } }));
      } catch {
      }
    },

    saveTaskOrdering: async (projectId, orderedIds) => {
      // Optimistic update
      set((prev) => ({ taskOrdering: { ...prev.taskOrdering, [projectId]: orderedIds } }));
      try {
        await maestroClient.saveOrdering(projectId, 'task', orderedIds);
      } catch {
      }
    },

    saveSessionOrdering: async (projectId, orderedIds) => {
      // Optimistic update
      set((prev) => ({ sessionOrdering: { ...prev.sessionOrdering, [projectId]: orderedIds } }));
      try {
        await maestroClient.saveOrdering(projectId, 'session', orderedIds);
      } catch {
      }
    },

    fetchTaskListOrdering: async (projectId) => {
      try {
        const ordering = await maestroClient.getTaskListOrdering(projectId);
        set((prev) => ({ taskListOrdering: { ...prev.taskListOrdering, [projectId]: ordering.orderedIds } }));
      } catch {
      }
    },

    saveTaskListOrdering: async (projectId, orderedIds) => {
      set((prev) => ({ taskListOrdering: { ...prev.taskListOrdering, [projectId]: orderedIds } }));
      try {
        await maestroClient.saveTaskListOrdering(projectId, orderedIds);
      } catch {
      }
    },

    fetchTeamMembers: async (projectId) => {
      const key = `teamMembers:${projectId}`;
      // Ensure activeProjectIdRef is set so WebSocket onopen can use it
      if (!get().activeProjectIdRef) {
        set({ activeProjectIdRef: projectId });
      }
      setLoading(key, true);
      setError(key, null);
      try {
        const teamMembers = await maestroClient.getTeamMembers(projectId);
        set((prev) => {
          // Remove old entries for this project, then add fresh data
          const filtered: Record<string, TeamMember> = {};
          for (const [id, tm] of Object.entries(prev.teamMembers)) {
            if (tm.projectId !== projectId) filtered[id] = tm;
          }
          for (const tm of teamMembers) {
            filtered[tm.id] = tm;
          }
          return { teamMembers: filtered };
        });
      } catch (err) {
        setError(key, err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(key, false);
      }
    },

    createTeamMember: async (data) => {
      const teamMember = await maestroClient.createTeamMember(data);
      set((prev) => ({ teamMembers: { ...prev.teamMembers, [teamMember.id]: teamMember } }));
      return teamMember;
    },

    updateTeamMember: async (id, projectId, updates) => {
      const teamMember = await maestroClient.updateTeamMember(id, projectId, updates);
      set((prev) => ({ teamMembers: { ...prev.teamMembers, [teamMember.id]: teamMember } }));
      return teamMember;
    },

    deleteTeamMember: async (id, projectId) => {
      await maestroClient.deleteTeamMember(id, projectId);
      set((prev) => {
        const { [id]: _, ...teamMembers } = prev.teamMembers;
        return { teamMembers };
      });
    },

    archiveTeamMember: async (id, projectId) => {
      await maestroClient.archiveTeamMember(id, projectId);
      // The server will emit team_member:archived which will update the store
    },

    unarchiveTeamMember: async (id, projectId) => {
      await maestroClient.unarchiveTeamMember(id, projectId);
      // The server will emit team_member:updated which will update the store
    },

    resetDefaultTeamMember: async (id, projectId) => {
      await maestroClient.resetDefaultTeamMember(id, projectId);
      // The server will emit team_member:updated which will update the store
    },

    // ==================== MODEL PROFILES ====================

    fetchModelProfiles: async () => {
      const key = 'modelProfiles';
      setLoading(key, true);
      setError(key, null);
      try {
        const profiles = await maestroClient.getModelProfiles();
        set(() => {
          const next: Record<string, ModelProfile> = {};
          for (const p of profiles) next[p.id] = p;
          return { modelProfiles: next };
        });
      } catch (err) {
        setError(key, err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(key, false);
      }
    },

    createModelProfile: async (data) => {
      const profile = await maestroClient.createModelProfile(data);
      set((prev) => ({ modelProfiles: { ...prev.modelProfiles, [profile.id]: profile } }));
      return profile;
    },

    updateModelProfile: async (id, updates) => {
      const profile = await maestroClient.updateModelProfile(id, updates);
      set((prev) => ({ modelProfiles: { ...prev.modelProfiles, [profile.id]: profile } }));
      return profile;
    },

    deleteModelProfile: async (id) => {
      await maestroClient.deleteModelProfile(id);
      set((prev) => {
        const { [id]: _, ...modelProfiles } = prev.modelProfiles;
        return { modelProfiles };
      });
    },

    setLastUsedTeamMember: (taskId, teamMemberId) => {
      set((prev) => ({
        lastUsedTeamMember: { ...prev.lastUsedTeamMember, [taskId]: teamMemberId },
      }));
      // Debounced localStorage persistence (500ms)
      if (lastUsedTeamMemberSaveTimer) clearTimeout(lastUsedTeamMemberSaveTimer);
      lastUsedTeamMemberSaveTimer = window.setTimeout(() => {
        lastUsedTeamMemberSaveTimer = null;
        try {
          localStorage.setItem(
            'maestro:lastUsedTeamMember',
            JSON.stringify(get().lastUsedTeamMember),
          );
        } catch { /* best-effort */ }
      }, 500);
    },

    // ==================== TEAMS ====================

    fetchTeams: async (projectId) => {
      const key = `teams:${projectId}`;
      setLoading(key, true);
      setError(key, null);
      try {
        const teams = await maestroClient.getTeams(projectId);
        set((prev) => {
          // Remove old entries for this project, then add fresh data
          const filtered: Record<string, Team> = {};
          for (const [id, t] of Object.entries(prev.teams)) {
            if (t.projectId !== projectId) filtered[id] = t;
          }
          for (const t of teams) {
            filtered[t.id] = t;
          }
          return { teams: filtered };
        });
      } catch (err) {
        setError(key, err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(key, false);
      }
    },

    createTeam: async (data) => {
      const team = await maestroClient.createTeam(data);
      set((prev) => ({ teams: { ...prev.teams, [team.id]: team } }));
      return team;
    },

    updateTeam: async (id, projectId, updates) => {
      const team = await maestroClient.updateTeam(id, projectId, updates);
      set((prev) => ({ teams: { ...prev.teams, [team.id]: team } }));
      return team;
    },

    deleteTeam: async (id, projectId) => {
      await maestroClient.deleteTeam(id, projectId);
      set((prev) => {
        const { [id]: _, ...teams } = prev.teams;
        return { teams };
      });
    },

    archiveTeam: async (id, projectId) => {
      await maestroClient.archiveTeam(id, projectId);
    },

    unarchiveTeam: async (id, projectId) => {
      await maestroClient.unarchiveTeam(id, projectId);
    },

    resumeSession: async (sessionId: string) => {
      await maestroClient.resumeSession(sessionId);
    },

    resumeSessionFlow: async (sessionId: string) => {
      set({ resumingSessionId: sessionId });
      try {
        await maestroClient.resumeSession(sessionId);
        const s = get().sessions[sessionId];
        if (s?.archivedAt) void get().setSessionArchived(sessionId, false);
        if (s?.humanCompletedAt) void get().setSessionHumanComplete(sessionId, false);
      } catch (err) {
        console.error('Failed to resume session:', err);
        useUIStore.getState().reportError('Failed to resume session', err);
      } finally {
        set({ resumingSessionId: null });
      }
    },

    updateSessionMode: (sessionId, mode) => {
      set((prev) => {
        const existing = prev.sessions[sessionId];
        if (!existing) return prev;
        return { sessions: { ...prev.sessions, [sessionId]: { ...existing, mode: mode as import('../app/types/maestro').AgentMode } } };
      });
    },

    setSessionHumanComplete: async (sessionId, complete) => {
      const humanCompletedAt = complete ? Date.now() : null;
      const previous = get().sessions[sessionId]?.humanCompletedAt;
      // Guard the optimistic value against in-flight WS full-replaces.
      pendingLifecycle.set(sessionId, { ...pendingLifecycle.get(sessionId), humanCompletedAt });
      set((prev) => {
        const existing = prev.sessions[sessionId];
        if (!existing) return prev;
        return { sessions: { ...prev.sessions, [sessionId]: { ...existing, humanCompletedAt } } };
      });
      try {
        await maestroClient.updateSession(sessionId, { humanCompletedAt });
      } catch (err) {
        // Roll back optimistic update on failure
        set((prev) => {
          const existing = prev.sessions[sessionId];
          if (!existing) return prev;
          return { sessions: { ...prev.sessions, [sessionId]: { ...existing, humanCompletedAt: previous ?? null } } };
        });
      } finally {
        clearPendingLifecycleField(sessionId, 'humanCompletedAt');
      }
    },

    setSessionArchived: async (sessionId, archived) => {
      const archivedAt = archived ? Date.now() : null;
      const previous = get().sessions[sessionId]?.archivedAt;
      // Guard the optimistic value against in-flight WS full-replaces.
      pendingLifecycle.set(sessionId, { ...pendingLifecycle.get(sessionId), archivedAt });
      set((prev) => {
        const existing = prev.sessions[sessionId];
        if (!existing) return prev;
        return { sessions: { ...prev.sessions, [sessionId]: { ...existing, archivedAt } } };
      });
      try {
        await maestroClient.updateSession(sessionId, { archivedAt });
      } catch (err) {
        // Roll back optimistic update on failure
        set((prev) => {
          const existing = prev.sessions[sessionId];
          if (!existing) return prev;
          return { sessions: { ...prev.sessions, [sessionId]: { ...existing, archivedAt: previous ?? null } } };
        });
      } finally {
        clearPendingLifecycleField(sessionId, 'archivedAt');
      }
    },

    fetchWorkflowTemplates: async () => {
      try {
        const templates = await maestroClient.getWorkflowTemplates();
        set({ workflowTemplates: templates });
      } catch (err) {
        // Failed to fetch workflow templates – non-critical, silently ignore
      }
    },

    initWebSocket: () => {
      connectGlobal();
    },
    destroyWebSocket: () => {
      if (globalReconnectTimeout) { clearTimeout(globalReconnectTimeout); globalReconnectTimeout = null; }
      if (globalWs) {
        // Null out handlers before closing so the stale WebSocket cannot:
        // 1. Process any in-flight messages (onmessage → write_to_session)
        // 2. Schedule a spurious reconnect when its close handshake completes (onclose)
        globalWs.onmessage = null;
        globalWs.onclose = null;
        globalWs.close();
        globalWs = null;
      }
      globalConnecting = false;
    },
  };
});
