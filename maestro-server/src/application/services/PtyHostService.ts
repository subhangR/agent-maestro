import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import type { WebSocket } from 'ws';
import { ILogger } from '../../domain/common/ILogger';
import { SessionService } from './SessionService';

/**
 * Parameters for spawning a server-hosted PTY.
 */
export interface PtySpawnParams {
  sessionId: string;
  /** Full command line, run via `shell -c <command>`. */
  command: string;
  cwd: string;
  env: Record<string, string>;
  cols?: number;
  rows?: number;
}

interface PtyEntry {
  proc: IPty;
  /** Recent output chunks for scrollback replay to late-joining clients. */
  ring: Buffer[];
  ringBytes: number;
  subscribers: Set<WebSocket>;
  exited: boolean;
  exitCode: number | null;
  /** Current PTY dimensions, kept in sync with spawn/resize so late-joining
   *  clients can size their terminal to match the width the scrollback was
   *  authored at (otherwise replayed output wraps at the wrong column). */
  cols: number;
  rows: number;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const RING_CAP_BYTES = 256 * 1024;

const ESC = 0x1b;
const CSI_INTRO = 0x5b; // '['
const QUESTION = 0x3f; // '?'

/**
 * Remove terminal device-query / device-report control sequences from a chunk
 * of HISTORICAL scrollback before it is replayed to a late-joining client.
 *
 * Why: xterm answers device QUERIES it parses. When the scrollback ring is
 * replayed on (re)attach, the browser feeds these historical queries — DSR
 * cursor-position `ESC[6n`, Device Attributes `ESC[c` / `ESC[>c` — back into
 * xterm, which generates the REPLIES (`ESC[27;3R`, `ESC[?1;2c`) and forwards
 * them to the PTY as if the user typed them, corrupting the shell prompt after
 * the agent has exited. Reconnect amplification also leaves the raw reply bytes
 * (CPR `ESC[27;3R`, DA reply `ESC[?...c`) accumulated in the ring; those stale
 * artifacts are stripped too so they do not linger on replay.
 *
 * Scope is deliberately narrow — only the query/report protocol set, which has
 * no visible glyph, so stripping it from scrollback is lossless:
 *   - CSI … `c`  → Device Attributes (request or reply). `c` is DA-only.
 *   - CSI … `n`  → Device Status Report request (DSR, incl. DEC `?…n`). `n`-only.
 *   - CSI … `R`  → Cursor Position Report, but ONLY the `row;col` reply shape
 *                  (`\??\d+;\d+`) so ordinary output is never touched.
 *   - CSI `?` … `u` → kitty keyboard query/reply. Plain `CSI …u` (key encoding)
 *                     and `CSI >…u` / `CSI <…u` (mode push/pop) are preserved.
 *
 * Any other CSI (SGR colours, cursor motion, DEC private modes like `?25h`),
 * OSC, and plain text pass through untouched. This runs on the replay copy
 * only; the live output path is never sanitized, so a running program's
 * real-time queries still reach the client and get answered.
 */
export function stripScrollbackDeviceQueries(data: Buffer): Buffer {
  const out = Buffer.allocUnsafe(data.length);
  let w = 0;
  const len = data.length;
  let i = 0;
  while (i < len) {
    if (data[i] === ESC && i + 1 < len && data[i + 1] === CSI_INTRO) {
      // Consume CSI parameter/intermediate bytes (0x20–0x3f) up to the final
      // byte (0x40–0x7e).
      let j = i + 2;
      while (j < len && data[j] >= 0x20 && data[j] <= 0x3f) j++;
      if (j < len && data[j] >= 0x40 && data[j] <= 0x7e) {
        const final = data[j];
        const params = data.subarray(i + 2, j);
        if (shouldStripCsi(final, params)) {
          i = j + 1; // drop the whole sequence
          continue;
        }
        // keep the whole sequence verbatim
        data.copy(out, w, i, j + 1);
        w += j + 1 - i;
        i = j + 1;
        continue;
      }
      // Incomplete CSI at the tail (no final byte yet): copy the remainder
      // verbatim. On the concatenated ring this only happens at the very end.
      data.copy(out, w, i, len);
      w += len - i;
      break;
    }
    out[w++] = data[i++];
  }
  return out.subarray(0, w);
}

function shouldStripCsi(finalByte: number, params: Buffer): boolean {
  switch (finalByte) {
    case 0x63: // 'c' — Device Attributes (request or reply)
      return true;
    case 0x6e: // 'n' — Device Status Report request
      return true;
    case 0x75: // 'u' — strip ONLY the kitty query/reply (`?` prefix)
      return params.length > 0 && params[0] === QUESTION;
    case 0x52: {
      // 'R' — Cursor Position Report reply, only the `row;col` numeric shape
      // (optionally DEC `?row;col`). Never strip other `…R`.
      return /^\??[0-9]+;[0-9]+$/.test(params.toString('latin1'));
    }
    default:
      return false;
  }
}

/**
 * Owns agent PTYs server-side (replacing the Tauri-hosted PTY for headless/web
 * deployments). Spawns processes with node-pty, keeps a scrollback ring buffer
 * per session, and fans live output out to subscribed WebSocket clients.
 *
 * The actual WS framing lives in PtyWebSocketServer; this service is transport
 * agnostic beyond writing raw bytes to subscriber sockets.
 */
export class PtyHostService {
  private readonly sessions = new Map<string, PtyEntry>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly logger: ILogger,
  ) {}

