import { Command } from 'commander';
import fetch from 'node-fetch';
import { config } from '../config.js';

// Allowed hook events. Fixed wiring (bound in each plugin's hooks.json),
// dynamic behavior (server decides what active spells do).
// Mirrors maestro-server SpellHookEvent.
const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'Notification',
  'SessionStart',
] as const;
type HookEvent = typeof HOOK_EVENTS[number];

// Mirrors maestro-server DispatchResult.
interface DispatchResult {
  exitCode: 0 | 2;
  stdout: string;
  reason?: string;
  blocked: boolean;
  continued: boolean;
  spells?: unknown[];
  timestamp?: number;
}

const HOOK_REQUEST_TIMEOUT_MS = 4_000;

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function debug(msg: string): void {
  if (config.debug) {
    process.stderr.write(`[hook:dispatch] ${msg}\n`);
  }
}

async function postDispatch(
  serverUrl: string,
  sessionId: string,
  event: HookEvent,
  payload: Record<string, unknown> | undefined,
): Promise<DispatchResult | null> {
  const base = serverUrl.replace(/\/$/, '');
  const url = `${base}/api/hooks/dispatch`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOOK_REQUEST_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = { sessionId, event };
    if (payload !== undefined) body.payload = payload;

    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal as any,
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId,
      },
      body: JSON.stringify(body),
    });
    clearTimeout(timer);

    if (!response.ok) {
      debug(`server returned ${response.status}; treating as noop`);
      return null;
    }
    return (await response.json()) as DispatchResult;
  } catch (err: unknown) {
    clearTimeout(timer);
    debug(`fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function applyResult(result: DispatchResult): never {
  // Print stdout first so feed-context / inject-prompt is delivered to Claude
  // even when the dispatcher also signals a continue-loop.
  if (result.stdout && result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }

  if (result.exitCode === 2) {
    // gate (blocked) and continue-loop (continued) both exit 2; the reason
    // goes on stderr so Claude surfaces it.
    if (result.reason) {
      process.stderr.write(result.reason);
      if (!result.reason.endsWith('\n')) process.stderr.write('\n');
    }
    process.exit(2);
  }
  process.exit(0);
}

export function registerHookCommands(program: Command): void {
  const hook = program.command('hook').description('Internal hook handlers invoked by Claude');

  hook
    .command('dispatch <event>')
    .description('Dispatch a Claude hook event to the Maestro server')
    .action(async (event: string) => {
      const normalized = event as HookEvent;
      if (!HOOK_EVENTS.includes(normalized)) {
        debug(`unknown event "${event}"; exiting 0`);
        process.exit(0);
      }

      const sessionId = config.sessionId;
      const serverUrl = process.env.MAESTRO_SERVER_URL || process.env.MAESTRO_API_URL;

      // Drain stdin first so we don't leave the pipe dangling on bail.
      const stdinRaw = await readStdin();

      // Graceful degrade: without sessionId or server, nothing to dispatch.
      if (!sessionId) {
        debug('MAESTRO_SESSION_ID not set; exiting 0');
        process.exit(0);
      }
      if (!serverUrl) {
        debug('MAESTRO_SERVER_URL not set; exiting 0');
        process.exit(0);
      }

      let payload: Record<string, unknown> | undefined;
      if (stdinRaw.trim().length > 0) {
        try {
          const parsed = JSON.parse(stdinRaw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            payload = parsed as Record<string, unknown>;
          } else {
            payload = { raw: parsed };
          }
        } catch {
          payload = { raw: stdinRaw };
        }
      }

      const result = await postDispatch(serverUrl, sessionId, normalized, payload);

      if (!result) {
        // Server unreachable / non-2xx: fail open, exit 0.
        process.exit(0);
      }

      applyResult(result);
    });
}
