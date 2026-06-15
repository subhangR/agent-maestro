import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { IconRail } from "./IconRail";
import { MaestroPanel } from "./maestro/MaestroPanel";
import { FileExplorerPanel } from "./FileExplorerPanel";
import { PrimaryTab, TeamSubTab } from "./maestro/PanelIconBar";
import { useUIStore, IconRailSection } from "../stores/useUIStore";
import { useProjectStore } from "../stores/useProjectStore";
import { useSessionStore } from "../stores/useSessionStore";
import { useWorkspaceStore, getActiveWorkspaceView } from "../stores/useWorkspaceStore";
import { useMaestroStore } from "../stores/useMaestroStore";
import { useSpacesStore } from "../stores/useSpacesStore";
import { isSshCommandLine, sshTargetFromCommandLine } from "../app/utils/ssh";
import { createMaestroSession } from "../services/maestroService";
import { useTasks } from "../hooks/useTasks";
import { ErrorBoundary } from "./ErrorBoundary";
import * as DEFAULTS from "../app/constants/defaults";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useMobilePanelStore } from "../stores/useMobilePanelStore";

function sectionToPrimaryTab(section: IconRailSection): PrimaryTab | null {
    switch (section) {
        case "tasks": return "tasks";
        case "members": return "team";
        case "teams": return "team";
        case "skills": return "skills";
        case "lists": return "lists";
        case "graphs": return "graphs";
        default: return null;
    }
}

function sectionToTeamSubTab(section: IconRailSection): TeamSubTab | undefined {
    switch (section) {
        case "members": return "members";
        case "teams": return "teams";
        default: return undefined;
    }
}

