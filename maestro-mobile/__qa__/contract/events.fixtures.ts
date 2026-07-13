// Contract fixtures — sample entity-sync envelopes.
//
// These mirror the wire shapes from MOBILE_APP_BUILD_ANALYSIS.md §3.4. Phase-0
// payloads are minimal stand-ins; once Lexicon stabilises domain/contracts/ws.ts
// (TypedEventMap), these `data` bodies get typed against the real entity shapes.
//
// The point of these two fixtures is the demux test: a BATCHED group arrives as an
// ARRAY, an IMMEDIATE event arrives as a SINGLE OBJECT. A client that ignores
// Array.isArray drops one of them.

import { makeEnvelope, type WsEnvelope } from '../maelstrom/envelopes';

// A 50ms flush: multiple domain events coalesced into ONE array.
export const BATCHED_FLUSH: WsEnvelope[] = [
  makeEnvelope('task:updated', { id: 'task_1', status: 'working' }, 1),
  makeEnvelope('session:status_changed', { id: 'sess_1', status: 'run' }, 1),
  makeEnvelope('notify:progress', { sessionId: 'sess_1', message: 'step 2/5' }, 1),
];

// An immediate (bypass) event: sent as a single object, NOT wrapped in an array.
export const IMMEDIATE_SINGLE: WsEnvelope = makeEnvelope(
  'session:spawn',
  { sessionId: 'sess_2', projectId: 'proj_1' },
  2,
);

// A mixed sequence a demux test should fully drain: [array, single, array].
export const MIXED_SEQUENCE: Array<WsEnvelope | WsEnvelope[]> = [
  BATCHED_FLUSH,
  IMMEDIATE_SINGLE,
  [makeEnvelope('task:created', { id: 'task_2' }, 3)],
];
