// Contract fixtures — /pty frame sequences (MOBILE_APP_BUILD_ANALYSIS.md §2.6).

export const SIZE_FRAME = { type: 'size' as const, cols: 80, rows: 24 };
export const EXIT_FRAME = { type: 'exit' as const, exitCode: 0 };
export const RESIZE_FRAME = { type: 'resize' as const, cols: 120, rows: 40 };

// Common soft-keyboard control bytes the terminal must map (Phase 4 asserts these).
export const CTRL_C = new Uint8Array([0x03]);
export const ESC = new Uint8Array([0x1b]);
export const ARROW_UP = new Uint8Array([0x1b, 0x5b, 0x41]); // ESC [ A

// A multibyte glyph (U+2502 BOX DRAWINGS LIGHT VERTICAL = E2 94 82) deliberately
// split mid-codepoint. A streaming TextDecoder({stream:true}) renders ONE glyph;
// a naive per-frame decode renders replacement chars. This is THE subtle decode bug.
const BOX_VERTICAL = new Uint8Array([0xe2, 0x94, 0x82]);
export const MULTIBYTE_GLYPH = BOX_VERTICAL;
export const MULTIBYTE_SPLIT: [Uint8Array, Uint8Array] = [
  BOX_VERTICAL.subarray(0, 1), // E2
  BOX_VERTICAL.subarray(1), // 94 82
];

// Sample scrollback (ASCII is safe to render in one shot).
export const SCROLLBACK = new TextEncoder().encode('$ echo hello\r\nhello\r\n');
