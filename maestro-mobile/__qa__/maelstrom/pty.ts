// Maelstrom — fake /pty WebSocket server.
//
// Reproduces the PtyWebSocketServer wire contract (MOBILE_APP_BUILD_ANALYSIS.md
// §2.6, §3.1): one socket per session at /pty?sessionId=<id>, binaryType arraybuffer.
//
//   Server→client:
//     1. text frame {type:'size',cols,rows}   ONCE on attach, BEFORE any bytes
//     2. binary frames                          raw PTY output — scrollback replayed first, then live
//     3. text frame {type:'exit',exitCode}      on real process exit
//   Client→server:
//     - binary frame                            keystroke bytes
//     - text frame {type:'resize',cols,rows}
//   Close codes:
//     1008 = missing sessionId (programmer error)
//     1011 = no live PTY  → treat as session-over / needs resume (NOT a crash, NOT reconnect-spam)
//     plain close = client detached; PTY keeps running and can be re-attached
//
// The subtle bug this harness must expose: binary frames split a multibyte UTF-8
// glyph across a boundary. A client without a streaming TextDecoder({stream:true})
// renders replacement chars. So splitFrames() lets a test send a glyph in two halves.

import { Server as WebSocketServer, type WebSocket } from 'ws';

export interface PtySessionState {
  /** Pre-attach scrollback, replayed (as binary) before live output. */
  scrollback: Uint8Array;
  /** If false, the attach is closed with 1011 (no live PTY). */
  alive: boolean;
  cols: number;
  rows: number;
}

export interface PtyAttach {
  sessionId: string;
  ws: WebSocket;
  /** Keystroke + resize frames received from the client, in order, for assertions. */
  received: Array<{ kind: 'binary'; bytes: Uint8Array } | { kind: 'resize'; cols: number; rows: number }>;
}

export class MaelstromPty {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, PtySessionState>();
  private attaches = new Set<PtyAttach>();

  /** Register a session so an attach succeeds; omit `alive:false` to force 1011. */
  setSession(sessionId: string, state: Partial<PtySessionState> = {}): void {
    this.sessions.set(sessionId, {
      scrollback: state.scrollback ?? new Uint8Array(),
      alive: state.alive ?? true,
      cols: state.cols ?? 80,
      rows: state.rows ?? 24,
    });
  }

  attach(wss: WebSocketServer): void {
    this.wss = wss;
    wss.on('connection', (ws, req) => this.onConnection(ws, req?.url ?? ''));
  }

  private onConnection(ws: WebSocket, url: string): void {
    ws.binaryType = 'arraybuffer';
    const sessionId = new URLSearchParams(url.split('?')[1] ?? '').get('sessionId');

    if (!sessionId) {
      ws.close(1008, 'missing sessionId');
      return;
    }
    const session = this.sessions.get(sessionId);
    if (!session || !session.alive) {
      ws.close(1011, 'no live PTY');
      return;
    }

    const att: PtyAttach = { sessionId, ws, received: [] };
    this.attaches.add(att);
    ws.on('message', (raw, isBinary) => this.onClientFrame(att, raw, isBinary));
    ws.on('close', () => this.attaches.delete(att));

    // Attach order: size frame first, then scrollback bytes, then live follows.
    ws.send(JSON.stringify({ type: 'size', cols: session.cols, rows: session.rows }));
    if (session.scrollback.length > 0) ws.send(session.scrollback);
  }

  private onClientFrame(att: PtyAttach, raw: unknown, isBinary: boolean): void {
    if (isBinary) {
      const bytes = toUint8(raw);
      att.received.push({ kind: 'binary', bytes });
      return;
    }
    try {
      const msg = JSON.parse(String(raw));
      if (msg?.type === 'resize') {
        att.received.push({ kind: 'resize', cols: msg.cols, rows: msg.rows });
      }
    } catch {
      /* ignore non-JSON text */
    }
  }

  /** Push live output bytes to every attach of a session. */
  sendOutput(sessionId: string, bytes: Uint8Array): void {
    for (const att of this.attaches) {
      if (att.sessionId === sessionId && att.ws.readyState === att.ws.OPEN) att.ws.send(bytes);
    }
  }

  /** Helper: split a payload at a byte boundary to exercise multibyte-split decoding. */
  static splitFrames(bytes: Uint8Array, at: number): [Uint8Array, Uint8Array] {
    return [bytes.subarray(0, at), bytes.subarray(at)];
  }

  exit(sessionId: string, exitCode: number): void {
    for (const att of this.attaches) {
      if (att.sessionId === sessionId && att.ws.readyState === att.ws.OPEN) {
        att.ws.send(JSON.stringify({ type: 'exit', exitCode }));
      }
    }
    const s = this.sessions.get(sessionId);
    if (s) s.alive = false;
  }

  attachesFor(sessionId: string): PtyAttach[] {
    return [...this.attaches].filter((a) => a.sessionId === sessionId);
  }

  close(): void {
    for (const att of this.attaches) att.ws.close();
    this.attaches.clear();
    this.sessions.clear();
  }
}

function toUint8(raw: unknown): Uint8Array {
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (raw instanceof Uint8Array) return raw;
  if (Buffer.isBuffer(raw)) return new Uint8Array(raw);
  return new Uint8Array(0);
}
