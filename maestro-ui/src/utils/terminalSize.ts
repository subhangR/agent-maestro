import { lastFittedSize } from "../stores/useSessionStore";
import { useTerminalSettingsStore } from "../stores/useTerminalSettingsStore";

/**
 * Best-effort estimate of the cols/rows a freshly-spawned terminal will occupy,
 * sent in the spawn/resume request so the server boots the PTY at the real pane
 * width instead of the 80x24 default (which causes the startup glyph-overlap
 * desync). Two sources, in order:
 *   1. The exact size the most recent terminal fit to — all session terminals
 *      share one pane geometry, so this is accurate whenever any terminal has
 *      already fit this session.
 *   2. A pixel estimate from the live .terminalPane element divided by the
 *      configured font's cell metrics — used only for the very first spawn in a
 *      fresh window, before any terminal has fit. The subsequent fit() corrects
 *      any small delta with a clean SIGWINCH.
 * Returns {} when nothing measurable is available, so the server falls back to
 * its default and we never ship a 0 (which would silently revert to 80x24).
 */
export function measureSpawnTerminalSize(): { cols?: number; rows?: number } {
  if (lastFittedSize && lastFittedSize.cols > 0 && lastFittedSize.rows > 0) {
    return { cols: lastFittedSize.cols, rows: lastFittedSize.rows };
  }

  if (typeof document === "undefined") return {};
  const pane = document.querySelector(".terminalPane");
  if (!(pane instanceof HTMLElement)) return {};
  const rect = pane.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return {};

  const ts = useTerminalSettingsStore.getState();
  const fontSize = ts.fontSize ?? 13;
  const lineHeight = ts.lineHeight ?? 1.0;
  // JetBrains Mono advance width is ~0.6em; cell height = fontSize * lineHeight.
  const cellWidth = fontSize * 0.6 + (ts.letterSpacing ?? 0);
  const cellHeight = fontSize * lineHeight;
  if (cellWidth < 1 || cellHeight < 1) return {};

  // .terminalContainer pads 10px left + 10px top/bottom (see styles-update-banner.css).
  const cols = Math.max(2, Math.floor((rect.width - 10) / cellWidth));
  const rows = Math.max(2, Math.floor((rect.height - 20) / cellHeight));
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return {};
  return { cols, rows };
}
