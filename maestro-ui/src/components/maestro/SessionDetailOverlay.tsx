import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useUIStore } from "../../stores/useUIStore";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { MaestroSessionStatus } from "../../app/types/maestro";
import { SessionTimeline } from "./SessionTimeline";
import { DocsList } from "./DocsList";
import { StrategyBadge } from "./StrategyBadge";
import { SessionDetailsSection } from "./SessionDetailsSection";
import { WorktreeBadge, getWorktreeInfo } from "./WorktreeBadge";
import { SessionLiveIndicator } from "./SessionLiveIndicator";
import { maestroClient } from "../../utils/MaestroClient";
import { Icon, Glyph, type IconName } from "./redesign/kit";
import { useBreakpoint } from "../../hooks/useBreakpoint";

const SESSION_STATUS_LABELS: Record<MaestroSessionStatus, string> = {
  spawning: "Spawning",
  idle: "Idle",
  working: "Working",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
};

type Tab = "info" | "subsessions" | "tasks" | "docs";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "info", label: "Info", icon: "info" },
  { id: "subsessions", label: "Sub-sessions", icon: "team" },
  { id: "tasks", label: "Tasks", icon: "listChecks" },
  { id: "docs", label: "Docs + Timeline", icon: "doc" },
];

export function SessionDetailOverlay() {
  const overlay = useUIStore((s) => s.sessionDetailOverlay);
  const setOverlay = useUIStore((s) => s.setSessionDetailOverlay);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const isMobile = useBreakpoint() === "mobile";

  const sessions = useMaestroStore((s) => s.sessions);
  const tasks = useMaestroStore((s) => s.tasks);
  const fetchSession = useMaestroStore((s) => s.fetchSession);

  const [tab, setTab] = useState<Tab>("info");

  const sessionId = overlay?.sessionId;
  const session = sessionId ? sessions[sessionId] : undefined;
  const setDocOverlay = useUIStore(s => s.setDocOverlay);
  const [isCreatingDiagram, setIsCreatingDiagram] = useState(false);

  const handleCreateDiagram = useCallback(async () => {
    if (!sessionId || !session || isCreatingDiagram) return;
    setIsCreatingDiagram(true);
    try {
      const title = `Diagram ${new Date().toLocaleDateString()}`;
      const doc = await maestroClient.addSessionDoc(sessionId, title, '{}', 'diagram');
      // Refresh session to pick up new doc
      fetchSession(sessionId);
      const projectId = overlay?.projectId ?? '';
      setDocOverlay(doc);
      setOverlay(null);
    } catch {
      // best-effort
    } finally {
      setIsCreatingDiagram(false);
    }
  }, [sessionId, session, isCreatingDiagram, fetchSession, overlay, setDocOverlay, setOverlay]);

  const timelineRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    if (overlay?.sessionId) fetchSession(overlay.sessionId);
  }, [overlay?.sessionId, fetchSession]);

  // Reset to Info tab when the overlay target changes
  useEffect(() => {
    setTab("info");
  }, [overlay?.sessionId]);

  useEffect(() => {
    if (!overlay) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOverlay(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [overlay, setOverlay]);

  const handleScroll = useCallback(() => {
    const el = timelineRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }, []);

  const timelineLength = session?.timeline?.length ?? 0;
  useEffect(() => {
    const el = timelineRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [timelineLength, tab]);

  const subSessions = useMemo(() => {
    if (!sessionId) return [];
    return Object.values(sessions).filter((s) => s.parentSessionId === sessionId);
  }, [sessions, sessionId]);

  const linkedTasks = useMemo(() => {
    if (!session) return [];
    return session.taskIds.map((tid) => tasks[tid]).filter((t) => t !== undefined);
  }, [session, tasks]);

  if (!overlay || (activeProjectId && overlay.projectId !== activeProjectId)) return null;

  const handleClose = () => setOverlay(null);

  const statusKind = session?.needsInput?.active ? "needsInput" : session?.status;

  return createPortal(
    <div
      className={`pn-mdl-scrim${isMobile ? " pn-mdl-scrim--mobile" : ""}`}
      onClick={handleClose}
      style={
        isMobile
          ? {
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: "var(--mobile-nav-height)",
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              flexDirection: "column",
              zIndex: 1000,
              padding: 0,
            }
          : {
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "grid",
              placeItems: "center",
              zIndex: 1000,
              padding: 24,
            }
      }
    >
      <div
        className={`pn-mdl${isMobile ? " pn-mdl--mobile-full" : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={
          isMobile
            ? {
                width: "100%",
                maxWidth: "100%",
                height: "100%",
                maxHeight: "100%",
                borderRadius: 0,
                display: "flex",
                flexDirection: "column",
              }
            : { width: 720, maxWidth: "calc(100vw - 48px)", maxHeight: "90vh" }
        }
      >
        {/* Header */}
        <div className="pn-mdl__hd">
          <div className="pn-mdl__hdmain">
            <div className="pn-mdl__crumb">
              <Icon name="bot" />
              <b>Session</b>
              <Icon name="chevronR" size={11} />
              <span>{sessionId ? `${sessionId.slice(0, 12)}…` : ""}</span>
            </div>
            <div
              className="pn-mdl__titleinput"
              style={{ display: "block", wordBreak: "break-word" }}
            >
              {session?.name || (sessionId ? sessionId.slice(0, 12) : "Session")}
            </div>
            {session && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                <span
                  className={`pn-badge pn-badge--status-${statusKind}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  {statusKind && <Glyph kind={statusKind} size={12} />}
                  {session.needsInput?.active ? "Needs Input" : SESSION_STATUS_LABELS[session.status]}
                </span>
                <SessionLiveIndicator
                  maestroSessionId={session.id}
                  status={session.status}
                  needsInput={session.needsInput?.active}
                />
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
              </div>
            )}
          </div>
          <button type="button" className="pn-mdl__close" onClick={handleClose} title="Close">
            <Icon name="x" />
          </button>
        </div>

        {/* Tabs */}
        <div className="pn-mtabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`pn-mtab ${tab === t.id ? "pn-mtab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} />
              {t.label}
              {t.id === "subsessions" && subSessions.length > 0 && (
                <span className="pn-mtab__n">{subSessions.length}</span>
              )}
              {t.id === "tasks" && linkedTasks.length > 0 && (
                <span className="pn-mtab__n">{linkedTasks.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="pn-mdl__body">
          {!session ? (
            <div className="pn-fhint">Loading session data…</div>
          ) : tab === "info" ? (
            <SessionDetailsSection session={session} compact={false} />
          ) : tab === "subsessions" ? (
            subSessions.length === 0 ? (
              <div className="pn-fhint">No sub-sessions spawned from this session.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {subSessions.map((sub) => {
                  const subTaskCount = sub.taskIds.length;
                  return (
                    <button
                      type="button"
                      key={sub.id}
                      className="pn-btn pn-btn--ghost"
                      onClick={() => setOverlay({ sessionId: sub.id, projectId: overlay.projectId })}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        justifyContent: "flex-start",
                        textAlign: "left",
                        padding: "8px 10px",
                        width: "100%",
                      }}
                    >
                      <Glyph kind={sub.status} size={14} />
                      <span style={{ fontWeight: 600, color: "var(--pn-ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sub.name || sub.id.slice(0, 12)}
                      </span>
                      <span style={{ fontFamily: "var(--pn-mono)", fontSize: 11, color: "var(--pn-ink-3)", flex: "0 0 auto" }}>
                        {SESSION_STATUS_LABELS[sub.status]}
                        {subTaskCount > 0 ? ` · ${subTaskCount} task${subTaskCount !== 1 ? "s" : ""}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          ) : tab === "tasks" ? (
            linkedTasks.length === 0 ? (
              <div className="pn-fhint">No linked tasks.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {linkedTasks.map((task) => (
                  <div key={task!.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px" }}>
                    <Glyph kind={task!.status} size={14} />
                    <span style={{ fontSize: 13, color: "var(--pn-ink)" }}>{task!.title}</span>
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              <div className="pn-fld">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  {session.docs && session.docs.length > 0 && <DocsList docs={session.docs} />}
                  <button
                    type="button"
                    className="pn-btn pn-btn--ghost"
                    style={{ marginLeft: 'auto' }}
                    disabled={isCreatingDiagram}
                    onClick={handleCreateDiagram}
                    title="Create a new diagram doc for this session"
                  >
                    {isCreatingDiagram ? '...' : <><Icon name="plus" size={12} /> Diagram</>}
                  </button>
                </div>
              </div>
              <div className="pn-fld">
                <span className="pn-flabel"><Icon name="clock" size={12} /> Timeline</span>
                <div
                  ref={timelineRef}
                  onScroll={handleScroll}
                  style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--pn-line)", borderRadius: "var(--pn-r-sm)", padding: 8, background: "var(--pn-surface)" }}
                >
                  {session.timeline && session.timeline.length > 0 ? (
                    <SessionTimeline events={session.timeline} showFilters compact={false} />
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
            <span
              className="pn-badge"
              title={sessionId}
              style={{ fontFamily: "var(--pn-mono)" }}
            >
              {sessionId ? `${sessionId.slice(0, 12)}…` : ""}
            </span>
          </div>
          <div className="pn-mdl__footR">
            <button type="button" className="pn-btn pn-btn--ghost" onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
