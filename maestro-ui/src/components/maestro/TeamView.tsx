import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MaestroSession } from '../../app/types/maestro';
import type { TerminalRegistry } from '../../SessionTerminal';
import type { ChildStats } from '../../utils/resolveTeamView';
import { useSessionStore } from '../../stores/useSessionStore';
import { useMaestroStore } from '../../stores/useMaestroStore';
import { useUIStore } from '../../stores/useUIStore';
import { getWorktreeInfo } from './WorktreeBadge';
import { Icon, Glyph, Avatar, AgentTile, type AgentKind } from './redesign/kit';
import { isAgentToolResumable } from '../../app/constants/agentTools';

interface TeamViewProps {
  root: MaestroSession;
  childrenSessions: MaestroSession[];
  trail: MaestroSession[]; // trueRoot → … → root (inclusive)
  registry: React.MutableRefObject<TerminalRegistry>;
  linkMap: Map<string, string>; // maestroSessionId -> live local session id
  childStats: (sessionId: string) => ChildStats;
  onReRoot: (sessionId: string) => void;
  onClose: () => void;
  onSelectSession: (localSessionId: string) => void;
}

interface SlotInfo {
  maestroSessionId: string;
  localSessionId: string | null;
  label: string;
  agent: AgentKind;
  status: string;
  needsInput: boolean;
  drillable: boolean;
  resumable: boolean;
  stats: ChildStats;
  branch?: string;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);

function snapshotOf(session: MaestroSession) {
  return session.teamMemberSnapshots?.[0] || (session as { teamMemberSnapshot?: { name?: string; avatar?: string } }).teamMemberSnapshot;
}

function labelOf(session: MaestroSession): string {
  const snap = snapshotOf(session);
  return snap?.name || session.name || session.id.slice(0, 12);
}

function agentKindOf(session: MaestroSession): AgentKind {
  const agentTool = (session.metadata as { agentTool?: string } | undefined)?.agentTool;
  return !agentTool || agentTool === 'claude-code'
    ? 'claude'
    : agentTool === 'codex'
      ? 'codex'
      : agentTool === 'gemini'
        ? 'gemini'
        : agentTool;
}

export function isResumable(session: MaestroSession): boolean {
  const agentTool = (session.metadata as { agentTool?: string } | undefined)?.agentTool;
  return TERMINAL_STATUSES.has(session.status) && isAgentToolResumable(agentTool);
}

/**
 * TeamView renders a full-screen, re-rootable overlay over the spawn hierarchy.
 * Left pane = current root's live terminal; right pane = root's direct children.
 * Terminals are reparented (DOM appendChild) into slot host divs so they escape
 * stacking contexts; on unmount they are moved back to their original parent.
 */