export const AppLeftPanel: React.FC = () => {
    const breakpoint = useBreakpoint();
    const isMobile = breakpoint === "mobile";

    const iconRailActiveSection = useUIStore((s) => s.iconRailActiveSection);
    const toggleIconRailSection = useUIStore((s) => s.toggleIconRailSection);
    const homeDir = useUIStore((s) => s.homeDir);

    // Project & session stores
    const projects = useProjectStore((s) => s.projects);
    const activeProjectId = useProjectStore((s) => s.activeProjectId);
    const activeProject = useMemo(
        () => projects.find((p) => p.id === activeProjectId) ?? null,
        [projects, activeProjectId],
    );

    const sessions = useSessionStore((s) => s.sessions);
    const activeId = useSessionStore((s) => s.activeId);
    const handleJumpToSessionFromTask = useSessionStore((s) => s.handleJumpToSessionFromTask);
    const handleAddTaskToSessionRequest = useSessionStore((s) => s.handleAddTaskToSessionRequest);
    const active = sessions.find((s) => s.id === activeId) ?? null;

    // On mobile, auto-switch to the main (terminal) panel when a session is activated
    useEffect(() => {
        if (isMobile && activeId) {
            useMobilePanelStore.getState().setActivePanel("main");
        }
    }, [isMobile, activeId]);

    // SSH state
    const activeIsSsh = active
        ? isSshCommandLine(active.launchCommand ?? active.restoreCommand ?? null)
        : false;
    const activeSshTarget = (() => {
        if (!active) return null;
        if (!activeIsSsh) return null;
        const stored = active.sshTarget?.trim() ?? "";
        if (stored) return stored;
        return sshTargetFromCommandLine(active.launchCommand ?? active.restoreCommand ?? null);
    })();

    // Workspace store
    const activeWorkspaceView = getActiveWorkspaceView();
    const openFileAsSpace = useSpacesStore((s) => s.openFile);
    const setActiveId = useSessionStore((s) => s.setActiveId);

    const fileExplorerRootDir =
        activeWorkspaceView.fileExplorerRootDir ??
        activeWorkspaceView.codeEditorRootDir ??
        activeProject?.basePath ??
        active?.cwd ??
        homeDir ??
        "";

    const handleSelectFileAsSpace = useCallback(
        (path: string) => {
            const rootDir = fileExplorerRootDir;
            if (!rootDir) return;
            const id = openFileAsSpace({
                projectId: activeProjectId,
                filePath: path,
                rootDir,
                provider: activeIsSsh ? "ssh" : "local",
                sshTarget: activeIsSsh ? activeSshTarget : null,
            });
            setActiveId(id);
        },
        [activeProjectId, fileExplorerRootDir, activeIsSsh, activeSshTarget, openFileAsSpace, setActiveId],
    );

    // Task/team counts for badges
    const { tasks } = useTasks(activeProjectId);
    const teamMembersMap = useMaestroStore((s) => s.teamMembers);
    const teamsMap = useMaestroStore((s) => s.teams);

    const taskCount = useMemo(
        () => tasks.filter((t) => t.status !== "completed" && t.status !== "archived").length,
        [tasks],
    );
    const memberCount = useMemo(
        () => Object.values(teamMembersMap).filter((tm) => tm.projectId === activeProjectId && tm.status !== "archived").length,
        [teamMembersMap, activeProjectId],
    );
    const teamCount = useMemo(
        () => Object.values(teamsMap).filter((t) => t.projectId === activeProjectId && t.status === "active").length,
        [teamsMap, activeProjectId],
    );

    const handleSectionChange = useCallback(
        (section: Exclude<IconRailSection, null>) => {
            toggleIconRailSection(section);
        },
        [toggleIconRailSection],
    );

    const isExpanded = iconRailActiveSection !== null;
    const forcedPrimaryTab = sectionToPrimaryTab(iconRailActiveSection);
    const forcedTeamSubTab = sectionToTeamSubTab(iconRailActiveSection);
    const showFiles = iconRailActiveSection === "files";
    const showMaestro = isExpanded && !showFiles;

    // Track whether MaestroPanel has ever been opened so we mount it once and keep it alive
    const hasMountedMaestroRef = useRef(false);
    if (showMaestro && activeProject) hasMountedMaestroRef.current = true;
    const keepMaestroMounted = hasMountedMaestroRef.current && !!activeProject;

    const handleClose = useCallback(
        () => useUIStore.getState().setIconRailActiveSection(null),
        [],
    );

    return (
        <div
            className={`appLeftPanel ${isExpanded ? "appLeftPanel--expanded" : ""}`}
            style={{
                // Width is driven by the CSS var so a resize commit never
                // re-renders this (heavy) panel — see useAppLayoutResizing.
                // On mobile the panel fills its container (100%) via CSS.
                width: isMobile
                    ? "100%"
                    : isExpanded
                        ? `calc(${DEFAULTS.ICON_RAIL_WIDTH}px + var(--maestro-sidebar-width))`
                        : `${DEFAULTS.ICON_RAIL_WIDTH}px`,
            }}
        >
            <IconRail
                activeSection={iconRailActiveSection}
                onSectionChange={handleSectionChange}
                taskCount={taskCount}
                memberCount={memberCount}
                teamCount={teamCount}
            />

            {/* Always-mounted content pane — hidden via CSS when collapsed */}
            <div
                className="appLeftPanelContent"
                style={{
                    width: isMobile ? undefined : 'var(--maestro-sidebar-width)',
                    display: isExpanded ? undefined : 'none',
                }}
            >
                {/* MaestroPanel stays mounted once opened — avoids expensive remount */}
                {keepMaestroMounted && (
                    <div style={{ display: showMaestro ? undefined : 'none', width: '100%', height: '100%' }}>
                        <MaestroPanel
                            isOpen={showMaestro}
                            onClose={handleClose}
                            projectId={activeProjectId}
                            project={activeProject!}
                            onCreateMaestroSession={createMaestroSession}
                            onJumpToSession={handleJumpToSessionFromTask}
                            onAddTaskToSession={handleAddTaskToSessionRequest}
                            forcedPrimaryTab={forcedPrimaryTab ?? undefined}
                            forcedTeamSubTab={forcedTeamSubTab}
                        />
                    </div>
                )}

                {showFiles && (
                    <ErrorBoundary name="FileExplorer">
                        <FileExplorerPanel
                            isOpen={true}
                            provider={activeIsSsh ? "ssh" : "local"}
                            sshTarget={activeIsSsh ? activeSshTarget : null}
                            rootDir={fileExplorerRootDir}
                            activeFilePath={activeWorkspaceView.codeEditorActiveFilePath}
                            onSelectFile={handleSelectFileAsSpace}
                            onClose={handleClose}
                        />
                    </ErrorBoundary>
                )}
            </div>
        </div>
    );
};
