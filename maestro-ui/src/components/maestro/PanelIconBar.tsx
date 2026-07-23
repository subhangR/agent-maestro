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
                {/* Tasks — checkbox with tick: unmistakably "things to do" */}
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "tasks" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("tasks")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="4" width="7" height="7" rx="1.5" />
                        <path d="M4.5 7.5L6 9L9 5.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M13 6h4M13 10h3M13 14h2" strokeLinecap="round" />
                        <path d="M4 14h6" strokeLinecap="round" />
                    </svg>
                    Tasks
                    <span className="maestroPanelTabBadge">{activeCount}</span>
                </button>
                {/* Team — silhouette of two people side by side */}
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "team" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("team")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="8" cy="6.5" r="2.8" />
                        <path d="M2.5 16.5c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8" strokeLinecap="round" />
                        <circle cx="14.5" cy="7" r="2.2" />
                        <path d="M14 11.8c1.5.3 3.5 1.4 3.5 4.7" strokeLinecap="round" />
                    </svg>
                    Team
                    <span className="maestroPanelTabBadge">{activeTeamCount}</span>
                </button>
                {/* Skills — lightning bolt: capability / power */}
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "skills" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("skills")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 2L5 11h6.5L8 18l9-11h-6.5L12 2z" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                    Skills
                </button>
                {/* Lists — numbered ordered list (1·2·3): clearly "ordered collection" */}
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "lists" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("lists")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M8 5h9M8 10h9M8 15h9" strokeLinecap="round" />
                        <path d="M4 4v3" strokeLinecap="round" />
                        <path d="M3 7h2" strokeLinecap="round" />
                        <path d="M3 9.5h2v1.5L3 13h2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3.5 15.5A.5.5 0 014 15h1.5v1.5H3.5v-1.5z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Lists
                </button>
                {/* Graphs — knowledge graph: nodes + edges in a triangle */}
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "graphs" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("graphs")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="10" cy="4" r="2.2" />
                        <circle cx="4" cy="15" r="2.2" />
                        <circle cx="16" cy="15" r="2.2" />
                        <line x1="10" y1="6.2" x2="4.8" y2="13" strokeLinecap="round" />
                        <line x1="10" y1="6.2" x2="15.2" y2="13" strokeLinecap="round" />
                        <line x1="6.2" y1="15" x2="13.8" y2="15" strokeLinecap="round" />
                    </svg>
                    Graphs
                </button>
                {/* Profiles — CPU/chip: model profile metaphor */}
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "profiles" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("profiles")}
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
                        <path d="M8 5.5V3M10 5.5V3M12 5.5V3" strokeLinecap="round" />
                        <path d="M8 14.5V17M10 14.5V17M12 14.5V17" strokeLinecap="round" />
                        <path d="M5.5 8H3M5.5 10H3M5.5 12H3" strokeLinecap="round" />
                        <path d="M14.5 8H17M14.5 10H17M14.5 12H17" strokeLinecap="round" />
                    </svg>
                    Profiles
                </button>
                {/* Collab — two speech bubbles: communication/collaboration */}
                <button type="button"
                    className={`maestroPanelPrimaryTab ${primaryTab === "collab" ? "maestroPanelPrimaryTabActive" : ""}`}
                    onClick={() => onPrimaryTabChange("collab")}
                    title="Collab Space"
                >
                    <svg className="maestroPanelTabIcon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 4h10a1 1 0 011 1v5a1 1 0 01-1 1H6l-3 2.5V5a1 1 0 011-1z" strokeLinejoin="round" />
                        <path d="M14 8h2a1 1 0 011 1v3a1 1 0 01-1 1h-1v2l-2-2h-1" strokeLinejoin="round" />
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
                            {/* inbox/active tray — distinct from Lists' numbered icon */}
                            <svg className="maestroPanelSubTabIcon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 9.5h3.5L7 11.5h2l1.5-2H14" />
                                <rect x="2" y="3.5" width="12" height="8" rx="1" />
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
