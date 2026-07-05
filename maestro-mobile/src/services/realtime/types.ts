// Public + internal types for the realtime layer.
//
// Re-exports the domain wire contracts (the single source of truth) and adds
// the local interfaces Pulse owns: the Ledger seam, the PTY transport surface,
// and the entity-sync status model. `services/realtime` depends on `@/domain`
// only — never `@/services/api` or `@/state` (acyclic; the Ledger is injected,
// not imported).

import type { ProjectId, SessionId } from '@/domain';
import type { RealtimeEvent, WsEnvelope } from '@/domain';

export type { RealtimeEvent, WsEnvelope };

// ---------------------------------------------------------------------------
// Ledger seam (injected — realtime never imports @/state)
// ---------------------------------------------------------------------------

/**
 * The slice of Ledger the realtime layer calls. The bootstrapper passes a
 * concrete implementation; realtime stays free of any `@/state` import so the
 * dependency direction (state → realtime is forbidden) is enforced by code, not
 * convention. Pulse never touches the store's `set` — it hands Ledger
 * normalized events and lets Ledger coalesce them into one render.
 */
export interface RealtimeLedger {
  /** A batched flush: the whole array coalesces under Ledger's one microtask. */
  ingestBatch(events: RealtimeEvent[]): void;
  /** A single immediate (un-batched) event. */
  ingestEvent(event: RealtimeEvent): void;
  /** Full re-fetch of the active project on (re)connect. No-op if id is null. */
  resyncProject(projectId: ProjectId | null): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Entity-sync client
// ---------------------------------------------------------------------------

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface EntitySyncClient {
  /** Idempotent: no-ops if already connecting or open. */
  connect(): void;
  /** Intentional teardown: clears reconnect timer, stops heartbeat. */
  disconnect(): void;
  /** Tears the current socket down and reconnects immediately (no backoff). */
  forceReconnect(): void;
  /** Sets the project whose entities are re-fetched on every `onopen` resync. */
  setActiveProject(id: ProjectId | null): void;
  getActiveProject(): ProjectId | null;
  getStatus(): RealtimeStatus;
  /** Subscribe to status transitions. Returns an unsubscribe fn. */
  onStatus(handler: (status: RealtimeStatus) => void): () => void;
}

// ---------------------------------------------------------------------------
// PTY transport (ratified with Relay)
// ---------------------------------------------------------------------------

export interface PtySize {
  cols: number;
  rows: number;
}

export type Unsubscribe = () => void;

/**
 * Per-session terminal transport over `/pty?sessionId=<id>`. Pulse owns the
 * socket, framing, the single per-session streaming UTF-8 decoder (→ pre-decoded
 * STRING), and the send-before-open queue. Relay owns the renderer and the
 * (lazy) attach policy — this surface is pure mechanism.
 *
 * Handlers register PER session id and receive only that session's data, which
 * fits Relay's per-session WebView renderers (no client-side id filtering).
 */
export interface PtyTransport {
  /** Open (or reuse) the socket for a session. Idempotent. */
  attach(id: SessionId): void;
  /** Close the socket. The server PTY keeps running and is re-attachable. */
  detach(id: SessionId): void;
  /** Send raw keystroke bytes (UTF-8 text and/or control sequences). */
  write(id: SessionId, bytes: Uint8Array): void;
  /** Send a resize control frame. Queued if the socket isn't open yet. */
  resize(id: SessionId, cols: number, rows: number): void;
  /** Pre-decoded terminal output for this session. */
  onOutput(id: SessionId, handler: (text: string) => void): Unsubscribe;
  /** Server-announced terminal size for this session. */
  onSize(id: SessionId, handler: (size: PtySize) => void): Unsubscribe;
  /** Process exit (real exit frame) or `null` (1011 = no live PTY / needs resume). */
  onExit(id: SessionId, handler: (code: number | null) => void): Unsubscribe;
  /** Tear down every session socket (used on full realtime stop). */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Public surface (createRealtime)
// ---------------------------------------------------------------------------

export interface CreateRealtimeOptions {
  /** Bare origin WS URL, e.g. `ws://host:port` (NO path, NO `?token=` in v1). */
  getWsUrl: () => string;
  /** PTY WS URL, e.g. `ws://host:port/pty` (sessionId appended by the transport). */
  getPtyWsUrl: () => string;
  /** Injected Ledger seam. */
  ledger: RealtimeLedger;
  /** App-level ping interval (ms). Default 20000. */
  pingIntervalMs?: number;
}

export interface Realtime {
  entitySync: EntitySyncClient;
  pty: PtyTransport;
  /** Connect entity-sync and wire AppState/NetInfo reconnect drivers. */
  start(): void;
  /** Disconnect, dispose PTY sockets, and remove lifecycle listeners. */
  stop(): void;
}
