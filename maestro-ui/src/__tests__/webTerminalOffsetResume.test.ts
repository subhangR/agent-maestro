import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalTransport } from '../platform/types';

/**
 * Offset-resume layer on top of #140's reconnect lifecycle
 * (maestro-ui/src/platform/terminal.ts).
 *
 * #140 made a dropped `/pty` socket reconnect and replay the server's FULL ring,
 * resetting xterm each time. This layer swaps that repaint model for byte-offset
 * resume:
 *  - Every connect carries `?offset=<rawBytesSeen>` (0 on the first-ever connect).
 *  - The server answers with a text `attached{base,gap,next,hasReplay}` frame.
 *    `next` is the RAW server-authoritative end-of-stream offset; the client snaps
 *    its counter to `next` (never derives it from what it locally counted).
 *  - When `hasReplay` is set, exactly one binary frame follows and is DISPLAY-ONLY:
 *    rendered but NOT counted, because `next` already accounts for those bytes.
 *  - All *live* binary frames after that advance the offset by their raw byteLength.
 *  - The streaming UTF-8 decoder PERSISTS across a normal reconnect (so a glyph
 *    split across the disconnect boundary is completed by the replay delta), and
 *    onReattach does NOT fire — the terminal is not reset.
 *  - Only a `gap>0` (eviction) or a base-rewind (cross-stream respawn) resets the
 *    decoder and fires onReattach so the UI can reset xterm.
 *
 * Offsets count RAW PTY bytes end-to-end; the replay slice may be shorter than
 * `next-base` (the server sanitizes device queries out of it for display), which
 * is exactly why the client trusts `next` and never counts the replay frame.
 */

const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;
const CONNECTING = 0;

class MockWebSocket {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSING = CLOSING;
  static readonly CLOSED = CLOSED;
  static instances: MockWebSocket[] = [];

  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSING = CLOSING;
  readonly CLOSED = CLOSED;

  readyState = CONNECTING;
  binaryType = '';
  url: string;
  sent: Array<string | Uint8Array> = [];

  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.onclose?.({ code, reason });
  }

  triggerOpen(): void {
    this.readyState = OPEN;
    this.onopen?.({});
  }

  triggerClose(code: number): void {
    this.readyState = CLOSED;
    this.onclose?.({ code });
  }

  triggerMessage(data: unknown): void {
    this.onmessage?.({ data });
  }
}

/** Raw ArrayBuffer of the given byte values (a live/replay binary frame). */
function bytes(...vals: number[]): ArrayBuffer {
  return Uint8Array.from(vals).buffer;
}

