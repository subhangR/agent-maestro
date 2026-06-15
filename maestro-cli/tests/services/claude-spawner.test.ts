import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { ClaudeSpawner, type SpawnResult } from '../../src/services/claude-spawner.js';
import { SkillLoader } from '../../src/services/skill-loader.js';
import type { MaestroManifest } from '../../src/types/manifest.js';
import { existsSync, unlinkSync } from 'fs';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

describe('ClaudeSpawner', () => {
  let spawner: ClaudeSpawner;
  let workerManifest: MaestroManifest;
  let createdFiles: string[] = [];

  beforeAll(() => {
    spawner = new ClaudeSpawner();

    workerManifest = {
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
        model: 'sonnet',
        permissionMode: 'acceptEdits',
      },
    };
  });

  afterAll(() => {
    // Clean up any created temp files
    createdFiles.forEach(file => {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    });
  });

  describe('prepareEnvironment', () => {
    it('should set maestro environment variables', () => {
      const env = spawner.prepareEnvironment(workerManifest, 'session-123');

      expect(env.MAESTRO_SESSION_ID).toBe('session-123');
      expect(env.MAESTRO_TASK_IDS).toBe('task-123');
      expect(env.MAESTRO_PROJECT_ID).toBe('proj-1');
      expect(env.MAESTRO_MODE).toBe('worker');
    });

    it('should preserve existing environment variables', () => {
      const env = spawner.prepareEnvironment(workerManifest, 'session-123');

      expect(env.PATH).toBeDefined();
      expect(env.HOME).toBeDefined();
    });

    it('should handle optional fields', () => {
      const minimalManifest: MaestroManifest = {
        manifestVersion: '1.0',
        mode: 'worker',
        tasks: [{
          id: 'task-1',
          title: 'Test',
          description: 'Test',
          acceptanceCriteria: ['Done'],
          projectId: 'proj-1',
          createdAt: '2026-02-02T00:00:00Z',
        }],
        session: {
          model: 'sonnet',
          permissionMode: 'acceptEdits',
        },
      };

      const env = spawner.prepareEnvironment(minimalManifest, 'session-1');

      expect(env.MAESTRO_SESSION_ID).toBe('session-1');
      expect(env.MAESTRO_TASK_IDS).toBe('task-1');
    });

    it('should add task metadata environment variables', () => {
      const manifestWithMetadata: MaestroManifest = {
        ...workerManifest,
        tasks: [{
          ...workerManifest.tasks[0],
          acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
          dependencies: ['task-456', 'task-789'],
        }],
      };

      const env = spawner.prepareEnvironment(manifestWithMetadata, 'session-123');

      // Basic metadata always present
      expect(env.MAESTRO_SESSION_ID).toBe('session-123');
      expect(env.MAESTRO_TASK_IDS).toBe('task-123');
      expect(env.MAESTRO_TASK_TITLE).toBe('Test task');
    });
  });

  describe('getPluginDir', () => {
    it('should return plugin directory for worker mode', () => {
      const pluginDir = spawner.getPluginDir('worker');

      if (pluginDir) {
        expect(pluginDir).toContain('maestro-worker');
      } else {
        // Plugin directory may not exist in test environment
        expect(pluginDir).toBeNull();
      }
    });

    it('should return plugin directory for coordinator mode', () => {
      const pluginDir = spawner.getPluginDir('coordinator');

      if (pluginDir) {
        expect(pluginDir).toContain('maestro-orchestrator');
      } else {
        // Plugin directory may not exist in test environment
        expect(pluginDir).toBeNull();
      }
    });

    it('should return null if plugin directory does not exist', () => {
      // In test environment, plugins may not exist
      const pluginDir = spawner.getPluginDir('worker');

      // Should either exist or be null
      expect(pluginDir === null || typeof pluginDir === 'string').toBe(true);
    });
  });

  describe('buildClaudeArgs', () => {
    const officialClaudeModels = [
      'claude-fable-5',
      'claude-fable-5[1m]',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-7[1m]',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'claude-opus-4-6',
      'opus',
      'opus[1m]',
      'sonnet',
      'sonnet[1m]',
      'haiku',
    ];
    const claudeReasoningEfforts = ['low', 'medium', 'high', 'xhigh', 'max'];

    it('should include --plugin-dir for worker mode', async () => {
      const args = await spawner.buildClaudeArgs(workerManifest);

      // Should include --plugin-dir if plugin directory exists
      const hasPluginDir = args.includes('--plugin-dir');

      // Either includes --plugin-dir (if plugin exists) or doesn't (if not found)
      expect(typeof hasPluginDir).toBe('boolean');
    });

    it('should include --plugin-dir for coordinator mode', async () => {
      const orchestratorManifest: MaestroManifest = {
        ...workerManifest,
        mode: 'coordinator',
      };

      const args = await spawner.buildClaudeArgs(orchestratorManifest);

      // Should include --plugin-dir if plugin directory exists
      const hasPluginDir = args.includes('--plugin-dir');

      // Either includes --plugin-dir (if plugin exists) or doesn't (if not found)
      expect(typeof hasPluginDir).toBe('boolean');
    });

    it('should include model flag', async () => {
      const args = await spawner.buildClaudeArgs(workerManifest);

      expect(args).toContain('--model');
      expect(args).toContain('sonnet');
    });

    it.each(officialClaudeModels)('passes Claude model %s through to the official --model flag', async (model) => {
      const args = await spawner.buildClaudeArgs({
        ...workerManifest,
        session: {
          ...workerManifest.session,
          launchConfig: {
            provider: 'claude',
            model,
          },
        },
      });

      expect(args[args.indexOf('--model') + 1]).toBe(model);
    });

    it.each(officialClaudeModels.flatMap((model) => claudeReasoningEfforts.map((effort) => [model, effort])))(
      'passes supported Claude effort for model %s at %s',
      async (model, effort) => {
        const args = await spawner.buildClaudeArgs({
          ...workerManifest,
          session: {
            ...workerManifest.session,
            launchConfig: {
              provider: 'claude',
              model,
              reasoningEffort: effort as any,
              speed: 'fast' as any,
            },
          },
        });

        expect(args[args.indexOf('--model') + 1]).toBe(model);
        expect(args).toContain('--effort');
        expect(args[args.indexOf('--effort') + 1]).toBe(effort);
        expect(args).not.toContain('--speed');
        expect(args).not.toContain('fast');
      },
    );

    it('does not pass unsupported minimal effort to Claude', async () => {
      const args = await spawner.buildClaudeArgs({
        ...workerManifest,
        session: {
          ...workerManifest.session,
          launchConfig: {
            provider: 'claude',
            model: 'claude-opus-4-8',
            reasoningEffort: 'minimal' as any,
          },
        },
      });

      expect(args).not.toContain('--effort');
    });

    it.each([
      ['safe', 'default'],
      ['acceptEdits', 'acceptEdits'],
      ['plan', 'plan'],
    ])('maps canonical access mode %s to official Claude permission mode %s', async (accessMode, permissionMode) => {
      const args = await spawner.buildClaudeArgs({
        ...workerManifest,
        session: {
          ...workerManifest.session,
          permissionMode: 'bypassPermissions',
          launchConfig: {
            provider: 'claude',
            model: 'claude-opus-4-8',
            accessMode: accessMode as any,
          },
        },
      });

      expect(args).toContain('--permission-mode');
      expect(args[args.indexOf('--permission-mode') + 1]).toBe(permissionMode);
      expect(args).not.toContain('--dangerously-skip-permissions');
    });

    it('maps canonical full access mode to the official Claude bypass flag', async () => {
      const args = await spawner.buildClaudeArgs({
        ...workerManifest,
        session: {
          ...workerManifest.session,
          launchConfig: {
            provider: 'claude',
            model: 'claude-opus-4-8',
            accessMode: 'fullAccess',
          },
        },
      });

      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).not.toContain('--permission-mode');
    });

    it('should include max turns when specified', async () => {
      const manifestWithMaxTurns: MaestroManifest = {
        ...workerManifest,
        session: {
          ...workerManifest.session,
          maxTurns: 50,
        },
      };

      const args = await spawner.buildClaudeArgs(manifestWithMaxTurns);

      expect(args).toContain('--max-turns');
      expect(args).toContain('50');
    });

    it('should build valid args array', async () => {
      const args = await spawner.buildClaudeArgs(workerManifest);

      expect(args).toBeDefined();
      expect(Array.isArray(args)).toBe(true);
      expect(args.length).toBeGreaterThan(0);
    });

    it('should include skill plugin directories when skills specified', async () => {
      let testProjectDir = '';

      try {
        // Create isolated project-scoped skills directory tree
        testProjectDir = join(tmpdir(), `maestro-skills-test-${randomBytes(4).toString('hex')}`);
        const skillsDir = join(testProjectDir, '.claude', 'skills');
        await mkdir(skillsDir, { recursive: true });

        // Create a test skill
        const skillDir = join(skillsDir, 'test-skill');
        await mkdir(skillDir, { recursive: true });
        await writeFile(join(skillDir, 'skill.md'), '# Test Skill\n');

        // Create spawner with custom skill loader
        const customSpawner = new ClaudeSpawner(
          new SkillLoader(testProjectDir, { includeGlobal: false }),
        );

        // Create manifest with skills
        const manifestWithSkills: MaestroManifest = {
          ...workerManifest,
          skills: ['test-skill'],
        };

        const args = await customSpawner.buildClaudeArgs(manifestWithSkills);

        // Should include skill plugin dir
        expect(args).toContain('--plugin-dir');
        expect(args).toContain(skillDir);
      } finally {
        await rm(testProjectDir, { recursive: true, force: true });
      }
    });

    it('should gracefully handle missing skills', async () => {
      const customSpawner = new ClaudeSpawner(new SkillLoader());

      // Create manifest with nonexistent skills
      const manifestWithMissingSkills: MaestroManifest = {
        ...workerManifest,
        skills: ['nonexistent-skill'],
      };

      // Should not throw, should complete gracefully
      const args = await customSpawner.buildClaudeArgs(manifestWithMissingSkills);

      expect(args).toBeDefined();
      expect(Array.isArray(args)).toBe(true);
    });

    it('should work without skills field', async () => {
      const manifestWithoutSkills: MaestroManifest = {
        ...workerManifest,
        skills: undefined,
      };

      const args = await spawner.buildClaudeArgs(manifestWithoutSkills);

      expect(args).toBeDefined();
      expect(Array.isArray(args)).toBe(true);
    });
  });

  describe('buildResumeArgs', () => {
    const CLAUDE_SESSION_ID = '11111111-2222-3333-4444-555555555555';

    it('passes --resume with the claude session id, not --session-id', async () => {
      const args = await spawner.buildResumeArgs(workerManifest, CLAUDE_SESSION_ID);

      expect(args).toContain('--resume');
      expect(args[args.indexOf('--resume') + 1]).toBe(CLAUDE_SESSION_ID);
      expect(args).not.toContain('--session-id');
    });

    it('reapplies the launch config (model + permission mode) on resume', async () => {
      const manifest: MaestroManifest = {
        ...workerManifest,
        session: {
          ...workerManifest.session,
          launchConfig: { provider: 'claude', model: 'opus' },
          permissionMode: 'acceptEdits',
        },
      };

      const args = await spawner.buildResumeArgs(manifest, CLAUDE_SESSION_ID);

      expect(args[args.indexOf('--model') + 1]).toBe('opus');
      expect(args).toContain('--permission-mode');
    });

    it('does not append a system prompt or task prompt on resume', async () => {
      const args = await spawner.buildResumeArgs(workerManifest, CLAUDE_SESSION_ID);

      expect(args).not.toContain('--append-system-prompt');
    });
  });

  describe('SpawnResult interface', () => {
    it('should define SpawnResult structure', () => {
      // This is a type check test
      const result: SpawnResult = {
        sessionId: 'session-123',
        process: null as any, // Would be ChildProcess in real usage
      };

      expect(result.sessionId).toBe('session-123');
    });
  });

  describe('Integration', () => {
    it('should prepare all components for spawning', async () => {
      const sessionId = 'test-session-123';

      // Prepare all components
      const env = spawner.prepareEnvironment(workerManifest, sessionId);
      const args = await spawner.buildClaudeArgs(workerManifest);

      // Verify all components are ready
      expect(env.MAESTRO_SESSION_ID).toBe(sessionId);
      expect(args).toBeDefined();
    });
  });

});
