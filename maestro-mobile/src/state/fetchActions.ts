// Typed REST fetch actions. Ledger OWNS these (loading/error/ordering
// bookkeeping); they call Conduit's MaestroClient through the injected
// `MaestroClientApi` seam. Mirrors maestro-ui's store fetch* actions.
//
// Session merge policy (CQ-5): LIST fetches default to fields=summary and pass
// through mergeSummarySession so a thin summary can't clobber a populated
// session already in the map; DETAIL fetches use full and replace. Every
// inbound session also runs applyOverrides so an un-confirmed optimistic edit
// survives a fetch.
import type { Project, Task, TaskList, Session, TeamMember, Team, ModelProfile } from '@/domain';
import {
  asProjectId,
  asTaskId,
  asTaskListId,
  asSessionId,
  asTeamMemberId,
  asTeamId,
  asModelProfileId,
} from '@/domain';
import { useEntityStore, setLoading, setError, type EntityState } from './entityStore';
import { normalizeSession, mergeSummarySession } from './batchSet';
import { applyOverrides } from './optimistic';
import { getMaestroClient, hasMaestroClient } from './client';

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Tasks must always carry an object taskSessionStatuses (never null/undefined). */
function ensureTask(task: Task): Task {
  if (task.taskSessionStatuses && typeof task.taskSessionStatuses === 'object') return task;
  return { ...task, taskSessionStatuses: {} };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function fetchProjects(): Promise<void> {
  const key = 'projects';
  setLoading(key, true);
  setError(key, null);
  try {
    const projects = await getMaestroClient().getProjects();
    useEntityStore.setState((prev) => {
      const next = { ...prev.projects };
      for (const p of projects) next[asProjectId(p.id)] = p;
      return { projects: next };
    });
  } catch (e) {
    setError(key, errMsg(e));
  } finally {
    setLoading(key, false);
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function fetchTasks(projectId: string): Promise<void> {
  const key = `tasks:${projectId}`;
  setLoading(key, true);
  setError(key, null);
  try {
    const tasks = await getMaestroClient().getTasks(projectId);
    useEntityStore.setState((prev) => {
      const next = { ...prev.tasks };
      for (const t of tasks) next[asTaskId(t.id)] = ensureTask(t);
      return { tasks: next };
    });
  } catch (e) {
    setError(key, errMsg(e));
  } finally {
    setLoading(key, false);
  }
}

export async function fetchTask(taskId: string): Promise<void> {
  const key = `task:${taskId}`;
  setLoading(key, true);
  setError(key, null);
  try {
    const task = ensureTask(await getMaestroClient().getTask(taskId));
    useEntityStore.setState((prev) => ({ tasks: { ...prev.tasks, [asTaskId(task.id)]: task } }));
  } catch (e) {
    setError(key, errMsg(e));
  } finally {
    setLoading(key, false);
  }
}

// ---------------------------------------------------------------------------
// Task lists (+ ordering bootstrap)
// ---------------------------------------------------------------------------

export async function fetchTaskLists(projectId: string): Promise<void> {
  const key = `taskLists:${projectId}`;
  setLoading(key, true);
  setError(key, null);
  try {
    const lists = await getMaestroClient().getTaskLists(projectId);
    const pid = asProjectId(projectId);
    useEntityStore.setState((prev) => {
      // Drop stale lists for this project, then add fresh.
      const taskLists: EntityState['taskLists'] = {};
      for (const [id, list] of Object.entries(prev.taskLists)) {
        if (list.projectId !== projectId) taskLists[asTaskListId(id)] = list;
      }
      for (const list of lists) taskLists[asTaskListId(list.id)] = list;
      const existing = prev.taskListOrdering[pid];
      const listIds = lists.map((l) => asTaskListId(l.id));
      const ordering =
        !existing || existing.length === 0
          ? listIds
          : [
              ...existing.filter((id) => listIds.includes(id)),
              ...listIds.filter((id) => !existing.includes(id)),
            ];
      return { taskLists, taskListOrdering: { ...prev.taskListOrdering, [pid]: ordering } };
    });
  } catch (e) {
    setError(key, errMsg(e));
  } finally {
    setLoading(key, false);
  }
}

export async function fetchTaskList(listId: string): Promise<void> {
  const key = `taskList:${listId}`;
  setLoading(key, true);
  setError(key, null);
  try {
    const list = await getMaestroClient().getTaskList(listId);
    useEntityStore.setState((prev) => ({
      taskLists: { ...prev.taskLists, [asTaskListId(list.id)]: list },
    }));
  } catch (e) {
    setError(key, errMsg(e));
  } finally {
    setLoading(key, false);
  }
}

// ---------------------------------------------------------------------------
// Sessions — list (summary + merge-guard) vs detail (full + replace)
// ---------------------------------------------------------------------------

function upsertSession(prev: EntityState, raw: Session, isSummary: boolean): EntityState['sessions'] {
  const id = asSessionId(raw.id);
  const normalized = normalizeSession(raw);
  const existing = prev.sessions[id];
  const merged = isSummary ? mergeSummarySession(existing, normalized) : normalized;
  return { ...prev.sessions, [id]: applyOverrides('sessions', raw.id, merged) };
}

export async function fetchSessions(opts: { projectId?: string; taskId?: string } = {}): Promise<void> {
  const key = opts.taskId ? `sessions:task:${opts.taskId}` : 'sessions';
  setLoading(key, true);
  setError(key, null);
  try {
    const sessions = await getMaestroClient().getSessions({ ...opts, fields: 'summary' });
    useEntityStore.setState((prev) => {
      let map = prev.sessions;
      for (const s of sessions) map = upsertSession({ ...prev, sessions: map }, s, true);
      return { sessions: map };
    });
  } catch (e) {
    setError(key, errMsg(e));
  } finally {
    setLoading(key, false);
  }
}

export async function fetchSession(sessionId: string): Promise<void> {
  const key = `session:${sessionId}`;
  setLoading(key, true);
  setError(key, null);
  try {
    const session = await getMaestroClient().getSession(sessionId);
    useEntityStore.setState((prev) => ({ sessions: upsertSession(prev, session, false) }));
  } catch (e) {
    setError(key, errMsg(e));
  } finally {
    setLoading(key, false);
  }
}

// ---------------------------------------------------------------------------
// Team members / teams (teams are REST-poll only — never broadcast over WS)
// ---------------------------------------------------------------------------

export async function fetchTeamMembers(projectId: string): Promise<void> {
  const key = `teamMembers:${projectId}`;
  setLoading(key, true);
  setError(key, null);
  try {
    const members = await getMaestroClient().getTeamMembers(projectId);
    useEntityStore.setState((prev) => {
      const filtered: EntityState['teamMembers'] = {};
      for (const [id, tm] of Object.entries(prev.teamMembers)) {
        if (tm.projectId !== projectId) filtered[asTeamMemberId(id)] = tm;
      }
      for (const tm of members) filtered[asTeamMemberId(tm.id)] = tm;
      return { teamMembers: filtered };
    });
  } catch (e) {
    setError(key, errMsg(e));
  } finally {
    setLoading(key, false);
  }
}

export async function fetchTeams(projectId: string): Promise<void> {
  const key = `teams:${projectId}`;
  setLoading(key, true);
  setError(key, null);
  try {
    const teams = await getMaestroClient().getTeams(projectId);
    useEntityStore.setState((prev) => {
      const filtered: EntityState['teams'] = {};
      for (const [id, t] of Object.entries(prev.teams)) {
        if (t.projectId !== projectId) filtered[asTeamId(id)] = t;
      }
      for (const t of teams) filtered[asTeamId(t.id)] = t;
      return { teams: filtered };
    });
  } catch (e) {
    setError(key, errMsg(e));
  } finally {
    setLoading(key, false);
  }
}

// ---------------------------------------------------------------------------
// Model profiles (workspace-global)
// ---------------------------------------------------------------------------

export async function fetchModelProfiles(): Promise<void> {
  const key = 'modelProfiles';
  setLoading(key, true);
  setError(key, null);
  try {
    const profiles = await getMaestroClient().getModelProfiles();
    const next: EntityState['modelProfiles'] = {};
    for (const p of profiles) next[asModelProfileId(p.id)] = p;
    useEntityStore.setState({ modelProfiles: next });
  } catch (e) {
    setError(key, errMsg(e));
  } finally {
    setLoading(key, false);
  }
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export async function fetchTaskOrdering(projectId: string): Promise<void> {
  try {
    const ordering = await getMaestroClient().getOrdering(projectId, 'task');
    useEntityStore.setState((prev) => ({
      taskOrdering: { ...prev.taskOrdering, [asProjectId(projectId)]: ordering.orderedIds.map(asTaskId) },
    }));
  } catch {
    /* ordering is best-effort */
  }
}

export async function fetchSessionOrdering(projectId: string): Promise<void> {
  try {
    const ordering = await getMaestroClient().getOrdering(projectId, 'session');
    useEntityStore.setState((prev) => ({
      sessionOrdering: { ...prev.sessionOrdering, [asProjectId(projectId)]: ordering.orderedIds.map(asSessionId) },
    }));
  } catch {
    /* best-effort */
  }
}

export async function fetchTaskListOrdering(projectId: string): Promise<void> {
  try {
    const ordering = await getMaestroClient().getTaskListOrdering(projectId);
    useEntityStore.setState((prev) => ({
      taskListOrdering: { ...prev.taskListOrdering, [asProjectId(projectId)]: ordering.orderedIds.map(asTaskListId) },
    }));
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// resyncProject — the WS onopen handshake. Pulse calls this (via ingest's
// resyncProject re-export) on every socket open; re-fetches the active project's
// entities so a reconnect is authoritative. Mirrors useMaestroStore onopen.
// ---------------------------------------------------------------------------

export async function resyncProject(projectId: string | null): Promise<void> {
  if (!projectId || !hasMaestroClient()) return;
  await Promise.all([
    fetchModelProfiles(),
    fetchTasks(projectId),
    fetchSessions({ projectId }),
    fetchTeamMembers(projectId),
    fetchTeams(projectId),
    fetchTaskLists(projectId),
    fetchTaskOrdering(projectId),
    fetchSessionOrdering(projectId),
    fetchTaskListOrdering(projectId),
  ]);
}
