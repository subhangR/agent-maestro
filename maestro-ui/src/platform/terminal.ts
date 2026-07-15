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
import { parseControlFrame } from './ptyProtocol';

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

// Per-session RAW byte offset the client has authoritatively consumed. Sent as
// `?offset=` on every (re)connect and snapped to the server's `attached.next`;
// advanced by the raw byteLength of each LIVE binary frame. Offsets count raw
// PTY bytes end-to-end — the live path is never sanitized, so raw is the only
// coordinate space consistent across live output and replay. Reset to 0 on a
// fresh createSession; cleared when the session logically ends.
const _received = new Map<string, number>();
// Sessions whose NEXT binary frame is the single display-only replay frame the
// server sends after an `attached{hasReplay:true}` ack. That frame is rendered
// but NOT counted toward `_received` — `attached.next` already accounts for its
// (raw) bytes, and the frame itself is a sanitized/shorter slice, so counting it
// would desync the offset. A one-shot flag: consumed by the first binary frame.
const _pendingReplay = new Set<string>();

function _decodeFor(id: string, bytes: Uint8Array): string {
  let dec = _decoders.get(id);
  if (!dec) {
    dec = new TextDecoder();
    _decoders.set(id, dec);
  }
  return dec.decode(bytes, { stream: true });
}

/**
 * Apply an `attached{base,gap,next,hasReplay}` ack — the heart of offset resume.
 *
 * `next` is the server's authoritative RAW end-of-stream offset; we snap
 * `_received` to it rather than trusting our own count (the replay slice is
 * sanitized/shorter than the raw window, so counting its bytes would desync the
 * offset). The terminal + decoder are reset ONLY when the on-screen buffer is no
 * longer a prefix of the incoming stream:
 *   - `gap > 0`             the server evicted raw bytes below `base` (bounded loss).
 *   - `base < prevReceived` the stream rewound below what we already consumed —
 *                           a fresh PTY respawned under the same session id.
 * On a normal resume neither holds, so the decoder PERSISTS (a multi-byte glyph
 * split across the disconnect boundary is completed by the replay delta) and no
 * onReattach fires (the terminal keeps its scrollback and just appends the delta).
 */
function _handleAttached(
  id: string,
  frame: { base: number; gap: number; next: number; hasReplay: boolean },
): void {
  const prevReceived = _received.get(id) ?? 0;
  if (frame.gap > 0 || frame.base < prevReceived) {
    _decoders.delete(id);
    for (const h of _reattachHandlers) h(id);
  }
  _received.set(id, frame.next);
  // Replay expectation is fully (re)determined by THIS ack: if a prior
  // attached set hasReplay but its replay frame never arrived (socket dropped
  // first), a stale flag must not skip-count this connect's first live frame.
  if (frame.hasReplay) _pendingReplay.add(id);
  else _pendingReplay.delete(id);
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

  // Under offset resume the repaint decision is NO LONGER made here. #140 reset
  // xterm eagerly on every reconnect because the fresh socket replayed the FULL
  // ring; this layer instead resumes from `_received` and lets the server's
  // `attached{gap,next}` ack decide whether a reset is needed (see
  // _handleAttached). `_connectedIds` is retained purely as lifecycle
  // bookkeeping; `opts.isReconnect` no longer changes connect behavior.
  _connectedIds.add(id);

  // Resume from the last RAW byte offset we authoritatively consumed (0 on the
  // first-ever connect). An absent/invalid offset makes the server send a full
  // replay, so this stays backward-compatible with a pre-offset server.
  const offset = _received.get(id) ?? 0;
  const ws = new WebSocket(
    `${PTY_WS_URL}?sessionId=${encodeURIComponent(id)}&offset=${offset}`,
  );
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
      const frame = parseControlFrame(ev.data);
      if (frame) {
        if (frame.type === 'exit') {
          // A real process exit — mark it so the close event that follows
          // (PtyHostService closes every subscriber right after this frame)
          // is recognized as a logical end, not a transport drop to reconnect.
          _exitedSessions.add(id);
          _activeSessions.delete(id);
          for (const h of _exitHandlers) h(id, frame.exitCode);
          return;
        }
        if (frame.type === 'size') {
          for (const h of _sizeHandlers) h(id, { cols: frame.cols, rows: frame.rows });
          return;
        }
        if (frame.type === 'attached') {
          _handleAttached(id, frame);
          return;
        }
      }
      // Not a control frame — ordinary PTY output that happens to be a string.
      for (const h of _outputHandlers) h(id, ev.data as string);
    } else {
      const buf = new Uint8Array(ev.data as ArrayBuffer);
      const text = _decodeFor(id, buf);
      for (const h of _outputHandlers) h(id, text);
      if (_pendingReplay.has(id)) {
        // The single display-only replay frame following an `attached` ack:
        // rendered above, but NOT counted — `attached.next` already accounts for
        // these raw bytes, and this slice is sanitized/shorter than the window.
        _pendingReplay.delete(id);
      } else {
        // A live frame — advance the offset by its RAW byte length.
        _received.set(id, (_received.get(id) ?? 0) + buf.byteLength);
      }
    }
  };

  ws.onclose = (ev) => {
    if (_sockets.get(id) === ws) _sockets.delete(id);
    // NOTE: the streaming decoder is deliberately NOT dropped here. Under offset
    // resume it must persist across a transport drop so a multi-byte glyph split
    // across the disconnect boundary is completed by the reconnect's replay
    // delta (the replay begins exactly at the trailing byte). The decoder is
    // reset only on a gap/rewind (see _handleAttached) or a logical end / close.
    _clearReconnectTimer(id);

    const alreadyExited = _exitedSessions.has(id);
    _exitedSessions.delete(id);

    // LOGICAL END: 1011 means the server has no live PTY for this session
    // (reattach to a dead/gone session); alreadyExited means a real process
    // exit already arrived as a {type:'exit'} frame (handled above). Either way
    // the session is truly over — tear down all per-session offset state.
    if (ev.code === 1011 || alreadyExited) {
      _activeSessions.delete(id);
      _reconnectAttempts.delete(id);
      _connectedIds.delete(id);
      _decoders.delete(id);
      _received.delete(id);
      _pendingReplay.delete(id);
      if (!alreadyExited) {
        for (const h of _exitHandlers) h(id, null);
      }
      return;
    }

    // TRANSPORT DROP: reload, tab switch, network blip, or (the motivating case)
    // the laptop lid closing and macOS suspending the socket. The server-hosted
    // PTY is still alive, so reconnect with backoff as long as the app still
    // wants this session attached — keeping the decoder + `_received` offset so
    // the reconnect resumes from exactly where we left off.
    if (_activeSessions.has(id)) {
      _scheduleReconnect(id);
    } else {
      // Detached without a logical-end frame (e.g. closeSession already ran) —
      // no reconnect is coming, so clear the resume state too.
      _reconnectAttempts.delete(id);
      _connectedIds.delete(id);
      _decoders.delete(id);
      _received.delete(id);
      _pendingReplay.delete(id);
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
    // Fresh session ⇒ fresh offset accounting: start the resume counter at 0 and
    // clear any stale display-only-replay flag from a prior use of this id.
    _received.delete(id);
    _pendingReplay.delete(id);
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
    _received.delete(id);
    _pendingReplay.delete(id);
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
