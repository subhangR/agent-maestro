// Phase-1 adversarial contract gate (Sentinel).
//
// Drives the REAL Phase-1 modules — not mocks of them — to prove the contract
// points that "tsc passes" and per-member unit tests do NOT prove:
//   1. Array.isArray demux DRAIN of a mixed [array, single, array] sequence
//      through the real socket onmessage handler (the canonical drop-half bug).
//   2. Reconnect resync-on-open: onopen triggers resyncProject(activeProject).
//   3. App-level ping survival: the client pings on its own (server never does)
//      and survives an idle interval once a pong is seen.
//   4. Zero-auth on the WS URL: bare origin, no path, no ?token=, and the client
//      sends NO subscribe/auth handshake (only pings).
//   5. Zero-auth on REST: MaestroClient sends no Authorization, Cookie, or
//      credentials:'include'.
//
// The EntitySyncClient uses the global `WebSocket`; we stub it with a fake we can
// drive deterministically (capture URL, fire onopen/onmessage, observe send()).

import { createEntitySyncClient } from '@/services/realtime/entitySync/EntitySyncClient';
import { MaestroClient, buildServerConfig } from '@/services/api';
import type { RealtimeEvent, RealtimeLedger } from '@/services/realtime';
import { setMaestroClient, fetchTeams, useEntityStore, resetEntities } from '@/state';

// --- Fake WebSocket -------------------------------------------------------

type Listener = ((arg: unknown) => void) | null;

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  url: string;
  readyState = FakeWebSocket.OPEN;
  onopen: Listener = null;
  onmessage: Listener = null;
  onclose: Listener = null;
  onerror: Listener = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3; // CLOSED
  }

  // test drivers
  fireOpen() {
    this.onopen?.(undefined);
  }
  fireMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
  fireClose(code = 1006) {
    this.onclose?.({ code });
  }
}

