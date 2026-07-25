import type { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { ILogger } from '../../domain/common/ILogger';
import { PtyHostService } from '../../application/services/PtyHostService';

/** WebSocket protocol-level heartbeat cadence (ws library ping/pong, not a JSON frame). */
const HEARTBEAT_INTERVAL_MS = 30_000;

type TrackedWebSocket = WebSocket & { isAlive?: boolean };

/**
 * Dedicated WebSocket channel for live PTY streaming, separate from the main
 * WebSocketBridge so terminal bytes never hit its JSON framing, 50ms batching,
 * per-entity throttling, or 1MB buffer cap.
 *
 * Protocol (one socket per session, connect to `/pty?sessionId=<id>&offset=<rawBytes>`):
 *  - server -> client: text frames   = JSON control messages, in this order on attach:
 *                        { "type": "size", "cols": <n>, "rows": <n> }  (only if the PTY
 *                          size is known; lets the client match the width the scrollback
 *                          was authored at)
 *                        { "type": "attached", "base": <n>, "gap": <n>, "next": <n>,
 *                          "hasReplay": <bool>, "replayKind"?: "delta"|"snapshot",
 *                          "epoch"?: <string> }  (the resume handshake —
 *                          all offsets RAW; `next` is the authoritative offset the client snaps
 *                          its receive counter to, `gap` counts evicted bytes it must surface as
 *                          a truncation, `hasReplay` says whether a replay binary frame follows.
 *                          `replayKind:"snapshot"` means an evicted raw prefix was
 *                          replaced by a coherent serialized terminal state.
 *                          `epoch` is the OPTIONAL opaque per-spawn stream identity (#151):
 *                          present only when known, compared by equality only — a changed epoch
 *                          means a respawn/restart and an authoritative client reset. Absent
 *                          epoch preserves the pre-#151 offset-rewind fallback.)
 *                        { "type": "exit", "exitCode": <n|null> }  (real process exit)
 *                      binary frame   = the sanitized scrollback replay (sent once, right
 *                        after `attached`, iff hasReplay), then raw live PTY output
 *  - client -> server: `?offset=` query param = the raw byte offset the client last received
 *                        (0 or absent = fresh attach → full replay of the retained tail)
 *                      binary frame  = keystroke bytes (written to the PTY)
 *                      text frame     = JSON control message, currently:
 *                        { "type": "resize", "cols": <n>, "rows": <n> }
 *
 * A protocol-level ping/pong heartbeat (not a data frame — invisible to the
 * message handlers above) runs every HEARTBEAT_INTERVAL_MS so a browser tab
 * that vanished without a clean close (laptop sleep, killed process, dropped
 * wifi) gets reaped instead of lingering as a phantom subscriber until TCP
 * eventually notices. Browsers answer protocol pings automatically; no
 * client-side change is required.
 */
export class PtyWebSocketServer {
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly wss: WebSocketServer,
    private readonly ptyHostService: PtyHostService,
    private readonly logger: ILogger,
  ) {
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const ws of this.wss.clients) {
        const client = ws as TrackedWebSocket;
        if (client.isAlive === false) {
          this.logger.info('PtyWebSocketServer: terminating unresponsive client');
          client.terminate();
          continue;
        }
        client.isAlive = false;
        try {
          client.ping();
        } catch {
          // best effort
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
    // Don't keep the process alive solely for the heartbeat timer.
    this.heartbeatInterval.unref?.();
  }

  /** Stop the heartbeat timer (graceful shutdown). */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const sessionId = this.parseSessionId(req);
    if (!sessionId) {
      this.closeWith(ws, 1008, 'missing sessionId');
      return;
    }

    ws.binaryType = 'nodebuffer';
    const tracked = ws as TrackedWebSocket;
    tracked.isAlive = true;
    ws.on('pong', () => {
      tracked.isAlive = true;
    });

    // Register inbound/cleanup handlers before snapshot hydration. The gap path
    // intentionally awaits the headless xterm mirror; input and socket-close
    // events must remain observable during that short window.
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (isBinary) {
        const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        this.ptyHostService.write(sessionId, buf);
        return;
      }
      const text = Array.isArray(data)
        ? Buffer.concat(data).toString('utf8')
        : Buffer.from(data as ArrayBuffer).toString('utf8');
      this.handleControl(sessionId, text, ws);
    });

    ws.on('close', () => {
      this.ptyHostService.removeSubscriber(sessionId, ws);
      this.logger.info('PtyWebSocketServer: client detached', { sessionId });
    });

    ws.on('error', () => {
      this.ptyHostService.removeSubscriber(sessionId, ws);
    });

    // Resolve the resume point FIRST. A reconnecting client carries the raw byte
    // offset it last received as `?offset=`. getReplay both proves the PTY still
    // exists (null → nothing to attach to) and computes exactly the delta to
    // replay, so a ghost session is closed 1011 before it is ever subscribed.
    const offset = this.parseOffset(req);
    const replay = this.ptyHostService.getReplay(sessionId, offset);
    if (!replay) {
      this.closeWith(ws, 1011, 'no live PTY for session');
      return;
    }

    // An evicted raw prefix is not a valid terminal program: it can begin in
    // the middle of a CSI sequence and omit the mode/alternate-screen setup
    // Codex relies on. Buffer live output first, capture the headless mirror at
    // this exact boundary, then replay that complete state and flush the buffer.
    if (replay.gap > 0) {
      if (!this.ptyHostService.addPendingSubscriber(sessionId, ws)) {
        this.closeWith(ws, 1011, 'no live PTY for session');
        return;
      }
      const snapshot = this.ptyHostService.getStateSnapshot(sessionId);
      if (!snapshot) {
        this.ptyHostService.removeSubscriber(sessionId, ws);
        this.closeWith(ws, 1011, 'no live PTY for session');
        return;
      }
      const epoch = this.ptyHostService.getEpoch(sessionId) ?? undefined;
      void this.finishSnapshotAttach(ws, sessionId, offset, replay.gap, epoch, snapshot);
      return;
    }

    // Tell the client the PTY's current dimensions BEFORE the replay so it can
    // size its terminal to the width the buffered output was authored at.
    // Without this the replay renders into a differently-sized xterm grid and
    // wraps at the wrong column (garbled history). Sent as a text control frame.
    const size = this.ptyHostService.getSize(sessionId);
    if (size) {
      this.send(ws, JSON.stringify({ type: 'size', cols: size.cols, rows: size.rows }));
    }

    // ORDER IS PROTOCOL, NOT STYLE: the `attached` handshake frame MUST be sent
    // BEFORE the replay/snapshot bytes. The client resets xterm when it processes
    // `attached` (on epoch-change / gap), so if the replay arrived first it would
    // paint into the old buffer and the reset would then WIPE it — a blank
    // terminal with no error. Do NOT refactor this into a compose-and-return
    // helper that delivers replay through the sink before returning the metadata
    // (a "tidy attach(id, sink, offset)" seam is exactly this trap). Keep
    // handshake-then-replay here and in finishSnapshotAttach.
    //
    // The attach handshake. `base`/`gap`/`next` are RAW byte offsets: the client
    // snaps its receive counter to `next` (NOT to the replay frame's length,
    // which is sanitized and therefore shorter than the raw span it represents),
    // and surfaces `gap` evicted bytes as a truncation marker. `hasReplay` tells
    // it whether a single scrollback binary frame follows.
    //
    // `epoch` (#151) is the opaque per-spawn stream identity. It is ADDITIVE: the
    // key is present only when the host has one, so a pre-#151 client (and the
    // legacy offset-rewind fallback) is unaffected. A client that understands it
    // compares by equality only — a changed epoch means a respawn/restart and an
    // authoritative reset; the same epoch resumes normally.
    const hasReplay = replay.data.length > 0;
    const epoch = this.ptyHostService.getEpoch(sessionId);
    const attachedFrame: Record<string, unknown> = {
      type: 'attached',
      base: replay.base,
      gap: replay.gap,
      next: replay.next,
      hasReplay,
    };
    if (epoch) attachedFrame.epoch = epoch;
    this.send(ws, JSON.stringify(attachedFrame));

    // One binary frame carrying the sanitized scrollback, iff there is any.
    if (hasReplay) {
      this.send(ws, replay.data);
    }

    // Join the live stream.
    //
    // ORDERING INVARIANT (#150) — DO NOT insert an `await` anywhere between the
    // getReplay snapshot above and this addSubscriber join. The snapshot froze the
    // stream boundary at `next`; node-pty output arrives on a SEPARATE event-loop
    // task (PtyHostService's proc.onData → safeSend), so as long as this whole
    // attach sequence (snapshot → size/attached/replay frames → join) runs
    // synchronously, no live chunk can interleave: every byte < next is in the
    // replay, every byte >= next is delivered live to this subscriber, and the two
    // partitions cover the stream with no overlap and no hole. Yielding the
    // microtask/task queue here (any await, or moving the join before the snapshot)
    // reopens that window — a chunk emitted in it would be lost (in neither the
    // replay nor the live feed) or duplicated. Keep it synchronous; the
    // replay→subscribe seam tests pin this exactly-once accounting.
    //
    // getReplay already gated existence, so this cannot fail for a live session,
    // but keep the guard honest.
    const attached = this.ptyHostService.addSubscriber(sessionId, ws);
    if (!attached) {
      this.closeWith(ws, 1011, 'no live PTY for session');
      return;
    }

    this.logger.info('PtyWebSocketServer: client attached', { sessionId, offset });
  }

  private async finishSnapshotAttach(
    ws: WebSocket,
    sessionId: string,
    offset: number,
    gap: number,
    epoch: string | undefined,
    snapshotPromise: Promise<{ next: number; data: Buffer; cols: number; rows: number }>,
  ): Promise<void> {
    try {
      const snapshot = await snapshotPromise;
      this.send(
        ws,
        JSON.stringify({ type: 'size', cols: snapshot.cols, rows: snapshot.rows }),
      );
      const attachedFrame: Record<string, unknown> = {
        type: 'attached',
        base: snapshot.next,
        gap,
        next: snapshot.next,
        hasReplay: snapshot.data.length > 0,
        replayKind: 'snapshot',
      };
      if (epoch) attachedFrame.epoch = epoch;
      this.send(ws, JSON.stringify(attachedFrame));
      if (snapshot.data.length > 0) this.send(ws, snapshot.data);

      if (!this.ptyHostService.activatePendingSubscriber(sessionId, ws)) {
        this.closeWith(ws, 1011, 'PTY ended during terminal-state replay');
        return;
      }

      this.logger.warn(
        'PtyWebSocketServer: replay gap restored from terminal-state snapshot',
        { sessionId, gap },
      );
      this.logger.info('PtyWebSocketServer: client attached', { sessionId, offset });
    } catch (error) {
      this.ptyHostService.removeSubscriber(sessionId, ws);
      this.logger.error(
        'PtyWebSocketServer: failed to serialize terminal-state replay',
        error instanceof Error ? error : new Error(String(error)),
        { sessionId },
      );
      this.closeWith(ws, 1011, 'failed to restore terminal state');
    }
  }

  private handleControl(sessionId: string, text: string, origin: WebSocket): void {
    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg && msg.type === 'resize') {
      const cols = Number(msg.cols);
      const rows = Number(msg.rows);
      if (Number.isFinite(cols) && Number.isFinite(rows)) {
        // `origin` lets the resize fan out a live size frame to every OTHER
        // subscriber of this PTY — a viewer that keeps its own geometry after a
        // peer resize renders the TUI's redraws corrupted (multi-viewer fight).
        this.ptyHostService.resize(sessionId, cols, rows, origin);
      }
    }
  }

  private parseSessionId(req: IncomingMessage): string | null {
    try {
      const url = new URL(req.url || '', 'http://localhost');
      return url.searchParams.get('sessionId');
    } catch {
      return null;
    }
  }

  /**
   * The raw byte offset the client last received (`?offset=`). Absent, negative,
   * or non-numeric values default to 0 (a fresh attach → full replay). getReplay
   * itself also treats an out-of-range offset as a fresh attach, so this only
   * needs to normalize the wire value into a non-negative integer.
   */
  private parseOffset(req: IncomingMessage): number {
    try {
      const url = new URL(req.url || '', 'http://localhost');
      const raw = url.searchParams.get('offset');
      if (raw === null) return 0;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  }

  private send(ws: WebSocket, data: string | Buffer): void {
    try {
      ws.send(data);
    } catch {
      // best effort; the socket's own close handler will detach it
    }
  }

  private closeWith(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // ignore
    }
  }
}
