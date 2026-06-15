import React, { useCallback, useState } from "react";
import { SessionsSection } from "./SessionsSection";
import { SpacesRail } from "./SpacesRail";
import { NewSpaceDropdown } from "./NewSpaceDropdown";
import { ResourcesView } from "./ResourcesView";
import type { ProcessEffect } from "../processEffects";
import * as DEFAULTS from "../app/constants/defaults";
import { useSpacesStore } from "../stores/useSpacesStore";
import { useSessionStore } from "../stores/useSessionStore";
import { isWhiteboardId, isDocumentId, isFileId } from "../app/types/space";
import { maestroClient } from "../utils/MaestroClient";
import { Icon } from "./maestro/redesign/kit";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useMobilePanelStore } from "../stores/useMobilePanelStore";

type SpacesPanelProps = {
    agentShortcuts: ProcessEffect[];
    sessions: any[];
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
    activeSection: 'sessions' | null;
    onToggle: () => void;
};

export const SpacesPanel: React.FC<SpacesPanelProps> = ({
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
    activeSection,
    onToggle,
}) => {
    const isExpanded = activeSection !== null;
    const [panelMode, setPanelMode] = useState<'sessions' | 'resources'>('sessions');
    const createWhiteboard = useSpacesStore((s) => s.createWhiteboard);
    const closeWhiteboard = useSpacesStore((s) => s.closeWhiteboard);
    const closeDocument = useSpacesStore((s) => s.closeDocument);
    const closeFile = useSpacesStore((s) => s.closeFile);
    const setActiveId = useSessionStore((s) => s.setActiveId);
    const breakpoint = useBreakpoint();
    const isMobile = breakpoint === "mobile";
    const setActivePanel = useMobilePanelStore((s) => s.setActivePanel);

    const handleSelectSessionMobile = useCallback((sessionId: string) => {
        onSelectSession(sessionId);
        if (isMobile) {
            setActivePanel("main");
        }
    }, [onSelectSession, isMobile, setActivePanel]);

    // On mobile always show the sessions list, not the collapsed icon rail
    const showExpanded = isExpanded || isMobile;

    const handleCreateWhiteboard = useCallback(async () => {
        const activeSess = sessions.find((s: any) => s.id === activeSessionId);
        const maestroSessionId: string | undefined = activeSess?.maestroSessionId;
        if (maestroSessionId) {
            try {
                const title = `Whiteboard ${new Date().toLocaleDateString()}`;
                const doc = await maestroClient.addSessionDoc(maestroSessionId, title, '{}', 'diagram');
                const id = createWhiteboard(activeProjectId, title, undefined, doc.id, maestroSessionId);
                setActiveId(id);
                return;
            } catch {
                // fall through to localStorage-only whiteboard
            }
        }
        const id = createWhiteboard(activeProjectId);
        setActiveId(id);
    }, [sessions, activeSessionId, activeProjectId, createWhiteboard, setActiveId]);

    const handleOpenResources = useCallback(() => {
        setPanelMode('resources');
        if (!isExpanded) onToggle();
    }, [isExpanded, onToggle]);

    const handleCloseSpace = (id: string) => {
        if (isWhiteboardId(id)) {
            closeWhiteboard(id);
        } else if (isDocumentId(id)) {
            closeDocument(id);
        } else if (isFileId(id)) {
            closeFile(id);
        }
        // If the closed space was active, switch to first session
        if (id === activeSessionId) {
            if (sessions.length > 0) {
                setActiveId(sessions[0].id);
            } else {
                setActiveId(null);
            }
        }
    };

    return (
        <aside
            className={`pn-sp${isMobile ? ' pn-sp--mobile' : ''}`}
            style={{
                // Width is driven by the CSS var so a resize commit never
                // re-renders this panel — see useAppLayoutResizing.
                width: isExpanded
                    ? 'var(--right-panel-width)'
                    : `${DEFAULTS.SPACES_RAIL_WIDTH}px`,
                maxWidth: isExpanded
                    ? 'var(--right-panel-width)'
                    : `${DEFAULTS.SPACES_RAIL_WIDTH}px`,
                flexShrink: 0,
                flexGrow: 0,
            }}
        >
            {showExpanded ? (
                <div
                    className="spacesPanelContent"
                    style={{ width: isMobile ? '100%' : 'var(--right-panel-width)', position: 'relative' }}
                >
                    <div className="pn-tabs" style={{ paddingTop: 0 }}>
                        <button
                            type="button"
                            className={`pn-tab ${panelMode === 'sessions' ? 'pn-tab--active' : ''}`}
                            style={{ paddingTop: 13 }}
                            onClick={() => setPanelMode('sessions')}
                        >
                            Sessions <span className="pn-tab-n">{sessions.length}</span>
                        </button>
                        <button
                            type="button"
                            className={`pn-tab ${panelMode === 'resources' ? 'pn-tab--active' : ''}`}
                            style={{ paddingTop: 13 }}
                            onClick={() => setPanelMode('resources')}
                            data-testid="resources-tab-btn"
                        >
                            Resources
                        </button>
                        <span className="pn-head-spacer" style={{ flex: 1 }} />
                        {panelMode === 'sessions' && (
                            <NewSpaceDropdown
                                variant="toolbar"
                                onOpenNewSession={onOpenNewSession}
                                onOpenWhiteboard={handleCreateWhiteboard}
                                agentShortcuts={agentShortcuts}
                                onQuickStart={onQuickStart}
                            />
                        )}
                        {!isMobile && (
                            <button
                                className="pn-ib"
                                style={{ alignSelf: 'center' }}
                                title="Collapse Panel"
                                type="button"
                                onClick={onToggle}
                            >
                                <Icon name="chevronR" />
                            </button>
                        )}
                    </div>

                    {panelMode === 'sessions' ? (
                        <SessionsSection
                            agentShortcuts={agentShortcuts}
                            sessions={sessions}
                            activeSessionId={activeSessionId}
                            activeProjectId={activeProjectId}
                            projectName={projectName}
                            projectBasePath={projectBasePath}
                            onSelectSession={handleSelectSessionMobile}
                            onCloseSession={onCloseSession}
                            onReorderSessions={onReorderSessions}
                            onQuickStart={onQuickStart}
                            onOpenNewSession={onOpenNewSession}
                            onOpenAgentShortcuts={onOpenAgentShortcuts}
                            onOpenPersistentSessions={onOpenPersistentSessions}
                            onOpenSshManager={onOpenSshManager}
                            onOpenManageTerminals={onOpenManageTerminals}
                            onCreateWhiteboard={handleCreateWhiteboard}
                            onCloseSpace={handleCloseSpace}
                        />
                    ) : (
                        <ResourcesView projectId={activeProjectId} />
                    )}
                </div>
            ) : (
                <SpacesRail
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onSelectSession={(id) => {
                        onSelectSession(id);
                    }}
                    onToggle={onToggle}
                    onOpenNewSession={onOpenNewSession}
                    onOpenWhiteboard={handleCreateWhiteboard}
                    onOpenResources={handleOpenResources}
                    onCloseSpace={handleCloseSpace}
                    agentShortcuts={agentShortcuts}
                    onQuickStart={onQuickStart}
                />
            )}
        </aside>
    );
};
