import type { TerminalSessionInfo } from '../app/types/session';

export interface CreateSessionOpts {
  name: string | null;
  command: string | null;
  cwd: string | null;
  envVars: Record<string, string> | null;
  persistent: boolean;
  persistId: string;
  /** Web mode: maestro session id — used as the /pty WebSocket session key. */
  maestroSessionId?: string | null;
}

/** Unsubscribe function returned by onOutput / onExit. */
export type Unlisten = () => void;

/**
 * Abstraction over Tauri invoke/listen (native) and WebSocket (browser).
 * Each method has a one-line comment describing its web-mode meaning.
 */
export interface TerminalTransport {
  /** Web: POST/WS handshake to create a server-side PTY session; returns its info. */
  createSession(opts: CreateSessionOpts): Promise<TerminalSessionInfo>;
  /** Web: send keystroke bytes to the server over the session's WS connection. */
  write(id: string, data: string, source?: string): Promise<void>;
  /** Web: send a resize message (cols × rows) to the server over WS. */
  resize(id: string, cols: number, rows: number): Promise<void>;
  /** Web: close the server-side PTY and disconnect the WS for that session. */
  closeSession(id: string): Promise<void>;
  /** Web: register a handler for server→client PTY output bytes; returns unsubscribe fn. */
  onOutput(handler: (id: string, data: string) => void): Promise<Unlisten>;
  /** Web: register a handler for server→client PTY exit events; returns unsubscribe fn. */
  onExit(handler: (id: string, exitCode?: number | null) => void): Promise<Unlisten>;
  /**
   * Web: register a handler for the server's authoritative PTY size, sent once on
   * attach (before scrollback replay) so the client can match the width the
   * buffered output was authored at. Absent in Tauri (the desktop PTY is sized by
   * the window's own FitAddon, so there is no late-join width mismatch).
   */
  onSize?(handler: (id: string, size: { cols: number; rows: number }) => void): Promise<Unlisten>;
}
