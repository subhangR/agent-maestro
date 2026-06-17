// TaskDetailScreen view-model (Forge, Stream A · read-only). Reads the task by id
// (atomic, reference-stable), its subtask tree, and the sessions linked to it —
// all live from the store. Triggers a one-shot detail re-fetch on id change so a
// deep-linked task hydrates even if the list was never opened.
import { useEffect } from 'react';

import { fetchTask, useLoading, useSessionsForTask, useTask, useTaskTree } from '@/state';
import { asTaskId, type Session, type Task } from '@/domain';
import type { TaskTreeNode } from '@/state';

export interface TaskDetailModel {
  task: Task | undefined;
  tree: TaskTreeNode | null;
  sessions: Session[];
  loading: boolean;
}

export function useTaskDetail(id: string): TaskDetailModel {
  const tid = asTaskId(id);
  const task = useTask(tid);
  const tree = useTaskTree(tid);
  const sessions = useSessionsForTask(id);
  const loading = useLoading(`task:${id}`);

  useEffect(() => {
    if (id) void fetchTask(id);
  }, [id]);

  return { task, tree, sessions, loading };
}
