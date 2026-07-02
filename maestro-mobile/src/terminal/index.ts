// src/terminal — the live terminal surface (Relay). TerminalView hosts xterm.js
// in a WebView bridged to the PtyTransport seam; measureTerminalSize estimates
// the initial PTY geometry. See TerminalView.tsx for the deferred-validation +
// CDN/offline caveats. Acyclic boundary: this module may be imported BY features
// and may import @/state, @/theme, @/domain — but must NOT be imported by
// state/services.
export { TerminalView, type TerminalViewProps } from './TerminalView';
export {
  measureTerminalSize,
  DEFAULT_TERMINAL_FONT_SIZE,
} from './measureTerminalSize';
export type {
  MeasureTerminalSizeOptions,
  TerminalSize,
} from './measureTerminalSize';
