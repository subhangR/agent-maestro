/* ==========================================================================
 * MAESTRO · TERMINAL THEME  (xterm.js ITheme)
 * --------------------------------------------------------------------------
 * The terminal is rendered by xterm.js, so its colors come from THIS object,
 * not from CSS. Drop this in and use it where the Terminal is constructed:
 *
 *     import { MAESTRO_TERMINAL_THEME } from "./terminal-theme";
 *
 *     const term = new Terminal({
 *       allowProposedApi: true,
 *       cursorBlink: true,
 *       disableStdin: props.readOnly,
 *       fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
 *       fontSize: 13,
 *       theme: MAESTRO_TERMINAL_THEME,        // <- was the cold-blue partial theme
 *       scrollback: 5000,
 *     });
 *
 * To switch it live (e.g. when the app toggles light/dark), set:
 *     term.options.theme = MAESTRO_TERMINAL_THEME_DARK;
 * xterm re-reads .options.theme on assignment, so no re-create needed.
 *
 * WHY A FULL PALETTE: a partial theme (just bg/fg/cursor) leaves the 16 ANSI
 * colors at xterm's neon defaults — so git diffs, `ls`, test output and syntax
 * highlighting still look "AI cold". Defining all 16, warm + desaturated, is
 * what makes the whole terminal feel like part of the design system.
 *
 * The hexes below are the same warm-graphite palette as the panel tokens:
 *   bg = paper's dark twin, fg = warm parchment, accent = brass (--pn-brand).
 * ========================================================================== */

import type { ITheme } from "xterm";

/* Used when the app chrome is LIGHT (light panels around a dark terminal). */
export const MAESTRO_TERMINAL_THEME: ITheme = {
  background: "#1B1812",            // warm graphite (a touch lighter than dark-mode)
  foreground: "#D9D2C4",            // warm parchment text
  cursor: "#E0A45A",                // brass baton
  cursorAccent: "#1B1812",          // glyph under block cursor
  selectionBackground: "rgba(224,164,90,0.22)",  // brass wash, not cyan
  selectionForeground: "#F3EEE2",

  // ----- normal ANSI (warm, desaturated — never neon) -----
  black:   "#322D24",   // also used as low-contrast / comments
  red:     "#CB7059",   // errors, deletions   (matches --pn-block family)
  green:   "#74B083",   // success, additions  (matches --pn-run family)
  yellow:  "#D2A24C",   // warnings, prompts    (matches --pn-wait family)
  blue:    "#6E9BC4",   // info, links          (warm steel, matches --pn-info)
  magenta: "#B98BC0",   // keywords
  cyan:    "#6FB2A8",   // strings / teal accent
  white:   "#CFC8BA",   // default text

  // ----- bright ANSI -----
  brightBlack:   "#6B6453",   // dim metadata, line numbers
  brightRed:     "#DC8B73",
  brightGreen:   "#8FC79C",
  brightYellow:  "#E6B968",
  brightBlue:    "#88B0D6",
  brightMagenta: "#CCA0D2",
  brightCyan:    "#86C4BA",
  brightWhite:   "#EFE9DB",
};

/* Used when the app chrome is DARK — the terminal sits a touch darker than the
   panels so it still reads as a distinct surface. Same ink/ANSI, deeper bg. */
export const MAESTRO_TERMINAL_THEME_DARK: ITheme = {
  ...MAESTRO_TERMINAL_THEME,
  background: "#100E0A",
  cursorAccent: "#100E0A",
};

/* Optional: keep it in lockstep with the CSS tokens. If you'd rather drive the
   terminal bg from --pn-term-bg, read it at construction time:

     const css = getComputedStyle(document.documentElement);
     const theme = {
       ...MAESTRO_TERMINAL_THEME,
       background: css.getPropertyValue("--pn-term-bg").trim() || "#1B1812",
       cursor:     css.getPropertyValue("--pn-brand").trim()   || "#E0A45A",
     };
*/
