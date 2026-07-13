import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MaestroManifest } from '../../src/types/manifest.js';
import { AgentSpawner } from '../../src/services/agent-spawner.js';
import { HermesSpawner } from '../../src/services/hermes-spawner.js';

// vi.mock is hoisted above module-scope declarations, so the mocked variable must
// be created via vi.hoisted() to avoid a temporal-dead-zone ReferenceError.
const { spawnWithUlimit } = vi.hoisted(() => ({
  spawnWithUlimit: vi.fn(() => ({
    stdin: {
      destroyed: false,
      write: vi.fn(),
    },
  })),
}));

vi.mock('../../src/services/spawn-with-ulimit.js', () => ({
  spawnWithUlimit,
}));

const manifest: MaestroManifest = {
  manifestVersion: '1.0',
  mode: 'worker',
  agentTool: 'hermes',
  tasks: [{
    id: 'task-123',
    title: 'Test task',
    description: 'Test description',
    acceptanceCriteria: ['Done'],
    projectId: 'proj-1',
    createdAt: '2026-02-02T00:00:00Z',
  }],
  session: {
    model: 'hermes-default',
    permissionMode: 'acceptEdits',
    maxTurns: 42,
    workingDirectory: '/tmp/project',
  },
};

describe('HermesSpawner', () => {
  beforeEach(() => {
    spawnWithUlimit.mockClear();
  });

  it('builds Hermes chat args for one-shot Maestro sessions', () => {
    const spawner = new HermesSpawner();

    const args = spawner.buildHermesArgs(manifest, 'session-123', 'system prompt', 'task prompt');

    expect(args).toEqual([
      'chat',
      '--max-turns',
      '42',
      '--yolo',
      '--source',
      'maestro',
      '--query',
      '[SYSTEM INSTRUCTIONS]\nsystem prompt\n\n[TASK]\ntask prompt',
    ]);
  });

  it('routes Anthropic Hermes models to the Anthropic provider', () => {
    const spawner = new HermesSpawner();

    const args = spawner.buildHermesArgs({
      ...manifest,
      session: {
        ...manifest.session,
        model: 'anthropic/claude-sonnet-4.6',
        permissionMode: 'interactive',
      },
    }, 'session-123', 'system prompt', 'task prompt');

    expect(args).toContain('--provider');
    expect(args).toContain('anthropic');
    expect(args).toContain('--model');
    expect(args).toContain('claude-sonnet-4.6');
    expect(args).not.toContain('--yolo');
  });

  it('routes Hermes Opus 4.8 to native Anthropic with the official hyphenated model id', () => {
    const spawner = new HermesSpawner();

    const args = spawner.buildHermesArgs({
      ...manifest,
      session: {
        ...manifest.session,
        model: 'anthropic:claude-opus-4-8',
        permissionMode: 'interactive',
      },
    }, 'session-123', 'system prompt', 'task prompt');

    expect(args).toContain('--provider');
    expect(args[args.indexOf('--provider') + 1]).toBe('anthropic');
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('claude-opus-4-8');
  });

  it('routes Hermes Opus 4.8 to Nous Portal with the provider-qualified model id', () => {
    const spawner = new HermesSpawner();

    const args = spawner.buildHermesArgs({
      ...manifest,
      session: {
        ...manifest.session,
        model: 'nous:anthropic/claude-opus-4.8',
        permissionMode: 'interactive',
      },
    }, 'session-123', 'system prompt', 'task prompt');

    expect(args).toContain('--provider');
    expect(args[args.indexOf('--provider') + 1]).toBe('nous');
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('anthropic/claude-opus-4.8');
  });

  it('routes Hermes Opus 4.8 to OpenRouter with the provider-qualified model id', () => {
    const spawner = new HermesSpawner();

    const args = spawner.buildHermesArgs({
      ...manifest,
      session: {
        ...manifest.session,
        model: 'openrouter:anthropic/claude-opus-4.8',
        permissionMode: 'interactive',
      },
    }, 'session-123', 'system prompt', 'task prompt');

    expect(args).toContain('--provider');
    expect(args[args.indexOf('--provider') + 1]).toBe('openrouter');
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('anthropic/claude-opus-4.8');
  });

  it('routes OpenAI Hermes models to the Codex OAuth provider', () => {
    const spawner = new HermesSpawner();

    const args = spawner.buildHermesArgs({
      ...manifest,
      session: {
        ...manifest.session,
        model: 'openai/gpt-5.6-sol',
        permissionMode: 'interactive',
      },
    }, 'session-123', 'system prompt', 'task prompt');

    expect(args).toContain('--provider');
    expect(args).toContain('openai-codex');
    expect(args).toContain('--model');
    expect(args).toContain('gpt-5.6-sol');
  });

  it('builds interactive Hermes TUI args with the task as the startup query', () => {
    const spawner = new HermesSpawner();
    const args = spawner.buildInteractiveHermesArgs(manifest, '<maestro_task_prompt>task</maestro_task_prompt>');

    expect(args).toEqual(expect.arrayContaining([
      'chat',
      '--tui',
      '--query',
      '<maestro_task_prompt>task</maestro_task_prompt>',
      '--source',
      'maestro',
    ]));
  });

  it('spawns interactive Hermes TUI with Maestro task context as the visible startup query', async () => {
    const result = await new HermesSpawner().spawn(manifest, 'session-123', {
      cwd: '/tmp/project',
      interactive: true,
    });

    expect(result.sessionId).toBe('session-123');
    expect(spawnWithUlimit).toHaveBeenCalledWith(
      'hermes',
      expect.arrayContaining(['chat', '--tui', '--query', expect.stringContaining('<maestro_task_prompt'), '--source', 'maestro']),
      expect.objectContaining({
        cwd: '/tmp/project',
        env: expect.objectContaining({
          HERMES_EPHEMERAL_SYSTEM_PROMPT: expect.stringContaining('<maestro_system_prompt'),
        }),
        stdio: 'inherit',
      }),
    );
  });

  it('routes Hermes manifests through the agent spawner factory', async () => {
    const result = await new AgentSpawner().spawn(manifest, 'session-123', { cwd: '/tmp/project' });

    expect(result.sessionId).toBe('session-123');
    expect(spawnWithUlimit).toHaveBeenCalledWith(
      'hermes',
      expect.arrayContaining(['chat', '--query']),
      expect.objectContaining({ cwd: '/tmp/project' }),
    );
  });
});
