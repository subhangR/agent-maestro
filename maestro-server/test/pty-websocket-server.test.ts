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
    addSubscriber: jest.fn().mockReturnValue(true),
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

  it('surfaces an eviction gap in the attached frame and still replays retained bytes', () => {
    host = makeHost({
      getReplay: jest
        .fn()
        .mockReturnValue({ base: 100, gap: 40, next: 200, data: Buffer.from('x', 'utf8') }),
    });
    start(host);
    const ws = connect(wss, '/pty?sessionId=s1&offset=60');
    const attached = ws.textFrames().find((f) => f.type === 'attached');
    expect(attached).toEqual({ type: 'attached', base: 100, gap: 40, next: 200, hasReplay: true });
    expect(ws.binaryFrames()[0].toString('utf8')).toBe('x');
  });

  it('logs a warning when a replay has an eviction gap (data loss is visible)', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    host = makeHost({
      getReplay: jest
        .fn()
        .mockReturnValue({ base: 100, gap: 40, next: 200, data: Buffer.from('x', 'utf8') }),
    });
    start(host, logger);
    connect(wss, '/pty?sessionId=s1&offset=60');
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
