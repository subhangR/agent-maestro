import { describe, expect, it } from 'vitest';
import { parseControlFrame } from '@maestro/pty-protocol';
import { routePtyMessage } from '../ptyMessage';

/**
 * maestro-web consumer contract: `routePtyMessage` (the browser POC's `/pty`
 * message path) must classify frames through the SHARED parser
 * (`@maestro/pty-protocol`) rather than a forked copy. These tests pin that:
 *  - binary frames route to terminal output as bytes,
 *  - control-frame JSON is recognized and NOT written to the terminal as text,
 *  - ordinary string output is written verbatim,
 * and the classification matches `parseControlFrame` byte-for-byte.
 */

describe('routePtyMessage', () => {
  it('routes binary frames to terminal output as bytes', () => {
    const bytes = new Uint8Array([0x68, 0x69]); // "hi"
    const action = routePtyMessage(bytes.buffer);
    expect(action.kind).toBe('output');
    expect(action).toEqual({ kind: 'output', data: bytes });
  });

  it('writes ordinary string output verbatim (parser returns null)', () => {
    const action = routePtyMessage('\x1b[31mred\x1b[0m$ ');
    expect(action).toEqual({ kind: 'output', data: '\x1b[31mred\x1b[0m$ ' });
  });

  it('recognizes an exit control frame as control (not terminal text)', () => {
    const payload = JSON.stringify({ type: 'exit', exitCode: 0 });
    const action = routePtyMessage(payload);
    expect(action).toEqual({ kind: 'control', frame: { type: 'exit', exitCode: 0 } });
  });

  it('recognizes a size control frame as control', () => {
    const payload = JSON.stringify({ type: 'size', cols: 120, rows: 40 });
    const action = routePtyMessage(payload);
    expect(action).toEqual({ kind: 'control', frame: { type: 'size', cols: 120, rows: 40 } });
  });

  it('recognizes an attached (offset-resume) control frame as control', () => {
    const payload = JSON.stringify({
      type: 'attached',
      base: 10,
      gap: 0,
      next: 42,
      hasReplay: true,
    });
    const action = routePtyMessage(payload);
    expect(action).toEqual({
      kind: 'control',
      frame: { type: 'attached', base: 10, gap: 0, next: 42, hasReplay: true },
    });
  });

  it('classifies string frames exactly as the shared parser does', () => {
    for (const payload of [
      'plain output',
      JSON.stringify({ type: 'exit', exitCode: 7 }),
      JSON.stringify({ type: 'size', cols: 80, rows: 24 }),
      JSON.stringify({ type: 'nope' }),
    ]) {
      const frame = parseControlFrame(payload);
      const action = routePtyMessage(payload);
      if (frame) {
        expect(action).toEqual({ kind: 'control', frame });
      } else {
        expect(action).toEqual({ kind: 'output', data: payload });
      }
    }
  });
});
