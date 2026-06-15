import * as fs from 'fs/promises';
import * as path from 'path';
import { SessionPrompt } from '../../types';
import { ISessionPromptRepository } from '../../domain/repositories/ISessionPromptRepository';
import { ILogger } from '../../domain/common/ILogger';
import { atomicWriteFile } from './utils/atomicWrite';

/**
 * Workspace-global, cross-project session prompts stored flat at
 * <dataDir>/session-prompts/<id>.json. No defaults are seeded.
 */
export class FileSystemSessionPromptRepository implements ISessionPromptRepository {
  private promptsDir: string;
  private initialized = false;
  private cache: Map<string, SessionPrompt> = new Map();
  private cacheLoaded = false;

  constructor(
    private dataDir: string,
    private logger: ILogger
  ) {
    this.promptsDir = path.join(dataDir, 'session-prompts');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await fs.mkdir(this.promptsDir, { recursive: true });
      this.initialized = true;
      this.logger.info('Session prompt repository initialized');
    } catch (err) {
      this.logger.error('Failed to initialize session prompt repository:', err as Error);
      throw err;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }

  private async loadAll(): Promise<void> {
    if (this.cacheLoaded) return;
    try {
      const files = await fs.readdir(this.promptsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      for (const file of jsonFiles) {
        try {
          const data = await fs.readFile(path.join(this.promptsDir, file), 'utf-8');
          const prompt = JSON.parse(data) as SessionPrompt;
          this.cache.set(prompt.id, prompt);
        } catch (err) {
          this.logger.warn(`Failed to load session prompt file: ${file}`, {
            error: (err as Error).message,
          });
        }
      }
    } catch (err) {
      // Directory may not exist yet
    }
    this.cacheLoaded = true;
  }

  async create(prompt: SessionPrompt): Promise<SessionPrompt> {
    await this.ensureInitialized();

    const filePath = path.join(this.promptsDir, `${prompt.id}.json`);
    await atomicWriteFile(filePath, JSON.stringify(prompt));

    this.cache.set(prompt.id, prompt);
    this.logger.debug(`Recorded session prompt: ${prompt.id}`);
    return prompt;
  }

  async findAll(): Promise<SessionPrompt[]> {
    await this.ensureInitialized();
    await this.loadAll();
    return Array.from(this.cache.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  async findBySession(sessionId: string): Promise<SessionPrompt[]> {
    const all = await this.findAll();
    return all.filter((p) => p.fromSessionId === sessionId || p.toSessionId === sessionId);
  }

  async findById(id: string): Promise<SessionPrompt | null> {
    await this.ensureInitialized();

    const cached = this.cache.get(id);
    if (cached) return cached;

    try {
      const filePath = path.join(this.promptsDir, `${id}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const prompt = JSON.parse(data) as SessionPrompt;
      this.cache.set(prompt.id, prompt);
      return prompt;
    } catch (err) {
      return null;
    }
  }
}
