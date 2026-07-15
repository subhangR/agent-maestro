// W3 (terminal /pty) fills the web impl here.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Event as TauriEvent } from '@tauri-apps/api/event';
import type { TerminalTransport, CreateSessionOpts, Unlisten } from './types';
import type { TerminalSessionInfo } from '../app/types/session';

export const tauriTerminal: TerminalTransport = {
  createSession(opts: CreateSessionOpts): Promise<TerminalSessionInfo> {
    return invoke<TerminalSessionInfo>('create_session', {
      name: opts.name,
      command: opts.command,
      cwd: opts.cwd,
      envVars: opts.envVars,
      persistent: opts.persistent,
      persistId: opts.persistId,
    });
  },

  write(id: string, data: string, source = 'user'): Promise<void> {
    return invoke('write_to_session', { id, data, source });
  },

  resize(id: string, cols: number, rows: number): Promise<void> {
    return invoke('resize_session', { id, cols, rows });
  },

  closeSession(id: string): Promise<void> {
    return invoke('close_session', { id });
  },

  async onOutput(handler: (id: string, data: string) => void): Promise<Unlisten> {
    type Payload = { id: string; data?: unknown };
    return listen<Payload>('pty-output', (event: TauriEvent<Payload>) => {
      const { id, data } = event.payload;
      if (typeof data === 'string') {
        handler(id, data);
      } else if (data instanceof Uint8Array) {
        handler(id, new TextDecoder().decode(data));
      } else if (data instanceof ArrayBuffer) {
        handler(id, new TextDecoder().decode(new Uint8Array(data)));
      } else if (Array.isArray(data) && data.every((x) => typeof x === 'number')) {
        handler(id, new TextDecoder().decode(new Uint8Array(data as number[])));
      }
    });
  },

  async onExit(handler: (id: string, exitCode?: number | null) => void): Promise<Unlisten> {
    type ExitPayload = { id: string; exit_code?: number | null };
    return listen<ExitPayload>('pty-exit', (event: TauriEvent<ExitPayload>) => {
      handler(event.payload.id, event.payload.exit_code);
    });
  },
};

// ── webTerminal: per-session WebSocket transport to /pty ──────────────────
import { API_BASE_URL, PTY_WS_URL } from '../utils/serverConfig';

const _sockets = new Map<string, WebSocket>();
const _pendingSends = new Map<string, Array<string | Uint8Array>>();
const _outputHandlers: Array<(id: string, data: string) => void> = [];
const _exitHandlers: Array<(id: string, exitCode?: number | null) => void> = [];
const _sizeHandlers: Array<(id: string, size: { cols: number; rows: number }) => void> = [];
const _reattachHandlers: Array<(id: string) => void> = [];

// Session ids the app currently wants attached (added in createSession, removed
// in closeSession). Only these are auto-reconnected after a transport drop —
// a socket that closes for a session we've since detached from must NOT come
// back to life.
const _activeSessions = new Set<string>();
// Ids that have connected at least once. Distinguishes a session's FIRST-EVER
// connect (nothing to reset, no scrollback yet on screen) from a RECONNECT
// (the client already rendered some of this PTY's ring buffer, so replaying it
// again would duplicate history — see _reattachHandlers).
const _connectedIds = new Set<string>();
// Ids for which a real {type:'exit'} frame has already fired onExit, so the
// close event that follows it (the server always closes subscriber sockets
// right after sending that frame — see PtyHostService) does not fire again or
// get mistaken for a transport drop worth reconnecting.
const _exitedSessions = new Set<string>();
// Per-session reconnect backoff bookkeeping (mirrors useMaestroStore's
// connectGlobal: exponential backoff + jitter, reset on successful open).
const _reconnectAttempts = new Map<string, number>();
const _reconnectTimers = new Map<string, number>();

// One streaming decoder per session. PTY output arrives as raw bytes split on
// arbitrary boundaries, so a multi-byte UTF-8 glyph (box-drawing chars, emoji,
// the ⏺/✻ symbols Claude prints) can straddle two WebSocket frames. A streaming
// decoder holds the incomplete tail until the next frame instead of emitting a
// replacement char (�). Must be per-session so interleaved sessions don't bleed
// partial bytes into each other.
const _decoders = new Map<string, TextDecoder>();

function _decodeFor(id: string, bytes: Uint8Array): string {
  let dec = _decoders.get(id);
  if (!dec) {
    dec = new TextDecoder();
    _decoders.set(id, dec);
  }
  return dec.decode(bytes, { stream: true });
}

function _clearReconnectTimer(id: string): void {
  const timer = _reconnectTimers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    _reconnectTimers.delete(id);
  }
}

