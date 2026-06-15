import React from "react";

export type IconName =
  | "plus"
  | "trash"
  | "close"
  | "refresh"
  | "folder"
  | "file"
  | "files"
  | "code"
  | "settings"
  | "bolt"
  | "layers"
  | "panel"
  | "play"
  | "record"
  | "stop"
  | "search"
  | "ssh"
  | "grip"
  | "chevron-left"
  | "chevron-right"
  | "download"
  | "upload"
  | "edit"
  | "clock"
  | "terminal"
  | "message"
  | "check-square"
  | "inbox"
  | "arrow-left"
  | "volume"
  | "volume-off"
  | "paperclip"
  | "pencil"
  | "sliders"
  | "check"
  | "log";

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
};

export function Icon({ name, size = 16, className }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
    focusable: false as const,
  };

  switch (name) {
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M10 11v7" />
          <path d="M14 11v7" />
          <path d="M6 7l1 14h10l1-14" />
          <path d="M9 7V4h6v3" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 3v6h-6" />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      );
    case "files":
      return (
        <svg {...common}>
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h1" />
          <path d="M3 12h1" />
          <path d="M3 18h1" />
        </svg>
      );
    case "code":
      return (
        <svg {...common}>
          <path d="M8 7l-5 5 5 5" />
          <path d="M16 7l5 5-5 5" />
          <path d="M14 4l-4 16" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path d="M4 6h10" />
          <path d="M18 6h2" />
          <circle cx="16" cy="6" r="2" />

          <path d="M4 12h2" />
          <path d="M10 12h10" />
          <circle cx="8" cy="12" r="2" />

          <path d="M4 18h8" />
          <path d="M16 18h4" />
          <circle cx="14" cy="18" r="2" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M12 4l8 4-8 4-8-4 8-4z" />
          <path d="M4 12l8 4 8-4" />
          <path d="M4 16l8 4 8-4" />
        </svg>
      );
    case "panel":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M9 5v14" />
        </svg>
      );
    case "play":
      return (
        <svg {...common}>
          <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "record":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "stop":
      return (
        <svg {...common}>
          <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      );
    case "ssh":
      return (
        <svg {...common}>
          <path d="M7 8l5 4-5 4" />
          <path d="M15 16h5" />
        </svg>
      );
    case "grip":
      return (
        <svg {...common}>
          <circle cx="9" cy="7" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="15" cy="7" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="9" cy="12" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="9" cy="17" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="15" cy="17" r="1.25" fill="currentColor" stroke="none" />
        </svg>
      );
    case "chevron-left":
      return (
        <svg {...common}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 5v10" />
          <path d="M8 13l4 4 4-4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 19V9" />
          <path d="M8 11l4-4 4 4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M17 3l4 4L8 20H4v-4L17 3z" />
          <path d="M14 7l4 4" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...common}>
          <path d="M7 8l5 4-5 4" />
          <path d="M14 16h5" />
        </svg>
      );
    case "message":
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "check-square":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...common}>
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
          <path d="M1 14h6M9 8h6M17 16h6" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...common}>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg {...common}>
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      );
    case "volume":
      return (
        <svg {...common}>
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      );
    case "volume-off":
      return (
        <svg {...common}>
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M23 9l-6 6" />
          <path d="M17 9l6 6" />
        </svg>
      );
    case "log":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h8" />
          <path d="M8 9h2" />
        </svg>
      );
    case "paperclip":
      return (
        <svg {...common}>
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      );
    default:
      return null;
  }
}
