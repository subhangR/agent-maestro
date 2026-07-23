/**
 * Minimal structured logger for the gateway. Mirrors the server's pretty/JSON
 * split but stays dependency-free.
 */
type Level = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export class Logger {
  private readonly threshold: number;
  private readonly json: boolean;

  constructor(level: Level = 'info', format: 'json' | 'pretty' = 'pretty') {
    this.threshold = LEVELS[level] ?? LEVELS.info;
    this.json = format === 'json';
  }

  private log(level: Level, msg: string, meta?: unknown): void {
    if (LEVELS[level] > this.threshold) return;
    const ts = new Date().toISOString();
    if (this.json) {
      process.stdout.write(JSON.stringify({ ts, level, msg, ...(meta ? { meta } : {}) }) + '\n');
    } else {
      const tag = level.toUpperCase().padEnd(5);
      const suffix = meta === undefined ? '' : ' ' + safeStringify(meta);
      process.stdout.write(`[${ts}] ${tag} [gateway] ${msg}${suffix}\n`);
    }
  }

  error(msg: string, meta?: unknown): void { this.log('error', msg, meta); }
  warn(msg: string, meta?: unknown): void { this.log('warn', msg, meta); }
  info(msg: string, meta?: unknown): void { this.log('info', msg, meta); }
  debug(msg: string, meta?: unknown): void { this.log('debug', msg, meta); }
}

function safeStringify(v: unknown): string {
  if (v instanceof Error) return v.stack || v.message;
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}
