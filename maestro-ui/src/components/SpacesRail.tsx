import React, { useMemo } from "react";
import { getProcessEffectById } from "../processEffects";
import type { ProcessEffect } from "../processEffects";
import { useMaestroStore } from "../stores/useMaestroStore";
import { useSpacesStore } from "../stores/useSpacesStore";
import { useProjectStore } from "../stores/useProjectStore";
import { buildTeamGroups, getGroupedSessionOrder } from "../utils/teamGrouping";
import { NewSpaceDropdown } from "./NewSpaceDropdown";
import { useProjectCollabSpaces } from "../hooks/useProjectCollabSpaces";
import { makeCollabActiveId } from "../app/types/space";
import { SpaceAvatar } from "./space-window/SpaceAvatar";

type RailSession = {
    id: string;
    name: string;
    effectId?: string | null;
    agentWorking?: boolean;
    exited?: boolean;
    closing?: boolean;
    maestroSessionId?: string | null;
};

type SpacesRailProps = {
    sessions: RailSession[];
    activeSessionId: string | null;
    onSelectSession: (sessionId: string) => void;
    onToggle: () => void;
    onOpenNewSession?: () => void;
    onOpenWhiteboard?: () => void;
    onCloseSpace?: (id: string) => void;
    agentShortcuts?: ProcessEffect[];
    onQuickStart?: (effect: ProcessEffect) => void;
};

function getSessionInitial(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "?";
    return trimmed[0].toUpperCase();
}

const TerminalIcon: React.FC = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
        <rect x="2" y="3" width="16" height="14" rx="2" />
        <path d="M6 9l3 2-3 2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 13h4" strokeLinecap="round" />
    </svg>
);

function RailSessionButton({
    session,
    isActive,
    onSelect,
    maestroSessions,
}: {
    session: RailSession;
    isActive: boolean;
    onSelect: () => void;
    maestroSessions: Record<string, any>;
}) {
    const effect = getProcessEffectById(session.effectId);
    const isWorking = Boolean(effect && session.agentWorking && !session.exited && !session.closing);
    const isExited = Boolean(session.exited || session.closing);

    const maestroSession = session.maestroSessionId ? maestroSessions[session.maestroSessionId] ?? null : null;
    const needsInput = Boolean(maestroSession?.needsInput?.active);
    const isCompleted = maestroSession?.status === 'completed' || maestroSession?.status === 'stopped';

    return (
        <button
            className={`spacesRailSession ${isActive ? "spacesRailSession--active" : ""} ${isWorking ? "spacesRailSession--working" : ""} ${isExited ? "spacesRailSession--exited" : ""} ${needsInput ? "spacesRailSession--needsInput" : ""} ${isCompleted ? "spacesRailSession--completed" : ""}`}
            onClick={onSelect}
            title={session.name}
            type="button"
            {...(session.maestroSessionId ? { 'data-maestro-session-id': session.maestroSessionId } : {})}
        >
            {isActive && <span className="iconRailActiveIndicator iconRailActiveIndicator--right" />}
            {effect?.iconSrc ? (
                <img
                    src={effect.iconSrc}
                    alt={effect.label}
                    className="spacesRailSessionIcon"
                    width="20"
                    height="20"
                />
            ) : session.maestroSessionId ? (
                <span className="spacesRailSessionInitial spacesRailSessionInitial--maestro">
                    {getSessionInitial(session.name)}
                </span>
            ) : (
                <TerminalIcon />
            )}
            {isWorking && <span className="spacesRailSessionPulse" />}
            {needsInput && <span className="spacesRailSessionNeedsInput" title="Needs Input" />}
            {isCompleted && <span className="spacesRailSessionCompleted" title="Completed" />}
        </button>
    );
}

const WhiteboardIcon: React.FC = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
        <path d="M3 17l3.5-3.5M6.5 13.5l-2-2L14 2l2 2L6.5 13.5z" strokeLinejoin="round" />
        <path d="M12 4l2 2" strokeLinecap="round" />
    </svg>
);

const DocumentIcon: React.FC = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
        <path d="M5 2h7l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
        <path d="M12 2v4h4" />
        <path d="M7 10h6M7 13h4" strokeLinecap="round" />
    </svg>
);