/** Raw ArrayBuffer of a UTF-8 string (a live binary frame). */
function textBytes(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

/** The `attached{...}` control frame the server sends first on every connect. */
function attached(a: { base: number; gap: number; next: number; hasReplay: boolean }): string {
  return JSON.stringify({ type: 'attached', ...a });
}

/** Extract the numeric `offset=` query param from a mock socket's URL. */
function offsetOf(ws: MockWebSocket): number {
  const m = /[?&]offset=(\d+)/.exec(ws.url);
  if (!m) throw new Error(`no offset in URL: ${ws.url}`);
  return Number(m[1]);
}

describe('webTerminal offset resume', () => {
  let webTerminal: TerminalTransport;

  beforeEach(async () => {
    vi.resetModules();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // deterministic backoff
    ({ webTerminal } = await import('../platform/terminal'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function create(id: string): Promise<void> {
    await webTerminal.createSession({
      name: null,
      command: null,
      cwd: null,
      envVars: null,
      persistent: true,
      persistId: id,
      maestroSessionId: id,
    });
  }

  it('sends offset=0 on the first-ever connect', async () => {
    await create('sess-init');
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(offsetOf(MockWebSocket.instances[0])).toBe(0);
  });

  it('advances the offset by raw byteLength of each live frame and sends it on reconnect', async () => {
    await create('sess-live');
    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false }));
    ws0.triggerMessage(textBytes('AAA')); // 3 raw bytes
    ws0.triggerMessage(textBytes('BB')); // 2 raw bytes

    ws0.triggerClose(1006); // transport drop -> reconnect
    await vi.advanceTimersByTimeAsync(1000);

    expect(MockWebSocket.instances).toHaveLength(2);
    // Reconnect resumes from exactly the raw bytes seen live: 3 + 2 = 5.
    expect(offsetOf(MockWebSocket.instances[1])).toBe(5);
  });

  it('snaps the offset authoritatively to attached.next, not to what it locally counted', async () => {
    await create('sess-snap');
    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false }));
    ws0.triggerMessage(textBytes('AAA')); // local count would be 3
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    expect(offsetOf(ws1)).toBe(3);
    ws1.triggerOpen();
    // Server says the true end-of-stream is 10 (7 more raw bytes existed than the
    // client counted — e.g. output between the drop and the resume request).
    ws1.triggerMessage(attached({ base: 3, gap: 0, next: 10, hasReplay: false }));
    ws1.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    // Next reconnect must resume from the authoritative `next` (10), not 3.
    expect(offsetOf(MockWebSocket.instances[2])).toBe(10);
  });

  it('renders exactly one replay frame display-only (not counted) so the next reconnect never re-requests it', async () => {
    const onOutput = vi.fn();
    await webTerminal.onOutput(onOutput);
    await create('sess-replay');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false }));
    ws0.triggerMessage(textBytes('AAA')); // 3 live bytes -> offset 3
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    expect(offsetOf(ws1)).toBe(3);
    ws1.triggerOpen();
    // Resume from offset 3: the server produced 2 more RAW bytes while we were
    // gone (next=5), but sanitized a device query out of the replay slice, so the
    // display-only frame is only 1 byte ('X'). The client must trust `next`, NOT
    // the replay length — this is the byte-coordinate crux (raw offsets vs
    // sanitized display bytes).
    ws1.triggerMessage(attached({ base: 3, gap: 0, next: 5, hasReplay: true }));
    ws1.triggerMessage(textBytes('X')); // sanitized replay (1 byte) — rendered, NOT counted
    ws1.triggerMessage(textBytes('YY')); // live -> offset 5 + 2 = 7
    ws1.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    // The replay content was rendered to the terminal...
    const outputs = onOutput.mock.calls.map((c) => c[1]);
    expect(outputs).toContain('X');
    // ...but the second reconnect resumes at next(5) + liveBytes(2) = 7 — never
    // 5+1+2=8 (double-counting the replay) nor 3+... (ignoring the authoritative
    // snap). Offset accounting is fully decoupled from what was painted.
    expect(offsetOf(MockWebSocket.instances[2])).toBe(7);
  });

  it('persists the decoder across a normal reconnect so a glyph split across the boundary is completed by the replay delta', async () => {
    const onOutput = vi.fn();
    const onReattach = vi.fn();
    await webTerminal.onOutput(onOutput);
    await webTerminal.onReattach?.(onReattach);
    await create('sess-decoder-persist');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false }));
    // Lead byte of "©" (0xC2 0xA9); trailing byte hasn't arrived when the socket dies.
    ws0.triggerMessage(bytes(0xc2)); // 1 live byte -> offset 1
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    expect(offsetOf(ws1)).toBe(1);
    ws1.triggerOpen();
    // Normal reattach (gap 0, no rewind): decoder persists, no xterm reset.
    ws1.triggerMessage(attached({ base: 1, gap: 0, next: 1, hasReplay: true }));
    ws1.triggerMessage(bytes(0xa9)); // replay delta = the trailing byte of "©"

    expect(onReattach).not.toHaveBeenCalled();
    const outputs = onOutput.mock.calls.map((c) => c[1]);
    // The persisted decoder completes "©" instead of emitting a replacement char.
    expect(outputs.join('')).toContain('©');
    expect(outputs.join('')).not.toContain('�');
  });

  it('resets the decoder and fires onReattach on a gap (eviction)', async () => {
    const onOutput = vi.fn();
    const onReattach = vi.fn();
    await webTerminal.onOutput(onOutput);
    await webTerminal.onReattach?.(onReattach);
    await create('sess-gap');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false }));
    ws0.triggerMessage(bytes(0xc2)); // dangling lead byte in the decoder
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    ws1.triggerOpen();
    // Eviction: bytes below base were dropped. Reset decoder + reset xterm.
    ws1.triggerMessage(attached({ base: 512, gap: 511, next: 1024, hasReplay: true }));
    ws1.triggerMessage(textBytes('hi')); // replay of the surviving window

    expect(onReattach).toHaveBeenCalledTimes(1);
    expect(onReattach).toHaveBeenCalledWith('sess-gap');
    const joined = onOutput.mock.calls.map((c) => c[1]).join('');
    // The dangling 0xC2 was dropped with the reset, so nothing corrupts 'hi'.
    expect(joined).toContain('hi');
    expect(joined).not.toContain('�');
    // Offset snapped to the authoritative next.
    ws1.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);
    expect(offsetOf(MockWebSocket.instances[2])).toBe(1024);
  });

  it('resets the decoder and fires onReattach on a base-rewind (cross-stream respawn)', async () => {
    const onReattach = vi.fn();
    await webTerminal.onReattach?.(onReattach);
    await create('sess-rewind');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false }));
    ws0.triggerMessage(textBytes('hello')); // offset -> 5
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    expect(offsetOf(ws1)).toBe(5);
    ws1.triggerOpen();
    // A fresh PTY under the same session id: its stream restarts at base 0, which
    // is BELOW the 5 bytes this client already saw -> a rewind, not a resume.
    ws1.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false }));

    expect(onReattach).toHaveBeenCalledTimes(1);
    expect(onReattach).toHaveBeenCalledWith('sess-rewind');
  });

  it('does not skip-count a live frame when a prior attached promised a replay that never arrived', async () => {
    await create('sess-stale-replay');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false }));
    ws0.triggerMessage(textBytes('AAA')); // offset -> 3
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    expect(offsetOf(ws1)).toBe(3);
    ws1.triggerOpen();
    // Server promises a replay (hasReplay:true) then the socket dies BEFORE the
    // single replay frame is delivered. The offset is snapped to next(8), but the
    // one-shot "expect replay" flag must not survive into the next connect.
    ws1.triggerMessage(attached({ base: 3, gap: 0, next: 8, hasReplay: true }));
    ws1.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws2 = MockWebSocket.instances[2];
    expect(offsetOf(ws2)).toBe(8);
    ws2.triggerOpen();
    // This connect has nothing to replay. The next binary is a genuine LIVE frame
    // and must advance the offset — a stale replay flag would wrongly skip it.
    ws2.triggerMessage(attached({ base: 8, gap: 0, next: 8, hasReplay: false }));
    ws2.triggerMessage(textBytes('ZZ')); // live -> offset 8 + 2 = 10
    ws2.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    // Without clearing the stale flag, 'ZZ' is dropped and this stays at 8.
    expect(offsetOf(MockWebSocket.instances[3])).toBe(10);
  });

  it('does not fire onReattach on the first-ever connect', async () => {
    const onReattach = vi.fn();
    await webTerminal.onReattach?.(onReattach);
    await create('sess-first');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false }));

    expect(onReattach).not.toHaveBeenCalled();
  });
});
