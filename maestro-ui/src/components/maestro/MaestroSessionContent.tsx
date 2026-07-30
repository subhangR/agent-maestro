import React, { useState, useMemo } from "react";
import type { MaestroSession, MaestroTask } from "../../app/types/maestro";
import { StrategyBadge } from "./StrategyBadge";
import { SessionTimeline } from "./SessionTimeline";
import { SessionDetailsSection } from "./SessionDetailsSection";
import { SessionLiveIndicator } from "./SessionLiveIndicator";
import { QueueStatusDisplay, type QueueState } from "./QueueStatusDisplay";

interface MaestroSessionContentProps {
  session: MaestroSession;
  tasks: MaestroTask[];
  allTasks: Record<string, MaestroTask>;
  queueState?: QueueState;
  loading?: boolean;
  onJumpToTask?: (taskId: string) => void;
}

// Task status symbols
const TASK_STATUS_SYMBOLS: Record<string, string> = {
  todo: "○",
  in_progress: "◉",
  completed: "✓",
  cancelled: "⊘",
  blocked: "✗",
};

import { TASK_STATUS_LABELS } from "../../app/constants/labels";

interface TaskTreeNode {
  task: MaestroTask;
  children: TaskTreeNode[];
}

function buildFullTaskTree(tasks: MaestroTask[]): TaskTreeNode[] {
  const taskMap = new Map<string, MaestroTask>();
  tasks.forEach(t => taskMap.set(t.id, t));

  const nodeMap = new Map<string, TaskTreeNode>();
  tasks.forEach(t => nodeMap.set(t.id, { task: t, children: [] }));

  const roots: TaskTreeNode[] = [];
  tasks.forEach(t => {
    const node = nodeMap.get(t.id)!;
    if (t.parentId && nodeMap.has(t.parentId)) {
      nodeMap.get(t.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

const TreeTaskNodeContent = React.memo(function TreeTaskNodeContent({
  node,
  isLast,
  prefix,
  onJumpToTask,
}: {
  node: TaskTreeNode;
  isLast: boolean;
  prefix: string;
  onJumpToTask?: (taskId: string) => void;
}) {
  const { task, children } = node;
  const connector = prefix === "" ? "" : (isLast ? "\u2514\u2500 " : "\u251C\u2500 ");
  const childPrefix = prefix === "" ? "" : (prefix + (isLast ? "   " : "\u2502  "));

  return (
    <>
      <div
        className={`maestroSessionContentTask maestroSessionContentTask--${task.status}`}
        onClick={() => onJumpToTask?.(task.id)}
      >
        <span className="maestroSessionContentSubtaskPrefix">{prefix}{connector}</span>
        <span className={`maestroSessionContentTaskStatus maestroSessionContentTaskStatus--${task.status}`}>
          {TASK_STATUS_SYMBOLS[task.status] || "\u25CB"}
        </span>
        <span className="maestroSessionContentTaskTitle" title={task.title}>
          {task.title}
        </span>
        <span className={`maestroSessionContentTaskPriority maestroSessionContentTaskPriority--${task.priority}`}>
          {task.priority.toUpperCase()}
        </span>
        {onJumpToTask && (
          <button type="button"
            className="maestroSessionContentTaskJump"
            onClick={(e) => {
              e.stopPropagation();
              onJumpToTask(task.id);
            }}
            title="View task"
          >
            {"\u2192"}
          </button>
        )}
      </div>
      {children.map((child, i) => (
        <TreeTaskNodeContent
          key={child.task.id}
          node={child}
          isLast={i === children.length - 1}
          prefix={childPrefix}
          onJumpToTask={onJumpToTask}
        />
      ))}
    </>
  );
});

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

type SessionTab = 'tasks' | 'timeline' | 'details';

export const MaestroSessionContent = React.memo(function MaestroSessionContent({
  session,
  tasks,
  allTasks,
  queueState,
  loading = false,
  onJumpToTask,
}: MaestroSessionContentProps) {
  const [activeTab, setActiveTab] = useState<SessionTab>('tasks');

  const isTree = session.strategy === "tree";
  const hasTimeline = session.timeline && session.timeline.length > 0;
  const timelineCount = session.timeline?.length || 0;

  // Get tasks with their subtasks
  const taskTree = useMemo(() => {
    const rootTasks = tasks.filter(
      (t) => !t.parentId || !tasks.some((p) => p.id === t.parentId)
    );
    return rootTasks.map((task) => ({
      task,
      subtasks: Object.values(allTasks).filter((t) => t.parentId === task.id),
    }));
  }, [tasks, allTasks]);

  // Create tasks record for QueueStatusDisplay
  const tasksMap = useMemo(() => {
    const record: Record<string, MaestroTask> = {};
    for (const t of tasks) record[t.id] = t;
    return record;
  }, [tasks]);

  if (loading) {
    return (
      <div className="maestroSessionContent maestroSessionContent--loading">
        <div className="maestroSessionContentLoading">Loading session data...</div>
      </div>
    );
  }

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const isFinished = session.status === 'completed' || session.status === 'stopped' || session.status === 'failed';
  const finishTime = session.completedAt ?? session.lastActivity;

  return (
    <div className="maestroSessionContent" onClick={(e) => e.stopPropagation()}>
      {/* Natural language completion banner — shown when terminal job ends */}
      {isFinished && (
        <div className={`maestroSessionCompletionBanner maestroSessionCompletionBanner--${session.status}`}>
          <span className="maestroSessionCompletionIcon" aria-hidden="true">
            {session.status === 'completed' ? '✓' : session.status === 'failed' ? '✗' : '◾'}
          </span>
          <div className="maestroSessionCompletionBody">
            <span className="maestroSessionCompletionTitle">
              {session.status === 'completed'
                ? 'Session finished successfully'
                : session.status === 'failed'
                  ? 'Session ended with errors'
                  : 'Session stopped'}
            </span>
            <span className="maestroSessionCompletionMeta">
              {formatTimeAgo(finishTime)}
              {tasks.length > 0 && ` · ${completedCount} of ${tasks.length} task${tasks.length === 1 ? '' : 's'} completed`}
            </span>
          </div>
        </div>
      )}

      {/* Session Info Header */}
      <div className="maestroSessionContentHeader">
        <StrategyBadge
          strategy={session.strategy}
          orchestratorStrategy={session.orchestratorStrategy}
          queuePosition={queueState?.currentIndex !== undefined ? queueState.currentIndex + 1 : undefined}
          queueTotal={queueState?.items?.length}
        />
        <SessionLiveIndicator
          maestroSessionId={session.id}
          status={session.status}
          needsInput={session.needsInput?.active}
        />
        <span className="maestroSessionContentActivity">
          Last activity: {formatTimeAgo(session.lastActivity)}
        </span>
      </div>

      {/* Tab Navigation */}
      <div className="maestroSessionTabs">
        <button type="button"
          className={`maestroSessionTab ${activeTab === 'tasks' ? 'maestroSessionTab--active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          [Tasks{tasks.length > 0 ? ` (${tasks.length})` : ''}]
        </button>
        <button type="button"
          className={`maestroSessionTab ${activeTab === 'timeline' ? 'maestroSessionTab--active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          [Timeline{timelineCount > 0 ? ` (${timelineCount})` : ''}]
        </button>
        <button type="button"
          className={`maestroSessionTab ${activeTab === 'details' ? 'maestroSessionTab--active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          [Details]
        </button>
      </div>

      {/* Tab Content */}
      <div className="maestroSessionTabContent">
        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className="maestroSessionTabPane">
            {/* Tree queue status for tree strategy sessions */}
            {isTree && queueState && (
              <div className="maestroSessionQueueSection">
                <div className="maestroSessionQueueHeader">Queue Status</div>
                <QueueStatusDisplay
                  queueState={queueState}
                  tasks={tasksMap}
                  onJumpToTask={onJumpToTask}
                  compact
                />
              </div>
            )}

            {/* Tree Progress Header (for tree strategy) */}
            {isTree && tasks.length > 0 && (
              <div className="maestroSessionTreeHeader">
                Tree Progress: {tasks.filter(t => t.status === 'completed').length}/{tasks.length} completed
              </div>
            )}

            {/* Hierarchical Task Tree (for tree strategy) */}
            {isTree && tasks.length > 0 ? (
              <div className="maestroSessionContentTaskList">
                {buildFullTaskTree(tasks).map((root, i, arr) => (
                  <TreeTaskNodeContent
                    key={root.task.id}
                    node={root}
                    isLast={i === arr.length - 1}
                    prefix=""
                    onJumpToTask={onJumpToTask}
                  />
                ))}
              </div>
            ) : null}

            {/* Flat Task List (for non-tree strategies) */}
            {!isTree && (taskTree.length === 0 ? (
              <div className="maestroSessionContentEmpty">No tasks linked to this session</div>
            ) : (
              <div className="maestroSessionContentTaskList">
                {taskTree.map(({ task, subtasks }) => (
                  <div key={task.id} className="maestroSessionContentTaskGroup">
                    <div
                      className={`maestroSessionContentTask maestroSessionContentTask--${task.status}`}
                      onClick={() => onJumpToTask?.(task.id)}
                    >
                      <span className={`maestroSessionContentTaskStatus maestroSessionContentTaskStatus--${task.status}`}>
                        {TASK_STATUS_SYMBOLS[task.status] || "○"}{" "}
                        {TASK_STATUS_LABELS[task.status] || task.status.toUpperCase()}
                      </span>

                      {task.taskSessionStatuses?.[session.id] && (
                        <span className={`maestroSessionContentTaskSessionStatus maestroSessionContentTaskSessionStatus--${task.taskSessionStatuses?.[session.id]}`}>
                          {task.taskSessionStatuses?.[session.id]?.replace("_", " ")}
                        </span>
                      )}

                      <span className="maestroSessionContentTaskTitle" title={task.title}>
                        {task.title}
                      </span>

                      <span className={`maestroSessionContentTaskPriority maestroSessionContentTaskPriority--${task.priority}`}>
                        {task.priority.toUpperCase()}
                      </span>

                      {onJumpToTask && (
                        <button type="button"
                          className="maestroSessionContentTaskJump"
                          onClick={(e) => {
                            e.stopPropagation();
                            onJumpToTask(task.id);
                          }}
                          title="View task"
                        >
                          →
                        </button>
                      )}
                    </div>

                    {/* Subtasks */}
                    {subtasks.length > 0 && (
                      <div className="maestroSessionContentSubtasks">
                        {subtasks.map((subtask) => (
                          <div
                            key={subtask.id}
                            className={`maestroSessionContentTask maestroSessionContentTask--subtask maestroSessionContentTask--${subtask.status}`}
                            onClick={() => onJumpToTask?.(subtask.id)}
                          >
                            <span className="maestroSessionContentSubtaskPrefix">└─</span>
                            <span className={`maestroSessionContentTaskStatus maestroSessionContentTaskStatus--${subtask.status}`}>
                              {TASK_STATUS_SYMBOLS[subtask.status] || "○"}
                            </span>
                            <span className="maestroSessionContentTaskTitle" title={subtask.title}>
                              {subtask.title}
                            </span>
                            {onJumpToTask && (
                              <button type="button"
                                className="maestroSessionContentTaskJump"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onJumpToTask(subtask.id);
                                }}
                                title="View task"
                              >
                                →
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="maestroSessionTabPane">
            {hasTimeline ? (
              <SessionTimeline
                events={session.timeline}
                showFilters
                compact
                maxEvents={15}
              />
            ) : (
              <div className="maestroSessionContentEmpty">No timeline events recorded yet</div>
            )}
          </div>
        )}

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="maestroSessionTabPane">
            <SessionDetailsSection session={session} compact />
          </div>
        )}
      </div>
    </div>
  );
});
