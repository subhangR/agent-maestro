import { WebSocketServer, WebSocket } from 'ws';
import { IEventBus } from '../../domain/events/IEventBus';
import { ILogger } from '../../domain/common/ILogger';
import { EventName, TypedEventMap } from '../../domain/events/DomainEvents';

/**
 * Maximum send buffer size before a client is considered backpressured.
 * Clients exceeding this threshold have messages dropped until they catch up.
 */
const MAX_BUFFER_BYTES = 1024 * 1024; // 1MB

/**
 * Events that must be delivered immediately (not batched).
 * These trigger time-sensitive side effects like terminal spawning or PTY writes.
 */
const IMMEDIATE_EVENTS = new Set<string>([
  'session:spawn',
  'session:resume',
  'session:prompt_send',
  'session:modal',
  'session:modal_action',
  'session:modal_closed',
  'spell:invoked',
  'spell:activated',
  'spell:deactivated',
  // Ensemble lifecycle is low-volume and UI must repaint rings immediately
  // when an ensemble is created/updated/disbanded.
  'ensemble:created',
  'ensemble:updated',
  'ensemble:disbanded',
  'ensemble:message',
]);

/** Subscription filter for per-client event filtering. */
interface SubscriptionFilter {
  sessionIds?: Set<string>;
  projectId?: string;
  taskIds?: Set<string>;
}

/**
 * Bridges domain events to WebSocket clients.
 * Features: message batching (50ms), per-entity throttling, backpressure handling,
 * extended subscription filtering, and EventBus decoupling via queueMicrotask.
 *
 * Clients can send a `subscribe` message with `sessionIds`, `projectId`, and/or
 * `taskIds` to receive only matching events. Clients without a subscription
 * receive ALL events (backward compatible).
 */
export class WebSocketBridge {
  private logger: ILogger;
  /** Per-client subscription filters. Clients not in this map get all events. */
  private subscriptions = new Map<WebSocket, SubscriptionFilter>();
  /** Stored handler references for cleanup during shutdown. */
  private handlers = new Map<string, (data: any) => void>();

  // --- Batching ---
  private pendingMessages: Array<{ event: string; data: any }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_WINDOW_MS = 50;

  // --- Per-entity throttling ---
  private lastQueued = new Map<string, { time: number; data: any }>();
  private readonly THROTTLE_MS: Record<string, number> = {
    'session:updated': 500,          // Max 2/sec per session
    'session:status_changed': 500,   // Same throttle for lightweight status events
    'session:mode_changed': 200,     // Mode flips are user-driven; light throttling
    'task:updated': 300,             // Max ~3/sec per task
    'notify:progress': 1000,         // Max 1/sec per session
  };

  // --- Backpressure ---
  private backpressuredClients = new Map<WebSocket, number>();

