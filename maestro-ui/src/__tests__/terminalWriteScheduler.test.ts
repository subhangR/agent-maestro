import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initTerminalWriteScheduler,
  queueTerminalOutput,
  dropTerminalOutput,
  flushTerminalOutput,
  __resetTerminalWriteScheduler,
} from "../services/terminalWriteScheduler";

/**
 * Deterministic rAF: capture callbacks, run them manually.
 */
let rafCallbacks: FrameRequestCallback[] = [];
function runFrame() {
  const cbs = rafCallbacks;
  rafCallbacks = [];
  for (const cb of cbs) cb(performance.now());
}

interface FakeTerm {
  write: ReturnType<typeof vi.fn>;
  element?: HTMLElement;
}

function makeTerm(visible: boolean): FakeTerm {
  const el = document.createElement("div");
  el.style.visibility = visible ? "visible" : "hidden";
  document.body.appendChild(el);
  return { write: vi.fn(), element: el };
}

describe("terminalWriteScheduler", () => {
  const terms = new Map<string, FakeTerm>();
  const pending: Array<[string, string]> = [];

  beforeEach(() => {
    document.body.innerHTML = "";
    terms.clear();
    pending.length = 0;
    rafCallbacks = [];
    vi.restoreAllMocks();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    __resetTerminalWriteScheduler();
    initTerminalWriteScheduler({
      getTerm: (id) => terms.get(id),
      isReady: (t) => Boolean(t),
      bufferPending: (id, data) => pending.push([id, data]),
    });
  });

  it("coalesces multiple chunks into a single write on the next frame", () => {
    const term = makeTerm(true);
    terms.set("a", term);

    queueTerminalOutput("a", "hel");
    queueTerminalOutput("a", "lo");
    expect(term.write).not.toHaveBeenCalled();

    runFrame();
    expect(term.write).toHaveBeenCalledTimes(1);
    expect(term.write).toHaveBeenCalledWith("hello");
  });

  it("routes chunks for unmounted terminals to the pending buffer", () => {
    queueTerminalOutput("gone", "x");
    runFrame();
    expect(pending).toEqual([["gone", "x"]]);
  });

  it("throttles hidden terminals but never drops their data", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    try {
      const term = makeTerm(false);
      terms.set("hidden", term);

      queueTerminalOutput("hidden", "one");
      runFrame();
      // First flush for a session is allowed (no prior flush timestamp).
      expect(term.write).toHaveBeenCalledWith("one");

      queueTerminalOutput("hidden", "two");
      runFrame();
      // Within the hidden-flush interval: buffered, not written.
      expect(term.write).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1100);
      runFrame();
      expect(term.write).toHaveBeenCalledTimes(2);
      expect(term.write).toHaveBeenLastCalledWith("two");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes hidden buffers immediately once the terminal becomes visible", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    try {
      const term = makeTerm(false);
      terms.set("b", term);

      queueTerminalOutput("b", "first");
      runFrame();
      queueTerminalOutput("b", "later");
      runFrame();
      expect(term.write).toHaveBeenCalledTimes(1);

      term.element!.style.visibility = "visible";
      runFrame();
      expect(term.write).toHaveBeenCalledTimes(2);
      expect(term.write).toHaveBeenLastCalledWith("later");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushTerminalOutput force-writes buffered data regardless of visibility", () => {
    const term = makeTerm(false);
    terms.set("b", term);
    queueTerminalOutput("b", "seed");
    runFrame(); // first flush allowed
    queueTerminalOutput("b", "queued");
    flushTerminalOutput("b");
    expect(term.write).toHaveBeenLastCalledWith("queued");
  });

  // Load-bearing invariant behind "flush before suspend": flushTerminalOutput
  // must fully DRAIN the buffer even when the terminal is unmounted (routing to
  // bufferPending), leaving nothing behind. If it ever left the buffer intact on
  // the unmounted path, a suspend() right after would preserve an offset for
  // bytes that never reached any sink → a silent client-side hole with no gap
  // marker (the server's accounting stays perfect). This pins that it drains.
  it("flushTerminalOutput drains to pending (never leaves a residual buffer) when the terminal is unmounted", () => {
    // No term registered for "gone" — the not-mounted path.
    queueTerminalOutput("gone", "a");
    queueTerminalOutput("gone", "b");
    flushTerminalOutput("gone");
    expect(pending).toEqual([["gone", "a"], ["gone", "b"]]);
    // Buffer is now empty: a second flush (and any later frame) has nothing left
    // to replay — so the resume offset can't be ahead of delivered bytes.
    pending.length = 0;
    flushTerminalOutput("gone");
    runFrame();
    expect(pending).toEqual([]);
  });

  it("dropTerminalOutput discards buffered chunks", () => {
    const term = makeTerm(true);
    terms.set("a", term);
    queueTerminalOutput("a", "stale");
    dropTerminalOutput("a");
    runFrame();
    expect(term.write).not.toHaveBeenCalled();
  });
});
