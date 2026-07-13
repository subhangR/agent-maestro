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
 *                          "hasReplay": <bool>, "epoch"?: <string> }  (the resume handshake —
 *                          all offsets RAW; `next` is the authoritative offset the client snaps
 *                          its receive counter to, `gap` counts evicted bytes it must surface as
 *                          a truncation, `hasReplay` says whether a replay binary frame follows.
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

    // Tell the client the PTY's current dimensions BEFORE the replay so it can
    // size its terminal to the width the buffered output was authored at.
    // Without this the replay renders into a differently-sized xterm grid and
    // wraps at the wrong column (garbled history). Sent as a text control frame.
    const size = this.ptyHostService.getSize(sessionId);
    if (size) {
      this.send(ws, JSON.stringify({ type: 'size', cols: size.cols, rows: size.rows }));
    }

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

    if (replay.gap > 0) {
      // Honest, bounded loss: the client resumed from behind the retained window,
      // so some scrollback is gone for good. Make it visible in the logs.
      this.logger.warn(
        'PtyWebSocketServer: replay gap (scrollback evicted before resume offset)',
        { sessionId, gap: replay.gap },
      );
    }

    // One binary frame carrying the sanitized scrollback, iff there is any.
    if (hasReplay) {
      this.send(ws, replay.data);
    }

    // Now join the live stream. getReplay already gated existence, so this
    // cannot fail for a live session, but keep the guard honest.
    const attached = this.ptyHostService.addSubscriber(sessionId, ws);
    if (!attached) {
      this.closeWith(ws, 1011, 'no live PTY for session');
      return;
    }

    this.logger.info('PtyWebSocketServer: client attached', { sessionId, offset });

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (isBinary) {
        const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        this.ptyHostService.write(sessionId, buf);
        return;
      }
      // Text frame → control message
      const text = Array.isArray(data)
        ? Buffer.concat(data).toString('utf8')
        : Buffer.from(data as ArrayBuffer).toString('utf8');
      this.handleControl(sessionId, text);
    });

    ws.on('close', () => {
      this.ptyHostService.removeSubscriber(sessionId, ws);
      this.logger.info('PtyWebSocketServer: client detached', { sessionId });
    });

    ws.on('error', () => {
      this.ptyHostService.removeSubscriber(sessionId, ws);
    });
  }

  private handleControl(sessionId: string, text: string): void {
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
        this.ptyHostService.resize(sessionId, cols, rows);
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
