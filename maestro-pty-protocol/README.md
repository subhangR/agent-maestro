# @maestro/pty-protocol

Dependency-free, provider-/transport-agnostic parser and types for the
server→client **TEXT control frames** on a `/pty` WebSocket.

A `/pty` socket multiplexes two things on one connection:

- **binary frames** → raw PTY output bytes (written straight to the terminal)
- **text frames** → JSON control messages (`exit`, `size`, `attached{base,gap,next,hasReplay}`)

A text frame that is not a recognized control message is ordinary output that
merely happens to be a string, so `parseControlFrame` returns `null` and the
caller writes it to the terminal unchanged.

## Why a shared package

The `/pty` wire contract lives in three places that must agree byte-for-byte:

1. the server **producer** (`maestro-server` `PtyWebSocketServer`, CommonJS),
2. the Tauri/UI **consumer** (`maestro-ui`),
3. the browser POC **consumer** (`maestro-web`).

This package is the single source of truth for the **client-side parse** of that
contract, imported by both `maestro-ui` and `maestro-web` so the two clients
cannot silently drift (e.g. mishandling the raw-`next`-vs-sanitized-replay
distinction and duplicating scrollback).

The server producer stays **independent CommonJS**: it emits the documented wire
shape but does **not** import this ESM runtime module.

## Prerequisite for `maestro-web` terminal parity

This shared parser is a **prerequisite/blocker** for the `maestro-web`
terminal-parity work. `maestro-web` must reach parity by consuming this module,
**not** by forking a second copy of the parser. Its message path already routes
every `/pty` frame through `parseControlFrame` (see `maestro-web/src/ptyMessage.ts`).

## Usage

```ts
import { parseControlFrame, type PtyControlFrame } from '@maestro/pty-protocol';

const frame = parseControlFrame(textFramePayload);
if (!frame) {
  terminal.write(textFramePayload); // ordinary output
} else {
  // handle frame.type: 'exit' | 'size' | 'attached'
}
```

## Scripts

- `bun run test` — Vitest contract tests.
- `bun run typecheck` — `tsc --noEmit` over `src` + `test`.
- `bun run build` — emit standalone ESM + `.d.ts` to `dist/` (consumers import the
  TypeScript source directly via the `exports` map; `dist/` is for standalone use).