function installFakeWs() {
  FakeWebSocket.instances = [];
  (global as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
}

// A ledger spy that records each call so we can assert demux dispatch.
function makeLedgerSpy() {
  const batches: RealtimeEvent[][] = [];
  const singles: RealtimeEvent[] = [];
  const resyncs: (string | null)[] = [];
  const ledger: RealtimeLedger = {
    ingestBatch: (events) => batches.push(events),
    ingestEvent: (event) => singles.push(event),
    resyncProject: (projectId) => {
      resyncs.push(projectId as string | null);
    },
  };
  return { ledger, batches, singles, resyncs };
}

const evt = (event: string, id: string) => ({
  type: event,
  event,
  data: { id },
  timestamp: 1,
});

describe('Phase-1 contract — entity-sync WS', () => {
  afterEach(() => {
    jest.clearAllTimers(); // stop the heartbeat interval before swapping clocks
    jest.useRealTimers();
  });

  it('demux DRAINS a mixed [array, single, array] sequence (no dropped half)', () => {
    installFakeWs();
    const { ledger, batches, singles } = makeLedgerSpy();
    const client = createEntitySyncClient({ getWsUrl: () => 'ws://host:4569', ledger });
    client.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.fireOpen();

    // [array] → ingestBatch
    ws.fireMessage([evt('task:updated', 'a'), evt('task:created', 'b')]);
    // single object → ingestEvent (NOT ingestBatch)
    ws.fireMessage(evt('session:spawn', 'c'));
    // [array] again → ingestBatch
    ws.fireMessage([evt('task:updated', 'd')]);

    // The canonical bug (reading parsed.type, ignoring Array.isArray) would route
    // the arrays through the single path and drop their members. Assert the split.
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(1);
    expect(singles).toHaveLength(1);
    expect(singles[0]!.event).toBe('session:spawn');
  });

  it('does a full resync on (re)open, scoped to the active project', () => {
    installFakeWs();
    const { ledger, resyncs } = makeLedgerSpy();
    const client = createEntitySyncClient({ getWsUrl: () => 'ws://host:4569', ledger });
    client.setActiveProject('proj_42' as never);
    client.connect();
    FakeWebSocket.instances[0]!.fireOpen();
    expect(resyncs).toEqual(['proj_42']);
  });

  it('connects to the BARE origin with zero auth and sends no handshake', () => {
    installFakeWs();
    const { ledger } = makeLedgerSpy();
    const client = createEntitySyncClient({ getWsUrl: () => 'ws://192.168.1.5:4569', ledger });
    client.connect();
    const ws = FakeWebSocket.instances[0]!;
    // bare origin: scheme+host+port only, no path, no query/token.
    expect(ws.url).toBe('ws://192.168.1.5:4569');
    expect(ws.url).not.toContain('/pty');
    expect(ws.url).not.toContain('token');
    expect(ws.url).not.toContain('?');
    ws.fireOpen();
    // No subscribe/auth frame on connect (matches useMaestroStore's no-subscribe).
    expect(ws.sent).toHaveLength(0);
  });

  it('pings on its own interval and survives once a pong is seen', () => {
    jest.useFakeTimers();
    installFakeWs();
    const { ledger } = makeLedgerSpy();
    const client = createEntitySyncClient({
      getWsUrl: () => 'ws://host:4569',
      ledger,
      pingIntervalMs: 20_000,
    });
    client.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.fireOpen();

    // One interval → exactly one app ping (server pushes none).
    jest.advanceTimersByTime(20_000);
    expect(ws.sent).toEqual([JSON.stringify({ type: 'ping' })]);

    // Server replies pong → client clears the outstanding-ping flag.
    ws.fireMessage({ type: 'pong' });

    // Next interval: still the SAME live socket (not reaped), pings again.
    jest.advanceTimersByTime(20_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
    expect(ws.sent).toHaveLength(2);
  });

  it('force-reconnects when a ping goes unanswered (half-open socket)', () => {
    jest.useFakeTimers();
    installFakeWs();
    const { ledger } = makeLedgerSpy();
    const client = createEntitySyncClient({
      getWsUrl: () => 'ws://host:4569',
      ledger,
      pingIntervalMs: 20_000,
    });
    client.connect();
    FakeWebSocket.instances[0]!.fireOpen();

    jest.advanceTimersByTime(20_000); // ping sent, awaiting pong
    jest.advanceTimersByTime(20_000); // no pong → onDead → forceReconnect → new socket
    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Phase-1 contract — REST zero-auth', () => {
  it('MaestroClient sends no Authorization, Cookie, or credentials', async () => {
    const captured: { url: string; init?: RequestInit }[] = [];
    const fakeFetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => '[]',
      } as Response;
    });
    const orig = global.fetch;
    global.fetch = fakeFetch as unknown as typeof fetch;
    try {
      const client = new MaestroClient(buildServerConfig('192.168.1.5:4569'));
      await client.getProjects();
    } finally {
      global.fetch = orig;
    }

    expect(captured).toHaveLength(1);
    const { url, init } = captured[0]!;
    expect(url).toContain('/api/projects');
    expect(url).not.toContain('token'); // no ?token= in v1
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    expect(headers.has('authorization')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
    expect(init?.credentials).not.toBe('include');
  });
});

describe('Phase-1 contract — teams are REST-poll (not WS)', () => {
  afterEach(() => resetEntities());

  it('fetchTeams sources teams from REST, not the entity-sync stream', async () => {
    // team:* events are declared-but-NOT-broadcast (domain/contracts/ws.ts §177),
    // so team state must come from a REST fetch — never a WS push.
    const team = { id: 'team_1', name: 'Alpha', projectId: 'proj_1' };
    const getTeams = jest.fn(async () => [team]);
    setMaestroClient({ getTeams } as never);

    await fetchTeams('proj_1');

    expect(getTeams).toHaveBeenCalledWith('proj_1');
    expect(Object.keys(useEntityStore.getState().teams)).toContain('team_1');
  });
});
