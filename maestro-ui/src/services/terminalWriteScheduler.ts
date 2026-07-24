/**
 * Coalesces PTY output into per-session buffers and flushes them into xterm on
 * an animation-frame cadence instead of one term.write() per transport chunk.
 *
 * Why: every mounted SessionTerminal (including the visibility:hidden ones in
 * the AppWorkspace terminal deck) used to parse + DOM-render every chunk of
 * every streaming session on the main thread. With N concurrent agents that is
 * N× ANSI-parse/DOM work while only one terminal is visible. Here:
 *
 *  - visible terminals flush once per animation frame (all chunks joined into
 *    a single write — imperceptible latency, far fewer parser entries)
 *  - hidden terminals flush at most once per HIDDEN_FLUSH_INTERVAL_MS, so an
 *    offscreen full-screen TUI repainting many times a second costs one big
 *    write per second instead of hundreds of small ones
 *
 * Visibility is read from the DOM (computed style of the xterm element), NOT
 * React state, because TeamView / MultiProjectSessionsView reparent terminal
 * elements imperatively — the DOM is the only source of truth for what is
 * actually on screen. No data is ever dropped: buffers force-flush when they
 * exceed MAX_BUFFERED_BYTES regardless of visibility.
 */

export interface TerminalWriteTarget {
  /** The live xterm.js Terminal for a session id, if mounted. */
  getTerm(id: string): { write(data: string): void; element?: HTMLElement } | undefined;
  /** Whether the terminal's renderer is ready to accept writes. */
  isReady(term: unknown): boolean;
  /** Fallback for not-yet-mounted terminals (existing pendingData path). */
  bufferPending(id: string, data: string): void;
}

const HIDDEN_FLUSH_INTERVAL_MS = 1000;
const SAFETY_FLUSH_INTERVAL_MS = 1000;
const MAX_BUFFERED_BYTES = 1 << 20; // 1MB per session → force flush, never drop

interface BufferEntry {
  chunks: string[];
  bytes: number;
}

let target: TerminalWriteTarget | null = null;
const buffers = new Map<string, BufferEntry>();
const lastHiddenFlushAt = new Map<string, number>();
let rafHandle: number | null = null;
let safetyTimer: number | null = null;

export function initTerminalWriteScheduler(t: TerminalWriteTarget): void {
  target = t;
}

function isElementHidden(term: { element?: HTMLElement }): boolean {
  const el = term.element;
  if (!el || !el.isConnected) return false; // unknown → treat as visible, just write
  return getComputedStyle(el).visibility === "hidden";
}

function flushSession(id: string, entry: BufferEntry, now: number, force: boolean): boolean {
  if (!target) return false;
  const term = target.getTerm(id);
  if (!term || !target.isReady(term)) {
    // Terminal not mounted/ready — hand chunks to the pre-mount pending buffer.
    for (const chunk of entry.chunks) target.bufferPending(id, chunk);
    return true;
  }
  if (!force && entry.bytes < MAX_BUFFERED_BYTES && isElementHidden(term)) {
    const last = lastHiddenFlushAt.get(id) ?? 0;
    if (now - last < HIDDEN_FLUSH_INTERVAL_MS) return false;
    lastHiddenFlushAt.set(id, now);
  }
  term.write(entry.chunks.length === 1 ? entry.chunks[0] : entry.chunks.join(""));
  return true;
}

function flushAll(force = false): void {
  const now = Date.now();
  for (const [id, entry] of buffers) {
    if (flushSession(id, entry, now, force)) buffers.delete(id);
  }
  if (buffers.size === 0) {
    if (safetyTimer !== null) {
      window.clearInterval(safetyTimer);
      safetyTimer = null;
    }
  } else {
    scheduleFrame();
  }
}

function onFrame(): void {
  rafHandle = null;
  flushAll();
}

function scheduleFrame(): void {
  if (rafHandle === null) {
    rafHandle = window.requestAnimationFrame(onFrame);
  }
  if (safetyTimer === null) {
    // rAF pauses when the window is occluded/minimized; this keeps hidden
    // buffers draining so nothing piles up unboundedly in the background.
    safetyTimer = window.setInterval(() => flushAll(), SAFETY_FLUSH_INTERVAL_MS);
  }
}

/** Queue a PTY output chunk for coalesced delivery to its terminal. */
export function queueTerminalOutput(id: string, data: string): void {
  if (!target) return;
  let entry = buffers.get(id);
  if (!entry) {
    entry = { chunks: [], bytes: 0 };
    buffers.set(id, entry);
  }
  entry.chunks.push(data);
  entry.bytes += data.length;
  if (entry.bytes >= MAX_BUFFERED_BYTES) {
    // Oversized buffer: write through immediately (hidden or not) — we trade a
    // paint for guaranteed zero data loss.
    if (flushSession(id, entry, Date.now(), true)) buffers.delete(id);
    return;
  }
  scheduleFrame();
}

/**
 * Discard any buffered output for a session (close/reattach — the transport is
 * about to replay history, so stale queued chunks must not be written).
 */
export function dropTerminalOutput(id: string): void {
  buffers.delete(id);
  lastHiddenFlushAt.delete(id);
}

/** Synchronously flush a session's buffer (e.g. right before a replay reset). */
export function flushTerminalOutput(id: string): void {
  const entry = buffers.get(id);
  if (!entry) return;
  if (flushSession(id, entry, Date.now(), true)) buffers.delete(id);
}

/** Test-only: clear all buffers, timestamps, and scheduled callbacks. */
export function __resetTerminalWriteScheduler(): void {
  buffers.clear();
  lastHiddenFlushAt.clear();
  if (rafHandle !== null) {
    window.cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
  if (safetyTimer !== null) {
    window.clearInterval(safetyTimer);
    safetyTimer = null;
  }
}
