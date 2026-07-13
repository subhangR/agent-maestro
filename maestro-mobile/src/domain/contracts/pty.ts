// PTY transport contracts for Relay's /pty?sessionId=<id> socket (binaryType=arraybuffer).
// Type-only — binary frames aren't JSON; the two control frames are tiny and Relay-internal.

/** Text control frames the server sends, interleaved with raw binary PTY output. */
export type PtyServerFrame =
  | { type: 'size'; cols: number; rows: number }
  | { type: 'exit'; exitCode: number };

/** Text control frame the client sends, interleaved with raw binary keystrokes. */
export type PtyClientFrame = { type: 'resize'; cols: number; rows: number };

/**
 * Close codes:
 *   1008 MISSING_SESSION_ID — no ?sessionId
 *   1011 NO_LIVE_PTY        — session over / needs resume
 * A plain close (no code) ⇒ detached; the PTY keeps running and is re-attachable.
 */
export const PTY_CLOSE_CODES = {
  MISSING_SESSION_ID: 1008,
  NO_LIVE_PTY: 1011,
} as const;

export type PtyCloseCode = (typeof PTY_CLOSE_CODES)[keyof typeof PTY_CLOSE_CODES];