/** Exponential backoff + jitter, mirroring useMaestroStore's connectGlobal. */
function _scheduleReconnect(id: string): void {
  if (!_activeSessions.has(id)) return;
  _clearReconnectTimer(id);
  const attempts = _reconnectAttempts.get(id) ?? 0;
  const baseDelay = Math.min(1000 * Math.pow(2, attempts), 30000);
  const jitter = Math.random() * baseDelay * 0.5; // 0-50% jitter
  const delay = baseDelay + jitter;
  _reconnectAttempts.set(id, attempts + 1);
  const timer = window.setTimeout(() => {
    _reconnectTimers.delete(id);
    if (!_activeSessions.has(id)) return;
    _ensureSocket(id, { isReconnect: true });
  }, delay);
  _reconnectTimers.set(id, timer);
}

function _ensureSocket(id: string, opts: { isReconnect?: boolean } = {}): WebSocket {
  const existing = _sockets.get(id);
  if (
    existing &&
    existing.readyState !== WebSocket.CLOSED &&
    existing.readyState !== WebSocket.CLOSING
  ) {
    return existing;
  }

  // A RECONNECT (as opposed to the session's first-ever connect) means the
  // browser already rendered some of this PTY's scrollback. The fresh socket is
  // about to replay the FULL ring buffer from the top (PtyWebSocketServer /
  // PtyHostService.addSubscriber), which would duplicate everything already on
  // screen unless the xterm buffer is reset first. Tell subscribers (wired via
  // useSessionStore -> SessionTerminal) to reset before any bytes arrive.
  const isReconnect = opts.isReconnect ?? _connectedIds.has(id);
  _connectedIds.add(id);
  if (isReconnect) {
    for (const h of _reattachHandlers) h(id);
  }

  const ws = new WebSocket(`${PTY_WS_URL}?sessionId=${encodeURIComponent(id)}`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    _reconnectAttempts.set(id, 0);
    const pending = _pendingSends.get(id);
    if (pending) {
      for (const frame of pending) ws.send(frame);
      _pendingSends.delete(id);
    }
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      try {
        const msg = JSON.parse(ev.data) as {
          type?: string;
          exitCode?: number | null;
          cols?: number;
          rows?: number;
        };
        if (msg.type === 'exit') {
          // A real process exit — mark it so the close event that follows
          // (PtyHostService closes every subscriber right after this frame)
          // is recognized as a logical end, not a transport drop to reconnect.
          _exitedSessions.add(id);
          _activeSessions.delete(id);
          for (const h of _exitHandlers) h(id, msg.exitCode ?? null);
          return;
        }
        if (
          msg.type === 'size' &&
          Number.isFinite(msg.cols) &&
          Number.isFinite(msg.rows)
        ) {
          for (const h of _sizeHandlers) h(id, { cols: msg.cols!, rows: msg.rows! });
          return;
        }
      } catch {
        // not a control frame — fall through to PTY output
      }
      for (const h of _outputHandlers) h(id, ev.data as string);
    } else {
      const text = _decodeFor(id, new Uint8Array(ev.data as ArrayBuffer));
      for (const h of _outputHandlers) h(id, text);
    }
  };

  ws.onclose = (ev) => {
    if (_sockets.get(id) === ws) _sockets.delete(id);
    // Drop the streaming decoder on EVERY close, not just a logical end: its
    // partial multi-byte state belongs to the dead connection, so a reconnect's
    // first frame decodes standalone instead of risking a split glyph from the
    // old socket corrupting the start of the replay.
    _decoders.delete(id);
    _clearReconnectTimer(id);

    const alreadyExited = _exitedSessions.has(id);
    _exitedSessions.delete(id);

    // LOGICAL END: 1011 means the server has no live PTY for this session
    // (reattach to a dead/gone session); alreadyExited means a real process
    // exit already arrived as a {type:'exit'} frame (handled above). Either way
    // the session is truly over — do not reconnect.
    if (ev.code === 1011 || alreadyExited) {
      _activeSessions.delete(id);
      _reconnectAttempts.delete(id);
      _connectedIds.delete(id);
      if (!alreadyExited) {
        for (const h of _exitHandlers) h(id, null);
      }
      return;
    }

    // TRANSPORT DROP: reload, tab switch, network blip, or (the motivating case)
    // the laptop lid closing and macOS suspending the socket. The server-hosted
    // PTY is still alive, so reconnect with backoff as long as the app still
    // wants this session attached.
    if (_activeSessions.has(id)) {
      _scheduleReconnect(id);
    } else {
      _reconnectAttempts.delete(id);
      _connectedIds.delete(id);
    }
  };

  _sockets.set(id, ws);
  return ws;
}

let _wakeListenersRegistered = false;

/** Immediately re-attach any active session whose socket isn't OPEN, resetting backoff to instant. */
function _reattachActiveSockets(): void {
  for (const id of _activeSessions) {
    const ws = _sockets.get(id);
    if (ws && ws.readyState === WebSocket.OPEN) continue;
    _clearReconnectTimer(id);
    _reconnectAttempts.set(id, 0);
    _ensureSocket(id, { isReconnect: true });
  }
}

