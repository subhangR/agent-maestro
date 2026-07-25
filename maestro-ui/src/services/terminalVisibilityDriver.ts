/**
 * Lazy terminal streaming: keep only ON-SCREEN terminals subscribed to their PTY
 * stream, and SUSPEND the offscreen ones so they neither receive nor VT-parse
 * output. This is what turns the cost of N concurrently-streaming agents from
 * O(running) into O(visible) — the browser main thread only parses the terminal
 * (or few, in a split / Team View) you are actually looking at.
 *
 * How it decides: it reads the SAME truth the write scheduler uses — the DOM
 * computed `visibility` of each mounted xterm element — so it transparently
 * covers TeamView / MultiProjectSessionsView, which reparent terminal elements
 * imperatively (a reparented terminal is visibility:visible ⇒ kept live). It
 * never relies on React state about "which is active".
 *
 * Grace + resume semantics:
 *  - RESUME is immediate when a terminal becomes visible (a shown terminal must
 *    never be left frozen).
 *  - SUSPEND waits HIDE_GRACE_MS of CONTINUOUS invisibility, so flipping between
 *    two terminals (or a brief layout change) doesn't churn suspend→replay. The
 *    grace window doubles as a lightweight "recently viewed stays warm" MRU.
 *
 * Correctness seam: before suspending, we FLUSH the write scheduler's buffered
 * output into xterm. The transport advances its resume offset as frames arrive
 * (before they reach xterm), so flushing first guarantees xterm has been handed
 * everything the offset counts — resume() then replays the delta with no skipped
 * or duplicated bytes.
 *
 * Web-only: native (Tauri) PTY output is one shared event channel, not
 * per-session sockets, so there is nothing per-session to suspend. The driver is
 * simply never started there.
 */

export interface TerminalVisibilityDeps {
  /** All currently-mounted terminals: transport id → its xterm root element. */
  listTerminals(): Array<{ id: string; element: HTMLElement | undefined }>;
  /** Force the scheduler's buffered output for a session into its xterm now. */
  flush(id: string): void;
  /** Suspend a session's live stream (close socket, preserve resume offset). */
  suspend(id: string): void;
  /** Resume a suspended session (reopen at offset → server replays the delta). */
  resume(id: string): void;
}

const HIDE_GRACE_MS = 10000;
const RECONCILE_INTERVAL_MS = 2000;
/**
 * How many terminals stay WARM (subscribed, live-parsing) at once — the visible
 * one plus the most-recently-viewed others. Terminals in this LRU set are never
 * suspended even while offscreen, so switching back to a recently-used terminal
 * is instant (no reconnect/replay). Only terminals that fall OUT of this set
 * (and then stay hidden past the grace window) suspend. Larger = smoother
 * switching but more background parse cost; smaller = leaner. 3 keeps a typical
 * "flip between a few" working set instant while still suspending the long tail
 * of background agents that caused the O(running) lag.
 */
const WARM_LRU_SIZE = 3;

let deps: TerminalVisibilityDeps | null = null;
let intervalTimer: number | null = null;
/** Wall-clock ms at which each currently-hidden session first went hidden. */
const hiddenSince = new Map<string, number>();
/** Ids we have suspended, so reconcile knows to resume-on-show exactly once. */
const suspendedIds = new Set<string>();
/**
 * The WARM LRU: ids kept live even while hidden, most-recently-visible first,
 * capped at WARM_LRU_SIZE. A terminal enters/moves to the front whenever it is
 * seen visible; the least-recently-visible id is evicted when the cap is
 * exceeded, and only then becomes eligible to suspend (after the grace window).
 */
const warmLru: string[] = [];

/** Move `id` to the front of the warm LRU, evicting the coldest over the cap. */
function touchWarm(id: string): void {
  const i = warmLru.indexOf(id);
  if (i >= 0) warmLru.splice(i, 1);
  warmLru.unshift(id);
  if (warmLru.length > WARM_LRU_SIZE) warmLru.length = WARM_LRU_SIZE;
}

function isVisible(element: HTMLElement | undefined): boolean {
  if (!element || !element.isConnected) return false;
  return getComputedStyle(element).visibility !== "hidden";
}

/** One reconciliation pass over every mounted terminal. Cheap (a handful of
 *  getComputedStyle reads); safe to call on a timer and on activeId changes. */
export function reconcileTerminalVisibility(): void {
  if (!deps) return;
  const now = Date.now();
  const seen = new Set<string>();

  for (const { id, element } of deps.listTerminals()) {
    seen.add(id);
    if (isVisible(element)) {
      hiddenSince.delete(id);
      touchWarm(id); // most-recently-visible → front of the warm LRU
      if (suspendedIds.has(id)) {
        suspendedIds.delete(id);
        deps.resume(id);
      }
      continue;
    }
    // Hidden.
    if (suspendedIds.has(id)) continue; // already suspended — nothing to do
    // Kept warm: a recently-viewed terminal in the LRU stays live so switching
    // back to it is instant. It only becomes suspend-eligible once evicted.
    if (warmLru.includes(id)) {
      hiddenSince.delete(id);
      continue;
    }
    const since = hiddenSince.get(id);
    if (since === undefined) {
      hiddenSince.set(id, now);
      continue;
    }
    if (now - since >= HIDE_GRACE_MS) {
      // Drain buffered output into xterm so the resume offset matches what xterm
      // has, THEN suspend. Order matters — see the correctness seam note above.
      deps.flush(id);
      deps.suspend(id);
      suspendedIds.add(id);
      hiddenSince.delete(id);
    }
  }

  // Forget bookkeeping for terminals that have unmounted since the last pass, so
  // these structures can't grow across a long session with many spawns. A
  // suspended id that unmounted is handled by the transport's own close/teardown.
  for (const id of hiddenSince.keys()) if (!seen.has(id)) hiddenSince.delete(id);
  for (const id of suspendedIds) if (!seen.has(id)) suspendedIds.delete(id);
  for (let i = warmLru.length - 1; i >= 0; i--) if (!seen.has(warmLru[i])) warmLru.splice(i, 1);
}

export function startTerminalVisibilityDriver(d: TerminalVisibilityDeps): void {
  deps = d;
  if (intervalTimer === null) {
    intervalTimer = window.setInterval(reconcileTerminalVisibility, RECONCILE_INTERVAL_MS);
  }
  // Resume promptly when the tab returns to the foreground.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", reconcileTerminalVisibility);
  }
}

export function stopTerminalVisibilityDriver(): void {
  if (intervalTimer !== null) {
    window.clearInterval(intervalTimer);
    intervalTimer = null;
  }
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", reconcileTerminalVisibility);
  }
  // RESUME everything we suspended before forgetting it. Otherwise a stop /
  // restart / HMR leaves the transport's socket suspended while THIS module
  // loses the record — a later reconcile (with an empty suspendedIds) would
  // never resume it, stranding a permanently frozen terminal. Resuming here
  // keeps the transport and driver views consistent across a teardown.
  if (deps) {
    for (const id of suspendedIds) deps.resume(id);
  }
  hiddenSince.clear();
  suspendedIds.clear();
  warmLru.length = 0;
  deps = null;
}

/** Test-only reset of module state. */
export function __resetTerminalVisibilityDriver(): void {
  stopTerminalVisibilityDriver();
}
