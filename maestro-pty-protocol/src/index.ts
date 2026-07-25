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
  | {
      /**
       * PTY dimensions. Without `live`, the attach-time snapshot (sent once per
       * (re)connect so the client can render replayed scrollback at the width it
       * was authored at) — a client that has already fit locally may ignore it.
       * With `live: true`, a real-time notification that ANOTHER attached client
       * just resized the shared PTY — authoritative for every other viewer:
       * ignoring it leaves this view's grid at a different geometry than the
       * one the TUI inside the PTY is drawing for, which corrupts the display.
       */
      type: 'size';
      cols: number;
      rows: number;
      live?: boolean;
    }
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
       *  - `replayKind` OPTIONAL replay payload semantics. `delta` appends raw
       *                 retained output; `snapshot` is a complete serialized
       *                 terminal state that replaces an evicted stream prefix.
       *                 Missing means `delta` for older servers.
       *  - `epoch`    OPTIONAL opaque per-spawn stream identity (#151). Present
       *               only when the server knows one; compared by EQUALITY ONLY
       *               (never ordered). A changed epoch means a respawn/restart and
       *               an authoritative client reset; the same epoch resumes
       *               normally and supersedes the legacy base-rewind heuristic. An
       *               absent epoch preserves the pre-#151 offset-rewind fallback.
       */
      type: 'attached';
      base: number;
      gap: number;
      next: number;
      hasReplay: boolean;
      replayKind?: 'delta' | 'snapshot';
      epoch?: string;
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
        const frame: Extract<PtyControlFrame, { type: 'size' }> = {
          type: 'size',
          cols: m.cols as number,
          rows: m.rows as number,
        };
        // Only an explicit `true` marks a live peer-resize; anything else keeps
        // attach-snapshot semantics so old servers behave exactly as before.
        if (m.live === true) frame.live = true;
        return frame;
      }
      return null; // non-finite dimensions are not a usable size frame

    case 'attached': {
      // `base` and `next` are load-bearing (the client snaps its offset to
      // `next` and detects rewind via `base`); without them the frame is
      // unusable and treated as non-control.
      if (!Number.isFinite(m.base) || !Number.isFinite(m.next)) return null;
      const frame: Extract<PtyControlFrame, { type: 'attached' }> = {
        type: 'attached',
        base: m.base as number,
        gap: Number.isFinite(m.gap) ? (m.gap as number) : 0,
        next: m.next as number,
        hasReplay: Boolean(m.hasReplay),
      };
      // `epoch` (#151) is the optional, additive opaque stream identity. Surface
      // it verbatim only when it is a string; a missing or non-string value is
      // treated as absent so the client falls back to the legacy behavior rather
      // than acting on a bogus identity.
      if (typeof m.epoch === 'string') frame.epoch = m.epoch;
      if (m.replayKind === 'delta' || m.replayKind === 'snapshot') {
        frame.replayKind = m.replayKind;
      }
      return frame;
    }

    default:
      return null;
  }
}
