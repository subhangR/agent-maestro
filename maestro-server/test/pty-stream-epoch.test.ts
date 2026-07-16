/**
 * #151 — explicit PTY stream identity ("stream epoch").
 *
 * Every PTY spawn is tagged with an opaque epoch the client compares by EQUALITY
 * only (it infers no ordering from it). The epoch must be:
 *   - STABLE for the life of a single stream (so a normal reconnect resumes),
 *   - DIFFERENT after a respawn under the same sessionId (kill+replace restarts
 *     output at offset 0 — the client must reset instead of resuming onto bytes
 *     that share the old offset space), and
 *   - DIFFERENT across server process restarts (a fresh PtyHostService instance),
 *     so an offset/epoch a client held before a restart never looks like a live
 *     same-stream resume.
 *
 * The last property is what a pure spawn-counter cannot provide on its own: a
 * restarted process would restart the counter at the same value. A per-instance
 * boot nonce mixed into the epoch is what makes two separate service instances
 * mint disjoint epochs.
 */

// Mock node-pty so no real shell is spawned. Each spawn returns a fake proc that
// captures its onData/onExit callbacks so a test can fire them by hand.
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
      onExit(cb: (e: { exitCode: number }) => void) {
        proc._onExit = cb;
      },
    };
    mockSpawnedProcs.push(proc);
    return proc;
  }),
}));

import { PtyHostService } from '../src/application/services/PtyHostService';

function makeService() {
  const sessionService: any = { updateSession: jest.fn().mockResolvedValue(undefined) };
  const logger: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return new PtyHostService(sessionService, logger);
}

const baseParams = { command: 'echo hi', cwd: '/tmp', env: {} as Record<string, string> };

describe('PtyHostService stream epoch (#151)', () => {
  beforeEach(() => {
    mockSpawnedProcs.length = 0;
    jest.clearAllMocks();
  });

  it('returns null for an unknown session', () => {
    const svc = makeService();
    expect(svc.getEpoch('ghost')).toBeNull();
  });

  it('assigns a non-empty opaque epoch on spawn', () => {
    const svc = makeService();
    svc.spawn({ sessionId: 's1', ...baseParams });
    const epoch = svc.getEpoch('s1');
    expect(typeof epoch).toBe('string');
    expect((epoch as string).length).toBeGreaterThan(0);
  });

  it('keeps the SAME epoch stable for the life of one stream', () => {
    const svc = makeService();
    svc.spawn({ sessionId: 's1', ...baseParams });
    const first = svc.getEpoch('s1');

    // Output, a resize, and a replay read must never rotate the epoch.
    mockSpawnedProcs[0]._onData(Buffer.from('some output', 'utf8'));
    svc.resize('s1', 100, 40);
    svc.getReplay('s1', 0);

    expect(svc.getEpoch('s1')).toBe(first);
  });

  it('CHANGES the epoch when the PTY is respawned (kill+replace) under the same id', () => {
    const svc = makeService();
    svc.spawn({ sessionId: 's1', ...baseParams });
    const before = svc.getEpoch('s1');

    // spawn() is destructive: it kills the old PTY and installs a fresh stream at
    // offset 0. That new stream must carry a new epoch.
    svc.spawn({ sessionId: 's1', ...baseParams });
    const after = svc.getEpoch('s1');

    expect(after).not.toBe(before);
    expect(typeof after).toBe('string');
  });

  it('keeps the epoch stable across an idempotent spawnIfAbsent reuse, and rotates it on recreate', () => {
    const svc = makeService();
    svc.spawnIfAbsent({ sessionId: 's1', ...baseParams }); // fresh spawn
    const original = svc.getEpoch('s1');

    // Reuse a live PTY: same stream, same epoch.
    svc.spawnIfAbsent({ sessionId: 's1', ...baseParams });
    expect(svc.getEpoch('s1')).toBe(original);

    // The process exits and is recreated: a brand new stream → new epoch.
    mockSpawnedProcs[0]._onExit({ exitCode: 0 });
    expect(svc.hasSession('s1')).toBe(false);
    svc.spawnIfAbsent({ sessionId: 's1', ...baseParams });
    expect(svc.getEpoch('s1')).not.toBe(original);
  });

  it('mints DISJOINT epochs across separate service instances (survives a server restart)', () => {
    // Two independent PtyHostService instances model "before" and "after" a
    // server process restart. Each spawns the very first PTY for the same id, so
    // any per-instance spawn counter is at the same value — only a per-instance
    // boot nonce can keep the two epochs distinct.
    const before = makeService();
    before.spawn({ sessionId: 's1', ...baseParams });
    const restarted = makeService();
    restarted.spawn({ sessionId: 's1', ...baseParams });

    expect(before.getEpoch('s1')).not.toBe(restarted.getEpoch('s1'));
  });
});
