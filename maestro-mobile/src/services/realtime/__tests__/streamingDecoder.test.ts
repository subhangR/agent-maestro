import {
  createStreamingDecoder,
  nativeStreamingSupported,
  __createBoundaryDecoderForTest,
  __resetDecoderProbe,
} from '../pty/streamingDecoder';

// '€' = E2 82 AC (3 bytes). '🚀' = F0 9F 9A 80 (4 bytes). 'a' = 61.
const EURO = [0xe2, 0x82, 0xac];
const ROCKET = [0xf0, 0x9f, 0x9a, 0x80];

describe('streaming UTF-8 decoder', () => {
  afterEach(() => __resetDecoderProbe());

  it('probes native streaming support (node TextDecoder supports it)', () => {
    expect(typeof nativeStreamingSupported()).toBe('boolean');
  });

  it.each([
    ['active path', () => createStreamingDecoder()],
    ['boundary+native', () => __createBoundaryDecoderForTest(true)],
    ['boundary+manual', () => __createBoundaryDecoderForTest(false)],
  ])('holds a 3-byte glyph split across two frames (%s)', (_label, make) => {
    const d = make();
    const first = d.decode(new Uint8Array([EURO[0]!, EURO[1]!])); // incomplete tail
    const second = d.decode(new Uint8Array([EURO[2]!])); // completes
    expect(first + second).toBe('€');
  });

  it.each([
    ['active path', () => createStreamingDecoder()],
    ['boundary+native', () => __createBoundaryDecoderForTest(true)],
    ['boundary+manual', () => __createBoundaryDecoderForTest(false)],
  ])('holds a 4-byte emoji split across three frames (%s)', (_label, make) => {
    const d = make();
    let out = '';
    out += d.decode(new Uint8Array([ROCKET[0]!]));
    out += d.decode(new Uint8Array([ROCKET[1]!, ROCKET[2]!]));
    out += d.decode(new Uint8Array([ROCKET[3]!]));
    expect(out).toBe('🚀');
  });

  it.each([
    ['active path', () => createStreamingDecoder()],
    ['boundary+native', () => __createBoundaryDecoderForTest(true)],
    ['boundary+manual', () => __createBoundaryDecoderForTest(false)],
  ])('decodes ASCII immediately with no holding (%s)', (_label, make) => {
    const d = make();
    expect(d.decode(new Uint8Array([0x61, 0x62, 0x63]))).toBe('abc');
  });

  it.each([
    ['boundary+native', () => __createBoundaryDecoderForTest(true)],
    ['boundary+manual', () => __createBoundaryDecoderForTest(false)],
  ])('emits a mixed ASCII+multibyte frame, holding only the split tail (%s)', (_label, make) => {
    const d = make();
    // "a€" but the € is cut after its first byte.
    const first = d.decode(new Uint8Array([0x61, EURO[0]!]));
    expect(first).toBe('a'); // 'a' flushes, € held
    const second = d.decode(new Uint8Array([EURO[1]!, EURO[2]!]));
    expect(first + second).toBe('a€');
  });
});
