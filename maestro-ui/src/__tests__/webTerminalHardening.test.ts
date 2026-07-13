import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalTransport } from '../platform/types';

/**
 * Reconnect hardening for the browser-side PTY transport
 * (maestro-ui/src/platform/terminal.ts), issue #152.
 *
 * Two independent hardenings are pinned here:
 *
 *  1. BOUNDED PENDING INPUT. While a socket is down (reconnecting), user input
 *     and resize frames are queued so they flush on the next open. That queue
 *     must never grow without bound: it is capped by BOTH a total byte budget
 *     and an entry count. On overflow the OLDEST retained frames are dropped
 *     (FIFO eviction) so the newest input survives, and an observable warning is
 *     emitted. The retained frames flush in FIFO order.
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

  // ── 1. Bounded pending input ──────────────────────────────────────────────

  it('bounds queued input by total bytes, dropping the OLDEST frames and warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-bytes');
    const ws0 = MockWebSocket.instances[0];
    // Socket is CONNECTING (never opened) — every write is queued, not sent.

    // 100 frames of 4096 bytes = 400 KiB, over the 256 KiB byte cap. Each frame
    // is tagged with its index so we can prove which survived and in what order.
    const FRAME = 4096;
    const COUNT = 100;
    for (let i = 0; i < COUNT; i++) {
      const tag = String(i).padStart(6, '0');
      webTerminal.write('sess-bytes', tag + 'x'.repeat(FRAME - tag.length));
    }
    expect(ws0.sent).toHaveLength(0); // nothing sent yet — all queued

    ws0.triggerOpen(); // flush the retained queue in FIFO order
    const retainedBytes = ws0.sent.reduce((n, f) => n + byteLen(f), 0);
    const indices = ws0.sent.map((f) => Number(decode(f).slice(0, 6)));

    expect(warn).toHaveBeenCalled(); // overflow is observable
    // Retained within the documented 256 KiB byte cap, so the oldest were dropped.
    expect(retainedBytes).toBeLessThanOrEqual(256 * 1024);
    expect(retainedBytes).toBeLessThan(COUNT * FRAME);
    // Exactly the newest 64 frames (64 * 4096 == 262144 == the cap) survive.
    expect(ws0.sent).toHaveLength(64);
    expect(indices[0]).toBe(36); // frames 0..35 evicted (drop-oldest)
    expect(indices[indices.length - 1]).toBe(99); // newest kept
    // Contiguous ascending == FIFO order preserved for the retained suffix.
    for (let k = 1; k < indices.length; k++) {
      expect(indices[k] - indices[k - 1]).toBe(1);
    }
  });

  it('bounds queued input by entry count, dropping the OLDEST frames and warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await create('sess-entries');
    const ws0 = MockWebSocket.instances[0];

    // 1200 tiny frames (well under the byte cap) exceed the 1024-entry cap. The
    // FIRST/LAST sentinels prove the oldest is dropped and the newest survives.
    webTerminal.write('sess-entries', 'FIRST');
    for (let i = 0; i < 1198; i++) webTerminal.write('sess-entries', 'f');
    webTerminal.write('sess-entries', 'LAST');
    expect(ws0.sent).toHaveLength(0);

    ws0.triggerOpen();

    expect(warn).toHaveBeenCalled();
    expect(ws0.sent).toHaveLength(1024); // capped at the documented entry cap
    expect(decode(ws0.sent[0])).not.toBe('FIRST'); // oldest evicted
    expect(decode(ws0.sent[ws0.sent.length - 1])).toBe('LAST'); // newest retained
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
