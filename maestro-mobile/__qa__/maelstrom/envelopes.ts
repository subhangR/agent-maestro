// Maelstrom — entity-sync envelope shapes.
//
// Mirrors the REAL bridge wire contract (MOBILE_APP_BUILD_ANALYSIS.md §2.2, §3.4):
//   - every message is an envelope { type, event, data, timestamp } where type === event
//   - a 50ms BATCH flush is sent as a JSON ARRAY of envelopes
//   - an IMMEDIATE (bypass) event is sent as a SINGLE envelope object, un-batched
// A correct client MUST branch on Array.isArray() — getting this wrong silently
// drops half the events. Maelstrom exists to make that bug reproducible.
//
// Skeleton fidelity: shapes + framing are exact; the full TypedEventMap payloads
// grow with later phases (Lexicon owns domain/contracts/ws.ts; fixtures mirror it).

export interface WsEnvelope<T = unknown> {
  type: string;
  event: string;
  data: T;
  timestamp: number;
}

// Un-batched events: the bridge sends these as a single object, bypassing the
// 50ms batch. VERIFIED against source — WebSocketBridge.ts L16-24 defines EXACTLY
// these 7. (MOBILE_APP_BUILD_ANALYSIS.md §2.2 wrongly adds spell:activated/
// deactivated + ensemble:* — those ARE batched. Source is authoritative.)
export const IMMEDIATE_EVENTS = new Set<string>([
  'session:spawn',
  'session:resume',
  'session:prompt_send',
  'session:modal',
  'session:modal_action',
  'session:modal_closed',
  'spell:invoked',
]);

export function isImmediate(event: string): boolean {
  return IMMEDIATE_EVENTS.has(event);
}

// Deterministic timestamp: Date.now() is intentionally avoided so harness output
// is reproducible across runs. Tests pass an explicit clock tick when ordering matters.
export function makeEnvelope<T>(event: string, data: T, timestamp = 0): WsEnvelope<T> {
  return { type: event, event, data, timestamp };
}
