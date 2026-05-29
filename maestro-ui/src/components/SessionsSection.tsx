import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";
import { getProcessEffectById, type ProcessEffect } from "../processEffects";
import { shortenPathSmart, normalizeSeparators } from "../pathDisplay";
import { Icon } from "./Icon";
import { type MaestroTask, type MaestroSession as MaestroSession, type Team } from "../app/types/maestro";
import { useMaestroStore } from "../stores/useMaestroStore";
import { useUIStore } from "../stores/useUIStore";
import { useSpacesStore } from "../stores/useSpacesStore";
import { useProjectCollabSpaces } from "../hooks/useProjectCollabSpaces";
import { makeCollabActiveId } from "../app/types/space";
import { SpaceAvatar } from "./space-window/SpaceAvatar";
import { MaestroSessionContent } from "./maestro/MaestroSessionContent";
import { SessionDetailModal } from "./maestro/SessionDetailModal";
import { SessionLogModal } from "./session-log/SessionLogModal";
import { ConfirmActionModal } from "./modals/ConfirmActionModal";
import { buildTeamGroups, getGroupedSessionOrder } from "../utils/teamGrouping";
import { TeamSessionGroup } from "./maestro/TeamSessionGroup";
import type { TeamColor } from "../app/constants/teamColors";
import type { Space } from "../app/types/space";

// Phase 2: Module-scope static constants
const AGENT_TOOL_ICONS: Record<string, string> = {
  'claude-code': '/agent-icons/claude-code-icon.png',
  'codex': '/agent-icons/openai-codex-icon.png',
  'gemini': '/agent-icons/gemini-logo.png',
};

function isSshCommand(commandLine: string | null | undefined): boolean {
  const trimmed = commandLine?.trim() ?? "";
  if (!trimmed) return false;
  const token = trimmed.split(/\s+/)[0];
  const base = token.split(/[\\/]/).pop() ?? token;
  return base.toLowerCase().replace(/\.exe$/, "") === "ssh";
}

type Session = {
  id: string;
  persistId: string;
  name: string;
  command: string;
  cwd: string | null;
  launchCommand: string | null;
  restoreCommand?: string | null;
  persistent?: boolean;
  effectId?: string | null;
  processTag?: string | null;
  agentWorking?: boolean;
  recordingActive?: boolean;
  exited?: boolean;
  closing?: boolean;
  exitCode?: number | null;
  maestroSessionId?: string | null;
};


type SessionsSectionProps = {
  agentShortcuts: ProcessEffect[];
  sessions: Session[];
  activeSessionId: string | null;
  activeProjectId: string;
  projectName: string | null;
  projectBasePath: string | null;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onReorderSessions: (draggedPersistId: string, targetPersistId: string) => void;
  onQuickStart: (effect: ProcessEffect) => void;
  onOpenNewSession: () => void;
  onOpenAgentShortcuts: () => void;
  onOpenPersistentSessions: () => void;
  onOpenSshManager: () => void;
  onOpenManageTerminals: () => void;
  onCreateWhiteboard?: () => void;
  onCloseSpace?: (id: string) => void;
};

