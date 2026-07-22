import { describe, expect, it } from 'vitest';
import { parseControlFrame as sharedParse } from '@maestro/pty-protocol';
import { parseControlFrame as uiParse } from '../platform/ptyProtocol';

/**
 * Consumer contract / parity test for maestro-ui.
 *
 * The canonical `/pty` control-frame parser now lives in the shared,
 * dependency-free `@maestro/pty-protocol` package (exhaustively covered by that
 * package's own contract tests). maestro-ui must consume that single source of
 * truth — not a forked copy — so this test pins two things:
 *   1. Identity: maestro-ui's `platform/ptyProtocol` re-exports the SAME
 *      `parseControlFrame` function object as the shared package. If someone
 *      re-introduces a local fork, `uiParse === sharedParse` breaks.
 *   2. Smoke: the frames the maestro-ui terminal relies on still parse through
 *      the re-export, including the raw-`next` offset the resume logic snaps to.
 */

describe('maestro-ui consumes the shared @maestro/pty-protocol parser', () => {
  it('re-exports the exact shared parseControlFrame (no local fork)', () => {
    expect(uiParse).toBe(sharedParse);
  });

  it('parses the control frames the terminal relies on via the re-export', () => {
    expect(uiParse('ordinary output')).toBeNull();
    expect(uiParse(JSON.stringify({ type: 'exit', exitCode: 0 }))).toEqual({
      type: 'exit',
      exitCode: 0,
    });
    expect(uiParse(JSON.stringify({ type: 'size', cols: 80, rows: 24 }))).toEqual({
      type: 'size',
      cols: 80,
      rows: 24,
    });
    expect(
      uiParse(JSON.stringify({ type: 'attached', base: 100, gap: 0, next: 250, hasReplay: true })),
    ).toEqual({ type: 'attached', base: 100, gap: 0, next: 250, hasReplay: true });
  });
});
