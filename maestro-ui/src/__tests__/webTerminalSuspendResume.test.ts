import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalTransport } from '../platform/types';

/**
 * Lazy-terminal suspend/resume on top of the offset-resume transport
 * (maestro-ui/src/platform/terminal.ts).
 *
 * suspend(id) closes an offscreen session's socket WITHOUT killing the server
 * PTY or the client's resume offset, and without auto-reconnecting. resume(id)
 * reopens at the preserved offset so the server replays only the delta produced
 * while suspended — reusing the exact machinery a network reconnect uses. This
 * is what makes N concurrent streams cost O(visible) instead of O(running).
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

function textBytes(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

function attached(a: { base: number; gap: number; next: number; hasReplay: boolean }): string {
  return JSON.stringify({ type: 'attached', ...a });
}

function offsetOf(ws: MockWebSocket): number {
  const m = /[?&]offset=(\d+)/.exec(ws.url);
  if (!m) throw new Error(`no offset in URL: ${ws.url}`);
  return Number(m[1]);
}

const openSockets = (): MockWebSocket[] =>
  MockWebSocket.instances.filter((w) => w.readyState !== CLOSED && w.readyState !== CLOSING);

describe('webTerminal suspend / resume', () => {
  let webTerminal: TerminalTransport;

  beforeEach(async () => {
    vi.resetModules();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.useFakeTimers();
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
      name: null, command: null, cwd: null, envVars: null,
      persistent: true, persistId: id, maestroSessionId: id,
    });
  }

  /** Open the session and consume `bytes` raw live bytes so its offset advances. */
  async function primed(id: string, liveBytes: number): Promise<MockWebSocket> {
    await create(id);
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws.triggerOpen();
    ws.triggerMessage(attached({ base: 0, gap: 0, next: 0, hasReplay: false }));
    if (liveBytes > 0) ws.triggerMessage(textBytes('x'.repeat(liveBytes)));
    return ws;
  }

  it('suspend closes the socket and does NOT auto-reconnect', async () => {
    await primed('s1', 3);
    expect(openSockets()).toHaveLength(1);

    webTerminal.suspend!('s1');
    expect(openSockets()).toHaveLength(0); // socket closed

    // No reconnect timer fires — even after the max backoff window.
    await vi.advanceTimersByTimeAsync(60000);
    expect(openSockets()).toHaveLength(0);
    expect(MockWebSocket.instances).toHaveLength(1); // never reopened
  });

  it('resume reopens at the preserved offset (no skip, no duplicate of the pre-suspend byte)', async () => {
    // 5 live bytes arrive, THEN suspend — the classic "byte received immediately
    // before suspend" case. The offset must include those 5 bytes so resume
    // replays strictly the delta after them.
    await primed('s2', 5);
    webTerminal.suspend!('s2');

    webTerminal.resume!('s2');
    const reopened = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(openSockets()).toHaveLength(1);
    expect(offsetOf(reopened)).toBe(5); // resumes exactly at the preserved offset
  });

  it('onclose while suspended is inert: no reconnect, offset preserved for a later resume', async () => {
    const ws = await primed('s3', 7);
    webTerminal.suspend!('s3');
    // Simulate a spurious close event on the already-suspended socket.
    ws.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(60000);
    expect(openSockets()).toHaveLength(0); // still no reconnect

    webTerminal.resume!('s3');
    expect(offsetOf(MockWebSocket.instances[MockWebSocket.instances.length - 1])).toBe(7);
  });

  it('a wake (online event) does NOT resurrect a suspended session', async () => {
    await primed('s4', 2);
    webTerminal.suspend!('s4');
    expect(openSockets()).toHaveLength(0);

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(openSockets()).toHaveLength(0); // stays suspended; only resume() reopens
  });

  it('suspend is a no-op for an unknown / already-suspended session; resume is a no-op if not suspended', async () => {
    // Unknown id — nothing to close, no throw.
    expect(() => webTerminal.suspend!('nope')).not.toThrow();
    expect(MockWebSocket.instances).toHaveLength(0);

    await primed('s5', 1);
    webTerminal.suspend!('s5');
    const countAfterSuspend = MockWebSocket.instances.length;
    webTerminal.suspend!('s5'); // second suspend — no effect
    expect(MockWebSocket.instances).toHaveLength(countAfterSuspend);

    webTerminal.resume!('s5');
    const countAfterResume = MockWebSocket.instances.length;
    webTerminal.resume!('s5'); // already resumed — no effect
    expect(MockWebSocket.instances).toHaveLength(countAfterResume);
  });

  it('a resumed session behaves like a normal live session again (offset keeps advancing)', async () => {
    await primed('s6', 4);
    webTerminal.suspend!('s6');
    webTerminal.resume!('s6');
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(offsetOf(ws)).toBe(4);
    ws.triggerOpen();
    ws.triggerMessage(attached({ base: 4, gap: 0, next: 4, hasReplay: false }));
    ws.triggerMessage(textBytes('zzz')); // 3 more bytes
    // Drop -> normal reconnect resumes from 4 + 3 = 7 (suspend didn't corrupt the counter).
    ws.triggerClose(1006);
    await vi.advanceTimersByTimeAsync(1000);
    expect(offsetOf(MockWebSocket.instances[MockWebSocket.instances.length - 1])).toBe(7);
  });
});
