import { Router, Request, Response } from 'express';
import { AuthService } from '../infrastructure/auth/AuthService';

export function createAuthRoutes(authService: AuthService): Router {
  const router = Router();

  // Always public — lets the UI know if auth is required
  router.get('/auth/status', (req: Request, res: Response) => {
    const token = authService.extractTokenFromCookie(req.headers.cookie);
    res.json({
      authEnabled: authService.enabled,
      authenticated: authService.enabled ? authService.verifyToken(token || '') : false,
    });
  });

  router.post('/auth/login', (req: Request, res: Response) => {
    if (!authService.enabled) {
      return void res.json({ ok: true });
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';

    if (!authService.checkRateLimit(ip)) {
      return void res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }

    const { password } = req.body || {};
    if (typeof password !== 'string' || !authService.verifyPassword(password)) {
      authService.recordFailure(ip);
      return void res.status(401).json({ error: 'Invalid password' });
    }

    authService.recordSuccess(ip);
    const token = authService.issueToken();
    const maxAge = 7 * 24 * 60 * 60;
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const cookieParts = [
      `maestro_auth=${token}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${maxAge}`,
    ];
    if (isSecure) cookieParts.push('Secure');

    res.setHeader('Set-Cookie', cookieParts.join('; '));
    res.json({ ok: true });
  });

  router.post('/auth/logout', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', 'maestro_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  return router;
}
