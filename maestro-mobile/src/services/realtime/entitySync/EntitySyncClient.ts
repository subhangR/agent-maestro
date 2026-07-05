// Entity-sync WebSocket client — one global socket to the bare server origin.
//
// Port of maestro-ui useMaestroStore.connectGlobal (:708) + handleMessage (:696).
// Owns: the singleton socket, the Array.isArray batched/immediate branch,
// backoff+jitter reconnect with a stale-socket guard, the app-level heartbeat,
// and the onopen full resync. Emits nothing to a store directly — it calls the
// injected Ledger seam.
//
// v1 has NO auth: connect straight to the bare origin (no path, no `?token=`).

import type { ProjectId } from '@/domain';
import type { EntitySyncClient, RealtimeLedger, RealtimeStatus } from '../types';
import { backoffDelay } from './reconnect';
import { createHeartbeat, type Heartbeat } from './heartbeat';
import { normalizeEvent } from './eventNormalizer';

// RN's global WebSocket message/close events are loosely typed; we only read the
// fields we use.
interface WsMessageEvent {
  data: unknown;
}
interface WsCloseEvent {
  code?: number;
  reason?: string;
}

export interface EntitySyncDeps {
  /** Returns the bare origin WS URL each connect (host can change at runtime). */
  getWsUrl: () => string;
  ledger: RealtimeLedger;
  pingIntervalMs?: number;
}

export function createEntitySyncClient(deps: EntitySyncDeps): EntitySyncClient {
  const { getWsUrl, ledger } = deps;

  let ws: WebSocket | null = null;
  let connecting = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;

  let activeProjectId: ProjectId | null = null;
  let status: RealtimeStatus = 'idle';
  const statusHandlers = new Set<(s: RealtimeStatus) => void>();

  const setStatus = (next: RealtimeStatus) => {
    if (next === status) return;
    status = next;
    for (const h of statusHandlers) h(next);
  };

  const heartbeat: Heartbeat = createHeartbeat({
    intervalMs: deps.pingIntervalMs,
    sendPing: () => {
      // Cheap text frame; server replies {type:'pong'}.
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // ignore send failures; the watchdog will catch a truly dead socket
        }
      }
    },
    onDead: () => {
      // Half-open socket detected by the watchdog → force a fresh connection.
      forceReconnect();
    },
  });

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const handleMessage = (event: WsMessageEvent) => {
    if (typeof event.data !== 'string') return; // entity-sync is JSON text only
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return; // best-effort: ignore malformed frames
    }

    // Heartbeat reply — not a domain event.
    if (!Array.isArray(parsed) && isPong(parsed)) {
      heartbeat.notifyPong();
      return;
    }

    // THE branch: a 50ms batched flush is a JSON array of envelopes; an
    // IMMEDIATE_EVENT is a single envelope object. Getting this wrong silently
    // drops half the stream.
    if (Array.isArray(parsed)) {
      const events = [];
      for (const raw of parsed) {
        const ev = normalizeEvent(raw);
        if (ev) events.push(ev);
      }
      if (events.length > 0) ledger.ingestBatch(events);
    } else {
      const ev = normalizeEvent(parsed);
      if (ev) ledger.ingestEvent(ev);
    }
  };

  const scheduleReconnect = () => {
    clearReconnectTimer();
    const delay = backoffDelay(reconnectAttempts);
    reconnectTimer = setTimeout(() => {
      reconnectAttempts++;
      connect();
    }, delay);
  };

  const connect = () => {
    if (connecting || (ws && ws.readyState === WebSocket.OPEN)) return;
    connecting = true;
    intentionalClose = false;
    setStatus('connecting');

    // Replace any lingering socket before opening a new one.
    if (ws) {
      try {
        ws.close();
      } catch {
        /* noop */
      }
      ws = null;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(getWsUrl());
    } catch {
      connecting = false;
      setStatus('disconnected');
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.onopen = () => {
      connecting = false;
      reconnectAttempts = 0;
      setStatus('connected');
      heartbeat.start();
      // Full resync: a reconnect is authoritative — events dropped while down
      // are recovered by re-fetching the active project, not by replay.
      void ledger.resyncProject(activeProjectId);
    };

    socket.onmessage = handleMessage as (ev: WsMessageEvent) => void;

    socket.onerror = () => {
      // onclose follows; reconnect is scheduled there.
    };

    socket.onclose = (ev: WsCloseEvent) => {
      // Stale-socket guard: if this socket was already replaced, ignore its late
      // close so we don't null out the live socket or schedule a spurious
      // reconnect (which would multiply prompt_send fan-out — desktop's :746 bug).
      if (ws !== socket) return;
      void ev;

      heartbeat.stop();
      connecting = false;
      ws = null;
      setStatus('disconnected');

      if (intentionalClose) {
        intentionalClose = false;
        return;
      }
      scheduleReconnect();
    };
  };

  const disconnect = () => {
    intentionalClose = true;
    clearReconnectTimer();
    heartbeat.stop();
    reconnectAttempts = 0;
    if (ws) {
      const socket = ws;
      ws = null; // null first so the guard in onclose drops the late event
      try {
        socket.close();
      } catch {
        /* noop */
      }
    }
    connecting = false;
    setStatus('idle');
  };

  const forceReconnect = () => {
    // Drop the current socket without backoff and connect fresh.
    clearReconnectTimer();
    heartbeat.stop();
    if (ws) {
      const socket = ws;
      ws = null; // stale-guard drops its onclose
      try {
        socket.close();
      } catch {
        /* noop */
      }
    }
    connecting = false;
    reconnectAttempts = 0;
    connect();
  };

  return {
    connect,
    disconnect,
    forceReconnect,
    setActiveProject: (id) => {
      activeProjectId = id;
    },
    getActiveProject: () => activeProjectId,
    getStatus: () => status,
    onStatus: (handler) => {
      statusHandlers.add(handler);
      return () => {
        statusHandlers.delete(handler);
      };
    },
  };
}

function isPong(parsed: unknown): boolean {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { type?: unknown }).type === 'pong'
  );
}
