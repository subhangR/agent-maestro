// /pty control-frame parsing & building.
//
// The server interleaves raw binary PTY bytes with two tiny TEXT control
// frames: `{type:'size',cols,rows}` (on attach, before scrollback) and
// `{type:'exit',exitCode}` (on real process exit). The client sends one text
// control frame: `{type:'resize',cols,rows}`. A text frame that doesn't parse
// as a known control frame is just PTY output that happened to arrive as text.

import type { PtyServerFrame, PtyClientFrame } from '@/domain';

export type ParsedServerFrame =
  | { kind: 'size'; cols: number; rows: number }
  | { kind: 'exit'; exitCode: number }
  | { kind: 'output' };

/**
 * Parse a server text frame. Returns the typed control frame, or `{kind:'output'}`
 * when the text isn't a recognized control frame (caller should treat the raw
 * text as terminal output, mirroring webTerminal terminal.ts:124).
 */
export function parseServerFrame(text: string): ParsedServerFrame {
  let msg: Partial<PtyServerFrame> & { exitCode?: number };
  try {
    msg = JSON.parse(text);
  } catch {
    return { kind: 'output' };
  }

  if (msg && msg.type === 'size') {
    const { cols, rows } = msg as { cols?: unknown; rows?: unknown };
    if (Number.isFinite(cols) && Number.isFinite(rows)) {
      return { kind: 'size', cols: cols as number, rows: rows as number };
    }
    return { kind: 'output' };
  }

  if (msg && msg.type === 'exit') {
    const code = (msg as { exitCode?: unknown }).exitCode;
    return { kind: 'exit', exitCode: Number.isFinite(code) ? (code as number) : 0 };
  }

  return { kind: 'output' };
}

/** Build the client resize control frame (sent as a JSON text frame). */
export function buildResizeFrame(cols: number, rows: number): string {
  const frame: PtyClientFrame = { type: 'resize', cols, rows };
  return JSON.stringify(frame);
}
