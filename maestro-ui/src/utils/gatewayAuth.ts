import { onIdTokenChanged } from 'firebase/auth';
import { getFbAuth } from '../firebase/auth';

/**
 * Trusted-Team Hub gateway auth wiring (Design A, M4).
 *
 * Build-time gate: ONLY the gateway-served SPA is built with
 * VITE_MAESTRO_AUTH_MODE=firebase. Everywhere else — the Tauri desktop app and
 * the direct-server web build — this is unset, so every helper below is a no-op
 * and the client behaves exactly as it did before. This keeps the multi-user
 * gateway path from ever touching the single-server experience.
 *
 * In gateway mode, each request carries the signed-in user's Firebase ID token so
 * the gateway can map uid → that user's private maestro-server instance:
 *  - REST: Authorization: Bearer <token>   (see MaestroClient.fetch)
 *  - WS/PTY: ?token=<token>                 (WebSocket can't set headers)
 */
export const GATEWAY_AUTH_MODE =
  String(import.meta.env.VITE_MAESTRO_AUTH_MODE || '').toLowerCase() === 'firebase';

// Cached ID token, kept fresh by Firebase's onIdTokenChanged (fires on sign-in
// and on the ~hourly silent refresh). Lets the synchronous WebSocket connect
// sites append a token without an async refactor of the reconnect logic.
let cachedIdToken: string | null = null;

if (GATEWAY_AUTH_MODE) {
  try {
    onIdTokenChanged(getFbAuth(), async (user) => {
      cachedIdToken = user ? await user.getIdToken().catch(() => null) : null;
    });
  } catch {
    /* firebase not initialized in this context — token stays null */
  }
}

/**
 * Fresh ID token for REST calls (getIdToken auto-refreshes when expired).
 * Returns null when not in gateway mode or when no user is signed in.
 */
export async function getGatewayAuthToken(): Promise<string | null> {
  if (!GATEWAY_AUTH_MODE) return null;
  try {
    const user = getFbAuth().currentUser;
    const token = user ? await user.getIdToken() : null;
    if (token) cachedIdToken = token;
    return token;
  } catch {
    return null;
  }
}

/** Append the cached ID token as a ?token= param for WS/PTY connect URLs. */
export function withGatewayToken(url: string): string {
  if (!GATEWAY_AUTH_MODE || !cachedIdToken) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(cachedIdToken)}`;
}
