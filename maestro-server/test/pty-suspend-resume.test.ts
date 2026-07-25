/**
 * Integration regressions for the browser's lazy terminal suspend/resume path.
 *
 * These tests deliberately compose the real PtyHostService with the real
 * PtyWebSocketServer. A suspended browser closes only its subscriber socket;
 * the server-owned PTY must keep running, retain output, and reattach from the
 * client's last raw offset without losing or duplicating bytes. If the client
 * falls behind the 1 MiB raw ring, reattach must use the coherent headless-xterm
 * snapshot path rather than replaying a truncated ANSI suffix.
 */

import { EventEmitter } from 'events';

const mockSpawnedProcs: any[] = [];

jest.mock('node-pty', () => ({
  spawn: jest.fn(() => {
    const proc: any = {
      pid: 7000 + mockSpawnedProcs.length,
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn(),
      onData(cb: (data: Buffer) => void) {
        proc._onData = cb;
      },
      onExit(cb: (event: { exitCode: number; signal?: number }) => void) {
        proc._onExit = cb;
      },
    };
    mockSpawnedProcs.push(proc);
    return proc;
  }),
}));

import { PtyHostService } from '../src/application/services/PtyHostService';
import { PtyWebSocketServer } from '../src/infrastructure/websocket/PtyWebSocketServer';

type SentFrame = string | Buffer;

class FakeWs extends EventEmitter {
  readyState = 1;
  binaryType = '';
  isAlive?: boolean;
  readonly sent: SentFrame[] = [];
  readonly closes: Array<{ code: number; reason: string }> = [];

  send(data: SentFrame): void {
    this.sent.push(data);
  }

  close(code: number, reason: string): void {
    this.closes.push({ code, reason });
  }

  terminate(): void {
    this.readyState = 3;
  }

  ping(): void {}

  clientClose(): void {
    this.readyState = 3;
    this.emit('close');
  }

  textFrames(): Array<Record<string, unknown>> {
    return this.sent
      .filter((frame): frame is string => typeof frame === 'string')
      .map((frame) => JSON.parse(frame) as Record<string, unknown>);
  }

  binaryFrames(): Buffer[] {
    return this.sent.filter((frame): frame is Buffer => Buffer.isBuffer(frame));
  }

  attachedFrame(): Record<string, unknown> | undefined {
    return this.textFrames().find((frame) => frame.type === 'attached');
  }
}

class FakeWss extends EventEmitter {
  readonly clients = new Set<FakeWs>();
}

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const baseParams = {
  command: 'echo integration',
  cwd: '/tmp',
  env: {} as Record<string, string>,
};

