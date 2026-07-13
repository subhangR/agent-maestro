/**
 * Regression tests for PtyHostService's offset-resume core:
 *   - the stale-exit identity guard,
 *   - kill(notify)/notifyExit replace-vs-stop semantics,
 *   - getReplay() offset contract (raw `next`, sanitized display bytes).
 *
 * node-pty fires a process's `onExit` listener ASYNCHRONOUSLY, and killing a PTY
 * still produces that exit event later. kill() and spawn()'s replace-existing
 * path remove/swap the session's entry synchronously, so without an identity
 * check the old process's late exit would corrupt the map (delete a freshly
 * respawned entry) or stomp a status an explicit stop just set. These tests fire
 * the stale callback by hand to prove the guard no-ops it.
 */

// Each pty.spawn() returns a fake proc that captures its onData/onExit callbacks
// so a test can fire them manually. Named `mock*` so jest's factory hoist allows
// the reference.
const mockSpawnedProcs: any[] = [];

jest.mock('node-pty', () => ({
  spawn: jest.fn(() => {
    const proc: any = {
      pid: 1000 + mockSpawnedProcs.length,
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn(),
      onData(cb: (d: Buffer) => void) {
        proc._onData = cb;
      },
      onExit(cb: (e: { exitCode: number; signal?: number }) => void) {
        proc._onExit = cb;
      },
    };
    mockSpawnedProcs.push(proc);
    return proc;
  }),
}));

import { PtyHostService } from '../src/application/services/PtyHostService';

function makeService() {
  const updateSession = jest.fn().mockResolvedValue(undefined);
  const sessionService: any = { updateSession };
  const logger: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const svc = new PtyHostService(sessionService, logger);
  return { svc, updateSession, logger };
}

const baseParams = { command: 'echo hi', cwd: '/tmp', env: {} as Record<string, string> };

/** Minimal WebSocket stand-in for subscriber notification tests. */
function fakeWs() {
  return { readyState: 1, send: jest.fn(), close: jest.fn() } as any;
}

/** Did this socket receive a terminal `{type:'exit'}` text frame? */
function receivedExitFrame(ws: { send: jest.Mock }): boolean {
  return ws.send.mock.calls.some(
    ([d]: [unknown]) => typeof d === 'string' && d.includes('"exit"'),
  );
}

describe('PtyHostService stale-exit identity guard', () => {
  beforeEach(() => {
    mockSpawnedProcs.length = 0;
    jest.clearAllMocks();
  });

  it("a killed PTY's late onExit does not delete a freshly-respawned session", () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's1', ...baseParams });
    const first = mockSpawnedProcs[0];

    // Respawn: spawn() kills the old PTY first, then installs a new entry.
    svc.spawn({ sessionId: 's1', ...baseParams });
    const second = mockSpawnedProcs[1];
    expect(svc.hasSession('s1')).toBe(true);
    expect(second).not.toBe(first);

    // node-pty fires the OLD proc's exit asynchronously, AFTER the replace.
    first._onExit({ exitCode: 0 });

    // The stale callback must NOT delete the new (live) entry.
    expect(svc.hasSession('s1')).toBe(true);
    expect(svc.getReplay('s1', 0)).not.toBeNull();

    // The new proc's genuine exit still finalizes the session.
    second._onExit({ exitCode: 0 });
    expect(svc.hasSession('s1')).toBe(false);
  });

  it("a killed PTY's late onExit does not stomp the session status", () => {
    const { svc, updateSession } = makeService();
    svc.spawn({ sessionId: 's2', ...baseParams });
    const proc = mockSpawnedProcs[0];

    // Explicit stop (the route sets status:'stopped' separately afterward).
    svc.kill('s2');
    expect(svc.hasSession('s2')).toBe(false);
    updateSession.mockClear();

    // Stale exit fires after the kill: must be a no-op — no completed/failed write
    // that would overwrite the 'stopped' the caller set.
    proc._onExit({ exitCode: 1 });
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('a natural exit (no kill/replace) still finalizes the session', () => {
    const { svc, updateSession } = makeService();
    svc.spawn({ sessionId: 's3', ...baseParams });
    const proc = mockSpawnedProcs[0];

    proc._onExit({ exitCode: 0 });
    expect(svc.hasSession('s3')).toBe(false);
    expect(updateSession).toHaveBeenCalledWith('s3', { status: 'completed' });
  });

  it('a non-zero natural exit marks the session failed', () => {
    const { svc, updateSession } = makeService();
    svc.spawn({ sessionId: 's4', ...baseParams });
    const proc = mockSpawnedProcs[0];

    proc._onExit({ exitCode: 3 });
    expect(updateSession).toHaveBeenCalledWith('s4', { status: 'failed' });
  });
});

