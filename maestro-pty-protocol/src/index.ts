// @maestro/pty-protocol — the single, dependency-free source of truth for the
// server→client TEXT control frames on a `/pty` WebSocket. Both the Tauri/UI
// terminal (maestro-ui) and the browser POC (maestro-web) parse the identical
// wire contract through this module, so the two clients cannot silently drift.
// It stays free of any provider- or transport-specific concern (no xterm, no
// socket, no Tauri) and is unit-testable in isolation.
//
// A `/pty` socket multiplexes two things on the same connection:
//   - binary frames  → raw PTY output bytes (written straight to the terminal)
//   - text frames    → JSON control messages (interpreted here)
// A text frame that is not a recognized control message is ordinary output that
// merely happens to be a string, so `parseControlFrame` returns null and the
// caller writes it to the terminal unchanged.

/** A recognized server→client control frame. */
export type PtyControlFrame =
  | { type: 'exit'; exitCode: number | null }
  | { type: 'size'; cols: number; rows: number }
  | {
      /**
       * Offset-resume ack, sent once at the start of every (re)connect in
       * response to the client's `?offset=` request.
       *  - `next`     RAW server-authoritative end-of-stream byte offset. The
       *               client snaps its resume counter to this; it never derives
       *               the counter from the (possibly sanitized/shorter) replay.
       *  - `base`     start of the replay slice `[base, next)`. A `base` below
       *               what the client already consumed means the stream rewound
       *               (cross-stream respawn) — the on-screen buffer is stale.
       *  - `gap`      RAW bytes the server evicted below `base` (honest bounded
       *               loss); `> 0` means the terminal must be reset.
       *  - `hasReplay` whether exactly one display-only binary replay frame
       *               follows this ack.
       */
      type: 'attached';
      base: number;
      gap: number;
      next: number;
      hasReplay: boolean;
    };

/**
 * Parse the string payload of a `/pty` text frame into a typed control frame,
 * or null when the payload is not a recognized control message (i.e. it is
 * ordinary PTY output and must be written to the terminal verbatim).
 */
export function parseControlFrame(data: string): PtyControlFrame | null {
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return null; // not JSON → ordinary output
  }
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return null;
  const m = msg as Record<string, unknown>;

  switch (m.type) {
    case 'exit':
      return { type: 'exit', exitCode: typeof m.exitCode === 'number' ? m.exitCode : null };

    case 'size':
      if (Number.isFinite(m.cols) && Number.isFinite(m.rows)) {
        return { type: 'size', cols: m.cols as number, rows: m.rows as number };
      }
      return null; // non-finite dimensions are not a usable size frame

    case 'attached': {
      // `base` and `next` are load-bearing (the client snaps its offset to
      // `next` and detects rewind via `base`); without them the frame is
      // unusable and treated as non-control.
      if (!Number.isFinite(m.base) || !Number.isFinite(m.next)) return null;
      return {
        type: 'attached',
        base: m.base as number,
        gap: Number.isFinite(m.gap) ? (m.gap as number) : 0,
        next: m.next as number,
        hasReplay: Boolean(m.hasReplay),
      };
    }

    default:
      return null;
  }
}
