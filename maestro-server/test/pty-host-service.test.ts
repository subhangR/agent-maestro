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

/** Build the kind of errno error node-pty's kill() surfaces from the OS: an
 *  Error carrying a `.code` (e.g. 'ESRCH' no-such-process, 'EPERM' not-permitted). */
function errnoError(code: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(`kill ${code}`);
  err.code = code;
  return err;
}

/** Did the logger warn about a kill FAILURE (used to prove a benign
 *  already-exited race is NOT logged as noise)? */
function warnedKillFailed(logger: { warn: jest.Mock }): boolean {
  return logger.warn.mock.calls.some(
    ([msg]: [unknown]) => typeof msg === 'string' && msg.includes('kill failed'),
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

  it('kill() still finalizes the session and logs when proc.kill() genuinely fails', () => {
    const { svc, logger } = makeService();
    svc.spawn({ sessionId: 's3', ...baseParams });
    mockSpawnedProcs[0].kill = jest.fn(() => {
      throw errnoError('EPERM');
    });

    svc.kill('s3');

    expect(svc.hasSession('s3')).toBe(false); // finalized despite the throw
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('kill failed'),
      expect.objectContaining({ sessionId: 's3' }),
    );
  });

  // #154 — kill() reports a discriminated outcome so the explicit /pty/stop route
  // can tell "killed a live PTY", "nothing to kill", and "kill signal failed"
  // apart. Internal callers (spawn-replace, shutdownAll) ignore it and finalize
  // unconditionally, so their behavior is unchanged.
  it("kill() returns 'not_found' when there is no live PTY for the id (a no-op)", () => {
    const { svc } = makeService();
    expect(svc.kill('never-spawned')).toBe('not_found');
  });

  it("kill() returns 'killed' when it terminates a live PTY cleanly", () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's6', ...baseParams });
    expect(svc.kill('s6')).toBe('killed');
    expect(svc.hasSession('s6')).toBe(false);
  });

  it("kill() returns 'error' when proc.kill() genuinely fails (EPERM), but STILL finalizes the entry", () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's7', ...baseParams });
    mockSpawnedProcs[0].kill = jest.fn(() => {
      throw errnoError('EPERM');
    });
    expect(svc.kill('s7')).toBe('error');
    expect(svc.hasSession('s7')).toBe(false); // cleanup still happens
  });

  // #154 hardening — an ESRCH is the already-EXITED race: the PTY entry was still
  // in the map (its async onExit had not fired yet) but the OS process had already
  // died, so proc.kill() throws ESRCH. Killing something already dead achieves the
  // desired end-state, so it is IDEMPOTENT SUCCESS ('killed'), NOT 'error' — the
  // /pty/stop route must then return 2xx, not 500. Only a GENUINE failure (EPERM,
  // etc.) is 'error'.
  it("kill() treats an already-exited race (proc.kill() throws ESRCH) as idempotent 'killed', not 'error'", () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's9', ...baseParams });
    mockSpawnedProcs[0].kill = jest.fn(() => {
      throw errnoError('ESRCH');
    });

    expect(svc.kill('s9')).toBe('killed');
    expect(svc.hasSession('s9')).toBe(false); // still finalized
  });

  it('kill() does NOT log an already-exited (ESRCH) race as a kill failure', () => {
    const { svc, logger } = makeService();
    svc.spawn({ sessionId: 's10', ...baseParams });
    mockSpawnedProcs[0].kill = jest.fn(() => {
      throw errnoError('ESRCH');
    });

    svc.kill('s10');

    // A benign race is not a failure; it must not surface as warn-level noise.
    expect(warnedKillFailed(logger)).toBe(false);
  });

  it('an explicit kill() on an already-exited race still sends the exit frame and finalizes', () => {
    // notify defaults to true (explicit stop): even though the process was already
    // gone, the client must still get its terminal {type:'exit'} frame so it
    // finalizes the terminal rather than hanging attached.
    const { svc } = makeService();
    svc.spawn({ sessionId: 's11', ...baseParams });
    const ws = fakeWs();
    svc.addSubscriber('s11', ws);
    mockSpawnedProcs[0].kill = jest.fn(() => {
      throw errnoError('ESRCH');
    });

    expect(svc.kill('s11')).toBe('killed');
    expect(receivedExitFrame(ws)).toBe(true);
    expect(ws.close).toHaveBeenCalled();
    expect(svc.hasSession('s11')).toBe(false);
  });

  it("kill() from an internal replace path (notify=false) still reports 'killed'", () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 's8', ...baseParams });
    // Same call shape spawn()/shutdownAll use; the outcome is available but ignored
    // by those callers.
    expect(svc.kill('s8', false)).toBe('killed');
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

