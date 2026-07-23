// W3 (terminal /pty) fills the web impl here.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Event as TauriEvent } from '@tauri-apps/api/event';
import type {
  TerminalTransport,
  CreateSessionOpts,
  TerminalReplayInfo,
  Unlisten,
} from './types';
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
import { withGatewayToken } from '../utils/gatewayAuth';
import { parseControlFrame } from './ptyProtocol';

const _sockets = new Map<string, WebSocket>();
// Per-session queue of input/resize frames buffered while the socket is down,
// flushed in FIFO order on the next open. `bytes` is a running total of the
// queued payload size so overflow can be enforced in O(1) per enqueue (see
// _enqueuePending). Deterministically BOUNDED — see MAX_PENDING_* below.
const _pendingSends = new Map<string, { frames: Array<string | Uint8Array>; bytes: number }>();
// Sessions whose pending queue has overflowed and FAILED CLOSED. While an id is
// latched here every further frame is dropped (never queued) until a socket
// successfully opens, which clears the latch (see _ensureSocket's onopen). This
// is what guarantees no tail of a chunked paste survives an overflow — the whole
// queue is discarded on overflow and nothing accumulates behind the latch. The
// latch is also cleared on explicit close / logical end so it never leaks, but
// deliberately PERSISTS across a transport drop + reconnect (it resets only on a
// real open).
const _overflowLatched = new Set<string>();
const _outputHandlers: Array<(id: string, data: string) => void> = [];
const _replayHandlers: Array<
  (id: string, data: string, info: TerminalReplayInfo) => void
> = [];
const _exitHandlers: Array<(id: string, exitCode?: number | null) => void> = [];
const _sizeHandlers: Array<(id: string, size: { cols: number; rows: number }) => void> = [];
const _reattachHandlers: Array<(id: string) => void> = [];

// Session ids the app currently wants attached (added in createSession, removed
// in closeSession). Only these are auto-reconnected after a transport drop —
// a socket that closes for a session we've since detached from must NOT come
// back to life.
const _activeSessions = new Set<string>();
// Ids for which a real {type:'exit'} frame has already fired onExit, so the
// close event that follows it (the server always closes subscriber sockets
// right after sending that frame — see PtyHostService) does not fire again or
// get mistaken for a transport drop worth reconnecting.
const _exitedSessions = new Set<string>();
// Per-session reconnect backoff bookkeeping (mirrors useMaestroStore's
// connectGlobal: exponential backoff + jitter, reset on successful open).
const _reconnectAttempts = new Map<string, number>();
// At most ONE pending reconnect timer per session lives here at a time, whether
// it is a backoff timer (_scheduleReconnect) or a wake-stagger timer
// (_reattachActiveSockets). A new schedule always clears the prior one first, so
// a session can never accumulate duplicate reconnect timers.
const _reconnectTimers = new Map<string, number>();
// Sessions whose current `_reconnectTimers` entry is a WAKE-stagger timer (as
// opposed to a backoff timer). A subsequent wake must neither duplicate that
// timer nor promote the session to the immediate slot, so it is left untouched
// while this flag is set — this is what makes repeated wakes idempotent.
const _wakeStaggered = new Set<string>();

// Deterministic bounds on the per-session pending-send queue (input/resize
// frames buffered while the socket is down). Without a cap a long outage under a
// noisy writer (a paste loop, a runaway script echoing input) could grow the
// queue without limit. Overflow FAILS CLOSED rather than dropping oldest: the
// moment a frame would push the queue past EITHER cap, the entire pending queue
// (including that triggering frame) is discarded and the session is latched, so
// every later frame is dropped until a socket successfully opens. Drop-oldest
// would keep the TAIL of a chunked paste and flush that suffix as a partial
// shell command on reconnect; failing closed guarantees zero tail survives.
// There is no oversized-frame exception — a single paste larger than the cap is
// dropped too, since it can execute unexpectedly after reconnect. A warning is
// emitted once per overflow episode so the loss is observable.
const MAX_PENDING_BYTES = 256 * 1024;
const MAX_PENDING_ENTRIES = 1024;

