import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../../platform";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useProjectStore } from "../../stores/useProjectStore";
import type {
  MaestroSession,
  MaestroSessionStatus,
  MaestroTask,
  DocEntry,
  SessionTimelineEventType,
  SessionPrompt,
  SessionCommandUsage,
  TaskSessionStatus,
} from "../../app/types/maestro";
import { SessionDetailsSection } from "./SessionDetailsSection";
import { DocViewer } from "./DocViewer";
import { SessionTimeline } from "./SessionTimeline";
import { StrategyBadge } from "./StrategyBadge";
import { StatIcon, type StatIconName } from "./SessionStatsIcons";
import { PromptList } from "./PromptList";
import { maestroClient } from "../../utils/MaestroClient";
import { buildChildrenByParent, collectSubtreeIds } from "../../utils/sessionLifecycle";
import { isCoordinatorRole } from "../../utils/coordinatorRole";
import {
  parseJsonlText,
  calculateMetrics,
  extractTextContent,
  type ParsedMessage,
} from "../../utils/claude-log";
import claudeCodeIcon from "../../assets/claude-code-icon.png";
import codexIcon from "../../assets/openai-codex-icon.png";
import geminiIcon from "../../assets/gemini-logo.png";

// ---------------------------------------------------------------------------
// Transcript stats (parsed locally from the Claude/Codex JSONL via Tauri)
// ---------------------------------------------------------------------------
interface ClaudeLogFile {
  filename: string;
  relativePath?: string;
  modifiedAt: number;
  size: number;
  maestroSessionId?: string | null;
}

type LogProvider = "claude" | "codex";

interface TranscriptStats {
  source: LogProvider;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  assistantMessages: number;
  userMessages: number;
  toolCallCount: number;
  toolUsage: Array<{ name: string; count: number }>;
  models: string[];
  firstMessageAt: number | null;
  lastMessageAt: number | null;
  lastMessages: Array<{
    timestamp: number;
    text: string;
    source: "assistant" | "user";
  }>;
}

function computeTranscriptStats(
  messages: ParsedMessage[],
  source: LogProvider,
  lastN: number,
): TranscriptStats {
  const metrics = calculateMetrics(messages);
  const toolCounts = new Map<string, number>();
  const models = new Set<string>();
  let assistantCount = 0;
  let userCount = 0;
  let toolCallCount = 0;
  let firstTs: number | null = null;
  let lastTs: number | null = null;
  const recent: TranscriptStats["lastMessages"] = [];

  for (const msg of messages) {
    if (msg.model) models.add(msg.model);

    const ts = msg.timestamp instanceof Date ? msg.timestamp.getTime() : 0;
    if (Number.isFinite(ts) && ts > 0) {
      if (firstTs === null || ts < firstTs) firstTs = ts;
      if (lastTs === null || ts > lastTs) lastTs = ts;
    }

    toolCallCount += msg.toolCalls.length;
    for (const call of msg.toolCalls) {
      toolCounts.set(call.name, (toolCounts.get(call.name) ?? 0) + 1);
    }

    const text = extractTextContent(msg).trim();
    if (msg.type === "assistant") {
      assistantCount++;
      if (text) {
        recent.push({ timestamp: ts, text, source: "assistant" });
      }
    } else if (msg.type === "user") {
      // Skip synthetic user messages that only carry tool_result blocks —
      // they're not real prompts.
      const hasToolResult = msg.toolResults.length > 0;
      const hasText = text.length > 0;
      if (hasText && !hasToolResult) {
        userCount++;
        recent.push({ timestamp: ts, text, source: "user" });
      } else if (!hasToolResult) {
        userCount++;
      }
    }
  }

  const toolUsage = Array.from(toolCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    source,
    totalTokens: metrics.totalTokens,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    cacheReadTokens: metrics.cacheReadTokens,
    cacheCreationTokens: metrics.cacheCreationTokens,
    assistantMessages: assistantCount,
    userMessages: userCount,
    toolCallCount,
    toolUsage,
    models: Array.from(models),
    firstMessageAt: firstTs,
    lastMessageAt: lastTs,
    lastMessages: recent.slice(-lastN),
  };
}

