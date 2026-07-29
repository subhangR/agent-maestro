import React from "react";
import { IconRailSection } from "../stores/useUIStore";
import { Icon, Mark, IconName } from "./maestro/redesign/kit";
import { useAdvancedMode } from "../hooks/useAdvancedMode";

type IconRailProps = {
    activeSection: IconRailSection;
    onSectionChange: (section: Exclude<IconRailSection, null>) => void;
    taskCount?: number;
    memberCount?: number;
    teamCount?: number;
};

const railItems: { section: Exclude<IconRailSection, null>; label: string; icon: IconName }[] = [
    { section: "tasks", label: "Tasks", icon: "listChecks" },
    // Members and Teams were two separate rail entries that opened the same
    // panel; they're now one "Team" entry with a Members/Teams switcher inside.
    { section: "members", label: "Team", icon: "team" },
    { section: "skills", label: "Skills", icon: "sparkles" },
    { section: "lists", label: "Lists", icon: "inbox" },
    { section: "graphs", label: "Graphs", icon: "graph" },
    { section: "collab", label: "Collab Space", icon: "globe" },
];

// Advanced-only destinations, appended when Developer features are on.
// Files (a full file browser + code editor) and Model profiles are power-user
// surfaces, hidden from the default non-developer view.
const advancedRailItems: { section: Exclude<IconRailSection, null>; label: string; icon: IconName }[] = [
    { section: "files", label: "Files", icon: "folder" },
    { section: "profiles", label: "Model profiles", icon: "sliders" },
    { section: "analytics", label: "Token analytics", icon: "hash" },
];
function getBadge(section: string, props: IconRailProps): number | null {
    switch (section) {
        case "tasks":
            return props.taskCount ?? null;
        case "members":
            // "Team" entry — count members (its default sub-view).
            return props.memberCount ?? null;
        default:
            return null;
    }
}

export const IconRail: React.FC<IconRailProps> = (props) => {
    const { activeSection, onSectionChange } = props;
    const advancedMode = useAdvancedMode();
    const items = advancedMode ? [...railItems, ...advancedRailItems] : railItems;

    return (
        <div className="pn-rail">
            <span className="pn-rail-mark"><Mark size={24} /></span>

            {items.map(({ section, label, icon }) => {
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
                        <span className="pn-rail-label">{label}</span>
                        {badge != null && badge > 0 && (
                            <span className="pn-rail-badge">{badge > 99 ? "99+" : badge}</span>
                        )}
                    </button>
                );
            })}

            <span className="pn-rail-spacer" />
        </div>
    );
};