// Wake-reconnect stagger: on wake exactly one session reconnects immediately and
// the rest are spread over deterministic slots (STAGGER_STEP_MS apart, capped at
// MAX_STAGGER_MS, plus 0–STAGGER_STEP_MS of jitter) so many terminals do not
// stampede the server the instant a laptop lid opens.
const STAGGER_STEP_MS = 250;
const MAX_STAGGER_MS = 2000;

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
const _pendingReplay = new Map<string, TerminalReplayInfo['kind']>();
// Per-session opaque stream epoch last seen on an `attached` ack (#151). Compared
// by EQUALITY ONLY: a changed epoch is an authoritative respawn/restart that
// resets the terminal regardless of byte counts, while the same epoch resumes and
// supersedes the legacy base-rewind heuristic. Absent until the first
// epoch-bearing ack — a pre-#151 server never populates it, so the legacy
// offset-rewind fallback is preserved untouched.
const _epochs = new Map<string, string>();

function _decodeFor(id: string, bytes: Uint8Array): string {
  let dec = _decoders.get(id);
  if (!dec) {
    dec = new TextDecoder();
    _decoders.set(id, dec);
  }
  return dec.decode(bytes, { stream: true });
}

/**
 * Apply an `attached{base,gap,next,hasReplay,epoch?}` ack — the heart of offset
 * resume and stream-identity reset.
 *
 * `next` is the server's authoritative RAW end-of-stream offset; we snap
 * `_received` to it rather than trusting our own count (the replay slice is
 * sanitized/shorter than the raw window, so counting its bytes would desync the
 * offset).
 *
 * The terminal + decoder are reset ONLY when the on-screen buffer is no longer a
 * prefix of the incoming stream. There are exactly three reset sources:
 *   - EPOCH change  (#151): the ack carries an `epoch` differing from the one we
 *                   last saw for this session — an authoritative respawn/restart.
 *                   Resets regardless of byte counts, because a fresh stream can
 *                   emit at least as many bytes as the old one (so `base` need not
 *                   rewind). After the reset we continue from this ack's metadata.
 *   - GAP           the server evicted raw bytes below `base` (`gap > 0`, honest
 *                   bounded loss). Always a reset, epoch present or not.
 *   - LEGACY rewind `base < prevReceived` — the pre-#151 respawn heuristic,
 *                   consulted ONLY when no epoch is present. A present epoch is
 *                   authoritative and SUPERSEDES it (the same epoch means "same
 *                   stream" even if the offsets look like they rewound).
 * On a normal resume none holds, so the decoder PERSISTS (a multi-byte glyph
 * split across the disconnect boundary is completed by the replay delta) and no
 * onReattach fires (the terminal keeps its scrollback and just appends the delta).
 */
function _handleAttached(
  id: string,
  frame: {
    base: number;
    gap: number;
    next: number;
    hasReplay: boolean;
    replayKind?: TerminalReplayInfo['kind'];
    epoch?: string;
  },
): void {
  const prevReceived = _received.get(id) ?? 0;

  // GAP is a reset source regardless of stream identity: evicted bytes leave a
  // hole so the on-screen buffer can no longer be a clean prefix.
  let reset = frame.gap > 0;

  if (frame.epoch !== undefined) {
    // EPOCH is authoritative (#151): a changed epoch resets; the same (or a
    // first-seen) epoch resumes and SUPERSEDES the legacy base-rewind heuristic.
    const prevEpoch = _epochs.get(id);
    if (prevEpoch !== undefined && prevEpoch !== frame.epoch) reset = true;
    _epochs.set(id, frame.epoch);
  } else if (frame.base < prevReceived) {
    // LEGACY rewind: no epoch to compare, so fall back to the byte-count proxy
    // for a cross-stream respawn (the stream rewound below what we consumed).
    reset = true;
  }

  if (reset) {
    _decoders.delete(id);
    for (const h of _reattachHandlers) h(id);
  }
  _received.set(id, frame.next);
  // Replay expectation is fully (re)determined by THIS ack: if a prior
  // attached set hasReplay but its replay frame never arrived (socket dropped
  // first), a stale flag must not skip-count this connect's first live frame.
  if (frame.hasReplay) _pendingReplay.set(id, frame.replayKind ?? 'delta');
  else _pendingReplay.delete(id);
}

function _clearReconnectTimer(id: string): void {
  const timer = _reconnectTimers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    _reconnectTimers.delete(id);
  }
  // A cleared timer is no longer a pending wake-stagger, so drop the flag too;
  // this keeps _wakeStaggered from leaking a session whose reconnect was
  // superseded, cancelled (closeSession) or ended (logical-end onclose).
  _wakeStaggered.delete(id);
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
    _ensureSocket(id);
  }, delay);
  _reconnectTimers.set(id, timer);
}

