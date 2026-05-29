import React from "react";
import { TeamMember } from "../../app/types/maestro";

export type PrimaryTab = "tasks" | "lists" | "team" | "skills" | "graphs" | "profiles" | "collab";
export type TaskSubTab = "current" | "pinned" | "completed" | "archived";
export type SkillSubTab = "browse" | "installed" | "marketplace";
export type TeamSubTab = "members" | "teams";

type PanelIconBarProps = {
    primaryTab: PrimaryTab;
    onPrimaryTabChange: (tab: PrimaryTab) => void;
    taskSubTab: TaskSubTab;
    onTaskSubTabChange: (tab: TaskSubTab) => void;
    skillSubTab: SkillSubTab;
    onSkillSubTabChange: (tab: SkillSubTab) => void;
    teamSubTab: TeamSubTab;
    onTeamSubTabChange: (tab: TeamSubTab) => void;
    activeCount: number;
    pinnedCount: number;
    completedCount: number;
    archivedCount: number;
    teamMembers: TeamMember[];
    loading: boolean;
    projectId: string;
    onNewTask: () => void;
    onNewTaskList: () => void;
    onNewTeamMember: () => void;
    onNewTeam?: () => void;
    onNewGraph?: () => void;
    onNewModelProfile?: () => void;
    onTeamStandup?: () => void;
    teamCount?: number;
    taskListCount?: number;
    graphCount?: number;
    modelProfileCount?: number;
    hidePrimaryTabs?: boolean;
};

