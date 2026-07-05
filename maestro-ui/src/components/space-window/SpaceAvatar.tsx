import React from "react";
import { colorForUid } from "../../hooks/useSpaceSharing";

export function firstLetter(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "?";
    return trimmed.charAt(0).toUpperCase();
}

type Props = {
    /** Stable key used to derive a deterministic color (typically the space id). */
    colorKey: string;
    /** Display name; the first letter is shown. */
    name: string;
    size?: number;
};

export const SpaceAvatar: React.FC<Props> = ({ colorKey, name, size = 28 }) => {
    return (
        <span
            className="spaceAvatar"
            style={{
                backgroundColor: colorForUid(colorKey),
                width: `${size}px`,
                height: `${size}px`,
                fontSize: `${Math.round(size * 0.46)}px`,
            }}
            aria-hidden="true"
        >
            {firstLetter(name)}
        </span>
    );
};
