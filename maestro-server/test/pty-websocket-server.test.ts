import { EventEmitter } from 'events';
import { PtyWebSocketServer } from '../src/infrastructure/websocket/PtyWebSocketServer';

type SentFrame = { kind: 'text' | 'binary'; data: string | Buffer };

/** Minimal ws stand-in: an emitter that records what the server sent. */
class FakeWs extends EventEmitter {
  readyState = 1;
  binaryType = '';
  isAlive?: boolean;
  sent: SentFrame[] = [];
  closes: Array<{ code: number; reason: string }> = [];
  terminated = 0;
  pings = 0;

  send(data: string | Buffer): void {
    this.sent.push({ kind: typeof data === 'string' ? 'text' : 'binary', data });
  }
  close(code: number, reason: string): void {
    this.closes.push({ code, reason });
  }
  terminate(): void {
    this.terminated++;
  }
  ping(): void {
    this.pings++;
  }

  textFrames(): any[] {
    return this.sent.filter((f) => f.kind === 'text').map((f) => JSON.parse(f.data as string));
  }
  binaryFrames(): Buffer[] {
    return this.sent.filter((f) => f.kind === 'binary').map((f) => f.data as Buffer);
  }
}

class FakeWss extends EventEmitter {
  clients = new Set<FakeWs>();
}

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} } as any;

function makeHost(overrides: Partial<Record<string, any>> = {}) {
  return {
    getReplay: jest.fn().mockReturnValue({ base: 0, gap: 0, next: 0, data: Buffer.alloc(0) }),
    getSize: jest.fn().mockReturnValue(null),
    // Absent stream epoch by default: the attached frame stays back-compatible
    // (no `epoch` key) so pre-#151 assertions hold. Epoch-aware tests override this.
    getEpoch: jest.fn().mockReturnValue(undefined),
    getStateSnapshot: jest.fn().mockResolvedValue({
      next: 0,
      data: Buffer.from('\u001bc'),
      cols: 80,
      rows: 24,
    }),
    addSubscriber: jest.fn().mockReturnValue(true),
    addPendingSubscriber: jest.fn().mockReturnValue(true),
    activatePendingSubscriber: jest.fn().mockReturnValue(true),
    removeSubscriber: jest.fn(),
    write: jest.fn(),
    resize: jest.fn(),
    ...overrides,
  };
}

function connect(wss: FakeWss, url: string): FakeWs {
  const ws = new FakeWs();
  wss.clients.add(ws);
  wss.emit('connection', ws, { url });
  return ws;
}

