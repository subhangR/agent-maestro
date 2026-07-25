import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { TeamMember, AgentTool, LaunchConfig, MemberLaunchOverride } from "../../app/types/maestro";
import { TeamLaunchConfigModal } from "./TeamLaunchConfigModal";
import { createLaunchConfig, DEFAULT_MODEL_BY_AGENT_TOOL } from "../../app/constants/agentTools";
import { LaunchConfigDropdown } from "./LaunchConfigDropdown";
import { RunCoordButton } from "./redesign/RunCoordButton";

type ExecutionMode = 'none' | 'execute' | 'orchestrate';

type LaunchOverride = LaunchConfig;

type ExecutionBarProps = {
    isActive: boolean;
    onActivate: () => void;
    onCancel: () => void;
    onExecute: (teamMemberId?: string, override?: LaunchOverride, memberOverrides?: Record<string, MemberLaunchOverride>, permissionMode?: string) => void;
    onOrchestrate: (coordinatorId?: string, workerIds?: string[], override?: LaunchOverride, memberOverrides?: Record<string, MemberLaunchOverride>, permissionMode?: string, delegatePermissionMode?: string) => void;
    selectedCount: number;
    activeMode?: ExecutionMode;
    onActivateOrchestrate: () => void;
    projectId?: string;
    teamMembers?: TeamMember[];
    onSaveAsTeam?: (teamName: string, coordinatorId: string | null, workerIds: string[], overrides: Record<string, MemberLaunchOverride>) => void;
};

// Hook to compute portal menu position from a trigger button ref
function useDropdownPosition(triggerRef: React.RefObject<HTMLButtonElement | null>, isOpen: boolean) {
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    const updatePos = useCallback(() => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            // Anchor dropdown to left edge of trigger so it opens rightward
            let left = rect.left;
            // If dropdown would overflow right edge, clamp it
            const menuWidth = Math.max(rect.width, 220); // approximate min menu width
            if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 8;
            }
            // Ensure it never goes off-screen left
            if (left < 4) left = 4;
            setPos({ top: rect.bottom + 2, left, width: rect.width });
        }
    }, [triggerRef]);

    useEffect(() => {
        if (isOpen) {
            updatePos();
        }
    }, [isOpen, updatePos]);

    return pos;
}

