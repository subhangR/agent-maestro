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
  loading: boolean;
  refresh: () => void;
}

export function useTasksScreen(): TasksScreenModel {
  const projectId = useUiStore((s) => s.activeProjectId);
  const pid = projectId ?? asProjectId('');
  const open = useOpenTasks(pid);
  const all = useProjectTasks(pid);
  const loading = useLoading(`tasks:${pid}`);

  const childCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of all) {
      if (t.parentId) m.set(t.parentId, (m.get(t.parentId) ?? 0) + 1);
    }
    return m;
  }, [all]);

  const sections = useMemo<TaskSection[]>(() => {
    return SECTION_ORDER.map((key) => ({
      key,
      label: TASK_STATUS_LABEL[key],
      tasks: open.filter((t) => t.status === key),
    })).filter((s) => s.tasks.length > 0);
  }, [open]);

  const childCountOf = useCallback((id: string) => childCounts.get(id) ?? 0, [childCounts]);

  const refresh = useCallback(() => {
    if (!projectId) return;
    void fetchTasks(projectId);
    void fetchTaskOrdering(projectId);
  }, [projectId]);

  return { hasProject: projectId != null, sections, childCountOf, loading, refresh };
}