/**
 * Wake/network-regain detection: a backgrounded tab's timers get throttled (or,
 * on macOS lid-close, the whole process is suspended), so a scheduled backoff
 * reconnect can sit unfired for a long time after the machine is actually back.
 * Firing an immediate reattach on `visibilitychange`/`online` closes that gap.
 * Registered exactly once regardless of how many sessions get created.
 */
function _registerWakeListeners(): void {
  if (_wakeListenersRegistered) return;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  _wakeListenersRegistered = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _reattachActiveSockets();
  });
  window.addEventListener('online', _reattachActiveSockets);
}

function _sendFrame(id: string, frame: string | Uint8Array): void {
  const ws = _sockets.get(id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(frame);
    return;
  }
  // Queue for when the socket opens (resize may arrive before onopen fires)
  const queue = _pendingSends.get(id) ?? [];
  queue.push(frame);
  _pendingSends.set(id, queue);
}

export const webTerminal: TerminalTransport = {
  async createSession(opts: CreateSessionOpts): Promise<TerminalSessionInfo> {
    const id = opts.maestroSessionId ?? opts.persistId;
    // Registered once regardless of how many sessions get created (guarded
    // internally); wires visibilitychange/online to instantly re-attach any
    // session this transport still wants connected.
    _registerWakeListeners();
    // Track this id as one the app wants to stay attached — drives whether a
    // future socket close auto-reconnects (see _ensureSocket's onclose).
    _activeSessions.add(id);
    // Plain terminals (no maestroSessionId) have no server-side PTY yet — the
    // server only spawns one for maestro sessions during session spawn. Ask the
    // server to spawn a PTY BEFORE attaching the socket; otherwise the attach
    // races a non-existent PTY and the server closes it with 1011, which the
    // client reads as an instant exit. A failed spawn must NOT block the attach,
    // so we degrade gracefully and still connect.
    if (!opts.maestroSessionId) {
      try {
        await fetch(`${API_BASE_URL}/pty/spawn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: id,
            command: opts.command ?? null,
            cwd: opts.cwd ?? null,
            env: opts.envVars ?? undefined,
          }),
        });
      } catch (err) {
        console.warn(`[webTerminal] failed to spawn server PTY for ${id}; attaching anyway`, err);
      }
    }
    _ensureSocket(id);
    return {
      id,
      name: opts.name ?? '',
      command: opts.command ?? '',
      cwd: opts.cwd ?? null,
    };
  },

  write(id: string, data: string, _source?: string): Promise<void> {
    _sendFrame(id, new TextEncoder().encode(data));
    return Promise.resolve();
  },

  resize(id: string, cols: number, rows: number): Promise<void> {
    _sendFrame(id, JSON.stringify({ type: 'resize', cols, rows }));
    return Promise.resolve();
  },

  closeSession(id: string): Promise<void> {
    // Remove from the "should stay attached" set FIRST — ws.close() below
    // synchronously fires onclose in some environments, and that handler must
    // see this id as no-longer-active so it does not schedule a reconnect.
    _activeSessions.delete(id);
    _clearReconnectTimer(id);
    _reconnectAttempts.delete(id);
    _connectedIds.delete(id);
    _exitedSessions.delete(id);
    const ws = _sockets.get(id);
    if (ws) {
      ws.close();
      _sockets.delete(id);
    }
    _pendingSends.delete(id);
    _decoders.delete(id);
    return Promise.resolve();
  },

  onOutput(handler: (id: string, data: string) => void): Promise<Unlisten> {
    _outputHandlers.push(handler);
    return Promise.resolve(() => {
      const idx = _outputHandlers.indexOf(handler);
      if (idx >= 0) _outputHandlers.splice(idx, 1);
    });
  },

  onSize(handler: (id: string, size: { cols: number; rows: number }) => void): Promise<Unlisten> {
    _sizeHandlers.push(handler);
    return Promise.resolve(() => {
      const idx = _sizeHandlers.indexOf(handler);
      if (idx >= 0) _sizeHandlers.splice(idx, 1);
    });
  },

  onExit(handler: (id: string, exitCode?: number | null) => void): Promise<Unlisten> {
    _exitHandlers.push(handler);
    return Promise.resolve(() => {
      const idx = _exitHandlers.indexOf(handler);
      if (idx >= 0) _exitHandlers.splice(idx, 1);
    });
  },

  onReattach(handler: (id: string) => void): Promise<Unlisten> {
    _reattachHandlers.push(handler);
    return Promise.resolve(() => {
      const idx = _reattachHandlers.indexOf(handler);
      if (idx >= 0) _reattachHandlers.splice(idx, 1);
    });
  },
};
