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
  /** Output chunks awaiting coalesced delivery to subscribers. A busy TUI emits
   *  hundreds of tiny chunks/sec; sending each as its own WebSocket frame made
   *  clients decode N×hundreds of messages/sec with many concurrent agents.
   *  Chunks are appended to the ring buffers synchronously (offset accounting
   *  and snapshots are unaffected); only the socket sends are delayed, and every
   *  attach/replay/snapshot boundary flushes first so no byte is ever seen twice. */
  sendBuf: Buffer[];
  sendBytes: number;
  sendTimer: NodeJS.Timeout | null;
  /** Wall-clock ms of the LAST byte this PTY produced (updated in onData). The
   *  prompt-injection readiness gate watches this to wait for output quiescence
   *  before writing/submitting — an agent's TUI drains buffered input the instant
   *  the PTY exists, deep inside its 11–15s composer-boot window, so "the stream
   *  went quiet" is our best process-agnostic proxy for "the composer settled". */
  lastOutputAt: number;
  /** Whether this PTY has EVER been observed quiet for {@link PROMPT_COLD_IDLE_MS}.
   *  False means the agent is still booting, so the first prompt waits for real
   *  quiescence; once true the agent is up and later prompts use the short warm
   *  gate so messaging a busy agent is never stalled. Latches true, never back. */
  bootSettled: boolean;
}

/** Coalescing window for live output fan-out. Well under perceptible echo latency. */
const SEND_COALESCE_MS = 16;
/** Force a flush when this much output accumulates inside one window. */
const SEND_COALESCE_MAX_BYTES = 64 * 1024;

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

// --- Prompt-injection closed-loop tunables --------------------------------
// A server-owned prompt lands in the agent's composer but the trailing Enter can
// be swallowed: the agent's TUI drains queued input the instant the PTY exists,
// 11–15s before the composer can accept a submit, so an open-loop "write then
// press Enter after 200ms" often deposits the text and drops the newline. These
// constants drive a closed loop — gate on output quiescence, submit, verify the
// text left the cursor, and retry Enter (never the body) a bounded number of
// times — instead of that fixed blind delay.

// Measured against real agents (2026-07-27), injecting at spawn time exactly as
// drainPendingPrompts does. Claude Code's composer is not submit-capable until
// 11–15s after spawn; codex DISCARDS input written before it is ready. A gate of
// (300ms idle, 5s cap) released mid-boot and submitted 0/4 — indistinguishable
// from no fix at all. Waiting for genuine quiescence submitted 3/3 on claude-code
// and 2/2 on codex. Do not "tidy" these numbers without re-running that test.

/** Treat the stream as "settled" once it has been idle at least this long. */
const PROMPT_IDLE_MS = 300;
/** COLD gate: a PTY that has never been observed quiet is still booting its agent.
 *  1500ms of silence distinguishes "the composer settled" from the sub-second
 *  lulls a booting TUI has between redraws (300ms fires during boot). */
const PROMPT_COLD_IDLE_MS = 1500;
/** COLD cap, generous enough to cover the slowest measured agent boot. Only a
 *  never-yet-settled PTY can wait this long, so a stuck agent delays its own first
 *  prompt and nothing else. */
const PROMPT_COLD_READY_TIMEOUT_MS = 45000;
/** WARM cap. Once a PTY has been observed quiet its agent is up, so later prompts
 *  use the old short gate. This is what keeps "message an agent that is actively
 *  working" responsive: its output never falls quiet, so the gate must give up
 *  fast and let the agent queue the prompt itself, exactly as it did before. */
const PROMPT_WARM_READY_TIMEOUT_MS = 1000;
/** Cap on the shorter output-idle wait taken between writing the body and
 *  pressing Enter (let the composer echo the paste before we commit it). */
const PROMPT_PRE_SUBMIT_IDLE_TIMEOUT_MS = 1000;
/** Delay after the FIRST Enter before the first submit verification. Also the
 *  first entry of {@link PROMPT_SUBMIT_BACKOFF_MS}. */
const PROMPT_VERIFY_MS = 750;
/** Total number of Enter presses (initial + retries) before giving up. Sized so
 *  the retry window outlives a slow composer even when the readiness gate hit its
 *  cap and released early — a 3-press window expired ~2s before Claude Code became
 *  submit-capable, which is precisely how the first cut of this fix failed. */
const PROMPT_SUBMIT_ATTEMPTS = 10;
/** Wait before each verification, indexed by attempt. Backoff grows because a
 *  genuinely slow composer may simply need more time, and we must not machine-gun
 *  Enter; it then plateaus so the tail of the window stays long without the delay
 *  running away. */
