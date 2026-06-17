import { Dimensions } from 'react-native';

/**
 * Default monospace font size (pt) used to estimate terminal cell geometry.
 */
export const DEFAULT_TERMINAL_FONT_SIZE = 13;

/** Approximate width of a monospace cell as a fraction of the font size. */
const CELL_WIDTH_RATIO = 0.6;
/** Approximate line height as a fraction of the font size. */
const LINE_HEIGHT_RATIO = 1.2;

/** Lower bounds so a degenerate viewport never produces an unusable PTY. */
const MIN_COLS = 20;
const MIN_ROWS = 10;

export interface MeasureTerminalSizeOptions {
  /** Viewport width in px. Falls back to Dimensions.get('window').width. */
  width?: number;
  /** Viewport height in px. Falls back to Dimensions.get('window').height. */
  height?: number;
  /** Monospace font size in pt. Defaults to DEFAULT_TERMINAL_FONT_SIZE. */
  fontSize?: number;
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

/**
 * Estimate the PTY column/row count for a monospace terminal occupying the
 * given viewport. Pure function — no native modules, no WebView.
 *
 * Stream B uses this to pass measured cols/rows to spawnSession. Phase 4's real
 * WebView xterm renderer will reuse this same estimate to size the initial PTY
 * before xterm's own FitAddon takes over on-screen.
 */
export function measureTerminalSize(
  opts: MeasureTerminalSizeOptions = {},
): TerminalSize {
  const fontSize =
    opts.fontSize && opts.fontSize > 0 ? opts.fontSize : DEFAULT_TERMINAL_FONT_SIZE;

  const window = Dimensions.get('window');
  const width = opts.width && opts.width > 0 ? opts.width : window.width;
  const height = opts.height && opts.height > 0 ? opts.height : window.height;

  const cellWidth = CELL_WIDTH_RATIO * fontSize;
  const lineHeight = LINE_HEIGHT_RATIO * fontSize;

  const cols = Math.max(MIN_COLS, Math.floor(width / cellWidth));
  const rows = Math.max(MIN_ROWS, Math.floor(height / lineHeight));

  return { cols, rows };
}