  /**
   * Spawn a PTY for a session. If one already exists it is killed first.
   */
  spawn(params: PtySpawnParams): void {
    const { sessionId, command, cwd, env, cols, rows } = params;

    if (this.sessions.has(sessionId)) {
      this.logger.warn('PtyHostService: replacing existing PTY for session', { sessionId });
      this.kill(sessionId);
    }

    const shell = env.SHELL || process.env.SHELL || '/bin/bash';
    const clampDim = (v: number | undefined, fallback: number): number =>
      v && v > 0 ? Math.min(v, 1000) : fallback;
    const initialCols = clampDim(cols, DEFAULT_COLS);
    const initialRows = clampDim(rows, DEFAULT_ROWS);
    const proc = pty.spawn(shell, ['-c', command], {
      name: 'xterm-256color',
      cols: initialCols,
      rows: initialRows,
      cwd,
      // node-pty requires a string-keyed env; merge over the process env so the
      // child still sees HOME, etc., with caller overrides winning.
      env: { ...process.env, ...env } as Record<string, string>,
      encoding: null as any, // emit raw Buffers, not decoded strings
    });

    const entry: PtyEntry = {
      proc,
      ring: [],
      ringBytes: 0,
      subscribers: new Set(),
      exited: false,
      exitCode: null,
      cols: initialCols,
      rows: initialRows,
    };
    this.sessions.set(sessionId, entry);

    proc.onData((data: string | Buffer) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      this.appendToRing(entry, chunk);
      for (const ws of entry.subscribers) {
        this.safeSend(ws, chunk);
      }
    });

