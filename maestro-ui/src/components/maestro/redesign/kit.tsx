/* kit.tsx — Maestro redesign primitives, ported verbatim from
   panel-redesign/kit.jsx and converted to typed named TS exports.

   Source of truth: panel-redesign/kit.jsx + panel-redesign/theme.css (pn-* classes).
   All class names are kept identical to panel-redesign so the foundation
   stylesheet (redesign-tokens.css) applies unchanged.

   Consume only when the redesign is active (html[data-redesign] present). */

import React from "react";
import claudeIcon from "../../../assets/claude-code-icon.png";
import codexIcon from "../../../assets/openai-codex-icon.png";
import geminiIcon from "../../../assets/gemini-logo.png";

/* ---------------------------------------------------------------------------
   ICONS — line-icon path map (16x16 viewBox, currentColor stroke)
   Copied verbatim from panel-redesign/kit.jsx PN_ICONS.
--------------------------------------------------------------------------- */
export const PN_ICONS = {
  search: "M11 11l3.5 3.5M7.5 13a5.5 5.5 0 100-11 5.5 5.5 0 000 11z",
  plus: "M8 3.5v9M3.5 8h9",
  chevronR: "M6 3.5L10.5 8 6 12.5",
  chevronD: "M3.5 6L8 10.5 12.5 6",
  chevronL: "M10 3.5L5.5 8 10 12.5",
  sliders: "M3 5h7M12.5 5H13M3 11h.5M6 11h7M9 3.5v3M5 9.5v3",
  play: "M5 3.5l7 4.5-7 4.5z",
  settings:
    "M8 10a2 2 0 100-4 2 2 0 000 4zM8 1.5v1.5M8 13v1.5M3.05 3.05l1.06 1.06M11.9 11.9l1.05 1.05M1.5 8H3M13 8h1.5M3.05 12.95l1.06-1.06M11.9 4.1l1.05-1.05",
  pin: "M6 2h4l-.5 3.5L11 8H5l1.5-2.5L6 2zM8 8v5",
  more: "M4 8h.01M8 8h.01M12 8h.01",
  check: "M3.5 8.5L6.5 11.5 12.5 5",
  clock: "M8 4.5V8l2.5 1.5M8 14A6 6 0 108 2a6 6 0 000 12z",
  gitBranch:
    "M5 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM5 5v3a3 3 0 003 3M12.5 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM11 5v.5a3 3 0 01-3 3M5 12.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
  listChecks: "M3 4l1 1 1.5-1.5M3 9l1 1 1.5-1.5M8 4h5M8 9h5M8 13.5h5",
  users:
    "M6 7.5a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM2.5 13c0-2 1.6-3.2 3.5-3.2S9.5 11 9.5 13M10.5 7.2a2 2 0 000-4M11 9.9c1.5.2 2.5 1.3 2.5 3.1",
  sparkles:
    "M8 2.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6zM12.5 9l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3z",
  folder: "M2.5 4.5A1 1 0 013.5 3.5h2.4l1 1.3H12.5a1 1 0 011 1v6a1 1 0 01-1 1h-9a1 1 0 01-1-1z",
  terminal: "M3 4l3 3-3 3M8 11h5",
  layers: "M8 2l5.5 3L8 8 2.5 5 8 2zM2.5 8L8 11l5.5-3M2.5 11L8 14l5.5-3",
  mic: "M8 2a2 2 0 012 2v4a2 2 0 11-4 0V4a2 2 0 012-2zM4 8a4 4 0 008 0M8 12v2",
  x: "M4 4l8 8M12 4l-8 8",
  arrowRight: "M3 8h9M8.5 4l4 4-4 4",
  filter: "M2.5 4h11l-4.2 5v3.5L6.7 14V9L2.5 4z",
  dotsGrip: "M5.5 4h.01M5.5 8h.01M5.5 12h.01M10.5 4h.01M10.5 8h.01M10.5 12h.01",
  inbox: "M2.5 9.5h3l1 1.5h3l1-1.5h3M2.5 9.5l1.8-5.5h7.4l1.8 5.5v3a1 1 0 01-1 1h-10a1 1 0 01-1-1z",
  team: "M8 6.5a2 2 0 100-4 2 2 0 000 4zM3.5 11a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM12.5 11a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM5 14c0-1.6 1.3-2.6 3-2.6s3 1 3 2.6",
  graph:
    "M4 4.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM12 4.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM8 14.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM5.3 4.1l1.7 5M10.7 4.1L9 9.1",
  archive: "M2.5 3.5h11v3h-11zM3.5 6.5v6a1 1 0 001 1h7a1 1 0 001-1v-6M6.5 9h3",
  grid: "M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5h-4.5zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5h-4.5z",
  pen: "M2.5 13.5l2.5-.6 7-7-1.9-1.9-7 7zM10.6 4.6l1.9 1.9 1.3-1.3a1 1 0 000-1.4l-.5-.5a1 1 0 00-1.4 0z",
  refresh: "M13 7a5 5 0 10-1.2 4.2M13 3.5V7h-3.5",
  copy: "M5.5 5.5h7v8h-7zM3.5 10.5h-1v-8h7v1",
  info: "M8 7.2v4M8 4.8h.01M8 14A6 6 0 108 2a6 6 0 000 12z",
  shield: "M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4l5-2z",
  doc: "M5 2h5l3.5 3.5V13a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zM10 2v4h4M6.5 9h4M6.5 11.5h2.5",
  teamview: "M2.5 3.5h11v9h-11zM8 3.5v9M2.5 8h11",
  sun: "M8 11a3 3 0 100-6 3 3 0 000 6zM8 1.7v1.6M8 12.7v1.6M2.6 2.6l1.1 1.1M12.3 12.3l1.1 1.1M1.7 8h1.6M12.7 8h1.6M2.6 13.4l1.1-1.1M12.3 3.7l1.1-1.1",
  moon: "M13.4 9.3A5.5 5.5 0 116.7 2.6 4.6 4.6 0 0013.4 9.3z",
  calendar: "M3 4.5h10v9H3zM3 7h10M5.5 2.5v3M10.5 2.5v3",
  music: "M6 12a1.75 1.75 0 11-3.5 0 1.75 1.75 0 013.5 0zM6 12V4l7.5-1.6V10M13.5 10a1.75 1.75 0 11-3.5 0 1.75 1.75 0 013.5 0z",
  paperclip:
    "M12.5 7l-5.2 5.2a2.6 2.6 0 01-3.7-3.7l5.6-5.6a1.7 1.7 0 012.4 2.4l-5.4 5.4a.85.85 0 01-1.2-1.2L9.9 4.4",
  at: "M10.6 8a2.6 2.6 0 11-2.6-2.6M10.6 5.4v3.1a1.8 1.8 0 003.4-.6A6 6 0 108 14",
  hash: "M6.2 2.5L4.6 13.5M11.4 2.5L9.8 13.5M3 5.6h10.4M2.6 10.4H13",
  bot: "M5 6.5h6a1 1 0 011 1V12a1 1 0 01-1 1H5a1 1 0 01-1-1V7.5a1 1 0 011-1zM8 4v2.5M6.4 9.2h.01M9.6 9.2h.01M3.5 8.5v2.2M12.5 8.5v2.2",
  // foundation-added (Phase 0): restore/undo — counter-clockwise arrow, distinct from `refresh`.
  undo: "M3 8a5 5 0 105-5H5.5M3 3.5V8h4.5",
  // foundation-added (Phase 0): speaker + sound waves for the TopBar sound toggle.
  volume: "M3 6.5h2l3-2.5v8l-3-2.5H3zM10.5 6a3 3 0 010 4M12.5 4.5a5.5 5.5 0 010 7",
  // foundation-added (Phase 0): muted speaker (volume-off).
  volumeOff: "M3 6.5h2l3-2.5v8l-3-2.5H3zM10.5 6l3 3M13.5 6l-3 3",
  // foundation-added (Phase 0): conductor's baton — diagonal shaft + knob handle
  // (realizes the design's stated brass "conductor's baton" motif; distinct from Mark).
  baton: "M4 12l6.5-6.5M11 3.5a1.3 1.3 0 101.9 1.9A1.3 1.3 0 0011 3.5z",
  // foundation-added (views.jsx): design-silent glyphs referenced by name, authored
  // to match the PN_ICONS style (16x16, currentColor, sw~1.6).
  globe: "M8 14A6 6 0 108 2a6 6 0 000 12zM2 8h12M8 2c-2.6 1.8-2.6 10.2 0 12M8 2c2.6 1.8 2.6 10.2 0 12",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.6 4.5l.7 8.5a1 1 0 001 .9h3.4a1 1 0 001-.9l.7-8.5M7 7v4M9 7v4",
  archiveBox: "M2.5 5.5l1.3-2h8.4l1.3 2M2.5 5.5h11M3.3 5.5v6.3a1 1 0 001 1h7.4a1 1 0 001-1V5.5M6.5 8.5h3",
  folderOpen: "M2.5 6.5V4.5a1 1 0 011-1h2.4l1 1.3H12a1 1 0 011 1v1.2M2.5 6.5h11.6l-1.3 5.5a1 1 0 01-1 .8H3.5a1 1 0 01-1-.8z",
  fileCode: "M5 2h5l3.5 3.5V13a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zM10 2v4h4M7 8.5L5.5 10 7 11.5M9.2 8.5L10.7 10 9.2 11.5",
  download: "M8 2.5v8M4.5 7L8 10.5 11.5 7M3.5 13h9",
  alert: "M6.9 3.2L1.7 12.4a1.2 1.2 0 001 1.8h10.6a1.2 1.2 0 001-1.8L9.1 3.2a1.2 1.2 0 00-2.2 0zM8 6.8v3M8 11.6h.01",
} as const;

