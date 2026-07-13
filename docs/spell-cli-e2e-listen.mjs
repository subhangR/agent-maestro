#!/usr/bin/env node
// WebSocket capture helper for the spell CLI E2E.
//
// The dispatcher delivers inject-prompt output and (async) run-command feedOutput
// via the `session:prompt_send` WebSocket event — these are NOT persisted over REST,
// so the only headless way to assert them is to listen on the socket. This helper
// connects, records every event it receives as one JSON line ({type,data,at}) to an
// output file, and exits after a fixed duration. The E2E script greps that file.
//
// Usage: node spell-cli-e2e-listen.mjs --url ws://localhost:4569 --out /tmp/cap.jsonl --ms 12000 [--session <id>]
//
// It resolves `ws` from the workspace root node_modules (hoisted bun workspace).

import { appendFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '..', 'package.json'));
const WebSocket = require('ws');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const url = arg('url', 'ws://localhost:4569');
const out = arg('out', '/tmp/maestro-spell-e2e-capture.jsonl');
const ms = parseInt(arg('ms', '12000'), 10);
const sessionFilter = arg('session', null);

// Truncate the capture file up front so a stale run can't leak into assertions.
writeFileSync(out, '');

function record(type, data) {
  // Optional session filter: keep events whose payload targets our session, plus
  // anything without an obvious session field (better to over-capture than miss).
  if (sessionFilter) {
    const ids = Array.isArray(data?.sessionIds)
      ? data.sessionIds
      : data?.targetSessionId
        ? [data.targetSessionId]
        : data?.sessionId
          ? [data.sessionId]
          : null;
    if (ids && !ids.includes(sessionFilter)) return;
  }
  appendFileSync(out, JSON.stringify({ type, data, at: Date.now() }) + '\n');
}

function handleMessage(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    return;
  }
  // The bridge sends batched events as an array and immediate events as a single
  // object; both use { type/event, data }.
  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items) {
    const type = item?.type || item?.event;
    if (!type) continue;
    record(type, item.data);
  }
}

const ws = new WebSocket(url);

ws.on('open', () => {
  // No subscribe message → receive ALL events (bridge is backward-compatible and
  // sends everything to unsubscribed clients). Signal readiness on stderr so the
  // caller can wait for the socket before firing hooks.
  process.stderr.write('LISTENER_READY\n');
});
ws.on('message', handleMessage);
ws.on('error', (err) => {
  process.stderr.write(`LISTENER_ERROR ${err?.message || err}\n`);
});

setTimeout(() => {
  try { ws.close(); } catch { /* ignore */ }
  process.stderr.write('LISTENER_DONE\n');
  process.exit(0);
}, ms);
