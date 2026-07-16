// The provider-neutral `/pty` control-frame parser and its frame types now live
// in the shared, dependency-free `@maestro/pty-protocol` package so that
// maestro-ui and maestro-web parse the identical wire contract and cannot
// silently drift. This module re-exports that single source of truth to keep
// maestro-ui's internal import path (`./ptyProtocol`) stable for `terminal.ts`.
//
// Do NOT re-introduce a local copy of the parser here — the maestro-ui parity
// test (`__tests__/ptyProtocol.test.ts`) asserts this module re-exports the
// exact shared `parseControlFrame`.
export { parseControlFrame, type PtyControlFrame } from '@maestro/pty-protocol';