export type IconName = keyof typeof PN_ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  sw?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function Icon({ name, size = 16, sw = 1.6, style, className }: IconProps) {
  const d = PN_ICONS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {d
        .split("M")
        .filter(Boolean)
        .map((seg, i) => (
          <path key={i} d={"M" + seg} />
        ))}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   MARK — the Maestro logo glyph (command chevron spawning parallel agents).
   Copied verbatim from panel-redesign/kit.jsx.
--------------------------------------------------------------------------- */
export interface MarkProps {
  size?: number;
}

export function Mark({ size = 22 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 7l4 5-4 5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14.5" cy="12" r="1.1" fill="currentColor" />
      <circle cx="18.2" cy="12" r="1.1" fill="currentColor" />
      <path d="M12.5 12h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   AGENT TILE — rounded agent-logo tile (pn-agent).
   kind 'claude' | 'codex' | 'gemini' -> real asset image.
   kind 'terminal' -> ">_" mono tile (pn-agent--term).
   any other kind -> initial-letter fallback avatar.
   Ported from panel-redesign/kit.jsx AgentTile; asset paths point at the
   real maestro-ui bundled assets.
--------------------------------------------------------------------------- */
export type AgentKind = "claude" | "codex" | "gemini" | "terminal" | (string & {});

const PN_AGENT_SRC: Record<string, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  gemini: geminiIcon,
};

export interface AgentTileProps {
  kind: AgentKind;
  lg?: boolean;
}

export function AgentTile({ kind, lg }: AgentTileProps) {
  const lgCls = lg ? " pn-agent--lg" : "";

  if (kind === "terminal") {
    return <div className={"pn-agent pn-agent--term" + lgCls}>&gt;_</div>;
  }

  const src = PN_AGENT_SRC[kind];
  if (src) {
    return (
      <div className={"pn-agent" + lgCls}>
        <img src={src} alt={kind} />
      </div>
    );
  }

  // Unknown kind — initial-letter avatar fallback.
  const initial = (kind || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className={"pn-agent pn-agent--init" + lgCls} aria-label={kind}>
      {initial}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   GLYPH — drawn per-status SVG status indicator (pn-stat).
   Ported verbatim from panel-redesign/tiles.jsx Glyph(). Used by both the
   Task Tile (pn-tt) and Session Tile (pn-st). Inner SVG uses var(--pn-card)
   (completed check) and var(--pn-surface) (needsInput cutout) — both exist in
   redesign-tokens.css scope.
--------------------------------------------------------------------------- */
export type GlyphKind =
  | "todo"
  | "idle"
  | "in_progress"
  | "working"
  | "in_review"
  | "completed"
  | "cancelled"
  | "blocked"
  | "failed"
  | "archived"
  | "stopped"
  | "spawning"
  | "needsInput"
  | (string & {});

export interface GlyphProps {
  kind: GlyphKind;
  size?: number;
}

export function Glyph({ kind, size = 16 }: GlyphProps) {
  const ring = <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />;
  let inner: React.ReactNode = null;
  switch (kind) {
    case "todo":
    case "idle":
      inner = ring;
      break;
    case "in_progress":
      inner = (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.28" />
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray="62 100"
            transform="rotate(-90 8 8)"
          />
        </>
      );
      break;
    case "working":
      inner = (
        <>
          {ring}
          <circle cx="8" cy="8" r="2.6" fill="currentColor" />
        </>
      );
      break;
    case "in_review":
      inner = <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2.3" />;
      break;
    case "completed":
      inner = (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path
            d="M5 8.2l2.1 2.1L11 6.4"
            fill="none"
            stroke="var(--pn-card)"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
      break;
    case "cancelled":
      inner = (
        <>
          {ring}
          <path d="M4.5 11.5l7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
      break;
    case "blocked":
    case "failed":
      inner = (
        <>
          {ring}
          <path d="M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
      break;
    case "archived":
    case "stopped":
      inner = (
        <rect
          x="3"
          y="3"
          width="10"
          height="10"
          rx="2.5"
          fill={kind === "stopped" ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
        />
      );
      break;
    case "spawning":
      inner = (
        <>
          {ring}
          <path d="M8 2a6 6 0 000 12z" fill="currentColor" />
        </>
      );
      break;
    case "needsInput":
      inner = (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path d="M8 4.6v4" stroke="var(--pn-surface)" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="11" r="0.95" fill="var(--pn-surface)" />
        </>
      );
      break;
    default:
      inner = ring;
  }
  return (
    <span className={"pn-stat pn-stat--" + kind} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
        {inner}
      </svg>
    </span>
  );
}

/* ---------------------------------------------------------------------------
   AVATAR / AVATARS — team-member monogram(s) (pn-av / pn-av-group).
   Ported verbatim from panel-redesign/tiles.jsx. Per-member color/bg via
   inline style, exactly as the prototype. Used by Task Tile + Session Tile.
--------------------------------------------------------------------------- */
export interface AvatarMember {
  initial: string;
  name: string;
  color: string;
  bg?: string;
}

export interface AvatarProps {
  a: AvatarMember;
}

export function Avatar({ a }: AvatarProps) {
  return (
    <span className="pn-av" style={{ color: a.color, background: a.bg || "var(--pn-active)" }}>
      {a.initial}
    </span>
  );
}

export interface AvatarsProps {
  list: AvatarMember[] | null | undefined;
}

export function Avatars({ list }: AvatarsProps) {
  if (!list || !list.length) return null;
  if (list.length === 1) return <Avatar a={list[0]} />;
  return (
    <span className="pn-av-group">
      {list.slice(0, 3).map((a, i) => (
        <span
          key={i}
          className="pn-av pn-av--stack"
          style={{ color: a.color, background: a.bg || "var(--pn-active)" }}
        >
          {a.initial}
        </span>
      ))}
    </span>
  );
}