export const PanelIconBar: React.FC<PanelIconBarProps> = ({
    primaryTab,
    onPrimaryTabChange,
    taskSubTab,
    onTaskSubTabChange,
    skillSubTab,
    onSkillSubTabChange,
    teamSubTab,
    onTeamSubTabChange,
    activeCount,
    pinnedCount,
    completedCount,
    archivedCount,
    teamMembers,
    loading,
    projectId,
    onNewTask,
    onNewTaskList,
    onNewTeamMember,
    onNewTeam,
    onNewGraph,
    onNewModelProfile,
    onTeamStandup,
    teamCount = 0,
    taskListCount = 0,
    graphCount = 0,
    modelProfileCount = 0,
    hidePrimaryTabs = false,
}) => {

    const activeTeamCount = teamMembers.filter(t => t.status !== 'archived').length;

    return (
        <div className="maestroPanelTabSystem">
            {/* Primary tab bar - at the very top */}
            {!hidePrimaryTabs && <div className="maestroPanelPrimaryTabs">
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "tasks" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("tasks")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="14" height="14" rx="2" />
                        <path d="M7 7h6M7 10h6M7 13h4" strokeLinecap="round" />
                    </svg>
                    Tasks
                    <span className="maestroPanelTabBadge">{activeCount}</span>
                </button>
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "team" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("team")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="7" cy="7" r="3" />
                        <circle cx="14" cy="7" r="2.5" />
                        <path d="M1 17c0-3 2.5-5 6-5s6 2 6 5" />
                        <path d="M13 12c2.5 0 5 1.5 5 4" strokeLinecap="round" />
                    </svg>
                    Team
                    <span className="maestroPanelTabBadge">{activeTeamCount}</span>
                </button>
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "skills" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("skills")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 2L3 7l7 5 7-5-7-5z" strokeLinejoin="round" />
                        <path d="M3 13l7 5 7-5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3 10l7 5 7-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Skills
                </button>
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "lists" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("lists")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M4 5h12M4 10h12M4 15h12" strokeLinecap="round" />
                        <circle cx="6" cy="5" r="1" fill="currentColor" />
                        <circle cx="6" cy="10" r="1" fill="currentColor" />
                        <circle cx="6" cy="15" r="1" fill="currentColor" />
                    </svg>
                    Lists
                </button>
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "graphs" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("graphs")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="5" cy="5" r="2.5" />
                        <circle cx="15" cy="5" r="2.5" />
                        <circle cx="10" cy="15" r="2.5" />
                        <path d="M7.2 6.2L8.5 12.8" strokeLinecap="round" />
                        <path d="M12.8 6.2L11.5 12.8" strokeLinecap="round" />
                    </svg>
                    Graphs
                </button>
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "profiles" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("profiles")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 2l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L3.8 7.3l5-.7L10 2z" strokeLinejoin="round" />
                    </svg>
                    Profiles
                </button>
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "collab" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("collab")}
                    title="Collab Space"
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="10" cy="10" r="7" />
                        <path d="M3 10h14" strokeLinecap="round" />
                        <path d="M10 3c2.5 2.5 2.5 11.5 0 14" strokeLinecap="round" />
                        <path d="M10 3c-2.5 2.5-2.5 11.5 0 14" strokeLinecap="round" />
                    </svg>
                    Collab
                </button>
            </div>}

            {/* Secondary sub-tab bar - contextual */}
            <div className="maestroPanelSubTabs">
                {primaryTab === "tasks" && (
                    <>
                        <button type="button"
                            className="maestroPanelSubTab maestroPanelSubTab--action"
                            onClick={onNewTask}
                        >
                            <span className="maestroPanelSubTabPlus">+</span>
                            New Task
                        </button>
                        <button type="button"
                            className={`maestroPanelSubTab maestroPanelSubTab--icon ${taskSubTab === "current" ? "maestroPanelSubTabActive" : ""}`}
                            onClick={() => onTaskSubTabChange("current")}
                            title="Current"
                        >
                            <svg className="maestroPanelSubTabIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M3 4h10M3 8h10M3 12h7" />
                            </svg>
                            <span className="maestroPanelSubTabCount">{activeCount}</span>
                        </button>
                        <button type="button"
                            className={`maestroPanelSubTab maestroPanelSubTab--icon ${taskSubTab === "pinned" ? "maestroPanelSubTabActive" : ""}`}
                            onClick={() => onTaskSubTabChange("pinned")}
                            title="Pinned"
                        >
                            <svg className="maestroPanelSubTabIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 2l5 5-3.5 1L7 11.5 4.5 9l3.5-3.5L9 2z" />
                                <path d="M4.5 9L2 14l5-2.5" />
                            </svg>
                            <span className="maestroPanelSubTabCount">{pinnedCount}</span>
                        </button>
                        <button type="button"
                            className={`maestroPanelSubTab maestroPanelSubTab--icon ${taskSubTab === "completed" ? "maestroPanelSubTabActive" : ""}`}
                            onClick={() => onTaskSubTabChange("completed")}
                            title="Completed"
                        >
                            <svg className="maestroPanelSubTabIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 8.5l3.5 3.5L13 5" />
                            </svg>
                            <span className="maestroPanelSubTabCount">{completedCount}</span>
                        </button>
                        <button type="button"
                            className={`maestroPanelSubTab maestroPanelSubTab--icon ${taskSubTab === "archived" ? "maestroPanelSubTabActive" : ""}`}
                            onClick={() => onTaskSubTabChange("archived")}
                            title="Archived"
                        >
                            <svg className="maestroPanelSubTabIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="12" height="4" rx="1" />
                                <path d="M3 7v5a1 1 0 001 1h8a1 1 0 001-1V7" />
                                <path d="M6.5 10h3" />
                            </svg>
                            <span className="maestroPanelSubTabCount">{archivedCount}</span>
                        </button>
                    </>
                )}

                {primaryTab === "lists" && (
                    <>
                        <button type="button"
                            className="maestroPanelSubTab maestroPanelSubTab--action"
                            onClick={onNewTaskList}
                        >
                            <span className="maestroPanelSubTabPlus">+</span>
                            New List
                        </button>
                        <div className="maestroPanelSubTab maestroPanelSubTab--stat">
                            Lists
                            <span className="maestroPanelSubTabCount">{taskListCount}</span>
                        </div>
                    </>
                )}

                {primaryTab === "team" && teamSubTab === "members" && (
                    <>
                        <button type="button"
                            className="maestroPanelSubTab maestroPanelSubTab--action"
                            onClick={onNewTeamMember}
                        >
                            <span className="maestroPanelSubTabPlus">+</span>
                            New Member
                        </button>
                        {onTeamStandup && (
                            <button type="button"
                                className="maestroPanelSubTab maestroPanelSubTab--action"
                                onClick={onTeamStandup}
                                title="Run a team standup to audit and optimize the roster"
                            >
                                Standup
                            </button>
                        )}
                        <div className="maestroPanelSubTab maestroPanelSubTab--stat">
                            Members
                            <span className="maestroPanelSubTabCount">{activeTeamCount}</span>
                        </div>
                    </>
                )}

                {primaryTab === "team" && teamSubTab === "teams" && (
                    <>
                        <button type="button"
                            className="maestroPanelSubTab maestroPanelSubTab--action"
                            onClick={onNewTeam}
                        >
                            <span className="maestroPanelSubTabPlus">+</span>
                            New Team
                        </button>
                        <div className="maestroPanelSubTab maestroPanelSubTab--stat">
                            Teams
                            <span className="maestroPanelSubTabCount">{teamCount}</span>
                        </div>
                    </>
                )}

                {primaryTab === "profiles" && (
                    <>
                        <button type="button"
                            className="maestroPanelSubTab maestroPanelSubTab--action"
                            onClick={onNewModelProfile}
                        >
                            <span className="maestroPanelSubTabPlus">+</span>
                            New Profile
                        </button>
                        <div className="maestroPanelSubTab maestroPanelSubTab--stat">
                            Profiles
                            <span className="maestroPanelSubTabCount">{modelProfileCount}</span>
                        </div>
                    </>
                )}

                {primaryTab === "graphs" && (
                    <>
                        <button type="button"
                            className="maestroPanelSubTab maestroPanelSubTab--action"
                            onClick={onNewGraph}
                        >
                            <span className="maestroPanelSubTabPlus">+</span>
                            New Graph
                        </button>
                        <div className="maestroPanelSubTab maestroPanelSubTab--stat">
                            Graphs
                            <span className="maestroPanelSubTabCount">{graphCount}</span>
                        </div>
                    </>
                )}

                {/* Skills has no sub-tabs */}
            </div>
        </div>
    );
};