function _ensureSocket(id: string): WebSocket {
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
  // `attached{gap,next,epoch}` ack decide whether a reset is needed (see
  // _handleAttached). A reconnect is therefore indistinguishable from a first
  // connect at this layer — no per-connect reset flag is needed.

  // Resume from the last RAW byte offset we authoritatively consumed (0 on the
  // first-ever connect). An absent/invalid offset makes the server send a full
  // replay, so this stays backward-compatible with a pre-offset server.
  const offset = _received.get(id) ?? 0;
  const ws = new WebSocket(
    withGatewayToken(`${PTY_WS_URL}?sessionId=${encodeURIComponent(id)}&offset=${offset}`),
  );
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    _reconnectAttempts.set(id, 0);
    // A successful open is the ONLY thing that clears the fail-closed latch (it
    // deliberately persists across a transport drop + reconnect). On overflow the
    // queue was already discarded, so there is nothing to flush here — this just
    // re-enables normal queueing/sending for input that arrives after the open.
    _overflowLatched.delete(id);
    const pending = _pendingSends.get(id);
    if (pending) {
      for (const frame of pending.frames) ws.send(frame);
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
      const replayKind = _pendingReplay.get(id);
      const text =
        replayKind === 'snapshot'
          ? new TextDecoder().decode(buf)
          : _decodeFor(id, buf);
      if (replayKind) {
        // The single display-only replay frame following an `attached` ack:
        // delivered through the hydration channel and NOT counted —
        // `attached.next` already accounts for the raw stream it represents.
        _pendingReplay.delete(id);
        if (_replayHandlers.length > 0) {
          for (const h of _replayHandlers) h(id, text, { kind: replayKind });
        } else {
          // Backward compatibility for consumers that only registered onOutput.
          for (const h of _outputHandlers) h(id, text);
        }
      } else {
        for (const h of _outputHandlers) h(id, text);
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
      _decoders.delete(id);
      _received.delete(id);
      _pendingReplay.delete(id);
      _epochs.delete(id);
      // Queued input belongs to the PTY it was typed for. That process is gone,
      // so the queue must die with it: an under-cap queue never overflows, so
      // nothing else would ever discard it, and it would flush into whatever
      // next opens a socket for this id (a re-created shell reusing persistId).
      // A queued trailing newline would EXECUTE there. Mirrors closeSession.
      _pendingSends.delete(id);
      // Session is over — no reconnect will clear the latch, so clear it here to
      // avoid leaking a latched id for a session that will never reopen.
      _overflowLatched.delete(id);
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
      _decoders.delete(id);
      _received.delete(id);
      _pendingReplay.delete(id);
      _epochs.delete(id);
      _overflowLatched.delete(id);
    }
  };

  _sockets.set(id, ws);
  return ws;
}

let _wakeListenersRegistered = false;

/**
 * Re-attach active sessions whose socket is down, STAGGERED so a wake doesn't
 * stampede the server: exactly one session (the first in iteration order that
 * needs it) reconnects immediately for foreground promptness; the rest are
 * spread over deterministic slots (STAGGER_STEP_MS apart, capped at
 * MAX_STAGGER_MS, plus bounded jitter). A session already OPEN or CONNECTING is
 * skipped, and a session that a PRIOR wake already staggered is left on its
 * existing timer — so repeated wakes never duplicate a socket or a timer.
 */
