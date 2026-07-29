/**
 * Focused tests for ModelProfile quota policy methods.
 * Uses the same TestDataDir + repo pattern as command-usage.test.ts.
 */

import { TestDataDir, silentLogger } from './helpers';
import { TimestampIdGenerator } from '../src/infrastructure/common/TimestampIdGenerator';
import { InMemoryEventBus } from '../src/infrastructure/events/InMemoryEventBus';
import { FileSystemModelProfileRepository } from '../src/infrastructure/repositories/FileSystemModelProfileRepository';
import { ModelProfileService } from '../src/application/services/ModelProfileService';
import type { ModelProfile } from '../src/types';

function buildStack(dataDir: string) {
  const idGenerator = new TimestampIdGenerator();
  const eventBus = new InMemoryEventBus(silentLogger);
  const repo = new FileSystemModelProfileRepository(dataDir, idGenerator, silentLogger);
  const service = new ModelProfileService(repo, eventBus, idGenerator);
  return { repo, service };
}

/** Minimal analytics stub that satisfies the narrow interface. */
function makeAnalyticsStub(providerTotals: Record<string, number> = {}) {
  return {
    async getGlobalSummary(_windowMs: number) {
      const byProvider: Record<string, { total: number }> = {};
      for (const [k, v] of Object.entries(providerTotals)) {
        byProvider[k] = { total: v };
      }
      return { byProvider };
    },
  };
}