describe('PtyHostService kill/replace notification semantics', () => {
  beforeEach(() => {
    mockSpawnedProcs.length = 0;
    jest.clearAllMocks();
  });

  it('replacing a session (respawn) closes the subscriber WITHOUT an exit frame', () => {
    // The Critical: a replace under the same sessionId must NOT send a terminal
    // exit frame (the client would finalize and never reconnect, stranding the new
    // PTY). Closing the socket alone lets the client reconnect and resume.
    const { svc } = makeService();
    svc.spawn({ sessionId: 's1', ...baseParams });
    const ws = fakeWs();
    svc.addSubscriber('s1', ws);

    svc.spawn({ sessionId: 's1', ...baseParams }); // replace → internal kill(notify=false)

    expect(receivedExitFrame(ws)).toBe(false);
    expect(ws.close).toHaveBeenCalled();
  });

  it('an explicit kill() sends an exit frame so the client finalizes', () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's2', ...baseParams });
    const ws = fakeWs();
    svc.addSubscriber('s2', ws);

    svc.kill('s2'); // notify defaults to true (explicit stop)

    expect(receivedExitFrame(ws)).toBe(true);
    expect(ws.close).toHaveBeenCalled();
    expect(svc.hasSession('s2')).toBe(false);
  });

  it('kill() still finalizes the session and logs when proc.kill() throws', () => {
    const { svc, logger } = makeService();
    svc.spawn({ sessionId: 's3', ...baseParams });
    mockSpawnedProcs[0].kill = jest.fn(() => {
      throw new Error('ESRCH');
    });

    svc.kill('s3');

    expect(svc.hasSession('s3')).toBe(false); // finalized despite the throw
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('kill failed'),
      expect.objectContaining({ sessionId: 's3' }),
    );
  });

  it('a reconnect with a stale offset after respawn gets a full replay of the new stream', () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's5', ...baseParams });
    mockSpawnedProcs[0]._onData(Buffer.from('OLD-STREAM-OUTPUT', 'utf8')); // client offset → 17

    // Respawn: a fresh OutputBuffer starting at offset 0.
    svc.spawn({ sessionId: 's5', ...baseParams });
    mockSpawnedProcs[1]._onData(Buffer.from('new', 'utf8')); // 3 bytes in the new stream

    // Client reconnects with its stale offset (17) — larger than the new stream (3).
    // It must get a full replay of the new stream, not be clamped to caught-up.
    const replay = svc.getReplay('s5', 17);
    expect(replay).not.toBeNull();
    expect(replay!.base).toBe(0);
    expect(replay!.gap).toBe(0);
    expect(replay!.next).toBe(3);
    expect(replay!.data.toString('utf8')).toBe('new');
  });
});

describe('PtyHostService.getReplay — sanitized display bytes, raw offsets', () => {
  beforeEach(() => {
    mockSpawnedProcs.length = 0;
    jest.clearAllMocks();
  });

  // ESC[6n — a DSR cursor-position query. 4 raw bytes: 0x1b 0x5b 0x36 0x6e.
  const DEVICE_QUERY = '\x1b[6n';

  it('returns null for an unknown session', () => {
    const { svc } = makeService();
    expect(svc.getReplay('ghost', 0)).toBeNull();
  });

  it('strips device queries from the replay data but keeps `next` at the RAW total', () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's1', ...baseParams });
    // "AAA" + ESC[6n + "BBB" — 3 + 4 + 3 = 10 raw bytes.
    const raw = Buffer.from('AAA' + DEVICE_QUERY + 'BBB', 'latin1');
    expect(raw.length).toBe(10);
    mockSpawnedProcs[0]._onData(raw);

    // Resume from an offset INSIDE the window (mid-stream).
    const replay = svc.getReplay('s1', 2)!;
    expect(replay).not.toBeNull();
    expect(replay.base).toBe(2);
    expect(replay.gap).toBe(0);
    // next is the RAW end of stream (10), NOT the sanitized length (6).
    expect(replay.next).toBe(10);
    // The device query is stripped from what will be painted: "A" + "BBB".
    expect(replay.data.toString('latin1')).toBe('ABBB');
    expect(replay.data.includes(0x1b)).toBe(false);
  });

  it('getReplay(next) is empty and leaves next unchanged (caught up — no re-replay)', () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's1', ...baseParams });
    const raw = Buffer.from('AAA' + DEVICE_QUERY + 'BBB', 'latin1'); // 10 raw bytes
    mockSpawnedProcs[0]._onData(raw);

    const first = svc.getReplay('s1', 0)!;
    expect(first.next).toBe(10);

    // Feeding the authoritative `next` back must return nothing and the same next.
    const caughtUp = svc.getReplay('s1', first.next)!;
    expect(caughtUp.base).toBe(10);
    expect(caughtUp.gap).toBe(0);
    expect(caughtUp.next).toBe(10);
    expect(caughtUp.data.length).toBe(0);
  });

  it('a full (offset 0) replay sanitizes the whole retained stream', () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's1', ...baseParams });
    mockSpawnedProcs[0]._onData(Buffer.from('hi' + DEVICE_QUERY + 'there', 'latin1'));

    const replay = svc.getReplay('s1', 0)!;
    expect(replay.base).toBe(0);
    expect(replay.next).toBe(2 + 4 + 5); // raw total = 11
    expect(replay.data.toString('latin1')).toBe('hithere');
  });
});

