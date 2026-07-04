import { describe, it, expect, vi, beforeEach } from 'vitest';

// node-fetch is the only network seam in hook.ts; mock its default export.
vi.mock('node-fetch', () => ({ default: vi.fn() }));

import fetch from 'node-fetch';
import {
  foldResult,
  renderDryRunReport,
  runHookDispatch,
  type HookOutcome,
} from '../../src/commands/hook.js';

const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const BASE = {
  blocked: false,
  continued: false,
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('foldResult (live exit-code mapping)', () => {
  it('passes feed-context stdout through and exits 0', () => {
    const outcome = foldResult({ ...BASE, exitCode: 0, stdout: 'injected context' });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 0, stdout: 'injected context' });
  });

  it('omits stdout when empty', () => {
    const outcome = foldResult({ ...BASE, exitCode: 0, stdout: '' });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 0 });
  });

  it('continue-loop exits 2 with reason on stderr (newline appended)', () => {
    const outcome = foldResult({ ...BASE, exitCode: 2, stdout: '', continued: true, reason: 'keep looping' });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 2, stderr: 'keep looping\n' });
  });

  it('does not double a reason that already ends in newline', () => {
    const outcome = foldResult({ ...BASE, exitCode: 2, stdout: '', reason: 'done\n' });
    expect(outcome.stderr).toBe('done\n');
  });

  it('delivers stdout even when also signalling continue-loop', () => {
    const outcome = foldResult({ ...BASE, exitCode: 2, stdout: 'ctx', reason: 'loop' });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 2, stdout: 'ctx', stderr: 'loop\n' });
  });

  it('exit 2 with no reason produces no stderr', () => {
    const outcome = foldResult({ ...BASE, exitCode: 2, stdout: '' });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 2 });
  });
});

describe('renderDryRunReport', () => {
  it('reports when no rules matched', () => {
    expect(renderDryRunReport({ ...BASE, exitCode: 0, stdout: '', matched: [] }))
      .toBe('[dry-run] no rules matched\n');
  });

  it('treats a missing matched array as no matches', () => {
    expect(renderDryRunReport({ ...BASE, exitCode: 0, stdout: '' }))
      .toBe('[dry-run] no rules matched\n');
  });

  it('renders one line per matched rule with would-execute / skip verdicts', () => {
    const report = renderDryRunReport({
      ...BASE,
      exitCode: 0,
      stdout: '',
      dryRun: true,
      matched: [
        { spellId: 's1', ruleId: 'r1', action: 'inject-prompt', wouldExecute: true },
        { spellId: 's1', ruleId: 'r2', action: 'run-command', wouldExecute: false, skipReason: 'readOnly session' },
      ],
    });
    expect(report).toBe(
      '[dry-run] 2 rule(s) matched\n' +
      '  spell s1  rule r1  inject-prompt  → would execute\n' +
      '  spell s1  rule r2  run-command  → skipped: readOnly session\n',
    );
  });

  it('renders a plain "skipped" when no skipReason is given', () => {
    const report = renderDryRunReport({
      ...BASE,
      exitCode: 0,
      stdout: '',
      matched: [{ spellId: 's2', ruleId: 'r9', action: 'continue-loop', wouldExecute: false }],
    });
    expect(report).toContain('→ skipped\n');
    expect(report).not.toContain('skipped:');
  });
});

describe('runHookDispatch — graceful degrades (never dispatch, exit 0)', () => {
  const common = { stdinRaw: '', dryRun: false };

  it('exits 0 and does not fetch on unknown event', async () => {
    const outcome = await runHookDispatch({ ...common, event: 'NotAnEvent', sessionId: 's', serverUrl: 'http://x' });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('exits 0 and does not fetch when MAESTRO_SESSION_ID is missing', async () => {
    const outcome = await runHookDispatch({ ...common, event: 'Stop', sessionId: undefined, serverUrl: 'http://x' });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('exits 0 and does not fetch when the server URL is missing', async () => {
    const outcome = await runHookDispatch({ ...common, event: 'Stop', sessionId: 's', serverUrl: undefined });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('exits 0 when the server responds non-2xx', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false, 500));
    const outcome = await runHookDispatch({ ...common, event: 'Stop', sessionId: 's', serverUrl: 'http://x' });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 0 });
  });

  it('exits 0 when the request fails / times out', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const outcome = await runHookDispatch({ ...common, event: 'Stop', sessionId: 's', serverUrl: 'http://x' });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 0 });
  });
});

describe('runHookDispatch — live dispatch folding (mocked fetch)', () => {
  it('folds a feed-context result: stdout passthrough + exit 0', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ...BASE, exitCode: 0, stdout: 'hello ctx' }));
    const outcome = await runHookDispatch({ event: 'PostToolUse', sessionId: 's', serverUrl: 'http://x', stdinRaw: '', dryRun: false });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 0, stdout: 'hello ctx' });
  });

  it('folds a continue-loop result: exit 2 with reason on stderr', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ...BASE, exitCode: 2, stdout: '', continued: true, reason: 'not done yet' }));
    const outcome = await runHookDispatch({ event: 'Stop', sessionId: 's', serverUrl: 'http://x', stdinRaw: '', dryRun: false });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 2, stderr: 'not done yet\n' });
  });

  it('does not include dryRun in the live request body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ...BASE, exitCode: 0, stdout: '' }));
    await runHookDispatch({ event: 'Stop', sessionId: 's', serverUrl: 'http://x', stdinRaw: '', dryRun: false });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(body).toEqual({ sessionId: 's', event: 'Stop' });
    expect(body).not.toHaveProperty('dryRun');
  });

  it('parses JSON stdin into the payload field', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ...BASE, exitCode: 0, stdout: '' }));
    await runHookDispatch({ event: 'PreToolUse', sessionId: 's', serverUrl: 'http://x', stdinRaw: '{"tool_name":"Bash"}', dryRun: false });
    const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(body.payload).toEqual({ tool_name: 'Bash' });
  });
});

describe('runHookDispatch — dry-run (--dry-run)', () => {
  it('sends dryRun:true and prints the match report, always exit 0', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      ...BASE,
      exitCode: 0,
      stdout: '',
      dryRun: true,
      matched: [{ spellId: 's1', ruleId: 'r1', action: 'inject-prompt', wouldExecute: true }],
    }));
    const outcome = await runHookDispatch({ event: 'PreToolUse', sessionId: 's', serverUrl: 'http://x', stdinRaw: '', dryRun: true });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain('[dry-run] 1 rule(s) matched');
    expect(outcome.stdout).toContain('spell s1  rule r1  inject-prompt  → would execute');
    expect(outcome.stderr).toBeUndefined();

    const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(body.dryRun).toBe(true);
  });

  it('never exits 2 in dry-run mode even if the result carries exitCode 2', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      ...BASE,
      exitCode: 2,
      stdout: '',
      reason: 'would loop',
      dryRun: true,
      matched: [{ spellId: 's3', ruleId: 'r3', action: 'continue-loop', wouldExecute: true }],
    }));
    const outcome = await runHookDispatch({ event: 'Stop', sessionId: 's', serverUrl: 'http://x', stdinRaw: '', dryRun: true });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderr).toBeUndefined();
  });

  it('exits 0 with no report when the server is unreachable in dry-run', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const outcome = await runHookDispatch({ event: 'PreToolUse', sessionId: 's', serverUrl: 'http://x', stdinRaw: '', dryRun: true });
    expect(outcome).toEqual<HookOutcome>({ exitCode: 0 });
  });
});
