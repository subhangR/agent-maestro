import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  startTerminalVisibilityDriver,
  stopTerminalVisibilityDriver,
  reconcileTerminalVisibility,
  __resetTerminalVisibilityDriver,
  type TerminalVisibilityDeps,
} from '../services/terminalVisibilityDriver';

/**
 * The visibility driver decides which mounted terminals stay subscribed. It
 * reads DOM computed `visibility`, suspends terminals hidden past a grace
 * window (flushing first), and resumes them the instant they reappear.
 */

const GRACE_MS = 10000;

function makeEl(visible: boolean): HTMLElement {
  const el = document.createElement('div');
  el.style.visibility = visible ? 'visible' : 'hidden';
  document.body.appendChild(el);
  return el;
}

describe('terminalVisibilityDriver', () => {
  let calls: string[];
  let terminals: Array<{ id: string; element: HTMLElement | undefined }>;
  let deps: TerminalVisibilityDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    calls = [];
    terminals = [];
    deps = {
      listTerminals: () => terminals,
      flush: (id) => calls.push(`flush:${id}`),
      suspend: (id) => calls.push(`suspend:${id}`),
      resume: (id) => calls.push(`resume:${id}`),
    };
    __resetTerminalVisibilityDriver();
  });

  afterEach(() => {
    stopTerminalVisibilityDriver();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not suspend a hidden terminal before the grace window elapses', () => {
    terminals = [{ id: 'a', element: makeEl(false) }];
    startTerminalVisibilityDriver(deps);
    reconcileTerminalVisibility(); // first sight of "hidden" — starts the grace clock
    vi.advanceTimersByTime(GRACE_MS - 1000);
    reconcileTerminalVisibility();
    expect(calls).toEqual([]); // still within grace
  });

  it('suspends after the grace window, FLUSHING before suspending', () => {
    terminals = [{ id: 'a', element: makeEl(false) }];
    startTerminalVisibilityDriver(deps);
    reconcileTerminalVisibility();
    vi.advanceTimersByTime(GRACE_MS + 500);
    reconcileTerminalVisibility();
    expect(calls).toEqual(['flush:a', 'suspend:a']); // flush strictly before suspend
  });

  it('never suspends a visible terminal', () => {
    terminals = [{ id: 'a', element: makeEl(true) }];
    startTerminalVisibilityDriver(deps);
    reconcileTerminalVisibility();
    vi.advanceTimersByTime(GRACE_MS * 3);
    reconcileTerminalVisibility();
    expect(calls).toEqual([]);
  });

  it('resumes a suspended terminal the moment it becomes visible again', () => {
    const el = makeEl(false);
    terminals = [{ id: 'a', element: el }];
    startTerminalVisibilityDriver(deps);
    reconcileTerminalVisibility();
    vi.advanceTimersByTime(GRACE_MS + 500);
    reconcileTerminalVisibility();
    expect(calls).toEqual(['flush:a', 'suspend:a']);

    el.style.visibility = 'visible';
    reconcileTerminalVisibility();
    expect(calls).toEqual(['flush:a', 'suspend:a', 'resume:a']);
  });

  it('keeps a briefly-hidden terminal warm (no suspend) if it reappears within grace', () => {
    const el = makeEl(true);
    terminals = [{ id: 'a', element: el }];
    startTerminalVisibilityDriver(deps);
    reconcileTerminalVisibility();
    el.style.visibility = 'hidden';
    reconcileTerminalVisibility(); // starts grace
    vi.advanceTimersByTime(GRACE_MS / 2);
    el.style.visibility = 'visible'; // back before grace elapsed
    reconcileTerminalVisibility();
    vi.advanceTimersByTime(GRACE_MS);
    reconcileTerminalVisibility();
    expect(calls).toEqual([]); // never suspended
  });

  it('stop() resumes every still-suspended terminal so the transport is not stranded', () => {
    terminals = [{ id: 'a', element: makeEl(false) }, { id: 'b', element: makeEl(false) }];
    startTerminalVisibilityDriver(deps);
    reconcileTerminalVisibility();
    vi.advanceTimersByTime(GRACE_MS + 500);
    reconcileTerminalVisibility();
    expect(calls).toEqual(['flush:a', 'suspend:a', 'flush:b', 'suspend:b']);

    stopTerminalVisibilityDriver();
    expect(calls.slice(-2).sort()).toEqual(['resume:a', 'resume:b']);
  });

  it('keeps up to the warm-LRU size of recently-viewed terminals live even when hidden', () => {
    const els = { a: makeEl(false), b: makeEl(false), c: makeEl(false) };
    terminals = [
      { id: 'a', element: els.a },
      { id: 'b', element: els.b },
      { id: 'c', element: els.c },
    ];
    startTerminalVisibilityDriver(deps);
    // View a, then b, then c (each visible in turn) so all three enter the LRU.
    for (const id of ['a', 'b', 'c'] as const) {
      for (const k of ['a', 'b', 'c'] as const) els[k].style.visibility = k === id ? 'visible' : 'hidden';
      reconcileTerminalVisibility();
    }
    // Now hide all three and wait well past grace.
    for (const k of ['a', 'b', 'c'] as const) els[k].style.visibility = 'hidden';
    vi.advanceTimersByTime(GRACE_MS * 2);
    reconcileTerminalVisibility();
    // All three are in the warm LRU (size 3) → none suspended.
    expect(calls.filter((c) => c.startsWith('suspend:'))).toEqual([]);
  });

  it('evicts the least-recently-viewed terminal from the LRU and suspends it after grace', () => {
    const els = { a: makeEl(false), b: makeEl(false), c: makeEl(false), d: makeEl(false) };
    terminals = (['a', 'b', 'c', 'd'] as const).map((id) => ({ id, element: els[id] }));
    startTerminalVisibilityDriver(deps);
    // View a, b, c, d in turn. LRU (size 3) ends up [d, c, b]; 'a' is evicted.
    for (const id of ['a', 'b', 'c', 'd'] as const) {
      for (const k of ['a', 'b', 'c', 'd'] as const) els[k].style.visibility = k === id ? 'visible' : 'hidden';
      reconcileTerminalVisibility();
    }
    // Everything hidden. The first reconcile starts the grace clock for the
    // evicted 'a' (it was still processed as warm during the eviction pass);
    // after grace elapses it suspends. The 3 warm terminals never do.
    for (const k of ['a', 'b', 'c', 'd'] as const) els[k].style.visibility = 'hidden';
    reconcileTerminalVisibility(); // 'a' (evicted) begins its grace window
    vi.advanceTimersByTime(GRACE_MS + 500);
    reconcileTerminalVisibility();
    expect(calls.filter((c) => c.startsWith('suspend:'))).toEqual(['suspend:a']);
  });

  it('forgets bookkeeping for a terminal that unmounts (no leak across the maps)', () => {
    terminals = [{ id: 'a', element: makeEl(false) }];
    startTerminalVisibilityDriver(deps);
    reconcileTerminalVisibility();
    vi.advanceTimersByTime(GRACE_MS + 500);
    reconcileTerminalVisibility(); // suspended
    // Terminal unmounts — no longer in the list.
    terminals = [];
    reconcileTerminalVisibility();
    // Re-mounting the same id starts fresh (not treated as already-suspended).
    terminals = [{ id: 'a', element: makeEl(true) }];
    reconcileTerminalVisibility();
    // No spurious resume for the unmounted-then-remounted visible terminal beyond
    // the suspend that already happened.
    expect(calls).toEqual(['flush:a', 'suspend:a']);
  });
});
