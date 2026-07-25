import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TeamMember, Team, LaunchConfig } from "../../../app/types/maestro";
import { AutoSaveStatus } from "../../../hooks/useAutoSave";
import { TeamTaskPicker } from "./TeamTaskPicker";
import { ModelPickerChip } from "./ModelPickerChip";
import { Icon } from "../redesign/kit";

type TaskModalFooterProps = {
    isEditMode: boolean;
    isValid: boolean;
    selectedTeamMemberIds: string[];
    onTeamMemberSelectionChange: (ids: string[]) => void;
    teams: Team[];
    selectedTeamId: string | null;
    onTeamChange: (teamId: string | null) => void;
    teamMembers: TeamMember[];
    dangerousMode: boolean;
    onDangerousModeChange: (value: boolean) => void;
    useWorktree: boolean;
    onUseWorktreeChange: (value: boolean) => void;
    taskLaunchConfig: LaunchConfig | null;
    onTaskLaunchConfigChange: (config: LaunchConfig | null) => void;
    onClose: () => void;
    onSave: () => Promise<void>;
    onSubmit: (startImmediately: boolean) => void;
    onWorkOn?: () => void;
    showLaunchConfig: boolean;
    onToggleLaunchConfig: () => void;
    autoSaveStatus?: AutoSaveStatus;
    isDraft?: boolean;
};

function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
    if (status === "idle") return null;
    const label = status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Save error";
    const dotClass = status === "saving" ? "pn-dot--wait" : status === "error" ? "pn-dot--block" : "pn-dot--run";
    return (
        <span className="pn-savehint">
            <span className={`pn-dot ${dotClass}`}></span> {label}
        </span>
    );
}

