import type { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { ILogger } from '../../domain/common/ILogger';
import { PtyHostService } from '../../application/services/PtyHostService';

/**
 * Dedicated WebSocket channel for live PTY streaming, separate from the main
 * WebSocketBridge so terminal bytes never hit its JSON framing, 50ms batching,
 * per-entity throttling, or 1MB buffer cap.
 *
 * Protocol (one socket per session, connect to `/pty?sessionId=<id>`):
 *  - server -> client: text frame    = JSON control message, currently:
 *                        { "type": "size", "cols": <n>, "rows": <n> }  (sent once on attach,
 *                          before the replay, so the client can match the PTY width)
 *                      binary frames  = raw PTY output (scrollback replayed on connect)
 *  - client -> server: binary frame  = keystroke bytes (written to the PTY)
 *                      text frame     = JSON control message, currently:
 *                        { "type": "resize", "cols": <n>, "rows": <n> }
 */
export class PtyWebSocketServer {
  constructor(
    private readonly wss: WebSocketServer,
    private readonly ptyHostService: PtyHostService,
    private readonly logger: ILogger,
  ) {
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const sessionId = this.parseSessionId(req);
    if (!sessionId) {
      this.closeWith(ws, 1008, 'missing sessionId');
      return;
    }

    ws.binaryType = 'nodebuffer';

    // Tell the client the PTY's current dimensions BEFORE the scrollback replay
    // so it can size its terminal to the width the buffered output was authored
    // at. Without this the replay renders into a differently-sized xterm grid
    // and wraps at the wrong column (garbled history). Sent as a text frame so
    // the client decodes it as a control message, not raw PTY bytes.
    const size = this.ptyHostService.getSize(sessionId);
    if (size) {
      try {
        ws.send(JSON.stringify({ type: 'size', cols: size.cols, rows: size.rows }));
      } catch {
        // best effort
      }
    }

    const attached = this.ptyHostService.addSubscriber(sessionId, ws);
    if (!attached) {
      this.closeWith(ws, 1011, 'no live PTY for session');
      return;
    }

    this.logger.info('PtyWebSocketServer: client attached', { sessionId });

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

  private closeWith(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // ignore
    }
  }
}
