import type { RequestHandler } from 'express';
import helmet from 'helmet';

/**
 * Convert an http(s) origin into its WebSocket-scheme equivalent
 * (https:// -> wss://, http:// -> ws://). Returns null for anything that
 * isn't an http(s) origin so callers can filter out bad env input instead of
 * emitting a garbage CSP source.
 */
function toWebSocketOrigin(origin: string): string | null {
  if (origin.startsWith('https://')) return `wss://${origin.slice('https://'.length)}`;
  if (origin.startsWith('http://')) return `ws://${origin.slice('http://'.length)}`;
  return null;
}

/**
 * Security headers shared by the API and the browser SPA.
 *
 * Two things the default `helmet()` CSP breaks for this app, both fixed
 * below:
 *
 * 1. Firebase's Google sign-in flow opens a cross-origin popup and reports
 *    the result back to the SPA through window.opener. Helmet defaults COOP
 *    to `same-origin`, which makes that popup appear closed as soon as it
 *    navigates to Google/Firebase. `same-origin-allow-popups` preserves
 *    opener access for popups opened by this document while retaining COOP
 *    isolation from unrelated top-level pages. The CSP `connect-src`/
 *    `frame-src` entries below allowlist the Firebase/Google origins the
 *    Collab Space feature needs (mirrors the desktop app's CSP in
 *    maestro-ui/src-tauri/tauri.conf.json).
 *
 * 2. Helmet's default CSP (`default-src 'self'`, no `connect-src`/
 *    `worker-src` overrides) blocks the browser web UI itself: it needs
 *    WebSocket connections to `/ws` (event bridge) and `/pty` (terminals),
 *    xterm.js/Monaco's inline styles and workers, and — when self-hosted
 *    behind a Cloudflare Tunnel, Tailscale `serve`, or a custom domain —
 *    connections to whatever origin the operator serves the SPA from. That
 *    used to force self-hosters to hand-edit this file to
 *    `contentSecurityPolicy: false` (disabling CSP entirely) after every
 *    deploy. The directives below fix this generically instead.
 *
 * @param allowedOrigins - Extra origins the browser SPA may be served from,
 *   sourced from `MAESTRO_ALLOWED_ORIGINS` (the same env var CORS already
 *   uses in server.ts) so self-hosters declare their public/Tailscale/
 *   Cloudflare-Tunnel origin once and both CORS and CSP pick it up — no code
 *   change needed per deployment.
 */
export function createSecurityHeaders(allowedOrigins: string[] = []): RequestHandler {
  const coop = { policy: 'same-origin-allow-popups' as const };

  // Full escape hatch for debugging a CSP issue in the field. The default
  // (unset) is always the secure, working policy below — this should not be
  // set in normal operation.
  if (process.env.MAESTRO_DISABLE_CSP === 'true') {
    return helmet({
      crossOriginOpenerPolicy: coop,
      contentSecurityPolicy: false,
    });
  }

  const wsOrigins = allowedOrigins
    .map(toWebSocketOrigin)
    .filter((origin): origin is string => origin !== null);

  // Serving the SPA over plain HTTP (TLS terminated upstream by nginx /
  // `tailscale serve` / a reverse proxy) needs the default
  // `upgrade-insecure-requests` directive dropped, or the browser
  // force-upgrades every asset request to HTTPS and they fail. Leave unset
  // (default) for direct-HTTPS and desktop deployments.
  const disableCspUpgrade = process.env.MAESTRO_DISABLE_CSP_UPGRADE === '1';

  return helmet({
    crossOriginOpenerPolicy: coop,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", 'https://apis.google.com', 'https://www.gstatic.com'],
        // xterm.js and Monaco both inject inline <style> elements/attributes
        // at runtime (cursor blink, decorations, line highlighting, editor
        // themes) with no nonce plumbing — style-src needs 'unsafe-inline'.
        // This is the normal/accepted tradeoff for terminal + editor
        // components; script-src stays nonce-free/'unsafe-inline'-free.
        'style-src': ["'self'", "'unsafe-inline'"],
        // Monaco's language workers and any blob-URL based worker.
        'worker-src': ["'self'", 'blob:'],
        'connect-src': [
          "'self'",
          // The browser SPA talks to /ws (event bridge) and /pty (terminals)
          // over WebSocket, same-origin by default. 'self' already covers
          // same-origin ws(s) per the CSP spec, but allow the ws:/wss:
          // schemes outright too since some webviews don't apply that
          // same-origin-upgrade rule reliably, and the packaged desktop app
          // (origin tauri://localhost) talks to a self-hosted server on a
          // different origin.
          'ws:',
          'wss:',
          // Every self-hosted origin the operator declared via
          // MAESTRO_ALLOWED_ORIGINS (already used by CORS above), plus its
          // ws/wss equivalent, so a custom domain/Tailscale/Cloudflare
          // Tunnel origin needs zero code changes here.
          ...allowedOrigins,
          ...wsOrigins,
          'https://*.googleapis.com',
          'https://identitytoolkit.googleapis.com',
          'https://securetoken.googleapis.com',
          'https://firestore.googleapis.com',
          'https://firebasestorage.googleapis.com',
          'https://*.firebaseio.com',
          'wss://*.firebaseio.com',
          'https://*.cloudfunctions.net',
          'https://accounts.google.com',
        ],
        'frame-src': ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com'],
        'img-src': [
          "'self'",
          'data:',
          'blob:',
          'https://*.googleusercontent.com',
          'https://lh3.googleusercontent.com',
        ],
        'font-src': ["'self'", 'data:', 'blob:'],
        ...(disableCspUpgrade ? { upgradeInsecureRequests: null } : {}),
      },
    },
  });
}
