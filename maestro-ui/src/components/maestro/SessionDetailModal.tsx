import React, { useEffect, useRef, useCallback } from "react";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { MaestroSessionStatus } from "../../app/types/maestro";
import { SessionTimeline } from "./SessionTimeline";
import { DocsList } from "./DocsList";
import { useSessionDocs } from "../../hooks/useSessionDocs";
import { StrategyBadge } from "./StrategyBadge";
import { GitPanel } from "./GitPanel";
import { WorktreeBadge, getWorktreeInfo } from "./WorktreeBadge";
import { PrChip, getPrInfo } from "./PrChip";
import { Icon } from "./redesign/kit";

interface SessionDetailModalProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

const SESSION_STATUS_LABELS: Record<MaestroSessionStatus, string> = {
  spawning: "Spawning",
  idle: "Idle",
  working: "Working",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
};

const TASK_STATUS_SYMBOLS: Record<string, string> = {
  todo: "○",
  in_progress: "◉",
  completed: "✓",
  cancelled: "⊘",
  blocked: "✗",
};

// Map session status → published pn-pill / pn-dot variants (redesign tokens).
const STATUS_PILL: Record<MaestroSessionStatus, "run" | "wait" | "idle"> = {
  spawning: "wait",
  idle: "idle",
  working: "run",
  completed: "idle",
  failed: "idle",
  stopped: "idle",
};
const STATUS_DOT: Record<MaestroSessionStatus, string> = {
  spawning: "wait",
  idle: "idle",
  working: "run",
  completed: "info",
  failed: "block",
  stopped: "idle",
};
// Linked-task status → token color name (var(--pn-<x>)).
const TASK_TONE: Record<string, string> = {
  todo: "idle",
  in_progress: "info",
  completed: "run",
  cancelled: "idle",
  blocked: "block",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function SessionDetailModal({ sessionId, isOpen, onClose }: SessionDetailModalProps) {
  const session = useMaestroStore((s) => s.sessions[sessionId]);
  const tasks = useMaestroStore((s) => s.tasks);
  const fetchSession = useMaestroStore((s) => s.fetchSession);
  // session.docs carries metadata only; hydrate content so docs open properly.
  const hydratedDocs = useSessionDocs(session, isOpen);

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledToBottomRef = useRef(true);

  // Fetch full session data on open
  useEffect(() => {
    if (isOpen && sessionId) {
      fetchSession(sessionId);
    }
  }, [isOpen, sessionId, fetchSession]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = timelineContainerRef.current;
    if (!el) return;
    const threshold = 50;
    isUserScrolledToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Auto-scroll when new timeline events arrive
  const timelineLength = session?.timeline?.length ?? 0;
  useEffect(() => {
    const el = timelineContainerRef.current;
    if (!el) return;
    if (isUserScrolledToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [timelineLength]);

  if (!isOpen) return null;

  // Resolve linked tasks
  const linkedTasks = session?.taskIds
    ?.map((taskId) => tasks[taskId])
    .filter((t) => t !== undefined) ?? [];

  const needsInput = session?.needsInput?.active;
  const pillVariant = session ? (needsInput ? "wait" : STATUS_PILL[session.status]) : "idle";
  const dotVariant = session ? (needsInput ? "wait" : STATUS_DOT[session.status]) : "idle";
  const statusLive = !!session && session.status === "working" && !needsInput;

  return (
    <div className="maestroModalOverlay" onClick={onClose}>
      <div className="pn-mdl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pn-mdl__hd">
          <div className="pn-mdl__hdmain">
            <div className="pn-mdl__crumb"><Icon name="terminal" /> <b>Session</b></div>
            <h2 className="pn-mdl__titleinput" style={{ margin: 0 }}>
              {session?.name || sessionId.slice(0, 12)}
            </h2>
            {session && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <span className={`pn-pill pn-pill--${pillVariant}`}>
                  <span className="pn-dot-wrap"><span className={`pn-dot pn-dot--${dotVariant}${statusLive ? " pn-dot--live" : ""}`}></span></span>
                  {needsInput ? "Needs Input" : SESSION_STATUS_LABELS[session.status]}
                </span>
                <StrategyBadge strategy={session.strategy} orchestratorStrategy={session.orchestratorStrategy} />
                {session.model && (
                  <span className="pn-badge pn-badge--model">{session.model.toUpperCase()}</span>
                )}
                {session.mode && (
                  <span className="pn-badge">{session.mode.toUpperCase()}</span>
                )}
                {(() => {
                  const wt = getWorktreeInfo(session);
                  return wt ? <WorktreeBadge branch={wt.branch} compact /> : null;
                })()}
                {(() => {
                  const pr = getPrInfo(session);
                  return pr ? <PrChip url={pr.url} number={pr.number} compact /> : null;
                })()}
              </div>
            )}
          </div>
          <button type="button" className="pn-mdl__close" onClick={onClose} title="Close"><Icon name="x" /></button>
        </div>

        {/* Body */}
        <div className="pn-mdl__body">
          {!session ? (
            <div className="pn-fhint">Loading session data...</div>
          ) : (
            <>
              {/* Info Grid */}
              <div className="pn-fld">
                <span className="pn-flabel" style={{ paddingBottom: 6, borderBottom: "1px solid var(--pn-line)" }}>Info</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginTop: 4 }}>
                  <div className="pn-fld" style={{ gap: 3 }}>
                    <span className="pn-flabel">Started</span>
                    <span style={{ fontSize: "12.5px", color: "var(--pn-ink-2)" }}>{formatDate(session.startedAt)}</span>
                  </div>
                  <div className="pn-fld" style={{ gap: 3 }}>
                    <span className="pn-flabel">Last Activity</span>
                    <span style={{ fontSize: "12.5px", color: "var(--pn-ink-2)" }}>{formatTimeAgo(session.lastActivity)}</span>
                  </div>
                  {session.completedAt && (
                    <div className="pn-fld" style={{ gap: 3 }}>
                      <span className="pn-flabel">Completed</span>
                      <span style={{ fontSize: "12.5px", color: "var(--pn-ink-2)" }}>{formatDate(session.completedAt)}</span>
                    </div>
                  )}
                  {session.needsInput?.active && (
                    <div className="pn-fld" style={{ gap: 3 }}>
                      <span className="pn-flabel">Needs Input</span>
                      <span style={{ fontSize: "12.5px", color: "var(--pn-ink-2)" }}>{session.needsInput.message || "Waiting for user input"}</span>
                    </div>
                  )}
                  {session.agentId && (
                    <div className="pn-fld" style={{ gap: 3 }}>
                      <span className="pn-flabel">Agent</span>
                      <span style={{ fontSize: "12.5px", color: "var(--pn-ink-2)" }}>{session.agentId}</span>
                    </div>
                  )}
                  <div className="pn-fld" style={{ gap: 3 }}>
                    <span className="pn-flabel">Hostname</span>
                    <span style={{ fontSize: "12.5px", color: "var(--pn-ink-2)" }}>{session.hostname || "—"}</span>
                  </div>
                  <div className="pn-fld" style={{ gap: 3 }}>
                    <span className="pn-flabel">Platform</span>
                    <span style={{ fontSize: "12.5px", color: "var(--pn-ink-2)" }}>{session.platform || "—"}</span>
                  </div>
                  {session.spawnSource && (
                    <div className="pn-fld" style={{ gap: 3 }}>
                      <span className="pn-flabel">Spawn Source</span>
                      <span style={{ fontSize: "12.5px", color: "var(--pn-ink-2)" }}>{session.spawnSource}</span>
                    </div>
                  )}
                  {session.spawnedBy && (
                    <div className="pn-fld" style={{ gap: 3 }}>
                      <span className="pn-flabel">Spawned By</span>
                      <span style={{ fontSize: "12.5px", color: "var(--pn-ink-2)" }}>{session.spawnedBy}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Linked Tasks */}
              {linkedTasks.length > 0 && (
                <div className="pn-fld">
                  <span className="pn-flabel" style={{ paddingBottom: 6, borderBottom: "1px solid var(--pn-line)" }}>
                    Linked Tasks ({linkedTasks.length})
                  </span>
                  <div className="pn-caps">
                    {linkedTasks.map((task) => (
                      <div key={task.id} className="pn-cap" style={{ cursor: "default" }}>
                        <span style={{ fontFamily: "var(--pn-mono)", fontSize: 13, width: 16, flex: "0 0 auto", textAlign: "center", color: `var(--pn-${TASK_TONE[task.status] || "idle"})` }}>
                          {TASK_STATUS_SYMBOLS[task.status] || "○"}
                        </span>
                        <div className="pn-cap__body">
                          <div className="pn-cap__name">{task.title}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Docs */}
              {hydratedDocs.length > 0 && (
                <div className="pn-fld">
                  <DocsList docs={hydratedDocs} />
                </div>
              )}

              {/* Git Panel — shown when session has a worktree */}
              {session.metadata?.worktreePath && (
                <div className="pn-fld">
                  <span className="pn-flabel" style={{ paddingBottom: 6, borderBottom: "1px solid var(--pn-line)" }}>Git</span>
                  <GitPanel sessionId={sessionId} />
                </div>
              )}

              {/* Timeline */}
              <div className="pn-fld">
                <span className="pn-flabel" style={{ paddingBottom: 6, borderBottom: "1px solid var(--pn-line)" }}>Timeline</span>
                <div
                  ref={timelineContainerRef}
                  className="sessionDetailTimelineScroller"
                  onScroll={handleScroll}
                >
                  {session.timeline && session.timeline.length > 0 ? (
                    <SessionTimeline
                      events={session.timeline}
                      showFilters
                      compact={false}
                    />
                  ) : (
                    <div className="pn-fhint">No timeline events yet</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pn-mdl__foot">
          <div className="pn-mdl__footL">
            <span className="pn-flabel">Session</span>
            <span style={{ fontFamily: "var(--pn-mono)", fontSize: "11px", color: "var(--pn-ink-3)" }} title={sessionId}>
              {sessionId.slice(0, 12)}…
            </span>
          </div>
          <div className="pn-mdl__footR">
            <button type="button" className="pn-btn pn-btn--ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
