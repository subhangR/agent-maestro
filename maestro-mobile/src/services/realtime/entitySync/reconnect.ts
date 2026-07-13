// Reconnect backoff policy — pure, unit-tested.
//
// Mirrors maestro-ui useMaestroStore.connectGlobal (:748): exponential backoff
// capped at 30s, plus 0–50% jitter so a fleet of clients doesn't reconnect in
// lockstep after a server blip.

export const MAX_BACKOFF_MS = 30_000;
const BASE_MS = 1_000;

/** Deterministic base delay for an attempt count (no jitter). */
export function backoffBase(attempts: number): number {
  const n = attempts < 0 ? 0 : attempts;
  return Math.min(BASE_MS * 2 ** n, MAX_BACKOFF_MS);
}

/**
 * Full delay = base + 0–50% jitter. `rng` is injectable for tests; defaults to
 * Math.random. Result is always within `[base, base * 1.5]`.
 */
export function backoffDelay(attempts: number, rng: () => number = Math.random): number {
  const base = backoffBase(attempts);
  return base + rng() * base * 0.5;
}
