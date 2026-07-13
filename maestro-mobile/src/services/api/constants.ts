// Shared constants for the API layer.

/** Default per-request timeout. Mobile radios stall silently, so every fetch is bounded. */
export const DEFAULT_TIMEOUT_MS = 20_000;

/** Common server port hint (staging 4569 / prod 3001 / default 4567) — display only. */
export const DEFAULT_SERVER_PORT = 4567;

/** Health probe path (unauthenticated, outside /api) used to validate a host before saving. */
export const HEALTH_PATH = '/health';
