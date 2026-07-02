// Maestro server connection configuration — pure URL derivation.
//
// Ported from maestro-ui's utils/serverConfig.ts, but RUNTIME instead of
// build-time: a phone can't bake in a host, so the user types `host:port` and
// Ledger's prefsStore persists the raw string. This module only does the pure
// string/URL math — `buildServerConfig(rawHost)` is the single entry point.
//
// Malformed hand-typed values can otherwise surface as opaque
// "The string did not match the expected pattern." errors, so the
// quote-stripping + protocol-allowlist hardening is kept. `new URL()` works
// under Hermes via react-native-url-polyfill (imported app-wide at boot).

/** Resolved, ready-to-use connection URLs for a single server host. */
export interface ServerConfig {
  /** Canonical REST base, always ends in /api. e.g. http://host:4569/api */
  apiBaseUrl: string;
  /** Entity-sync WebSocket — BARE origin, NO path. → Pulse. e.g. ws://host:4569 */
  wsUrl: string;
  /** PTY terminal socket — wsUrl + /pty. → Pulse. e.g. ws://host:4569/pty */
  ptyWsUrl: string;
  /** Display + base URL without /api. e.g. http://host:4569 */
  serverUrl: string;
}

function stripWrappingQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
  ];

  for (const [start, end] of pairs) {
    if (trimmed.startsWith(start) && trimmed.endsWith(end) && trimmed.length >= 2) {
      return trimmed.slice(1, -1).trim();
    }
  }

  return trimmed;
}

function normalizeCandidate(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = stripWrappingQuotes(raw);
  return cleaned || null;
}

/**
 * Parse an absolute URL, accepting only http/https/ws/wss. A bare `host:port`
 * (no protocol) is treated as http so users can type `192.168.1.5:4569`.
 */
function parseAbsoluteUrl(raw: string | null | undefined): URL | null {
  const candidate = normalizeCandidate(raw);
  if (!candidate) return null;

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)
    ? candidate
    : `http://${candidate}`;

  try {
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function buildUrl(origin: string, pathname: string, search = ''): string {
  const normalizedPath = normalizePathname(pathname);
  return `${origin}${normalizedPath === '/' ? '' : normalizedPath}${search}`;
}

/**
 * Derive the entity-sync WebSocket URL from a REST URL.
 * http→ws, https→wss, host preserved, NO path (bare origin — exactly what the
 * entity-sync bridge wants). Returns null for unparseable input (no localhost
 * default on mobile — see buildServerConfig).
 */
export function deriveWsUrl(apiUrl: string): string | null {
  const parsed = parseAbsoluteUrl(apiUrl);
  if (!parsed) return null;
  const protocol = parsed.protocol === 'https:' || parsed.protocol === 'wss:' ? 'wss:' : 'ws:';
  return `${protocol}//${parsed.host}`;
}

/** Strip `/api` (and any path) — the display + /pty base. Null if unparseable. */
export function deriveServerUrl(apiUrl: string): string | null {
  const parsed = parseAbsoluteUrl(apiUrl);
  if (!parsed) return null;
  const protocol = parsed.protocol === 'wss:' ? 'https:' : parsed.protocol === 'ws:' ? 'http:' : parsed.protocol;
  return `${protocol}//${parsed.host}`;
}

/**
 * Normalize a raw host/URL into the canonical REST base (always ends /api).
 * Appends /api when the user typed a bare origin. Null if unparseable.
 */
export function normalizeApiBaseUrl(raw: string | null | undefined): string | null {
  const parsed = parseAbsoluteUrl(raw);
  if (!parsed) return null;

  const protocol = parsed.protocol === 'wss:' ? 'https:' : parsed.protocol === 'ws:' ? 'http:' : parsed.protocol;
  const origin = `${protocol}//${parsed.host}`;
  const pathname = normalizePathname(parsed.pathname);

  if (pathname === '/') {
    return `${origin}/api`;
  }
  return buildUrl(origin, pathname);
}

/**
 * Normalize an explicit WS URL against a known REST base. ws/wss pass through
 * (path + search preserved); http/https are converted; anything else falls back
 * to deriving from the REST base. Null if both are unusable.
 */
export function normalizeWsUrl(
  rawWsUrl: string | null | undefined,
  apiBaseUrl: string,
): string | null {
  const parsed = parseAbsoluteUrl(rawWsUrl);
  if (!parsed) return deriveWsUrl(apiBaseUrl);

  if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
    return buildUrl(`${parsed.protocol}//${parsed.host}`, parsed.pathname, parsed.search);
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return buildUrl(`${protocol}//${parsed.host}`, parsed.pathname, parsed.search);
  }
  return deriveWsUrl(apiBaseUrl);
}

/**
 * Build the full {apiBaseUrl, wsUrl, ptyWsUrl, serverUrl} bundle from a raw
 * user-entered host/URL. Throws on an unparseable host — there is no localhost
 * default on a phone (that would be the phone itself), so an invalid host must
 * surface to the connect screen rather than silently "work".
 */
export function buildServerConfig(rawHostOrUrl: string): ServerConfig {
  const apiBaseUrl = normalizeApiBaseUrl(rawHostOrUrl);
  const wsUrl = apiBaseUrl ? deriveWsUrl(apiBaseUrl) : null;
  const serverUrl = apiBaseUrl ? deriveServerUrl(apiBaseUrl) : null;

  if (!apiBaseUrl || !wsUrl || !serverUrl) {
    throw new Error(`Invalid server host: "${rawHostOrUrl}"`);
  }

  return { apiBaseUrl, wsUrl, ptyWsUrl: `${wsUrl}/pty`, serverUrl };
}
