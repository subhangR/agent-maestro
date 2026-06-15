import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AgentMode,
  DocEntry,
  MaestroSession,
  MaestroSessionStatus,
  MaestroTask,
} from "../../app/types/maestro";
import { getWorktreeInfo } from "./WorktreeBadge";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useUIStore } from "../../stores/useUIStore";
import { useSessionStore } from "../../stores/useSessionStore";
import type { TeamColor } from "../../app/constants/teamColors";
import type { SessionLifecycleTab } from "../../utils/sessionLifecycle";
import { willOpenStatsOnClick } from "../../utils/sessionClickRouting";
import { copyToClipboard } from "../../utils/domUtils";
import { isDiagramDoc } from "../../utils/docHelpers";
import { Icon, Glyph, AgentTile, type AgentKind } from "./redesign/kit";

const SESSION_STATUS_LABELS: Record<MaestroSessionStatus, string> = {
  spawning: "Spawning",
  idle: "Idle",
  working: "Working",
  completed: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

const MODE_LABELS: Record<AgentMode, string> = {
  worker: "Worker",
  coordinator: "Coordinator",
  "coordinated-worker": "Co-Worker",
  "coordinated-coordinator": "Co-Coordinator",
};

const MODE_OPTIONS: AgentMode[] = [
  "worker",
  "coordinator",
  "coordinated-worker",
  "coordinated-coordinator",
];

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDuration(startedAt: number, endedAt: number): string {
  const seconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export interface SessionTileLinkInfo {
  localSessionId: string;
  exited: boolean;
}

export interface SessionListItemProps {
  session: MaestroSession;
  depth: number;
  teamColor: TeamColor | null;
  childCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  link: SessionTileLinkInfo | null;
  isSelected: boolean;
  maestroTasks: Record<string, MaestroTask>;
  tab: SessionLifecycleTab;
  onOpenDetail: (sessionId: string) => void;
  onSelect: (session: MaestroSession, link: SessionTileLinkInfo | null) => void;
  onJumpToTerminal: (session: MaestroSession, link: SessionTileLinkInfo | null) => void;
  onStop: (session: MaestroSession, link: SessionTileLinkInfo | null) => void;
  onResume: (sessionId: string) => void;
  onRestore: (session: MaestroSession) => void;
  onToggleHumanComplete: (session: MaestroSession) => void;
  onOpenTeamView: (session: MaestroSession) => void;
  isResuming: boolean;
}

export const SessionListItem = React.memo(function SessionListItem({
  session,
  depth,
  teamColor,
  childCount,
  isCollapsed,
  onToggleCollapse,
  link,
  isSelected,
  maestroTasks,
  tab,
  onOpenDetail,
  onSelect,
  onJumpToTerminal,
  onStop,
  onResume,
  onRestore,
  onToggleHumanComplete,
  onOpenTeamView,
  isResuming,
}: SessionListItemProps) {
  const [isMetaExpanded, setIsMetaExpanded] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const modeBtnRef = useRef<HTMLButtonElement>(null);
  const [modeDropdownPos, setModeDropdownPos] = useState<{ top: number; left: number } | null>(null);

  const updateSessionMode = useMaestroStore((s) => s.updateSessionMode);
  const setDocOverlay = useUIStore((s) => s.setDocOverlay);
  const showTaskDetails = useUIStore((s) => s.sessionShowTaskDetails);
  const showBadges = useUIStore((s) => s.sessionShowBadges);
  const showElapsed = useUIStore((s) => s.sessionShowElapsed);

  const status = session.status;
  const needsInput = session.needsInput?.active;
  // Liveness comes from the local terminal (linkMap), NOT the unreliable `status`
  // field. No live terminal (exited, or never reopened this session) → non-live.
  const isLinkedLive = Boolean(link && !link.exited);
  const hasChildren = childCount > 0;
  const isHumanCompleted = Boolean(session.humanCompletedAt);
  const isArchived = Boolean(session.archivedAt);
  // A child whose own lifecycle state disagrees with the tab it's being shown
  // in (e.g. an archived child rendered under an active root). We keep it in the
  // tree for spawn-chain context but mark it as out-of-place rather than hiding.
  const isOutOfTab = depth > 0 && isArchived && tab !== 'archived';

  const snapshots = session.teamMemberSnapshots?.length
    ? session.teamMemberSnapshots
    : session.teamMemberSnapshot
      ? [session.teamMemberSnapshot]
      : [];
  const memberNames = snapshots.map((m) => m.name).join(", ");
  const title = memberNames || session.name || session.id.slice(0, 12);

  const linkedTasks = useMemo(
    () =>
      session.taskIds
        .map((tid) => maestroTasks[tid])
        .filter((t): t is MaestroTask => t !== undefined),
    [session.taskIds, maestroTasks],
  );

  const docs: DocEntry[] = session.docs ?? [];
  const mode = session.mode;

  // Rich hover tooltip: session identity + every linked task's full details.
  const detailsTooltip = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Session: ${title}`);
    lines.push(`Status: ${SESSION_STATUS_LABELS[status]}${session.needsInput?.active ? " (needs input)" : ""}`);
    if (mode) lines.push(`Mode: ${MODE_LABELS[mode]}`);
    if (session.model) lines.push(`Model: ${session.model}`);
    if (linkedTasks.length > 0) {
      lines.push("");
      lines.push(linkedTasks.length === 1 ? "Task:" : "Tasks:");
      for (const t of linkedTasks) {
        lines.push(`• ${t.title}  [${t.status}]`);
        if (t.description?.trim()) lines.push(`   ${t.description.trim()}`);
      }
    }
    return lines.join("\n");
  }, [title, status, session.needsInput?.active, session.model, mode, linkedTasks]);

  useEffect(() => {
    if (showModeDropdown && modeBtnRef.current) {
      const rect = modeBtnRef.current.getBoundingClientRect();
      setModeDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [showModeDropdown]);

  const handleModeChange = useCallback(
    (newMode: AgentMode) => {
      if (newMode !== mode) updateSessionMode(session.id, newMode);
      setShowModeDropdown(false);
    },
    [mode, session.id, updateSessionMode],
  );

  const handleCopyReference = useCallback(async () => {
    const ok = await copyToClipboard(`${title} (${session.id})`);
    if (ok) {
      setCopiedRef(true);
      window.setTimeout(() => setCopiedRef(false), 1200);
    }
  }, [title, session.id]);

  const canResume = (session.metadata?.agentTool || "claude-code") === "claude-code";

  // The dot is a *click-affordance* signal, not a raw PTY-alive signal. The
  // Resume button uses the same predicate — both come from a single helper so
  // they can never drift apart.
  const willOpenStats = willOpenStatsOnClick(session, link);
  const isShowingTerminalOnClick = !willOpenStats;

  // The blink (ping ring) rides on raw PTY byte-streaming, not on a terminal
  // merely existing. A live-but-idle terminal shows a solid green dot; only a
  // terminal pushing bytes right now pulses. `agentWorking` is the authoritative
  // streaming signal (2s idle debounce in useSessionStore).
  const isStreaming = useSessionStore((s) => {
    if (!link) return false;
    const term = s.sessions.find((t) => t.id === link.localSessionId);
    if (!term || term.exited || term.closing) return false;
    return Boolean(term.agentWorking);
  });

  // Agent logo for the tile. Known tools → real logo; anything else
  // (hermes, persona-only) → initial-letter fallback from the kit's AgentTile.
  const agentTool = session.metadata?.agentTool;
  const agentKind: AgentKind =
    !agentTool || agentTool === "claude-code"
      ? "claude"
      : agentTool === "codex"
        ? "codex"
        : agentTool === "gemini"
          ? "gemini"
          : agentTool;

  // Glyph status kind — needs-input wins; otherwise the raw session status
  // (all six map onto kit Glyph kinds 1:1).
  const statusKind = needsInput ? "needsInput" : status;
  const elapsed = session.completedAt
    ? formatDuration(session.startedAt, session.completedAt)
    : formatTimeAgo(session.lastActivity);

  return (
    <div
      className={`pn-st${needsInput ? " pn-st--needsInput" : ""}${isSelected ? " pn-st--selected" : ""}${isArchived ? " pn-st--archived" : ""}${isOutOfTab ? " pn-st--outOfTab" : ""}`}
      onClick={() => onSelect(session, link)}
    >
      <div className="pn-st__main">
        {/* Sub-session disclosure arrow + child count */}
        <button
          type="button"
          className={`pn-st__arrow ${hasChildren ? (isCollapsed ? "" : "pn-st__arrow--expanded") : "pn-st__arrow--empty"}`}
          disabled={!hasChildren}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleCollapse();
          }}
          title={hasChildren ? (isCollapsed ? `Expand ${childCount} sub-sessions` : "Collapse sub-sessions") : "No sub-sessions"}
        >
          <Icon name="chevronR" />
        </button>
        {hasChildren && <span className="pn-st__arrowCount">{childCount}</span>}

        {/* Leading control.
            Open/Done → "mark done" radio (pure intent marker: stamps
            humanCompletedAt, never touches the terminal). Archived → static
            archive glyph (archived precedence wins). */}
        {isArchived ? (
          <span
            className="pn-st__radio pn-st__radio--archived"
            title="Archived — use Restore to bring it back"
            aria-hidden="true"
          >
            <Glyph kind="archived" size={13} />
          </span>
        ) : (
          <button
            type="button"
            className={`pn-st__radio${isHumanCompleted ? " pn-st__radio--on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleHumanComplete(session);
            }}
            title={isHumanCompleted ? "Marked done — click to move back to Open" : "Mark done — moves to the Done tab (terminal keeps running)"}
            aria-pressed={isHumanCompleted}
          >
            {isHumanCompleted && <Icon name="check" size={10} sw={2.2} />}
          </button>
        )}

        {/* Title — agent logo + name. Clicks fold into the whole-tile select
            (handled on the root); no own handler so behaviour is unchanged. */}
        <span
          className="pn-st__title"
          title={isLinkedLive ? `Switch to ${title}` : `Select ${title}`}
        >
          <AgentTile kind={agentKind} />
          <span className="pn-st__titleText">{title}</span>
        </span>

        {isOutOfTab && (
          <span className="pn-st__tag" title="This sub-session is archived">archived</span>
        )}
        {isHumanCompleted && !isArchived && (
          <span className="pn-st__tag pn-st__tag--done" title="Marked done by you">done</span>
        )}

        {/* Click-affordance live/stopped indicator. Live whenever a terminal
            exists (clicking opens it); stopped when exited (clicking → stats). */}
        {!isArchived && (
          isShowingTerminalOnClick ? (
            <span className="pn-st__live pn-dot-wrap" title="Live terminal — click to open">
              <span className={`pn-dot pn-dot--run${isStreaming ? " pn-dot--live" : ""}`} style={{ position: "absolute", inset: 0 }} />
            </span>
          ) : (
            <span className="pn-st__stopped" title="No live terminal — Resume to reactivate" />
          )
        )}

        {docs.length > 0 && (
          <button
            type="button"
            className="pn-mini"
            title={`${docs.length} doc${docs.length !== 1 ? "s" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setIsMetaExpanded(true);
            }}
          >
            <Icon name="doc" size={12} />
            {docs.length}
          </button>
        )}
        {(() => {
          const wt = getWorktreeInfo(session);
          return wt ? (
            <span className="pn-mini" title={`worktree ${wt.branch}`}>
              <Icon name="gitBranch" size={12} />
            </span>
          ) : null;
        })()}

        {/* Agent status glyph (read-only) */}
        <span
          className="pn-st__statusglyph"
          title={needsInput ? "Needs input" : SESSION_STATUS_LABELS[status]}
          data-status-anchor
        >
          <Glyph kind={statusKind} size={16} />
        </span>

        {/* Actions */}
        <div className="pn-st__actions">
          {/* Team view (terminals) — only when this node has children */}
          {hasChildren && (
            <button
              type="button"
              className="pn-st__btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpenTeamView(session);
              }}
              title="Open team view (terminals)"
            >
              <Icon name="teamview" />
            </button>
          )}

          {/* Resume — visibility locked to the click-routing predicate (see
              utils/sessionClickRouting). Shown ⟺ clicking would open the stats
              view. Covers Archived tiles too. */}
          {willOpenStats && (
            <button
              type="button"
              className="pn-st__resume"
              disabled={!canResume || isResuming}
              onClick={(e) => {
                e.stopPropagation();
                if (canResume) onResume(session.id);
              }}
              title={
                canResume
                  ? isResuming
                    ? "Resuming…"
                    : "Resume this session (revives its terminal)"
                  : "Resume is only available for Claude Code sessions"
              }
            >
              <Icon name="refresh" /> {isResuming ? "Resuming…" : "Resume"}
            </button>
          )}

          {/* Close — every non-archived tile. Stops the terminal (if live) and archives. */}
          {!isArchived && (
            <button
              type="button"
              className="pn-st__btn pn-st__btn--danger"
              onClick={(e) => {
                e.stopPropagation();
                onStop(session, link);
              }}
              title={hasChildren ? "Close session + all sub-sessions (move to Archived)" : isLinkedLive ? "Stop & close session" : "Close session (move to Archived)"}
            >
              <Icon name="x" />
            </button>
          )}

          {/* Restore — only archived tiles. Un-archives the subtree. */}
          {isArchived && (
            <button
              type="button"
              className="pn-st__btn"
              onClick={(e) => {
                e.stopPropagation();
                onRestore(session);
              }}
              title={hasChildren ? "Restore session + all sub-sessions (un-archive)" : "Restore session (un-archive)"}
            >
              <Icon name="undo" />
            </button>
          )}

          {/* Copy a reference (Name + id) to paste into another session */}
          <button
            type="button"
            className="pn-st__btn"
            onClick={(e) => {
              e.stopPropagation();
              void handleCopyReference();
            }}
            title={copiedRef ? "Copied reference" : "Copy session reference"}
            aria-label="Copy session reference"
          >
            <Icon name={copiedRef ? "check" : "copy"} />
          </button>

          {/* Expand meta caret (rightmost) */}
          <button
            type="button"
            className="pn-st__btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsMetaExpanded((v) => !v);
            }}
            title={isMetaExpanded ? "Collapse details" : "Expand details"}
          >
            <Icon name="chevronD" style={isMetaExpanded ? { transform: "rotate(180deg)" } : undefined} />
          </button>
        </div>
      </div>

      {(showBadges || showElapsed) && (
        <div className="pn-st__inforow">
          {showBadges && mode && (
            <span className="pn-st__infobadge">{MODE_LABELS[mode]}</span>
          )}
          {showBadges && session.model && (
            <span className="pn-st__infobadge pn-st__infobadge--model">{session.model.toUpperCase()}</span>
          )}
          {showElapsed && (
            <span
              className="pn-st__infotime"
              title={`Started ${new Date(session.startedAt).toLocaleString()}`}
            >
              {elapsed}
            </span>
          )}
        </div>
      )}

      {showTaskDetails && linkedTasks.length > 0 && (
        <div className="pn-st__tasklines">
          {linkedTasks.map((task) => (
            <div key={task.id} className="pn-st__taskline" title={detailsTooltip}>
              <Glyph kind={task.status} size={13} />
              <span className="pn-st__tasklineLabel">{task.title}</span>
            </div>
          ))}
        </div>
      )}

      {isMetaExpanded && (
        <div className="pn-st__meta" onClick={(e) => e.stopPropagation()}>
          {/* Status / mode / model */}
          <div className="pn-st__metasec">
            <span className="pn-st__metalabel">Status</span>
            <div className="pn-st__metacontent">
              <span className={`pn-badge pn-badge--status-${statusKind}`}>
                <Glyph kind={statusKind} size={12} />{" "}
                {needsInput ? "NEEDS INPUT" : (SESSION_STATUS_LABELS[status] || status).toUpperCase()}
              </span>

              {/* Editable mode (portal dropdown — mutates the session mode store) */}
              <button
                type="button"
                ref={modeBtnRef}
                className="pn-badge pn-badge--btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowModeDropdown((v) => !v);
                }}
                title="Click to change mode"
              >
                {mode ? MODE_LABELS[mode] : "Mode"}
                <Icon name="chevronD" size={9} className="pn-badge__caret" />
              </button>
              {showModeDropdown && modeDropdownPos && createPortal(
                <>
                  <div className="pn-pop-ov" onClick={(e) => { e.stopPropagation(); setShowModeDropdown(false); }} />
                  <div
                    className="pn-pop"
                    style={{ position: "fixed", top: modeDropdownPos.top, left: modeDropdownPos.left }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {MODE_OPTIONS.map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        className={`pn-opt${opt === mode ? " pn-opt--cur" : ""}`}
                        onClick={(e) => { e.stopPropagation(); handleModeChange(opt); }}
                      >
                        {MODE_LABELS[opt]}
                        {opt === mode && <span className="pn-opt__chk"><Icon name="check" size={12} /></span>}
                      </button>
                    ))}
                  </div>
                </>,
                document.body,
              )}

              {session.model && (
                <span className="pn-badge pn-badge--model">{session.model.toUpperCase()}</span>
              )}
              {session.strategy && <span className="pn-badge">{session.strategy}</span>}
              {(() => {
                const wt = getWorktreeInfo(session);
                return wt ? (
                  <span className="pn-badge">
                    <Icon name="gitBranch" size={11} /> {wt.branch}
                  </span>
                ) : null;
              })()}

              <span className="pn-st__time pn-tt__time" style={{ marginLeft: "auto" }} title={`Started ${new Date(session.startedAt).toLocaleString()}`}>
                {elapsed}
              </span>
            </div>
          </div>

          {/* Linked tasks */}
          {linkedTasks.length > 0 && (
            <div className="pn-st__metasec">
              <span className="pn-st__metalabel">Tasks</span>
              <div className="pn-st__metacontent">
                {linkedTasks.slice(0, 4).map((task) => (
                  <span key={task.id} className="pn-st__taskchip" title={`${task.title} (${task.status})`}>
                    <Glyph kind={task.status} size={12} />
                    <span className="t">{task.title}</span>
                  </span>
                ))}
                {linkedTasks.length > 4 && (
                  <span className="pn-st__taskchip">+{linkedTasks.length - 4}</span>
                )}
              </div>
            </div>
          )}

          {/* Docs */}
          {docs.length > 0 && (
            <div className="pn-st__metasec">
              <span className="pn-st__metalabel">Docs</span>
              <div className="pn-st__metacontent">
                {docs.map((doc) => {
                  const isDiagram = isDiagramDoc(doc);
                  const ext = doc.filePath.split(".").pop()?.toLowerCase() || "";
                  const isMarkdown = ["md", "mdx", "markdown"].includes(ext);
                  return (
                    <button
                      type="button"
                      key={doc.id}
                      className={`pn-docpill${isDiagram ? " pn-docpill--diagram" : ""}`}
                      title={doc.filePath}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDocOverlay(doc);
                      }}
                    >
                      <span className="pn-docpill__ic">{isDiagram ? "⬡" : isMarkdown ? "M↓" : "{}"}</span>
                      <span className="pn-docpill__t">{doc.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pn-st__metasec">
            <span className="pn-st__metalabel">Actions</span>
            <div className="pn-st__metacontent">
              <button
                type="button"
                className="pn-st__actbtn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail(session.id);
                }}
                title="Open full session details"
              >
                <Icon name="info" size={13} /> Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
