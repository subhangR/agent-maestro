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
  'SubagentStop',
  'Notification',
  'SessionStart',
  'SessionEnd',
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
  // Present only on dry-run responses (see MatchedRule / renderDryRunReport).
  dryRun?: boolean;
  matched?: MatchedRule[];
}

// Per-rule match report entry returned by a dry-run dispatch. Mirrors the
// server-side dry-run contract (C2 in the architecture review).
interface MatchedRule {
  spellId: string;
  ruleId: string;
  action: string;
  wouldExecute: boolean;
  skipReason?: string;
}

// What the CLI does with a dispatch result: exit code plus the exact bytes to
// write. Kept as data (not side effects) so folding logic is unit-testable.
export interface HookOutcome {
  exitCode: 0 | 2;
  stdout?: string;
  stderr?: string;
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

export async function postDispatch(
  serverUrl: string,
  sessionId: string,
  event: HookEvent,
  payload: Record<string, unknown> | undefined,
  dryRun = false,
): Promise<DispatchResult | null> {
  const base = serverUrl.replace(/\/$/, '');
  const url = `${base}/api/hooks/dispatch`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOOK_REQUEST_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = { sessionId, event };
    if (payload !== undefined) body.payload = payload;
    // Only present on dry-run so the live wire request is byte-for-byte unchanged.
    if (dryRun) body.dryRun = true;

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

/**
 * Fold a live (non-dry-run) DispatchResult into an exit code + the exact bytes
 * to write. stdout (feed-context / inject-prompt) is delivered even when the
 * dispatcher also signals a continue-loop, so Claude sees it first.
 */
export function foldResult(result: DispatchResult): HookOutcome {
  const outcome: HookOutcome = { exitCode: result.exitCode === 2 ? 2 : 0 };

  if (result.stdout && result.stdout.length > 0) {
    outcome.stdout = result.stdout;
  }

  if (result.exitCode === 2 && result.reason) {
    // Only continue-loop (continued) exits 2, on Stop/SubagentStop; the reason
    // goes on stderr so Claude surfaces it. (The v1 gate/block path was dropped.)
    outcome.stderr = result.reason.endsWith('\n') ? result.reason : `${result.reason}\n`;
  }

  return outcome;
}

/**
 * Render a dry-run match report to stdout text — one line per matched rule
 * (spell id, rule id, action type, and whether it would execute or why it was
 * skipped). Side-effect-free; a dry run always exits 0.
 */
export function renderDryRunReport(result: DispatchResult): string {
  const matched = result.matched ?? [];
  if (matched.length === 0) {
    return '[dry-run] no rules matched\n';
  }

  const lines = [`[dry-run] ${matched.length} rule(s) matched`];
  for (const m of matched) {
    const verdict = m.wouldExecute
      ? 'would execute'
      : `skipped${m.skipReason ? `: ${m.skipReason}` : ''}`;
    lines.push(`  spell ${m.spellId}  rule ${m.ruleId}  ${m.action}  → ${verdict}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Full dispatch flow as a pure-ish function: resolves the outcome (exit code +
 * bytes) instead of touching process.exit, so the whole path — graceful
 * degrades, live folding, and the dry-run report — is unit-testable.
 */
export async function runHookDispatch(opts: {
  event: string;
  sessionId?: string;
  serverUrl?: string;
  stdinRaw: string;
  dryRun: boolean;
}): Promise<HookOutcome> {
  const normalized = opts.event as HookEvent;
  if (!HOOK_EVENTS.includes(normalized)) {
    debug(`unknown event "${opts.event}"; exiting 0`);
    return { exitCode: 0 };
  }

  // Graceful degrade: without sessionId or server, nothing to dispatch.
  if (!opts.sessionId) {
    debug('MAESTRO_SESSION_ID not set; exiting 0');
    return { exitCode: 0 };
  }
  if (!opts.serverUrl) {
    debug('MAESTRO_SERVER_URL not set; exiting 0');
    return { exitCode: 0 };
  }

  let payload: Record<string, unknown> | undefined;
  if (opts.stdinRaw.trim().length > 0) {
    try {
      const parsed = JSON.parse(opts.stdinRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      } else {
        payload = { raw: parsed };
      }
    } catch {
      payload = { raw: opts.stdinRaw };
    }
  }

  const result = await postDispatch(opts.serverUrl, opts.sessionId, normalized, payload, opts.dryRun);

  if (!result) {
    // Server unreachable / non-2xx / timeout: fail open, exit 0.
    return { exitCode: 0 };
  }

  if (opts.dryRun) {
    // Dry run never executes anything and never signals continue-loop: print
    // the match report and always exit 0.
    return { exitCode: 0, stdout: renderDryRunReport(result) };
  }

  return foldResult(result);
}

export function registerHookCommands(program: Command): void {
  const hook = program.command('hook').description('Internal hook handlers invoked by Claude');

  hook
    .command('dispatch <event>')
    .description('Dispatch a Claude hook event to the Maestro server')
    .option('--dry-run', 'Report which spell rules would fire without executing anything (always exits 0)')
    .action(async (event: string, options: { dryRun?: boolean }) => {
      // Drain stdin first so we don't leave the pipe dangling on bail.
      const stdinRaw = await readStdin();

      const outcome = await runHookDispatch({
        event,
        sessionId: config.sessionId,
        serverUrl: process.env.MAESTRO_SERVER_URL || process.env.MAESTRO_API_URL,
        stdinRaw,
        dryRun: Boolean(options.dryRun),
      });

      // Print stdout first so feed-context / inject-prompt is delivered to Claude
      // even when the dispatcher also signals a continue-loop.
      if (outcome.stdout) process.stdout.write(outcome.stdout);
      if (outcome.stderr) process.stderr.write(outcome.stderr);
      process.exit(outcome.exitCode);
    });
}
