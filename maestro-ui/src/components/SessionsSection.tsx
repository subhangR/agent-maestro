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
import { type MaestroTask, type MaestroSession as MaestroSession, type Team, type AgentTool } from "../app/types/maestro";
import { AgentLogo } from "./maestro/AgentChip";
import { useMaestroStore } from "../stores/useMaestroStore";
import { useUIStore } from "../stores/useUIStore";
import { MaestroSessionContent } from "./maestro/MaestroSessionContent";
import { SessionDetailModal } from "./maestro/SessionDetailModal";
import { SessionLogModal } from "./session-log/SessionLogModal";
import { ConfirmActionModal } from "./modals/ConfirmActionModal";
import { buildTeamGroups, type TeamGroup } from "../utils/teamGrouping";
import type { TeamColor } from "../app/constants/teamColors";
import { ProjectDocsList } from "./ProjectDocsList";
import { useProjectDocsPaginated } from "../hooks/useProjectDocsPaginated";
import { useSessionTree } from "../hooks/useSessionTree";
import { SessionListItem, type SessionTileLinkInfo } from "./maestro/SessionListItem";
import type { SessionTreeNode } from "../app/types/maestro";
import { resolveSessionTab, buildChildrenByParent, collectSubtreeIds as collectSubtreeIdsUtil, type SessionSubTab, type SessionLifecycleTab } from "../utils/sessionLifecycle";
import { HuddlesList } from "./maestro/HuddlesList";
import { ListEndFooter } from "./maestro/ListEndFooter";
import type { Huddle } from "../app/types/maestro";
import { maestroClient } from "../utils/MaestroClient";
import { willOpenStatsOnClick } from "../utils/sessionClickRouting";

// Quick-launch shortcut id → brand logo + display name.
const SHORTCUT_AGENT_TOOL: Record<string, AgentTool> = {
  claude: "claude-code",
  codex: "codex",
  gemini: "gemini",
  hermes: "hermes",
};
const SHORTCUT_LABEL: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  hermes: "Hermes",
};

function formatSpaceAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Phase 2: Module-scope static constants
const AGENT_TOOL_ICONS: Record<string, string> = {
  'claude-code': '/agent-icons/claude-code-icon.png',
  'codex': '/agent-icons/openai-codex-icon.png',
  'gemini': '/agent-icons/gemini-logo.png',
};

// Segmented filter tabs — icon + label. Each toggles one section independently.
const FilterTerminalIcon = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="15" height="15">
    <rect x="2" y="3" width="16" height="14" rx="2" />
    <path d="M6 9l3 2-3 2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 13h4" strokeLinecap="round" />
  </svg>
);
const FilterAgentsIcon = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="15" height="15">
    <path d="M10 2.5l1.6 4.3 4.4 1.7-4.4 1.7L10 14.5 8.4 10.2 4 8.5l4.4-1.7L10 2.5z" strokeLinejoin="round" />
    <path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" strokeLinejoin="round" />
  </svg>
);
const FilterDocsIcon = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="15" height="15">
    <path d="M5 2h7l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
    <path d="M12 2v4h4" />
    <path d="M7 10h6M7 13h4" strokeLinecap="round" />
  </svg>
);
const FilterDrawingsIcon = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="15" height="15">
    <path d="M3 17l3.5-3.5M6.5 13.5l-2-2L14 2l2 2L6.5 13.5z" strokeLinejoin="round" />
    <path d="M12 4l2 2" strokeLinecap="round" />
  </svg>
);
// Quick-launch terminal mark (icon-only chip in the first row).
const QuickTerminalIcon = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="16" height="16">
    <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
    <path d="M6 8.5l2.5 1.8L6 12.1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.5 12.5h4" strokeLinecap="round" />
  </svg>
);

const SESSION_FILTER_TABS: {
  id: 'terminals' | 'agents' | 'docs' | 'drawings';
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: 'terminals', label: 'Terminals', icon: FilterTerminalIcon },
  { id: 'agents', label: 'Agents', icon: FilterAgentsIcon },
  { id: 'docs', label: 'Docs', icon: FilterDocsIcon },
  { id: 'drawings', label: 'Drawings', icon: FilterDrawingsIcon },
];