/**
 * #150 — the replay→subscribe ordering seam.
 *
 * The WS attach handshake takes a scrollback SNAPSHOT (getReplay, which freezes
 * the raw boundary `next`) and then joins the live stream (addSubscriber). node-pty
 * output arrives on a SEPARATE event-loop task (proc.onData), so as long as those
 * two steps run with nothing awaited between them, no live chunk can interleave in
 * the window: every byte < next is in the replay, every byte >= next is delivered
 * live, and the two partitions cover the stream with no overlap and no hole.
 *
 * These tests pin that exactly-once property at the service seam the WS server
 * depends on. They are the regression guard behind the "keep it synchronous"
 * invariant documented in PtyWebSocketServer.handleConnection: were an await ever
 * inserted between the snapshot and the join, a chunk emitted in that window would
 * be lost (in neither the replay nor the live feed), and this accounting would stop
 * closing.
 */
describe('PtyHostService replay→subscribe ordering seam (#150)', () => {
  beforeEach(() => {
    mockSpawnedProcs.length = 0;
    jest.clearAllMocks();
  });

  /** Concatenate every binary (Buffer) frame this socket received live. */
  function liveBytes(ws: { send: jest.Mock }): Buffer {
    return Buffer.concat(
      ws.send.mock.calls
        .map(([d]: [unknown]) => d)
        .filter((d: unknown): d is Buffer => Buffer.isBuffer(d)),
    );
  }

  it('delivers each post-snapshot byte exactly once when a subscriber joins right after the snapshot (no gap, no duplicate)', () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's1', ...baseParams });

    // Pre-snapshot output — this belongs to the replay, not the live feed.
    mockSpawnedProcs[0]._onData(Buffer.from('AAAA', 'utf8'));

    // 1) SNAPSHOT: the attach handshake reads the replay first. `next` freezes the
    //    boundary between "already replayed" and "arrives live from here on".
    const replay = svc.getReplay('s1', 0)!;
    expect(replay.next).toBe(4);
    expect(replay.data.toString('utf8')).toBe('AAAA');

    // 2) JOIN: subscribe SYNCHRONOUSLY after the snapshot (as the WS server does).
    const ws = fakeWs();
    svc.addSubscriber('s1', ws);

    // 3) Live output produced AFTER the join.
    mockSpawnedProcs[0]._onData(Buffer.from('BBBB', 'utf8'));

    // The subscriber saw ONLY the post-snapshot bytes: the replayed bytes are NOT
    // re-sent live (no duplicate) and the live bytes are NOT missing (no gap).
    expect(liveBytes(ws).toString('utf8')).toBe('BBBB');

    // Replay ++ live reconstructs the whole stream, each byte once, in order, and
    // the offset accounting closes: next(4) + live(4) == raw total(8).
    const clientView = Buffer.concat([replay.data, liveBytes(ws)]);
    expect(clientView.toString('utf8')).toBe('AAAABBBB');
    expect(replay.next + liveBytes(ws).length).toBe(svc.getReplay('s1', 0)!.next);
  });

  it('partitions the stream with no overlap: snapshot bytes and post-join bytes are disjoint and together cover the total', () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's7', ...baseParams });
    mockSpawnedProcs[0]._onData(Buffer.from('HEAD', 'utf8'));

    const replay = svc.getReplay('s7', 0)!; // snapshot at next=4
    const ws = fakeWs();
    svc.addSubscriber('s7', ws); // join — still synchronous, no await between
    mockSpawnedProcs[0]._onData(Buffer.from('TAIL', 'utf8'));

    const total = svc.getReplay('s7', 0)!.next;
    expect(total).toBe(8);
    // Every byte accounted for exactly once: |replay| + |live| == total, and the
    // two halves share no byte.
    expect(replay.data.length + liveBytes(ws).length).toBe(total);
    expect(replay.data.toString('utf8')).toBe('HEAD');
    expect(liveBytes(ws).toString('utf8')).toBe('TAIL');
  });
});
