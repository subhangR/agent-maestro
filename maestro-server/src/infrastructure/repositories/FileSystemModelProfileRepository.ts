import * as fs from 'fs/promises';
import * as path from 'path';
import { ModelProfile } from '../../types';
import { IModelProfileRepository } from '../../domain/repositories/IModelProfileRepository';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError } from '../../domain/common/Errors';
import { atomicWriteFile } from './utils/atomicWrite';

/**
 * Workspace-global model profiles, stored flat at <dataDir>/model-profiles/<id>.json
 * (not scoped to a project). On first run, four default tiers are seeded.
 */
export class FileSystemModelProfileRepository implements IModelProfileRepository {
  private profilesDir: string;
  private initialized = false;
  private cache: Map<string, ModelProfile> = new Map();
  private cacheLoaded = false;

  constructor(
    private dataDir: string,
    private idGenerator: IIdGenerator,
    private logger: ILogger
  ) {
    this.profilesDir = path.join(dataDir, 'model-profiles');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await fs.mkdir(this.profilesDir, { recursive: true });
      await this.seedDefaultsIfEmpty();
      this.initialized = true;
      this.logger.info('Model profile repository initialized');
    } catch (err) {
      this.logger.error('Failed to initialize model profile repository:', err as Error);
      throw err;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }

  /** Seed the 4 default tiers only when no profiles exist yet (respects user deletions). */
  private async seedDefaultsIfEmpty(): Promise<void> {
    let existing: string[] = [];
    try {
      existing = (await fs.readdir(this.profilesDir)).filter((f) => f.endsWith('.json'));
    } catch {
      // dir just created
    }
    if (existing.length > 0) return;

    const now = new Date().toISOString();
    const defaults: ModelProfile[] = [
      {
        id: 'mp_ultra',
        name: 'Ultra',
        description: 'Most capable tier — Fable 5.',
        launchConfig: { provider: 'claude', model: 'claude-fable-5' },
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mp_heavy',
        name: 'Heavy',
        description: 'High-capability tier — Opus 4.8.',
        launchConfig: { provider: 'claude', model: 'claude-opus-4-8' },
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mp_balanced',
        name: 'Balanced',
        description: 'Strong default tier — Sonnet 4.6.',
        launchConfig: { provider: 'claude', model: 'claude-sonnet-4-6' },
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mp_fast',
        name: 'Fast',
        description: 'Lightweight, low-cost tier — Haiku 4.5.',
        launchConfig: { provider: 'claude', model: 'claude-haiku-4-5' },
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const profile of defaults) {
      const filePath = path.join(this.profilesDir, `${profile.id}.json`);
      await atomicWriteFile(filePath, JSON.stringify(profile));
      this.cache.set(profile.id, profile);
    }
    this.logger.info(`Seeded ${defaults.length} default model profiles`);
  }

  private async loadAll(): Promise<void> {
    if (this.cacheLoaded) return;
    try {
      const files = await fs.readdir(this.profilesDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      for (const file of jsonFiles) {
        try {
          const data = await fs.readFile(path.join(this.profilesDir, file), 'utf-8');
          const profile = JSON.parse(data) as ModelProfile;
          this.cache.set(profile.id, profile);
        } catch (err) {
          this.logger.warn(`Failed to load model profile file: ${file}`, {
            error: (err as Error).message,
          });
        }
      }
    } catch (err) {
      // Directory may not exist yet
    }
    this.cacheLoaded = true;
  }

  async findAll(): Promise<ModelProfile[]> {
    await this.ensureInitialized();
    await this.loadAll();
    return Array.from(this.cache.values());
  }

  async findById(id: string): Promise<ModelProfile | null> {
    await this.ensureInitialized();

    const cached = this.cache.get(id);
    if (cached) return cached;

    try {
      const filePath = path.join(this.profilesDir, `${id}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const profile = JSON.parse(data) as ModelProfile;
      this.cache.set(profile.id, profile);
      return profile;
    } catch (err) {
      return null;
    }
  }

  async create(profile: ModelProfile): Promise<ModelProfile> {
    await this.ensureInitialized();

    const filePath = path.join(this.profilesDir, `${profile.id}.json`);
    await atomicWriteFile(filePath, JSON.stringify(profile));

    this.cache.set(profile.id, profile);
    this.logger.debug(`Created model profile: ${profile.id}`);
    return profile;
  }

  async update(id: string, data: Partial<ModelProfile>): Promise<ModelProfile> {
    await this.ensureInitialized();

    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('ModelProfile', id);

    const updated: ModelProfile = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const filePath = path.join(this.profilesDir, `${id}.json`);
    await atomicWriteFile(filePath, JSON.stringify(updated));

    this.cache.set(id, updated);
    this.logger.debug(`Updated model profile: ${id}`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();

    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('ModelProfile', id);

    const filePath = path.join(this.profilesDir, `${id}.json`);
    await fs.unlink(filePath);

    this.cache.delete(id);
    this.logger.debug(`Deleted model profile: ${id}`);
  }
}