function _reattachActiveSockets(): void {
  let immediateUsed = false;
  let staggerCount = 0;
  for (const id of _activeSessions) {
    const ws = _sockets.get(id);
    // Already connected or mid-connect — nothing to reattach.
    if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) continue;
    // A previous wake already scheduled this session; don't duplicate or promote.
    if (_wakeStaggered.has(id)) continue;

    // Supersede any slow backoff timer with the wake response, and reset backoff
    // so the reconnect (immediate or staggered) starts fresh.
    _clearReconnectTimer(id);
    _reconnectAttempts.set(id, 0);

    if (!immediateUsed) {
      immediateUsed = true;
      _ensureSocket(id);
      continue;
    }

    staggerCount += 1;
    const delay =
      Math.min(staggerCount * STAGGER_STEP_MS, MAX_STAGGER_MS) + Math.random() * STAGGER_STEP_MS;
    _wakeStaggered.add(id);
    const timer = window.setTimeout(() => {
      _reconnectTimers.delete(id);
      _wakeStaggered.delete(id);
      if (!_activeSessions.has(id)) return;
      const cur = _sockets.get(id);
      // Re-check: the session may have reconnected (or been closed) while waiting.
      if (cur && cur.readyState !== WebSocket.CLOSED && cur.readyState !== WebSocket.CLOSING) return;
      _ensureSocket(id);
    }, delay);
    _reconnectTimers.set(id, timer);
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

/** Byte size of a queued frame in the same units the byte cap is expressed in. */
function _frameSize(frame: string | Uint8Array): number {
  return typeof frame === 'string' ? frame.length : frame.byteLength;
}

/**
 * Append a frame to a session's pending-send queue, enforcing the deterministic
 * byte + entry caps with a FAIL-CLOSED overflow policy. Once a session has
 * overflowed it is latched (`_overflowLatched`) and every further frame is
 * dropped until a socket successfully opens — so nothing accumulates behind the
 * latch. When a frame would push the queue past EITHER cap, the ENTIRE queue
 * (including that triggering frame) is discarded and the session is latched:
 * dropping oldest instead would keep the tail of a chunked paste and replay it
 * as a partial shell command on reconnect. There is no oversized-frame
 * exception. The overflow is reported via a single console.warn per episode so
 * the loss is observable rather than silent.
 */
function _enqueuePending(id: string, frame: string | Uint8Array): void {
  // Latched from a prior overflow: drop silently (the episode already warned).
  if (_overflowLatched.has(id)) return;

  const entry = _pendingSends.get(id) ?? { frames: [], bytes: 0 };
  entry.frames.push(frame);
  entry.bytes += _frameSize(frame);

  if (entry.bytes > MAX_PENDING_BYTES || entry.frames.length > MAX_PENDING_ENTRIES) {
    // FAIL CLOSED: discard the whole queue (including this frame) and latch, so
    // no pre-overflow prefix or post-overflow tail is ever flushed. Cleared on
    // the next successful open (see _ensureSocket's onopen).
    _pendingSends.delete(id);
    _overflowLatched.add(id);
    console.warn(
      `[webTerminal] pending input overflow for ${id}: queued input exceeded ` +
        `${MAX_PENDING_BYTES}B / ${MAX_PENDING_ENTRIES} entries — dropping ALL queued ` +
        `input until reconnect (fail-closed; no partial paste is replayed)`,
    );
    return;
  }
  _pendingSends.set(id, entry);
}

function _sendFrame(id: string, frame: string | Uint8Array): void {
  const ws = _sockets.get(id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(frame);
    return;
  }
  // Queue for when the socket opens (resize may arrive before onopen fires, and
  // input typed during a reconnect must survive until the socket is back).
  _enqueuePending(id, frame);
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
    _epochs.delete(id);
    // Drop any input still queued against a PRIOR use of this id, before
    // _ensureSocket below can flush it into this session's shell. Not merely a
    // belt to the logical-end teardown's braces: it covers a window that
    // teardown cannot, since input typed into an already-ended terminal is
    // queued AFTER teardown ran and nothing reconnects a dead id to drain it.
    // A fresh session must never inherit a dead one's keystrokes.
    _pendingSends.delete(id);
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
    _exitedSessions.delete(id);
    const ws = _sockets.get(id);
    if (ws) {
      ws.close();
      _sockets.delete(id);
    }
    _pendingSends.delete(id);
    _overflowLatched.delete(id);
    _decoders.delete(id);
    _received.delete(id);
    _pendingReplay.delete(id);
    _epochs.delete(id);
    return Promise.resolve();
  },

  onOutput(handler: (id: string, data: string) => void): Promise<Unlisten> {
    _outputHandlers.push(handler);
    return Promise.resolve(() => {
      const idx = _outputHandlers.indexOf(handler);
      if (idx >= 0) _outputHandlers.splice(idx, 1);
    });
  },

  onReplay(
    handler: (id: string, data: string, info: TerminalReplayInfo) => void,
  ): Promise<Unlisten> {
    _replayHandlers.push(handler);
    return Promise.resolve(() => {
      const idx = _replayHandlers.indexOf(handler);
      if (idx >= 0) _replayHandlers.splice(idx, 1);
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
