import React from "react";
import { SpaceSection, useUIStore } from "../../stores/useUIStore";

type Props = {
    spaceId: string;
};

type Tab = {
    id: SpaceSection;
    label: string;
    icon: React.ReactNode;
};

const TABS: Tab[] = [
    {
        id: "messages",
        label: "Messages",
        icon: (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6.4L3 14.4V12a1 1 0 0 1-1-1V4z" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        id: "tasks",
        label: "Tasks",
        icon: (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
                <path d="M5 7l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 11h4.5" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        id: "team",
        label: "Team Members",
        icon: (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="6" cy="6" r="2.4" />
                <circle cx="11.2" cy="6" r="2" />
                <path d="M1.5 13.5c0-2.2 2-3.7 4.5-3.7s4.5 1.5 4.5 3.7" />
                <path d="M11 10c1.9 0 3.7 1 3.7 3" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        id: "spells",
        label: "Spells",
        icon: (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 1.5l1.9 4 4.4.6-3.2 3.1.8 4.4L8 11.5l-3.9 2.1.8-4.4L1.7 6.1l4.4-.6L8 1.5z" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        id: "members",
        label: "Members",
        icon: (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="6" r="3" />
                <path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        id: "settings",
        label: "Settings",
        icon: (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="2" />
                <path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" strokeLinecap="round" />
            </svg>
        ),
    },
];

export const SpaceTopTabs: React.FC<Props> = ({ spaceId }) => {
    const active = useUIStore((s) => s.spaceActiveSection);
    const setActive = useUIStore((s) => s.setSpaceActiveSection);

    return (
        <nav className="spaceTopTabs" role="tablist">
            {TABS.map((t) => {
                const isActive = active === t.id;
                return (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={`spaceTopTab ${isActive ? "spaceTopTab--active" : ""}`}
                        onClick={() => setActive(t.id, spaceId)}
                    >
                        <span className="spaceTopTabIcon">{t.icon}</span>
                        <span className="spaceTopTabLabel">{t.label}</span>
                    </button>
                );
            })}
        </nav>
    );
};
