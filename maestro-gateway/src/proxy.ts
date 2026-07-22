import * as http from 'http';
import { Duplex } from 'stream';
import httpProxy from 'http-proxy';
import { Logger } from './logger';

/**
 * Thin wrapper over node-http-proxy for both HTTP and WebSocket/PTY upgrades.
 * The gateway never rewrites bodies — it streams the request straight to the
 * resolved per-user instance over loopback, so entity sync (/ws) and the PTY
 * stream (/pty) pass through untouched.
 */
export class Proxy {
  private readonly proxy: httpProxy;

  constructor(private readonly logger: Logger) {
    this.proxy = httpProxy.createProxyServer({
      ws: true,
      xfwd: true,
      changeOrigin: false,
      proxyTimeout: 0, // never time out streamed/long-poll responses
    });

    this.proxy.on('error', (err, _req, res) => {
      this.logger.error('proxy error', err);
      // `res` is a ServerResponse for web, or a Socket for ws.
      const anyRes = res as any;
      if (anyRes && typeof anyRes.writeHead === 'function' && !anyRes.headersSent) {
        anyRes.writeHead(502, { 'Content-Type': 'application/json' });
        anyRes.end(JSON.stringify({ error: 'bad_gateway', message: 'upstream instance unavailable' }));
      } else if (anyRes && typeof anyRes.destroy === 'function') {
        anyRes.destroy();
      }
    });
  }

  web(req: http.IncomingMessage, res: http.ServerResponse, target: string): void {
    this.proxy.web(req, res, { target });
  }

  ws(req: http.IncomingMessage, socket: Duplex, head: Buffer, target: string): void {
    this.proxy.ws(req, socket, head, { target });
  }

  close(): void {
    this.proxy.close();
  }
}
