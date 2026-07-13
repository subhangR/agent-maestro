// Maelstrom self-smoke — proves the harness reproduces the contract framing.
//
// This is NOT a jest test (jest-expo not installed at Phase 0). It runs under plain
// node against the `ws` client to PROVE, not assert, that Maelstrom emits:
//   1. a batched flush as a JSON ARRAY
//   2. an immediate event as a SINGLE OBJECT
//   3. /pty: size-frame (text) THEN scrollback (binary), in that order
//   4. /pty: 1011 close when the session has no live PTY
// Run:  node <compiled>/maelstrom-smoke.js   (see __qa__/README.md)

import WebSocket from 'ws';
import { startMaelstrom } from './maelstrom/server';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}`);
  if (!cond) failures++;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const m = await startMaelstrom({ batchWindowMs: 20 });

  // ---- entity-sync: array (batched) vs single (immediate) ----
  console.log('\nentity-sync framing');
  const received: Array<unknown> = [];
  const client = new WebSocket(m.wsUrl);
  await new Promise<void>((res) => client.on('open', () => res()));
  client.on('message', (raw) => received.push(JSON.parse(raw.toString())));

  // ping → pong
  let pong = false;
  client.on('message', (raw) => {
    try {
      if (JSON.parse(raw.toString())?.type === 'pong') pong = true;
    } catch {
      /* */
    }
  });
  client.send(JSON.stringify({ type: 'ping' }));

  m.entitySync.emit('task:updated', { id: 't1' });
  m.entitySync.emit('session:status_changed', { id: 's1' });
  m.entitySync.flush(); // force the array out
  m.entitySync.emit('session:spawn', { sessionId: 's2' }); // immediate → single
  await wait(50);

  const arrays = received.filter((x) => Array.isArray(x));
  const singles = received.filter((x) => x && !Array.isArray(x) && (x as any).event);
  check('ping→pong', pong);
  check('batched flush arrived as an ARRAY', arrays.length === 1 && (arrays[0] as unknown[]).length === 2);
  check('immediate event arrived as a SINGLE object', singles.some((s) => (s as any).event === 'session:spawn'));
  check('immediate single is NOT wrapped in an array', !arrays.some((a) => (a as any[]).some((e) => e.event === 'session:spawn')));
  client.close();

  // ---- pty: size→scrollback order, and 1011 on dead session ----
  console.log('\npty protocol');
  m.pty.setSession('alive-1', { scrollback: new TextEncoder().encode('hi'), alive: true });
  const frames: Array<{ text?: any; binLen?: number }> = [];
  const pty = new WebSocket(`${m.ptyUrl}?sessionId=alive-1`);
  pty.binaryType = 'arraybuffer';
  // Attach the message handler BEFORE open — the server sends {type:size}+scrollback
  // on connection, so a handler attached post-open races and drops the size frame.
  // (This is a real client requirement, not just a test detail.)
  // Version-tolerant: ws8 passes isBinary; ws7 does not. Fall back to a JSON probe
  // (binary scrollback isn't valid JSON) so this smoke runs under either major.
  const byteLen = (raw: any): number =>
    raw instanceof ArrayBuffer ? raw.byteLength : (raw?.length ?? 0);
  pty.on('message', (raw: any, isBinary?: boolean) => {
    if (isBinary === true || raw instanceof ArrayBuffer) {
      frames.push({ binLen: byteLen(raw) });
      return;
    }
    try {
      frames.push({ text: JSON.parse(raw.toString()) });
    } catch {
      frames.push({ binLen: byteLen(raw) });
    }
  });
  await new Promise<void>((res) => pty.on('open', () => res()));
  await wait(40);
  check('first frame is text {type:size}', frames[0]?.text?.type === 'size');
  check('second frame is binary scrollback', typeof frames[1]?.binLen === 'number' && (frames[1]!.binLen ?? 0) > 0);
  check('size frame precedes bytes', frames.findIndex((f) => f.text?.type === 'size') < frames.findIndex((f) => f.binLen));
  pty.close();

  // 1011 for a session with no live PTY
  let closeCode = 0;
  const dead = new WebSocket(`${m.ptyUrl}?sessionId=ghost`);
  dead.on('close', (code) => (closeCode = code));
  await wait(40);
  check('no-PTY session closes with 1011', closeCode === 1011);

  // 1008 for missing sessionId
  let code1008 = 0;
  const noId = new WebSocket(`${m.ptyUrl}`);
  noId.on('close', (code) => (code1008 = code));
  await wait(40);
  check('missing sessionId closes with 1008', code1008 === 1008);

  await m.close();
  console.log(`\nMaelstrom smoke: ${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
