// services/realtime — the only import surface for the realtime layer.
//
// Two independent socket subsystems behind one module-scoped factory: the
// entity-sync client (one global socket → bare origin) and the per-session /pty
// transport. Neither lives in the React tree; the bootstrapper creates one
// Realtime once at app boot and calls start().

import { createEntitySyncClient } from './entitySync/EntitySyncClient';
import { createPtyTransport } from './pty/PtyTransport';
import { wireAppState } from './lifecycle/appState';
import { wireNetInfo } from './lifecycle/netinfo';
import type { CreateRealtimeOptions, Realtime } from './types';

export function createRealtime(opts: CreateRealtimeOptions): Realtime {
  const entitySync = createEntitySyncClient({
    getWsUrl: opts.getWsUrl,
    ledger: opts.ledger,
    pingIntervalMs: opts.pingIntervalMs,
  });

  const pty = createPtyTransport({ getPtyWsUrl: opts.getPtyWsUrl });

  let unwireAppState: (() => void) | null = null;
  let unwireNetInfo: (() => void) | null = null;

  return {
    entitySync,
    pty,
    start() {
      entitySync.connect();
      unwireAppState ??= wireAppState(entitySync);
      unwireNetInfo ??= wireNetInfo(entitySync);
    },
    stop() {
      unwireAppState?.();
      unwireNetInfo?.();
      unwireAppState = null;
      unwireNetInfo = null;
      entitySync.disconnect();
      pty.dispose();
    },
  };
}

export type {
  Realtime,
  CreateRealtimeOptions,
  RealtimeLedger,
  RealtimeStatus,
  EntitySyncClient,
  PtyTransport,
  PtySize,
  Unsubscribe,
} from './types';
