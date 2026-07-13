// encodeUtf8 — text → UTF-8 bytes for the PTY transport (keystrokes out).
//
// A LOCAL copy of features/_shared/utf8.ts. src/terminal deliberately does NOT
// import the Stream-B feature helper: terminal may be imported BY features, so
// importing a feature back would risk a features↔terminal cycle. The byte math
// is tiny and stable; a self-contained helper keeps this module standalone-
// compilable and acyclic. (Pulse owns the streaming DECODER for output; this is
// only the encoder for the write path.)

/** Encode a JS string to a UTF-8 `Uint8Array` (what `pty.write` expects). */
export function encodeUtf8(text: string): Uint8Array {
  const Encoder = (globalThis as { TextEncoder?: typeof TextEncoder }).TextEncoder;
  if (Encoder) return new Encoder().encode(text);
  return manualEncodeUtf8(text);
}

/** Fallback UTF-8 encoder (handles the full BMP + surrogate pairs). */
function manualEncodeUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    // Combine a high/low surrogate pair into a single code point.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}
