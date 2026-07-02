// Envelope → typed RealtimeEvent.
//
// The ONLY place that knows the wire envelope shape. Ledger consumes the typed
// `{ event, data }` and applies entity-shape knowledge in its reducer.
//
// No runtime Zod on the hot path: the server already validated on write, and
// per-message parsing of a ~60-event firehose is a battery/jank risk on device.
// We trust the wire, narrow with the domain's compile-time types, and keep a
// __DEV__-only warning that catches contract drift (an unknown event name)
// without shipping the cost.

import { isKnownWsEvent, type RealtimeEvent } from '@/domain';

interface RawEnvelope {
  type?: unknown;
  event?: unknown;
  data?: unknown;
  timestamp?: unknown;
}

/**
 * Normalize one raw parsed envelope into a typed `RealtimeEvent`, or `null` if
 * it isn't a known server event (dropped — e.g. a `pong`, or a future event
 * this client build doesn't model yet). In __DEV__ an unknown but
 * envelope-shaped event warns once-ish so contract drift surfaces in dev.
 */
export function normalizeEvent(raw: unknown): RealtimeEvent | null {
  if (raw === null || typeof raw !== 'object') return null;

  const env = raw as RawEnvelope;
  const event = env.event;
  if (typeof event !== 'string') return null;

  if (!isKnownWsEvent(event)) {
    if (__DEV__ && typeof env.type === 'string') {
      warnUnknownEvent(event);
    }
    return null;
  }

  // Known event: trust the server's payload. The cast is the single boundary
  // where the untyped wire becomes the domain's discriminated union.
  return {
    type: event,
    event,
    data: env.data,
    timestamp: typeof env.timestamp === 'number' ? env.timestamp : Date.now(),
  } as RealtimeEvent;
}

const _warnedEvents = new Set<string>();
function warnUnknownEvent(event: string): void {
  if (_warnedEvents.has(event)) return;
  _warnedEvents.add(event);
  // eslint-disable-next-line no-console
  console.warn(
    `[realtime] unknown WS event "${event}" — dropped. ` +
      'Contract drift? Re-run the domain drift guard.',
  );
}
