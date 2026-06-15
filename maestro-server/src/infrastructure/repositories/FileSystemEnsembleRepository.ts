import * as fs from 'fs/promises';
import * as path from 'path';
import { Ensemble } from '../../types';
import { IEnsembleRepository } from '../../domain/repositories/IEnsembleRepository';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError } from '../../domain/common/Errors';
import { atomicWriteFile } from './utils/atomicWrite';

/**
 * File-backed Ensemble store. One JSON per ensemble in {dataDir}/ensembles/.
 * Ensembles survive restart because they coordinate long-running work across
 * many sessions; losing them on bounce would orphan the shared-ring UI state.
 */
export class FileSystemEnsembleRepository implements IEnsembleRepository {
  private dir: string;
  private initialized = false;
  private cache = new Map<string, Ensemble>();
  private cacheLoaded = false;

  constructor(
    private dataDir: string,
    private logger: ILogger,
  ) {
    this.dir = path.join(dataDir, 'ensembles');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.dir, { recursive: true });
    this.initialized = true;
    this.logger.info('Ensemble repository initialized');
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }

  private async loadAll(): Promise<void> {
    if (this.cacheLoaded) return;
    try {
      const files = await fs.readdir(this.dir);
      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          const data = await fs.readFile(path.join(this.dir, file), 'utf-8');
          const ensemble = JSON.parse(data) as Ensemble;
          this.cache.set(ensemble.id, ensemble);
        } catch (err) {
          this.logger.warn(`Failed to load ensemble file: ${file}`, {
            error: (err as Error).message,
          });
        }
      }
    } catch {
      // dir may not exist yet
    }
    this.cacheLoaded = true;
  }

  async findAll(): Promise<Ensemble[]> {
    await this.ensureInitialized();
    await this.loadAll();
    return [...this.cache.values()];
  }

  async findById(id: string): Promise<Ensemble | null> {
    await this.ensureInitialized();
    const cached = this.cache.get(id);
    if (cached) return cached;
    try {
      const data = await fs.readFile(path.join(this.dir, `${id}.json`), 'utf-8');
      const ensemble = JSON.parse(data) as Ensemble;
      this.cache.set(id, ensemble);
      return ensemble;
    } catch {
      return null;
    }
  }

  async findByMemberSessionId(sessionId: string): Promise<Ensemble[]> {
    const all = await this.findAll();
    return all.filter(e => !e.disbandedAt && e.memberSessionIds.includes(sessionId));
  }

  async create(ensemble: Ensemble): Promise<Ensemble> {
    await this.ensureInitialized();
    await atomicWriteFile(path.join(this.dir, `${ensemble.id}.json`), JSON.stringify(ensemble));
    this.cache.set(ensemble.id, ensemble);
    this.logger.debug(`Created ensemble: ${ensemble.id}`);
    return ensemble;
  }

  async update(id: string, data: Partial<Ensemble>): Promise<Ensemble> {
    await this.ensureInitialized();
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Ensemble', id);
    const updated: Ensemble = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    await atomicWriteFile(path.join(this.dir, `${id}.json`), JSON.stringify(updated));
    this.cache.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    try {
      await fs.unlink(path.join(this.dir, `${id}.json`));
    } catch {
      // already gone
    }
    this.cache.delete(id);
  }
}
