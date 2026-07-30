import React from "react";
import type { WorkerStrategy, OrchestratorStrategy } from "../../app/types/maestro";

interface StrategyBadgeProps {
  strategy: WorkerStrategy | undefined;
  orchestratorStrategy?: OrchestratorStrategy;
  queuePosition?: number;
  queueTotal?: number;
  compact?: boolean;
}

export function StrategyBadge({
  strategy,
  orchestratorStrategy,
  queuePosition,
  queueTotal,
  compact = false,
}: StrategyBadgeProps) {
  if (!strategy && !orchestratorStrategy) return null;

  const isTree = strategy === "tree";
  const hasQueueInfo = isTree && queuePosition !== undefined && queueTotal !== undefined;

  const titleText = isTree
    ? `Tree strategy: works through task tree${hasQueueInfo ? ` (${queuePosition}/${queueTotal})` : ""}`
    : "Simple strategy: sequential task processing";

  const label = isTree
    ? (compact
        ? (hasQueueInfo ? `T:${queuePosition}/${queueTotal}` : "T")
        : (hasQueueInfo ? `TREE: ${queuePosition}/${queueTotal}` : "TREE"))
    : (compact ? "S" : "SIMPLE");

  return (
    <>
      <span
        className={`strategyBadge strategyBadge--${strategy || "simple"} ${compact ? "strategyBadge--compact" : ""}`}
        title={titleText}
      >
        {label}
      </span>
      {orchestratorStrategy && (
        <OrchestratorStrategyBadge
          orchestratorStrategy={orchestratorStrategy}
          compact={compact}
        />
      )}
    </>
  );
}

// Orchestrator strategy badge
interface OrchestratorStrategyBadgeProps {
  orchestratorStrategy: OrchestratorStrategy;
  compact?: boolean;
}

const ORCHESTRATOR_STRATEGY_LABELS: Record<OrchestratorStrategy, string> = {
  default: "DEFAULT",
  "intelligent-batching": "BATCHING",
  dag: "DAG",
};

const ORCHESTRATOR_STRATEGY_LABELS_COMPACT: Record<OrchestratorStrategy, string> = {
  default: "D",
  "intelligent-batching": "B",
  dag: "G",
};

const ORCHESTRATOR_STRATEGY_TITLES: Record<OrchestratorStrategy, string> = {
  default: "Default orchestrator: full autonomy to analyze, decompose, and delegate",
  "intelligent-batching": "Intelligent batching: groups related tasks for parallel execution",
  dag: "DAG: directed acyclic graph execution with topological ordering",
};

export function OrchestratorStrategyBadge({
  orchestratorStrategy,
  compact = false,
}: OrchestratorStrategyBadgeProps) {
  return (
    <span
      className={`strategyBadge strategyBadge--orchestrator strategyBadge--orchestrator-${orchestratorStrategy} ${compact ? "strategyBadge--compact" : ""}`}
      title={ORCHESTRATOR_STRATEGY_TITLES[orchestratorStrategy]}
    >
      {compact
        ? ORCHESTRATOR_STRATEGY_LABELS_COMPACT[orchestratorStrategy]
        : ORCHESTRATOR_STRATEGY_LABELS[orchestratorStrategy]}
    </span>
  );
}

// Queue item status badge
export type QueueItemStatus = "queued" | "processing" | "completed" | "failed" | "skipped";

interface QueueItemStatusBadgeProps {
  status: QueueItemStatus;
  compact?: boolean;
}

const QUEUE_STATUS_SYMBOLS: Record<QueueItemStatus, string> = {
  queued: "○",
  processing: "◉",
  completed: "✓",
  failed: "✗",
  skipped: "⊘",
};

const QUEUE_STATUS_LABELS: Record<QueueItemStatus, string> = {
  queued: "QUEUED",
  processing: "PROCESSING",
  completed: "COMPLETED",
  failed: "FAILED",
  skipped: "SKIPPED",
};

export function QueueItemStatusBadge({ status, compact = false }: QueueItemStatusBadgeProps) {
  return (
    <span
      className={`queueItemStatusBadge queueItemStatusBadge--${status} ${compact ? "queueItemStatusBadge--compact" : ""}`}
      title={QUEUE_STATUS_LABELS[status]}
    >
      <span className="queueItemStatusSymbol">{QUEUE_STATUS_SYMBOLS[status]}</span>
      {!compact && <span className="queueItemStatusLabel">{QUEUE_STATUS_LABELS[status]}</span>}
    </span>
  );
}

// Priority badge component
export type TaskPriority = "low" | "medium" | "high";

interface PriorityBadgeProps {
  priority: TaskPriority;
  compact?: boolean;
}

const PRIORITY_SYMBOLS: Record<TaskPriority, string> = {
  low: "●",
  medium: "●",
  high: "●",
};

import { TASK_PRIORITY_LABELS as PRIORITY_LABELS } from "../../app/constants/labels";

export function PriorityBadge({ priority, compact = false }: PriorityBadgeProps) {
  return (
    <span
      className={`priorityBadge priorityBadge--${priority} ${compact ? "priorityBadge--compact" : ""}`}
      title={`Priority: ${priority}`}
    >
      {compact ? (
        PRIORITY_SYMBOLS[priority]
      ) : (
        PRIORITY_LABELS[priority]
      )}
    </span>
  );
}