const flushAsyncAttach = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('PtyWebSocketServer', () => {
  let wss: FakeWss;
  let host: any;
  let server: PtyWebSocketServer | undefined;

  beforeEach(() => {
    wss = new FakeWss();
    server = undefined;
  });

  afterEach(() => {
    // #140 owns the heartbeat: tear its interval down so it never leaks across tests.
    server?.shutdown();
  });

  function start(h: any, logger: any = noopLogger): PtyWebSocketServer {
    server = new PtyWebSocketServer(wss as any, h as any, logger);
    return server;
  }

  it('closes with 1008 when sessionId is missing', () => {
    host = makeHost();
    start(host);
    const ws = connect(wss, '/pty');
    expect(ws.closes).toEqual([{ code: 1008, reason: 'missing sessionId' }]);
    expect(host.getReplay).not.toHaveBeenCalled();
  });

  it('closes with 1011 when there is no live PTY for the session', () => {
    host = makeHost({ getReplay: jest.fn().mockReturnValue(null) });
    start(host);
    const ws = connect(wss, '/pty?sessionId=ghost');
    expect(ws.closes).toEqual([{ code: 1011, reason: 'no live PTY for session' }]);
    expect(host.addSubscriber).not.toHaveBeenCalled();
  });

  it('sends size → attached → replay in order, then subscribes to the live stream', () => {
    host = makeHost({
      getSize: jest.fn().mockReturnValue({ cols: 120, rows: 40 }),
      getReplay: jest
        .fn()
        .mockReturnValue({ base: 10, gap: 0, next: 17, data: Buffer.from('history', 'utf8') }),
    });
    start(host);
    const ws = connect(wss, '/pty?sessionId=s1&offset=10');

    // Ordering: text(size), text(attached), binary(replay)
    expect(ws.sent.map((f) => f.kind)).toEqual(['text', 'text', 'binary']);
    const [size, attached] = ws.textFrames();
    expect(size).toEqual({ type: 'size', cols: 120, rows: 40 });
    expect(attached).toEqual({ type: 'attached', base: 10, gap: 0, next: 17, hasReplay: true });
    expect(ws.binaryFrames()[0].toString('utf8')).toBe('history');

    expect(host.getReplay).toHaveBeenCalledWith('s1', 10);
    expect(host.addSubscriber).toHaveBeenCalledWith('s1', ws);
    expect(ws.closes).toEqual([]);
  });

  it('sends attached with hasReplay:false and NO binary frame when the client is caught up', () => {
    host = makeHost({
      getReplay: jest.fn().mockReturnValue({ base: 5, gap: 0, next: 5, data: Buffer.alloc(0) }),
    });
    start(host);
    const ws = connect(wss, '/pty?sessionId=s1&offset=5');

    expect(ws.sent.map((f) => f.kind)).toEqual(['text']); // attached only, no replay
    const attached = ws.textFrames().find((f) => f.type === 'attached');
    expect(attached).toEqual({ type: 'attached', base: 5, gap: 0, next: 5, hasReplay: false });
    expect(ws.binaryFrames()).toHaveLength(0);
    expect(host.addSubscriber).toHaveBeenCalledWith('s1', ws);
  });

  it('replaces an evicted raw suffix with a coherent terminal-state snapshot', async () => {
    host = makeHost({
      getReplay: jest
        .fn()
        .mockReturnValue({ base: 100, gap: 40, next: 200, data: Buffer.from('x', 'utf8') }),
      getStateSnapshot: jest.fn().mockResolvedValue({
        next: 200,
        data: Buffer.from('\u001bcsnapshot', 'utf8'),
        cols: 120,
        rows: 40,
      }),
    });
    start(host);
    const ws = connect(wss, '/pty?sessionId=s1&offset=60');
    await flushAsyncAttach();
    const attached = ws.textFrames().find((f) => f.type === 'attached');
    expect(attached).toEqual({
      type: 'attached',
      base: 200,
      gap: 40,
      next: 200,
      hasReplay: true,
      replayKind: 'snapshot',
    });
    expect(ws.textFrames()[0]).toEqual({ type: 'size', cols: 120, rows: 40 });
    expect(ws.binaryFrames()[0].toString('utf8')).toBe('\u001bcsnapshot');
    expect(host.addPendingSubscriber).toHaveBeenCalledWith('s1', ws);
    expect(host.activatePendingSubscriber).toHaveBeenCalledWith('s1', ws);
    expect(host.addSubscriber).not.toHaveBeenCalled();
  });

  it('logs a warning when an eviction gap is restored from a snapshot', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    host = makeHost({
      getReplay: jest
        .fn()
        .mockReturnValue({ base: 100, gap: 40, next: 200, data: Buffer.from('x', 'utf8') }),
    });
    start(host, logger);
    connect(wss, '/pty?sessionId=s1&offset=60');
    await flushAsyncAttach();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('replay gap'),
      expect.objectContaining({ sessionId: 's1', gap: 40 }),
    );
  });

  it('does NOT warn about a gap on a clean (gap-free) attach', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    host = makeHost({
      getReplay: jest.fn().mockReturnValue({ base: 0, gap: 0, next: 2, data: Buffer.from('hi', 'utf8') }),
    });
    start(host, logger);
    connect(wss, '/pty?sessionId=s1&offset=0');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('omits the size frame when the PTY size is unknown', () => {
    host = makeHost({
      getReplay: jest.fn().mockReturnValue({ base: 0, gap: 0, next: 0, data: Buffer.alloc(0) }),
    });
    start(host);
    const ws = connect(wss, '/pty?sessionId=s1');
    const kinds = ws.textFrames().map((f) => f.type);
    expect(kinds).toEqual(['attached']);
  });

  describe('stream epoch in the attached frame (#151)', () => {
    it('includes the epoch when the host has one for the session', () => {
      host = makeHost({
        getEpoch: jest.fn().mockReturnValue('boot9-3'),
        getReplay: jest
          .fn()
          .mockReturnValue({ base: 0, gap: 0, next: 4, data: Buffer.from('hiya', 'utf8') }),
      });
      start(host);
      const ws = connect(wss, '/pty?sessionId=s1&offset=0');

      const attached = ws.textFrames().find((f) => f.type === 'attached');
      expect(attached).toEqual({
        type: 'attached',
        base: 0,
        gap: 0,
        next: 4,
        hasReplay: true,
        epoch: 'boot9-3',
      });
      expect(host.getEpoch).toHaveBeenCalledWith('s1');
    });

    it('omits the epoch key entirely when the host has none (back-compatible frame)', () => {
      host = makeHost({
        getEpoch: jest.fn().mockReturnValue(undefined),
        getReplay: jest.fn().mockReturnValue({ base: 0, gap: 0, next: 0, data: Buffer.alloc(0) }),
      });
      start(host);
      const ws = connect(wss, '/pty?sessionId=s1');

      const attached = ws.textFrames().find((f) => f.type === 'attached');
      expect(attached).toEqual({ type: 'attached', base: 0, gap: 0, next: 0, hasReplay: false });
      expect(attached).not.toHaveProperty('epoch');
    });
  });

  describe('offset parsing', () => {
    it('defaults a missing offset to 0', () => {
      host = makeHost();
      start(host);
      connect(wss, '/pty?sessionId=s1');
      expect(host.getReplay).toHaveBeenCalledWith('s1', 0);
    });

    it('parses a valid offset', () => {
      host = makeHost();
      start(host);
      connect(wss, '/pty?sessionId=s1&offset=4096');
      expect(host.getReplay).toHaveBeenCalledWith('s1', 4096);
    });

    it('falls back to 0 for a non-numeric offset', () => {
      host = makeHost();
      start(host);
      connect(wss, '/pty?sessionId=s1&offset=nope');
      expect(host.getReplay).toHaveBeenCalledWith('s1', 0);
    });
  });

  describe('protocol heartbeat reaps phantom subscribers (#150)', () => {
    // The ws-level ping/pong heartbeat runs on a real setInterval; drive it with
    // fake timers so a sweep is a single deterministic tick instead of a 30s wait.
    const HEARTBEAT_MS = 30_000;

    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('marks a live client not-alive and pings it on the first sweep, then terminates it on the next missed pong', () => {
      host = makeHost();
      start(host);
      const ws = connect(wss, '/pty?sessionId=s1');
      expect(ws.isAlive).toBe(true); // the attach handshake marked it alive

      jest.advanceTimersByTime(HEARTBEAT_MS); // sweep 1
      expect(ws.isAlive).toBe(false); // marked pending-pong…
      expect(ws.pings).toBe(1); // …and pinged
      expect(ws.terminated).toBe(0); // given one interval to answer

      jest.advanceTimersByTime(HEARTBEAT_MS); // sweep 2, still no pong
      expect(ws.terminated).toBe(1); // reaped
    });

    it('keeps a client that answers the ping (a pong resets aliveness before the next sweep)', () => {
      host = makeHost();
      start(host);
      const ws = connect(wss, '/pty?sessionId=s1');

      jest.advanceTimersByTime(HEARTBEAT_MS); // sweep 1: isAlive=false, ping #1
      expect(ws.isAlive).toBe(false);
      ws.emit('pong'); // the client answers the protocol ping
      expect(ws.isAlive).toBe(true);

      jest.advanceTimersByTime(HEARTBEAT_MS); // sweep 2: still alive → ping #2, no reap
      expect(ws.terminated).toBe(0);
      expect(ws.pings).toBe(2);
    });

    it('stops sweeping after shutdown (the interval is cleared, not merely unref-ed)', () => {
      host = makeHost();
      const s = start(host);
      const ws = connect(wss, '/pty?sessionId=s1');
      jest.advanceTimersByTime(HEARTBEAT_MS);
      expect(ws.pings).toBe(1);

      s.shutdown();
      jest.advanceTimersByTime(HEARTBEAT_MS * 5);
      expect(ws.pings).toBe(1); // no further pings
      expect(ws.terminated).toBe(0); // and nothing reaped
    });

    it('unref()s the heartbeat interval so it never keeps the process alive on its own', () => {
      host = makeHost();
      const unref = jest.fn();
      const setIntervalSpy = jest
        .spyOn(global, 'setInterval')
        .mockReturnValue({ unref } as unknown as ReturnType<typeof setInterval>);
      try {
        start(host);
        expect(setIntervalSpy).toHaveBeenCalledTimes(1);
        expect(unref).toHaveBeenCalledTimes(1);
      } finally {
        setIntervalSpy.mockRestore();
      }
    });
  });

  describe('replay snapshot then synchronous live join (#150)', () => {
    it('joins the live stream synchronously within the attach — no await splits snapshot → subscribe', () => {
      // Model a tiny live PTY: a byte produced "right after attach" is delivered
      // only if addSubscriber has already run. If an await were inserted between
      // the replay snapshot and the join, `subscriber` would still be null when the
      // attach call returns, and that live byte would be dropped.
      let subscriber: any = null;
      host = makeHost({
        getReplay: jest
          .fn()
          .mockReturnValue({ base: 0, gap: 0, next: 4, data: Buffer.from('AAAA', 'utf8') }),
        addSubscriber: jest.fn((_id: string, ws: any) => {
          subscriber = ws;
          return true;
        }),
      });
      start(host);

      const ws = connect(wss, '/pty?sessionId=s1&offset=0');

      // The join completed before connect() returned: proof the attach sequence is
      // synchronous. (Were it split by an await, `subscriber` would still be null.)
      expect(subscriber).toBe(ws);

      // getReplay (snapshot) ran strictly BEFORE addSubscriber (join).
      const snapshotOrder = host.getReplay.mock.invocationCallOrder[0];
      const joinOrder = host.addSubscriber.mock.invocationCallOrder[0];
      expect(snapshotOrder).toBeLessThan(joinOrder);

      // A live byte emitted after the join reaches the client exactly once, and the
      // replay frame is distinct from it — no gap, no duplicate.
      subscriber.send(Buffer.from('BBBB', 'utf8'));
      const binary = ws.binaryFrames();
      expect(binary[0].toString('utf8')).toBe('AAAA'); // replay
      expect(binary[1].toString('utf8')).toBe('BBBB'); // live
      expect(Buffer.concat(binary).toString('utf8')).toBe('AAAABBBB');
    });
  });

  describe('inbound messages', () => {
    it('writes binary frames to the PTY as keystrokes', () => {
      host = makeHost();
      start(host);
      const ws = connect(wss, '/pty?sessionId=s1');
      ws.emit('message', Buffer.from('ls\n', 'utf8'), true);
      expect(host.write).toHaveBeenCalledTimes(1);
      expect((host.write.mock.calls[0][1] as Buffer).toString('utf8')).toBe('ls\n');
    });

    it('applies resize control frames', () => {
      host = makeHost();
      start(host);
      const ws = connect(wss, '/pty?sessionId=s1');
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'resize', cols: 90, rows: 30 })), false);
      expect(host.resize).toHaveBeenCalledWith('s1', 90, 30);
    });

    it('detaches the subscriber on close', () => {
      host = makeHost();
      start(host);
      const ws = connect(wss, '/pty?sessionId=s1');
      ws.emit('close');
      expect(host.removeSubscriber).toHaveBeenCalledWith('s1', ws);
    });
  });
});