const PROMPT_SUBMIT_BACKOFF_MS = [
  PROMPT_VERIFY_MS, 1200, 2000, 3000, 4000, 5000, 5000, 5000, 5000, 5000,
];
/** Longest run of trailing visible characters used as the "did our text leave the
 *  cursor?" anchor. Short enough to survive composer wrapping, long enough to be
 *  distinctive. */
const PROMPT_TAIL_TOKEN_MAX = 24;

/** Bracketed-paste framing the agent asked for when {@link TerminalStateMirror.bracketedPaste}. */
const BRACKETED_PASTE_START = '\x1b[200~';
const BRACKETED_PASTE_END = '\x1b[201~';
/** A pasted-content placeholder still sitting on screen (`[Pasted text #1 …]`,
 *  `[Pasted Content …]`) is POSITIVE evidence the prompt was not submitted. */
const PASTE_PLACEHOLDER_RE = /\[Pasted (text|Content)/i;

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
      sendBuf: [],
      sendBytes: 0,
      sendTimer: null,
      lastOutputAt: Date.now(),
      bootSettled: false,
    };
    this.sessions.set(sessionId, entry);

    proc.onData((data: string | Buffer) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      // Ring buffers MUST stay synchronous — offset accounting, replay, and
      // snapshot boundaries all read them in the same turn as onData. Only the
      // socket fan-out below is coalesced.
      entry.output.append(chunk);
      entry.state.append(chunk);
      // Timestamp the stream so the prompt readiness gate can wait for it to fall
      // quiet before injecting a prompt/Enter.
      entry.lastOutputAt = Date.now();
      entry.sendBuf.push(chunk);
      entry.sendBytes += chunk.length;
      if (entry.sendBytes >= SEND_COALESCE_MAX_BYTES) {
        this.flushOutput(entry, sessionId);
      } else if (entry.sendTimer === null) {
        entry.sendTimer = setTimeout(() => this.flushOutput(entry, sessionId), SEND_COALESCE_MS);
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

  /**
   * Deliver one prompt into a live PTY as a CLOSED LOOP.
   *
   * The old implementation was open-loop: write the body, wait a fixed 200ms,
   * press Enter once, done. That drops the newline whenever the agent's TUI is
   * still booting (it enables bracketed paste and drains queued input in its first
   * few hundred bytes, but cannot accept a submit until its composer is drawn
   * 11–15s later) — the text lands, the Enter is eaten, the prompt is silently
   * stranded in the input box. The loop below closes that gap:
   *   1. gate on output quiescence so we write into a settled composer,
   *   2. frame the body (bracketed paste when the agent asked for it) safely,
   *   3. for send mode, submit and then VERIFY the text left the cursor, retrying
   *      Enter — and ONLY Enter — a bounded number of times on positive evidence.
   *
   * Every `await` is followed by a liveness re-check (`this.sessions.get(...) ===
   * entry && !entry.exited`) so a resume/replace mid-delivery can never spill a
   * body or an Enter into a freshly-installed PTY, exactly as the old code guarded
   * its single pre-Enter check.
   */
  private async writePromptToEntry(
    sessionId: string,
    entry: PtyEntry,
    delivery: PendingPromptDelivery,
  ): Promise<void> {
    // Strip a trailing newline the caller may have appended: the submit Enter
    // below is what commits a `send`, and a stray newline inside a bracketed-paste
    // block would break the framing. Then neutralize any embedded paste-END so the
    // payload can never terminate its own bracketed-paste block and hand the rest
    // of the bytes to the shell as keystrokes (lossless for real prompt text).
    const body = delivery.content
      .replace(/[\r\n]+$/, '')
      .split(BRACKETED_PASTE_END)
      .join('');

    // 1) Readiness gate. A PTY whose agent has never been seen quiet is still
    //    booting: wait for GENUINE quiescence, because writing early is what both
    //    strands the prompt (claude-code accepts the text but ignores the Enter)
    //    and loses it outright (codex discards pre-ready input). Once the agent has
    //    settled once, fall back to the short gate so a prompt sent to an actively
    //    working agent is not held behind the long cap.
    const cold = !entry.bootSettled;
    await this.waitForOutputIdle(
      entry,
      cold ? PROMPT_COLD_IDLE_MS : PROMPT_IDLE_MS,
      cold ? PROMPT_COLD_READY_TIMEOUT_MS : PROMPT_WARM_READY_TIMEOUT_MS,
    );
    if (this.sessions.get(sessionId) !== entry || entry.exited) return;

    // 2) Content framing. Wrap in bracketed paste iff the agent turned it on.
    const framed = this.frameBody(entry, body);
    if (framed) entry.proc.write(framed);

    // Paste mode never submits — the human presses Enter — so we are done.
    if (delivery.mode === 'paste') return;

    // 3) Submit + verify + bounded Enter-only retry (send mode).
    await this.submitWithVerify(sessionId, entry, body);
  }

  /** Wrap `body` in bracketed-paste markers when the mirrored agent enabled that
   *  mode, otherwise write it raw. Empty bodies frame to nothing so a send with an
   *  empty body still falls through to a bare Enter (old behavior). */
  private frameBody(entry: PtyEntry, body: string): string {
    if (!body) return '';
    if (entry.state.bracketedPaste) {
      return BRACKETED_PASTE_START + body + BRACKETED_PASTE_END;
    }
    return body;
  }

  /**
   * Resolve once the PTY has produced no output for at least `idleMs`, or once
   * `timeoutMs` has elapsed since the call — whichever comes first. Returns early
   * if the process exits. Polls rather than hooking onData: this runs off the hot
   * output path, the windows are coarse (hundreds of ms), and polling keeps the
   * check trivially exit-safe. Never wedges — the timeout is a hard ceiling.
   */
  private async waitForOutputIdle(
    entry: PtyEntry,
    idleMs: number,
    timeoutMs: number,
  ): Promise<void> {
    const start = Date.now();
    for (;;) {
      if (entry.exited) return;
      const idle = Date.now() - entry.lastOutputAt;
      // Latch boot completion on any genuinely long quiet stretch, whichever gate
      // observed it: a PTY this quiet has finished starting its agent.
      if (idle >= PROMPT_COLD_IDLE_MS) entry.bootSettled = true;
      if (idle >= idleMs) return;
      const remaining = timeoutMs - (Date.now() - start);
      if (remaining <= 0) return;
      // Sleep just long enough to reach idleMs for the current quiet stretch, but
      // never past the overall ceiling. New output resets lastOutputAt and the
      // next iteration recomputes a fresh (larger) wait.
      const wait = Math.max(1, Math.min(idleMs - idle, remaining));
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  /**
   * Press Enter, then confirm the prompt actually left the composer, retrying
   * Enter — and ONLY Enter, never the body — up to {@link PROMPT_SUBMIT_ATTEMPTS}
   * times on POSITIVE evidence the text is still parked at the cursor.
   *
   * SAFETY: a stray Enter into an agent that has already accepted the prompt can
   * confirm a highlighted permission-dialog option. So we retry ONLY when the
   * cursor band still contains our own text (or a live paste placeholder). If the
   * band is empty, unreadable, or simply no longer holds our token, we treat the
   * submit as done and STOP — inconclusive is never a reason to press Enter again.
   */
  private async submitWithVerify(
    sessionId: string,
    entry: PtyEntry,
    body: string,
  ): Promise<void> {
    const isLive = (): boolean =>
      this.sessions.get(sessionId) === entry && !entry.exited;

    // The anchor we look for at the cursor: the last run of visible characters of
    // the body, ANSI/control-stripped and whitespace-collapsed. An empty token
    // (e.g. a body of pure control chars) means we cannot verify — we then submit
    // exactly once and never guess with a second blind Enter.
    const tailToken = this.computeTailToken(body);

    // Let the composer echo the paste before we commit it (short, best-effort).
    await this.waitForOutputIdle(entry, PROMPT_IDLE_MS, PROMPT_PRE_SUBMIT_IDLE_TIMEOUT_MS);
    if (!isLive()) return;

    entry.proc.write('\r');
    if (!tailToken) return;

    for (let attempt = 1; attempt <= PROMPT_SUBMIT_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, PROMPT_SUBMIT_BACKOFF_MS[attempt - 1] ?? PROMPT_VERIFY_MS),
      );
      if (!isLive()) return;

      const stillPresent = await this.promptStillAtCursor(entry, tailToken);
      if (!isLive()) return;
      // Verified gone (or inconclusive/unreadable): stop — do NOT press again.
      if (!stillPresent) return;

      // Still parked at the cursor: resend Enter, unless this was the last attempt.
      if (attempt < PROMPT_SUBMIT_ATTEMPTS) entry.proc.write('\r');
    }

    // Exhausted every attempt and our text is STILL sitting unsubmitted. Surface it
    // loudly instead of letting a swallowed prompt vanish — but do NOT resend the
    // body (a duplicated agent message is worse than a reported miss). PtyHostService
    // has no event bus (constructed with only sessionService + logger), so this is a
    // structured logger.error rather than a domain event.
    this.logger.error(
      'PtyHostService: prompt not submitted after retries (text still at cursor)',
      new Error('prompt_delivery_failed'),
      { sessionId, reason: 'submit_unverified', attempts: PROMPT_SUBMIT_ATTEMPTS },
    );
  }

  /** Last up-to-{@link PROMPT_TAIL_TOKEN_MAX} visible chars of the body, with ANSI
   *  escapes removed, other control chars flattened to spaces, and whitespace
   *  collapsed. '' when nothing printable remains. */
  private computeTailToken(body: string): string {
    const cleaned = body
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '') // strip CSI escape sequences
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, ' ') // flatten remaining control chars
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned ? cleaned.slice(-PROMPT_TAIL_TOKEN_MAX) : '';
  }

  /**
   * Whether our just-injected text is still parked at the cursor — i.e. NOT
   * submitted. True ONLY on positive evidence: the cursor band still contains the
   * tail token, or shows a live paste placeholder. Any inconclusive case (band
   * empty, unreadable, or no longer holding the token) returns false so the caller
   * never blind-retries an Enter.
   */
  private async promptStillAtCursor(entry: PtyEntry, tailToken: string): Promise<boolean> {
    let region: string;
    try {
      region = await entry.state.readCursorRegion();
    } catch {
      return false; // unreadable ⇒ inconclusive ⇒ do not retry
    }
    const normalized = region.replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    if (PASTE_PLACEHOLDER_RE.test(normalized)) return true;
    const token = tailToken.replace(/\s+/g, ' ').trim();
    if (!token) return false;
    return normalized.includes(token);
  }

  /**
   * Resize the PTY. When the size actually changes, every OTHER subscriber is
   * sent a `{type:'size', live:true}` frame so its grid follows the new
   * geometry — one shared PTY can be viewed from several windows/tabs, and any
   * viewer left at the old size renders the TUI's cursor-addressed redraws
   * corrupted. `origin` (the socket the resize came from) is excluded: its
   * client already fit to exactly this size.
   */
  resize(sessionId: string, cols: number, rows: number, origin?: WebSocket): void {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.exited) return;
    if (!cols || !rows || cols < 1 || rows < 1) return;
    if (cols > 1000 || rows > 1000) return;
    // Unchanged size: skip the ioctl AND the fan-out. This is what terminates
    // any client echo (a follower applying a live frame that then re-ships the
    // same dimensions) — the second hop dies here instead of ping-ponging.
    if (entry.cols === cols && entry.rows === rows) return;
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
      return;
    }
    const frame = JSON.stringify({ type: 'size', cols, rows, live: true });
    for (const ws of entry.subscribers) {
      if (ws === origin) continue;
      try {
        if (ws.readyState === 1 /* OPEN */) ws.send(frame);
      } catch {
        // subscriber mid-close — its close handler will detach it
      }
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
    // The ring already contains any coalesced-but-unsent bytes; flush them to
    // existing subscribers now so the slice boundary and the live stream agree.
    this.flushOutput(entry, sessionId);
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
    // Flush before attaching: this socket's replay already covers everything in
    // the ring (incl. coalesced bytes), so it must not receive them again live.
    this.flushOutput(entry, sessionId);
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
    // Flush so the pending backlog starts exactly at the snapshot boundary —
    // coalesced pre-registration bytes belong to the snapshot, not the backlog.
    this.flushOutput(entry, sessionId);
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
    // Deliver any coalesced tail output before the exit frame — the client
    // treats {type:'exit'} as stream end and must have seen every byte first.
    this.flushOutput(entry);
    for (const ws of entry.subscribers) {
      this.safeSend(ws, JSON.stringify({ type: 'exit', exitCode }));
    }
    this.closeSubscribers(entry);
  }

  /** Close every subscriber socket and clear the set (no exit frame). */
  private closeSubscribers(entry: PtyEntry): void {
    this.flushOutput(entry);
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

  /**
   * Deliver all coalesced output as one frame to live subscribers and append it
   * to pending-subscriber backlogs. MUST run before any attach/replay/snapshot
   * boundary and before exit frames — a boundary taken while bytes sit in
   * sendBuf would replay those bytes AND deliver them again on the next flush.
   */
  private flushOutput(entry: PtyEntry, sessionId?: string): void {
    if (entry.sendTimer !== null) {
      clearTimeout(entry.sendTimer);
      entry.sendTimer = null;
    }
    if (entry.sendBuf.length === 0) return;
    const frame = entry.sendBuf.length === 1 ? entry.sendBuf[0] : Buffer.concat(entry.sendBuf);
    entry.sendBuf = [];
    entry.sendBytes = 0;
    for (const ws of entry.subscribers) {
      this.safeSend(ws, frame);
    }
    for (const [ws, pending] of entry.pendingSubscribers) {
      pending.chunks.push(frame);
      pending.bytes += frame.length;
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
