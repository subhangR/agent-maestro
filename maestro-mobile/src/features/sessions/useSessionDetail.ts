// useSessionDetail — the Session-detail view-model. Reads the live entity
// (Ledger's reference-stable useSession) and triggers ONE full re-fetch on mount
// (the list uses `fields: 'summary'`, so timeline[]/docs[] only arrive with the
// detail `fetchSession`). WS `session:updated` keeps the entity fresh afterwards
// — we do NOT poll. Everything the read tabs render (stats / timeline / prompts
// / docs) is derived here from the Session entity; the screen stays presentational.
import { useEffect, useMemo } from 'react';

import { useSession, fetchSession } from '@/state';
import {
  asSessionId,
  toUiSessionStatus,
  displayToolLabel,
  UI_SESSION_STATUS_LABEL,
  type Session,
  type SessionTimelineEvent,
  type SessionTimelineEventType,
  type DocEntry,
  type UiSessionStatus,
} from '@/domain';
import type { GlyphKind } from '@/theme';

import { useScreenStatus, type ScreenStatusResult } from '../_shared';

export type SessionDetailTab = 'stats' | 'timeline' | 'prompts' | 'docs';

export const SESSION_DETAIL_TABS: { key: SessionDetailTab; label: string }[] = [
  { key: 'stats', label: 'Stats' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'docs', label: 'Docs' },
];

/** A key/value line on the Stats tab. */
export interface StatRow {
  label: string;
  value: string;
}

/** A rendered timeline row (glyph + message + time). */
export interface TimelineRow {
  id: string;
  glyph: GlyphKind;
  type: SessionTimelineEventType;
  message: string;
  time: string;
}

// Timeline event type → status glyph (lifecycle shapes from the drawn registry).
const TIMELINE_GLYPH: Record<SessionTimelineEventType, GlyphKind> = {
  session_started: 'spawning',
  session_stopped: 'stopped',
  task_started: 'in_progress',
  task_completed: 'completed',
  task_failed: 'failed',
  task_skipped: 'cancelled',
  task_blocked: 'blocked',
  needs_input: 'needsInput',
  progress: 'working',
  error: 'failed',
  milestone: 'in_review',
  doc_added: 'todo',
  prompt_received: 'todo',
};

const TIMELINE_FALLBACK_LABEL: Record<SessionTimelineEventType, string> = {
  session_started: 'Session started',
  session_stopped: 'Session stopped',
  task_started: 'Task started',
  task_completed: 'Task completed',
  task_failed: 'Task failed',
  task_skipped: 'Task skipped',
  task_blocked: 'Task blocked',
  needs_input: 'Needs input',
  progress: 'Progress',
  error: 'Error',
  milestone: 'Milestone',
  doc_added: 'Doc added',
  prompt_received: 'Prompt received',
};

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(fromMs: number, toMs: number): string {
  const sec = Math.max(0, Math.round((toMs - fromMs) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const day = Math.floor(hr / 24);
  return `${day}d ${hr % 24}h`;
}

function buildStats(session: Session, ui: UiSessionStatus): StatRow[] {
  const snap = session.teamMemberSnapshot;
  const endMs = session.completedAt ?? session.lastActivity;
  const rows: StatRow[] = [
    { label: 'Status', value: UI_SESSION_STATUS_LABEL[ui] },
    { label: 'Agent', value: displayToolLabel(snap?.agentTool ?? null) },
  ];
  if (snap?.role) rows.push({ label: 'Role', value: snap.role });
  if (snap?.model) rows.push({ label: 'Model', value: snap.model });
  rows.push(
    { label: 'Started', value: fmtTime(session.startedAt) },
    { label: 'Last activity', value: fmtTime(session.lastActivity) },
    { label: 'Duration', value: fmtDuration(session.startedAt, endMs) },
    { label: 'Tasks', value: String(session.taskIds.length) },
    { label: 'Docs', value: String(session.docs?.length ?? 0) },
    { label: 'Host', value: session.hostname || '—' },
  );
  if (session.needsInput?.active && session.needsInput.message) {
    rows.push({ label: 'Waiting on', value: session.needsInput.message });
  }
  return rows;
}

function buildTimeline(events: SessionTimelineEvent[]): TimelineRow[] {
  // Newest first.
  return [...events]
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((e) => ({
      id: e.id,
      glyph: TIMELINE_GLYPH[e.type] ?? 'idle',
      type: e.type,
      message: e.message?.trim() || TIMELINE_FALLBACK_LABEL[e.type] || e.type,
      time: fmtTime(e.timestamp),
    }));
}

export interface SessionDetailModel {
  session: Session | undefined;
  ui: UiSessionStatus | undefined;
  statusLabel: string;
  agentLabel: string;
  stats: StatRow[];
  timeline: TimelineRow[];
  /** Timeline entries that are inbound prompts (prompt_received). */
  prompts: TimelineRow[];
  docs: DocEntry[];
  status: ScreenStatusResult;
}

export function useSessionDetail(id: string): SessionDetailModel {
  const session = useSession(asSessionId(id));

  // One full fetch on mount/id-change to hydrate timeline[]/docs[] (the list
  // only loads summary fields). WS updates keep it fresh — no polling.
  useEffect(() => {
    if (id) void fetchSession(id);
  }, [id]);

  const status = useScreenStatus({ loadingKey: `session:${id}`, count: session ? 1 : 0 });

  const model = useMemo(() => {
    if (!session) {
      return {
        ui: undefined as UiSessionStatus | undefined,
        statusLabel: '',
        agentLabel: '',
        stats: [] as StatRow[],
        timeline: [] as TimelineRow[],
        prompts: [] as TimelineRow[],
        docs: [] as DocEntry[],
      };
    }
    const ui = toUiSessionStatus(session);
    const timeline = buildTimeline(session.timeline ?? []);
    return {
      ui,
      statusLabel: UI_SESSION_STATUS_LABEL[ui],
      agentLabel: displayToolLabel(session.teamMemberSnapshot?.agentTool ?? null),
      stats: buildStats(session, ui),
      timeline,
      prompts: timeline.filter((t) => t.type === 'prompt_received'),
      docs: session.docs ?? [],
    };
  }, [session]);

  return { session, ...model, status };
}
