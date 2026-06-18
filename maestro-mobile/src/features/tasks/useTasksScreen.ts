// TasksScreen view-model (Forge, Stream A · read-only). Groups the project's OPEN
// tasks into status sections (live via useOpenTasks), exposes direct-subtask
// counts (from the full project task list), loading + a pull-to-refresh re-fetch.
import { useCallback, useMemo } from 'react';

import { asProjectId, type Task, type TaskStatus } from '@/domain';
import { fetchTaskOrdering, fetchTasks, useLoading, useOpenTasks, useProjectTasks, useUiStore } from '@/state';

export interface TaskSection {
  key: TaskStatus;
  label: string;
  tasks: Task[];
}

const SECTION_ORDER: TaskStatus[] = ['in_progress', 'in_review', 'blocked', 'todo'];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  blocked: 'Blocked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  archived: 'Archived',
};

export interface TasksScreenModel {
  hasProject: boolean;
  sections: TaskSection[];
  /** Direct-subtask count for a task id (whole project, not just open tasks). */
  childCountOf: (id: string) => number;
  /** Direct subtasks for a task id (rendered nested when a tile is expanded). */
  childrenOf: (id: string) => Task[];
  loading: boolean;
  refresh: () => void;
}

export function useTasksScreen(): TasksScreenModel {
  const projectId = useUiStore((s) => s.activeProjectId);
  const pid = projectId ?? asProjectId('');
  const open = useOpenTasks(pid);
  const all = useProjectTasks(pid);
  const loading = useLoading(`tasks:${pid}`);

  // Direct children per parent (whole project, minus archived/cancelled noise) so
  // an expanded tile can reveal its real subtasks — including closed ones.
  const childrenByParent = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of all) {
      if (t.parentId && t.status !== 'archived' && t.status !== 'cancelled') {
        const arr = m.get(t.parentId);
        if (arr) arr.push(t);
        else m.set(t.parentId, [t]);
      }
    }
    return m;
  }, [all]);

  const openIds = useMemo(() => new Set(open.map((t) => t.id)), [open]);

  // Top level = open tasks whose parent isn't itself an open task (roots, plus
  // orphans under a closed/missing parent). Subtasks of an open parent render
  // nested under it on expand rather than duplicated as their own top-level row.
  const sections = useMemo<TaskSection[]>(() => {
    const roots = open.filter((t) => !t.parentId || !openIds.has(t.parentId));
    return SECTION_ORDER.map((key) => ({
      key,
      label: TASK_STATUS_LABEL[key],
      tasks: roots.filter((t) => t.status === key),
    })).filter((s) => s.tasks.length > 0);
  }, [open, openIds]);

  const childCountOf = useCallback((id: string) => childrenByParent.get(id)?.length ?? 0, [childrenByParent]);
  const childrenOf = useCallback((id: string) => childrenByParent.get(id) ?? [], [childrenByParent]);

  const refresh = useCallback(() => {
    if (!projectId) return;
    void fetchTasks(projectId);
    void fetchTaskOrdering(projectId);
  }, [projectId]);

  return { hasProject: projectId != null, sections, childCountOf, childrenOf, loading, refresh };
}