export function TaskModalFooter({
    isEditMode,
    isValid,
    selectedTeamMemberIds,
    onTeamMemberSelectionChange,
    teams,
    selectedTeamId,
    onTeamChange,
    teamMembers,
    dangerousMode,
    onDangerousModeChange,
    useWorktree,
    onUseWorktreeChange,
    taskLaunchConfig,
    onTaskLaunchConfigChange,
    onClose,
    onSave,
    onSubmit,
    onWorkOn,
    showLaunchConfig,
    onToggleLaunchConfig,
    autoSaveStatus,
    isDraft,
}: TaskModalFooterProps) {
    const hasMembers = selectedTeamMemberIds.length > 0;

    const soleMember = selectedTeamMemberIds.length === 1
        ? teamMembers.find(m => m.id === selectedTeamMemberIds[0])
        : undefined;

    const selectedTeam = selectedTeamId ? teams.find(t => t.id === selectedTeamId) : undefined;

    const [pickerOpen, setPickerOpen] = useState(false);
    const pickerWrapRef = useRef<HTMLDivElement>(null);
    const pickerBtnRef = useRef<HTMLButtonElement>(null);
    const pickerPanelRef = useRef<HTMLDivElement>(null);
    // The picker panel is portaled to document.body — the modal sets
    // overflow:hidden, which would otherwise clip a panel positioned inside it.
    const [pickerPos, setPickerPos] = useState<{ left: number; bottom: number } | null>(null);

    useLayoutEffect(() => {
        if (!pickerOpen) return;
        const recalcPos = () => {
            const btn = pickerBtnRef.current;
            if (!btn) return;
            const rect = btn.getBoundingClientRect();
            const width = 340;
            const PANEL_MAX_HEIGHT = 400;

            // Horizontal: center on button, then clamp to viewport (guard
            // against inverted range on very narrow viewports).
            const buttonCenter = rect.left + rect.width / 2;
            const maxLeft = Math.max(8, window.innerWidth - width - 8);
            const left = Math.min(Math.max(8, buttonCenter - width / 2), maxLeft);

            // Vertical: prefer anchoring above the button; fall back to below,
            // then to the largest available slot if neither fits.
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            let bottom: number;
            if (spaceAbove >= PANEL_MAX_HEIGHT + 6) {
                bottom = window.innerHeight - rect.top + 6;
            } else if (spaceBelow >= PANEL_MAX_HEIGHT + 6) {
                bottom = window.innerHeight - (rect.bottom + 6 + PANEL_MAX_HEIGHT);
            } else {
                bottom = Math.max(8, Math.min(window.innerHeight - rect.top + 6,
                    window.innerHeight - PANEL_MAX_HEIGHT - 8));
            }

            setPickerPos({ left, bottom });
        };
        recalcPos();
        // The button moves when the modal body scrolls or the window resizes;
        // re-run so the portaled panel stays anchored (capture catches scroll
        // on the inner .pn-mdl__body, which doesn't bubble).
        window.addEventListener("resize", recalcPos);
        window.addEventListener("scroll", recalcPos, true);
        return () => {
            window.removeEventListener("resize", recalcPos);
            window.removeEventListener("scroll", recalcPos, true);
        };
    }, [pickerOpen]);

    useEffect(() => {
        if (!pickerOpen) return;
        const onDocClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (pickerBtnRef.current?.contains(target)) return;
            if (pickerPanelRef.current?.contains(target)) return;
            setPickerOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [pickerOpen]);

    const assigneeLabel = selectedTeam
        ? `${selectedTeam.avatar || "👥"} ${selectedTeam.name}`
        : hasMembers
            ? (soleMember ? `${soleMember.avatar} ${soleMember.name}` : `${selectedTeamMemberIds.length} members`)
            : "Assign…";

    const gearBtn = hasMembers ? (
        <button
            type="button"
            className={`pn-mchip ${showLaunchConfig ? 'pn-mchip--ref' : ''}`}
            onClick={onToggleLaunchConfig}
            title={showLaunchConfig ? 'Back to description' : 'Configure launch options'}
        >
            <Icon name="settings" size={13} />
        </button>
    ) : null;

    return (
        <div className="pn-mdl__foot">
            <div className="pn-mdl__footL">
                <div className="ttp-pop" ref={pickerWrapRef} style={{ position: "relative" }}>
                    <button
                        ref={pickerBtnRef}
                        type="button"
                        className={`pn-mchip ${(selectedTeam || hasMembers) ? 'pn-mchip--ref' : ''}`}
                        onClick={() => setPickerOpen(o => !o)}
                        title="Assign a team or team members"
                    >
                        {selectedTeam ? <Icon name="team" size={13} /> : <Icon name="users" size={13} />}
                        <span style={{ marginLeft: 4 }}>{assigneeLabel}</span>
                    </button>
                    {pickerOpen && pickerPos && createPortal(
                        <div
                            ref={pickerPanelRef}
                            className="ttp-pop__panel"
                            style={{
                                position: "fixed",
                                left: pickerPos.left,
                                bottom: pickerPos.bottom,
                                width: 340,
                                maxWidth: "calc(100vw - 16px)",
                                maxHeight: 400,
                                overflowY: "auto",
                                // Above the .themedModalBackdrop (z-index:1000) so the
                                // portaled panel isn't hidden behind the modal.
                                zIndex: 1001,
                                background: "var(--pn-card)",
                                border: "1px solid var(--pn-line-2)",
                                borderRadius: "var(--pn-r-md)",
                                boxShadow: "var(--pn-sh-pop)",
                                padding: 12,
                            }}
                        >
                            <TeamTaskPicker
                                teams={teams}
                                teamMembers={teamMembers}
                                selectedTeamId={selectedTeamId}
                                selectedTeamMemberIds={selectedTeamMemberIds}
                                onTeamChange={onTeamChange}
                                onMembersChange={onTeamMemberSelectionChange}
                            />
                        </div>,
                        document.body
                    )}
                </div>
                <button
                    type="button"
                    className={`pn-toggle ${dangerousMode ? 'pn-toggle--on-danger' : ''}`}
                    onClick={() => onDangerousModeChange(!dangerousMode)}
                    title={dangerousMode ? 'Unrestricted: the agent skips permission prompts — click to make it ask first' : 'Safe: the agent asks before risky actions — click to let it run unrestricted'}
                >
                    <Icon name="shield" size={13} /> {dangerousMode ? 'Unrestricted' : 'Safe'}
                </button>
                <button
                    type="button"
                    className={`pn-toggle ${useWorktree ? 'pn-toggle--on-wt' : ''}`}
                    onClick={() => onUseWorktreeChange(!useWorktree)}
                    title={useWorktree ? 'Isolated copy: the agent works in a separate copy of your code — click to work in your folder directly' : 'In place: the agent edits your folder directly — click to isolate changes in a separate copy'}
                >
                    <Icon name="gitBranch" size={13} /> {useWorktree ? 'Isolated copy' : 'In place'}
                </button>
                <ModelPickerChip
                    value={taskLaunchConfig}
                    onChange={onTaskLaunchConfigChange}
                    fallbackMember={soleMember}
                />
                {gearBtn}
                {((isEditMode && autoSaveStatus) || (!isEditMode && isDraft && autoSaveStatus)) && (
                    <AutoSaveIndicator status={autoSaveStatus} />
                )}
            </div>
            <div className="pn-mdl__footR">
                {isEditMode ? (
                    <>
                        <button type="button" className="pn-btn pn-btn--ghost" onClick={onClose}>
                            Close
                        </button>
                        <button
                            type="button"
                            className="pn-btn pn-btn--primary"
                            onClick={async () => {
                                await onSave();
                                onWorkOn?.();
                                onClose();
                            }}
                        >
                            <Icon name="play" size={13} /> Run
                        </button>
                    </>
                ) : isDraft ? (
                    <>
                        <button type="button" className="pn-btn pn-btn--ghost" onClick={onClose}>
                            Close
                        </button>
                        <button
                            type="button"
                            className="pn-btn pn-btn--primary"
                            onClick={() => onSubmit(true)}
                        >
                            <Icon name="play" size={13} /> Run
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" className="pn-btn pn-btn--ghost" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="pn-btn"
                            onClick={() => onSubmit(false)}
                            disabled={!isValid}
                        >
                            Create
                        </button>
                        <button
                            type="button"
                            className="pn-btn pn-btn--primary"
                            onClick={() => onSubmit(true)}
                            disabled={!isValid}
                        >
                            <Icon name="play" size={13} /> Create &amp; start
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
