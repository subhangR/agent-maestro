import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalTransport } from '../platform/types';

/**
 * Stream-identity (epoch) reset semantics on top of #136's byte-offset resume
 * (maestro-ui/src/platform/terminal.ts), issue #151.
 *
 * Before #151 the client inferred a cross-stream respawn purely from byte-count
 * heuristics: a `gap>0` eviction or a `base` that rewound below what it had
 * already consumed. That is fragile — a respawn whose fresh stream happens to
 * emit at least as many bytes as the old one (so `base` does NOT rewind) looks
 * exactly like a normal resume, and stale scrollback is silently kept.
 *
 * #151 adds an OPTIONAL opaque `epoch` to the `attached` ack. The server mints a
 * new epoch on every spawn and across restarts; the client compares it by
 * equality only. The three documented reset sources are:
 *   - EPOCH change  (authoritative respawn/restart) — resets regardless of bytes.
 *   - GAP           (honest bounded eviction) — resets whether or not an epoch is
 *                    present.
 *   - LEGACY rewind (`base < received`) — the pre-#151 heuristic, consulted ONLY
 *                    when no epoch is present.
 *
 * When an epoch is present it is authoritative: a same epoch resumes normally
 * (and SUPERSEDES the legacy base-rewind heuristic), a changed epoch resets even
 * when the byte counts did not rewind. When no epoch is present the client
 * preserves the exact legacy gap/base-rewind behavior for back-compat.
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

/** Raw ArrayBuffer of a UTF-8 string (a live/replay binary frame). */
function textBytes(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

/** The `attached{...}` control frame, optionally carrying an epoch (#151). */
function attached(a: {
  base: number;
  gap: number;
  next: number;
  hasReplay: boolean;
  epoch?: string;
}): string {
  return JSON.stringify({ type: 'attached', ...a });
}

/** Extract the numeric `offset=` query param from a mock socket's URL. */
function offsetOf(ws: MockWebSocket): number {
  const m = /[?&]offset=(\d+)/.exec(ws.url);
  if (!m) throw new Error(`no offset in URL: ${ws.url}`);
  return Number(m[1]);
}

describe('webTerminal stream epoch reset semantics (#151)', () => {
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

  it('does NOT reset on a normal resume carrying the same epoch', async () => {
    const onReattach = vi.fn();
    await webTerminal.onReattach?.(onReattach);
    await create('sess-same-epoch');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false, epoch: 'E1' }));
    ws0.triggerMessage(textBytes('AAA')); // offset -> 3
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    expect(offsetOf(ws1)).toBe(3);
    ws1.triggerOpen();
    // Same stream (epoch E1), no gap, no rewind — a normal resume.
    ws1.triggerMessage(attached({ base: 3, gap: 0, next: 3, hasReplay: true, epoch: 'E1' }));
    ws1.triggerMessage(textBytes('X')); // display-only replay

    expect(onReattach).not.toHaveBeenCalled();
  });

  it('resets on a changed epoch even when base/gap did NOT rewind', async () => {
    const onReattach = vi.fn();
    await webTerminal.onReattach?.(onReattach);
    await create('sess-epoch-change');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false, epoch: 'E1' }));
    ws0.triggerMessage(textBytes('hello')); // offset -> 5
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    expect(offsetOf(ws1)).toBe(5);
    ws1.triggerOpen();
    // A respawn whose fresh stream did NOT rewind the byte counts: base(5) is not
    // below received(5) and gap is 0, so the legacy heuristic would see a normal
    // resume. Only the CHANGED epoch (E1 -> E2) reveals the new stream.
    ws1.triggerMessage(attached({ base: 5, gap: 0, next: 5, hasReplay: false, epoch: 'E2' }));

    expect(onReattach).toHaveBeenCalledTimes(1);
    expect(onReattach).toHaveBeenCalledWith('sess-epoch-change');
  });

  it('lets a present epoch SUPERSEDE the legacy base-rewind heuristic (same epoch, base rewound → no reset)', async () => {
    const onReattach = vi.fn();
    await webTerminal.onReattach?.(onReattach);
    await create('sess-epoch-supersede');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false, epoch: 'E1' }));
    ws0.triggerMessage(textBytes('hello')); // offset -> 5
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    ws1.triggerOpen();
    // base(0) < received(5) would trip the legacy rewind reset — but the epoch is
    // unchanged (E1), which authoritatively says "same stream". Epoch wins.
    ws1.triggerMessage(attached({ base: 0, gap: 0, next: 5, hasReplay: false, epoch: 'E1' }));

    expect(onReattach).not.toHaveBeenCalled();
  });

  it('still resets on a gap (eviction) even when the epoch is unchanged', async () => {
    const onReattach = vi.fn();
    await webTerminal.onReattach?.(onReattach);
    await create('sess-epoch-gap');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false, epoch: 'E1' }));
    ws0.triggerMessage(textBytes('AAA')); // offset -> 3
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    ws1.triggerOpen();
    // Same stream (E1) but the server evicted bytes below base: honest bounded
    // loss, so the on-screen buffer is no longer a clean prefix and must reset.
    ws1.triggerMessage(attached({ base: 512, gap: 511, next: 1024, hasReplay: true, epoch: 'E1' }));
    ws1.triggerMessage(textBytes('hi'));

    expect(onReattach).toHaveBeenCalledTimes(1);
    expect(onReattach).toHaveBeenCalledWith('sess-epoch-gap');
  });

  it('preserves the legacy base-rewind reset when NO epoch is present (back-compat)', async () => {
    const onReattach = vi.fn();
    await webTerminal.onReattach?.(onReattach);
    await create('sess-no-epoch-rewind');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false })); // no epoch
    ws0.triggerMessage(textBytes('hello')); // offset -> 5
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    ws1.triggerOpen();
    // Pre-#151 server: no epoch on the ack. base(0) < received(5) is the ONLY
    // signal available, and it must still fire the legacy rewind reset.
    ws1.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false })); // no epoch

    expect(onReattach).toHaveBeenCalledTimes(1);
    expect(onReattach).toHaveBeenCalledWith('sess-no-epoch-rewind');
  });

  it('does NOT reset a normal legacy resume when NO epoch is present (back-compat)', async () => {
    const onReattach = vi.fn();
    await webTerminal.onReattach?.(onReattach);
    await create('sess-no-epoch-normal');

    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false })); // no epoch
    ws0.triggerMessage(textBytes('AAA')); // offset -> 3
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    const ws1 = MockWebSocket.instances[1];
    ws1.triggerOpen();
    // No epoch, no gap, no rewind (base == received) — a normal legacy resume.
    ws1.triggerMessage(attached({ base: 3, gap: 0, next: 3, hasReplay: true })); // no epoch
    ws1.triggerMessage(textBytes('X'));

    expect(onReattach).not.toHaveBeenCalled();
  });
});
