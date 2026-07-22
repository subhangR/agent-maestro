import * as http from 'http';
import * as path from 'path';
import { existsSync } from 'fs';
import { Duplex } from 'stream';
import express, { Request, Response, NextFunction } from 'express';
import { GatewayConfig } from './config';
import { Logger } from './logger';
import { AuthVerifier, Allowlist, AuthInput } from './auth';
import { InstanceSupervisor } from './supervisor';
import { Proxy } from './proxy';
import { AuthResult, AuthError } from './types';

/**
 * The gateway HTTP surface (Design A):
 *  - serves the maestro-ui SPA at the box origin
 *  - authenticates every /api call + every /ws & /pty upgrade (Firebase token
 *    or dev header), enforces the allowlist
 *  - ensures the caller's per-user instance is running, then reverse-proxies to it
 */
export class Gateway {
  readonly app: express.Express;

  constructor(
    private readonly config: GatewayConfig,
    private readonly logger: Logger,
    private readonly auth: AuthVerifier,
    private readonly allowlist: Allowlist,
    private readonly supervisor: InstanceSupervisor,
    private readonly proxy: Proxy,
  ) {
    this.app = express();
    this.buildApp();
  }

  private buildApp(): void {
    const app = this.app;

    // Gateway's own health (distinct from an instance's /health).
    app.get('/gateway/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        mode: this.auth.mode,
        workspaces: this.supervisor.listWorkspaces().length,
        uptime: process.uptime(),
      });
    });

    // All API traffic → authenticate → ensure instance → proxy. No body parser
    // runs before this, so the raw request stream reaches the upstream intact.
    app.use('/api', (req: Request, res: Response) => {
      this.authThenProxyHttp(req, res);
    });

    // Browser SPA (maestro-ui/dist), served once at the box origin.
    if (existsSync(this.config.uiDistPath)) {
      app.use(express.static(this.config.uiDistPath));
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path.startsWith('/pty')) {
          return next();
        }
        res.sendFile(path.join(this.config.uiDistPath, 'index.html'));
      });
    } else {
      this.logger.warn('maestro-ui/dist not found — SPA serve disabled', { path: this.config.uiDistPath });
    }
  }

  /** Verify identity + allowlist. Throws AuthError on rejection. */
  private async authenticate(req: http.IncomingMessage): Promise<AuthResult> {
    const identity = await this.auth.verify(extractAuthInput(req));
    if (this.config.enforceAllowlist && !this.allowlist.isAllowed(identity.email)) {
      throw new AuthError(403, `not on the allowlist: ${identity.email ?? identity.uid}`);
    }
    return identity;
  }

  private async authThenProxyHttp(req: Request, res: Response): Promise<void> {
    let identity: AuthResult;
    try {
      identity = await this.authenticate(req);
    } catch (err) {
      return this.rejectHttp(res, err);
    }
    try {
      const handle = await this.supervisor.ensure(identity.uid, identity.email);
      // Express strips the '/api' mount prefix from req.url — restore the full path.
      req.url = req.originalUrl;
      this.proxy.web(req, res, this.supervisor.targetFor(handle));
    } catch (err) {
      this.logger.error(`failed to route uid=${identity.uid}`, err);
      if (!res.headersSent) {
        res.status(503).json({ error: 'workspace_unavailable', message: 'could not start your workspace' });
      }
    }
  }

  /** Handle a /ws or /pty upgrade: authenticate, ensure instance, proxy the socket. */
  async handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname !== '/ws' && pathname !== '/pty') {
      socket.destroy();
      return;
    }
    let identity: AuthResult;
    try {
      identity = await this.authenticate(req);
    } catch (err) {
      const status = err instanceof AuthError ? err.status : 401;
      socket.write(`HTTP/1.1 ${status} Unauthorized\r\nConnection: close\r\n\r\n`);
      socket.destroy();
      return;
    }
    try {
      const handle = await this.supervisor.ensure(identity.uid, identity.email);
      this.proxy.ws(req, socket, head, this.supervisor.targetFor(handle));
    } catch (err) {
      this.logger.error(`failed to upgrade uid=${identity.uid}`, err);
      socket.destroy();
    }
  }

  private rejectHttp(res: Response, err: unknown): void {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.status === 403 ? 'forbidden' : 'unauthorized', message: err.message });
    } else {
      this.logger.error('auth error', err);
      res.status(401).json({ error: 'unauthorized', message: 'authentication failed' });
    }
  }
}

/** Pull identity material from an HTTP request or WS upgrade (shared shape). */
export function extractAuthInput(req: http.IncomingMessage): AuthInput {
  const authHeader = (req.headers['authorization'] as string | undefined) || '';
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  let queryToken: string | undefined;
  try {
    queryToken = new URL(req.url || '/', 'http://localhost').searchParams.get('token') || undefined;
  } catch {
    /* ignore */
  }
  return {
    bearerToken: bearerMatch?.[1] || queryToken,
    devUid: req.headers['x-maestro-uid'] as string | undefined,
    devEmail: req.headers['x-maestro-email'] as string | undefined,
  };
}
