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
export type TerminalReplayInfo = { kind: 'delta' | 'snapshot' };

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
  /**
   * Web: register a handler for the one-shot replay payload sent during attach.
   * Keeping replay separate lets the renderer hydrate it atomically instead of
   * visibly painting thousands of intermediate cursor updates.
   */
  onReplay?(
    handler: (id: string, data: string, info: TerminalReplayInfo) => void,
  ): Promise<Unlisten>;
  /** Web: register a handler for server→client PTY exit events; returns unsubscribe fn. */
  onExit(handler: (id: string, exitCode?: number | null) => void): Promise<Unlisten>;
  /**
   * Web: register a handler for the server's authoritative PTY size. Sent once
   * on attach (before scrollback replay) so the client can match the width the
   * buffered output was authored at, and — with `live: true` — whenever ANOTHER
   * attached client resizes the shared PTY, so every viewer's grid follows the
   * geometry the TUI is actually drawing for. Absent in Tauri (the desktop PTY
   * is sized by the window's own FitAddon; it never has a second viewer).
   */
  onSize?(
    handler: (id: string, size: { cols: number; rows: number; live?: boolean }) => void,
  ): Promise<Unlisten>;
  /**
   * Web: register a handler when attach metadata says the current on-screen
   * buffer cannot be continued (stream epoch changed, bytes were evicted, or a
   * legacy stream offset rewound). The handler resets xterm before the replay
   * payload is delivered. Absent in Tauri.
   */
  onReattach?(handler: (id: string) => void): Promise<Unlisten>;
  /**
   * Web: SUSPEND a background (offscreen) session's live stream — close its WS so
   * the server stops sending and the client stops parsing its output, WITHOUT
   * killing the server-side PTY (which keeps running and buffering into its
   * replay ring) and WITHOUT tearing down the client's resume offset. The visible
   * cost of N concurrent streams drops to O(on-screen) instead of O(running).
   * A no-op if the session isn't attached or is already suspended. Absent in
   * Tauri (native PTY output is a single shared event channel, not per-session
   * sockets, so there is nothing per-session to suspend).
   */
  suspend?(id: string): void;
  /**
   * Web: RESUME a suspended session — reopen its WS at the preserved byte offset.
   * The server replays only the bytes produced while suspended (or a bounded gap
   * + recent scrollback if it produced more than its ring holds), reusing the
   * exact attach/replay path a network reconnect uses. A no-op if the session
   * isn't currently suspended. Absent in Tauri.
   */
  resume?(id: string): void;
  /**
   * Web: REMOUNT replay — reset the resume offset to 0 and reconnect so the
   * server replays its FULL retained ring into a FRESH xterm. Used when a
   * terminal that was fully UNMOUNTED (xterm disposed) is shown again: unlike
   * resume() (delta from the preserved offset), this repaints recent scrollback
   * into the new empty buffer. Absent in Tauri.
   */
  requestFullReplay?(id: string): void;
}