const FileCodeIcon: React.FC = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
        <path d="M5 2h7l4 4v11a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" />
        <path d="M12 2v4h4" />
        <path d="M8 11l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 11l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const SpacesRail: React.FC<SpacesRailProps> = ({
    sessions,
    activeSessionId,
    onSelectSession,
    onToggle,
    onOpenNewSession,
    onOpenWhiteboard,
    onCloseSpace,
    agentShortcuts,
    onQuickStart,
}) => {
    const maestroSessions = useMaestroStore((s) => s.sessions);
    const teamsMap = useMaestroStore((s) => s.teams);
    const activeProjectId = useProjectStore((s) => s.activeProjectId);
    const allSpaces = useSpacesStore((s) => s.spaces);
    const spaces = useMemo(
        () => allSpaces.filter((s) => s.projectId === activeProjectId),
        [allSpaces, activeProjectId],
    );

    const { spaces: collabSpaces } = useProjectCollabSpaces();

    const teamGroupData = useMemo(() => {
        return buildTeamGroups(sessions, maestroSessions, teamsMap);
    }, [sessions, maestroSessions, teamsMap]);

    const { grouped, ungrouped } = useMemo(() => {
        return getGroupedSessionOrder(sessions, teamGroupData.groups);
    }, [sessions, teamGroupData.groups]);

    const totalCount = sessions.length + spaces.length + collabSpaces.length;

    return (
        <div className="spacesRail">
            {/* Plus button at the very top — shared dropdown */}
            <NewSpaceDropdown
                variant="rail"
                onOpenNewSession={onOpenNewSession}
                onOpenWhiteboard={onOpenWhiteboard}
                agentShortcuts={agentShortcuts}
                onQuickStart={onQuickStart}
            />

            {/* Expand/collapse panel button */}
            <button
                className="iconRailButton"
                onClick={onToggle}
                title="Expand Spaces"
                type="button"
            >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <rect x="2" y="3" width="16" height="14" rx="2" />
                    <path d="M2 7h16" />
                    <circle cx="5" cy="5" r="0.8" fill="currentColor" stroke="none" />
                    <circle cx="7.5" cy="5" r="0.8" fill="currentColor" stroke="none" />
                    <circle cx="10" cy="5" r="0.8" fill="currentColor" stroke="none" />
                </svg>
                {totalCount > 0 && (
                    <span className="iconRailBadge">{totalCount > 99 ? "99+" : totalCount}</span>
                )}
            </button>

            <div className="spacesRailDivider" />

            {/* Per-session icons — fill ALL remaining space */}
            <div className="spacesRailSessions">
                {grouped.map(({ group, sessions: groupSessions }) => (
                    <div
                        key={group.teamSessionId}
                        className="spacesRailTeamGroup"
                        style={{
                            borderColor: group.color.border,
                            background: group.color.dim,
                        }}
                        title={group.teamName || `Team (${groupSessions.length})`}
                    >
                        {groupSessions.map((session) => (
                            <RailSessionButton
                                key={session.id}
                                session={session}
                                isActive={session.id === activeSessionId}
                                onSelect={() => onSelectSession(session.id)}
                                maestroSessions={maestroSessions}
                            />
                        ))}
                    </div>
                ))}

                {ungrouped.map((session) => (
                    <RailSessionButton
                        key={session.id}
                        session={session}
                        isActive={session.id === activeSessionId}
                        onSelect={() => onSelectSession(session.id)}
                        maestroSessions={maestroSessions}
                    />
                ))}

                {/* Whiteboard, document & file space buttons */}
                {spaces.map((space) => (
                    <button type="button"
                        key={space.id}
                        className={`spacesRailSession spacesRailSpace spacesRailSpace--${space.type} ${space.id === activeSessionId ? "spacesRailSession--active" : ""}`}
                        onClick={() => onSelectSession(space.id)}
                        title={space.name}
                    >
                        {space.id === activeSessionId && <span className="iconRailActiveIndicator iconRailActiveIndicator--right" />}
                        {space.type === "whiteboard" ? <WhiteboardIcon /> : space.type === "file" ? <FileCodeIcon /> : <DocumentIcon />}
                    </button>
                ))}

                {/* Joined Collab Spaces matching the active project's git remote */}
                {collabSpaces.length > 0 && <div className="spacesRailDivider" />}
                {collabSpaces.map((cs) => {
                    const activeId = makeCollabActiveId(cs.id);
                    const isActive = activeId === activeSessionId;
                    return (
                        <button
                            type="button"
                            key={cs.id}
                            className={`spacesRailSession spacesRailSpace spacesRailSpace--collab ${isActive ? "spacesRailSession--active" : ""}`}
                            onClick={() => onSelectSession(activeId)}
                            title={`${cs.name} · ${cs.githubUrl}`}
                        >
                            {isActive && <span className="iconRailActiveIndicator iconRailActiveIndicator--right" />}
                            <SpaceAvatar colorKey={cs.id} name={cs.name} size={26} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