export const TeamView = React.memo(function TeamView({
  root,
  childrenSessions,
  trail,
  registry,
  linkMap,
  childStats,
  onReRoot,
  onClose,
  onSelectSession,
}: TeamViewProps) {
  const setActiveId = useSessionStore((s) => s.setActiveId);
  const resumeSession = useMaestroStore((s) => s.resumeSession);
  const [resumingId, setResumingId] = useState<string | null>(null);

  // Overlay body ref for ResizeObserver
  const bodyRef = useRef<HTMLDivElement>(null);

  // --- Resizable split state ---
  const [rootFraction, setRootFraction] = useState(0.5);
  const resizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartFractionRef = useRef(0.5);

  const rootSlot: SlotInfo = useMemo(() => ({
    maestroSessionId: root.id,
    localSessionId: linkMap.get(root.id) ?? null,
    label: labelOf(root),
    agent: agentKindOf(root),
    status: root.status || 'idle',
    needsInput: root.needsInput?.active ?? false,
    drillable: false,
    resumable: isResumable(root),
    stats: childStats(root.id),
    branch: getWorktreeInfo(root)?.branch,
  }), [root, linkMap, childStats]);

  const childSlots: SlotInfo[] = useMemo(() => (
    childrenSessions.map((child) => {
      const stats = childStats(child.id);
      return {
        maestroSessionId: child.id,
        localSessionId: linkMap.get(child.id) ?? null,
        label: labelOf(child),
        agent: agentKindOf(child),
        status: child.status || 'idle',
        needsInput: child.needsInput?.active ?? false,
        drillable: stats.total > 0,
        resumable: isResumable(child),
        stats,
        branch: getWorktreeInfo(child)?.branch,
      };
    })
  ), [childrenSessions, linkMap, childStats]);

  const hasChildSlots = childSlots.length > 0;

  const handleResume = useCallback(async (maestroSessionId: string) => {
    setResumingId(maestroSessionId);
    try {
      await resumeSession(maestroSessionId);
    } catch (err) {
      useUIStore.getState().reportError('Failed to resume session', err);
    } finally {
      setResumingId(null);
    }
  }, [resumeSession]);

  // --- Close on Escape / go up on Backspace ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Backspace' && trail.length >= 2) {
        const target = document.activeElement;
        const isEditable = target instanceof HTMLElement &&
          (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName));
        if (isEditable) return;
        e.preventDefault();
        e.stopPropagation();
        onReRoot(trail[trail.length - 2].id);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onReRoot, trail]);

  // --- Resize handle drag logic ---
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      resizeStartXRef.current = e.clientX;
      resizeStartFractionRef.current = rootFraction;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [rootFraction],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current || !bodyRef.current) return;
      const bodyRect = bodyRef.current.getBoundingClientRect();
      const dx = e.clientX - resizeStartXRef.current;
      const newFraction = resizeStartFractionRef.current + dx / bodyRect.width;
      setRootFraction(Math.max(0.2, Math.min(0.8, newFraction)));
    };

    const handleMouseUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // --- Open a leaf terminal in the main view ---
  const handleOpenTerminal = useCallback(
    (localSessionId: string) => {
      setActiveId(localSessionId);
      onSelectSession(localSessionId);
      onClose();
    },
    [setActiveId, onSelectSession, onClose],
  );

  // --- Click a child slot: drill if it has children, else open its terminal ---
  const handleChildActivate = useCallback(
    (slot: SlotInfo) => {
      if (slot.drillable) {
        onReRoot(slot.maestroSessionId);
      } else if (slot.localSessionId) {
        handleOpenTerminal(slot.localSessionId);
      }
    },
    [onReRoot, handleOpenTerminal],
  );

  const statusLabel =
    root.status === 'working' || root.status === 'spawning'
      ? 'Active'
      : root.status === 'completed'
        ? 'Done'
        : 'Idle';
  const pillActive = root.status === 'working' || root.status === 'spawning';

  const memberCount = 1 + childSlots.length;

  // Compute flex styles for the split
  const rootStyle = hasChildSlots
    ? { flex: `0 0 calc(${rootFraction * 100}% - 3px)` }
    : undefined;
  const childrenStyle = hasChildSlots
    ? { flex: `0 0 calc(${(1 - rootFraction) * 100}% - 3px)` }
    : undefined;

  return createPortal(
    <div className="teamViewOverlay">
      <div className="pn-screen pn-tv" style={{ height: '100%' }}>
        {/* Header */}
        <div className="pn-tv__hd">
          <span className="pn-tv__title">
            <AgentTile kind={rootSlot.agent} lg /> {rootSlot.label}
          </span>
          <span className={`pn-tv__pill ${pillActive ? 'pn-tv__pill--active' : 'pn-tv__pill--idle'}`}>
            <span className={`pn-dot ${pillActive ? 'pn-dot--run' : 'pn-dot--idle'}`} /> {statusLabel}
          </span>
          <span className="pn-tv__count">
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </span>
          <span className="pn-tv__hint">click child to drill · double-click to open · Esc to close</span>
          <button type="button" className="pn-tv__close" onClick={onClose} title="Close team view (Esc)">
            <Icon name="x" />
          </button>
        </div>

        {/* Breadcrumbs: trueRoot ▸ … ▸ currentRoot */}
        {trail.length > 0 && (
          <div className="pn-tv__crumbs">
            {trail.map((s, i) => {
              const isCurrent = s.id === root.id;
              const name = labelOf(s);
              return (
                <React.Fragment key={s.id}>
                  {i > 0 && (
                    <span className="pn-tv__crumb-sep">
                      <Icon name="chevronR" size={12} />
                    </span>
                  )}
                  <button
                    type="button"
                    className={`pn-tv__crumb ${isCurrent ? 'pn-tv__crumb--current' : ''}`}
                    disabled={isCurrent}
                    onClick={() => onReRoot(s.id)}
                    title={isCurrent ? name : `Re-root at ${name}`}
                  >
                    <Avatar a={{ initial: (name[0] || '?').toUpperCase(), name, color: 'var(--pn-ink-2)' }} />
                    <span>{name}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Body: coordinator left, workers right */}
        <div className="pn-tv__body" ref={bodyRef}>
          {/* Coordinator (root) column - left side, full height */}
          <div
            className="pn-tv__coord"
            data-maestro-session-id={rootSlot.maestroSessionId}
            style={(rootStyle || {}) as React.CSSProperties}
          >
            <div className="pn-tv__coordhd">
              <span className="pn-tv__coordring">
                <AgentTile kind={rootSlot.agent} lg />
              </span>
              <span className="pn-tv__coordname">{rootSlot.label}</span>
              <span className="pn-tv__coordbadge">
                <Icon name="baton" /> Coordinator
              </span>
              {rootSlot.branch && (
                <span className="pn-mini" title={`worktree ${rootSlot.branch}`}>
                  <Icon name="gitBranch" size={12} />
                </span>
              )}
              <span className="pn-tv__slotsp" />
              <TeamViewSlotStats stats={rootSlot.stats} />
              {rootSlot.resumable && (
                <TeamViewResumeBtn
                  resuming={resumingId === rootSlot.maestroSessionId}
                  onResume={() => handleResume(rootSlot.maestroSessionId)}
                />
              )}
            </div>
            {rootSlot.localSessionId ? (
              <TeamViewTerminalSlot
                sessionId={rootSlot.localSessionId}
                registry={registry}
                onDoubleClick={() => handleOpenTerminal(rootSlot.localSessionId!)}
              />
            ) : (
              <TeamViewPlaceholder label={rootSlot.label} />
            )}
          </div>

          {/* Resize handle between coordinator and workers */}
          {hasChildSlots && (
            <div className="pn-tv__resize" onMouseDown={handleResizeStart} />
          )}

          {/* Workers panel - right side, horizontally scrollable columns */}
          {hasChildSlots && (
            <div className="pn-tv__workers" style={childrenStyle as React.CSSProperties}>
              {childSlots.map((child) => (
                <div
                  key={child.maestroSessionId}
                  className={`pn-tv__col ${child.needsInput ? 'pn-tv__col--needs' : ''}`}
                  data-maestro-session-id={child.maestroSessionId}
                >
                  <div className="pn-tv__slothd">
                    <AgentTile kind={child.agent} />
                    <span className="pn-tv__slotname">{child.label}</span>
                    <Glyph kind={child.needsInput ? 'needsInput' : child.status} size={14} />
                    <span className="pn-tv__slotsp" />
                    {child.branch && (
                      <span className="pn-mini" title={`worktree ${child.branch}`}>
                        <Icon name="gitBranch" size={12} />
                      </span>
                    )}
                    {child.resumable && (
                      <TeamViewResumeBtn
                        resuming={resumingId === child.maestroSessionId}
                        onResume={() => handleResume(child.maestroSessionId)}
                      />
                    )}
                  </div>
                  {child.localSessionId ? (
                    <TeamViewTerminalSlot
                      sessionId={child.localSessionId}
                      registry={registry}
                      onDoubleClick={() => handleChildActivate(child)}
                    />
                  ) : (
                    <TeamViewPlaceholder
                      label={child.label}
                      drillable={child.drillable}
                      onDrill={() => onReRoot(child.maestroSessionId)}
                    />
                  )}
                  {child.drillable && (
                    <div
                      className="pn-tv__drillbar"
                      onClick={() => onReRoot(child.maestroSessionId)}
                      title={`Drill into this team (${child.stats.total} ${child.stats.total === 1 ? 'worker' : 'workers'})`}
                    >
                      {child.stats.total} {child.stats.total === 1 ? 'worker' : 'workers'} — drill in
                      <span className="arrow">
                        <Icon name="arrowRight" size={13} />
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
});

/**
 * Renders a sub-agent stats badge group for a slot: total worker count plus an
 * active/inactive breakdown. Hidden entirely when the slot has no sub-agents.
 */
function TeamViewSlotStats({ stats }: { stats: ChildStats }) {
  if (stats.total === 0) return null;
  return (
    <span
      className="pn-tv__stats"
      title={`${stats.total} sub-agent${stats.total === 1 ? '' : 's'} · ${stats.active} active · ${stats.inactive} inactive`}
    >
      <span>
        {stats.total} {stats.total === 1 ? 'worker' : 'workers'}
      </span>
      {stats.active > 0 && (
        <span className="pn-tv__statchip" style={{ color: 'var(--pn-run)' }}>
          <span className="pn-dot pn-dot--run" />
          {stats.active}
        </span>
      )}
      {stats.inactive > 0 && (
        <span className="pn-tv__statchip">
          <span className="pn-dot pn-dot--idle" />
          {stats.inactive}
        </span>
      )}
    </span>
  );
}

function TeamViewResumeBtn({
  resuming,
  onResume,
}: {
  resuming: boolean;
  onResume: () => void;
}) {
  return (
    <button
      type="button"
      className="pn-tv__colbtn"
      onClick={onResume}
      disabled={resuming}
      title="Resume session"
    >
      {resuming ? '…' : <Icon name="refresh" />}
    </button>
  );
}

function TeamViewPlaceholder({
  label,
  drillable,
  onDrill,
}: {
  label: string;
  drillable?: boolean;
  onDrill?: () => void;
}) {
  return (
    <div className="pn-tv__ph">
      <span>No live terminal for {label}</span>
      {drillable && onDrill && (
        <button type="button" className="pn-tv__ph__resume" onClick={onDrill}>
          <Icon name="arrowRight" /> Drill in
        </button>
      )}
    </div>
  );
}

/**
 * Reparents a terminal's xterm element into this slot's host div.
 *
 * IMPORTANT: we move `term.element` (the `.xterm` node xterm creates imperatively
 * via `term.open()`), NOT the React-owned `[data-terminal-id]` container. Moving
 * a React-managed node out of its tree makes React's reconciler throw
 * `NotFoundError` when it later tries to remove that node (e.g. when a session
 * disappears on connection loss). The xterm element isn't tracked by React, so
 * relocating it is safe. FitAddon measures `term.element.parentElement`, so
 * sizing follows the node into the host automatically.
 */
const TeamViewTerminalSlot = React.memo(function TeamViewTerminalSlot({
  sessionId,
  registry,
  onDoubleClick,
}: {
  sessionId: string;
  registry: React.MutableRefObject<TerminalRegistry>;
  onDoubleClick: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const entry = registry.current.get(sessionId);
    const xtermEl = entry?.term.element as HTMLElement | undefined;
    if (!entry || !xtermEl) return;

    const originalParent = xtermEl.parentElement;

    // Move the (non-React) xterm element into our host div.
    host.appendChild(xtermEl);
    xtermEl.classList.add('terminalInTeamView');

    const fitTerminal = () => {
      try {
        entry.fit.fit();
        entry.term.scrollToBottom();
      } catch { /* ignore */ }
    };
    // Double RAF to ensure layout is settled
    requestAnimationFrame(() => requestAnimationFrame(fitTerminal));

    // Auto-scroll to bottom on new output
    const scrollDisposable = entry.term.onWriteParsed(() => {
      try { entry.term.scrollToBottom(); } catch { /* ignore */ }
    });

    return () => {
      scrollDisposable.dispose();
      xtermEl.classList.remove('terminalInTeamView');
      // Move the xterm element back into its original container, if it still
      // exists (it may have been unmounted while we held the node).
      if (originalParent && originalParent.isConnected) {
        originalParent.appendChild(xtermEl);
      }
      requestAnimationFrame(() => {
        try { entry.fit.fit(); } catch { /* ignore */ }
      });
    };
  }, [sessionId, registry]);

  return (
    <div
      className="pn-tv__term pn-tv__term--host"
      ref={hostRef}
      onDoubleClick={onDoubleClick}
    />
  );
});
