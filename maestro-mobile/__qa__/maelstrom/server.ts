// Maelstrom — the combined fake server.
//
// Mirrors maestro-server/src/server.ts (§2.2): two WebSocket servers on ONE HTTP
// port, routed by upgrade path. Any path EXCEPT /pty → entity-sync bridge (the
// client connects to the bare origin, no path). /pty → the per-session PTY socket.
//
// REST is NOT served here — REST is mocked with MSW handlers (msw-handlers.ts) at
// the fetch layer so MaestroClient is exercised unmodified. Maelstrom owns only the
// two things MSW cannot model: the WS array/single framing and the binary PTY protocol.

import { createServer, type Server } from 'node:http';
import { Server as WebSocketServer } from 'ws';
import { MaelstromEntitySync } from './entitySync';
import { MaelstromPty } from './pty';

export interface MaelstromHandle {
  server: Server;
  entitySync: MaelstromEntitySync;
  pty: MaelstromPty;
  port: number;
  /** Bare origin a client uses for the entity-sync WS, e.g. ws://127.0.0.1:<port> */
  wsUrl: string;
  /** PTY base, e.g. ws://127.0.0.1:<port>/pty */
  ptyUrl: string;
  close: () => Promise<void>;
}

export async function startMaelstrom(opts: { batchWindowMs?: number } = {}): Promise<MaelstromHandle> {
  const http = createServer((_req, res) => {
    // /health and /ws-status live outside /api and need no auth (§3.1).
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  const entitySync = new MaelstromEntitySync({ batchWindowMs: opts.batchWindowMs });
  const pty = new MaelstromPty();

  const entityWss = new WebSocketServer({ noServer: true });
  const ptyWss = new WebSocketServer({ noServer: true });
  entitySync.attach(entityWss);
  pty.attach(ptyWss);

  // Route by upgrade path — the real server's discriminator.
  http.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    const target = path === '/pty' ? ptyWss : entityWss;
    target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
  });

  const port = await listen(http);
  const wsUrl = `ws://127.0.0.1:${port}`;
  return {
    server: http,
    entitySync,
    pty,
    port,
    wsUrl,
    ptyUrl: `${wsUrl}/pty`,
    close: () =>
      new Promise<void>((resolve) => {
        entitySync.close();
        pty.close();
        entityWss.close();
        ptyWss.close();
        http.close(() => resolve());
      }),
  };
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}