// Canonical display order for the icon-only agent quick-launch row.
const QUICK_AGENT_ORDER = ['claude', 'codex', 'hermes', 'gemini'];

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
  resumeSession,
  setShowHistory,
  maestroTasks,
}: {
  historySessions: MaestroSession[];
  resumingSessionId: string | null;
  resumeSession: (id: string) => Promise<any>;
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
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await resumeSession(hs.id);
                        setShowHistory(false);
                      } catch (err) {
                        console.error('Failed to resume session:', err);
                      }
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
              {isLive && <span className={`sessionAgentIcon__liveDot${isWorking ? " sessionAgentIcon__liveDot--streaming" : ""}`} />}
            </div>
          ) : hasAgentIcon && effect?.iconSrc ? (
            <div className={`sessionAgentIcon__wrapper ${isLive ? 'sessionAgentIcon__wrapper--live' : ''}`}>
              <img className="sessionAgentIcon__img" src={effect.iconSrc} alt={chipLabel || 'agent'} />
              {isLive && <span className={`sessionAgentIcon__liveDot${isWorking ? " sessionAgentIcon__liveDot--streaming" : ""}`} />}
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
            {maestroSession
              && (maestroSession.metadata?.agentTool || 'claude-code') === 'claude-code' && (
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

// ==================== SESSION TREE RENDERER ====================
interface SessionNodeRendererProps {
  node: SessionTreeNode;
  depth: number;
  tab: SessionLifecycleTab;
  collapsedSessions: Set<string>;
  maestroColorMap: Map<string, TeamColor>;
  linkMap: Map<string, SessionTileLinkInfo>;
  activeLocalSessionId: string | null;
  inspectedSessionId: string | null;
  maestroTasks: Record<string, MaestroTask>;
  resumingSessionId: string | null;
  onToggleCollapse: (sessionId: string) => void;
  onOpenDetail: (sessionId: string) => void;
  onSelect: (session: MaestroSession, link: SessionTileLinkInfo | null) => void;
  onJumpToTerminal: (session: MaestroSession, link: SessionTileLinkInfo | null) => void;
  onStop: (session: MaestroSession, link: SessionTileLinkInfo | null) => void;
  onResume: (sessionId: string) => void;
  onRestore: (session: MaestroSession) => void;
  onToggleHumanComplete: (session: MaestroSession) => void;
  onOpenTeamView: (session: MaestroSession) => void;
}

const SessionNodeRenderer = React.memo(function SessionNodeRenderer({
  node,
  depth,
  tab,
  collapsedSessions,
  maestroColorMap,
  linkMap,
  activeLocalSessionId,
  inspectedSessionId,
  maestroTasks,
  resumingSessionId,
  onToggleCollapse,
  onOpenDetail,
  onSelect,
  onJumpToTerminal,
  onStop,
  onResume,
  onRestore,
  onToggleHumanComplete,
  onOpenTeamView,
}: SessionNodeRendererProps) {
  const isCollapsed = collapsedSessions.has(node.id);
  const link = linkMap.get(node.id) ?? null;
  const teamColor = maestroColorMap.get(node.id) ?? null;
  // Exactly one tile is "current", derived from a single source of truth: if a
  // session is being inspected (stats view), that tile is current; otherwise the
  // tile whose terminal is active in the workspace. No sticky local state, so the
  // highlight always tracks what the center pane actually shows.
  const isSelected = inspectedSessionId != null
    ? node.id === inspectedSessionId
    : Boolean(link && link.localSessionId === activeLocalSessionId);

  return (
    <div
      className={`sessionTreeNode ${depth > 0 ? "sessionTreeNode--child" : ""}`}
      data-maestro-session-id={node.id}
    >
      <SessionListItem
        session={node}
        depth={depth}
        teamColor={teamColor}
        childCount={node.children.length}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => onToggleCollapse(node.id)}
        link={link}
        isSelected={isSelected}
        maestroTasks={maestroTasks}
        tab={tab}
        onOpenDetail={onOpenDetail}
        onSelect={onSelect}
        onJumpToTerminal={onJumpToTerminal}
        onStop={onStop}
        onResume={onResume}
        onRestore={onRestore}
        onToggleHumanComplete={onToggleHumanComplete}
        onOpenTeamView={onOpenTeamView}
        isResuming={resumingSessionId === node.id}
      />
      {!isCollapsed && node.children.length > 0 && (
        <div className="pn-kids pn-kids--st">
          {node.children.map((child) => (
            <SessionNodeRenderer
              key={child.id}
              node={child}
              depth={depth + 1}
              tab={tab}
              collapsedSessions={collapsedSessions}
              maestroColorMap={maestroColorMap}
              linkMap={linkMap}
              activeLocalSessionId={activeLocalSessionId}
              inspectedSessionId={inspectedSessionId}
              maestroTasks={maestroTasks}
              resumingSessionId={resumingSessionId}
              onToggleCollapse={onToggleCollapse}
              onOpenDetail={onOpenDetail}
              onSelect={onSelect}
              onJumpToTerminal={onJumpToTerminal}
              onStop={onStop}
              onResume={onResume}
              onRestore={onRestore}
              onToggleHumanComplete={onToggleHumanComplete}
              onOpenTeamView={onOpenTeamView}
            />
          ))}
        </div>
      )}
    </div>
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
  type SessionFilter = 'terminals' | 'agents' | 'docs' | 'drawings';
  const [activeFilter, setActiveFilter] = useState<SessionFilter>('agents');

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
  // Maestro spawn-tree close confirmation (cascades to all sub-sessions)
  const [treeToClose, setTreeToClose] = React.useState<MaestroSession | null>(null);

  // Maestro session expansion state
  const [expandedSessions, setExpandedSessions] = React.useState<Set<string>>(new Set());
  const [loadingTasks, setLoadingTasks] = React.useState<Set<string>>(new Set());

  // Use Zustand store - WebSocket updates are automatic
  const maestroTasks = useMaestroStore((s) => s.tasks);
  const maestroSessions = useMaestroStore((s) => s.sessions);
  const fetchSession = useMaestroStore((s) => s.fetchSession);
  const resumeSessionFlow = useMaestroStore((s) => s.resumeSessionFlow);
  const resumingSessionId = useMaestroStore((s) => s.resumingSessionId);
  const setSessionHumanComplete = useMaestroStore((s) => s.setSessionHumanComplete);
  const setSessionArchived = useMaestroStore((s) => s.setSessionArchived);
  const hardRefresh = useMaestroStore((s) => s.hardRefresh);

  // Teams from store
  const teamsMap = useMaestroStore((s) => s.teams);

  // The inspected maestro session (stats view in the center pane). Together with
  // the active terminal this is the single source of truth for which tile is
  // "current" — no separate sticky local state to drift out of sync.
  const inspectedSessionId = useUIStore((s) => s.inspectedSessionId);

  // Always-current view of `sessions` for use inside reference-stable callbacks.
  // Lets handleSelectTile read the live array without listing `sessions` as a
  // dependency, so the callback identity stays stable across WebSocket ticks and
  // doesn't defeat React.memo on every SessionNodeRenderer.
  const sessionsRef = React.useRef(sessions);
  sessionsRef.current = sessions;

  const teamGroupData = useMemo(() => {
    return buildTeamGroups(sessions, maestroSessions, teamsMap);
  }, [sessions, maestroSessions, teamsMap]);

  // Pure-read index: coordinator maestroSessionId → its TeamGroup. Lets the tree
  // wrap each coordinator root in a pn-team box (head: dot/name/count) with no new
  // grouping logic — all data comes from buildTeamGroups above.
  const teamGroupByCoordinator = useMemo(() => {
    const m = new Map<string, TeamGroup>();
    for (const g of teamGroupData.groups) m.set(g.coordinatorMaestroSessionId, g);
    return m;
  }, [teamGroupData.groups]);

  const [showHistory, setShowHistory] = React.useState(false);
  const showTaskDetails = useUIStore((s) => s.sessionShowTaskDetails);
  const toggleSessionShowTaskDetails = useUIStore((s) => s.toggleSessionShowTaskDetails);
  const historyBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [historyDropdownPos, setHistoryDropdownPos] = React.useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (showHistory) {
      setHistoryDropdownPos(computeDropdownPos(historyBtnRef));
    }
  }, [showHistory, computeDropdownPos]);

  // Past sessions available for resume. Resume is allowed from ANY status:
  // the server-side `status` is unreliable and frequently sticks at 'working'/
  // 'spawning' for sessions whose terminal has actually exited, so we never gate
  // the history list on it — every session in the project is resumable here.
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

  // Filter sessions based on active tab
  const showTerminals = activeFilter === 'terminals';
  const showAgents = activeFilter === 'agents';
  const showDocs = activeFilter === 'docs';
  const showDrawings = activeFilter === 'drawings';

  // Plain local terminals only (maestro sessions render via the tree below).
  const filteredTerminalSessions = useMemo(() => {
    if (!showTerminals) return [];
    return sessions.filter((s) => !s.maestroSessionId);
  }, [sessions, showTerminals]);

  // Phase 3: Memoize SortableContext items (plain terminals only)
  const sortableSessionIds = useMemo(
    () => filteredTerminalSessions.map((s) => s.id),
    [filteredTerminalSessions],
  );

  // Phase 5: Stable callbacks for SessionItem
  // Closing a session's terminal also archives its maestro session record
  // (moves it to the Archived tab). The record stays intact and resumable.
  const closeAndArchive = useCallback((session: Session) => {
    if (session.maestroSessionId) {
      void setSessionArchived(session.maestroSessionId, true);
    }
    onCloseSession(session.id);
  }, [onCloseSession, setSessionArchived]);

  const handleRequestClose = useCallback((session: Session) => {
    const isActiveSession = !session.exited && !session.closing;
    if (isActiveSession) {
      setSessionToClose(session);
    } else {
      closeAndArchive(session);
    }
  }, [closeAndArchive]);

  const handleResume = useCallback(
    (maestroSessionId: string) => resumeSessionFlow(maestroSessionId),
    [resumeSessionFlow],
  );

  // ==================== MAESTRO SESSION TREE ====================
  const [collapsedSessions, setCollapsedSessions] = React.useState<Set<string>>(new Set());
  const [sessionSubTab, setSessionSubTab] = React.useState<SessionSubTab>('open');
  // When on, the tree shows only spawn-trees with a running terminal somewhere in
  // their subtree — a transient overlay on top of the Open/Done/Archived tabs,
  // toggled by the "N live" chip. Picking a tab clears it (see the subtab onClick).
  const [liveOnly, setLiveOnly] = React.useState(false);
  // The maestro session the user has clicked as "current". Drives the tile
  // highlight even for non-live sessions (which have no active terminal).

  // All maestro sessions in this project (source of truth for the tree)
  const projectMaestroSessions = useMemo(() => {
    return Object.values(maestroSessions).filter((s) => s.projectId === activeProjectId);
  }, [maestroSessions, activeProjectId]);

  const { roots: sessionRoots } = useSessionTree(projectMaestroSessions);

  // Map maestroSessionId -> team color (independent of nesting)
  const maestroColorMap = useMemo(() => {
    const map = new Map<string, TeamColor>();
    for (const group of teamGroupData.groups) {
      map.set(group.coordinatorMaestroSessionId, group.color);
      for (const wId of group.workerMaestroSessionIds) {
        map.set(wId, group.color);
      }
    }
    return map;
  }, [teamGroupData.groups]);

  // Map maestroSessionId -> live local terminal info
  const linkMap = useMemo(() => {
    const map = new Map<string, SessionTileLinkInfo>();
    for (const s of sessions) {
      if (s.maestroSessionId) {
        map.set(s.maestroSessionId, { localSessionId: s.id, exited: Boolean(s.exited) });
      }
    }
    return map;
  }, [sessions]);

  // parentSessionId → child ids, for cascading lifecycle actions across a spawn tree.
  const childrenByParentId = useMemo(
    () => buildChildrenByParent(projectMaestroSessions),
    [projectMaestroSessions],
  );

  // All session ids in the spawn subtree rooted at rootId (inclusive).
  const collectSubtreeIds = useCallback(
    (rootId: string): string[] => collectSubtreeIdsUtil(rootId, childrenByParentId),
    [childrenByParentId],
  );

  // Tab resolution: archivedAt wins → Archived; humanCompletedAt → Done; else Open.
  // No local terminal state needed — tabs survive app restarts.
  const visibleRoots = useMemo(() => {
    // Live overlay wins: show every spawn-tree (any tab) with a running terminal
    // somewhere in its subtree — matches the "N live" chip's all-tabs count.
    if (liveOnly) {
      return sessionRoots.filter((root) =>
        collectSubtreeIds(root.id).some((id) => {
          const link = linkMap.get(id);
          return link && !link.exited;
        }),
      );
    }
    return sessionRoots.filter(
      (root) => resolveSessionTab(root) === sessionSubTab,
    );
  }, [sessionRoots, sessionSubTab, liveOnly, collectSubtreeIds, linkMap]);

  // Counts for the Open / Done / Archived sub-tabs (by root).
  const sessionTabCounts = useMemo(() => {
    const counts = { open: 0, done: 0, archived: 0 };
    for (const root of sessionRoots) counts[resolveSessionTab(root)]++;
    return counts;
  }, [sessionRoots]);

  // Live terminals across ALL tabs (Open/Done/Archived) — a done or archived
  // session can still have a running terminal until it's explicitly stopped.
  // Reads liveness from linkMap (the reliable signal), never the stale `status`.
  const liveCount = useMemo(() => {
    let n = 0;
    for (const s of projectMaestroSessions) {
      const link = linkMap.get(s.id);
      if (link && !link.exited) n++;
    }
    return n;
  }, [projectMaestroSessions, linkMap]);

  // The "N live" chip is hidden when nothing is live; clear the overlay too so the
  // filter can't get stranded on with no way to toggle it back off.
  React.useEffect(() => {
    if (liveCount === 0 && liveOnly) setLiveOnly(false);
  }, [liveCount, liveOnly]);

  // ==================== HUDDLES (CROSS-PROJECT) ====================
  // Huddles are connected components of cross-session prompting. They span
  // projects, so the count is global — independent of sessionTabCounts.
  // Fetched on mount and whenever the Huddles sub-tab is (re)opened; refreshed
  // lightly on focus while it's open.
  const [huddles, setHuddles] = React.useState<Huddle[]>([]);
  const [huddlesLoading, setHuddlesLoading] = React.useState(false);
  const [huddlesError, setHuddlesError] = React.useState<string | null>(null);

  const refreshHuddles = useCallback(async (): Promise<void> => {
    setHuddlesLoading(true);
    try {
      const data = await maestroClient.getHuddles();
      setHuddles(data);
      setHuddlesError(null);
    } catch (err) {
      setHuddlesError(err instanceof Error ? err.message : String(err));
    } finally {
      setHuddlesLoading(false);
    }
  }, []);

  // Initial fetch + refetch when the Huddles sub-tab is opened.
  React.useEffect(() => {
    if (sessionSubTab !== 'huddles') return;
    let cancelled = false;
    setHuddlesLoading(true);
    maestroClient.getHuddles()
      .then((data) => { if (!cancelled) { setHuddles(data); setHuddlesError(null); } })
      .catch((err) => { if (!cancelled) setHuddlesError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setHuddlesLoading(false); });
    return () => { cancelled = true; };
  }, [sessionSubTab]);

  // Initial fetch so the badge count is populated even before the user opens the tab.
  React.useEffect(() => {
    let cancelled = false;
    maestroClient.getHuddles()
      .then((data) => { if (!cancelled) setHuddles(data); })
      .catch(() => { /* fail quiet — server may not have endpoint on older builds */ });
    return () => { cancelled = true; };
  }, []);

  // While the Huddles tab is open, refresh when the window regains focus so
  // newly recorded inter-session prompts surface without a manual reload.
  React.useEffect(() => {
    if (sessionSubTab !== 'huddles') return;
    const onFocus = () => { void refreshHuddles(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [sessionSubTab, refreshHuddles]);

  const huddlesCount = huddles.length;

  // Filter-tab counts: active terminals, active (open) sessions, total docs, total diagrams.
  const { total: docsTotal } = useProjectDocsPaginated(activeProjectId, 'markdown');
  const { total: diagramsTotal } = useProjectDocsPaginated(activeProjectId, 'diagram');
  const activeTerminalCount = useMemo(
    () => sessions.filter((s) => !s.maestroSessionId && !s.exited).length,
    [sessions],
  );
  const filterTabCounts: Record<SessionFilter, number | null> = {
    terminals: activeTerminalCount,
    agents: sessionTabCounts.open,
    docs: docsTotal,
    drawings: diagramsTotal,
  };

  const handleToggleSessionCollapse = useCallback((sessionId: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  const handleOpenSessionDetail = useCallback((maestroSessionId: string) => {
    useUIStore.getState().setSessionDetailOverlay({ sessionId: maestroSessionId, projectId: activeProjectId });
  }, [activeProjectId]);

  const handleJumpToTerminal = useCallback((session: MaestroSession, link: SessionTileLinkInfo | null) => {
    if (link && !link.exited) {
      onSelectSession(link.localSessionId);
    } else {
      void handleResume(session.id);
    }
  }, [onSelectSession, handleResume]);

  // Clicking a tile body selects it as the current session. Live sessions also
  // switch the workspace to their running terminal; non-live sessions only get
  // highlighted (no auto-resume — that stays on the explicit Resume button).
  const handleSelectTile = useCallback((session: MaestroSession, link: SessionTileLinkInfo | null) => {
    const setInspectedSessionId = useUIStore.getState().setInspectedSessionId;

    // Defensive: linkMap is memoised off `sessions`; in theory it can't
    // disagree with the array, but a stale link pointing to a removed row
    // would route us to a dead activeId and produce a blank center pane. Only
    // trust the link if the local row actually exists right now. Read the live
    // array via ref so this callback stays reference-stable across WS ticks.
    const liveRow = link && !link.exited
      ? sessionsRef.current.find((s) => s.id === link.localSessionId && !s.exited)
      : null;
    // Single source of truth, shared with the tile (see SessionListItem).
    // willOpenStats is true ⇔ the click should surface SessionStatsView.
    const verifiedLink: SessionTileLinkInfo | null = liveRow ? link : null;
    const willOpenStats = willOpenStatsOnClick(session, verifiedLink);

    // Highlight is derived from these two writes (inspectedSessionId for stats,
    // activeId for a live terminal) — see SessionNodeRenderer's isSelected.
    if (!willOpenStats) {
      onSelectSession(link!.localSessionId);
      setInspectedSessionId(null);
    } else {
      setInspectedSessionId(session.id);
    }
  }, [onSelectSession]);

  // Close a maestro session AND its entire spawn subtree as a unit: stop every
  // live descendant terminal and archive every node. This keeps a coordinator and
  // its workers in the same tab — no orphaned live children, no archived child
  // stranded under an active root.
  const closeAndArchiveTree = useCallback((root: MaestroSession) => {
    for (const id of collectSubtreeIds(root.id)) {
      const link = linkMap.get(id);
      if (link) onCloseSession(link.localSessionId); // stop terminal if one exists
      void setSessionArchived(id, true);
    }
  }, [collectSubtreeIds, linkMap, onCloseSession, setSessionArchived]);

  const handleRestoreTree = useCallback((root: MaestroSession) => {
    for (const id of collectSubtreeIds(root.id)) {
      void setSessionArchived(id, false);
    }
  }, [collectSubtreeIds, setSessionArchived]);

  const handleStopSession = useCallback((session: MaestroSession, _link: SessionTileLinkInfo | null) => {
    const hasLiveTerminal = collectSubtreeIds(session.id).some((id) => {
      const l = linkMap.get(id);
      return l && !l.exited;
    });
    if (hasLiveTerminal) {
      // Live terminal(s) somewhere in the subtree → confirm before stopping them.
      setTreeToClose(session);
    } else {
      // Nothing live to stop — archive the whole subtree immediately.
      closeAndArchiveTree(session);
    }
  }, [collectSubtreeIds, linkMap, closeAndArchiveTree]);

  // "Mark done" is a pure human-intent marker: it only stamps humanCompletedAt
  // (moving the root to the Done tab) and deliberately leaves every terminal in the
  // subtree running — liveness is decoration in the Open/Done/Archived model, so a
  // done coordinator can keep its live workers without orphaning them. Stopping
  // terminals is the job of Close (✕), which cascades the whole subtree. Toggling
  // done off just clears the marker, returning the root to Open.
  const handleToggleHumanComplete = useCallback((session: MaestroSession) => {
    void setSessionHumanComplete(session.id, !session.humanCompletedAt);
  }, [setSessionHumanComplete]);

  const handleOpenTeamView = useCallback((session: MaestroSession) => {
    useUIStore.getState().setTeamViewRootId(session.id);
  }, []);

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
      <div className="pn-head">
        <span className="pn-proj">Sessions</span>
        <span className="pn-head-spacer" />
        <div className="sidebarHeaderActions">
          <button
            type="button"
            className="pn-ib"
            onClick={handleRefresh}
            disabled={refreshing || !activeProjectId}
            title="Refresh tasks"
            aria-label="Refresh tasks"
          >
            <Icon name="refresh" />
          </button>
          <button
            type="button"
            className="pn-ib"
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
            className={`pn-ib ${showHistory ? "pn-ib--active" : ""}`}
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
              className={`pn-ib ${settingsOpen ? "pn-ib--active" : ""}`}
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
                resumeSession={resumeSessionFlow}
                setShowHistory={setShowHistory}
                maestroTasks={maestroTasks}
              />
            )}
          </div>
        </>,
        document.body
      )}

      <div className="pn-quick" role="toolbar" aria-label="Quick launch">
        <button
          type="button"
          className="pn-qchip pn-qchip--icon"
          onClick={onOpenNewSession}
          aria-label="New terminal"
          title="New terminal"
        >
          {QuickTerminalIcon}
        </button>
        {[...agentShortcuts]
          .sort((a, b) => {
            const ia = QUICK_AGENT_ORDER.indexOf(a.id);
            const ib = QUICK_AGENT_ORDER.indexOf(b.id);
            return (ia === -1 ? QUICK_AGENT_ORDER.length : ia) - (ib === -1 ? QUICK_AGENT_ORDER.length : ib);
          })
          .map((effect) => {
            const tool = SHORTCUT_AGENT_TOOL[effect.id];
            const label = SHORTCUT_LABEL[effect.id] ?? effect.label;
            return (
              <button
                key={effect.id}
                type="button"
                className="pn-qchip pn-qchip--icon"
                onClick={() => onQuickStart(effect)}
                aria-label={`Start ${label}`}
                title={`Start ${label}`}
              >
                {tool ? (
                  <AgentLogo agentTool={tool} size={16} className={`agentChip--${tool}`} />
                ) : effect.iconSrc ? (
                  <img src={effect.iconSrc} alt="" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
      </div>

      {/* Segmented filter: Terminals / Agents / Docs / Drawings */}
      <div className="pn-filters">
        {SESSION_FILTER_TABS.map(({ id, label, icon }) => {
          const count = filterTabCounts[id];
          return (
            <button
              key={id}
              type="button"
              className={`pn-filter ${activeFilter === id ? 'pn-filter--active' : ''}`}
              onClick={() => setActiveFilter(id)}
              title={label}
              aria-pressed={activeFilter === id}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
              {count != null && count > 0 && <span className="pn-tab-n">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Sub-tabs for the maestro session tree */}
      {showAgents && (
        <div className="pn-subbar" role="tablist" aria-label="Session filter">
          {(['open', 'done', 'archived', 'huddles'] as SessionSubTab[]).map((tab) => {
            const count = tab === 'huddles' ? huddlesCount : sessionTabCounts[tab];
            const label = tab === 'open'
              ? 'Open'
              : tab === 'done'
                ? 'Done'
                : tab === 'archived'
                  ? 'Archived'
                  : 'Huddles';
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={sessionSubTab === tab}
                className={`pn-subtab ${sessionSubTab === tab ? 'pn-subtab--active' : ''}`}
                onClick={() => { setSessionSubTab(tab); setLiveOnly(false); }}
              >
                <span>{label}</span>
                {count > 0 && <span className="pn-tab-n">{count}</span>}
              </button>
            );
          })}
          {liveCount > 0 && (
            <button
              type="button"
              className={`pn-chip pn-chip--btn ${liveOnly ? 'pn-chip--active' : ''}`}
              onClick={() => setLiveOnly((v) => !v)}
              aria-pressed={liveOnly}
              title={liveOnly ? 'Show all sessions' : `Show only the ${liveCount} live session${liveCount === 1 ? '' : 's'}`}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span className="pn-dot-wrap"><span className="pn-dot pn-dot--run pn-dot--live" /></span>
              {liveCount} live
            </button>
          )}
          <button
            type="button"
            className={`pn-ib ${showTaskDetails ? "pn-ib--active" : ""}`}
            onClick={toggleSessionShowTaskDetails}
            title={showTaskDetails ? "Hide linked task details on session tiles" : "Show linked task details on session tiles"}
            aria-label="Toggle task details on session tiles"
            aria-pressed={showTaskDetails}
            style={liveCount > 0 ? undefined : { marginLeft: 'auto' }}
          >
            <Icon name="check-square" />
          </button>
        </div>
      )}

      {/* Docs tab — project-wide paginated list of markdown docs */}
      {showDocs && <ProjectDocsList projectId={activeProjectId} kind="markdown" />}

      {/* Drawings tab — project-wide paginated list of diagram docs */}
      {showDrawings && <ProjectDocsList projectId={activeProjectId} kind="diagram" />}

      <div className="pn-scroll" style={showDocs || showDrawings ? { display: 'none' } : undefined}>
        {sessionSubTab !== 'huddles' && sessions.length === 0 && projectMaestroSessions.length === 0 ? (
          <div className="empty">No sessions in this project.</div>
        ) : (
          <>
            {/* Huddles sub-tab — cross-project list of inter-session prompt clusters. */}
            {showAgents && sessionSubTab === 'huddles' && (
              <HuddlesList
                huddles={huddles}
                loading={huddlesLoading}
                error={huddlesError}
                onSessionClick={handleOpenSessionDetail}
              />
            )}

            {/* Maestro session tree (spawn-chain hierarchy) */}
            {showAgents && sessionSubTab !== 'huddles' && (
              visibleRoots.length === 0 ? (
                <div className="sessionEmptyState">
                  <span className="sessionEmptyState__icon" aria-hidden="true" style={{ color: 'var(--pn-ink-4)' }}>
                    {sessionSubTab === 'open' ? '◉' : sessionSubTab === 'done' ? '✓' : '▫'}
                  </span>
                  <span className="sessionEmptyState__title" style={{ color: 'var(--pn-ink)' }}>
                    {sessionSubTab === 'open'
                      ? 'No open sessions'
                      : sessionSubTab === 'done'
                        ? 'No sessions marked done'
                        : 'No archived sessions'}
                  </span>
                  <span className="sessionEmptyState__hint" style={{ color: 'var(--pn-ink-3)' }}>
                    {sessionSubTab === 'open'
                      ? 'New and unaddressed sessions appear here. Spawn one to get started.'
                      : sessionSubTab === 'done'
                        ? 'Click the ○ next to an open session to mark it done — it moves here.'
                        : 'Sessions you close with ✕ are dismissed here. Restore them anytime.'}
                  </span>
                </div>
              ) : (
                <div className="pn-list">
                  {visibleRoots.map((root) => {
                    const node = (
                      <SessionNodeRenderer
                        key={root.id}
                        node={root}
                        depth={0}
                        tab={sessionSubTab as SessionLifecycleTab}
                        collapsedSessions={collapsedSessions}
                        maestroColorMap={maestroColorMap}
                        linkMap={linkMap}
                        activeLocalSessionId={activeSessionId}
                        inspectedSessionId={inspectedSessionId}
                        maestroTasks={maestroTasks}
                        resumingSessionId={resumingSessionId}
                        onToggleCollapse={handleToggleSessionCollapse}
                        onOpenDetail={handleOpenSessionDetail}
                        onSelect={handleSelectTile}
                        onJumpToTerminal={handleJumpToTerminal}
                        onStop={handleStopSession}
                        onResume={handleResume}
                        onRestore={handleRestoreTree}
                        onToggleHumanComplete={handleToggleHumanComplete}
                        onOpenTeamView={handleOpenTeamView}
                      />
                    );
                    // Coordinator roots get a labelled pn-team box (team color on the
                    // dot only); standalone roots render bare, matching the design.
                    const group = teamGroupByCoordinator.get(root.id);
                    if (!group) return node;
                    const n = group.workerMaestroSessionIds.length + 1;
                    const teamName = group.teamName ?? root.teamMemberSnapshot?.name ?? root.name;
                    return (
                      <div className="pn-team" key={root.id}>
                        <div className="pn-team__head">
                          <span className="pn-team__dot" style={{ background: group.color.primary }} />
                          <span className="pn-team__name">{teamName}</span>
                          <span className="pn-team__count">{n} session{n === 1 ? "" : "s"}</span>
                        </div>
                        {node}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Plain terminals (non-maestro) keep the sortable list */}
            {showTerminals && filteredTerminalSessions.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortableSessionIds}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredTerminalSessions.map((s) => renderSessionItem(s, null))}
                </SortableContext>
              </DndContext>
            )}

            {((showAgents && sessionSubTab !== 'huddles' && visibleRoots.length > 0) ||
              (showTerminals && filteredTerminalSessions.length > 0)) && <ListEndFooter />}
          </>
        )}
      </div>

      <div className="pn-fade" />

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
            closeAndArchive(sessionToClose);
            setSessionToClose(null);
          }}
        />,
        document.body
      )}

      {treeToClose && (() => {
        const subtreeIds = collectSubtreeIds(treeToClose.id);
        const childCount = subtreeIds.length - 1;
        const liveCount = subtreeIds.filter((id) => {
          const l = linkMap.get(id);
          return l && !l.exited;
        }).length;
        const name = treeToClose.teamMemberSnapshot?.name || treeToClose.name || treeToClose.id.slice(0, 12);
        return createPortal(
          <ConfirmActionModal
            isOpen={true}
            title="[ CLOSE SESSION ]"
            message={
              <>
                Close <strong>{name}</strong>
                {childCount > 0 && <> and its {childCount} sub-session{childCount === 1 ? '' : 's'}</>}?
                {liveCount > 0 && (
                  <div style={{ marginTop: '8px', color: 'var(--warning)' }}>
                    {liveCount} live terminal{liveCount === 1 ? '' : 's'} will be stopped. The session record{childCount > 0 ? 's stay' : ' stays'} in Archived.
                  </div>
                )}
              </>
            }
            confirmLabel="Close Session"
            cancelLabel="Cancel"
            confirmDanger={true}
            onClose={() => setTreeToClose(null)}
            onConfirm={() => {
              closeAndArchiveTree(treeToClose);
              setTreeToClose(null);
            }}
          />,
          document.body
        );
      })()}

    </>
  );
});
