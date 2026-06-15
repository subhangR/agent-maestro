/**
 * CommandTracker — transparent interceptor that records every maestro CLI
 * invocation (full command, exit code, duration) to a local JSONL log keyed by
 * session id. Writes happen synchronously on process exit so the real exit code
 * is captured regardless of how the command terminated (return, process.exit,
 * thrown error, or permission denial).
 *
 * Logs live at <DATA_DIR>/command-logs/<sessionId>.jsonl — one record per line.
 * Tracking must never break the CLI: every filesystem touch is wrapped and
 * failures are swallowed.
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface CommandLogRecord {
  /** ISO timestamp captured when the process started. */
  ts: string;
  sessionId: string | null;
  projectId: string | null;
  /** Resolved command path, e.g. "task report complete". Null if unresolved. */
  command: string | null;
  /** Full arguments after the binary (process.argv.slice(2)), truncated. */
  argv: string[];
  exitCode: number;
  durationMs: number;
  success: boolean;
  cliVersion: string | null;
}

export interface ReadOptions {
  failedOnly?: boolean;
  /** Keep only records whose command starts with this prefix. */
  command?: string;
  /** Keep only the last N records (after other filters). */
  limit?: number;
}

const NO_SESSION_KEY = '_no-session';
const MAX_ARG_LEN = 4000;

/**
 * Flags whose VALUES carry prompt/content text (messages, subjects, memory
 * entries, descriptions). We log the flag name but never its value.
 */
const VALUE_BEARING_FLAGS = new Set(['--message', '--subject', '--entry', '-d', '--desc']);
const REDACTED = '***';

/**
 * Replace the values of value-bearing flags with '***' while keeping the flag
 * name. Handles both "--message value" (two tokens) and "--message=value".
 */
function redactValues(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const eq = arg.indexOf('=');
    if (eq > 0 && VALUE_BEARING_FLAGS.has(arg.slice(0, eq))) {
      out.push(`${arg.slice(0, eq)}=${REDACTED}`);
      continue;
    }
    if (VALUE_BEARING_FLAGS.has(arg)) {
      out.push(arg);
      if (i + 1 < args.length) {
        out.push(REDACTED);
        i += 1;
      }
      continue;
    }
    out.push(arg);
  }
  return out;
}

function resolveDataDir(): string {
  const raw = process.env.DATA_DIR;
  if (raw) {
    return raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw;
  }
  return join(homedir(), '.maestro', 'data');
}

function logDir(): string {
  return join(resolveDataDir(), 'command-logs');
}

function logFileFor(sessionId: string | null): string {
  return join(logDir(), `${sessionId || NO_SESSION_KEY}.jsonl`);
}

function sanitizeArgs(args: string[]): string[] {
  return args.map((a) =>
    a.length > MAX_ARG_LEN ? `${a.slice(0, MAX_ARG_LEN)}…[truncated]` : a,
  );
}

/** Best-effort command name when commander never resolved an action. */
function deriveCommandFromArgv(argv: string[]): string | null {
  const parts: string[] = [];
  for (const token of argv) {
    if (token.startsWith('-')) break;
    parts.push(token);
  }
  return parts.length ? parts.join(' ') : null;
}

let started = false;
let written = false;
let startTime = 0;
let resolvedCommand: string | null = null;
let capturedArgv: string[] = [];
let cliVersion: string | null = null;

/**
 * Called from the program's preAction hook once commander has resolved which
 * command/subcommand is actually running, giving us a clean command path.
 */
export function setTrackedCommand(commandPath: string): void {
  if (commandPath) resolvedCommand = commandPath;
}

function writeRecord(exitCode: number): void {
  if (written) return;
  written = true;

  try {
    const sessionId = process.env.MAESTRO_SESSION_ID || null;
    const record: CommandLogRecord = {
      ts: new Date(startTime).toISOString(),
      sessionId,
      projectId: process.env.MAESTRO_PROJECT_ID || null,
      command: resolvedCommand || deriveCommandFromArgv(capturedArgv),
      argv: capturedArgv,
      exitCode,
      durationMs: Date.now() - startTime,
      success: exitCode === 0,
      cliVersion,
    };

    const dir = logDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(logFileFor(sessionId), `${JSON.stringify(record)}\n`);
  } catch {
    // Tracking is best-effort; never surface failures to the agent.
  }
}

/**
 * Install the interceptor. Call once, before program.parse(). Captures argv +
 * start time immediately and registers a synchronous process-exit handler that
 * appends the final record with the real exit code.
 */
export function installCommandTracker(version?: string | null): void {
  if (started) return;
  if (process.env.MAESTRO_DISABLE_COMMAND_TRACKING === 'true') return;
  started = true;

  startTime = Date.now();
  cliVersion = version || process.env.MAESTRO_CLI_VERSION || null;
  capturedArgv = sanitizeArgs(redactValues(process.argv.slice(2)));

  process.on('exit', (code) => writeRecord(code));
}

function parseRecord(line: string): CommandLogRecord | null {
  try {
    return JSON.parse(line) as CommandLogRecord;
  } catch {
    return null;
  }
}

/** Read tracked records for a session (defaults applied by caller). */
export function readRecords(sessionId: string | null, opts: ReadOptions = {}): CommandLogRecord[] {
  const file = logFileFor(sessionId);
  if (!existsSync(file)) return [];

  let records = readFileSync(file, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(parseRecord)
    .filter((r): r is CommandLogRecord => r !== null);

  if (opts.failedOnly) records = records.filter((r) => !r.success);
  if (opts.command) records = records.filter((r) => (r.command || '').startsWith(opts.command!));
  if (opts.limit && opts.limit > 0) records = records.slice(-opts.limit);

  return records;
}

export interface CommandStats {
  sessionId: string | null;
  total: number;
  succeeded: number;
  failed: number;
  /** Per-command tallies, sorted by total usage descending. */
  byCommand: Array<{ command: string; total: number; failed: number }>;
}

export function computeStats(sessionId: string | null): CommandStats {
  const records = readRecords(sessionId);
  const byCommand = new Map<string, { total: number; failed: number }>();

  let succeeded = 0;
  let failed = 0;
  for (const r of records) {
    if (r.success) succeeded += 1;
    else failed += 1;

    const key = r.command || '(unknown)';
    const entry = byCommand.get(key) || { total: 0, failed: 0 };
    entry.total += 1;
    if (!r.success) entry.failed += 1;
    byCommand.set(key, entry);
  }

  return {
    sessionId,
    total: records.length,
    succeeded,
    failed,
    byCommand: Array.from(byCommand.entries())
      .map(([command, v]) => ({ command, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}

/** Session ids that have a command log on disk. */
export function listSessionsWithLogs(): string[] {
  const dir = logDir();
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.slice(0, -'.jsonl'.length));
  } catch {
    return [];
  }
}
