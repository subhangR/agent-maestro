// Password auth for servers running with MAESTRO_AUTH_ENABLED=true.
//
// The server gates /api/* behind an HMAC token. Login (POST /api/auth/login with
// { password }) issues that token via an HttpOnly Set-Cookie — it is NOT in the
// response body. React Native (Android) still exposes the Set-Cookie response
// header to fetch, so we read the token out of it and thereafter ride it as the
// ?token= query param the server accepts "for non-browser clients" (the cookie
// jar is unreliable across RN, especially for WebSocket upgrades).
//
// /health and /api/auth/* are public, so probeHealth + login work pre-auth.

/** Thrown when a server needs a password we don't have yet — the connect screen
 *  catches this to reveal the password field. */
export class AuthRequiredError extends Error {
  constructor() {
    super('This server requires a password.');
    this.name = 'AuthRequiredError';
  }
}

/** Pull the maestro_auth token value out of a raw Set-Cookie header. */
function extractAuthToken(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = /maestro_auth=([^;,\s]+)/.exec(setCookie);
  return match?.[1] ?? null;
}

/**
 * Exchange a password for an auth token at `apiBaseUrl` (…/api). Resolves with the
 * token string; rejects with a human-readable message on bad password / rate limit
 * / unreadable cookie.
 */
export async function login(apiBaseUrl: string, password: string): Promise<string> {
  const res = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (res.status === 429) {
    throw new Error('Too many attempts — wait a few minutes and try again.');
  }
  if (res.status === 401) {
    throw new Error('Incorrect password.');
  }
  if (!res.ok) {
    throw new Error(`Login failed (${res.status}).`);
  }

  const token = extractAuthToken(res.headers.get('set-cookie'));
  if (!token) {
    throw new Error('Login succeeded but the server returned no readable token.');
  }
  return token;
}
