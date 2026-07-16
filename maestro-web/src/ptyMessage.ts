// Routes a single `/pty` WebSocket message for maestro-web by classifying it
// through the SHARED parser (`@maestro/pty-protocol`) — the same contract the
// Tauri/UI terminal uses — so maestro-web never forks a second copy of the
// frame parser as it grows toward terminal parity.
//
// A `/pty` socket multiplexes two things on one connection:
//   - binary frames → raw PTY output bytes → write to the terminal as-is
//   - text frames   → either a JSON control frame (interpret; do NOT print) or
//                     ordinary output that merely happens to be a string (print)
import { parseControlFrame, type PtyControlFrame } from '@maestro/pty-protocol';

/** What `main.ts` should do with a single `/pty` WebSocket message. */
export type PtyMessageAction =
  | { kind: 'output'; data: string | Uint8Array }
  | { kind: 'control'; frame: PtyControlFrame };

/**
 * Classify a raw `/pty` message. Binary payloads are terminal output bytes.
 * String payloads are run through the shared control-frame parser: a recognized
 * control frame is surfaced as `control` (the caller interprets it and must not
 * write it to the terminal), otherwise it is ordinary `output`.
 */
export function routePtyMessage(data: string | ArrayBuffer): PtyMessageAction {
  if (typeof data !== 'string') {
    return { kind: 'output', data: new Uint8Array(data) };
  }
  const frame = parseControlFrame(data);
  return frame ? { kind: 'control', frame } : { kind: 'output', data };
}
