import { describe, expect, it } from 'vitest';
import { CodexSpawner } from '../../src/services/codex-spawner.js';
import type { MaestroManifest } from '../../src/types/manifest.js';

describe('CodexSpawner', () => {
  const officialCodexModels = [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.3-codex',
    'gpt-5.3-codex-spark',
    'gpt-5.2',
  ];
  const codexReasoningEfforts = ['low', 'medium', 'high', 'xhigh'];
  const maxReasoningModels = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'];
  const fastTierModels = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4'];

  const createManifest = (model: string, launchConfig?: MaestroManifest['launchConfig']): MaestroManifest => ({
    manifestVersion: '1.0',
    mode: 'worker',
    tasks: [{
      id: 'task-123',
      title: 'Test task',
      description: 'Test description',
      acceptanceCriteria: ['Test criterion'],
      projectId: 'proj-1',
      createdAt: '2026-02-02T00:00:00Z',
    }],
    session: {
      model,
      permissionMode: 'acceptEdits',
      ...(launchConfig ? { launchConfig } : {}),
    },
  });

  it('matches the visible official Codex CLI model catalog', () => {
    expect([...CodexSpawner.MODELS]).toEqual(officialCodexModels);
  });

  it.each(officialCodexModels)(
    'passes official model %s through to the Codex CLI model flag',
    (model) => {
      const args = new CodexSpawner().buildCodexArgs(createManifest(model));

      expect(args).toContain('--model');
      expect(args).toContain(model);
    }
  );

  it.each([
    ['gpt-5.2-codex', 'gpt-5.2'],
    ['gpt-5.1-codex', 'gpt-5.2'],
    ['gpt-5-codex', 'gpt-5.2'],
    ['gpt-5.1-codex-max', 'gpt-5.3-codex'],
    ['gpt-5.1-codex-mini', 'gpt-5.4-mini'],
    ['gpt-5-codex-mini', 'gpt-5.4-mini'],
  ])('maps legacy Codex model %s to supported official model %s', (legacyModel, expectedModel) => {
    const args = new CodexSpawner().buildCodexArgs(createManifest(legacyModel));

    expect(args[args.indexOf('--model') + 1]).toBe(expectedModel);
  });

  it.each([
    ['claude-fable-5', 'gpt-5.6-sol'],
    ['claude-fable-5[1m]', 'gpt-5.6-sol'],
    ['claude-sonnet-5', 'gpt-5.6-terra'],
    ['claude-sonnet-5[1m]', 'gpt-5.6-terra'],
  ])('maps Claude model %s to Codex model %s', (claudeModel, expectedModel) => {
    const args = new CodexSpawner().buildCodexArgs(createManifest(claudeModel));

    expect(args[args.indexOf('--model') + 1]).toBe(expectedModel);
  });

  it.each(officialCodexModels.flatMap((model) => codexReasoningEfforts.map((effort) => [model, effort])))(
    'passes supported reasoning effort for official model %s at %s',
    (model, effort) => {
      const args = new CodexSpawner().buildCodexArgs(createManifest(model, {
        provider: 'openai',
        model,
        reasoningEffort: effort as any,
      }));

      expect(args).toContain(`model_reasoning_effort=${JSON.stringify(effort)}`);
    },
  );

  it.each(maxReasoningModels)('passes max reasoning only for GPT-5.6 Codex model %s', (model) => {
    const args = new CodexSpawner().buildCodexArgs(createManifest(model, {
      provider: 'openai',
      model,
      reasoningEffort: 'max',
    }));

    expect(args).toContain('model_reasoning_effort="max"');
  });

  it.each(['minimal', 'max'])('does not pass unsupported Codex reasoning effort %s for older models', (effort) => {
    const args = new CodexSpawner().buildCodexArgs(createManifest('gpt-5.5', {
      provider: 'openai',
      model: 'gpt-5.5',
      reasoningEffort: effort as any,
    }));

    expect(args.some((arg) => arg.startsWith('model_reasoning_effort='))).toBe(false);
  });

  it.each(officialCodexModels)('only enables fast service tier for Codex fast-tier model support: %s', (model) => {
    const args = new CodexSpawner().buildCodexArgs(createManifest(model, {
      provider: 'openai',
      model,
      speed: 'fast',
    }));

    const hasFastTier = args.includes('service_tier="fast"');
    expect(hasFastTier).toBe(fastTierModels.includes(model));
    expect(args).not.toContain('features.fast_mode=true');
  });

  it.each([
    ['safe', ['--ask-for-approval', 'untrusted', '--sandbox', 'workspace-write']],
    ['acceptEdits', ['--ask-for-approval', 'never', '--sandbox', 'workspace-write']],
    ['plan', ['--ask-for-approval', 'untrusted', '--sandbox', 'read-only']],
  ])('maps canonical access mode %s to official Codex CLI permission flags', (accessMode, expectedFlags) => {
    const args = new CodexSpawner().buildCodexArgs(createManifest('gpt-5.5', {
      provider: 'openai',
      model: 'gpt-5.5',
      accessMode: accessMode as any,
    }));

    for (const expectedFlag of expectedFlags) {
      expect(args).toContain(expectedFlag);
    }
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  it('maps canonical full access mode to the official Codex bypass flag', () => {
    const args = new CodexSpawner().buildCodexArgs(createManifest('gpt-5.5', {
      provider: 'openai',
      model: 'gpt-5.5',
      accessMode: 'fullAccess',
    }));

    expect(args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(args).not.toContain('--ask-for-approval');
    expect(args).not.toContain('--sandbox');
  });

  it('does not pass unsupported max-turns to the Codex CLI', () => {
    const args = new CodexSpawner().buildCodexArgs({
      ...createManifest('gpt-5.5'),
      session: {
        ...createManifest('gpt-5.5').session,
        maxTurns: 1,
      },
    });

    expect(args).not.toContain('--max-turns');
  });

  it('uses inline Codex rendering for reconnectable server-hosted terminals', () => {
    const previous = process.env.MAESTRO_PTY_HOST;
    process.env.MAESTRO_PTY_HOST = 'server';
    try {
      const args = new CodexSpawner().buildCodexArgs(createManifest('gpt-5.5'));
      expect(args).toContain('--no-alt-screen');
    } finally {
      if (previous === undefined) delete process.env.MAESTRO_PTY_HOST;
      else process.env.MAESTRO_PTY_HOST = previous;
    }
  });

  it('keeps Codex alternate-screen auto detection for native terminals', () => {
    const previous = process.env.MAESTRO_PTY_HOST;
    process.env.MAESTRO_PTY_HOST = 'tauri';
    try {
      const args = new CodexSpawner().buildCodexArgs(createManifest('gpt-5.5'));
      expect(args).not.toContain('--no-alt-screen');
    } finally {
      if (previous === undefined) delete process.env.MAESTRO_PTY_HOST;
      else process.env.MAESTRO_PTY_HOST = previous;
    }
  });

  describe('buildResumeArgs', () => {
    const CODEX_ID = '019ec96a-b3b3-7710-a375-cc969f90615f';

    it('builds an interactive `codex resume <id>` invocation with the launch config reapplied', () => {
      const args = new CodexSpawner().buildResumeArgs(createManifest('gpt-5.5'), 'sess_abc', CODEX_ID);

      // Codex resumes via the `resume` subcommand, not a Claude-style flag.
      expect(args[0]).toBe('resume');
      // The native rollout id is the trailing positional (options precede it).
      expect(args[args.length - 1]).toBe(CODEX_ID);
      // Launch config (model/sandbox/approval) is reapplied so the resumed run keeps its settings.
      expect(args).toContain('--model');
      expect(args).toContain('gpt-5.5');
      // These are Claude-only; Codex has neither, and there is no `--last` guess.
      expect(args).not.toContain('--resume');
      expect(args).not.toContain('--session-id');
      expect(args).not.toContain('--last');
    });

    it('re-injects the Maestro system prompt via `-c developer_instructions` on resume', () => {
      const args = new CodexSpawner().buildResumeArgs(createManifest('gpt-5.5'), 'sess_abc', CODEX_ID);

      // Resume must re-supply the role/system prompt per invocation (provider-specific
      // analog of Claude's --append-system-prompt) — the same mechanism as a fresh spawn.
      const idx = args.findIndex((arg) => arg.startsWith('developer_instructions='));
      expect(idx).toBeGreaterThan(-1);
      // It is a `-c` config override (the flag immediately precedes the value).
      expect(args[idx - 1]).toBe('-c');
    });
  });
});
