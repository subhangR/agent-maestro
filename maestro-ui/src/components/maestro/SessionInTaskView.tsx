import React, { useState, useMemo } from "react";
import type { MaestroSession, MaestroSessionStatus } from "../../app/types/maestro";
import { StrategyBadge } from "./StrategyBadge";
import { SessionTimeline } from "./SessionTimeline";
import { SessionDetailsSection, SessionDetailsSummary } from "./SessionDetailsSection";
import { QueueStatusDisplay, type QueueState } from "./QueueStatusDisplay";
import { WorktreeBadge, getWorktreeInfo } from "./WorktreeBadge";
import { PrChip, getPrInfo } from "./PrChip";

interface SessionInTaskViewProps {
  session: MaestroSession;
  taskId: string;
  queueState?: QueueState;
  tasks?: Record<string, any>;
  onJumpToSession?: (sessionId: string) => void;
  onRemoveFromTask?: (sessionId: string) => void;
}

// Session status symbols and labels
const SESSION_STATUS_SYMBOLS: Record<MaestroSessionStatus, string> = {
  spawning: "◌",
  idle: "○",
  working: "◉",
  completed: "✓",
  failed: "✗",
  stopped: "⊘",
};

import { ACTIVITY_STATUS_LABELS as SESSION_STATUS_LABELS } from "../../app/constants/labels";

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function SessionInTaskView({
  session,
  taskId,
  queueState,
  tasks,
  onJumpToSession,
  onRemoveFromTask,
}: SessionInTaskViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate queue position for this task if queue strategy
  const queuePosition = useMemo(() => {
    if (!queueState) return undefined;
    const index = queueState.items.findIndex((item) => item.taskId === taskId);
    return index >= 0 ? index + 1 : undefined;
  }, [queueState, taskId]);

  // Get this task's status in the queue
  const taskQueueItem = useMemo(() => {
    if (!queueState) return undefined;
    return queueState.items.find((item) => item.taskId === taskId);
  }, [queueState, taskId]);

  // Count other tasks this session is working on
  const otherTasksCount = (session.taskIds?.length ?? 1) - 1;

  // Filter timeline events related to this task
  const timeline = session.timeline ?? [];
  const taskTimelineEvents = useMemo(() => {
    return timeline.filter(
      (event) => event.taskId === taskId || !event.taskId
    );
  }, [timeline, taskId]);

  // Get last activity for this task specifically
  const lastTaskActivity = useMemo(() => {
    const taskEvents = timeline.filter((e) => e.taskId === taskId);
    if (taskEvents.length === 0) return session.lastActivity;
    return Math.max(...taskEvents.map((e) => e.timestamp));
  }, [timeline, taskId, session.lastActivity]);

  const isQueue = session.strategy === "queue";

  return (
    <div
      className={`sessionInTaskView sessionInTaskView--${session.status} ${isExpanded ? "sessionInTaskView--expanded" : ""}`}
    >
      {/* Header Row - Always Visible */}
      <div
        className="sessionInTaskViewHeader"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button type="button" className={`sessionInTaskViewToggle ${isExpanded ? "expanded" : ""}`}>
          {isExpanded ? "▾" : "▸"}
        </button>

        {/* Status Badge */}
        <span className={`sessionInTaskViewStatus sessionInTaskViewStatus--${session.status} ${session.needsInput?.active ? 'sessionInTaskViewStatus--needsInput' : ''}`}>
          {session.needsInput?.active ? '⚠' : (SESSION_STATUS_SYMBOLS[session.status] || '?')} {session.needsInput?.active ? 'Needs Input' : (SESSION_STATUS_LABELS[session.status] || session.status || 'Unknown')}
        </span>

        {/* Session Name */}
        <span className="sessionInTaskViewName">{session.name}</span>

        {/* Worktree branch badge */}
        {(() => {
          const wt = getWorktreeInfo(session);
          return wt ? <WorktreeBadge branch={wt.branch} compact /> : null;
        })()}

        {/* PR link chip */}
        {(() => {
          const pr = getPrInfo(session);
          return pr ? <PrChip url={pr.url} number={pr.number} compact /> : null;
        })()}

        {/* Strategy Badge */}
        <StrategyBadge
          strategy={session.strategy}
          orchestratorStrategy={session.orchestratorStrategy}
          queuePosition={queuePosition}
          queueTotal={queueState?.items.length}
          compact
        />

        {/* Last Activity */}
        <span className="sessionInTaskViewActivity">
          {formatTimeAgo(lastTaskActivity)}
        </span>

        {/* Actions */}
        <div className="sessionInTaskViewActions">
          {onJumpToSession && (
            <button type="button"
              className="sessionInTaskViewJumpBtn"
              onClick={(e) => {
                e.stopPropagation();
                onJumpToSession(session.id);
              }}
              title="Jump to session terminal"
            >
              → Jump
            </button>
          )}
          {onRemoveFromTask && (
            <button type="button"
              className="sessionInTaskViewRemoveBtn"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromTask(session.id);
              }}
              title="Remove session from this task"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Meta Line */}
      <div className="sessionInTaskViewMeta">
        {otherTasksCount > 0 ? (
          <span className="sessionInTaskViewOtherTasks">
            Working on {otherTasksCount} other task{otherTasksCount !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="sessionInTaskViewOtherTasks">
            Working only on this task
          </span>
        )}

        {/* Queue Status for this task */}
        {taskQueueItem && (
          <span className={`sessionInTaskViewQueueStatus sessionInTaskViewQueueStatus--${taskQueueItem.status}`}>
            {taskQueueItem.status === "queued" && `Queued at position ${queuePosition}`}
            {taskQueueItem.status === "processing" && "Currently processing"}
            {taskQueueItem.status === "completed" && "Completed"}
            {taskQueueItem.status === "failed" && `Failed: ${taskQueueItem.failReason || "Unknown error"}`}
            {taskQueueItem.status === "skipped" && `Skipped: ${taskQueueItem.failReason || ""}`}
          </span>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="sessionInTaskViewExpanded">
          {/* Timeline for this task */}
          <SessionTimeline
            events={session.timeline}
            title={`Timeline for This Task (${taskTimelineEvents.length} events)`}
            filterByTask={taskId}
            showFilters
            compact
            maxEvents={10}
          />

          {/* Queue Status (if queue strategy) */}
          {isQueue && queueState && tasks && (
            <QueueStatusDisplay
              queueState={queueState}
              tasks={tasks}
              compact
            />
          )}

          {/* Session Details */}
          <SessionDetailsSection
            session={session}
            compact
            showEnv={false}
          />
        </div>
      )}
    </div>
  );
}

// Status badge component for standalone use
interface SessionStatusBadgeProps {
  status: MaestroSessionStatus;
  compact?: boolean;
}

export function SessionStatusBadge({ status, compact = false }: SessionStatusBadgeProps) {
  return (
    <span
      className={`sessionStatusBadge sessionStatusBadge--${status} ${compact ? "sessionStatusBadge--compact" : ""}`}
      title={SESSION_STATUS_LABELS[status]}
    >
      {SESSION_STATUS_SYMBOLS[status]}
      {!compact && ` ${SESSION_STATUS_LABELS[status]}`}
    </span>
  );
}

export { SESSION_STATUS_SYMBOLS, SESSION_STATUS_LABELS };
