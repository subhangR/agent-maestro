import React from "react";
import { CollabSpace } from "../../firebase/collabSpaceTypes";

type Props = {
    space: CollabSpace | null;
    onSettings?: () => void;
    /** When inline, the back-to-maestro button is hidden — clicking any other
     *  workspace tab (session/whiteboard/space) already navigates away. */
    inline?: boolean;
};

export const SpaceWindowChrome: React.FC<Props> = ({ space, onSettings, inline = false }) => {
    return (
        <div className={`spaceWindowChrome ${inline ? "spaceWindowChrome--inline" : ""}`}>
            <div className="spaceWindowChromeTitleWrap">
                <div className="spaceWindowChromeTitle">{space?.name ?? "Loading…"}</div>
                {space?.githubUrl && (
                    <div className="spaceWindowChromeSubtitle">{space.githubUrl}</div>
                )}
            </div>

            <button
                type="button"
                className="spaceWindowSettings"
                onClick={onSettings}
                title="Space settings"
                aria-label="Space settings"
                disabled={!onSettings}
            >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                    <circle cx="10" cy="10" r="3" />
                    <path d="M10 1v3M10 16v3M19 10h-3M4 10H1M16.36 3.64l-2.12 2.12M5.76 14.24l-2.12 2.12M16.36 16.36l-2.12-2.12M5.76 5.76L3.64 3.64" strokeLinecap="round" />
                </svg>
            </button>
        </div>
    );
};
