import React from "react";
import { CollabSpace } from "../../firebase/collabSpaceTypes";
import { SpaceAvatar } from "./SpaceAvatar";

type Props = {
    space: CollabSpace | null;
    onSettings?: () => void;
    inline?: boolean;
};

export const SpaceWindowChrome: React.FC<Props> = ({ space, onSettings, inline = false }) => {
    const memberCount = space?.memberIds?.length ?? 0;
    const visibilityLabel = space?.visibility === "private" ? "Private" : "Public";

    return (
        <div className={`spaceWindowChrome ${inline ? "spaceWindowChrome--inline" : ""}`}>
            {space ? (
                <SpaceAvatar colorKey={space.id} name={space.name} size={32} />
            ) : (
                <div className="spaceWindowChromeAvatarPlaceholder" aria-hidden="true" />
            )}

            <div className="spaceWindowChromeTitleWrap">
                <div className="spaceWindowChromeTitle">
                    {space?.name ?? "Loading…"}
                    {space && (
                        <span className={`spaceWindowChromeVisBadge spaceWindowChromeVisBadge--${space.visibility}`}>
                            {visibilityLabel}
                        </span>
                    )}
                </div>
                {space?.githubUrl && (
                    <div className="spaceWindowChromeSubtitle">{space.githubUrl}</div>
                )}
            </div>

            {space && memberCount > 0 && (
                <div className="spaceWindowChromeMeta" title={`${memberCount} member${memberCount !== 1 ? "s" : ""}`}>
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="6" cy="5.5" r="2.2" />
                        <circle cx="11" cy="5.5" r="1.8" />
                        <path d="M1.5 12.5c0-2 2-3.3 4.5-3.3s4.5 1.3 4.5 3.3" strokeLinecap="round" />
                        <path d="M10.5 9.5c1.7 0 3.3.9 3.3 2.7" strokeLinecap="round" />
                    </svg>
                    <span>{memberCount}</span>
                </div>
            )}

            <button
                type="button"
                className="spaceWindowSettings"
                onClick={onSettings}
                title="Space settings"
                aria-label="Space settings"
                disabled={!onSettings}
            >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15">
                    <circle cx="10" cy="10" r="2.8" />
                    <path d="M10 1v2.5M10 16.5v2.5M19 10h-2.5M3.5 10H1M16.36 3.64l-1.77 1.77M5.41 14.59l-1.77 1.77M16.36 16.36l-1.77-1.77M5.41 5.41L3.64 3.64" strokeLinecap="round" />
                </svg>
            </button>
        </div>
    );
};
