// Task selectors — pure functions over EntityState.
import type { Task, TaskId, ProjectId, TaskStatus } from '@/domain';
import type { EntityState } from '../entityStore';
import { orderedForProject } from './shared';

/** Task statuses considered "closed" (hidden from open/active lists). */
const CLOSED_STATUSES: ReadonlySet<TaskStatus> = new Set(['completed', 'cancelled', 'archived']);

export function selectTask(state: EntityState, id: TaskId): Task | undefined {
  return state.tasks[id];
}

/** Tasks for a project, in canonical (taskOrdering) order. */
export function selectTasksByProject(state: EntityState, projectId: ProjectId): Task[] {
  return orderedForProject(state.tasks, state.taskOrdering[projectId], projectId);
}

/** Open (non-closed) tasks for a project, ordered. */
export function selectOpenTasks(state: EntityState, projectId: ProjectId): Task[] {
  return selectTasksByProject(state, projectId).filter((t) => !CLOSED_STATUSES.has(t.status));
}

/** Direct children of a task (by parentId). */
export function selectChildTasks(state: EntityState, parentId: string): Task[] {
  return Object.values(state.tasks).filter((t) => t.parentId === parentId);
}

export interface TaskTreeNode {
  task: Task;
  children: TaskTreeNode[];
}

/**
 * Hierarchical task tree rooted at `rootId` (parentId links). Cycle-safe via a
 * visited set. Returns null if the root isn't in the store.
 */
export function selectTaskTree(state: EntityState, rootId: TaskId): TaskTreeNode | null {
  const root = state.tasks[rootId];
  if (!root) return null;

  // Index children by parentId once for O(n) tree build.
  const childrenByParent = new Map<string, Task[]>();
  for (const task of Object.values(state.tasks)) {
    if (task.parentId == null) continue;
    const bucket = childrenByParent.get(task.parentId);
    if (bucket) bucket.push(task);
    else childrenByParent.set(task.parentId, [task]);
  }

  const visited = new Set<string>();
  const build = (task: Task): TaskTreeNode => {
    visited.add(task.id);
    const kids = (childrenByParent.get(task.id) ?? []).filter((c) => !visited.has(c.id));
    return { task, children: kids.map(build) };
  };
  return build(root);
}