// Reusable single-select dropdown - renders menu via portal
function TeamMemberDropdown({
    label,
    members,
    selectedId,
    onSelect,
    accentColor,
}: {
    label: string;
    members: TeamMember[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    accentColor?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const pos = useDropdownPosition(triggerRef, isOpen);

    const selected = members.find(m => m.id === selectedId);

    return (
        <div className="executionBarDropdown">
            <button type="button"
                ref={triggerRef}
                className="executionBarDropdownTrigger"
                onClick={() => setIsOpen(!isOpen)}
                style={accentColor ? { borderColor: isOpen ? accentColor : undefined } : undefined}
            >
                <span className="executionBarDropdownLabel">{label}:</span>
                <span className="executionBarDropdownValue">
                    {selected ? (
                        <>{selected.avatar} {selected.name}</>
                    ) : (
                        <span className="executionBarDropdownPlaceholder">select...</span>
                    )}
                </span>
                <span className="executionBarDropdownArrow">{isOpen ? '\u25B4' : '\u25BE'}</span>
            </button>
            {isOpen && pos && createPortal(
                <>
                    {/* Full-screen backdrop to capture all clicks outside */}
                    <div
                        className="executionBarDropdownBackdrop"
                        onClick={() => setIsOpen(false)}
                    />
                    <div
                        ref={menuRef}
                        className="executionBarDropdownMenu executionBarDropdownMenu--portal"
                        style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
                    >
                        {members.length === 0 ? (
                            <div className="executionBarDropdownEmpty">No members available</div>
                        ) : (
                            members.map(member => (
                                <button type="button"
                                    key={member.id}
                                    className={`executionBarDropdownOption ${selectedId === member.id ? 'executionBarDropdownOption--selected' : ''}`}
                                    onClick={() => {
                                        onSelect(selectedId === member.id ? null : member.id);
                                        setIsOpen(false);
                                    }}
                                >
                                    <span className="executionBarDropdownOptionAvatar">{member.avatar}</span>
                                    <span className="executionBarDropdownOptionName">{member.name}</span>
                                    <span className="executionBarDropdownOptionMeta">
                                        {member.role}
                                        {member.model && ` \u00B7 ${member.model}`}
                                    </span>
                                    {selectedId === member.id && (
                                        <span className="executionBarDropdownCheck">{'\u2713'}</span>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
}

// Multi-select dropdown for workers - renders menu via portal
function TeamMemberMultiDropdown({
    label,
    members,
    selectedIds,
    onToggle,
    onSelectAll,
    onClearAll,
    accentColor,
}: {
    label: string;
    members: TeamMember[];
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onSelectAll: () => void;
    onClearAll: () => void;
    accentColor?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const pos = useDropdownPosition(triggerRef, isOpen);

    const selectedMembers = members.filter(m => selectedIds.has(m.id));

    return (
        <div className="executionBarDropdown">
            <button type="button"
                ref={triggerRef}
                className="executionBarDropdownTrigger"
                onClick={() => setIsOpen(!isOpen)}
                style={accentColor ? { borderColor: isOpen ? accentColor : undefined } : undefined}
            >
                <span className="executionBarDropdownLabel">{label}:</span>
                <span className="executionBarDropdownValue">
                    {selectedMembers.length > 0 ? (
                        <>{selectedMembers.map(m => m.avatar).join(' ')} {selectedMembers.length} selected</>
                    ) : (
                        <span className="executionBarDropdownPlaceholder">select...</span>
                    )}
                </span>
                <span className="executionBarDropdownArrow">{isOpen ? '\u25B4' : '\u25BE'}</span>
            </button>
            {isOpen && pos && createPortal(
                <>
                    {/* Full-screen backdrop to capture all clicks outside */}
                    <div
                        className="executionBarDropdownBackdrop"
                        onClick={() => setIsOpen(false)}
                    />
                    <div
                        ref={menuRef}
                        className="executionBarDropdownMenu executionBarDropdownMenu--portal"
                        style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
                    >
                        {members.length === 0 ? (
                            <div className="executionBarDropdownEmpty">No members available</div>
                        ) : (
                            <>
                                <div className="executionBarDropdownActions">
                                    <button type="button" className="executionBarDropdownActionBtn" onClick={onSelectAll}>select all</button>
                                    <button type="button" className="executionBarDropdownActionBtn" onClick={onClearAll}>clear</button>
                                </div>
                                {members.map(member => (
                                    <button type="button"
                                        key={member.id}
                                        className={`executionBarDropdownOption ${selectedIds.has(member.id) ? 'executionBarDropdownOption--selected' : ''}`}
                                        onClick={() => onToggle(member.id)}
                                    >
                                        <span className={`executionBarDropdownCheckbox ${selectedIds.has(member.id) ? 'executionBarDropdownCheckbox--checked' : ''}`}>
                                            {selectedIds.has(member.id) ? '\u2713' : ''}
                                        </span>
                                        <span className="executionBarDropdownOptionAvatar">{member.avatar}</span>
                                        <span className="executionBarDropdownOptionName">{member.name}</span>
                                        <span className="executionBarDropdownOptionMeta">
                                            {member.role}
                                            {member.model && ` \u00B7 ${member.model}`}
                                        </span>
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
}

export function ExecutionBar({
    isActive,
    onActivate,
    onCancel,
    onExecute,
    onOrchestrate,
    selectedCount,
    activeMode = 'none',
    onActivateOrchestrate,
    projectId = '',
    teamMembers = [],
    onSaveAsTeam,
}: ExecutionBarProps) {
    // Execute mode: single team member selection
    const [selectedExecuteMemberId, setSelectedExecuteMemberId] = useState<string | null>(null);

    // Orchestrate mode: coordinator (single) + workers (multi)
    const [selectedCoordinatorId, setSelectedCoordinatorId] = useState<string | null>(null);
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());

    // Launch override (model/tool override for the session)
    const [launchOverride, setLaunchOverride] = useState<LaunchOverride | null>(null);
    const [showLaunchDropdown, setShowLaunchDropdown] = useState(false);
    const [expandedTool, setExpandedTool] = useState<AgentTool | null>(null);
    const launchBtnRef = useRef<HTMLButtonElement>(null);
    const [launchDropdownPos, setLaunchDropdownPos] = useState<{ top?: number; bottom?: number; left: number; openDirection: 'down' | 'up' | 'side' } | null>(null);

    // Launch config modal state
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [pendingMemberOverrides, setPendingMemberOverrides] = useState<Record<string, MemberLaunchOverride> | null>(null);
    const [coordinatorDangerous, setCoordinatorDangerous] = useState(false);
    const [workersDangerous, setWorkersDangerous] = useState(false);

    const computeLaunchPos = useCallback(() => {
        const btn = launchBtnRef.current;
        if (!btn) return null;
        const rect = btn.getBoundingClientRect();
        const menuWidth = Math.min(540, window.innerWidth - 16);
        const menuHeight = Math.min(460, window.innerHeight - 16);
        const gap = 8;
        const rightSpace = window.innerWidth - rect.right;
        const leftSpace = rect.left;
        const left = rightSpace >= menuWidth + gap
            ? rect.right + gap
            : leftSpace >= menuWidth + gap
                ? rect.left - menuWidth - gap
                : Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
        const top = Math.min(Math.max(8, rect.top - 12), window.innerHeight - menuHeight - 8);
        return { top, left, openDirection: 'side' as const };
    }, []);

    useLayoutEffect(() => {
        if (showLaunchDropdown) {
            setLaunchDropdownPos(computeLaunchPos());
        }
    }, [showLaunchDropdown, computeLaunchPos]);

    const activeMembers = teamMembers.filter(m => m.status === 'active' && (!projectId || m.projectId === projectId));

    // For orchestrate: coordinator is selected separately; roster can include any active member mode.
    const coordinatorMembers = activeMembers.filter(m => m.mode === 'coordinator' || m.mode === 'coordinated-coordinator' || (m.mode as string) === 'coordinate');
    const workerMembers = activeMembers;

    // Reset override when team member changes
    const handleSelectExecuteMember = (id: string | null) => {
        setSelectedExecuteMemberId(id);
        setLaunchOverride(null);
    };

    const handleSelectCoordinator = (id: string | null) => {
        setSelectedCoordinatorId(id);
        setLaunchOverride(null);
    };

    const launchConfigWithAccess = (config: LaunchOverride | null, memberId: string | null, fullAccess: boolean): LaunchOverride | null => {
        if (!fullAccess) return config;
        if (config) return { ...config, accessMode: 'fullAccess' };
        const member = memberId ? activeMembers.find((entry) => entry.id === memberId) : undefined;
        const tool = member?.agentTool || 'claude-code';
        return {
            ...createLaunchConfig(tool, member?.model || DEFAULT_MODEL_BY_AGENT_TOOL[tool]),
            accessMode: 'fullAccess',
        };
    };

    if (!isActive) {
        return (
            <div className="executionBar executionBar--inactive">
                <RunCoordButton kind="run" onClick={onActivate} sub="one agent" title="Run this task with one AI agent">
                    Run
                </RunCoordButton>
                <RunCoordButton kind="coord" onClick={onActivateOrchestrate} sub="a team of agents" title="Run this task with a coordinated team of AI agents">
                    Run as team
                </RunCoordButton>
            </div>
        );
    }

    // Shared launch dropdown portal
    const launchDropdownPortal = showLaunchDropdown && launchDropdownPos && createPortal(
        <>
            <div
                className="executionBarDropdownBackdrop"
                onClick={() => setShowLaunchDropdown(false)}
            />
            <div
                className={`terminalLaunchDropdown terminalLaunchDropdown--fixed ${launchDropdownPos.openDirection === 'up' ? 'terminalInlineDropdown--openUp' : ''}`}
                style={{
                    ...(launchDropdownPos.openDirection === 'side'
                        ? { top: launchDropdownPos.top }
                        : launchDropdownPos.openDirection === 'down'
                        ? { top: launchDropdownPos.top }
                        : { bottom: launchDropdownPos.bottom }),
                    left: launchDropdownPos.left,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <LaunchConfigDropdown
                    launchConfig={launchOverride}
                    activeTool={expandedTool}
                    onActiveToolChange={setExpandedTool}
                    onLaunchConfigChange={setLaunchOverride}
                    onClear={() => setLaunchOverride(null)}
                />
            </div>
        </>,
        document.body
    );

    if (activeMode === 'orchestrate') {
        const totalWorkerCount = selectedWorkerIds.size;

        const handleConfigLaunch = (overrides: Record<string, MemberLaunchOverride>) => {
            setPendingMemberOverrides(Object.keys(overrides).length > 0 ? overrides : null);
            onOrchestrate(
                selectedCoordinatorId || undefined,
                selectedWorkerIds.size > 0 ? Array.from(selectedWorkerIds) : undefined,
                launchConfigWithAccess(launchOverride, selectedCoordinatorId, coordinatorDangerous) || undefined,
                Object.keys(overrides).length > 0 ? overrides : undefined,
                undefined,
                workersDangerous ? 'bypassPermissions' : undefined,
            );
        };

        const handleConfigSave = (overrides: Record<string, MemberLaunchOverride>) => {
            setPendingMemberOverrides(Object.keys(overrides).length > 0 ? overrides : null);
        };

        const handleConfigSaveAsTeam = (teamName: string, overrides: Record<string, MemberLaunchOverride>) => {
            if (onSaveAsTeam) {
                onSaveAsTeam(teamName, selectedCoordinatorId, Array.from(selectedWorkerIds), overrides);
            }
            handleConfigLaunch(overrides);
        };

        return (
            <>
                <div className="executionBar executionBar--active executionBar--orchestrate executionBar--column">
                    <div className="executionBarDropdowns">
                        <TeamMemberDropdown
                            label="Coordinator"
                            members={coordinatorMembers}
                            selectedId={selectedCoordinatorId}
                            onSelect={handleSelectCoordinator}
                            accentColor="var(--pn-wait, #BD8A2A)"
                        />
                        <TeamMemberMultiDropdown
                            label="Team Roster"
                            members={workerMembers}
                            selectedIds={selectedWorkerIds}
                            onToggle={(id) => {
                                setSelectedWorkerIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(id)) next.delete(id);
                                    else next.add(id);
                                    return next;
                                });
                            }}
                            onSelectAll={() => setSelectedWorkerIds(new Set(workerMembers.map(m => m.id)))}
                            onClearAll={() => setSelectedWorkerIds(new Set())}
                            accentColor="var(--pn-wait, #BD8A2A)"
                        />
                    </div>
                    <div className="executionBarRow">
                        <button type="button" className="terminalCmd executionBarCancelBtn" onClick={onCancel}>cancel</button>
                        <div className="executionBarActions">
                            <button type="button"
                                className={`terminalDangerousToggle terminalDangerousToggle--bar ${coordinatorDangerous ? 'terminalDangerousToggle--on' : ''}`}
                                title={coordinatorDangerous ? 'Coordinator: dangerous mode ON' : 'Coordinator: enable dangerous mode'}
                                onClick={() => setCoordinatorDangerous(v => !v)}
                            >
                                {coordinatorDangerous ? '\u26A0 COORD' : '\uD83D\uDEE1\uFE0F COORD'}
                            </button>
                            <button type="button"
                                className={`terminalDangerousToggle terminalDangerousToggle--bar ${workersDangerous ? 'terminalDangerousToggle--on' : ''}`}
                                title={workersDangerous ? 'Workers: dangerous mode ON' : 'Workers: enable dangerous mode'}
                                onClick={() => setWorkersDangerous(v => !v)}
                            >
                                {workersDangerous ? '\u26A0 WORKERS' : '\uD83D\uDEE1\uFE0F WORKERS'}
                            </button>
                            <button type="button"
                                className="executionBarConfigBtn executionBarConfigBtn--orchestrate"
                                onClick={() => setShowConfigModal(true)}
                                title="Configure launch options per team member"
                            >
                                {'\u2699'}
                            </button>
                            <RunCoordButton
                                kind="coord"
                                solid
                                onClick={() => onOrchestrate(
                                    selectedCoordinatorId || undefined,
                                    selectedWorkerIds.size > 0 ? Array.from(selectedWorkerIds) : undefined,
                                    launchConfigWithAccess(launchOverride, selectedCoordinatorId, coordinatorDangerous) || undefined,
                                    pendingMemberOverrides || undefined,
                                    undefined,
                                    workersDangerous ? 'bypassPermissions' : undefined,
                                )}
                                disabled={selectedCount === 0}
                            >
                                coordinate ({selectedCount} task{selectedCount !== 1 ? "s" : ""}{totalWorkerCount > 0 ? `, ${totalWorkerCount} member${totalWorkerCount !== 1 ? 's' : ''}` : ''})
                            </RunCoordButton>
                        </div>
                    </div>
                </div>
                <TeamLaunchConfigModal
                    isOpen={showConfigModal}
                    onClose={() => setShowConfigModal(false)}
                    coordinatorId={selectedCoordinatorId}
                    workerIds={Array.from(selectedWorkerIds)}
                    teamMembers={teamMembers}
                    projectId={projectId}
                    onLaunch={handleConfigLaunch}
                    onSave={handleConfigSave}
                    onSaveAsTeam={handleConfigSaveAsTeam}
                />
            </>
        );
    }

    // Default: execute mode
    const handleExecuteConfigLaunch = (overrides: Record<string, MemberLaunchOverride>) => {
        setPendingMemberOverrides(Object.keys(overrides).length > 0 ? overrides : null);
        onExecute(
            selectedExecuteMemberId || undefined,
            launchOverride || undefined,
            Object.keys(overrides).length > 0 ? overrides : undefined,
        );
    };

    const handleExecuteConfigSave = (overrides: Record<string, MemberLaunchOverride>) => {
        setPendingMemberOverrides(Object.keys(overrides).length > 0 ? overrides : null);
    };

    const handleExecuteConfigSaveAsTeam = (teamName: string, overrides: Record<string, MemberLaunchOverride>) => {
        if (onSaveAsTeam && selectedExecuteMemberId) {
            onSaveAsTeam(teamName, selectedExecuteMemberId, [], overrides);
        }
        handleExecuteConfigLaunch(overrides);
    };

    return (
        <>
            <div className="executionBar executionBar--active executionBar--column">
                <div className="executionBarDropdowns">
                    <TeamMemberDropdown
                        label="Team Member"
                        members={activeMembers}
                        selectedId={selectedExecuteMemberId}
                        onSelect={handleSelectExecuteMember}
                    />
                </div>
                <div className="executionBarRow">
                    <button type="button" className="terminalCmd executionBarCancelBtn" onClick={onCancel}>cancel</button>
                    <div className="executionBarActions">
                        <button type="button"
                            className="executionBarConfigBtn"
                            onClick={() => setShowConfigModal(true)}
                            title="Configure launch options"
                        >
                            {'\u2699'}
                        </button>
                        <RunCoordButton
                            kind="run"
                            solid
                            onClick={() => onExecute(
                                selectedExecuteMemberId || undefined,
                                launchOverride || undefined,
                                pendingMemberOverrides || undefined,
                            )}
                            disabled={selectedCount === 0}
                        >
                            run ({selectedCount} task{selectedCount !== 1 ? "s" : ""})
                        </RunCoordButton>
                    </div>
                </div>
            </div>
            <TeamLaunchConfigModal
                isOpen={showConfigModal}
                onClose={() => setShowConfigModal(false)}
                coordinatorId={selectedExecuteMemberId}
                workerIds={[]}
                teamMembers={teamMembers}
                projectId={projectId}
                onLaunch={handleExecuteConfigLaunch}
                onSave={handleExecuteConfigSave}
                onSaveAsTeam={handleExecuteConfigSaveAsTeam}
            />
        </>
    );
}
