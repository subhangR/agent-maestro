import React from "react";
import { IconRailSection } from "../stores/useUIStore";

type IconRailProps = {
    activeSection: IconRailSection;
    onSectionChange: (section: Exclude<IconRailSection, null>) => void;
    taskCount?: number;
    memberCount?: number;
    teamCount?: number;
    onOpenWhiteboard?: () => void;
};

const railItems: { section: Exclude<IconRailSection, null>; label: string }[] = [
    { section: "tasks", label: "Tasks" },
    { section: "members", label: "Members" },
    { section: "teams", label: "Teams" },
    { section: "skills", label: "Skills" },
    { section: "lists", label: "Lists" },
    { section: "graphs", label: "Graphs" },
    { section: "files", label: "Files" },
    { section: "collab", label: "Collab Space" },
];

function getSvgForSection(section: string): React.ReactNode {
    switch (section) {
        case "tasks":
            return (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <rect x="3" y="3" width="14" height="14" rx="2" />
                    <path d="M7 7h6M7 10h6M7 13h4" strokeLinecap="round" />
                </svg>
            );
        case "members":
            return (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <circle cx="7" cy="7" r="3" />
                    <circle cx="14" cy="7" r="2.5" />
                    <path d="M1 17c0-3 2.5-5 6-5s6 2 6 5" />
                    <path d="M13 12c2.5 0 5 1.5 5 4" strokeLinecap="round" />
                </svg>
            );
        case "teams":
            return (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <circle cx="10" cy="5" r="3" />
                    <circle cx="4" cy="11" r="2.5" />
                    <circle cx="16" cy="11" r="2.5" />
                    <path d="M6 18c0-2 1.5-3.5 4-3.5s4 1.5 4 3.5" strokeLinecap="round" />
                </svg>
            );
        case "skills":
            return (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <path d="M10 2L3 7l7 5 7-5-7-5z" strokeLinejoin="round" />
                    <path d="M3 13l7 5 7-5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3 10l7 5 7-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            );
        case "lists":
            return (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <path d="M4 5h12M4 10h12M4 15h12" strokeLinecap="round" />
                    <circle cx="6" cy="5" r="1" fill="currentColor" />
                    <circle cx="6" cy="10" r="1" fill="currentColor" />
                    <circle cx="6" cy="15" r="1" fill="currentColor" />
                </svg>
            );
        case "graphs":
            return (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <circle cx="5" cy="5" r="2.5" />
                    <circle cx="15" cy="5" r="2.5" />
                    <circle cx="10" cy="15" r="2.5" />
                    <path d="M7.2 6.2L8.5 12.8" strokeLinecap="round" />
                    <path d="M12.8 6.2L11.5 12.8" strokeLinecap="round" />
                </svg>
            );
        case "files":
            return (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <path d="M3 4c0-.6.4-1 1-1h4l2 2h6c.6 0 1 .4 1 1v10c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1V4z" />
                </svg>
            );
        case "collab":
            return (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                    <circle cx="10" cy="10" r="7" />
                    <path d="M3 10h14" strokeLinecap="round" />
                    <path d="M10 3c2.5 2.5 2.5 11.5 0 14" strokeLinecap="round" />
                    <path d="M10 3c-2.5 2.5-2.5 11.5 0 14" strokeLinecap="round" />
                </svg>
            );
        default:
            return null;
    }
}

function getBadge(section: string, props: IconRailProps): number | null {
    switch (section) {
        case "tasks":
            return props.taskCount ?? null;
        case "members":
            return props.memberCount ?? null;
        case "teams":
            return props.teamCount ?? null;
        default:
            return null;
    }
}

export const IconRail: React.FC<IconRailProps> = (props) => {
    const { activeSection, onSectionChange, onOpenWhiteboard } = props;

    return (
        <div className="iconRail">
            {railItems.map(({ section, label }) => {
                const isActive = activeSection === section;
                const badge = getBadge(section, props);

                return (
                    <button type="button"
                        key={section}
                        className={`iconRailButton ${isActive ? "iconRailButton--active" : ""}`}
                        onClick={() => onSectionChange(section)}
                        title={label}
                    >
                        {isActive && <span className="iconRailActiveIndicator" />}
                        {getSvgForSection(section)}
                        {badge != null && badge > 0 && (
                            <span className="iconRailBadge">{badge > 99 ? "99+" : badge}</span>
                        )}
                    </button>
                );
            })}

            <div className="iconRailSpacer" />

            {/* Whiteboard shortcut */}
            {onOpenWhiteboard && (
                <button
                    className="iconRailButton"
                    onClick={onOpenWhiteboard}
                    title="Whiteboard"
                    type="button"
                >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                        <path d="M3 17l3.5-3.5M6.5 13.5l-2-2L14 2l2 2L6.5 13.5z" strokeLinejoin="round" />
                        <path d="M12 4l2 2" strokeLinecap="round" />
                    </svg>
                </button>
            )}
        </div>
    );
};