const SortableSessionItem = React.memo(function SortableSessionItem({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = useMemo<React.CSSProperties>(() => ({
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? "grabbing" : undefined,
    willChange: isDragging ? "transform" : "auto",
  }), [transform, transition, isDragging]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortableItemWrapper ${isDragging ? "sortableItemWrapper--dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
});

function VirtualizedHistoryList({
  historySessions,
  resumingSessionId,
  onResume,
  setShowHistory,
  maestroTasks,
}: {
  historySessions: MaestroSession[];
  resumingSessionId: string | null;
  onResume: (id: string) => Promise<void>;
  setShowHistory: (v: boolean) => void;
  maestroTasks: Record<string, MaestroTask>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const ROW_BASE = 36;
  const ROW_WITH_TASKS = 58;
  const rowVirtualizer = useVirtualizer({
    count: historySessions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => historySessions[i]?.taskIds?.length ? ROW_WITH_TASKS : ROW_BASE,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="sessionHistoryDropdown__list" style={{ maxHeight: 320, overflow: 'auto' }}>
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map(virtualRow => {
          const hs = historySessions[virtualRow.index];
          const canResume = ((hs.metadata as any)?.agentTool || 'claude-code') === 'claude-code';
          const isResuming = resumingSessionId === hs.id;
          const snap = hs.teamMemberSnapshot;
          const sec = Math.floor((Date.now() - hs.lastActivity) / 1000);
          const ago = sec < 60 ? `${sec}s ago`
            : sec < 3600 ? `${Math.floor(sec / 60)}m ago`
            : sec < 86400 ? `${Math.floor(sec / 3600)}h ago`
            : `${Math.floor(sec / 86400)}d ago`;
          const tasks = hs.taskIds
            ?.map(tid => maestroTasks[tid])
            .filter((t): t is MaestroTask => t !== undefined) ?? [];
          return (
            <div
              key={hs.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="sessionHistoryDropdown__row">
                <span className={`sessionHistoryDropdown__dot sessionHistoryDropdown__dot--${hs.status}`} />
                <div className="sessionHistoryDropdown__info">
                  <span className="sessionHistoryDropdown__name">
                    {snap?.avatar && <span>{snap.avatar} </span>}
                    {snap?.name || hs.name}
                  </span>
                  <span className="sessionHistoryDropdown__meta">
                    {hs.status} · {ago}
                  </span>
                  {tasks.length > 0 && (
                    <div className="sessionHistoryDropdown__tasks">
                      {tasks.slice(0, 3).map(task => (
                        <span key={task.id} className={`sessionTaskChip sessionTaskChip--${task.status}`} title={`${task.title} (${task.status})`}>
                          <span className="sessionTaskChip__dot" />
                          <span className="sessionTaskChip__label">{task.title}</span>
                        </span>
                      ))}
                      {tasks.length > 3 && (
                        <span className="sessionTaskChip sessionTaskChip--more">+{tasks.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
                {canResume && (
                  <button
                    type="button"
                    className="sessionHistoryDropdown__resumeBtn"
                    disabled={isResuming}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowHistory(false);
                      void onResume(hs.id);
                    }}
                  >
                    {isResuming ? '...' : 'Resume'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Phase 5: Extracted memoized SessionItem component
interface SessionItemProps {
  session: Session;
  teamColor: TeamColor | null;
  isActive: boolean;
  isExpanded: boolean;
  maestroSession: MaestroSession | null;
  maestroTasks: Record<string, MaestroTask>;
  contentTasks: MaestroTask[];
  isLoadingTasks: boolean;
  isResuming: boolean;
  onSelect: (id: string) => void;
  onToggleExpand: (sessionId: string, maestroSessionId?: string | null) => void;
  onRequestClose: (session: Session) => void;
  onOpenSessionModal: (id: string) => void;
  onOpenLogModal: (id: string) => void;
  onResume: (id: string) => Promise<void>;
}

const SessionItem = React.memo(function SessionItem({
  session: s,
  teamColor,
  isActive,
  isExpanded,
  maestroSession,
  maestroTasks,
  contentTasks,
  isLoadingTasks,
  isResuming,
  onSelect,
  onToggleExpand,
  onRequestClose,
  onOpenSessionModal,
  onOpenLogModal,
  onResume,
}: SessionItemProps) {
  const isExited = Boolean(s.exited);
  const isClosing = Boolean(s.closing);
  const effect = getProcessEffectById(s.effectId);
  const chipLabel = effect?.label ?? s.processTag ?? null;
  const hasAgentIcon = Boolean(effect?.iconSrc);
  const isWorking = Boolean(effect && s.agentWorking && !isExited && !isClosing);
  const isRecording = Boolean(s.recordingActive && !isExited && !isClosing);
  const launchOrRestore =
    s.launchCommand ??
    (s.restoreCommand?.trim() ? s.restoreCommand.trim() : null) ??
    null;
  const isSsh = isSshCommand(launchOrRestore);
  const isPersistent = Boolean(s.persistent);
  const isSshType = isSsh && !isPersistent;
  const isDefaultType = !isPersistent && !isSshType;
  const chipClass = effect
    ? `chip chip-${effect.id}`
    : isSshType
      ? "chip chip-ssh"
      : "chip";
  const showChipLabel =
    Boolean(chipLabel) &&
    !hasAgentIcon &&
    !(isSshType && (chipLabel ?? "").trim().toLowerCase() === "ssh");

  const needsInput = maestroSession?.needsInput?.active;

  const teamSnapshots = maestroSession?.teamMemberSnapshots?.length
    ? maestroSession.teamMemberSnapshots
    : maestroSession?.teamMemberSnapshot
      ? [maestroSession.teamMemberSnapshot]
      : [];

  const hasMaestroTeam = teamSnapshots.length > 0;

  const metadataAgentTool = (maestroSession?.metadata as { agentTool?: string } | undefined)?.agentTool ?? null;
  const agentTool = teamSnapshots[0]?.agentTool
    ?? metadataAgentTool
    ?? (s.effectId === 'codex' ? 'codex' : null);
  const agentToolIcon = agentTool && agentTool in AGENT_TOOL_ICONS
    ? AGENT_TOOL_ICONS[agentTool as keyof typeof AGENT_TOOL_ICONS]
    : null;

  const displayTitle = hasMaestroTeam
    ? teamSnapshots.map(m => m.name).join(', ')
    : s.name;

  const displayAvatar = hasMaestroTeam
    ? teamSnapshots.map(m => m.avatar).join('')
    : null;

  const isLive = isWorking || (maestroSession?.status === 'working' && !isExited && !isClosing);

  const sessionTaskList = useMemo(() => maestroSession
    ? maestroSession.taskIds
        .map((tid: string) => maestroTasks[tid])
        .filter((t): t is MaestroTask => t !== undefined)
    : [], [maestroSession, maestroTasks]);

  return (
    <SortableSessionItem key={s.id} id={s.id}>
    <div
      className={`sessionItem ${isActive ? "sessionItemActive" : ""} ${isExited ? "sessionItemExited" : ""
        } ${isClosing ? "sessionItemClosing" : ""} ${isSshType ? "sessionItemSsh" : ""
        } ${isPersistent ? "sessionItemPersistent" : ""} ${isDefaultType ? "sessionItemDefault" : ""
        } ${needsInput ? "sessionItemNeedsInput" : ""} ${!isActive ? "sessionItemCompact" : ""}`}
      onClick={() => onSelect(s.id)}
      style={{ flexDirection: 'column', alignItems: 'stretch' }}
      {...(s.maestroSessionId ? { 'data-maestro-session-id': s.maestroSessionId } : {})}
    >
      <div className="sessionItemRow">
        <div className="sessionAgentIcon">
          {agentToolIcon ? (
            <div className={`sessionAgentIcon__wrapper ${isLive ? 'sessionAgentIcon__wrapper--live' : ''}`}>
              <img className="sessionAgentIcon__img" src={agentToolIcon} alt={agentTool || 'agent'} />
              {isLive && <span className="sessionAgentIcon__liveDot" />}
            </div>
          ) : hasAgentIcon && effect?.iconSrc ? (
            <div className={`sessionAgentIcon__wrapper ${isLive ? 'sessionAgentIcon__wrapper--live' : ''}`}>
              <img className="sessionAgentIcon__img" src={effect.iconSrc} alt={chipLabel || 'agent'} />
              {isLive && <span className="sessionAgentIcon__liveDot" />}
            </div>
          ) : (
            <div className="sessionAgentIcon__placeholder">
              {isSshType ? '⊕' : '>_'}
            </div>
          )}
        </div>

        <div className="sessionMeta">
          <div className="sessionName">
            {displayAvatar && (
              <span className="sessionItemAvatar" title={teamSnapshots.map(m => `${m.name} (${m.role})`).join(', ')}>
                {displayAvatar}
              </span>
            )}
            <span className="sessionNameText">{displayTitle}</span>
            {showChipLabel && chipLabel && (
              <span className={chipClass} title={chipLabel}>
                <span className="chipLabel">{chipLabel}</span>
                {isWorking && <span className="chipActivity" aria-label="Working" />}
              </span>
            )}
            {isRecording && <span className="recordingDot" title="Recording" />}
            {isClosing ? (
              <span className="sessionStatus">closing…</span>
            ) : isExited ? (
              <span className="sessionStatus">
                exited{s.exitCode != null ? ` ${s.exitCode}` : ""}
              </span>
            ) : null}
          </div>
          {isActive && hasMaestroTeam && (
            <div className="sessionItemSecondary">{s.name}</div>
          )}
        </div>

        {!isActive && maestroSession && (
          <span className={`sessionStatusBadge sessionStatusBadge--${maestroSession.status}`}>
            {maestroSession.status === 'spawning' ? 'SPAWN' : maestroSession.status === 'stopped' ? 'STOP' : maestroSession.status.toUpperCase()}
          </span>
        )}
      </div>

      {isActive && (
        <>
          {maestroSession && (
            <div className="sessionItemStatusRow">
              <span className={`sessionStatusBadge sessionStatusBadge--${maestroSession.status} sessionStatusBadge--clickable`}
                onClick={(e) => { e.stopPropagation(); onOpenSessionModal(maestroSession.id); }}>
                {maestroSession.status === 'spawning' ? 'SPAWN' : maestroSession.status === 'stopped' ? 'STOP' : maestroSession.status.toUpperCase()}
              </span>
              {needsInput && (
                <span className="sessionStatusBadge sessionStatusBadge--needsInput">NEEDS INPUT</span>
              )}
            </div>
          )}

          {sessionTaskList.length > 0 && (
            <div className="sessionItemTaskChips">
              {sessionTaskList.slice(0, 4).map(task => (
                <span key={task.id} className={`sessionTaskChip sessionTaskChip--${task.status}`} title={`${task.title} (${task.status})`}>
                  <span className="sessionTaskChip__dot" />
                  <span className="sessionTaskChip__label">{task.title}</span>
                </span>
              ))}
              {sessionTaskList.length > 4 && (
                <span className="sessionTaskChip sessionTaskChip--more">+{sessionTaskList.length - 4}</span>
              )}
            </div>
          )}

          {isExpanded && maestroSession && (
            <MaestroSessionContent
              session={maestroSession}
              tasks={contentTasks}
              allTasks={maestroTasks}
              loading={isLoadingTasks}
            />
          )}
          {isExpanded && !maestroSession && isLoadingTasks && (
            <div className="terminalSubtasks" style={{ padding: '8px 24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                Loading session data...
              </div>
            </div>
          )}

          <div className="sessionItemBottomActions">
            {s.maestroSessionId && (
              <button type="button"
                className={`sessionItemBottomBtn ${isExpanded ? 'sessionItemBottomBtn--active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToggleExpand(s.id, s.maestroSessionId); }}
                title="Expand session details"
              >
                <Icon name="layers" size={12} />
                <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
              </button>
            )}
            <button type="button"
              className="sessionItemBottomBtn"
              onClick={(e) => { e.stopPropagation(); onOpenLogModal(s.id); }}
              title="View session log"
            >
              <Icon name="log" size={12} />
              <span>Logs</span>
            </button>
            {maestroSession && (maestroSession.metadata?.agentTool || 'claude-code') === 'claude-code' && (
              <button type="button"
                className="sessionItemBottomBtn sessionItemBottomBtn--resume"
                disabled={isResuming}
                onClick={(e) => { e.stopPropagation(); onResume(maestroSession.id); }}
                title="Resume this Claude session"
              >
                <Icon name="refresh" size={12} />
                <span>{isResuming ? 'Resuming...' : 'Resume'}</span>
              </button>
            )}
            <button type="button"
              className="sessionItemBottomBtn sessionItemBottomBtn--danger"
              disabled={isClosing}
              onClick={(e) => { e.stopPropagation(); onRequestClose(s); }}
              title="Close session"
            >
              <span>Close</span>
            </button>
          </div>
        </>
      )}
    </div>
    </SortableSessionItem>
  );
});

export const SessionsSection = React.memo(function SessionsSection({
  agentShortcuts,
  sessions,
  activeSessionId,
  activeProjectId,
  projectName,
  projectBasePath,
  onSelectSession,
  onCloseSession,
  onReorderSessions,
  onQuickStart,
  onOpenNewSession,
  onOpenAgentShortcuts,
  onOpenPersistentSessions,
  onOpenSshManager,
  onOpenManageTerminals,
  onCreateWhiteboard,
  onCloseSpace,
}: SessionsSectionProps) {
  // ==================== SEGMENTED FILTER ====================
  type SessionFilter = 'terminals' | 'sessions' | 'documents';
  const [activeFilters, setActiveFilters] = useState<Set<SessionFilter>>(
    new Set<SessionFilter>(['terminals', 'sessions', 'documents'])
  );

  const toggleFilter = useCallback((filter: SessionFilter) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(filter)) {
        // Don't allow deselecting all — keep at least one
        if (next.size > 1) next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }, []);

  // ==================== STATE MANAGEMENT (PHASE V) ====================

  const settingsMenuRef = React.useRef<HTMLDivElement | null>(null);
  const settingsBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsDropdownPos, setSettingsDropdownPos] = React.useState<{ top: number; right: number } | null>(null);

  const computeDropdownPos = useCallback((btnRef: React.RefObject<HTMLButtonElement | null>) => {
    const btn = btnRef.current;
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    return { top: rect.bottom + 4, right: window.innerWidth - rect.right };
  }, []);

  useLayoutEffect(() => {
    if (settingsOpen) {
      setSettingsDropdownPos(computeDropdownPos(settingsBtnRef));
    }
  }, [settingsOpen, computeDropdownPos]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const draggedSession = sessions.find((s) => s.id === active.id);
      const targetSession = sessions.find((s) => s.id === over.id);
      if (!draggedSession || !targetSession) return;

      onReorderSessions(draggedSession.persistId, targetSession.persistId);
    },
    [sessions, onReorderSessions]
  );

  const [sessionModalId, setSessionModalId] = React.useState<string | null>(null);
  const [logModalSessionId, setLogModalSessionId] = React.useState<string | null>(null);

  // Session close confirmation state
  const [sessionToClose, setSessionToClose] = React.useState<Session | null>(null);

  // Session resume confirmation state (for resuming a session whose PTY is still live)
  const [sessionToResume, setSessionToResume] = React.useState<{ maestroSessionId: string; label: string } | null>(null);

  // Maestro session expansion state
  const [expandedSessions, setExpandedSessions] = React.useState<Set<string>>(new Set());
  const [loadingTasks, setLoadingTasks] = React.useState<Set<string>>(new Set());
  const [resumingSessionId, setResumingSessionId] = React.useState<string | null>(null);

  // Use Zustand store - WebSocket updates are automatic
  const maestroTasks = useMaestroStore((s) => s.tasks);
  const maestroSessions = useMaestroStore((s) => s.sessions);
  const fetchSession = useMaestroStore((s) => s.fetchSession);
  const resumeSession = useMaestroStore((s) => s.resumeSession);
  const hardRefresh = useMaestroStore((s) => s.hardRefresh);

  // Teams from store
  const teamsMap = useMaestroStore((s) => s.teams);

  const teamGroupData = useMemo(() => {
    return buildTeamGroups(sessions, maestroSessions, teamsMap);
  }, [sessions, maestroSessions, teamsMap]);

  const { grouped: groupedSessions, ungrouped: ungroupedSessions } = useMemo(() => {
    return getGroupedSessionOrder(sessions, teamGroupData.groups);
  }, [sessions, teamGroupData.groups]);

  const [showHistory, setShowHistory] = React.useState(false);
  const historyBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [historyDropdownPos, setHistoryDropdownPos] = React.useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (showHistory) {
      setHistoryDropdownPos(computeDropdownPos(historyBtnRef));
    }
  }, [showHistory, computeDropdownPos]);

  // All sessions in the project are resumable — live ones will warn before replacing the running process.
  const historySessions = useMemo(() => {
    return Object.values(maestroSessions)
      .filter(s => s.projectId === activeProjectId)
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }, [maestroSessions, activeProjectId]);

  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = React.useCallback(async () => {
    if (!activeProjectId || refreshing) return;
    setRefreshing(true);
    try {
      await hardRefresh(activeProjectId);
    } catch (err) {
    } finally {
      setRefreshing(false);
    }
  }, [activeProjectId, refreshing, hardRefresh]);

  const handleShowBoard = React.useCallback(() => {
    useUIStore.getState().setShowBoardRequested(true);
  }, []);

  // Compute session tasks from global state
  const sessionTasks = React.useMemo(() => {
    const result: Record<string, MaestroTask[]> = {};

    for (const session of sessions) {
      if (session.maestroSessionId && expandedSessions.has(session.id)) {
        const maestroSession = maestroSessions[session.maestroSessionId];

        if (maestroSession) {
          const tasks = maestroSession.taskIds
            .map((taskId: string) => maestroTasks[taskId])
            .filter((task): task is MaestroTask => task !== undefined);

          result[session.id] = tasks;
        }
      }
    }

    return result;
  }, [maestroSessions, maestroTasks, sessions, expandedSessions]);

  // Fetch Maestro data for a session (using global context)
  const fetchMaestroData = useCallback(async (sessionId: string, maestroSessionId: string) => {
    setLoadingTasks(prev => new Set(prev).add(sessionId));
    try {
      await fetchSession(maestroSessionId);
    } catch (err) {
    } finally {
      setLoadingTasks(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }, [fetchSession]);

  // Function to toggle session expansion
  const toggleSession = useCallback((sessionId: string, maestroSessionId?: string | null) => {
    if (!maestroSessionId) return;

    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
        fetchMaestroData(sessionId, maestroSessionId);
      }
      return next;
    });
  }, [fetchMaestroData]);

  React.useEffect(() => {
    if (!settingsOpen && !showHistory) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      setShowHistory(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsOpen, showHistory]);

  // Non-session spaces (whiteboards, documents)
  const allSpaces = useSpacesStore((s) => s.spaces);
  const projectSpaces = useMemo(
    () => allSpaces.filter((s) => s.projectId === activeProjectId),
    [allSpaces, activeProjectId],
  );

  // Joined Collab Spaces matching the active project's git remote
  const { spaces: collabSpaces } = useProjectCollabSpaces();

  // Filter sessions based on active filters
  const showTerminals = activeFilters.has('terminals');
  const showSessions = activeFilters.has('sessions');
  const showDocuments = activeFilters.has('documents');

  const filteredUngroupedSessions = useMemo(() => {
    return ungroupedSessions.filter(s => {
      const isMaestro = Boolean(s.maestroSessionId);
      if (isMaestro) return showSessions;
      return showTerminals;
    });
  }, [ungroupedSessions, showTerminals, showSessions]);

  const filteredGroupedSessions = useMemo(() => {
    // Team groups are maestro sessions, so filter by "sessions"
    return showSessions ? groupedSessions : [];
  }, [groupedSessions, showSessions]);

  const filteredSpaces = useMemo(() => {
    return showDocuments ? projectSpaces : [];
  }, [projectSpaces, showDocuments]);

  // Phase 3: Memoize SortableContext items
  const sortableSessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);

  // Phase 5: Stable callbacks for SessionItem
  const handleRequestClose = useCallback((session: Session) => {
    const isActiveSession = !session.exited && !session.closing;
    if (isActiveSession) {
      setSessionToClose(session);
    } else {
      onCloseSession(session.id);
    }
  }, [onCloseSession]);

  const doResume = useCallback(async (maestroSessionId: string) => {
    setResumingSessionId(maestroSessionId);
    try {
      await resumeSession(maestroSessionId);
    } catch (err) {
      console.error('Failed to resume session:', err);
      useUIStore.getState().reportError('Failed to resume session', err);
    } finally {
      setResumingSessionId(null);
    }
  }, [resumeSession]);

  const handleResume = useCallback(async (maestroSessionId: string) => {
    const liveTerminal = sessions.find(
      (s) => s.maestroSessionId === maestroSessionId && !s.exited && !s.closing
    );
    if (liveTerminal) {
      const ms = maestroSessions[maestroSessionId];
      const label = ms?.teamMemberSnapshot?.name || ms?.name || liveTerminal.name;
      setSessionToResume({ maestroSessionId, label });
      return;
    }
    await doResume(maestroSessionId);
  }, [sessions, maestroSessions, doResume]);

  // Helper to render a session item using the extracted SessionItem component
  const renderSessionItem = useCallback((s: Session, teamColor: TeamColor | null) => {
    const maestroSession = s.maestroSessionId ? maestroSessions[s.maestroSessionId] ?? null : null;
    return (
      <SessionItem
        key={s.id}
        session={s}
        teamColor={teamColor}
        isActive={s.id === activeSessionId}
        isExpanded={expandedSessions.has(s.id)}
        maestroSession={maestroSession}
        maestroTasks={maestroTasks}
        contentTasks={sessionTasks[s.id] || []}
        isLoadingTasks={loadingTasks.has(s.id)}
        isResuming={resumingSessionId === (maestroSession?.id ?? '')}
        onSelect={onSelectSession}
        onToggleExpand={toggleSession}
        onRequestClose={handleRequestClose}
        onOpenSessionModal={setSessionModalId}
        onOpenLogModal={setLogModalSessionId}
        onResume={handleResume}
      />
    );
  }, [activeSessionId, expandedSessions, maestroSessions, maestroTasks, sessionTasks, loadingTasks, resumingSessionId, onSelectSession, toggleSession, handleRequestClose, handleResume]);

  return (
    <>
      {/* Top: Collab Spaces — header on the left, joined-space avatars on the right */}
      <div className="sidebarHeader collabSpacesHeader">
        <div className="title">Spaces</div>
        <div className="sidebarHeaderActions collabSpacesHeaderRail">
          {collabSpaces.length === 0 ? (
            <span className="collabSpacesHeaderEmpty" title="Join a Space from the Collab tab">
              none yet
            </span>
          ) : (
            collabSpaces.map((cs) => {
              const activeId = makeCollabActiveId(cs.id);
              const isActive = activeId === activeSessionId;
              return (
                <button
                  type="button"
                  key={cs.id}
                  className={`collabSpacesHeaderButton ${isActive ? "collabSpacesHeaderButton--active" : ""}`}
                  onClick={() => onSelectSession(activeId)}
                  title={`${cs.name} · ${cs.githubUrl}`}
                >
                  <SpaceAvatar colorKey={cs.id} name={cs.name} size={22} />
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="sidebarHeader">
        <div className="title">Sessions</div>
        <div className="sidebarHeaderActions">
          <button
            type="button"
            className="btnSmall btnIcon"
            onClick={handleRefresh}
            disabled={refreshing || !activeProjectId}
            title="Refresh tasks"
            aria-label="Refresh tasks"
          >
            <Icon name="refresh" />
          </button>
          <button
            type="button"
            className="btnSmall btnIcon"
            onClick={handleShowBoard}
            disabled={!activeProjectId}
            title="Open board view"
            aria-label="Open board view"
          >
            <Icon name="layers" />
          </button>
          <button
            ref={historyBtnRef}
            type="button"
            className={`btnSmall btnIcon ${showHistory ? "btnIconActive" : ""}`}
            onClick={() => setShowHistory(prev => !prev)}
            disabled={!activeProjectId}
            title="Session history"
            aria-label="Session history"
          >
            <Icon name="clock" />
            {historySessions.length > 0 && (
              <span className="iconRailBadge iconRailBadge--history">{historySessions.length > 99 ? '99+' : historySessions.length}</span>
            )}
          </button>
          <div className="sidebarActionMenu" ref={settingsMenuRef}>
            <button
              ref={settingsBtnRef}
              type="button"
              className={`btnSmall btnIcon ${settingsOpen ? "btnIconActive" : ""}`}
              onClick={() =>
                setSettingsOpen((prev) => !prev)
              }
              title="Session tools"
              aria-label="Session tools"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
            >
              <Icon name="settings" />
            </button>
            {settingsOpen && settingsDropdownPos && createPortal(
              <>
                <div
                  className="terminalInlineStatusOverlay"
                  onClick={() => setSettingsOpen(false)}
                />
                <div
                  className="sidebarActionMenuDropdown sidebarActionMenuDropdown--fixed"
                  role="menu"
                  aria-label="Session tools"
                  style={{ position: 'fixed', top: settingsDropdownPos.top, right: settingsDropdownPos.right }}
                >
                  <button
                    type="button"
                    className="sidebarActionMenuItem"
                    role="menuitem"
                    onClick={() => {
                      setSettingsOpen(false);
                      onOpenAgentShortcuts();
                    }}
                  >
                    <Icon name="bolt" />
                    <span>Agent shortcuts</span>
                  </button>
                  <button
                    type="button"
                    className="sidebarActionMenuItem"
                    role="menuitem"
                    onClick={() => {
                      setSettingsOpen(false);
                      onOpenManageTerminals();
                    }}
                  >
                    <Icon name="files" />
                    <span>Manage terminals</span>
                  </button>
                  <button
                    type="button"
                    className="sidebarActionMenuItem"
                    role="menuitem"
                    onClick={() => {
                      setSettingsOpen(false);
                      onOpenPersistentSessions();
                    }}
                  >
                    <Icon name="layers" />
                    <span
                      className="sessionLegendSwatch sessionLegendSwatchPersistent"
                      aria-hidden="true"
                    />
                    <span>Manage persistent terminals</span>
                  </button>
                </div>
              </>,
              document.body
            )}
          </div>
        </div>
      </div>

      {/* Session History Dropdown */}
      {showHistory && historyDropdownPos && createPortal(
        <>
          <div
            className="terminalInlineStatusOverlay"
            onClick={() => setShowHistory(false)}
          />
          <div
            className="sessionHistoryDropdown"
            style={{ position: 'fixed', top: historyDropdownPos.top, right: historyDropdownPos.right }}
          >
            <div className="sessionHistoryDropdown__header">
              <span>Session History</span>
              <span className="sessionHistoryDropdown__count">{historySessions.length}</span>
            </div>
            {historySessions.length === 0 ? (
              <div className="sessionHistoryDropdown__empty">No past sessions</div>
            ) : (
              <VirtualizedHistoryList
                historySessions={historySessions}
                resumingSessionId={resumingSessionId}
                onResume={handleResume}
                setShowHistory={setShowHistory}
                maestroTasks={maestroTasks}
              />
            )}
          </div>
        </>,
        document.body
      )}

      <div className="agentShortcutRow" role="toolbar" aria-label="Quick launch">
        <button
          type="button"
          className="agentShortcutBtn"
          onClick={onOpenNewSession}
          title="New terminal"
        >
          <span className="agentShortcutIconFallback" aria-hidden="true">
            {">_"}
          </span>
          <span className="agentShortcutLabel">Terminal</span>
        </button>
        {agentShortcuts.map((effect) => (
          <button
            key={effect.id}
            type="button"
            className="agentShortcutBtn"
            onClick={() => onQuickStart(effect)}
            title={`Start ${effect.label}`}
          >
            {effect.iconSrc ? (
              <img className="agentShortcutIcon" src={effect.iconSrc} alt="" aria-hidden="true" />
            ) : (
              <span className="agentShortcutIconFallback" aria-hidden="true">
                {"\u25B6"}
              </span>
            )}
            <span className="agentShortcutLabel">{effect.label}</span>
          </button>
        ))}
      </div>

      {/* Segmented filter: Terminals / Sessions / Documents */}
      <div className="sessionsSegmentedFilter">
        {(['terminals', 'sessions', 'documents'] as SessionFilter[]).map(filter => (
          <button
            key={filter}
            type="button"
            className={`sessionsSegmentedFilter__btn ${activeFilters.has(filter) ? 'sessionsSegmentedFilter__btn--active' : ''}`}
            onClick={() => toggleFilter(filter)}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      <div className="sessionList">
        {sessions.length === 0 ? (
          <div className="empty">No sessions in this project.</div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
          <SortableContext
            items={sortableSessionIds}
            strategy={verticalListSortingStrategy}
          >
          {/* Grouped sessions (coordinator teams) */}
          {filteredGroupedSessions.map(({ group, sessions: groupSess }) => {
            const coordSession = groupSess[0]; // coordinator is always first

            return (
              <TeamSessionGroup
                key={group.teamSessionId}
                group={group}
                maestroSessions={maestroSessions}
                maestroTasks={maestroTasks}
                teamsMap={teamsMap}
                renderSessionItem={() => null}
                renderAllSessionItems={() => (
                  <div className="teamGroupSessions">
                    {groupSess.map((s) => renderSessionItem(s, group.color))}
                  </div>
                )}
                renderCoordinatorOnly={() => (
                  <div className="teamGroupSessions">
                    {coordSession && renderSessionItem(coordSession, group.color)}
                  </div>
                )}
              />
            );
          })}

          {/* Ungrouped sessions (plain terminals, no coordinator) */}
          {filteredUngroupedSessions.map((s) => renderSessionItem(s, null))}
          </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Whiteboard & Document spaces */}
      {(filteredSpaces.length > 0 || (showDocuments && onCreateWhiteboard)) && (
        <>
          <div className="sidebarHeader" style={{ marginTop: 8 }}>
            <div className="title">Spaces</div>
            <div className="sidebarHeaderActions">
              {showDocuments && onCreateWhiteboard && (
                <button
                  type="button"
                  className="btnSmall btnIcon"
                  onClick={onCreateWhiteboard}
                  title="New Whiteboard"
                  aria-label="New Whiteboard"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                    <line x1="8" y1="3" x2="8" y2="13" strokeLinecap="round" />
                    <line x1="3" y1="8" x2="13" y2="8" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="sessionList">
            {filteredSpaces.map((space) => {
              const isActive = space.id === activeSessionId;
              return (
                <div
                  key={space.id}
                  className={`sessionItem ${isActive ? "sessionItemActive" : ""}`}
                  onClick={() => onSelectSession(space.id)}
                >
                  <div className="sessionItemRow">
                    <div className="sessionAgentIcon">
                      <div className="sessionAgentIcon__placeholder">
                        {space.type === "whiteboard" ? (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                            <path d="M3 17l3.5-3.5M6.5 13.5l-2-2L14 2l2 2L6.5 13.5z" strokeLinejoin="round" />
                            <path d="M12 4l2 2" strokeLinecap="round" />
                          </svg>
                        ) : space.type === "file" ? (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                            <path d="M5 2h7l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
                            <path d="M12 2v4h4" />
                            <path d="M8 11l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M12 11l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                            <path d="M5 2h7l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
                            <path d="M12 2v4h4" />
                            <path d="M7 10h6M7 13h4" strokeLinecap="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className="sessionMeta">
                      <div className="sessionName">
                        <span className="sessionNameText">{space.name}</span>
                        <span className="chip">{space.type === "whiteboard" ? "whiteboard" : space.type === "file" ? "file" : "document"}</span>
                      </div>
                    </div>
                    <div className="sessionItemActions">
                      {onCloseSpace && (
                        <button type="button"
                          className="closeBtn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCloseSpace(space.id);
                          }}
                          title={`Close ${space.type}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {sessionModalId && createPortal(
        <SessionDetailModal
          sessionId={sessionModalId}
          isOpen={true}
          onClose={() => setSessionModalId(null)}
        />,
        document.body
      )}

      {logModalSessionId && (() => {
        const logSession = sessions.find(s => s.id === logModalSessionId);
        const logMaestroSession = logSession?.maestroSessionId ? maestroSessions[logSession.maestroSessionId] ?? null : null;
        const logSnapshots = logMaestroSession?.teamMemberSnapshots?.length
          ? logMaestroSession.teamMemberSnapshots
          : logMaestroSession?.teamMemberSnapshot
            ? [logMaestroSession.teamMemberSnapshot]
            : [];
        const logMetadataAgentTool = (logMaestroSession?.metadata as { agentTool?: string } | undefined)?.agentTool ?? null;
        const logAgentTool = logSnapshots[0]?.agentTool
          ?? logMetadataAgentTool
          ?? (logSession?.effectId === 'codex' ? 'codex' : null);
        return logSession?.cwd ? createPortal(
          <SessionLogModal
            sessionName={logSession.name}
            cwd={logSession.cwd}
            maestroSessionId={logSession.maestroSessionId}
            agentTool={logAgentTool}
            onClose={() => setLogModalSessionId(null)}
          />,
          document.body
        ) : null;
      })()}

      {sessionToClose && createPortal(
        <ConfirmActionModal
          isOpen={true}
          title="[ CLOSE SESSION ]"
          message={
            <>
              Are you sure you want to close the session <strong>{sessionToClose.name}</strong>?
              {sessionToClose.agentWorking && (
                <div style={{ marginTop: '8px', color: 'var(--warning)' }}>
                  This session has an agent currently working.
                </div>
              )}
            </>
          }
          confirmLabel="Close Session"
          cancelLabel="Cancel"
          confirmDanger={true}
          onClose={() => setSessionToClose(null)}
          onConfirm={() => {
            onCloseSession(sessionToClose.id);
            setSessionToClose(null);
          }}
        />,
        document.body
      )}

      {sessionToResume && createPortal(
        <ConfirmActionModal
          isOpen={true}
          title="[ RESUME SESSION ]"
          message={
            <>
              <strong>{sessionToResume.label}</strong> is still running. Resuming will stop the current Claude process and start a new one attached to the existing transcript.
              <div style={{ marginTop: '8px', color: 'var(--warning)' }}>
                Any in-flight work in the live process will be interrupted.
              </div>
            </>
          }
          confirmLabel="Stop & Resume"
          cancelLabel="Cancel"
          confirmDanger={true}
          onClose={() => setSessionToResume(null)}
          onConfirm={() => {
            const id = sessionToResume.maestroSessionId;
            setSessionToResume(null);
            void doResume(id);
          }}
        />,
        document.body
      )}

    </>
  );
});