async function loadTranscriptStats(
  cwd: string,
  maestroSessionId: string,
  preferred: LogProvider,
  lastN: number,
): Promise<TranscriptStats | null> {
  if (!IS_TAURI) return null;
  const order: LogProvider[] = preferred === "codex" ? ["codex", "claude"] : ["claude", "codex"];
  for (const candidate of order) {
    try {
      const listCommand =
        candidate === "codex" ? "list_codex_session_logs" : "list_claude_session_logs";
      const files = await invoke<ClaudeLogFile[]>(listCommand, { cwd });
      const match = files.find((f) => f.maestroSessionId === maestroSessionId);
      if (!match) continue;
      const filename = match.relativePath ?? match.filename;
      const readCommand =
        candidate === "codex" ? "read_codex_session_log" : "read_claude_session_log";
      const content = await invoke<string>(readCommand, { cwd, filename });
      const parsed = parseJsonlText(content);
      if (parsed.length === 0) return null;
      return computeTranscriptStats(parsed, candidate, lastN);
    } catch {
      // try the next provider
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Design tokens / palettes
// ---------------------------------------------------------------------------

// The 8 categorical agent hues from the design system. A member's hue is a
// stable hash of its name so the same agent always reads the same color.
const AGENT_HUES = [
  "#f5a524", // amber
  "#2dd4bf", // teal
  "#a78bfa", // violet
  "#fb7185", // rose
  "#56b6ff", // sky
  "#a3e635", // lime
  "#ff8a5c", // coral
  "#f472b6", // pink
];

function hueFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AGENT_HUES[h % AGENT_HUES.length];
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// Outcome visual treatment keyed by the variant returned by getSessionOutcome.
interface OutcomeVisual {
  color: string;
  dim: string;
  icon: StatIconName;
}
const OUTCOME_VISUAL: Record<string, OutcomeVisual> = {
  success: { color: "var(--ssv-run)", dim: "var(--ssv-run-dim)", icon: "check-circle" },
  failure: { color: "var(--ssv-block)", dim: "var(--ssv-block-dim)", icon: "x-circle" },
  neutral: { color: "var(--ssv-fg-4)", dim: "var(--ssv-idle-dim)", icon: "stop-circle" },
  "human-done": { color: "var(--ssv-info)", dim: "var(--ssv-info-dim)", icon: "user-check" },
  archived: { color: "var(--ssv-fg-4)", dim: "var(--ssv-idle-dim)", icon: "archive" },
};

// Per-session task status → chip color/icon/label.
interface StatusVisual {
  color: string;
  dim: string;
  icon: StatIconName;
  label: string;
}
const TASK_STATUS_VISUAL: Record<TaskSessionStatus, StatusVisual> = {
  completed: { color: "var(--ssv-run)", dim: "var(--ssv-run-dim)", icon: "check-circle", label: "completed" },
  failed: { color: "var(--ssv-block)", dim: "var(--ssv-block-dim)", icon: "x-circle", label: "failed" },
  working: { color: "var(--ssv-info)", dim: "var(--ssv-info-dim)", icon: "loader", label: "working" },
  queued: { color: "var(--ssv-fg-4)", dim: "var(--ssv-idle-dim)", icon: "circle-dashed", label: "queued" },
  blocked: { color: "var(--ssv-block)", dim: "var(--ssv-block-dim)", icon: "ban", label: "blocked" },
  skipped: { color: "var(--pn-wait)", dim: "var(--pn-wait-soft)", icon: "skip-forward", label: "skipped" },
};

const TIMELINE_SEVERITY: Record<SessionTimelineEventType, "neutral" | "info" | "success" | "warn" | "error"> = {
  session_started: "neutral",
  session_stopped: "neutral",
  task_started: "info",
  task_completed: "success",
  task_failed: "error",
  task_skipped: "neutral",
  task_blocked: "warn",
  needs_input: "warn",
  progress: "info",
  error: "error",
  milestone: "success",
  doc_added: "info",
};

const SEVERITY_COLOR: Record<string, string> = {
  neutral: "var(--ssv-fg-4)",
  info: "var(--ssv-info)",
  success: "var(--ssv-run)",
  warn: "var(--pn-wait)",
  error: "var(--ssv-block)",
};

const TIMELINE_LABEL: Record<SessionTimelineEventType, string> = {
  session_started: "started",
  session_stopped: "stopped",
  task_started: "task started",
  task_completed: "task done",
  task_failed: "task failed",
  task_skipped: "skipped",
  task_blocked: "blocked",
  needs_input: "needs input",
  progress: "progress",
  error: "error",
  milestone: "milestone",
  doc_added: "doc added",
};

const PRIORITY_VISUAL: Record<string, { label: string; bg: string; fg: string }> = {
  urgent: { label: "Urgent", bg: "var(--ssv-block-dim)", fg: "var(--ssv-block)" },
  high: { label: "High", bg: "var(--ssv-block-dim)", fg: "var(--ssv-block)" },
  medium: { label: "Medium", bg: "var(--pn-wait-soft)", fg: "var(--pn-wait)" },
  low: { label: "Low", bg: "var(--ssv-bg-active)", fg: "var(--ssv-fg-3)" },
};

const TOOL_LOGO: Record<string, string> = {
  "claude-code": claudeCodeIcon,
  codex: codexIcon,
  gemini: geminiIcon,
};

const OUTCOME_LABELS: Record<MaestroSessionStatus, string> = {
  spawning: "Spawning",
  idle: "Idle",
  working: "Stopped while Working",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
};

// ---------------------------------------------------------------------------
// Formatting helpers (some exported — used by tests / siblings)
// ---------------------------------------------------------------------------

export function formatStatsDuration(startMs: number, endMs: number | null | undefined): string {
  const end = typeof endMs === "number" && endMs > 0 ? endMs : Date.now();
  const seconds = Math.max(0, Math.floor((end - startMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString();
}

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${date} · ${time}`;
}

function formatTimeShort(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function formatTimeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs|css|scss|html|py|rs|go|java|kt|c|cpp|h|hpp|json|ya?ml|toml|sh|sql|rb|php|swift)$/i;

export function getSessionOutcome(session: MaestroSession): {
  status: MaestroSessionStatus;
  label: string;
  variant: "success" | "failure" | "neutral" | "human-done" | "archived";
} {
  if (session.archivedAt) {
    return { status: session.status, label: "Archived", variant: "archived" };
  }
  if (session.humanCompletedAt) {
    return { status: session.status, label: "Marked Done", variant: "human-done" };
  }
  if (session.status === "failed") {
    return { status: "failed", label: OUTCOME_LABELS.failed, variant: "failure" };
  }
  if (session.status === "completed") {
    return { status: "completed", label: OUTCOME_LABELS.completed, variant: "success" };
  }
  return { status: session.status, label: OUTCOME_LABELS[session.status] ?? session.status, variant: "neutral" };
}

// ---------------------------------------------------------------------------
// Tiny inline markdown (bold + code), paragraph-aware
// ---------------------------------------------------------------------------
function mdInline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={`${keyBase}-b${i}`}>{tok.slice(2, -2)}</strong>);
    else parts.push(<code key={`${keyBase}-c${i}`}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownLite({ text }: { text: string }) {
  const paras = text.split("\n\n");
  return (
    <>
      {paras.map((p, i) => (
        <p key={i}>{mdInline(p, `p${i}`)}</p>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------
function Section({
  label,
  count,
  right,
  children,
}: {
  label: string;
  count?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ssv-sec">
      <div className="ssv-sec-head">
        <span className="ssv-eyebrow">{label}</span>
        <span className="ssv-rule" />
        {count != null && <span className="ssv-count">{count}</span>}
        {right}
      </div>
      {children}
    </section>
  );
}

function StatusChip({ kind }: { kind: TaskSessionStatus }) {
  const v = TASK_STATUS_VISUAL[kind] ?? TASK_STATUS_VISUAL.queued;
  return (
    <span className="ssv-schip" style={{ background: v.dim, color: v.color }}>
      <StatIcon name={v.icon} size={13} />
      {v.label}
    </span>
  );
}

function useCopy(): [string | null, (key: string, value: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    try {
      void navigator.clipboard.writeText(value);
    } catch {
      /* ignore */
    }
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1300);
  };
  return [copied, copy];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface SessionStatsViewProps {
  session: MaestroSession;
}

export function SessionStatsView({ session: rootSession }: SessionStatsViewProps) {
  const tasks = useMaestroStore((s) => s.tasks);
  const allSessions = useMaestroStore((s) => s.sessions);
  const projects = useProjectStore((s) => s.projects);
  const resumeSessionFlow = useMaestroStore((s) => s.resumeSessionFlow);
  const resumingSessionId = useMaestroStore((s) => s.resumingSessionId);
  const setSessionArchived = useMaestroStore((s) => s.setSessionArchived);

  // Sub-session navigation: the displayed session can be a descendant of the
  // root session the pane was opened for.
  const [viewId, setViewId] = useState(rootSession.id);
  useEffect(() => {
    setViewId(rootSession.id);
  }, [rootSession.id]);

  const session: MaestroSession =
    viewId === rootSession.id ? rootSession : allSessions[viewId] ?? rootSession;
  const isViewingChild = session.id !== rootSession.id;

  const [stats, setStats] = useState<TranscriptStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [finalExpanded, setFinalExpanded] = useState(false);
  const [prompts, setPrompts] = useState<SessionPrompt[]>([]);
  const [commandUsage, setCommandUsage] = useState<SessionCommandUsage | null>(null);
  const [lastMsgsOpen, setLastMsgsOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [runConfigOpen, setRunConfigOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [openDoc, setOpenDoc] = useState<DocEntry | null>(null);
  const [copied, copy] = useCopy();

  const metadata = (session.metadata ?? {}) as {
    agentTool?: string;
    skills?: string[];
    worktreePath?: string;
    worktreeBranch?: string;
    permissionMode?: string;
  };
  const agentTool = metadata.agentTool ?? "claude-code";
  const canResume = agentTool === "claude-code";
  const isResuming = resumingSessionId === session.id;
  const isArchived = Boolean(session.archivedAt);

  const handleResumeClick = () => {
    if (!canResume || isResuming) return;
    void resumeSessionFlow(session.id);
  };
  const handleRestoreClick = () => {
    void setSessionArchived(session.id, false);
  };

  const sessionCwd = useMemo(() => {
    const meta = session.metadata as { worktreePath?: string } | undefined;
    if (meta?.worktreePath) return meta.worktreePath;
    const project = projects.find((p) => p.id === session.projectId);
    return project?.workingDir ?? "";
  }, [session.metadata, session.projectId, projects]);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setStatsError(null);
    setFinalExpanded(false);

    if (!sessionCwd) {
      setStatsLoading(false);
      return;
    }

    const meta = session.metadata as { agentTool?: string } | undefined;
    const preferred: LogProvider = meta?.agentTool === "codex" ? "codex" : "claude";

    setStatsLoading(true);
    loadTranscriptStats(sessionCwd, session.id, preferred, 12)
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setStatsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id, session.metadata, sessionCwd]);

  useEffect(() => {
    let cancelled = false;
    setPrompts([]);
    maestroClient
      .getSessionPrompts(session.id)
      .then((res) => {
        if (!cancelled) setPrompts(res);
      })
      .catch(() => {
        // Endpoint may not be available yet (Phase 1A); fail quiet.
        if (!cancelled) setPrompts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  useEffect(() => {
    let cancelled = false;
    setCommandUsage(null);
    maestroClient
      .getSessionCommandUsage(session.id)
      .then((res) => {
        if (!cancelled) setCommandUsage(res);
      })
      .catch(() => {
        // Older servers won't have this endpoint; fail quiet.
        if (!cancelled) setCommandUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  const outcome = getSessionOutcome(session);
  const outcomeVisual = OUTCOME_VISUAL[outcome.variant];

  const timeline = session.timeline ?? [];
  const docs = session.docs ?? [];
  const taskIds = session.taskIds ?? [];

  // Identity / members
  const snapshots = session.teamMemberSnapshots?.length
    ? session.teamMemberSnapshots
    : session.teamMemberSnapshot
      ? [session.teamMemberSnapshot]
      : [];
  const primary = snapshots[0];
  const displayName = primary?.name ?? session.name ?? session.id.slice(0, 12);
  const role = primary?.role;
  const members = snapshots.map((m) => ({
    name: m.name,
    initials: initialsOf(m.name),
    hue: hueFor(m.name),
  }));
  const primaryHue = hueFor(displayName);

  // Final message = the agent's last assistant message
  const finalMessage = useMemo(() => {
    if (!stats) return null;
    for (let i = stats.lastMessages.length - 1; i >= 0; i--) {
      if (stats.lastMessages[i].source === "assistant") return stats.lastMessages[i].text;
    }
    return null;
  }, [stats]);

  const linkedTasks = useMemo(
    () =>
      taskIds
        .map((tid) => tasks[tid])
        .filter((t): t is MaestroTask => t !== undefined),
    [taskIds, tasks],
  );

  // Timeline breakdown
  const timelineBreakdown = useMemo(() => {
    const counts = new Map<SessionTimelineEventType, number>();
    for (const ev of timeline) counts.set(ev.type, (counts.get(ev.type) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [timeline]);

  // Coordinator sub-session rollup
  const isCoordinator = isCoordinatorRole(session.mode);
  const subSessions = useMemo(() => {
    if (!isCoordinator) return [];
    const list = Object.values(allSessions);
    const map = buildChildrenByParent(list);
    const subtree = collectSubtreeIds(session.id, map);
    return subtree
      .filter((id) => id !== session.id)
      .map((id) => allSessions[id])
      .filter((s): s is MaestroSession => s !== undefined);
  }, [isCoordinator, allSessions, session.id]);

  const subtreeCount = subSessions.length;
  const subRollup = useMemo(() => {
    const roll = new Map<string, { count: number; visual: OutcomeVisual; label: string }>();
    for (const child of subSessions) {
      const o = getSessionOutcome(child);
      const entry = roll.get(o.variant) ?? {
        count: 0,
        visual: OUTCOME_VISUAL[o.variant],
        label: o.label,
      };
      entry.count++;
      roll.set(o.variant, entry);
    }
    return Array.from(roll.values());
  }, [subSessions]);

  const isEmptyState = timeline.length === 0 && docs.length === 0 && taskIds.length === 0;

  // Run config rows
  const project = projects.find((p) => p.id === session.projectId);
  const runConfigRows = useMemo(() => {
    const rows: Array<{ k: string; v: string; mono?: boolean }> = [];
    if (metadata.worktreeBranch) rows.push({ k: "Worktree branch", v: metadata.worktreeBranch, mono: true });
    if (metadata.worktreePath) rows.push({ k: "Worktree path", v: metadata.worktreePath, mono: true });
    const permMode = metadata.permissionMode ?? primary?.permissionMode;
    if (permMode) rows.push({ k: "Permission mode", v: permMode, mono: true });
    if (metadata.skills?.length) rows.push({ k: "Skills loaded", v: metadata.skills.join(" · "), mono: true });
    if (session.spawnSource) rows.push({ k: "Spawn source", v: session.spawnSource, mono: true });
    if (project?.name) rows.push({ k: "Project", v: project.name });
    if (project?.workingDir) rows.push({ k: "Working directory", v: project.workingDir, mono: true });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata, primary, session.spawnSource, project]);

  const identityRows = useMemo(() => {
    const rows: Array<{ k: string; v: string; copy?: boolean; mono?: boolean }> = [
      { k: "Maestro session ID", v: session.id, copy: true, mono: true },
    ];
    if (session.claudeSessionId) rows.push({ k: "Claude session ID", v: session.claudeSessionId, copy: true, mono: true });
    rows.push({ k: "Hostname", v: session.hostname, mono: true });
    rows.push({ k: "Platform", v: session.platform, mono: true });
    rows.push({ k: "Started", v: formatDateTime(session.startedAt), mono: true });
    rows.push({ k: "Completed", v: session.completedAt ? formatDateTime(session.completedAt) : "—", mono: true });
    rows.push({ k: "Human-done", v: session.humanCompletedAt ? formatDateTime(session.humanCompletedAt) : "—", mono: true });
    rows.push({ k: "Archived", v: session.archivedAt ? formatDateTime(session.archivedAt) : "—", mono: true });
    return rows;
  }, [session]);

  const tokenSegments = stats
    ? [
        { key: "cacheRead", label: "Cache read", value: stats.cacheReadTokens, color: "var(--ssv-violet)" },
        { key: "input", label: "Input", value: stats.inputTokens, color: "var(--ssv-info)" },
        { key: "cacheCreate", label: "Cache create", value: stats.cacheCreationTokens, color: "var(--ssv-teal)" },
        { key: "output", label: "Output", value: stats.outputTokens, color: "var(--ssv-baton-500)" },
      ]
    : [];

  return (
    <div className="sessionStatsView" data-session-id={session.id}>
      <div className="ssv-wrap">
        {isViewingChild && (
          <button type="button" className="ssv-back" onClick={() => setViewId(rootSession.id)}>
            <StatIcon name="arrow-right" size={13} className="ssv-back-ico" />
            Back to {rootSession.teamMemberSnapshot?.name ?? rootSession.name ?? "parent session"}
          </button>
        )}

        {/* ============================ HERO ============================ */}
        <div className="ssv-hero">
          {/* Identity + final message */}
          <div className="ssv-card ssv-hero-card">
            <div className="ssv-id-row">
              <span className="ssv-av-lg" style={{ background: primaryHue }}>
                {initialsOf(displayName)}
              </span>
              <div className="ssv-id-meta">
                <div className="ssv-id-name">{displayName}</div>
                {role && <div className="ssv-id-role">{role}</div>}
              </div>
            </div>
            {members.length > 1 && (
              <div className="ssv-member-chips">
                {members.slice(0, 4).map((m) => (
                  <span className="ssv-mchip" key={m.name}>
                    <span className="ssv-mchip-dot" style={{ background: m.hue }}>
                      {m.initials}
                    </span>
                    <span className="ssv-mchip-nm">{m.name}</span>
                  </span>
                ))}
                {members.length > 4 && (
                  <span className="ssv-mchip ssv-mchip-more">+{members.length - 4} more</span>
                )}
              </div>
            )}

            {finalMessage ? (
              <div className="ssv-final">
                <div className="ssv-final-label">
                  <StatIcon name="quote" size={12} /> Final message
                </div>
                <div className={`ssv-final-body${finalExpanded ? "" : " clamped"}`}>
                  <MarkdownLite text={finalMessage} />
                </div>
                <button
                  type="button"
                  className="ssv-final-expand"
                  onClick={() => setFinalExpanded((v) => !v)}
                >
                  {finalExpanded ? "Collapse" : "Read full message"}
                  <StatIcon name={finalExpanded ? "chevron-up" : "chevron-down"} size={14} />
                </button>
              </div>
            ) : (
              statsLoading && <div className="ssv-final-loading">Loading transcript…</div>
            )}
          </div>

          {/* Outcome panel */}
          <div className="ssv-card ssv-outcome-card">
            <div className="ssv-outcome-badge">
              <div
                className="ssv-outcome-ring"
                style={{ background: outcomeVisual.dim, border: `1px solid ${outcomeVisual.color}` }}
              >
                <StatIcon name={outcomeVisual.icon} size={26} color={outcomeVisual.color} />
              </div>
              <div className="ssv-outcome-text">
                <div className="ssv-outcome-big" style={{ color: outcomeVisual.color }}>
                  {outcome.label}
                </div>
                <div className="ssv-outcome-sub">
                  {formatStatsDuration(session.startedAt, session.completedAt)} ·{" "}
                  {formatTimeShort(session.startedAt)}
                </div>
              </div>
            </div>

            <div className="ssv-stat-grid">
              <div className="ssv-stat-line">
                <span className="ssv-stat-k">Duration</span>
                <span className="ssv-stat-v mono">
                  {formatStatsDuration(session.startedAt, session.completedAt)}
                </span>
              </div>
              <div className="ssv-stat-line">
                <span className="ssv-stat-k">Started</span>
                <span className="ssv-stat-v mono">{formatDateTime(session.startedAt)}</span>
              </div>
              <div className="ssv-stat-line">
                <span className="ssv-stat-k">Completed</span>
                <span className="ssv-stat-v mono">
                  {session.completedAt ? formatDateTime(session.completedAt) : "—"}
                </span>
              </div>
            </div>

            <div className="ssv-chip-row">
              <span className="ssv-meta-chip">
                {TOOL_LOGO[agentTool] && <img src={TOOL_LOGO[agentTool]} alt="" />}
                {agentTool}
              </span>
              {session.model && (
                <span className="ssv-meta-chip">
                  <span className="ssv-meta-chip-lbl">model</span> {String(session.model)}
                </span>
              )}
              {session.mode && (
                <span className="ssv-meta-chip">
                  <span className="ssv-meta-chip-lbl">mode</span> {session.mode}
                </span>
              )}
              <StrategyBadge
                strategy={session.strategy}
                orchestratorStrategy={session.orchestratorStrategy}
                compact
              />
            </div>

            <div className="ssv-action-row">
              {isArchived && (
                <button
                  type="button"
                  className="ssv-btn ssv-btn-secondary"
                  onClick={handleRestoreClick}
                  title="Restore — move this session back to Open"
                >
                  <StatIcon name="rotate-ccw" size={15} /> Restore
                </button>
              )}
              <button
                type="button"
                className="ssv-btn ssv-btn-primary"
                disabled={!canResume || isResuming}
                onClick={handleResumeClick}
                title={
                  canResume
                    ? isResuming
                      ? "Resuming…"
                      : "Resume this session (revives its terminal)"
                    : "Resume is only available for Claude Code sessions"
                }
              >
                <StatIcon name="play" size={14} /> {isResuming ? "Resuming…" : "Resume session"}
              </button>
            </div>
          </div>
        </div>

        {isEmptyState && !stats && (
          <div className="ssv-empty">
            This session did not produce any tasks, docs, or timeline events.
          </div>
        )}

        {/* ============================ TASKS ============================ */}
        {(linkedTasks.length > 0 || taskIds.length > 0) && (
          <Section label="Tasks" count={`${taskIds.length} linked`}>
            {linkedTasks.length === 0 ? (
              <div className="ssv-empty-inline">
                {taskIds.length} task{taskIds.length === 1 ? "" : "s"} (not loaded)
              </div>
            ) : (
              linkedTasks.map((task, idx) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  sessionId={session.id}
                  defaultOpen={idx === 0}
                />
              ))
            )}
          </Section>
        )}

        {/* ==================== TOKENS / MESSAGES / TOOLS ==================== */}
        {stats ? (
          <>
            <Section label="Tokens & tools" count={stats.source}>
              <div className="ssv-metrics-grid">
                {/* Token card */}
                <div className="ssv-card ssv-token-card">
                  <div className="ssv-token-top">
                    <span className="ssv-token-total">{formatCompactNumber(stats.totalTokens)}</span>
                    <span className="ssv-token-total-lbl">total tokens</span>
                  </div>
                  <div className="ssv-token-bar">
                    {tokenSegments.map((seg) => {
                      const pct = stats.totalTokens > 0 ? (seg.value / stats.totalTokens) * 100 : 0;
                      if (pct < 0.5) return null;
                      return (
                        <div
                          key={seg.key}
                          className="ssv-token-seg"
                          style={{ width: `${pct}%`, background: seg.color }}
                          title={`${seg.label} · ${seg.value.toLocaleString()} (${pct.toFixed(1)}%)`}
                        />
                      );
                    })}
                  </div>
                  <div className="ssv-token-legend">
                    {tokenSegments.map((seg) => {
                      const pct = stats.totalTokens > 0 ? Math.round((seg.value / stats.totalTokens) * 100) : 0;
                      return (
                        <div className="ssv-legend-item" key={seg.key}>
                          <span className="ssv-legend-swatch" style={{ background: seg.color }} />
                          <span className="ssv-legend-k">{seg.label}</span>
                          <span className="ssv-legend-v">{formatCompactNumber(seg.value)}</span>
                          <span className="ssv-legend-pct">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                  {stats.models.length > 0 && (
                    <div className="ssv-models-row">
                      {stats.models.map((m) => (
                        <span className="ssv-meta-chip" key={m}>
                          <StatIcon name="cpu" size={12} /> {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tools card */}
                <div className="ssv-card ssv-tools-card">
                  {stats.toolUsage.length === 0 ? (
                    <div className="ssv-empty-inline">No tool calls recorded</div>
                  ) : (
                    (() => {
                      const max = stats.toolUsage[0]?.count ?? 1;
                      return stats.toolUsage.map((t) => (
                        <div className="ssv-tool-row" key={t.name} title={`${t.name} · ${t.count} calls`}>
                          <span className="ssv-tool-name">{t.name}</span>
                          <span className="ssv-tool-track">
                            <span
                              className="ssv-tool-fill"
                              style={{ width: `${Math.max(4, (t.count / max) * 100)}%` }}
                            />
                          </span>
                          <span className="ssv-tool-count">{t.count}</span>
                        </div>
                      ));
                    })()
                  )}
                </div>
              </div>

              <div className="ssv-msg-counts">
                <div className="ssv-mcount">
                  <div className="ssv-mcount-n">{stats.assistantMessages}</div>
                  <div className="ssv-mcount-l">assistant msgs</div>
                </div>
                <div className="ssv-mcount">
                  <div className="ssv-mcount-n">{stats.userMessages}</div>
                  <div className="ssv-mcount-l">user prompts</div>
                </div>
                <div className="ssv-mcount">
                  <div className="ssv-mcount-n">{stats.toolCallCount}</div>
                  <div className="ssv-mcount-l">tool calls</div>
                </div>
              </div>
            </Section>

            {/* Last messages */}
            {stats.lastMessages.length > 0 && (
              <Section
                label="Last messages"
                count={stats.lastMessages.length}
                right={
                  <button
                    type="button"
                    className="ssv-tl-toggle ssv-sec-right"
                    onClick={() => setLastMsgsOpen((v) => !v)}
                    aria-expanded={lastMsgsOpen}
                  >
                    {lastMsgsOpen ? "Collapse" : "Expand"}
                    <StatIcon
                      name="chevron-right"
                      size={14}
                      className={`ssv-chev${lastMsgsOpen ? " open" : ""}`}
                    />
                  </button>
                }
              >
                {lastMsgsOpen && (
                  <div className="ssv-thread">
                    {stats.lastMessages.map((m, i) => (
                      <div className={`ssv-msg ssv-msg-${m.source}`} key={`${m.timestamp}-${i}`}>
                        <span
                          className="ssv-msg-mark"
                          style={{
                            background:
                              m.source === "assistant" ? "var(--ssv-info-dim)" : "var(--pn-brand-soft)",
                          }}
                        >
                          <StatIcon
                            name={m.source === "assistant" ? "bot" : "user"}
                            size={13}
                            color={m.source === "assistant" ? "var(--ssv-info)" : "var(--pn-brand)"}
                          />
                        </span>
                        <div className="ssv-msg-bubble">
                          <div className="ssv-msg-head">
                            <span
                              className="ssv-msg-who"
                              style={{
                                color:
                                  m.source === "assistant" ? "var(--ssv-info)" : "var(--pn-brand)",
                              }}
                            >
                              {m.source}
                            </span>
                            <span className="ssv-msg-time">{formatTimeShort(m.timestamp)}</span>
                          </div>
                          <div className="ssv-msg-text">{mdInline(m.text, `lm${i}`)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}
          </>
        ) : statsLoading ? (
          <Section label="Transcript">
            <div className="ssv-banner">Loading transcript stats…</div>
          </Section>
        ) : (
          sessionCwd && (
            <Section label="Transcript">
              <div className="ssv-banner">
                <StatIcon name="file-x" size={16} color="var(--ssv-info)" />
                {statsError
                  ? "Transcript stats unavailable — could not read the log file."
                  : "Transcript stats unavailable — log file not present locally."}
              </div>
            </Section>
          )
        )}

        {/* ==================== COMMAND USAGE ==================== */}
        {commandUsage && commandUsage.summary.total > 0 && (() => {
          const { summary, records } = commandUsage;
          const maxCmd = summary.byCommand[0]?.total ?? 1;
          const failures = records.filter((r) => !r.success).slice(-8).reverse();
          return (
            <Section label="Command usage" count={`${summary.total} CLI commands`}>
              <div className="ssv-metrics-grid">
                <div className="ssv-card ssv-tools-card">
                  {summary.byCommand.map((c) => (
                    <div
                      className="ssv-tool-row"
                      key={c.command}
                      title={`${c.command} · ${c.total} run${c.total === 1 ? "" : "s"}${c.failed ? `, ${c.failed} failed` : ""}`}
                    >
                      <span className="ssv-tool-name">{c.command}</span>
                      <span className="ssv-tool-track">
                        <span
                          className="ssv-tool-fill"
                          style={{
                            width: `${Math.max(4, (c.total / maxCmd) * 100)}%`,
                            ...(c.failed > 0 ? { background: "var(--ssv-block)" } : {}),
                          }}
                        />
                      </span>
                      <span className="ssv-tool-count">
                        {c.total}
                        {c.failed > 0 ? ` · ${c.failed}✗` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ssv-msg-counts">
                <div className="ssv-mcount">
                  <div className="ssv-mcount-n">{summary.total}</div>
                  <div className="ssv-mcount-l">total runs</div>
                </div>
                <div className="ssv-mcount">
                  <div className="ssv-mcount-n">{summary.succeeded}</div>
                  <div className="ssv-mcount-l">succeeded</div>
                </div>
                <div className="ssv-mcount">
                  <div
                    className="ssv-mcount-n"
                    style={summary.failed > 0 ? { color: "var(--ssv-block)" } : undefined}
                  >
                    {summary.failed}
                  </div>
                  <div className="ssv-mcount-l">failed</div>
                </div>
              </div>

              {failures.length > 0 && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}
                >
                  {failures.map((f, i) => (
                    <div
                      key={`${f.ts}-${i}`}
                      title={f.ts}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 12,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          color: "var(--ssv-block)",
                          flexShrink: 0,
                        }}
                      >
                        <StatIcon name="x-circle" size={12} color="var(--ssv-block)" />
                        exit {f.exitCode}
                      </span>
                      <span
                        style={{
                          color: "var(--ssv-fg-3)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        maestro {f.argv.join(" ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          );
        })()}

        {/* ============================ TIMELINE ============================ */}
        {timeline.length > 0 && (
          <Section label="Timeline" count={`${timeline.length} events`}>
            <div className="ssv-tl-breakdown">
              {timelineBreakdown.map(({ type, count }) => (
                <span className="ssv-tl-bchip" key={type}>
                  <span
                    className="ssv-tl-bdot"
                    style={{ background: SEVERITY_COLOR[TIMELINE_SEVERITY[type] ?? "neutral"] }}
                  />
                  <span className="ssv-tl-bty">{TIMELINE_LABEL[type] ?? type}</span>
                  <span className="ssv-tl-bct">{count}</span>
                </span>
              ))}
            </div>
            <button
              type="button"
              className="ssv-tl-toggle"
              onClick={() => setTimelineOpen((v) => !v)}
              aria-expanded={timelineOpen}
            >
              <StatIcon name="chevron-right" size={14} className={`ssv-chev${timelineOpen ? " open" : ""}`} />
              {timelineOpen ? "Hide full timeline" : "Show full timeline"}
            </button>
            {timelineOpen && (
              <div className="ssv-tl-scroll">
                <SessionTimeline events={timeline} showFilters compact={false} />
              </div>
            )}
          </Section>
        )}

        {/* ============================ DOCS ============================ */}
        {docs.length > 0 && (
          <Section label="Docs produced" count={docs.length}>
            <div className="ssv-docs-grid">
              {docs.map((d) => {
                const isCode = CODE_EXT.test(d.filePath);
                return (
                  <button
                    type="button"
                    className="ssv-card ssv-doc-card"
                    key={d.id}
                    onClick={() => setOpenDoc(d)}
                  >
                    <span className={`ssv-doc-ico ${isCode ? "code" : "md"}`}>
                      <StatIcon name={isCode ? "file-code" : "file-text"} size={16} />
                    </span>
                    <span className="ssv-doc-main">
                      <span className="ssv-doc-title">{d.title}</span>
                      <span className="ssv-doc-path">{d.filePath}</span>
                      <span className="ssv-doc-foot">
                        {d.addedBy && <span>{d.addedBy}</span>}
                        {d.addedBy && <span>·</span>}
                        <span>{formatTimeAgo(d.addedAt)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* ======================== SUB-SESSIONS ======================== */}
        {isCoordinator && subtreeCount > 0 && (
          <Section
            label="Sub-sessions"
            count={`${subtreeCount} in subtree`}
          >
            {subRollup.length > 0 && (
              <div className="ssv-rollup">
                {subRollup.map((r, i) => (
                  <span
                    className="ssv-schip"
                    key={i}
                    style={{ background: r.visual.dim, color: r.visual.color }}
                  >
                    <StatIcon name={r.visual.icon} size={13} />
                    {r.count} {r.label.toLowerCase()}
                  </span>
                ))}
              </div>
            )}
            <div className="ssv-card ssv-sub-list">
              {subSessions.map((child) => {
                const childSnap = child.teamMemberSnapshots?.[0] ?? child.teamMemberSnapshot;
                const childName = childSnap?.name ?? child.name ?? child.id.slice(0, 10);
                const childOutcome = getSessionOutcome(child);
                const childVisual = OUTCOME_VISUAL[childOutcome.variant];
                const lastEvent = child.timeline?.[child.timeline.length - 1];
                const line = lastEvent?.message ?? childSnap?.role ?? child.status;
                return (
                  <button
                    type="button"
                    className="ssv-sub-row"
                    key={child.id}
                    onClick={() => setViewId(child.id)}
                  >
                    <span className="ssv-sub-branch">↳</span>
                    <span className="ssv-sub-av" style={{ background: hueFor(childName) }}>
                      {initialsOf(childName)}
                    </span>
                    <span className="ssv-sub-meta">
                      <span className="ssv-sub-name">{childName}</span>
                      <span className="ssv-sub-line">{line}</span>
                    </span>
                    <span
                      className="ssv-schip"
                      style={{ background: childVisual.dim, color: childVisual.color }}
                    >
                      <StatIcon name={childVisual.icon} size={13} />
                      {childOutcome.label}
                    </span>
                    <span className="ssv-sub-go">
                      <StatIcon name="arrow-right" size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* ==================== SESSION PROMPTS ==================== */}
        {prompts.length > 0 && (
          <Section label="Session prompts" count={prompts.length}>
            <PromptList
              prompts={prompts}
              perspectiveSessionId={session.id}
              onCounterpartClick={(sid) => {
                if (allSessions[sid]) setViewId(sid);
              }}
            />
          </Section>
        )}

        {/* ==================== RUN CONFIG (fold) ==================== */}
        {runConfigRows.length > 0 && (
          <FoldKV
            label="Run configuration"
            count="how it launched"
            open={runConfigOpen}
            onToggle={() => setRunConfigOpen((v) => !v)}
            rows={runConfigRows}
          />
        )}

        {/* ==================== IDENTITY (fold) ==================== */}
        <FoldKV
          label="Identity details"
          count="for --resume"
          open={identityOpen}
          onToggle={() => setIdentityOpen((v) => !v)}
          rows={identityRows}
          copied={copied}
          onCopy={copy}
        />

        {/* System info reuse — kept for env / extended details */}
        <section className="ssv-sec ssv-sec-identity">
          <SessionDetailsSection session={session} compact showEnv={false} showSystemInfo />
        </section>
      </div>

      {openDoc &&
        createPortal(<DocViewer doc={openDoc} onClose={() => setOpenDoc(null)} />, document.body)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------
function TaskCard({
  task,
  sessionId,
  defaultOpen,
}: {
  task: MaestroTask;
  sessionId: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const status = task.taskSessionStatuses?.[sessionId];
  const prio = PRIORITY_VISUAL[task.priority] ?? PRIORITY_VISUAL.low;
  const docCount = task.docs?.length ?? 0;
  const refCount = task.referenceTaskIds?.length ?? 0;
  const depCount = task.dependencies?.length ?? 0;

  return (
    <div className="ssv-card ssv-task-card">
      <button type="button" className="ssv-task-head" onClick={() => setOpen((o) => !o)}>
        <StatIcon name="chevron-right" size={16} className={`ssv-chev${open ? " open" : ""}`} />
        <span className="ssv-task-title">{task.title}</span>
        <span className="ssv-task-id">#{task.id.replace(/^(task_|tsk_)/, "").slice(0, 6)}</span>
        {status && <StatusChip kind={status} />}
      </button>
      {open && (
        <div className="ssv-task-body">
          <div className="ssv-task-meta-strip">
            <span className="ssv-meta-chip">
              <span className="ssv-meta-chip-lbl">task</span> {task.status.replace(/_/g, " ")}
            </span>
            <span className="ssv-meta-chip" style={{ background: prio.bg, color: prio.fg, borderColor: "transparent" }}>
              {prio.label} priority
            </span>
            {task.dueDate && (
              <span className="ssv-meta-chip">
                <StatIcon name="calendar" size={12} /> due {task.dueDate}
              </span>
            )}
            {docCount > 0 && (
              <span className="ssv-meta-chip">
                <StatIcon name="file-text" size={12} /> {docCount} doc{docCount === 1 ? "" : "s"}
              </span>
            )}
            {refCount > 0 && (
              <span className="ssv-meta-chip">
                <StatIcon name="link" size={12} /> {refCount} ref
              </span>
            )}
            {depCount > 0 && (
              <span className="ssv-meta-chip">
                <StatIcon name="git-merge" size={12} /> {depCount} deps
              </span>
            )}
          </div>
          {task.description && (
            <div className="ssv-task-desc">
              <MarkdownLite text={task.description} />
            </div>
          )}
          {task.initialPrompt && (
            <div className="ssv-prompt-block">
              <div className="ssv-prompt-label">Initial prompt</div>
              <div className="ssv-prompt-text">{task.initialPrompt}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible key/value footer
// ---------------------------------------------------------------------------
function FoldKV({
  label,
  count,
  rows,
  open,
  onToggle,
  copied,
  onCopy,
}: {
  label: string;
  count?: string;
  rows: Array<{ k: string; v: string; copy?: boolean; mono?: boolean }>;
  open: boolean;
  onToggle: () => void;
  copied?: string | null;
  onCopy?: (key: string, value: string) => void;
}) {
  return (
    <section className="ssv-fold">
      <button type="button" className="ssv-fold-head" onClick={onToggle} aria-expanded={open}>
        <StatIcon name="chevron-right" size={14} className={`ssv-chev${open ? " open" : ""}`} />
        <span className="ssv-eyebrow">{label}</span>
        <span className="ssv-rule" />
        {count && <span className="ssv-count">{count}</span>}
      </button>
      {open && (
        <div className="ssv-kv-table">
          {rows.map((r) => (
            <React.Fragment key={r.k}>
              <div className="ssv-kv-k">{r.k}</div>
              <div className={`ssv-kv-v${r.mono ? " mono" : ""}`}>
                <span className="ssv-kv-val">{r.v}</span>
                {r.copy && r.v !== "—" && onCopy && (
                  <button
                    type="button"
                    className={`ssv-kv-copy${copied === r.k ? " done" : ""}`}
                    onClick={() => onCopy(r.k, r.v)}
                    title="Copy"
                  >
                    <StatIcon name={copied === r.k ? "check" : "copy"} size={13} />
                  </button>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
