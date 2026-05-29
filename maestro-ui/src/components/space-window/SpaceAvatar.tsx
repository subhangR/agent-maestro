import React from "react";

const PALETTE = [
    "#4f8cff", "#ff6b6b", "#ffb84d", "#66dd99",
    "#c084fc", "#22d3ee", "#f472b6", "#facc15",
    "#a78bfa", "#34d399", "#fb923c", "#60a5fa",
];

export function colorForKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
    }
    return PALETTE[Math.abs(hash) % PALETTE.length];
}

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
                backgroundColor: colorForKey(colorKey),
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
