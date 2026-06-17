// Per-session /pty WebSocket transport.
//
// Near-verbatim port of maestro-ui webTerminal (terminal.ts:56-219): one socket
// per maestro sessionId, `binaryType='arraybuffer'`, a per-session streaming
// UTF-8 decoder, control-frame parsing, a send-before-open queue, and the
// 1011→onExit(null) close-code rule. Pulse owns the socket + framing + decode
// and hands Relay PRE-DECODED strings; Relay owns the renderer and attach policy.

import type { SessionId } from '@/domain';
import { PTY_CLOSE_CODES } from '@/domain';
import type { PtySize, PtyTransport, Unsubscribe } from '../types';
import { createStreamingDecoder, type StreamingDecoder } from './streamingDecoder';
import { parseServerFrame, buildResizeFrame } from './frames';

interface WsMessageEvent {
  data: unknown;
}
interface WsCloseEvent {
  code?: number;
}

type OutputHandler = (text: string) => void;
type SizeHandler = (size: PtySize) => void;
type ExitHandler = (code: number | null) => void;

interface Session {
  socket: WebSocket;
  decoder: StreamingDecoder;
  pending: Array<string | ArrayBuffer>;
  output: Set<OutputHandler>;
  size: Set<SizeHandler>;
  exit: Set<ExitHandler>;
}

export interface PtyDeps {
  /** Returns the PTY WS base URL, e.g. `ws://host:port/pty`. */
  getPtyWsUrl: () => string;
}

export function createPtyTransport(deps: PtyDeps): PtyTransport {
  const sessions = new Map<string, Session>();

  const getOrCreate = (id: SessionId): Session => {
    const existing = sessions.get(id);
    if (existing) return existing;
    const session: Session = {
      // socket is set by ensureSocket; placeholder avoids an optional field.
      socket: null as unknown as WebSocket,
      decoder: createStreamingDecoder(),
      pending: [],
      output: new Set(),
      size: new Set(),
      exit: new Set(),
    };
    sessions.set(id, session);
    return session;
  };

  const socketAlive = (s: WebSocket | null): boolean =>
    !!s && s.readyState !== WebSocket.CLOSED && s.readyState !== WebSocket.CLOSING;

  const ensureSocket = (id: SessionId): Session => {
    const session = getOrCreate(id);
    if (socketAlive(session.socket)) return session;

    const url = `${deps.getPtyWsUrl()}?sessionId=${encodeURIComponent(id)}`;
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    session.socket = socket;
    // Fresh socket → fresh decoder so a re-attach can't inherit a stale tail.
    session.decoder = createStreamingDecoder();

    socket.onopen = () => {
      const queued = session.pending;
      session.pending = [];
      for (const frame of queued) {
        try {
          socket.send(frame as ArrayBuffer);
        } catch {
          /* drop on send failure */
        }
      }
    };

    socket.onmessage = ((ev: WsMessageEvent) => {
      if (typeof ev.data === 'string') {
        const parsed = parseServerFrame(ev.data);
        if (parsed.kind === 'exit') {
          for (const h of session.exit) h(parsed.exitCode);
          return;
        }
        if (parsed.kind === 'size') {
          for (const h of session.size) h({ cols: parsed.cols, rows: parsed.rows });
          return;
        }
        // Not a control frame — it's terminal output that arrived as text.
        for (const h of session.output) h(ev.data);
        return;
      }
      if (ev.data instanceof ArrayBuffer) {
        const text = session.decoder.decode(new Uint8Array(ev.data));
        if (text.length > 0) {
          for (const h of session.output) h(text);
        }
      }
    }) as (ev: WsMessageEvent) => void;

    socket.onerror = () => {
      // Close handler decides whether this is an exit or a plain detach.
    };

    socket.onclose = (ev: WsCloseEvent) => {
      // Drop our socket reference + decoder; a re-attach builds fresh.
      if (session.socket === socket) {
        session.socket = null as unknown as WebSocket;
      }
      session.decoder = createStreamingDecoder();
      // 1011 = server has no live PTY (session over / needs resume) → exit.
      // A plain close means we merely detached; the PTY keeps running and is
      // re-attachable, so we do NOT fire exit. A real process exit arrives as a
      // {type:'exit'} text frame (handled above), not here.
      if (ev.code === PTY_CLOSE_CODES.NO_LIVE_PTY) {
        for (const h of session.exit) h(null);
      }
    };

    return session;
  };

  const send = (id: SessionId, frame: string | ArrayBuffer): void => {
    const session = sessions.get(id);
    const socket = session?.socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(frame as ArrayBuffer);
      } catch {
        /* noop */
      }
      return;
    }
    // Queue: a resize/keystroke routinely races the socket open.
    const target = session ?? getOrCreate(id);
    target.pending.push(frame);
  };

  const closeSession = (id: SessionId): void => {
    const session = sessions.get(id);
    if (!session) return;
    const socket = session.socket;
    if (socket) {
      try {
        socket.close();
      } catch {
        /* noop */
      }
    }
    sessions.delete(id);
  };

  return {
    attach: (id) => {
      ensureSocket(id);
    },

    detach: (id) => {
      closeSession(id);
    },

    write: (id, bytes) => {
      // Send the underlying bytes as an ArrayBuffer slice — RN's binary send is
      // most reliable with ArrayBuffer (typed-array send has had rough edges).
      const buf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      send(id, buf);
    },

    resize: (id, cols, rows) => {
      send(id, buildResizeFrame(cols, rows));
    },

    onOutput: (id, handler): Unsubscribe => {
      const session = getOrCreate(id);
      session.output.add(handler);
      return () => session.output.delete(handler);
    },

    onSize: (id, handler): Unsubscribe => {
      const session = getOrCreate(id);
      session.size.add(handler);
      return () => session.size.delete(handler);
    },

    onExit: (id, handler): Unsubscribe => {
      const session = getOrCreate(id);
      session.exit.add(handler);
      return () => session.exit.delete(handler);
    },

    dispose: () => {
      for (const id of [...sessions.keys()]) {
        closeSession(id as SessionId);
      }
      sessions.clear();
    },
  };
}
