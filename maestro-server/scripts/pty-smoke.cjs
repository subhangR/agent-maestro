/**
 * Phase 4 backend smoke test for server-hosted PTY streaming.
 *
 * Exercises the real PtyHostService + PtyWebSocketServer over a throwaway HTTP
 * server (no projects/manifests/CLI needed) to prove the core loop:
 *   spawn PTY -> scrollback replay on connect -> live output -> input echo ->
 *   resize -> exit flips status + cleans up registry.
 *
 * IMPORTANT: run under node, not bun. node-pty's data events do not fire under
 * bun. The real server runs under node (`bun run dev` => `tsc && node ...`).
 *
 * Usage (from maestro-server/):
 *   bunx tsc && node scripts/pty-smoke.cjs
 */
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { PtyHostService } = require('../dist/application/services/PtyHostService');
const { PtyWebSocketServer } = require('../dist/infrastructure/websocket/PtyWebSocketServer');

const PORT = 4599; // throwaway port, isolated from 4567/4568/4569/3001/4570

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

async function waitUntil(pred, timeoutMs, msg) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await sleep(25);
  }
  throw new Error(`TIMEOUT: ${msg}`);
}

function pass(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}

async function main() {
  const statuses = [];
  const fakeSessionService = {
    updateSession: async (_id, updates) => {
      if (updates && updates.status) statuses.push(updates.status);
    },
  };

  const ptyHost = new PtyHostService(fakeSessionService, noopLogger);

  const server = http.createServer();
  const ptyWss = new WebSocketServer({ noServer: true });
  new PtyWebSocketServer(ptyWss, ptyHost, noopLogger);
  server.on('upgrade', (req, socket, head) => {
    if ((req.url || '').split('?')[0] === '/pty') {
      ptyWss.handleUpgrade(req, socket, head, (ws) => ptyWss.emit('connection', ws, req));
    } else {
      socket.destroy();
    }
  });
  await new Promise((resolve) => server.listen(PORT, resolve));

  console.log('PTY streaming smoke test\n');

  const sessionId = 'smoke-' + process.pid;
  // printf emits initial output, then `cat` echoes any stdin until EOF (Ctrl-D).
  ptyHost.spawn({
    sessionId,
    command: "printf 'READY\\n'; cat",
    cwd: process.cwd(),
    env: { ...process.env },
    cols: 80,
    rows: 24,
  });

  // Let initial output accumulate in the ring buffer before we connect.
  await sleep(200);

  const ws = new WebSocket(`ws://localhost:${PORT}/pty?sessionId=${sessionId}`);
  ws.binaryType = 'nodebuffer';
  let received = '';
  ws.on('message', (d) => {
    received += d.toString('utf8');
  });
  await waitForOpen(ws);

  // 1. Scrollback replay of output produced before connect.
  await waitUntil(() => received.includes('READY'), 2000, 'initial output (scrollback replay) not received');
  pass('received initial output via scrollback replay');

  // 2. Input is written to the PTY and echoed back through `cat`.
  ws.send(Buffer.from('ping-12345\n'));
  await waitUntil(() => received.includes('ping-12345'), 2000, 'input echo not received');
  pass('keystroke input streamed to PTY and echoed back');

  // 3. Resize control message accepted without error.
  ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
  await sleep(100);
  pass('resize control message accepted');

  // 4. EOF (Ctrl-D) ends `cat`, shell exits 0 -> status completed.
  let closed = false;
  ws.on('close', () => {
    closed = true;
  });
  ws.send(Buffer.from([0x04]));
  await waitUntil(() => statuses.includes('completed'), 3000, 'exit status not recorded as completed');
  pass(`exit recorded session status = ${statuses.join(',')}`);

  // 5. Registry cleaned up; subscriber socket closed by server.
  await waitUntil(() => !ptyHost.hasSession(sessionId), 1000, 'registry not cleaned up after exit');
  pass('PTY registry cleaned up after exit');
  await waitUntil(() => closed, 1000, 'subscriber socket not closed on exit');
  pass('subscriber socket closed on exit');

  ptyHost.shutdownAll();
  server.close();
  console.log('\n\x1b[32mALL SMOKE CHECKS PASSED\x1b[0m');
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n\x1b[31mSMOKE TEST FAILED:\x1b[0m ${err && err.message ? err.message : err}`);
  process.exit(1);
});
