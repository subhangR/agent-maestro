// zod v4 — boundary parse for INBOUND WebSocket messages. Pulse consumes ONLY
// this; it never JSON.parses the socket directly.
//
// Encodes the two server invariants (WebSocketBridge.ts):
//   - a batched flush arrives as WsEnvelope[]; an immediate event as a single
//     WsEnvelope → branch on Array.isArray, always return an array.
//   - unknown event names are DROPPED so a server version bump never crashes us.
//
// Opt-in import (not in the domain barrel).
import { z } from 'zod';
import { isKnownWsEvent, type RealtimeEvent } from '../contracts/ws';

// Validate only the envelope frame; `data` stays unknown (payloads are trusted
// per-event types downstream — boundary validation, not blanket).
const envelopeSchema = z.object({
  type: z.string(),
  event: z.string(),
  data: z.unknown(),
  timestamp: z.number(),
});

const rawMessageSchema = z.union([envelopeSchema, z.array(envelopeSchema)]);

/**
 * Parse a raw socket message into a flat array of known realtime events.
 * Malformed input → []. Unknown event names → silently dropped.
 */
export function parseWsMessage(raw: string): RealtimeEvent[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }

  const parsed = rawMessageSchema.safeParse(json);
  if (!parsed.success) return [];

  const envelopes = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const out: RealtimeEvent[] = [];
  for (const env of envelopes) {
    if (isKnownWsEvent(env.event)) {
      // event is a known WsEventName; the per-event payload type is enforced by
      // the RealtimeEvent union at the consumer's exhaustive switch.
      out.push(env as RealtimeEvent);
    }
  }
  return out;
}
