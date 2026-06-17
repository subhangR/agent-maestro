// Session selectors — pure functions over EntityState. They CONSUME @/domain/
// derive (toUiSessionStatus, sessionTab) and never re-implement status/tab logic.
import type { Session, SessionId, ProjectId, UiSessionStatus, SessionTab } from '@/domain';
import { toUiSessionStatus, sessionTab } from '@/domain';
import type { EntityState } from '../entityStore';
import { orderedForProject } from './shared';

const LIVE_STATUSES: ReadonlySet<UiSessionStatus> = new Set(['working', 'run', 'wait']);

export function selectSession(state: EntityState, id: SessionId): Session | undefined {
  return state.sessions[id];
}

/** A session's 8-state UI display status (needsInput → wait, working → run, …). */
export function selectSessionUiStatus(state: EntityState, id: SessionId): UiSessionStatus | undefined {
  const session = state.sessions[id];
  return session ? toUiSessionStatus(session) : undefined;
}

/** Sessions for a project, in canonical (sessionOrdering) order. */
export function selectSessionsByProject(state: EntityState, projectId: ProjectId): Session[] {
  return orderedForProject(state.sessions, state.sessionOrdering[projectId], projectId);
}

/** Sessions for a project filtered to a tab (active/completed/archived). */
export function selectSessionsByTab(state: EntityState, projectId: ProjectId, tab: SessionTab): Session[] {
  return selectSessionsByProject(state, projectId).filter((s) => sessionTab(s) === tab);
}

/** Live sessions (display status working/run/wait) for a project. */
export function selectLiveSessions(state: EntityState, projectId: ProjectId): Session[] {
  return selectSessionsByProject(state, projectId).filter((s) => LIVE_STATUSES.has(toUiSessionStatus(s)));
}

/** Sessions attached to a given task. */
export function selectSessionsForTask(state: EntityState, taskId: string): Session[] {
  return Object.values(state.sessions).filter((s) => s.taskIds.includes(taskId));
}

export { LIVE_STATUSES };
