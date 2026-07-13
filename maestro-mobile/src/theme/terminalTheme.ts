// Adapter: theme → xterm.js ITheme (consumed by Relay's WebView-hosted terminal).
// Structural shape only (no @xterm dep here); Relay posts this into the WebView.
// ANSI palette is seeded from the Atelier status colors so terminal output stays
// in the warm-paper world (anti-neon).
import type { Theme } from './tokens';

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export function buildTerminalTheme(theme: Theme): XtermTheme {
  const c = theme.colors;
  return {
    background: c.surface,
    foreground: c.ink,
    cursor: c.brand,
    cursorAccent: c.surface,
    selectionBackground: c.active,
    black: c.ink,
    red: c.block,
    green: c.run,
    yellow: c.wait,
    blue: c.info,
    magenta: c.brand,
    cyan: c.info,
    white: c.ink3,
    brightBlack: c.ink4,
    brightRed: c.block,
    brightGreen: c.run,
    brightYellow: c.wait,
    brightBlue: c.info,
    brightMagenta: c.brand2,
    brightCyan: c.info,
    brightWhite: c.ink2,
  };
}
