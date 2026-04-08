import React from "react";
import { MaestroTask, TeamMember } from "../../../app/types/maestro";
import { TeamMemberSelector } from "./TeamMemberSelector";
import type { AutoSaveStatus } from "../../../hooks/useAutoSave";

type TaskModalFooterProps = {
    isEditMode: boolean;
    isValid: boolean;
    selectedTeamMemberIds: string[];
    onTeamMemberSelectionChange: (ids: string[]) => void;
    teamMembers: TeamMember[];
    onClose: () => void;
    onSave: () => void;
    onSubmit: (startImmediately: boolean) => void;
    onWorkOn?: () => void;
    showLaunchConfig: boolean;
    onToggleLaunchConfig: () => void;
    autoSaveStatus?: AutoSaveStatus;
    autoCreatedTask?: MaestroTask | null;
};

function AutoSaveIndicator({ status }: { status: AutoSaveStatus }) {
    if (status === "idle") return null;

    const config = {
        saving: { text: "Saving\u2026", color: "var(--theme-text-secondary)" },
        saved: { text: "Saved", color: "var(--theme-success, #4caf50)" },
        error: { text: "Save failed", color: "var(--theme-error, #f44336)" },
    }[status];

    return (
        <span
            style={{
                fontSize: "11px",
                color: config.color,
                opacity: status === "saved" ? 0.7 : 1,
                transition: "opacity 0.3s ease",
                whiteSpace: "nowrap",
            }}
        >
            {config.text}
        </span>
    );
}

export function TaskModalFooter({
    isEditMode,
    isValid,
    selectedTeamMemberIds,
    onTeamMemberSelectionChange,
    teamMembers,
    onClose,
    onSave,
    onSubmit,
    onWorkOn,
    showLaunchConfig,
    onToggleLaunchConfig,
    autoSaveStatus,
    autoCreatedTask,
}: TaskModalFooterProps) {
    const hasMembers = selectedTeamMemberIds.length > 0;
    // Task was auto-created in create mode — show hybrid UI
    const isAutoCreated = !isEditMode && !!autoCreatedTask;

    return (
        <div className="themedFormActions" style={{ flexWrap: 'wrap' }}>
            {isEditMode ? (
                <>
                    <TeamMemberSelector
                        selectedTeamMemberIds={selectedTeamMemberIds}
                        onSelectionChange={onTeamMemberSelectionChange}
                        teamMembers={teamMembers}
                    />
                    {hasMembers && (
                        <button
                            type="button"
                            className={`launchConfigGearBtn ${showLaunchConfig ? 'launchConfigGearBtn--active' : ''}`}
                            onClick={onToggleLaunchConfig}
                            title={showLaunchConfig ? 'Back to description' : 'Configure launch options'}
                        >
                            {'\u2699'}
                        </button>
                    )}
                    {autoSaveStatus && <AutoSaveIndicator status={autoSaveStatus} />}
                    <button type="button" className="themedBtn" onClick={onClose}>
                        Close
                    </button>
                    <button
                        type="button"
                        className="themedBtn themedBtnSuccess"
                        onClick={() => {
                            onWorkOn?.();
                            onClose();
                        }}
                    >
                        $ exec
                    </button>
                </>
            ) : (
                <>
                    <TeamMemberSelector
                        selectedTeamMemberIds={selectedTeamMemberIds}
                        onSelectionChange={onTeamMemberSelectionChange}
                        teamMembers={teamMembers}
                    />
                    {hasMembers && (
                        <button
                            type="button"
                            className={`launchConfigGearBtn ${showLaunchConfig ? 'launchConfigGearBtn--active' : ''}`}
                            onClick={onToggleLaunchConfig}
                            title={showLaunchConfig ? 'Back to description' : 'Configure launch options'}
                        >
                            {'\u2699'}
                        </button>
                    )}
                    {isAutoCreated && autoSaveStatus && <AutoSaveIndicator status={autoSaveStatus} />}
                    <button type="button" className="themedBtn" onClick={onClose}>
                        {isAutoCreated ? "Close" : "Cancel"}
                    </button>
                    {!isAutoCreated ? (
                        <>
                            <button
                                type="button"
                                className="themedBtn themedBtnPrimary"
                                onClick={() => onSubmit(false)}
                                disabled={!isValid}
                            >
                                Create Task
                            </button>
                            <button
                                type="button"
                                className="themedBtn themedBtnSuccess"
                                onClick={() => onSubmit(true)}
                                disabled={!isValid}
                            >
                                Create &amp; Run
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="themedBtn themedBtnSuccess"
                            onClick={() => onSubmit(true)}
                        >
                            $ exec
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
