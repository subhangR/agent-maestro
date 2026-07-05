import React from "react";
import { IconRailSection } from "../stores/useUIStore";
import { Icon, Mark, IconName } from "./maestro/redesign/kit";

type IconRailProps = {
    activeSection: IconRailSection;
    onSectionChange: (section: Exclude<IconRailSection, null>) => void;
    taskCount?: number;
    memberCount?: number;
    teamCount?: number;
    onOpenWhiteboard?: () => void;
};

const railItems: { section: Exclude<IconRailSection, null>; label: string; icon: IconName }[] = [
    { section: "tasks", label: "Tasks", icon: "listChecks" },
    { section: "members", label: "Members", icon: "users" },
    { section: "teams", label: "Teams", icon: "team" },
    { section: "skills", label: "Skills", icon: "sparkles" },
    { section: "lists", label: "Lists", icon: "inbox" },
    { section: "graphs", label: "Graphs", icon: "graph" },
    { section: "files", label: "Files", icon: "folder" },
    { section: "collab", label: "Collab Space", icon: "globe" },
];
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
        <div className="pn-rail">
            <span className="pn-rail-mark"><Mark size={24} /></span>

            {railItems.map(({ section, label, icon }) => {
                const isActive = activeSection === section;
                const badge = getBadge(section, props);

                return (
                    <button type="button"
                        key={section}
                        className={`pn-rail-btn${isActive ? " pn-rail-btn--active" : ""}`}
                        onClick={() => onSectionChange(section)}
                        title={label}
                    >
                        <Icon name={icon} sw={1.55} />
                        {badge != null && badge > 0 && (
                            <span className="pn-rail-badge">{badge > 99 ? "99+" : badge}</span>
                        )}
                    </button>
                );
            })}

            <span className="pn-rail-spacer" />

            {/* Whiteboard shortcut */}
            {onOpenWhiteboard && (
                <button
                    className="pn-rail-btn"
                    onClick={onOpenWhiteboard}
                    title="Whiteboard"
                    type="button"
                >
                    <Icon name="pen" sw={1.55} />
                </button>
            )}
        </div>
    );
};