  constructor(
    private wss: WebSocketServer,
    private eventBus: IEventBus,
    logger: ILogger
  ) {
    this.logger = logger;
    this.setupEventHandlers();
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      ws.on('close', (code, reason) => {
        this.subscriptions.delete(ws);
        this.backpressuredClients.delete(ws);
      });

      ws.on('error', (error) => {
        this.subscriptions.delete(ws);
        this.backpressuredClients.delete(ws);
        this.logger.error('WebSocket client error:', error);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (err) {
          this.logger.warn('Failed to parse WebSocket message');
        }
      });
    });
  }

  private handleClientMessage(ws: WebSocket, message: any): void {
    // Handle ping/pong
    if (message.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      return;
    }

    // Handle subscribe — client wants events filtered
    if (message.type === 'subscribe') {
      const sub: SubscriptionFilter = {};
      if (Array.isArray(message.sessionIds)) {
        sub.sessionIds = new Set(message.sessionIds.filter((id: any) => typeof id === 'string'));
      }
      if (typeof message.projectId === 'string') {
        sub.projectId = message.projectId;
      }
      if (Array.isArray(message.taskIds)) {
        sub.taskIds = new Set(message.taskIds.filter((id: any) => typeof id === 'string'));
      }
      this.subscriptions.set(ws, sub);
      ws.send(JSON.stringify({
        type: 'subscribed',
        ...(sub.sessionIds ? { sessionIds: [...sub.sessionIds] } : {}),
        ...(sub.projectId ? { projectId: sub.projectId } : {}),
        ...(sub.taskIds ? { taskIds: [...sub.taskIds] } : {}),
        timestamp: Date.now(),
      }));
      return;
    }

    // Handle unsubscribe — client goes back to receiving all events
    if (message.type === 'unsubscribe') {
      this.subscriptions.delete(ws);
      ws.send(JSON.stringify({ type: 'unsubscribed', timestamp: Date.now() }));
      return;
    }

    // Log other messages (but filter out high-frequency ones)
    const isHighFrequency = ['heartbeat', 'keepalive'].includes(message.type);
    if (!isHighFrequency) {
      this.logger.debug('Received WebSocket message', { type: message.type });
    }
  }

  private setupEventHandlers(): void {
    // List of all domain events to bridge
    const events: EventName[] = [
      'project:created',
      'project:updated',
      'project:deleted',
      'task:created',
      'task:updated',
      'task:deleted',
      'task:session_added',
      'task:session_removed',
      'session:created',
      'session:spawn',
      'session:resume',
      'session:updated',
      'session:status_changed',
      'session:mode_changed',
      'session:deleted',
      'session:task_added',
      'session:task_removed',
      // Notification events
      'notify:task_completed',
      'notify:task_failed',
      'notify:task_in_review',
      'notify:task_blocked',
      'notify:task_session_completed',
      'notify:task_session_failed',
      'notify:session_completed',
      'notify:session_failed',
      'notify:needs_input',
      'notify:progress',
      'session:modal',
      'session:modal_action',
      'session:modal_closed',
      'session:prompt_send',
      // Team member events
      'team_member:created',
      'team_member:updated',
      'team_member:deleted',
      'team_member:archived',
      // Spell events
      'spell:invoked',
      'spell:activated',
      'spell:deactivated',
      // Ensemble events (P4)
      'ensemble:created',
      'ensemble:updated',
      'ensemble:disbanded',
      'ensemble:message',
      'custom_prompt:created',
      'custom_prompt:updated',
      'custom_prompt:deleted',
      // Model profile events (workspace-global)
      'model_profile:created',
      'model_profile:updated',
      'model_profile:deleted',
      // Task list events
      'task_list:created',
      'task_list:updated',
      'task_list:reordered',
      'task_list:deleted',
      // Task graph events
      'task_graph:created',
      'task_graph:updated',
      'task_graph:deleted',
    ];

    // Subscribe to each event, deferring via queueMicrotask to avoid blocking emit()
    for (const event of events) {
      const handler = (data: any) => {
        queueMicrotask(() => {
          if (IMMEDIATE_EVENTS.has(event)) {
            this.broadcastImmediate(event, data);
          } else {
            this.queueBroadcast(event, data);
          }
        });
      };
      this.handlers.set(event, handler);
      this.eventBus.on(event, handler);
    }

    this.logger.info(`WebSocket bridge subscribed to ${events.length} events`);
  }

  /**
   * Queue a message for batched delivery. Applies per-entity throttling.
   */
  private queueBroadcast(event: string, data: any): void {
    const throttleMs = this.THROTTLE_MS[event];
    if (throttleMs) {
      const entityId = data?.id || data?.sessionId || data?.taskId || '';
      const key = `${event}:${entityId}`;
      const now = Date.now();
      const last = this.lastQueued.get(key);
      if (last && now - last.time < throttleMs) {
        // Replace pending data with latest (so flush sends newest state)
        last.data = data;
        const idx = this.pendingMessages.findIndex(
          (m) => m.event === event && (m.data?.id || m.data?.sessionId || m.data?.taskId) === entityId
        );
        if (idx >= 0) this.pendingMessages[idx].data = data;
        return;
      }
      this.lastQueued.set(key, { time: now, data });
    }

    this.pendingMessages.push({ event, data });
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushBatch(), this.BATCH_WINDOW_MS);
    }
  }

  /**
   * Flush pending messages to all connected clients as a batched array.
   */
  private flushBatch(): void {
    this.flushTimer = null;
    if (this.pendingMessages.length === 0) return;

    const batch = this.pendingMessages;
    this.pendingMessages = [];
    const now = Date.now();

    this.wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) {
        this.subscriptions.delete(client);
        this.backpressuredClients.delete(client);
        return;
      }

      // Backpressure check
      if ((client as any).bufferedAmount > MAX_BUFFER_BYTES) {
        this.logger.warn('Skipping slow WebSocket client', {
          buffered: (client as any).bufferedAmount,
        });
        if (!this.backpressuredClients.has(client)) {
          this.backpressuredClients.set(client, now);
        } else if (now - this.backpressuredClients.get(client)! > 30_000) {
          this.logger.warn('Terminating persistently slow WebSocket client');
          client.terminate();
          this.backpressuredClients.delete(client);
          this.subscriptions.delete(client);
        }
        return;
      }

      // Client is sending fine — clear backpressure tracking
      this.backpressuredClients.delete(client);

      const sub = this.subscriptions.get(client);
      const clientMessages = sub
        ? batch.filter((m) => !this.shouldFilterOut(m.event, m.data, sub))
        : batch;

      if (clientMessages.length === 0) return;

      const payload = JSON.stringify(
        clientMessages.map((m) => ({
          type: m.event,
          event: m.event,
          data: m.data,
          timestamp: now,
        }))
      );
      client.send(payload);
    });

    // Prune stale throttle entries (older than 10s)
    const cutoff = now - 10_000;
    for (const [key, entry] of this.lastQueued) {
      if (entry.time < cutoff) this.lastQueued.delete(key);
    }
  }

  /**
   * Send an event immediately to all matching clients (bypasses batching).
   * Used for time-sensitive events like session:spawn and session:prompt_send.
   */
  private broadcastImmediate(event: string, data: any): void {
    if (this.wss.clients.size === 0) return;

    const message = JSON.stringify({
      type: event,
      event,
      data,
      timestamp: Date.now(),
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) {
        this.subscriptions.delete(client);
        return;
      }

      // Still skip backpressured clients even for immediate events
      if ((client as any).bufferedAmount > MAX_BUFFER_BYTES) return;

      const sub = this.subscriptions.get(client);
      if (sub && this.shouldFilterOut(event, data, sub)) return;

      client.send(message);
    });
  }

  /**
   * Determine if an event should be filtered out for a specific client subscription.
   * Returns true if the event should be skipped.
   */
  private shouldFilterOut(event: string, data: any, sub: SubscriptionFilter): boolean {
    // Session events — filter by sessionIds
    if (event.startsWith('session:')) {
      const sessionId = data?.sessionId || data?.id || data?.session?.id;
      if (sub.sessionIds && sessionId && !sub.sessionIds.has(sessionId)) return true;
      return false;
    }

    // Task events — filter by taskIds if specified, or projectId
    if (event.startsWith('task:')) {
      const taskId = data?.taskId || data?.id;
      if (sub.taskIds && taskId && !sub.taskIds.has(taskId)) return true;
      if (sub.projectId && data?.projectId && data.projectId !== sub.projectId) return true;
      return false;
    }

    // Team member / project / team events — filter by projectId
    if (event.startsWith('team_member:') || event.startsWith('project:') || event.startsWith('team:')) {
      if (sub.projectId && data?.projectId && data.projectId !== sub.projectId) return true;
      return false;
    }

    // Spell events — filter by target sessionId (invoked) or sessionIds[] (activated/deactivated)
    if (event.startsWith('spell:')) {
      if (!sub.sessionIds) return false;
      const targetIds: string[] = Array.isArray(data?.sessionIds)
        ? data.sessionIds
        : data?.targetSessionId
          ? [data.targetSessionId]
          : [];
      if (targetIds.length === 0) return false;
      return !targetIds.some((id) => sub.sessionIds!.has(id));
    }

    // Custom prompt events — pass through to all clients (global)
    if (event.startsWith('custom_prompt:')) {
      return false;
    }

    // Model profile events — workspace-global, pass through to all clients
    if (event.startsWith('model_profile:')) {
      return false;
    }

    // Notify events — filter by sessionId if available
    if (event.startsWith('notify:')) {
      const sessionId = data?.sessionId;
      if (sub.sessionIds && sessionId && !sub.sessionIds.has(sessionId)) return true;
      return false;
    }

    return false; // Unknown events pass through
  }

  /**
   * Shut down the bridge: remove all event bus listeners, clear timers, and clear subscriptions.
   */
  shutdown(): void {
    // Clear batching timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Flush remaining messages
    if (this.pendingMessages.length > 0) {
      this.flushBatch();
    }

    for (const [event, handler] of this.handlers) {
      this.eventBus.off(event, handler);
    }
    this.handlers.clear();
    this.subscriptions.clear();
    this.backpressuredClients.clear();
    this.lastQueued.clear();
    this.pendingMessages = [];
    this.logger.info('WebSocketBridge shut down');
  }

  /**
   * Get the count of connected clients.
   */
  getClientCount(): number {
    return this.wss.clients.size;
  }

  /**
   * Get status of all connected clients.
   */
  getClientStatus(): Array<{ readyState: number; readyStateText: string }> {
    const clients: Array<{ readyState: number; readyStateText: string }> = [];
    this.wss.clients.forEach((client) => {
      clients.push({
        readyState: client.readyState,
        readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][client.readyState] ?? 'UNKNOWN'
      });
    });
    return clients;
  }
}
