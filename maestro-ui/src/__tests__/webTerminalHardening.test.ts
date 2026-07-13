import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalTransport } from '../platform/types';

/**
 * Reconnect hardening for the browser-side PTY transport
 * (maestro-ui/src/platform/terminal.ts), issue #152.
 *
 * Two independent hardenings are pinned here:
 *
 *  1. BOUNDED PENDING INPUT (FAIL-CLOSED). While a socket is down (reconnecting),
 *     user input and resize frames are queued so they flush on the next open.
 *     That queue must never grow without bound: it is capped by BOTH a total byte
 *     budget and an entry count. On overflow the queue FAILS CLOSED — the ENTIRE
 *     pending queue (including the triggering frame) is dropped, the session is
 *     latched, and every subsequent frame is dropped until a socket successfully
 *     opens (which resets the latch and flushes nothing). This is deliberately
 *     stricter than drop-oldest FIFO: a chunked paste that overflows must send
 *     ZERO tail on reconnect, because a retained suffix could flush as a partial
 *     shell command. There is NO oversized-frame exception — a single paste
 *     larger than the cap fails closed too, since it can execute unexpectedly
 *     after reconnect. Overflow is observable via a single console warning per
 *     episode. Within the caps, nothing is dropped and frames flush in FIFO order.
 *
 *  2. STAGGERED WAKE RECONNECTS. On wake (`visibilitychange`/`online`) every
 *     dropped session wants to reconnect. Reconnecting them all at once herds
 *     the server, so exactly ONE terminal reconnects immediately (foreground
 *     promptness) and the rest are spread over deterministic (bounded-jitter)
 *     delays — with no duplicate timer per session, and idempotent across
 *     repeated wake events.
 *
 * #140 logical-end (1011/exit) and #136 raw-offset resume behavior are covered
 * elsewhere (webTerminalReconnect / webTerminalOffsetResume) and must remain
 * intact.
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

function decode(frame: string | Uint8Array): string {
  return typeof frame === 'string' ? frame : new TextDecoder().decode(frame);
}

function byteLen(frame: string | Uint8Array): number {
  return typeof frame === 'string' ? new TextEncoder().encode(frame).length : frame.byteLength;
}

describe('webTerminal input & wake hardening (#152)', () => {
  let webTerminal: TerminalTransport;

  beforeEach(async () => {
    vi.resetModules();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.useFakeTimers();
    // Deterministic timing: bounded jitter collapses to 0.
    vi.spyOn(Math, 'random').mockReturnValue(0);
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

  // ── 1. Bounded pending input (fail-closed) ────────────────────────────────

  it('fails closed on byte-cap overflow: clears the whole queue, warns once, flushes nothing on open', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-bytes');
    const ws0 = MockWebSocket.instances[0];
    // Socket is CONNECTING (never opened) — every write is queued, not sent.

    // 100 frames of 4096 bytes = 400 KiB, over the 256 KiB byte cap.
    const FRAME = 4096;
    const COUNT = 100;
    for (let i = 0; i < COUNT; i++) webTerminal.write('sess-bytes', 'x'.repeat(FRAME));
    expect(ws0.sent).toHaveLength(0); // nothing sent yet — all queued

    ws0.triggerOpen(); // a reconnect would flush the queue here

    expect(warn).toHaveBeenCalledTimes(1); // overflow observable, exactly once
    // Fail-closed: the ENTIRE queue (including the frame that tipped it over) was
    // dropped and the session latched, so nothing survives to flush.
    expect(ws0.sent).toHaveLength(0);
  });

  it('fails closed on entry-cap overflow: clears the whole queue, warns once, flushes nothing on open', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-entries');
    const ws0 = MockWebSocket.instances[0];

    // 1200 tiny frames (well under the byte cap) exceed the 1024-entry cap.
    webTerminal.write('sess-entries', 'FIRST');
    for (let i = 0; i < 1198; i++) webTerminal.write('sess-entries', 'f');
    webTerminal.write('sess-entries', 'LAST');
    expect(ws0.sent).toHaveLength(0);

    ws0.triggerOpen();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(ws0.sent).toHaveLength(0); // fail-closed: whole queue dropped
  });

  it('sends ZERO tail of a chunked paste after overflow and reconnect (no partial command survives)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-paste');
    const ws0 = MockWebSocket.instances[0];

    // A large paste delivered as many chunks while the socket is down. Its TAIL is
    // a standalone-executable command. Drop-oldest eviction would have retained
    // exactly this suffix and flushed it as a real shell command on reconnect.
    const CHUNK = 8192;
    for (let i = 0; i < 40; i++) webTerminal.write('sess-paste', 'x'.repeat(CHUNK)); // 320 KiB > cap
    webTerminal.write('sess-paste', 'rm -rf ~/important\n'); // the dangerous tail

    ws0.triggerOpen(); // reconnect: the queue would flush here

    expect(warn).toHaveBeenCalledTimes(1);
    // Fail-closed: whole queue cleared, so nothing flushes — the tail never
    // reaches the shell.
    expect(ws0.sent).toHaveLength(0);
    expect(ws0.sent.map(decode).join('')).not.toContain('rm -rf');
  });

  it('drops frames queued AFTER overflow (before the socket opens) and warns only once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-after');
    const ws0 = MockWebSocket.instances[0];

    // Overflow the byte cap to latch the session.
    for (let i = 0; i < 100; i++) webTerminal.write('sess-after', 'x'.repeat(4096));
    // Frames typed while still latched-and-down must ALSO be dropped, silently.
    webTerminal.write('sess-after', 'AFTER-1');
    webTerminal.write('sess-after', 'AFTER-2');

    ws0.triggerOpen();

    expect(warn).toHaveBeenCalledTimes(1); // subsequent drops do NOT re-warn
    expect(ws0.sent).toHaveLength(0);
    expect(ws0.sent.map(decode).join('')).not.toContain('AFTER');
  });

  it('resets the latch only on a successful open, then sends/queues normally again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-latch');
    const ws0 = MockWebSocket.instances[0];

    // Overflow → latch while ws0 is still CONNECTING.
    for (let i = 0; i < 100; i++) webTerminal.write('sess-latch', 'x'.repeat(4096));
    expect(warn).toHaveBeenCalledTimes(1);

    // ws0 drops before it ever opens → a backoff reconnect is scheduled. The
    // latch must PERSIST across the drop (it resets only on a real open).
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000); // attempts=0 → 1000ms backoff, jitter 0
    const ws1 = MockWebSocket.instances[1];
    expect(ws1).toBeDefined();

    // Still latched (ws1 has not opened yet) → this frame is dropped.
    webTerminal.write('sess-latch', 'STILL-DROPPED');

    ws1.triggerOpen(); // successful open → latch resets, flushes nothing
    expect(ws1.sent).toHaveLength(0);

    // After open the transport is healthy again: input sends straight through.
    webTerminal.write('sess-latch', 'OK-NOW');
    expect(ws1.sent.map(decode)).toEqual(['OK-NOW']);
    expect(warn).toHaveBeenCalledTimes(1); // no second overflow, still one warning
  });

  it('fails closed on a single oversized frame: drops it, warns once, flushes nothing on open', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-big');
    const ws0 = MockWebSocket.instances[0];

    // ONE write larger than the byte cap. There is NO oversized-frame exception:
    // a huge single paste can still execute unexpectedly after reconnect, so it
    // fails closed like any other overflow — dropped, latched, one warning.
    const big = 'y'.repeat(300 * 1024);
    webTerminal.write('sess-big', big);

    ws0.triggerOpen();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(ws0.sent).toHaveLength(0);
  });

  it('does not warn or drop when queued input stays within the caps', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-under');
    const ws0 = MockWebSocket.instances[0];

    webTerminal.write('sess-under', 'a');
    webTerminal.write('sess-under', 'b');
    webTerminal.write('sess-under', 'c');
    ws0.triggerOpen();

    expect(warn).not.toHaveBeenCalled();
    expect(ws0.sent.map(decode)).toEqual(['a', 'b', 'c']); // FIFO, nothing dropped
  });

  it('clears the overflow latch on explicit close so a re-created session is not stuck latched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-reuse');
    const ws0 = MockWebSocket.instances[0];

    for (let i = 0; i < 100; i++) webTerminal.write('sess-reuse', 'x'.repeat(4096)); // latch
    expect(warn).toHaveBeenCalledTimes(1);

    await webTerminal.closeSession('sess-reuse'); // must clear the latch (no leak)

    // Re-create the same id; input typed before the fresh socket opens must queue,
    // proving the latch did not leak across the close.
    await create('sess-reuse');
    const ws1 = MockWebSocket.instances[1];
    webTerminal.write('sess-reuse', 'hello');
    ws1.triggerOpen();

    expect(ws1.sent.map(decode)).toEqual(['hello']);
  });

  it('clears the overflow latch on logical end (1011) so a reused id starts fresh', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-end');
    const ws0 = MockWebSocket.instances[0];

    for (let i = 0; i < 100; i++) webTerminal.write('sess-end', 'x'.repeat(4096)); // latch
    expect(warn).toHaveBeenCalledTimes(1);

    ws0.triggerClose(1011); // logical end — server has no live PTY; must clear latch

    await create('sess-end');
    const ws1 = MockWebSocket.instances[1];
    webTerminal.write('sess-end', 'hi');
    ws1.triggerOpen();

    expect(ws1.sent.map(decode)).toEqual(['hi']);
  });

  // ── 2. Staggered wake reconnects ──────────────────────────────────────────

  it('staggers wake reconnects: first is immediate, the rest are deterministically delayed', async () => {
    await create('sess-a');
    await create('sess-b');
    await create('sess-c');
    expect(MockWebSocket.instances).toHaveLength(3);

    // Drop all three (transport drops). Each schedules a backoff reconnect that
    // wake will supersede.
    for (const ws of [...MockWebSocket.instances]) ws.triggerClose(1006);

    // Machine wakes.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Only the first active session reconnects immediately.
    expect(MockWebSocket.instances).toHaveLength(4);

    await vi.advanceTimersByTimeAsync(249);
    expect(MockWebSocket.instances).toHaveLength(4); // second still waiting its stagger slot
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(5); // second reconnects at ~250ms

    await vi.advanceTimersByTimeAsync(249);
    expect(MockWebSocket.instances).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(6); // third reconnects at ~500ms
  });

  it('reconnects a single terminal immediately on wake (no stagger delay)', async () => {
    await create('sess-solo');
    expect(MockWebSocket.instances).toHaveLength(1);
    MockWebSocket.instances[0].triggerClose(1006);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Immediate — no timer advance needed.
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('is idempotent across repeated wakes: no duplicate reconnect or timer per session', async () => {
    await create('sess-i1');
    await create('sess-i2');
    for (const ws of [...MockWebSocket.instances]) ws.triggerClose(1006);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // i1 immediate, i2 staggered.
    expect(MockWebSocket.instances).toHaveLength(3);

    // A second wake fires before i2's stagger timer would have. i1 already has a
    // live (CONNECTING) socket so it must NOT spawn another; i2's timer must be
    // replaced, not duplicated.
    document.dispatchEvent(new Event('visibilitychange'));
    expect(MockWebSocket.instances).toHaveLength(3); // no duplicate immediate reconnect

    await vi.advanceTimersByTimeAsync(250);
    // i2 reconnects exactly once despite two wakes — a single timer per session.
    expect(MockWebSocket.instances).toHaveLength(4);

    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(4); // nothing else fires
  });
});
