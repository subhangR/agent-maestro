// The reactive hook surface Forge's screens consume — named, render-optimized
// wrappers over the pure select* functions. Atomic-by-id reads (useTask/
// useSession) are reference-stable for untouched entities (the Record + immutable
// -spread payoff); list/object returns go through useShallow so a new array each
// commit doesn't churn renders.
import { useShallow } from 'zustand/react/shallow';
import type {
  Task,
  TaskId,
  Session,
  SessionId,
  TeamMember,
  TeamMemberId,
  Team,
  TeamId,
  Project,
  ProjectId,
  ModelProfile,
  SessionTab,
  UiSessionStatus,
} from '@/domain';
import { useEntityStore } from './entityStore';
import {
  selectSession,
  selectSessionUiStatus,
  selectSessionsByProject,
  selectSessionsByTab,
  selectLiveSessions,
  selectSessionsForTask,
  selectTask,
  selectTasksByProject,
  selectOpenTasks,
  selectTaskTree,
  selectTeamMember,
  selectMembersByProject,
  selectMembersWithLiveCounts,
  selectTeam,
  selectTeamsByProject,
  selectProject,
  selectProjects,
  type TaskTreeNode,
  type MemberWithLiveCount,
} from './selectors';

// ---------------------------------------------------------------------------
// Atomic single-entity reads (reference-stable, no useShallow needed)
// ---------------------------------------------------------------------------

export const useTask = (id: TaskId): Task | undefined => useEntityStore((s) => s.tasks[id]);
export const useSession = (id: SessionId): Session | undefined => useEntityStore((s) => s.sessions[id]);
export const useTeamMember = (id: TeamMemberId): TeamMember | undefined =>
  useEntityStore((s) => s.teamMembers[id]);
export const useTeam = (id: TeamId): Team | undefined => useEntityStore((s) => s.teams[id]);
export const useProject = (id: ProjectId): Project | undefined => useEntityStore((s) => s.projects[id]);

export const useSessionUiStatus = (id: SessionId): UiSessionStatus | undefined =>
  useEntityStore((s) => selectSessionUiStatus(s, id));

// ---------------------------------------------------------------------------
// List reads (useShallow — arrays are rebuilt each commit)
// ---------------------------------------------------------------------------

export const useProjectTasks = (projectId: ProjectId): Task[] =>
  useEntityStore(useShallow((s) => selectTasksByProject(s, projectId)));

export const useOpenTasks = (projectId: ProjectId): Task[] =>
  useEntityStore(useShallow((s) => selectOpenTasks(s, projectId)));

export const useTaskTree = (rootId: TaskId): TaskTreeNode | null =>
  useEntityStore(useShallow((s) => selectTaskTree(s, rootId)));

export const useProjectSessions = (projectId: ProjectId): Session[] =>
  useEntityStore(useShallow((s) => selectSessionsByProject(s, projectId)));

export const useSessionsByTab = (projectId: ProjectId, tab: SessionTab): Session[] =>
  useEntityStore(useShallow((s) => selectSessionsByTab(s, projectId, tab)));

export const useLiveSessions = (projectId: ProjectId): Session[] =>
  useEntityStore(useShallow((s) => selectLiveSessions(s, projectId)));

export const useSessionsForTask = (taskId: string): Session[] =>
  useEntityStore(useShallow((s) => selectSessionsForTask(s, taskId)));

export const useProjectMembers = (projectId: ProjectId): TeamMember[] =>
  useEntityStore(useShallow((s) => selectMembersByProject(s, projectId)));

export const useMembersWithLiveCounts = (projectId: ProjectId): MemberWithLiveCount[] =>
  useEntityStore(useShallow((s) => selectMembersWithLiveCounts(s, projectId)));

export const useProjectTeams = (projectId: ProjectId): Team[] =>
  useEntityStore(useShallow((s) => selectTeamsByProject(s, projectId)));

export const useProjects = (): Project[] => useEntityStore(useShallow((s) => selectProjects(s)));

/** All workspace model profiles, kept reactive as Pulse ingests profile updates. */
export const useModelProfiles = (): ModelProfile[] =>
  useEntityStore(useShallow((s) => Object.values(s.modelProfiles)));

// ---------------------------------------------------------------------------
// Loading / error flags (keyed by operation)
// ---------------------------------------------------------------------------

export const useLoading = (key: string): boolean => useEntityStore((s) => !!s.loading[key]);
export const useError = (key: string): string | undefined => useEntityStore((s) => s.errors[key]);

// ---------------------------------------------------------------------------
// Selector NAMESPACES over the ONE store (per CONVENTIONS §4). These are NOT
// separate stores — just grouped, ergonomic views of entityStore. Forge can also
// compose the pure select* functions directly.
// ---------------------------------------------------------------------------

export const useSessionStore = {
  one: useSession,
  uiStatus: useSessionUiStatus,
  byProject: useProjectSessions,
  byTab: useSessionsByTab,
  live: useLiveSessions,
  forTask: useSessionsForTask,
} as const;

export const useTaskStore = {
  one: useTask,
  byProject: useProjectTasks,
  open: useOpenTasks,
  tree: useTaskTree,
  sessionsForTask: useSessionsForTask,
} as const;

export const useMemberStore = {
  one: useTeamMember,
  byProject: useProjectMembers,
  withLiveCounts: useMembersWithLiveCounts,
} as const;

export const useProjectStore = {
  one: useProject,
  all: useProjects,
  selectFn: selectProject,
} as const;