    proc.onExit(({ exitCode }) => {
      entry.exited = true;
      entry.exitCode = exitCode;
      this.logger.info('PtyHostService: session PTY exited', { sessionId, exitCode });
      const status = exitCode === 0 ? 'completed' : 'failed';
      void this.sessionService
        .updateSession(sessionId, { status })
        .catch((err) =>
          this.logger.error(
            'PtyHostService: failed to update session status on exit',
            err instanceof Error ? err : new Error(String(err)),
            { sessionId },
          ),
        );
      // Signal a REAL process exit to subscribers before closing their sockets,
      // so clients can distinguish "the agent finished/crashed" from a plain
      // socket drop (tab close, reload, network blip — those only detach). The
      // web adapter listens for this {type:'exit'} text frame. kill() does NOT
      // emit this: an explicit user stop is initiated by the UI, which already
      // knows the session ended.
      for (const ws of entry.subscribers) {
        try {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'exit', exitCode: exitCode ?? null }));
          }
        } catch {
          // best effort
        }
      }
      for (const ws of entry.subscribers) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
      entry.subscribers.clear();
      this.sessions.delete(sessionId);
    });

    this.logger.info('PtyHostService: spawned session PTY', { sessionId, pid: proc.pid, cwd });
  }

  /**
   * Spawn a PTY only if the session has no live one, otherwise reattach to the
   * existing process untouched.
   *
   * This is the reattach-safe counterpart to {@link spawn}: on a browser reload
   * the UI re-creates its persisted standalone terminals, each re-POSTing to
   * /pty/spawn. Those must NOT tear down and respawn a still-running shell (that
   * would kill the user's process and drop its scrollback) — they reattach to
   * the live PTY by session identity. A PTY that has already exited is no longer
   * tracked (onExit removes it), so it is recreated.
   *
   * `spawn()` stays deliberately destructive for the agent resume path, which
   * intends to replace the process.
   *
   * @returns `{ reused: true }` when a live PTY was reattached, `{ reused:
   *   false }` when a new PTY was spawned.
   */
  spawnIfAbsent(params: PtySpawnParams): { reused: boolean } {
    if (this.sessions.has(params.sessionId)) {
      this.logger.info('PtyHostService: reattaching to existing PTY', {
        sessionId: params.sessionId,
      });
      return { reused: true };
    }
    this.spawn(params);
    return { reused: false };
  }

  /** Whether a live PTY exists for the session. */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Current dimensions of a session's PTY, or null if no such session. */
  getSize(sessionId: string): { cols: number; rows: number } | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    return { cols: entry.cols, rows: entry.rows };
  }

  /** Write input (keystrokes) to the PTY. */
  write(sessionId: string, data: string | Buffer): void {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.exited) return;
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : data;
    entry.proc.write(text);
  }

  /** Resize the PTY. */
  resize(sessionId: string, cols: number, rows: number): void {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.exited) return;
    if (!cols || !rows || cols < 1 || rows < 1) return;
    if (cols > 1000 || rows > 1000) return;
    try {
      entry.proc.resize(cols, rows);
      entry.cols = cols;
      entry.rows = rows;
    } catch (err) {
      this.logger.warn('PtyHostService: resize failed', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Kill the PTY for a session. */
  kill(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    try {
      entry.proc.kill();
    } catch {
      // ignore
    }
    for (const ws of entry.subscribers) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    entry.subscribers.clear();
    this.sessions.delete(sessionId);
  }

  /**
   * Subscribe a WebSocket to a session's output. Replays the scrollback ring
   * buffer immediately so the client sees recent history. Returns false if no
   * such session exists.
   */
  addSubscriber(sessionId: string, ws: WebSocket): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    // Replay scrollback before attaching to the live stream. Concatenate the
    // ring and strip terminal device QUERIES/REPORTS first: replaying a
    // historical `ESC[6n`/`ESC[c` makes the client's xterm answer it and post
    // the reply back to the PTY as fake keystrokes ('27;3R'/'1;2c' garbage on
    // the shell prompt). Concatenating before stripping also catches a query
    // split across two ring chunks. The live stream (proc.onData → safeSend) is
    // never sanitized, so a running program's real-time queries still reach the
    // client and get answered.
    if (entry.ring.length > 0) {
      const scrollback = stripScrollbackDeviceQueries(Buffer.concat(entry.ring));
      if (scrollback.length > 0) this.safeSend(ws, scrollback);
    }
    entry.subscribers.add(ws);
    return true;
  }

  /** Remove a WebSocket subscriber. */
  removeSubscriber(sessionId: string, ws: WebSocket): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    entry.subscribers.delete(ws);
  }

  /** Kill all PTYs (graceful shutdown). */
  shutdownAll(): void {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.kill(sessionId);
    }
  }

  private appendToRing(entry: PtyEntry, chunk: Buffer): void {
    entry.ring.push(chunk);
    entry.ringBytes += chunk.length;
    while (entry.ringBytes > RING_CAP_BYTES && entry.ring.length > 1) {
      const dropped = entry.ring.shift()!;
      entry.ringBytes -= dropped.length;
    }
  }

  private safeSend(ws: WebSocket, chunk: Buffer): void {
    // 1 === WebSocket.OPEN
    if (ws.readyState !== 1) return;
    try {
      ws.send(chunk);
    } catch {
      // best effort; the socket's own close handler will detach it
    }
  }
}
