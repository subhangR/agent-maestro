// useSessionsScreen — the Sessions list view-model. Reads the active project
// (uiStore), the per-tab session list (Ledger's useSessionsByTab) and the live
// set (useLiveSessions), then buckets sessions into status sections for the
// list. Pull-to-refresh re-fetches sessions + their ordering through `@/state`'s
// fetch actions. All store reads go through Ledger's useShallow-wrapped hooks —
// this file holds NO bare object selector (the on-device infinite-loop trap).
import { useCallback, useState } from 'react';

import {
  useSessionsByTab,
  useLiveSessions,
  useProjectSessions,
  useUiStore,
  fetchSessions,
  fetchSessionOrdering,
} from '@/state';
import {
  asProjectId,
  toUiSessionStatus,
  type Session,
  type SessionTab,
  type UiSessionStatus,
} from '@/domain';

import { useScreenStatus, type ScreenStatusResult } from '../_shared';

/** A status-labelled group of sessions within the current tab. */
export interface SessionGroup {
  key: UiSessionStatus;
  label: string;
  sessions: Session[];
}

export const SESSION_TABS: { key: SessionTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
];

// Section order within a tab + their labels. `working` is never produced by
// toUiSessionStatus (it maps to `run`) so it is omitted from the order.
const GROUP_ORDER: UiSessionStatus[] = ['wait', 'run', 'spawning', 'idle', 'completed', 'failed', 'stopped'];
const GROUP_LABEL: Record<UiSessionStatus, string> = {
  spawning: 'Spawning',
  idle: 'Idle',
  working: 'Running',
  run: 'Running',
  wait: 'Needs input',
  completed: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
};

/** Bucket sessions by derived UI status, in canonical section order (drop empties). */
function groupByStatus(sessions: Session[]): SessionGroup[] {
  const buckets = new Map<UiSessionStatus, Session[]>();
  for (const s of sessions) {
    const ui = toUiSessionStatus(s);
    const arr = buckets.get(ui);
    if (arr) arr.push(s);
    else buckets.set(ui, [s]);
  }
  const groups: SessionGroup[] = [];
  for (const key of GROUP_ORDER) {
    const arr = buckets.get(key);
    if (arr && arr.length) groups.push({ key, label: GROUP_LABEL[key], sessions: arr });
  }
  return groups;
}

export interface SessionsScreenModel {
  projectId: string | null;
  tab: SessionTab;
  setTab: (tab: SessionTab) => void;
  /** Sessions for the current tab, bucketed into status sections. */
  groups: SessionGroup[];
  /** Total sessions in the current tab. */
  count: number;
  /** Set of session ids that are live (animate the status dot). */
  liveIds: Set<string>;
  /** parentSessionId → number of spawned children (for the tile collapse count). */
  childCounts: Map<string, number>;
  status: ScreenStatusResult;
  refreshing: boolean;
  onRefresh: () => void;
}

export function useSessionsScreen(): SessionsScreenModel {
  const projectId = useUiStore((s) => s.activeProjectId);
  const [tab, setTab] = useState<SessionTab>('active');
  const [refreshing, setRefreshing] = useState(false);

  const pid = asProjectId(projectId ?? '');
  const sessions = useSessionsByTab(pid, tab);
  const live = useLiveSessions(pid);
  const allSessions = useProjectSessions(pid);
  const liveIds = new Set(live.map((s) => s.id));

  const childCounts = new Map<string, number>();
  for (const s of allSessions) {
    if (s.parentSessionId) childCounts.set(s.parentSessionId, (childCounts.get(s.parentSessionId) ?? 0) + 1);
  }

  const groups = groupByStatus(sessions);
  const status = useScreenStatus({ loadingKey: 'sessions', count: sessions.length });

  const onRefresh = useCallback(() => {
    if (!projectId) return;
    setRefreshing(true);
    Promise.all([fetchSessions({ projectId }), fetchSessionOrdering(projectId)]).finally(() =>
      setRefreshing(false),
    );
  }, [projectId]);

  return {
    projectId,
    tab,
    setTab,
    groups,
    count: sessions.length,
    liveIds,
    childCounts,
    status,
    refreshing,
    onRefresh,
  };
}
