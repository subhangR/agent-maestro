/**
 * PtyHostService.spawnIfAbsent — the server contract behind idempotent
 * standalone-terminal reattach.
 *
 * When a browser reloads, the UI re-creates its persisted standalone terminals
 * and each POSTs /pty/spawn to reattach. That must NOT tear down and respawn a
 * still-running server PTY (which would kill the user's shell and lose its
 * scrollback); it must reattach to the live process by identity. A PTY that has
 * already exited, however, may be recreated.
 *
 * `spawn()` stays intentionally destructive (agent resume replaces the PTY on
 * purpose). `spawnIfAbsent()` is the reattach-safe variant: reuse a live PTY,
 * recreate a dead one.
 */

import { EventEmitter } from 'events';

// ─── Mock node-pty so no real shell is spawned ───────────────────────────────
// Each spawn returns a fake IPty with a distinct pid and a captured onExit
// callback the test can fire to simulate the process ending.

interface FakePty {
  pid: number;
  onData: jest.Mock;
  onExit: jest.Mock;
  write: jest.Mock;
  resize: jest.Mock;
  kill: jest.Mock;
  /** Fire the registered onExit handler as if the process ended. */
  triggerExit: (code: number) => void;
}

const spawnedPtys: FakePty[] = [];
let nextPid = 1000;

function makeFakePty(): FakePty {
  const emitter = new EventEmitter();
  const fake: FakePty = {
    pid: nextPid++,
    onData: jest.fn(),
    onExit: jest.fn((cb: (e: { exitCode: number }) => void) => {
      emitter.on('exit', (code: number) => cb({ exitCode: code }));
    }),
    write: jest.fn(),
    resize: jest.fn(),
    kill: jest.fn(),
    triggerExit: (code: number) => emitter.emit('exit', code),
  };
  return fake;
}

jest.mock('node-pty', () => ({
  spawn: jest.fn(() => {
    const fake = makeFakePty();
    spawnedPtys.push(fake);
    return fake;
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodePty = require('node-pty');
import { PtyHostService } from '../src/application/services/PtyHostService';

function makeService() {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as any;
  const sessionService = {
    updateSession: jest.fn().mockResolvedValue(undefined),
  } as any;
  return new PtyHostService(sessionService, logger);
}

const spawnParams = (sessionId: string) => ({
  sessionId,
  command: 'bash',
  cwd: '/tmp',
  env: {} as Record<string, string>,
});

describe('PtyHostService.spawnIfAbsent', () => {
  beforeEach(() => {
    spawnedPtys.length = 0;
    nextPid = 1000;
    (nodePty.spawn as jest.Mock).mockClear();
  });

  it('reattaches to a live PTY without killing or respawning it (idempotent reattach)', () => {
    const svc = makeService();

    const first = svc.spawnIfAbsent(spawnParams('s1'));
    expect(first).toEqual({ reused: false });
    expect(spawnedPtys).toHaveLength(1);
    const original = spawnedPtys[0];

    const second = svc.spawnIfAbsent(spawnParams('s1'));
    expect(second).toEqual({ reused: true });
    // No second process, and the live one is untouched.
    expect(spawnedPtys).toHaveLength(1);
    expect(original.kill).not.toHaveBeenCalled();
    expect(svc.hasSession('s1')).toBe(true);
  });

  it('recreates a PTY that has already exited', () => {
    const svc = makeService();

    svc.spawnIfAbsent(spawnParams('s1'));
    const original = spawnedPtys[0];

    // Process ends on its own — onExit removes it from the registry.
    original.triggerExit(0);
    expect(svc.hasSession('s1')).toBe(false);

    const again = svc.spawnIfAbsent(spawnParams('s1'));
    expect(again).toEqual({ reused: false });
    expect(spawnedPtys).toHaveLength(2);
    expect(spawnedPtys[1].pid).not.toBe(original.pid);
    expect(svc.hasSession('s1')).toBe(true);
  });

  it('leaves spawn() destructive: it still replaces a live PTY (agent resume path)', () => {
    const svc = makeService();

    svc.spawn(spawnParams('s1'));
    const original = spawnedPtys[0];

    svc.spawn(spawnParams('s1'));
    // Old proc killed, new proc created — the opposite of spawnIfAbsent.
    expect(original.kill).toHaveBeenCalledTimes(1);
    expect(spawnedPtys).toHaveLength(2);
    expect(svc.hasSession('s1')).toBe(true);
  });
});