function connect(wss: FakeWss, sessionId: string, offset: number): FakeWs {
  const ws = new FakeWs();
  wss.clients.add(ws);
  wss.emit('connection', ws, {
    url: `/pty?sessionId=${encodeURIComponent(sessionId)}&offset=${offset}`,
  });
  return ws;
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('PTY subscriber suspend → resume integration', () => {
  let host: PtyHostService;
  let wss: FakeWss;
  let server: PtyWebSocketServer;

  beforeEach(() => {
    mockSpawnedProcs.length = 0;
    jest.clearAllMocks();
    wss = new FakeWss();
    host = new PtyHostService(
      { updateSession: jest.fn().mockResolvedValue(undefined) } as any,
      logger as any,
    );
    server = new PtyWebSocketServer(wss as any, host, logger as any);
  });

  afterEach(() => {
    server.shutdown();
    host.kill('session');
  });

  it('detaches one subscriber while the PTY continues, then replays exactly the stale-offset delta', async () => {
    host.spawn({ sessionId: 'session', ...baseParams });
    const proc = mockSpawnedProcs[0];

    const boot = Buffer.from('BOOT\n');
    proc._onData(boot);
    const first = connect(wss, 'session', 0);
    const firstAttach = first.attachedFrame();
    expect(firstAttach).toEqual(
      expect.objectContaining({ type: 'attached', next: boot.length, gap: 0 }),
    );
    expect(Buffer.concat(first.binaryFrames())).toEqual(boot);

    const visible = Buffer.from('VISIBLE\n');
    proc._onData(visible);
    await waitFor(
      () => Buffer.concat(first.binaryFrames()).length === boot.length + visible.length,
      'visible output was not delivered before suspend',
    );
    const savedOffset = boot.length + visible.length;

    first.clientClose();
    const framesAtSuspend = first.sent.length;

    const hidden = Buffer.from('WHILE-HIDDEN\n');
    proc._onData(hidden);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(first.sent).toHaveLength(framesAtSuspend);
    expect(host.hasSession('session')).toBe(true);
    expect(proc.kill).not.toHaveBeenCalled();

    const resumed = connect(wss, 'session', savedOffset);
    expect(resumed.attachedFrame()).toEqual(
      expect.objectContaining({
        type: 'attached',
        base: savedOffset,
        gap: 0,
        next: savedOffset + hidden.length,
      }),
    );
    expect(Buffer.concat(resumed.binaryFrames())).toEqual(hidden);

    const live = Buffer.from('AFTER-RESUME\n');
    proc._onData(live);
    await waitFor(
      () => Buffer.concat(resumed.binaryFrames()).length === hidden.length + live.length,
      'live output was not delivered after resume',
    );
    expect(Buffer.concat(resumed.binaryFrames())).toEqual(Buffer.concat([hidden, live]));
  });

  it('restores a coherent snapshot when suspended output evicts more than the 1 MiB replay ring', async () => {
    host.spawn({ sessionId: 'session', ...baseParams });
    const proc = mockSpawnedProcs[0];

    const boot = Buffer.from('BOOT\n');
    proc._onData(boot);
    const first = connect(wss, 'session', 0);
    const savedOffset = Number(first.attachedFrame()?.next);
    expect(savedOffset).toBe(boot.length);
    first.clientClose();
    const framesAtSuspend = first.sent.length;

    // Exceed the production OutputBuffer's fixed 1 MiB cap. NUL is legitimate
    // raw PTY output with no terminal-state effect. Seed those inert bytes into
    // the real session ring directly so this regression checks the production
    // eviction threshold without making xterm's intentionally time-sliced write
    // loop spend tens of seconds scanning a 1 MiB no-op inside Jest. The marker
    // still travels through the real proc.onData → headless mirror path and
    // proves the snapshot represents the latest meaningful terminal state.
    const inertBulk = Buffer.alloc(1024 * 1024 + 4096, 0);
    const entry = (host as any).sessions.get('session');
    entry.output.append(inertBulk);
    const marker = Buffer.from('LATEST-HIDDEN-STATE\n');
    proc._onData(marker);
    const hiddenLength = inertBulk.length + marker.length;
    expect(hiddenLength).toBeGreaterThan(1024 * 1024);

    expect(first.sent).toHaveLength(framesAtSuspend);
    expect(host.hasSession('session')).toBe(true);
    expect(proc.kill).not.toHaveBeenCalled();

    const resumed = connect(wss, 'session', savedOffset);
    await waitFor(
      () => resumed.attachedFrame()?.replayKind === 'snapshot',
      'gap reattach did not finish the terminal-state snapshot handshake',
    );

    const attached = resumed.attachedFrame()!;
    expect(attached).toEqual(
      expect.objectContaining({
        type: 'attached',
        replayKind: 'snapshot',
        hasReplay: true,
        next: boot.length + hiddenLength,
      }),
    );
    expect(Number(attached.gap)).toBeGreaterThan(0);
    expect(Number(attached.base)).toBe(Number(attached.next));

    const snapshotFrames = resumed.binaryFrames();
    expect(snapshotFrames).toHaveLength(1);
    expect(snapshotFrames[0].toString('utf8').startsWith('\u001bc')).toBe(true);
    expect(snapshotFrames[0].toString('utf8')).toContain('LATEST-HIDDEN-STATE');

    const live = Buffer.from('LIVE-AFTER-SNAPSHOT\n');
    proc._onData(live);
    await waitFor(
      () => resumed.binaryFrames().length === 2,
      'resumed snapshot subscriber did not receive subsequent live output',
    );
    expect(resumed.binaryFrames()[1]).toEqual(live);
  }, 15_000);
});
