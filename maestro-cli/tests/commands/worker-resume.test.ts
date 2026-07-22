import { describe, it, expect } from 'vitest';
import { WorkerResumeCommand } from '../../src/commands/worker-resume.js';
import type { MaestroManifest } from '../../src/types/manifest.js';

/**
 * These tests pin the provider-aware resume contract that the server invokes via
 * `maestro worker resume`. The previous implementation hardcoded the `claude`
 * binary and Claude's `--resume <id>` flag for every agent tool, which silently
 * launched Claude when a Codex session was resumed.
 */
describe('WorkerResumeCommand.resolveResumeInvocation', () => {
  const codexManifest = (): MaestroManifest => ({
    manifestVersion: '1.0',
    mode: 'worker',
    agentTool: 'codex',
    tasks: [{
      id: 'task-1',
      title: 'Test task',
      description: 'Test description',
      acceptanceCriteria: ['done'],
      projectId: 'proj-1',
      createdAt: '2026-02-02T00:00:00Z',
    }],
    session: {
      model: 'gpt-5.5',
      permissionMode: 'acceptEdits',
    },
  });

  it('resumes a Codex session with the `codex` binary and the `resume` subcommand', async () => {
    const invocation = await new WorkerResumeCommand().resolveResumeInvocation({
      agentTool: 'codex',
      sessionId: 'sess_abc',
      manifest: codexManifest(),
      codexSessionId: '019ec96a-b3b3-7710-a375-cc969f90615f',
    });

    expect(invocation).not.toBeNull();
    expect(invocation!.bin).toBe('codex');
    expect(invocation!.args[0]).toBe('resume');
    expect(invocation!.args).toContain('019ec96a-b3b3-7710-a375-cc969f90615f');
    // Codex must never receive Claude-only session flags, and there is no `--last` guess.
    expect(invocation!.args).not.toContain('--resume');
    expect(invocation!.args).not.toContain('--session-id');
    expect(invocation!.args).not.toContain('--last');
    // Launch config is reapplied.
    expect(invocation!.args).toContain('--model');
  });

  it('fails closed when no native Codex id was captured', async () => {
    await expect(new WorkerResumeCommand().resolveResumeInvocation({
      agentTool: 'codex',
      sessionId: 'sess_abc',
      manifest: codexManifest(),
    })).rejects.toThrow(/refusing to fresh-start/i);
  });

  it('resumes a Codex session even when the manifest could not be read', async () => {
    const invocation = await new WorkerResumeCommand().resolveResumeInvocation({
      agentTool: 'codex',
      sessionId: 'sess_abc',
      manifest: null,
      codexSessionId: 'abc-123',
    });

    expect(invocation!.bin).toBe('codex');
    expect(invocation!.args).toEqual(['resume', 'abc-123']);
  });

  it('keeps the Claude resume contract intact (binary + --resume)', async () => {
    const invocation = await new WorkerResumeCommand().resolveResumeInvocation({
      agentTool: 'claude-code',
      sessionId: 'sess_abc',
      manifest: null,
      claudeSessionId: 'claude-uuid-1',
    });

    expect(invocation!.bin).toBe('claude');
    expect(invocation!.args).toContain('--resume');
    expect(invocation!.args).toContain('claude-uuid-1');
  });
});
