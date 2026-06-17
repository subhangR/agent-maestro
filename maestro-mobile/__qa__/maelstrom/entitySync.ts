// Maelstrom — fake entity-sync WebSocket server.
//
// Reproduces the WebSocketBridge surface a mobile client connects to
// (MOBILE_APP_BUILD_ANALYSIS.md §2.2): bare-origin WS (any path except /pty),
// ping→pong, subscribe/unsubscribe, and — the part no off-the-shelf mock gives
// you — the ARRAY (batched) vs SINGLE (immediate) framing.
//
// Phase-0 skeleton: framing + handshake are real; 50ms batch window, per-entity
// throttling, backpressure and the 50-client cap are stubbed/simplified and grow
// in later phases. The one thing held to full fidelity from day 0 is the
// array-vs-single dichotomy, because that is the canonical demux bug.

// `Server` is the server class in every ws major (8 also exports it as WebSocketServer).
import { Server as WebSocketServer, type WebSocket } from 'ws';
import { isImmediate, makeEnvelope, type WsEnvelope } from './envelopes';

export interface EntitySyncOptions {
  /** Batch flush window in ms. Real bridge = 50. */
  batchWindowMs?: number;
}

export class MaelstromEntitySync {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private pending: WsEnvelope[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly batchWindowMs: number;

  constructor(opts: EntitySyncOptions = {}) {
    this.batchWindowMs = opts.batchWindowMs ?? 50;
  }

  /** Attach to a noServer upgrade (shared HTTP port, routed by MaelstromServer). */
  attach(wss: WebSocketServer): void {
    this.wss = wss;
    wss.on('connection', (ws) => this.onConnection(ws));
  }

  private onConnection(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on('message', (raw) => this.onMessage(ws, raw.toString()));
    ws.on('close', () => this.clients.delete(ws));
  }

  // Client→server control frames: ping / subscribe / unsubscribe. The bridge does
  // NOT push heartbeats — it only replies to client pings (the app must ping).
  private onMessage(ws: WebSocket, raw: string): void {
    let msg: { type?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      case 'subscribe':
        // Phase-0: acknowledge but do not yet narrow the wire (filter fidelity is a
        // later-phase concern — the contract flags subscribe-filtering as unverified).
        ws.send(JSON.stringify({ type: 'subscribed' }));
        break;
      case 'unsubscribe':
        ws.send(JSON.stringify({ type: 'unsubscribed' }));
        break;
      default:
        break;
    }
  }

  /**
   * Emit a domain event. Immediate (bypass) events are sent NOW as a single
   * envelope object; everything else is buffered and flushed as a JSON array.
   */
  emit<T>(event: string, data: T, timestamp = 0): void {
    const env = makeEnvelope(event, data, timestamp);
    if (isImmediate(event)) {
      this.broadcast(JSON.stringify(env)); // single object, un-batched
      return;
    }
    this.pending.push(env);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.batchWindowMs);
    }
  }

  /** Force the pending buffer out as one array (tests use this to avoid timer waits). */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    this.broadcast(JSON.stringify(batch)); // ARRAY of envelopes
  }

  private broadcast(payload: string): void {
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }

  clientCount(): number {
    return this.clients.size;
  }

  close(): void {
    this.flush();
    for (const ws of this.clients) ws.close();
    this.clients.clear();
  }
}
