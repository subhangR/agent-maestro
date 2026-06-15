import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../infrastructure/auth/AuthService';

// Paths exempt from the auth guard (always public)
const EXEMPT_PREFIXES = [
  '/api/auth/',
  '/health',
  '/ws-status',
];

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// A request is "trusted local" when it arrives directly on the loopback
// interface with no proxy-forwarding headers. Remote access only ever reaches
// the server through `tailscale serve` (a reverse proxy that adds X-Forwarded-*
// headers), so a bare loopback request is the maestro CLI / local tooling on the
// same host — which must work without the web password. Works for both Express
// requests and raw WS upgrade requests (both expose .socket + .headers).
export function isTrustedLocalRequest(req: {
  socket?: { remoteAddress?: string | null };
  headers: Record<string, string | string[] | undefined>;
}): boolean {
  const remote = req.socket?.remoteAddress || '';
  if (!LOOPBACK.has(remote)) return false;
  if (req.headers['x-forwarded-for']) return false;
  if (req.headers['x-forwarded-proto']) return false;
  return true;
}

export function createAuthMiddleware(authService: AuthService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!authService.enabled) return next();

    // Only API routes are guarded. The static SPA (index.html + /assets/*) must
    // load unauthenticated so the browser can render the login screen, which then
    // POSTs to /api/auth/login. WebSocket upgrades (/ws, /pty) are gated separately
    // in the server's upgrade handler.
    if (!req.path.startsWith('/api')) return next();

    // Trust the local maestro CLI / tooling on the same host (see helper above).
    if (isTrustedLocalRequest(req)) return next();

    for (const prefix of EXEMPT_PREFIXES) {
      if (req.path === prefix || req.path.startsWith(prefix)) return next();
    }

    const cookieToken = authService.extractTokenFromCookie(req.headers.cookie);
    // Accept ?token= query param as fallback (for non-browser clients)
    const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
    const token = cookieToken || queryToken;

    if (!token || !authService.verifyToken(token)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  };
}
