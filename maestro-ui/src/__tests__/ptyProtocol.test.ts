import { describe, expect, it } from 'vitest';
import { parseControlFrame } from '../platform/ptyProtocol';

/**
 * ptyProtocol (maestro-ui/src/platform/ptyProtocol.ts) is the provider-neutral
 * parser for the server→client text control frames on a `/pty` WebSocket. It is
 * deliberately transport-agnostic: it takes the raw string payload of a text
 * frame and returns a typed control frame, or null when the payload is ordinary
 * PTY output (which must be written to the terminal, not interpreted).
 *
 * The frames it recognizes:
 *  - {type:'exit', exitCode}          — the PTY process ended.
 *  - {type:'size', cols, rows}        — authoritative width/height on attach.
 *  - {type:'attached', base, gap,     — the offset-resume ack: `next` is the
 *     next, hasReplay}                  server-authoritative RAW end-of-stream
 *                                        byte offset, `base` the start of the
 *                                        replay slice, `gap` the bytes evicted
 *                                        below `base`, `hasReplay` whether one
 *                                        display-only replay frame follows.
 */

describe('parseControlFrame', () => {
  it('returns null for a non-JSON payload (ordinary PTY output)', () => {
    expect(parseControlFrame('hello world')).toBeNull();
    expect(parseControlFrame('[31mred[0m')).toBeNull();
  });

  it('returns null for JSON that is not a recognized control frame', () => {
    expect(parseControlFrame(JSON.stringify({ type: 'nope' }))).toBeNull();
    expect(parseControlFrame(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(parseControlFrame(JSON.stringify([1, 2, 3]))).toBeNull();
  });

  it('parses an exit frame, defaulting a missing exitCode to null', () => {
    expect(parseControlFrame(JSON.stringify({ type: 'exit', exitCode: 3 }))).toEqual({
      type: 'exit',
      exitCode: 3,
    });
    expect(parseControlFrame(JSON.stringify({ type: 'exit' }))).toEqual({
      type: 'exit',
      exitCode: null,
    });
  });

  it('parses a size frame only when cols/rows are finite', () => {
    expect(parseControlFrame(JSON.stringify({ type: 'size', cols: 80, rows: 24 }))).toEqual({
      type: 'size',
      cols: 80,
      rows: 24,
    });
    // Non-finite dimensions are not a usable size frame.
    expect(parseControlFrame(JSON.stringify({ type: 'size', cols: 'x', rows: 24 }))).toBeNull();
  });

  it('parses an attached frame with base/gap/next/hasReplay', () => {
    expect(
      parseControlFrame(
        JSON.stringify({ type: 'attached', base: 100, gap: 0, next: 250, hasReplay: true }),
      ),
    ).toEqual({ type: 'attached', base: 100, gap: 0, next: 250, hasReplay: true });
  });

  it('parses an attached frame with a gap (eviction) and no replay', () => {
    expect(
      parseControlFrame(
        JSON.stringify({ type: 'attached', base: 4096, gap: 512, next: 8192, hasReplay: false }),
      ),
    ).toEqual({ type: 'attached', base: 4096, gap: 512, next: 8192, hasReplay: false });
  });

  it('coerces hasReplay to a boolean and defaults a missing gap to 0', () => {
    expect(
      parseControlFrame(JSON.stringify({ type: 'attached', base: 0, next: 0 })),
    ).toEqual({ type: 'attached', base: 0, gap: 0, next: 0, hasReplay: false });
  });

  it('returns null for an attached frame missing the authoritative offsets', () => {
    // Without `next` the client cannot snap its offset — treat as unusable.
    expect(parseControlFrame(JSON.stringify({ type: 'attached', base: 0 }))).toBeNull();
    expect(
      parseControlFrame(JSON.stringify({ type: 'attached', base: 'x', next: 10 })),
    ).toBeNull();
  });
});
