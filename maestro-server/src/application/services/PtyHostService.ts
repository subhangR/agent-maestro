import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import type { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { ILogger } from '../../domain/common/ILogger';
import { SessionService } from './SessionService';
import { OutputBuffer, ReplaySlice } from './OutputBuffer';
import { TerminalStateMirror } from './TerminalStateMirror';

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

/**
 * Outcome of {@link PtyHostService.kill}, so an EXPLICIT caller (the /pty/stop
 * route) can distinguish the three cases it must report differently:
 *   - `killed`    a tracked PTY entry existed and the process is now gone; entry
 *                 finalized. This covers both proc.kill() succeeding AND the
 *                 already-exited race (proc.kill() throwing ESRCH — the process
 *                 had already died between our map lookup and the signal), because
 *                 both reach the same intended end-state and are idempotent success.
 *   - `not_found` no tracked PTY entry for the id; nothing to kill (a no-op).
 *   - `error`     a tracked PTY entry existed but proc.kill() threw a GENUINE
 *                 failure (e.g. EPERM). The entry is STILL finalized (cleanup is
 *                 unconditional), but the kill signal really failed and the caller
 *                 may surface a non-2xx.
 * The `killed`/`not_found` split is strictly "did a tracked entry exist?" — an
 * ESRCH race stays `killed` (an entry existed and we finalized it) rather than
 * collapsing to `not_found`, keeping the two outcomes orthogonal.
 * Internal callers (spawn-replace, shutdownAll) ignore this and rely only on the
 * unconditional finalization, so their behavior is unchanged.
 */
export type PtyKillOutcome = 'killed' | 'not_found' | 'error';

interface PendingSubscriber {
  chunks: Buffer[];
  bytes: number;
}

interface PtyEntry {
  proc: IPty;
  /** Offset-tracked scrollback buffer: counts every raw byte the PTY has ever
   *  produced and retains a bounded tail, so a reconnecting client can resume
   *  from the exact byte offset it last saw (see {@link PtyHostService.getReplay}). */
  output: OutputBuffer;
  /** Parsed terminal state used when the raw replay ring has evicted the
   * client's resume point. */
  state: TerminalStateMirror;
  subscribers: Set<WebSocket>;
  /** Sockets waiting for an asynchronous state snapshot. */
  pendingSubscribers: Map<WebSocket, PendingSubscriber>;
  exited: boolean;
  exitCode: number | null;
  /** Current PTY dimensions, kept in sync with spawn/resize so late-joining
   *  clients can size their terminal to match the width the scrollback was
   *  authored at (otherwise replayed output wraps at the wrong column). */
  cols: number;
  rows: number;
  /** Opaque stream identity for THIS spawn (see {@link PtyHostService.newEpoch}).
   *  Minted once per spawn and never mutated, so it is stable for the life of one
   *  stream; a kill+respawn under the same sessionId installs a fresh entry with a
   *  new epoch. The client compares it by equality only (a change ⇒ authoritative
   *  reset) and never infers ordering. Echoed to clients in the `attached` frame. */
  epoch: string;
}

interface PendingPromptDelivery {
  content: string;
  mode: 'send' | 'paste';
  bytes: number;
}

interface PendingPromptQueue {
  deliveries: PendingPromptDelivery[];
  bytes: number;
  draining: boolean;
  overflowWarned: boolean;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_PENDING_SNAPSHOT_BYTES = 4 * 1024 * 1024;
// Keep server attach handoff bounds aligned with PR #163's client-side queue.
// Overflow preserves the already-accepted FIFO prefix and rejects newer input.
const MAX_PENDING_PROMPT_SESSIONS = 64;
const MAX_PENDING_PROMPTS_PER_SESSION = 32;
const MAX_PENDING_PROMPT_BYTES_PER_SESSION = 256 * 1024;

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
      if (j >= len) {
        // Genuinely incomplete CSI at the tail (scanned off the end before a
        // final byte). Copy the remainder verbatim — on the concatenated ring
        // this only happens at the very end.
        data.copy(out, w, i, len);
        w += len - i;
        break;
      }
      // Malformed CSI mid-buffer: a non-parameter/non-final byte (a C0 control,
      // DEL, or a high byte) interrupted the sequence. Emit the ESC literally
      // and resume scanning at the next byte so a later well-formed device
      // query is still stripped instead of leaking through. Bytes are neither
      // dropped nor reordered.
      out[w++] = data[i++];
      continue;
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
 * deployments). Spawns processes with node-pty, keeps an offset-tracked output
 * buffer per session (for byte-accurate scrollback resume), and fans live
 * output out to subscribed WebSocket clients.
 *
 * The actual WS framing lives in PtyWebSocketServer; this service is transport
 * agnostic beyond writing raw bytes to subscriber sockets.
 */
export class PtyHostService {
  private readonly sessions = new Map<string, PtyEntry>();
  private readonly pendingPrompts = new Map<string, PendingPromptQueue>();
  /** Spawn/resume events pause draining until the PTY lifecycle decision is
   * finished by spawn, spawnIfAbsent, or explicit reuse completion. */
  private readonly promptHandoffs = new Set<string>();

  /**
   * Per-INSTANCE boot nonce for stream epochs (#151). Minted once when the
   * service is constructed, so every PTY spawned by this process shares this
   * prefix, and a NEW process (server restart) — a new PtyHostService instance —
   * gets a fresh nonce. That is what makes two service instances mint disjoint
   * epochs even for the very first spawn (where a bare per-instance counter would
   * collide at the same value). Combined with {@link epochCounter}, the full
   * epoch is unique per spawn AND across restarts.
   */
  private readonly bootNonce = randomUUID();
  /** Monotonic per-spawn counter; makes each respawn within THIS process
   *  distinct even under the same sessionId. */
  private epochCounter = 0;

  constructor(
    private readonly sessionService: SessionService,
    private readonly logger: ILogger,
  ) {}

  /** Mint the next opaque stream epoch: a per-instance boot nonce (restart
   *  distinctness) plus a monotonic counter (per-spawn distinctness). Opaque and
   *  equality-only on the wire — the client never parses these parts. */
  private newEpoch(): string {
    return `${this.bootNonce}-${++this.epochCounter}`;
  }

  /**
   * Spawn a PTY for a session. If one already exists it is killed first.
   */
  spawn(params: PtySpawnParams): void {
    const { sessionId, command, cwd, env, cols, rows } = params;

    if (this.sessions.has(sessionId)) {
      this.logger.warn('PtyHostService: replacing existing PTY for session', { sessionId });
      // Replace, don't stop: close the old subscribers' sockets WITHOUT sending a
      // terminal exit frame (notify=false). The new PTY restarts output at
      // offset 0, so an attached web client must reconnect and resume onto the
      // fresh stream — sending an exit frame here would make it finalize the
      // terminal and never come back, stranding the new process.
      this.kill(sessionId, false);
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
      output: new OutputBuffer(),
      state: new TerminalStateMirror(initialCols, initialRows),
      subscribers: new Set(),
      pendingSubscribers: new Map(),
      exited: false,
      exitCode: null,
      cols: initialCols,
      rows: initialRows,
      epoch: this.newEpoch(),
    };
    this.sessions.set(sessionId, entry);

    proc.onData((data: string | Buffer) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      entry.output.append(chunk);
      entry.state.append(chunk);
      for (const ws of entry.subscribers) {
        this.safeSend(ws, chunk);
      }
      for (const [ws, pending] of entry.pendingSubscribers) {
        pending.chunks.push(chunk);
        pending.bytes += chunk.length;
        if (pending.bytes > MAX_PENDING_SNAPSHOT_BYTES) {
          entry.pendingSubscribers.delete(ws);
          this.logger.warn('PtyHostService: terminal snapshot backlog exceeded', {
            sessionId,
            bytes: pending.bytes,
          });
          try {
            ws.close(1013, 'terminal replay backlog exceeded');
          } catch {
            // ignore
          }
        }
      }
    });

    proc.onExit(({ exitCode }) => {
      // node-pty fires onExit ASYNCHRONOUSLY, and killing a PTY still produces
      // this event later. If this session's slot was already replaced (respawn
      // installs a new entry) or removed (explicit kill), this is the OLD
      // process's late exit — it must not delete the freshly-installed entry or
      // stomp a status the stop path already set. Identity-check the live entry
      // before touching any shared state.
      if (this.sessions.get(sessionId) !== entry) return;
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
      // web adapter listens for this {type:'exit'} text frame.
      this.notifyExit(entry, exitCode ?? null);
      entry.state.dispose();
      this.sessions.delete(sessionId);
      this.pendingPrompts.delete(sessionId);
      this.promptHandoffs.delete(sessionId);
    });

    this.completePromptHandoff(sessionId);
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
      this.completePromptHandoff(params.sessionId);
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

  /**
   * The opaque stream epoch for a session's LIVE PTY, or null if none exists
   * (#151). Stable for the life of one stream and distinct across respawns and
   * server restarts. The PtyWebSocketServer echoes it in the `attached` frame so
   * a reconnecting client can tell "same stream, resume" from "new stream, reset"
   * by equality alone — no offset/byte-count inference.
   */
  getEpoch(sessionId: string): string | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    return entry.epoch;
  }

  /** Write input (keystrokes) to the PTY. */
  write(sessionId: string, data: string | Buffer): void {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.exited) return;
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : data;
    entry.proc.write(text);
  }

  /** Pause prompt draining while a spawn/resume event hands off to the server
   * PTY lifecycle. Prompts accepted in the gap remain in the bounded FIFO. */
  beginPromptHandoff(sessionId: string): void {
    this.promptHandoffs.add(sessionId);
  }

  /** Finish an attach/reuse decision and drain the accepted FIFO into the live
   * PTY, if one exists. Idempotent so spawn paths may call it defensively. */
  completePromptHandoff(sessionId: string): void {
    this.promptHandoffs.delete(sessionId);
    this.drainPendingPrompts(sessionId);
  }

  /**
   * Accept one server-owned prompt into a bounded per-session FIFO.
   *
   * Every delivery, including steady-state delivery, passes through the same
   * queue. That prevents rapid send-mode prompts from interleaving their
   * body/Enter pairs. If no PTY exists yet (spawn/resume attach gap), the prompt
   * stays queued and spawn/spawnIfAbsent flushes it deterministically.
   *
   * @returns false only when a queue bound rejects the new delivery.
   */
  async deliverPrompt(
    sessionId: string,
    content: string,
    mode: 'send' | 'paste',
  ): Promise<boolean> {
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_PENDING_PROMPT_BYTES_PER_SESSION) {
      this.logger.warn('PtyHostService: dropping oversized pending prompt', {
        sessionId,
        bytes,
      });
      return false;
    }

    let queue = this.pendingPrompts.get(sessionId);
    if (!queue) {
      if (this.pendingPrompts.size >= MAX_PENDING_PROMPT_SESSIONS) {
        this.logger.warn('PtyHostService: pending prompt session limit reached', {
          sessionId,
        });
        return false;
      }
      queue = {
        deliveries: [],
        bytes: 0,
        draining: false,
        overflowWarned: false,
      };
      this.pendingPrompts.set(sessionId, queue);
    }

    if (
      queue.deliveries.length >= MAX_PENDING_PROMPTS_PER_SESSION ||
      queue.bytes + bytes > MAX_PENDING_PROMPT_BYTES_PER_SESSION
    ) {
      if (!queue.overflowWarned) {
        queue.overflowWarned = true;
        this.logger.warn('PtyHostService: pending prompt queue overflowed', {
          sessionId,
          prompts: queue.deliveries.length,
          bytes: queue.bytes,
        });
      }
      return false;
    }

    queue.deliveries.push({ content, mode, bytes });
    queue.bytes += bytes;
    this.drainPendingPrompts(sessionId);
    return true;
  }

  private drainPendingPrompts(sessionId: string): void {
    const queue = this.pendingPrompts.get(sessionId);
    if (
      !queue ||
      queue.draining ||
      this.promptHandoffs.has(sessionId) ||
      !this.sessions.has(sessionId)
    ) {
      return;
    }

    queue.draining = true;
    void (async () => {
      try {
        while (queue.deliveries.length > 0) {
          // Explicit stop may discard the queue while an earlier send waits.
          if (this.pendingPrompts.get(sessionId) !== queue) return;
          // A resume event pauses the remaining FIFO before replacing/reusing.
          if (this.promptHandoffs.has(sessionId)) return;
          const entry = this.sessions.get(sessionId);
          if (!entry || entry.exited) return;

          const delivery = queue.deliveries.shift();
          if (!delivery) return;
          queue.bytes -= delivery.bytes;
          await this.writePromptToEntry(sessionId, entry, delivery);
        }
      } catch (error) {
        this.logger.error(
          'PtyHostService: pending prompt delivery failed',
          error instanceof Error ? error : new Error(String(error)),
          { sessionId },
        );
      } finally {
        queue.draining = false;
        if (this.pendingPrompts.get(sessionId) !== queue) return;
        if (queue.deliveries.length === 0) {
          this.pendingPrompts.delete(sessionId);
        } else if (
          !this.promptHandoffs.has(sessionId) &&
          this.sessions.has(sessionId)
        ) {
          this.drainPendingPrompts(sessionId);
        }
      }
    })();
  }

  private async writePromptToEntry(
    sessionId: string,
    entry: PtyEntry,
    delivery: PendingPromptDelivery,
  ): Promise<void> {
    const text = delivery.content.replace(/[\r\n]+$/, '');
    if (delivery.mode === 'paste') {
      entry.proc.write(text);
      return;
    }

    if (text) {
      entry.proc.write(text);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Resume/replace can happen during the send delay. Keep the complete prompt
    // targeted to one process rather than pressing Enter in a fresh PTY.
    if (this.sessions.get(sessionId) !== entry || entry.exited) return;
    entry.proc.write('\r');
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
      entry.state.resize(cols, rows);
    } catch (err) {
      this.logger.warn('PtyHostService: resize failed', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Kill the PTY for a session.
   *
   * @param notify When true (the default, an explicit user stop), send a
   *   terminal {type:'exit'} frame so the client finalizes the terminal. When
   *   false (an internal replace/respawn), only close the sockets — the client
   *   reconnects and resumes onto the new PTY instead of finalizing.
   * @returns a {@link PtyKillOutcome} the explicit /pty/stop caller uses to
   *   distinguish a clean kill from "nothing to kill" and from a genuine kill
   *   failure. Finalization (notify/close + delete) is UNCONDITIONAL regardless
   *   of the outcome, so internal callers can keep ignoring the return.
   */
  kill(sessionId: string, notify = true): PtyKillOutcome {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      if (notify) {
        this.pendingPrompts.delete(sessionId);
        this.promptHandoffs.delete(sessionId);
      }
      return 'not_found';
    }
    let outcome: PtyKillOutcome = 'killed';
    try {
      entry.proc.kill();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === 'ESRCH') {
        // ESRCH ("no such process"): the PTY had already exited between our map
        // lookup and this signal (its async onExit had not fired yet to remove the
        // entry). Signalling an already-dead process reaches the exact end-state a
        // kill intends, so this is IDEMPOTENT SUCCESS — keep the 'killed' outcome
        // (the explicit /pty/stop caller returns 2xx) and log it as a benign race,
        // NOT a warning. Finalization below is unconditional either way.
        this.logger.debug('PtyHostService: PTY already exited before kill (ESRCH)', {
          sessionId,
        });
      } else {
        // A GENUINE kill-signal failure (e.g. EPERM). Cleanup below still runs, but
        // the signal really failed, so report 'error' — the explicit /pty/stop
        // caller surfaces it as a distinguishable non-2xx (internal callers ignore
        // the outcome).
        this.logger.warn('PtyHostService: kill failed', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        outcome = 'error';
      }
    }
    if (notify) {
      this.notifyExit(entry, null);
      this.pendingPrompts.delete(sessionId);
      this.promptHandoffs.delete(sessionId);
    } else {
      this.closeSubscribers(entry);
    }
    entry.state.dispose();
    this.sessions.delete(sessionId);
    return outcome;
  }

  /**
   * Compute the scrollback to replay to a client resuming from raw byte
   * `fromOffset`, or null if there is no live PTY for the session (the caller
   * uses null as the "no such session, close 1011" signal).
   *
   * The returned slice's `base`, `gap`, and `next` are RAW byte offsets — the
   * same coordinate space as the live stream and the client's receive counter.
   * Only `data` is sanitized here: device QUERY/REPORT sequences are stripped so
   * replaying historical `ESC[6n`/`ESC[c` cannot make the client's xterm answer
   * them and post the replies back to the PTY as fake keystrokes. Stripping
   * SHORTENS `data` but MUST NOT move the offsets — the client snaps its receive
   * counter to `next` (raw), never to `base + data.length`, so sanitizing can
   * neither duplicate nor skip bytes on the next reconnect. The live stream
   * (proc.onData → safeSend) is never sanitized, so a running program's
   * real-time queries still reach the client and get answered.
   */
  getReplay(sessionId: string, fromOffset: number): ReplaySlice | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    const slice = entry.output.replayFrom(fromOffset);
    return { ...slice, data: stripScrollbackDeviceQueries(slice.data) };
  }

  /**
   * Capture a coherent terminal-state snapshot at the current raw output
   * boundary. `next` and the mirror promise boundary are captured in the same
   * synchronous turn, so later output belongs exclusively to pending/live
   * delivery and cannot be duplicated in the snapshot.
   */
  getStateSnapshot(
    sessionId: string,
  ): Promise<{ next: number; data: Buffer; cols: number; rows: number }> | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    const next = entry.output.totalBytes;
    const cols = entry.cols;
    const rows = entry.rows;
    return entry.state.snapshot().then((data) => ({ next, data, cols, rows }));
  }

  /**
   * Subscribe a WebSocket to a session's LIVE output. Join-only: scrollback
   * replay is handled separately by {@link getReplay} + the PtyWebSocketServer
   * attach handshake, which keeps offset accounting outside the live fan-out.
   * Returns false if no such session exists.
   */
  addSubscriber(sessionId: string, ws: WebSocket): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    entry.subscribers.add(ws);
    return true;
  }

  /**
   * Join in buffering mode before awaiting a state snapshot. Every output chunk
   * produced after the snapshot boundary is retained until activation.
   */
  addPendingSubscriber(sessionId: string, ws: WebSocket): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    entry.pendingSubscribers.set(ws, { chunks: [], bytes: 0 });
    return true;
  }

  /**
   * Flush output accumulated during snapshot generation and atomically promote
   * the socket to the ordinary live fan-out set.
   */
  activatePendingSubscriber(sessionId: string, ws: WebSocket): boolean {
    const entry = this.sessions.get(sessionId);
    const pending = entry?.pendingSubscribers.get(ws);
    if (!entry || !pending || ws.readyState !== 1) return false;
    for (const chunk of pending.chunks) this.safeSend(ws, chunk);
    entry.pendingSubscribers.delete(ws);
    entry.subscribers.add(ws);
    return true;
  }

  /** Remove a WebSocket subscriber. */
  removeSubscriber(sessionId: string, ws: WebSocket): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    entry.subscribers.delete(ws);
    entry.pendingSubscribers.delete(ws);
  }

  /** Kill all PTYs (graceful shutdown). */
  shutdownAll(): void {
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.kill(sessionId);
    }
    this.pendingPrompts.clear();
    this.promptHandoffs.clear();
  }

  /**
   * Send a terminal {type:'exit'} frame to every subscriber, then close and
   * detach them. Used by the natural-exit path and by an explicit kill(); the
   * replace/respawn path calls {@link closeSubscribers} directly so the client
   * only sees a socket close and reconnects onto the new PTY.
   */
  private notifyExit(entry: PtyEntry, exitCode: number | null): void {
    for (const ws of entry.subscribers) {
      this.safeSend(ws, JSON.stringify({ type: 'exit', exitCode }));
    }
    this.closeSubscribers(entry);
  }

  /** Close every subscriber socket and clear the set (no exit frame). */
  private closeSubscribers(entry: PtyEntry): void {
    for (const ws of entry.subscribers) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    entry.subscribers.clear();
    for (const ws of entry.pendingSubscribers.keys()) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    entry.pendingSubscribers.clear();
  }

  private safeSend(ws: WebSocket, data: string | Buffer): void {
    // 1 === WebSocket.OPEN
    if (ws.readyState !== 1) return;
    try {
      ws.send(data);
    } catch {
      // best effort; the socket's own close handler will detach it
    }
  }
}
