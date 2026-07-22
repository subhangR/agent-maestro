import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalTransport } from '../platform/types';

/**
 * webTerminal (maestro-ui/src/platform/terminal.ts) is the browser-side PTY
 * transport used by `bun run web`. Each session gets exactly one `/pty`
 * WebSocket. Before this fix that socket had no reconnect logic at all: a
 * laptop lid close/reopen (or any transport drop) froze the terminal forever
 * because nothing re-opened the dropped socket, even though the server-hosted
 * PTY (the actual Claude process) kept running the whole time.
 *
 * These tests pin the reconnect state machine against a mock WebSocket:
 *  - LOGICAL END (server close code 1011, or a prior {type:'exit'} frame)
 *    must NOT reconnect and must fire onExit exactly once.
 *  - TRANSPORT DROP (any other close code, e.g. 1006) while the session is
 *    still "active" (createSession called, closeSession not yet called) MUST
 *    reconnect, with exponential backoff that resets after a successful open.
 *  - closeSession() must permanently stop any further reconnect attempts.
 *
 * NOTE: the reattach REPAINT model (whether a reconnect resets xterm / drops the
 * streaming decoder) moved to the byte-offset resume layer — it is now driven by
 * the server's `attached{gap,next}` ack rather than fired eagerly on every
 * reconnect. Those behaviors are pinned in webTerminalOffsetResume.test.ts. This
 * suite only asserts that a bare reconnect does NOT eagerly reset (see the
 * onReattach case below).
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

  // --- test helpers, not part of the real WebSocket API ---
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

function bytes(...vals: number[]): ArrayBuffer {
  return Uint8Array.from(vals).buffer;
}

function textBytes(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

describe('webTerminal reconnect on transport drop', () => {
  let webTerminal: TerminalTransport;

  beforeEach(async () => {
    vi.resetModules();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.useFakeTimers();
    // Deterministic backoff: jitter = Math.random() * baseDelay * 0.5.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    ({ webTerminal } = await import('../platform/terminal'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function firstSocket(): MockWebSocket {
    return MockWebSocket.instances[0];
  }

  it('opens exactly one socket on createSession and does not reconnect on a clean 1011 (logical end)', async () => {
    const onExit = vi.fn();
    await webTerminal.onExit(onExit);
    await webTerminal.createSession({
      name: null,
      command: null,
      cwd: null,
      envVars: null,
      persistent: true,
      persistId: 'p1',
      maestroSessionId: 'sess-1011',
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    firstSocket().triggerClose(1011);

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith('sess-1011', null);

    // No reconnect should ever be scheduled for a logical end.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('does not reconnect or double-fire onExit after a {type:"exit"} frame followed by the server closing the socket', async () => {
    const onExit = vi.fn();
    await webTerminal.onExit(onExit);
    await webTerminal.createSession({
      name: null,
      command: null,
      cwd: null,
      envVars: null,
      persistent: true,
      persistId: 'p2',
      maestroSessionId: 'sess-exit',
    });

    const ws = firstSocket();
    ws.triggerOpen();
    ws.triggerMessage(JSON.stringify({ type: 'exit', exitCode: 3 }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith('sess-exit', 3);

    // PtyHostService closes every subscriber right after the exit frame —
    // simulate that close (often a plain 1000, not 1011).
    ws.triggerClose(1000);

    expect(onExit).toHaveBeenCalledTimes(1); // not fired again
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances).toHaveLength(1); // no reconnect
  });

  it('reconnects with exponential backoff + jitter on a transport drop, and resets the backoff after a successful open', async () => {
    const onExit = vi.fn();
    await webTerminal.onExit(onExit);
    await webTerminal.createSession({
      name: null,
      command: null,
      cwd: null,
      envVars: null,
      persistent: true,
      persistId: 'p3',
      maestroSessionId: 'sess-drop',
    });

    const ws0 = firstSocket();
    ws0.triggerOpen();

    // First drop (code 1006 — e.g. the laptop lid closing/reopening). attempts=0 -> delay 1000ms.
    ws0.triggerClose(1006);
    expect(onExit).not.toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(1); // not yet — still backing off
    await vi.advanceTimersByTimeAsync(999);
    expect(MockWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second drop before the reconnect ever opens: attempts=1 -> delay 2000ms.
    const ws1 = MockWebSocket.instances[1];
    ws1.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1999);
    expect(MockWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    // This time let it open successfully — backoff should reset to attempt 0.
    const ws2 = MockWebSocket.instances[2];
    ws2.triggerOpen();
    ws2.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(999);
    expect(MockWebSocket.instances).toHaveLength(3); // still waiting (proves NOT still at a larger backoff)
    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(4); // fired at the reset (1000ms) delay, not 4000ms

    expect(onExit).not.toHaveBeenCalled();
  });

  it('stops reconnecting once closeSession has been called', async () => {
    await webTerminal.createSession({
      name: null,
      command: null,
      cwd: null,
      envVars: null,
      persistent: true,
      persistId: 'p4',
      maestroSessionId: 'sess-closed',
    });

    const ws0 = firstSocket();
    ws0.triggerOpen();

    await webTerminal.closeSession('sess-closed');
    // closeSession() itself calls ws.close(), which the mock treats as a plain
    // close (default code 1000) — exactly like a transport drop's close event,
    // except the session is no longer "active".
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('does not eagerly fire onReattach on a bare reconnect (the repaint decision is deferred to the attached ack)', async () => {
    const onReattach = vi.fn();
    await webTerminal.onReattach?.(onReattach);
    await webTerminal.createSession({
      name: null,
      command: null,
      cwd: null,
      envVars: null,
      persistent: true,
      persistId: 'p5',
      maestroSessionId: 'sess-reattach',
    });

    expect(onReattach).not.toHaveBeenCalled();

    const ws0 = firstSocket();
    ws0.triggerOpen();
    ws0.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);

    // The socket reconnects, but onReattach is NOT fired just because a reconnect
    // happened. Under offset resume the terminal is only reset when the server's
    // `attached` ack reports a gap/rewind — see webTerminalOffsetResume.test.ts.
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(onReattach).not.toHaveBeenCalled();
  });

  it('registers the visibilitychange/online wake listeners exactly once, and immediately re-attaches a non-open active socket on wake', async () => {
    const addDocListener = vi.spyOn(document, 'addEventListener');
    const addWinListener = vi.spyOn(window, 'addEventListener');

    await webTerminal.createSession({
      name: null,
      command: null,
      cwd: null,
      envVars: null,
      persistent: true,
      persistId: 'p7',
      maestroSessionId: 'sess-wake-1',
    });
    await webTerminal.createSession({
      name: null,
      command: null,
      cwd: null,
      envVars: null,
      persistent: true,
      persistId: 'p8',
      maestroSessionId: 'sess-wake-2',
    });

    const visibilityRegistrations = addDocListener.mock.calls.filter(
      (c) => c[0] === 'visibilitychange',
    );
    const onlineRegistrations = addWinListener.mock.calls.filter((c) => c[0] === 'online');
    expect(visibilityRegistrations).toHaveLength(1);
    expect(onlineRegistrations).toHaveLength(1);

    // sess-wake-1 drops and starts a long backoff wait...
    const ws0 = MockWebSocket.instances[0];
    ws0.triggerOpen();
    ws0.triggerClose(1006);
    expect(MockWebSocket.instances).toHaveLength(2); // wake-1's socket, wake-2's socket

    // ...then the machine wakes before the backoff timer would have fired.
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    // Reattach happens synchronously on the event, no timer advance needed.
    expect(MockWebSocket.instances).toHaveLength(3);
  });
});
