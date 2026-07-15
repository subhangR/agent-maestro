/**
 * Offset-tracked scrollback buffer for a single PTY's output stream.
 *
 * This is the correctness core of the durable-terminal protocol. It keeps a
 * bounded ring of recent output chunks AND a monotonic count of every byte the
 * PTY has ever produced. That lets a reconnecting client resume from the exact
 * byte offset it last saw: {@link replayFrom} returns only the bytes after that
 * offset (no duplication), or an explicit `gap` count for bytes that have
 * already been evicted (honest, bounded loss instead of silent corruption).
 *
 * Offsets are absolute byte positions in the output stream, counted in RAW PTY
 * bytes — the buffer NEVER sanitizes. `startOffset` is the absolute position of
 * the first byte still retained in the ring; `totalBytes` is the absolute
 * position just past the last byte produced. Bytes in `[startOffset, totalBytes)`
 * are replayable; anything below `startOffset` has been evicted and can only be
 * reported as a gap. Sanitizing the replay for display (device-query stripping)
 * is a strictly higher-layer concern (see PtyHostService.getReplay) precisely so
 * that offset accounting stays in the same raw byte space the live stream uses.
 *
 * Deliberately transport-agnostic and PTY-agnostic so it can be unit-tested in
 * isolation, with no sockets and no child processes.
 *
 * Buffer ownership: {@link append} takes ownership of the chunk it is given and
 * retains that exact reference without copying — the caller must not mutate a
 * buffer after appending it (node-pty emits a fresh Buffer per data event, so
 * this holds today). {@link ReplaySlice.data} MAY alias a retained ring chunk
 * (when the replay is satisfied by a single stored chunk) OR be a freshly
 * concatenated copy (when it spans multiple chunks — see {@link sliceFrom}).
 * Either way it is read-only: consumers must treat it as immutable (only read it
 * or hand it to `ws.send`, never write into it, and never assume it stays a live
 * view of the ring). The append hot path is deliberately allocation-free; replay
 * may allocate on a multi-chunk span, but replay is the cold reconnect path.
 */
export interface ReplaySlice {
  /** Absolute offset of the first byte in {@link data}. The client should treat
   *  this as its authoritative new receive-offset base. */
  base: number;
  /** Bytes that were evicted before the client's requested offset and can never
   *  be replayed. `0` when the requested offset was still retained (or on a
   *  fresh full replay). The client advances its offset by this many bytes and
   *  surfaces a truncation marker. */
  gap: number;
  /** Absolute RAW end-of-stream offset (`totalBytes`) at the instant this slice
   *  was computed. This — NOT `base + data.length` — is the authoritative
   *  resume offset the client must snap to, because `data` may later be
   *  sanitized for display (shortened) by a higher layer. Decoupling the offset
   *  the client counts (raw `next`) from the bytes it paints (possibly
   *  sanitized) is what makes device-query stripping unable to duplicate or skip
   *  scrollback on the next reconnect. */
  next: number;
  /** Retained RAW output bytes from {@link base} to the end of the stream.
   *  Read-only: may alias a retained ring chunk or be a fresh concatenated copy
   *  (see the buffer-ownership note above) — must not be mutated by the
   *  consumer. */
  data: Buffer;
}

const DEFAULT_CAP_BYTES = 1024 * 1024; // 1 MiB — 4× the old 256KB to shrink the gap window

export class OutputBuffer {
  private readonly chunks: Buffer[] = [];
  private bufferedBytes = 0;
  private produced = 0;

  constructor(private readonly capBytes: number = DEFAULT_CAP_BYTES) {}

  /** Absolute offset just past the last byte produced (total bytes ever seen). */
  get totalBytes(): number {
    return this.produced;
  }

  /** Absolute offset of the first byte still retained in the ring. */
  get startOffset(): number {
    return this.produced - this.bufferedBytes;
  }

  /** Append newly produced output. Takes ownership of `chunk` and retains the
   *  reference without copying (see the buffer-ownership note on the class) — the
   *  caller must not mutate it afterward. Evicts oldest chunks over the cap, but
   *  never drops the only chunk (so a single oversized write is still
   *  deliverable). */
  append(chunk: Buffer): void {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.bufferedBytes += chunk.length;
    this.produced += chunk.length;
    while (this.bufferedBytes > this.capBytes && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!;
      this.bufferedBytes -= dropped.length;
    }
  }

  /**
   * Compute the bytes to replay to a client resuming from `fromOffset` (the
   * absolute number of output bytes it has already received).
   *
   * - A finite, non-negative `fromOffset` behind the retained window yields a
   *   `gap` for the evicted bytes and resumes at `startOffset`.
   * - A negative/NaN `fromOffset` is treated as a fresh attach: full replay of
   *   the retained ring with no gap.
   * - An offset EQUAL to the end means the client is caught up (empty data).
   * - An offset STRICTLY beyond the end cannot occur within one continuous stream
   *   (a client cannot have received more bytes than were produced), so it is a
   *   signal that the offset was carried over from a PREVIOUS stream — a
   *   kill()+respawn under the same sessionId restarts output at 0. It is treated
   *   as a fresh attach (full replay) so the client re-syncs onto the new stream
   *   instead of clamping to the end and skipping the new process's initial output.
   *
   *   This byte-count comparison is a DEFENSIVE backstop, not the primary
   *   guarantee: it catches a stale offset LARGER than the new stream, but a new
   *   stream that has already produced >= the stale offset by the time the client
   *   reconnects would look like a normal same-stream resume. The authoritative
   *   protection lives upstream — the /resume and /pty/spawn routes never
   *   kill+replace a live, attached PTY (see their hasSession guards), so a client
   *   is never handed a fresh stream under an offset it still holds. A
   *   fully-general fix (a per-spawn stream epoch echoed on reconnect) is a
   *   documented follow-up; see the design spec.
   *
   * `next` is always the raw `totalBytes` at call time, captured synchronously
   * alongside the slice so a caller that sanitizes `data` for display cannot
   * drift the two apart.
   */
  replayFrom(fromOffset: number): ReplaySlice {
    const start = this.startOffset;
    const total = this.totalBytes;

    // A fresh attach resumes at `start`, so it can never be behind the window
    // (from === start ⇒ no gap). Only a resumed offset that predates the
    // retained window produces a gap. An offset past `total` is a best-effort
    // cross-stream stale-offset signal (see above) and is also treated as fresh.
    const floored = Math.floor(fromOffset);
    const fresh = !Number.isFinite(fromOffset) || fromOffset < 0 || floored > total;
    const from = fresh ? start : floored;

    let gap = 0;
    let base: number;
    if (from < start) {
      gap = start - from;
      base = start;
    } else {
      base = from;
    }

    return { base, gap, next: total, data: this.sliceFrom(base) };
  }

  /** Retained bytes from absolute offset `base` (in [startOffset, totalBytes]). */
  private sliceFrom(base: number): Buffer {
    let skip = base - this.startOffset;
    const out: Buffer[] = [];
    for (const chunk of this.chunks) {
      if (skip >= chunk.length) {
        skip -= chunk.length;
        continue;
      }
      out.push(skip > 0 ? chunk.subarray(skip) : chunk);
      skip = 0;
    }
    if (out.length === 0) return Buffer.alloc(0);
    return out.length === 1 ? out[0] : Buffer.concat(out);
  }
}