describe('PtyHostService.deliverPrompt — server-owned prompt semantics', () => {
  beforeEach(() => {
    mockSpawnedProcs.length = 0;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('paste strips trailing newlines and does not press Enter', async () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 'paste-target', ...baseParams });

    await expect(
      svc.deliverPrompt('paste-target', 'paste marker\r\n', 'paste'),
    ).resolves.toBe(true);

    expect(mockSpawnedProcs[0].write.mock.calls).toEqual([['paste marker']]);
  });

  it('queues prompt-before-PTY and flushes it when spawn completes', async () => {
    const { svc } = makeService();

    await expect(
      svc.deliverPrompt('late-target', 'attach marker', 'paste'),
    ).resolves.toBe(true);
    expect(mockSpawnedProcs).toHaveLength(0);

    svc.spawn({ sessionId: 'late-target', ...baseParams });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mockSpawnedProcs[0].write.mock.calls).toEqual([['attach marker']]);
  });

  it('pauses an existing PTY during handoff and flushes on spawnIfAbsent reuse', async () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 'reuse-target', ...baseParams });

    svc.beginPromptHandoff('reuse-target');
    await expect(
      svc.deliverPrompt('reuse-target', 'reuse marker', 'paste'),
    ).resolves.toBe(true);
    expect(mockSpawnedProcs[0].write).not.toHaveBeenCalled();

    expect(
      svc.spawnIfAbsent({ sessionId: 'reuse-target', ...baseParams }),
    ).toEqual({ reused: true });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mockSpawnedProcs[0].write.mock.calls).toEqual([['reuse marker']]);
  });

  it('send writes the stripped body, waits, then presses Enter exactly once', async () => {
    jest.useFakeTimers();
    const { svc } = makeService();
    svc.spawn({ sessionId: 'send-target', ...baseParams });

    const delivery = svc.deliverPrompt(
      'send-target',
      'send marker\n',
      'send',
    );
    expect(mockSpawnedProcs[0].write.mock.calls).toEqual([['send marker']]);

    await jest.advanceTimersByTimeAsync(200);
    await expect(delivery).resolves.toBe(true);
    expect(mockSpawnedProcs[0].write.mock.calls).toEqual([
      ['send marker'],
      ['\r'],
    ]);
  });

  it('preserves mixed paste/send FIFO order across prompt-before-PTY attach', async () => {
    jest.useFakeTimers();
    const { svc } = makeService();
    await svc.deliverPrompt('fifo-target', 'first\n', 'paste');
    await svc.deliverPrompt('fifo-target', 'second\r\n', 'send');
    await svc.deliverPrompt('fifo-target', 'third', 'paste');

    svc.spawn({ sessionId: 'fifo-target', ...baseParams });
    await jest.runAllTimersAsync();

    expect(mockSpawnedProcs[0].write.mock.calls).toEqual([
      ['first'],
      ['second'],
      ['\r'],
      ['third'],
    ]);
  });

  it('bounds prompt-before-PTY queues and preserves the accepted FIFO prefix', async () => {
    const { svc, logger } = makeService();
    const accepted: boolean[] = [];
    for (let index = 0; index < 40; index += 1) {
      accepted.push(
        await svc.deliverPrompt(
          'bounded-target',
          `prompt-${index}`,
          'paste',
        ),
      );
    }

    expect(accepted.slice(0, 32)).toEqual(Array(32).fill(true));
    expect(accepted.slice(32)).toEqual(Array(8).fill(false));
    expect(
      logger.warn.mock.calls.filter(([message]: [string]) =>
        message.includes('pending prompt queue overflowed'),
      ),
    ).toHaveLength(1);

    svc.spawn({ sessionId: 'bounded-target', ...baseParams });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(
      mockSpawnedProcs[0].write.mock.calls.map(([content]: [string]) => content),
    ).toEqual(Array.from({ length: 32 }, (_, index) => `prompt-${index}`));
  });

  it('rejects one prompt larger than the byte cap without creating stale state', async () => {
    const { svc } = makeService();
    await expect(
      svc.deliverPrompt('oversized-target', 'x'.repeat(256 * 1024 + 1), 'paste'),
    ).resolves.toBe(false);

    svc.spawn({ sessionId: 'oversized-target', ...baseParams });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mockSpawnedProcs[0].write).not.toHaveBeenCalled();
  });

  it('never spills send-mode Enter into a replacement PTY', async () => {
    jest.useFakeTimers();
    const { svc } = makeService();
    svc.spawn({ sessionId: 'resume-target', ...baseParams });
    const oldProc = mockSpawnedProcs[0];

    const delivery = svc.deliverPrompt(
      'resume-target',
      'old process marker',
      'send',
    );
    svc.spawn({ sessionId: 'resume-target', ...baseParams });
    const replacementProc = mockSpawnedProcs[1];

    await jest.advanceTimersByTimeAsync(200);
    await expect(delivery).resolves.toBe(true);
    expect(oldProc.write.mock.calls).toEqual([['old process marker']]);
    expect(replacementProc.write).not.toHaveBeenCalled();
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

  it('buffers output produced while a terminal-state snapshot is generated, then promotes it live in order', async () => {
    const { svc } = makeService();
    svc.spawn({ sessionId: 'snapshot-gap', ...baseParams });
    mockSpawnedProcs[0]._onData(Buffer.from('HEAD', 'utf8'));

    const ws = fakeWs();
    expect(svc.addPendingSubscriber('snapshot-gap', ws)).toBe(true);
    const snapshotPromise = svc.getStateSnapshot('snapshot-gap');
    expect(snapshotPromise).not.toBeNull();

    // This arrives after the snapshot boundary but before serialization finishes.
    mockSpawnedProcs[0]._onData(Buffer.from('TAIL', 'utf8'));
    const snapshot = await snapshotPromise!;
    expect(snapshot.next).toBe(4);
    expect(snapshot.data.toString('utf8')).toContain('HEAD');
    expect(snapshot.data.toString('utf8')).not.toContain('TAIL');

    expect(svc.activatePendingSubscriber('snapshot-gap', ws)).toBe(true);
    expect(liveBytes(ws).toString('utf8')).toBe('TAIL');

    mockSpawnedProcs[0]._onData(Buffer.from('LIVE', 'utf8'));
    expect(liveBytes(ws).toString('utf8')).toBe('TAILLIVE');
  });
});