describe('Provider quota enforcement', () => {
  let testDataDir: TestDataDir;
  let service: ModelProfileService;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    const stack = buildStack(testDataDir.getPath());
    await stack.repo.initialize();
    service = stack.service;
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  // ---- checkSessionQuota ----

  describe('checkSessionQuota', () => {
    it('allows spawn when profile has no quotas', async () => {
      const profile = await service.createModelProfile({
        name: 'No limits',
        launchConfig: { provider: 'claude', model: 'claude-sonnet-4-6' },
      });
      const result = await service.checkSessionQuota(profile.id, 999);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('allows spawn when quota field is absent from profile', async () => {
      // Use seeded profile which has no quotas
      const result = await service.checkSessionQuota('mp_balanced', 50);
      expect(result.allowed).toBe(true);
    });

    it('allows spawn below maxConcurrentSessions limit', async () => {
      const profile = await service.createModelProfile({
        name: 'Limited',
        launchConfig: { provider: 'claude', model: 'claude-opus-4-8' },
        quotas: { maxConcurrentSessions: 3 },
      });
      const result = await service.checkSessionQuota(profile.id, 2);
      expect(result.allowed).toBe(true);
    });

    it('blocks spawn at maxConcurrentSessions limit (equal)', async () => {
      const profile = await service.createModelProfile({
        name: 'Capped',
        launchConfig: { provider: 'claude', model: 'claude-opus-4-8' },
        quotas: { maxConcurrentSessions: 2 },
      });
      const result = await service.checkSessionQuota(profile.id, 2);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/concurrent session limit \(2\)/);
      expect(result.reason).toMatch(/Capped/);
    });

    it('blocks spawn when activeCount exceeds limit', async () => {
      const profile = await service.createModelProfile({
        name: 'Strict',
        launchConfig: { provider: 'claude', model: 'claude-haiku-4-5' },
        quotas: { maxConcurrentSessions: 1 },
      });
      const result = await service.checkSessionQuota(profile.id, 5);
      expect(result.allowed).toBe(false);
    });

    it('allows spawn when maxConcurrentSessions is 0 (disabled)', async () => {
      const profile = await service.createModelProfile({
        name: 'Zero means disabled',
        launchConfig: { provider: 'claude', model: 'claude-haiku-4-5' },
        quotas: { maxConcurrentSessions: 0 },
      });
      const result = await service.checkSessionQuota(profile.id, 999);
      expect(result.allowed).toBe(true);
    });

    it('returns allowed for unknown profileId', async () => {
      const result = await service.checkSessionQuota('nonexistent_profile', 0);
      expect(result.allowed).toBe(true);
    });

    it('ignores maxTokensPerSession/maxTokensPerDay when checking concurrent sessions', async () => {
      const profile = await service.createModelProfile({
        name: 'Token limits only',
        launchConfig: { provider: 'claude', model: 'claude-sonnet-4-6' },
        quotas: { maxTokensPerSession: 100_000, maxTokensPerDay: 1_000_000 },
      });
      // No maxConcurrentSessions — should always allow
      const result = await service.checkSessionQuota(profile.id, 9999);
      expect(result.allowed).toBe(true);
    });
  });

  // ---- checkDailyTokenQuota ----

  describe('checkDailyTokenQuota', () => {
    it('allows when profile has no quotas', async () => {
      const profile = await service.createModelProfile({
        name: 'Unlimited',
        launchConfig: { provider: 'claude', model: 'claude-sonnet-4-6' },
      });
      const stub = makeAnalyticsStub({ claude: 5_000_000 });
      const result = await service.checkDailyTokenQuota(profile.id, stub);
      expect(result.allowed).toBe(true);
    });

    it('allows when maxTokensPerDay is not set', async () => {
      const profile = await service.createModelProfile({
        name: 'Concurrent only',
        launchConfig: { provider: 'claude', model: 'claude-sonnet-4-6' },
        quotas: { maxConcurrentSessions: 5 },
      });
      const stub = makeAnalyticsStub({ claude: 99_999_999 });
      const result = await service.checkDailyTokenQuota(profile.id, stub);
      expect(result.allowed).toBe(true);
    });

    it('allows when provider usage is below limit', async () => {
      const profile = await service.createModelProfile({
        name: 'Daily cap',
        launchConfig: { provider: 'claude', model: 'claude-opus-4-8' },
        quotas: { maxTokensPerDay: 1_000_000 },
      });
      const stub = makeAnalyticsStub({ claude: 500_000 });
      const result = await service.checkDailyTokenQuota(profile.id, stub);
      expect(result.allowed).toBe(true);
    });

    it('blocks when provider usage meets or exceeds limit', async () => {
      const profile = await service.createModelProfile({
        name: 'Daily cap strict',
        launchConfig: { provider: 'claude', model: 'claude-opus-4-8' },
        quotas: { maxTokensPerDay: 1_000_000 },
      });
      const stub = makeAnalyticsStub({ claude: 1_000_000 });
      const result = await service.checkDailyTokenQuota(profile.id, stub);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/daily token limit/);
      expect(result.reason).toMatch(/1,000,000/);
    });

    it('blocks when provider usage exceeds limit', async () => {
      const profile = await service.createModelProfile({
        name: 'Over limit',
        launchConfig: { provider: 'openai', model: 'gpt-5.5' },
        quotas: { maxTokensPerDay: 500_000 },
      });
      const stub = makeAnalyticsStub({ openai: 750_000 });
      const result = await service.checkDailyTokenQuota(profile.id, stub);
      expect(result.allowed).toBe(false);
    });

    it('uses the correct provider key (openai vs claude)', async () => {
      const openaiProfile = await service.createModelProfile({
        name: 'OpenAI cap',
        launchConfig: { provider: 'openai', model: 'gpt-5.5' },
        quotas: { maxTokensPerDay: 100_000 },
      });
      // claude usage is high, openai is fine
      const stub = makeAnalyticsStub({ claude: 9_999_999, openai: 50_000 });
      const result = await service.checkDailyTokenQuota(openaiProfile.id, stub);
      expect(result.allowed).toBe(true);
    });

    it('treats absent provider usage as zero (allows)', async () => {
      const profile = await service.createModelProfile({
        name: 'Gemini cap',
        launchConfig: { provider: 'gemini', model: 'gemini-ultra' },
        quotas: { maxTokensPerDay: 100_000 },
      });
      const stub = makeAnalyticsStub({}); // no gemini key
      const result = await service.checkDailyTokenQuota(profile.id, stub);
      expect(result.allowed).toBe(true);
    });

    it('returns allowed for unknown profileId', async () => {
      const stub = makeAnalyticsStub({ claude: 999_999_999 });
      const result = await service.checkDailyTokenQuota('no_such_profile', stub);
      expect(result.allowed).toBe(true);
    });
  });

  // ---- quota persistence (create / update round-trip) ----

  describe('quota persistence', () => {
    it('persists quotas through create and re-read', async () => {
      const profile = await service.createModelProfile({
        name: 'Persisted quotas',
        launchConfig: { provider: 'claude', model: 'claude-sonnet-4-6' },
        quotas: { maxConcurrentSessions: 3, maxTokensPerDay: 500_000 },
      });
      const fetched = await service.getModelProfile(profile.id);
      expect(fetched?.quotas).toEqual({ maxConcurrentSessions: 3, maxTokensPerDay: 500_000 });
    });

    it('updates quotas without touching launchConfig', async () => {
      const profile = await service.createModelProfile({
        name: 'Update test',
        launchConfig: { provider: 'claude', model: 'claude-sonnet-4-6' },
        quotas: { maxConcurrentSessions: 5 },
      });
      await service.updateModelProfile(profile.id, { quotas: { maxConcurrentSessions: 10, maxTokensPerDay: 2_000_000 } });
      const fetched = await service.getModelProfile(profile.id);
      expect(fetched?.quotas?.maxConcurrentSessions).toBe(10);
      expect(fetched?.quotas?.maxTokensPerDay).toBe(2_000_000);
      expect(fetched?.launchConfig.model).toBe('claude-sonnet-4-6');
    });

    it('allows creating profile without quotas (backward compatible)', async () => {
      const profile = await service.createModelProfile({
        name: 'No quotas',
        launchConfig: { provider: 'claude', model: 'claude-haiku-4-5' },
      });
      const fetched = await service.getModelProfile(profile.id);
      expect(fetched?.quotas).toBeUndefined();
    });
  });
});
