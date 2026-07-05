import { describe, expect, it } from 'vitest';
import { GeminiSpawner } from '../../src/services/gemini-spawner.js';
import type { MaestroManifest } from '../../src/types/manifest.js';

describe('GeminiSpawner', () => {
  const createManifest = (model: string): MaestroManifest => ({
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
    },
  });

  it.each([
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
  ])('passes native Gemini model %s through to the model flag', (model) => {
    const args = new GeminiSpawner().buildGeminiArgs(createManifest(model));

    expect(args[args.indexOf('--model') + 1]).toBe(model);
  });

  it.each([
    ['claude-fable-5', 'gemini-3-pro-preview'],
    ['claude-fable-5[1m]', 'gemini-3-pro-preview'],
    ['claude-sonnet-5', 'gemini-3-pro-preview'],
    ['claude-sonnet-5[1m]', 'gemini-3-pro-preview'],
    ['claude-opus-4-8', 'gemini-3-pro-preview'],
    ['sonnet', 'gemini-2.5-pro'],
    ['haiku', 'gemini-2.5-flash'],
  ])('maps Claude model %s to Gemini model %s', (claudeModel, expectedModel) => {
    const args = new GeminiSpawner().buildGeminiArgs(createManifest(claudeModel));

    expect(args[args.indexOf('--model') + 1]).toBe(expectedModel);
  });
});
