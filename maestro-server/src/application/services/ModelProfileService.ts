import { ModelProfile, ModelProfileQuotas, CreateModelProfilePayload, UpdateModelProfilePayload } from '../../types';
import { IModelProfileRepository } from '../../domain/repositories/IModelProfileRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ValidationError } from '../../domain/common/Errors';

/**
 * Application service for workspace-global model profiles.
 * A profile is a named launch config; team members reference it by id and the
 * config is resolved at spawn, so updating a profile updates every bound member.
 */
export class ModelProfileService {
  constructor(
    private modelProfileRepo: IModelProfileRepository,
    private eventBus: IEventBus,
    private idGenerator: IIdGenerator
  ) {}

  async listModelProfiles(): Promise<ModelProfile[]> {
    return this.modelProfileRepo.findAll();
  }

  async getModelProfile(id: string): Promise<ModelProfile | null> {
    return this.modelProfileRepo.findById(id);
  }

  async createModelProfile(data: CreateModelProfilePayload): Promise<ModelProfile> {
    if (!data.name || data.name.trim() === '') {
      throw new ValidationError('Model profile name is required');
    }
    if (!data.launchConfig || !data.launchConfig.provider || !data.launchConfig.model) {
      throw new ValidationError('Model profile launchConfig (provider + model) is required');
    }

    const now = new Date().toISOString();
    const profile: ModelProfile = {
      id: this.idGenerator.generate('mp'),
      name: data.name.trim(),
      ...(data.description !== undefined && { description: data.description }),
      launchConfig: data.launchConfig,
      ...(data.quotas !== undefined && { quotas: data.quotas }),
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.modelProfileRepo.create(profile);
    await this.eventBus.emit('model_profile:created', created);
    return created;
  }

  async updateModelProfile(id: string, data: UpdateModelProfilePayload): Promise<ModelProfile> {
    if (data.name !== undefined && data.name.trim() === '') {
      throw new ValidationError('Model profile name cannot be empty');
    }
    if (data.launchConfig !== undefined && (!data.launchConfig.provider || !data.launchConfig.model)) {
      throw new ValidationError('launchConfig requires both provider and model');
    }

    const cleanUpdates: Partial<ModelProfile> = {};
    if (data.name !== undefined) cleanUpdates.name = data.name.trim();
    if (data.description !== undefined) cleanUpdates.description = data.description;
    if (data.launchConfig !== undefined) cleanUpdates.launchConfig = data.launchConfig;
    if (data.quotas !== undefined) cleanUpdates.quotas = data.quotas;

    const updated = await this.modelProfileRepo.update(id, cleanUpdates);
    await this.eventBus.emit('model_profile:updated', updated);
    return updated;
  }

  async deleteModelProfile(id: string): Promise<void> {
    // Allowed even if referenced — bound members fall back to their raw model at spawn.
    await this.modelProfileRepo.delete(id);
    await this.eventBus.emit('model_profile:deleted', { id });
  }

  /**
   * Advisory concurrent-session quota check. Call before creating a session.
   * @param profileId - the model profile id being used
   * @param activeSessionCount - number of currently active (spawning/idle/working) sessions using this profile
   */
  async checkSessionQuota(
    profileId: string,
    activeSessionCount: number,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const profile = await this.modelProfileRepo.findById(profileId);
    if (!profile?.quotas) return { allowed: true };
    const { maxConcurrentSessions } = profile.quotas;
    if (maxConcurrentSessions && maxConcurrentSessions > 0 && activeSessionCount >= maxConcurrentSessions) {
      return {
        allowed: false,
        reason: `Profile "${profile.name}" concurrent session limit (${maxConcurrentSessions}) reached`,
      };
    }
    return { allowed: true };
  }

  /**
   * Advisory daily-token quota check. Uses a narrow analytics interface to avoid a hard
   * dependency on TokenAnalyticsService before it is wired. Only blocks when the global
   * provider token total for the last 24 h exceeds the profile limit.
   */
  async checkDailyTokenQuota(
    profileId: string,
    analyticsProvider: { getGlobalSummary(windowMs: number): Promise<{ byProvider: Record<string, { total: number }> }> },
  ): Promise<{ allowed: boolean; reason?: string }> {
    const profile = await this.modelProfileRepo.findById(profileId);
    if (!profile?.quotas?.maxTokensPerDay) return { allowed: true };
    const summary = await analyticsProvider.getGlobalSummary(24 * 60 * 60 * 1000);
    const providerKey = profile.launchConfig.provider;
    const used = summary.byProvider[providerKey]?.total ?? 0;
    if (used >= profile.quotas.maxTokensPerDay) {
      return {
        allowed: false,
        reason: `Profile "${profile.name}" daily token limit (${profile.quotas.maxTokensPerDay.toLocaleString()}) reached`,
      };
    }
    return { allowed: true };
  }
}
