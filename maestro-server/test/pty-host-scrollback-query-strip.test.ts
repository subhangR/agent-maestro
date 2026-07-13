/**
 * PtyHostService.addSubscriber — scrollback replay must not re-inject terminal
 * device-query REPLIES into the session.
 *
 * Root cause of the "garbage on the shell prompt after Claude exits" bug:
 *   1. Claude / the shell emit terminal capability QUERIES on stdout — DSR
 *      cursor-position `ESC[6n`, Primary DA `ESC[c`, Secondary DA `ESC[>c`.
 *      These are ordinary PTY output bytes and land in the scrollback ring.
 *   2. On every attach (first connect AND reconnect) addSubscriber replays the
 *      full ring to the new WebSocket.
 *   3. The browser feeds those HISTORICAL queries into xterm's parser, which
 *      dutifully generates the REPLIES (`ESC[27;3R`, `ESC[?1;2c`) and forwards
 *      them back to the PTY via onData — as if the user typed them. Claude has
 *      exited, so they corrupt the zsh prompt (`27;3R`, `1;2c`).
 *   4. Reconnect resets xterm and replays the full ring again → amplification;
 *      the echoed reply bytes themselves accumulate in the ring as stale
 *      artifacts.
 *
 * Fix contract: the scrollback REPLAY strips the device query/report protocol
 * set (DSR/CPR/DA/kitty-query) so xterm never sees a stale query to answer and
 * stale reply artifacts do not linger. The LIVE output path is untouched, so a
 * running program's real-time queries still reach xterm and get answered.
 */

import { EventEmitter } from 'events';

interface FakePty {
  pid: number;
  onData: jest.Mock;
  onExit: jest.Mock;
  write: jest.Mock;
  resize: jest.Mock;
  kill: jest.Mock;
  /** Fire the PtyHostService-registered onData handler with a chunk of output. */
  emitData: (chunk: Buffer) => void;
  triggerExit: (code: number) => void;
}

const spawnedPtys: FakePty[] = [];
let nextPid = 2000;

function makeFakePty(): FakePty {
  const emitter = new EventEmitter();
  let dataCb: ((data: string | Buffer) => void) | undefined;
  const fake: FakePty = {
    pid: nextPid++,
    onData: jest.fn((cb: (data: string | Buffer) => void) => {
      dataCb = cb;
    }),
    onExit: jest.fn((cb: (e: { exitCode: number }) => void) => {
      emitter.on('exit', (code: number) => cb({ exitCode: code }));
    }),
    write: jest.fn(),
    resize: jest.fn(),
    kill: jest.fn(),
    emitData: (chunk: Buffer) => dataCb?.(chunk),
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

interface FakeWs {
  readyState: number;
  send: jest.Mock;
  close: jest.Mock;
}

function makeFakeWs(): FakeWs {
  return { readyState: 1, send: jest.fn(), close: jest.fn() };
}

/** Concatenate everything the server sent to a subscriber socket into one string. */
function received(ws: FakeWs): string {
  return Buffer.concat(
    ws.send.mock.calls
      .map((c) => c[0])
      // Ignore JSON control frames (exit/size); we only assert on raw output.
      .filter((d: unknown) => Buffer.isBuffer(d) || d instanceof Uint8Array)
      .map((d: Buffer | Uint8Array) => (Buffer.isBuffer(d) ? d : Buffer.from(d))),
  ).toString('utf8');
}

function makeService() {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any;
  const sessionService = { updateSession: jest.fn().mockResolvedValue(undefined) } as any;
  return new PtyHostService(sessionService, logger);
}

const spawnParams = (sessionId: string) => ({
  sessionId,
  command: 'zsh',
  cwd: '/tmp',
  env: {} as Record<string, string>,
});

const ESC = '\x1b';

describe('PtyHostService scrollback replay — device-query stripping', () => {
  beforeEach(() => {
    spawnedPtys.length = 0;
    nextPid = 2000;
    (nodePty.spawn as jest.Mock).mockClear();
  });

  it('strips DSR/DA QUERIES from replayed scrollback, preserving ordinary text', () => {
    const svc = makeService();
    svc.spawn(spawnParams('s1'));
    const proc = spawnedPtys[0];

    // before DSR(6n) DA(c) mid DA-secondary(>0c) after
    proc.emitData(Buffer.from(`before${ESC}[6n${ESC}[cmid${ESC}[>0cafter`));

    const ws = makeFakeWs();
    expect(svc.addSubscriber('s1', ws as any)).toBe(true);

    expect(received(ws)).toBe('beforemidafter');
  });

  it('strips stale CPR (ESC[27;3R) and DA-reply (ESC[?1;2c) artifacts left by prior amplification', () => {
    const svc = makeService();
    svc.spawn(spawnParams('s1'));
    const proc = spawnedPtys[0];

    // These are echoed device RESPONSES that accumulated in the ring across
    // reconnect amplification — the exact fragments QA observed.
    proc.emitData(Buffer.from(`A${ESC}[27;3RB${ESC}[?1;2cC${ESC}[>0;276;0cD`));

    const ws = makeFakeWs();
    svc.addSubscriber('s1', ws as any);

    expect(received(ws)).toBe('ABCD');
  });

  it('strips a query split across two ring chunks (concat-then-strip)', () => {
    const svc = makeService();
    svc.spawn(spawnParams('s1'));
    const proc = spawnedPtys[0];

    proc.emitData(Buffer.from(`foo${ESC}[`));
    proc.emitData(Buffer.from('6nbar'));

    const ws = makeFakeWs();
    svc.addSubscriber('s1', ws as any);

    expect(received(ws)).toBe('foobar');
  });

  it('preserves SGR colours, screen/cursor control, and DEC private modes not in the protocol set', () => {
    const svc = makeService();
    svc.spawn(spawnParams('s1'));
    const proc = spawnedPtys[0];

    const payload = `${ESC}[31mred${ESC}[0m${ESC}[2J${ESC}[H${ESC}[?25h${ESC}[?2004hok`;
    proc.emitData(Buffer.from(payload));

    const ws = makeFakeWs();
    svc.addSubscriber('s1', ws as any);

    expect(received(ws)).toBe(payload);
  });

  it('is conservative with final byte u: strips only the kitty QUERY (CSI ? u), not key-encoding or push/pop', () => {
    const svc = makeService();
    svc.spawn(spawnParams('s1'));
    const proc = spawnedPtys[0];

    // 13;2u = Shift+Enter key encoding (input echoed), >1u = push, <1u = pop,
    // ?1u = kitty query (the only reply-generating one → strip).
    proc.emitData(Buffer.from(`${ESC}[13;2u${ESC}[>1u${ESC}[?1uX${ESC}[<1uY`));

    const ws = makeFakeWs();
    svc.addSubscriber('s1', ws as any);

    expect(received(ws)).toBe(`${ESC}[13;2u${ESC}[>1uX${ESC}[<1uY`);
  });

  it('leaves the LIVE output stream untouched so real-time terminal queries still reach the client', () => {
    const svc = makeService();
    svc.spawn(spawnParams('s1'));
    const proc = spawnedPtys[0];

    const ws = makeFakeWs();
    svc.addSubscriber('s1', ws as any);
    ws.send.mockClear();

    // A running program queries the terminal AFTER attach — must pass through
    // verbatim so xterm can answer it live.
    proc.emitData(Buffer.from(`${ESC}[6nLIVE`));

    expect(received(ws)).toBe(`${ESC}[6nLIVE`);
  });
});
