// Per-session streaming UTF-8 decoder.
//
// PTY output arrives as raw bytes split on arbitrary frame boundaries, so a
// multi-byte glyph (box-drawing, emoji, Claude's ⏺/✻) can straddle two frames.
// A naive `new TextDecoder().decode(bytes)` per frame emits `�` for the split
// tail. We need streaming: hold the incomplete trailing sequence until the next
// frame (mirrors webTerminal terminal.ts:71).
//
// Hermes ships TextDecoder, but `{stream:true}` support is NOT guaranteed across
// the Expo SDK we land on (highest realtime-specific risk). Strategy: probe once
// at first use; if native streaming holds a split tail, use it; otherwise fall
// back to a zero-dep decoder that manages the UTF-8 boundary itself.

export interface StreamingDecoder {
  /** Decode a chunk, holding any incomplete trailing sequence for next time. */
  decode(bytes: Uint8Array): string;
}

type TextDecoderCtor = new (label?: string) => {
  decode(input?: ArrayBufferView | ArrayBuffer, opts?: { stream?: boolean }): string;
};

function getTextDecoderCtor(): TextDecoderCtor | null {
  const ctor = (globalThis as { TextDecoder?: unknown }).TextDecoder;
  return typeof ctor === 'function' ? (ctor as TextDecoderCtor) : null;
}

let _nativeStreamOk: boolean | null = null;

/** Probe (once) whether native TextDecoder honors `{stream:true}`. */
export function nativeStreamingSupported(): boolean {
  if (_nativeStreamOk !== null) return _nativeStreamOk;
  const Ctor = getTextDecoderCtor();
  if (!Ctor) {
    _nativeStreamOk = false;
    return false;
  }
  try {
    const d = new Ctor('utf-8');
    // '€' = E2 82 AC. Feed the first two bytes; a streaming decoder holds them
    // (returns ''), then completes on the third byte.
    const held = d.decode(new Uint8Array([0xe2, 0x82]), { stream: true });
    const done = d.decode(new Uint8Array([0xac]), { stream: true });
    _nativeStreamOk = held === '' && done === '€';
  } catch {
    _nativeStreamOk = false;
  }
  return _nativeStreamOk;
}

/** Test-only: reset the cached probe. */
export function __resetDecoderProbe(): void {
  _nativeStreamOk = null;
}

function createNativeDecoder(Ctor: TextDecoderCtor): StreamingDecoder {
  const dec = new Ctor('utf-8');
  return {
    decode: (bytes) => dec.decode(bytes, { stream: true }),
  };
}

// ── Zero-dep fallback ──────────────────────────────────────────────────────
//
// Buffer the trailing incomplete UTF-8 sequence between calls; only ever hand a
// complete-sequence prefix to a non-streaming decode. If TextDecoder is missing
// entirely, decode code points by hand.

/** Bytes from the end that form an INCOMPLETE trailing sequence (0..3). */
function incompleteTailLength(buf: Uint8Array): number {
  const len = buf.length;
  // Walk back over continuation bytes (10xxxxxx) to find the lead byte.
  let i = len - 1;
  let continuation = 0;
  while (i >= 0 && (buf[i]! & 0xc0) === 0x80) {
    continuation++;
    i--;
    if (continuation > 3) return 0; // malformed run; let the decoder emit �
  }
  if (i < 0) return 0; // all continuation bytes (malformed) — don't hold
  const lead = buf[i]!;
  let expected: number;
  if ((lead & 0x80) === 0x00) expected = 1;
  else if ((lead & 0xe0) === 0xc0) expected = 2;
  else if ((lead & 0xf0) === 0xe0) expected = 3;
  else if ((lead & 0xf8) === 0xf0) expected = 4;
  else return 0; // invalid lead byte — don't hold, let it surface
  const have = continuation + 1;
  // Incomplete only if we have a multibyte lead but not all its bytes yet.
  return have < expected ? have : 0;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function createBoundaryDecoder(Ctor: TextDecoderCtor | null): StreamingDecoder {
  let pending = new Uint8Array(0);
  const dec = Ctor ? new Ctor('utf-8') : null;
  const toString = (bytes: Uint8Array): string =>
    dec ? dec.decode(bytes) : manualDecode(bytes);

  return {
    decode(bytes) {
      const combined = concat(pending, bytes);
      const tail = incompleteTailLength(combined);
      const cut = combined.length - tail;
      pending = tail > 0 ? combined.slice(cut) : new Uint8Array(0);
      if (cut === 0) return '';
      return toString(combined.subarray(0, cut));
    },
  };
}

/** Last-resort hand decode of COMPLETE UTF-8 sequences to a string. */
function manualDecode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b0 = bytes[i]!;
    let cp: number;
    let size: number;
    if ((b0 & 0x80) === 0x00) {
      cp = b0;
      size = 1;
    } else if ((b0 & 0xe0) === 0xc0) {
      cp = b0 & 0x1f;
      size = 2;
    } else if ((b0 & 0xf0) === 0xe0) {
      cp = b0 & 0x0f;
      size = 3;
    } else if ((b0 & 0xf8) === 0xf0) {
      cp = b0 & 0x07;
      size = 4;
    } else {
      out += '�';
      i += 1;
      continue;
    }
    if (i + size > n) {
      out += '�';
      break;
    }
    for (let k = 1; k < size; k++) {
      cp = (cp << 6) | (bytes[i + k]! & 0x3f);
    }
    out += String.fromCodePoint(cp);
    i += size;
  }
  return out;
}

/** Create a fresh streaming decoder for one session. */
export function createStreamingDecoder(): StreamingDecoder {
  const Ctor = getTextDecoderCtor();
  if (Ctor && nativeStreamingSupported()) {
    return createNativeDecoder(Ctor);
  }
  return createBoundaryDecoder(Ctor);
}

/**
 * Test-only: build the zero-dep boundary decoder. `useNative` chooses whether
 * complete sequences are converted via TextDecoder (true) or the hand-rolled
 * code-point decoder (false) — letting tests cover the on-device fallback that
 * node's native streaming would otherwise mask.
 */
export function __createBoundaryDecoderForTest(useNative: boolean): StreamingDecoder {
  return createBoundaryDecoder(useNative ? getTextDecoderCtor() : null);
}
