import * as fs from 'fs/promises';
import * as path from 'path';
import { Spell } from '../../types';
import { ISpellRepository } from '../../domain/repositories/ISpellRepository';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError, ValidationError } from '../../domain/common/Errors';
import { atomicWriteFile } from './utils/atomicWrite';

/**
 * Curated SPELL_LIBRARY — 9 seeded spells (DESIGN_BRIEF.md). These are merged
 * into the findAll/findById results at read time; user-created spells live in
 * data/spells/*.json alongside. isDefault: true makes them non-deletable
 * (see SpellService.deleteSpell), mirroring the 'default_' guard pattern.
 */
export const SPELL_LIBRARY: Spell[] = [
  {
    id: 'spell_guardian',
    name: 'Guardian',
    description: 'Gate dangerous commands (rm -rf, force push, etc.) before execution.',
    icon: '🛡️',
    color: 'rose',
    action: 'gate',
    loopType: 'single-shot',
    trigger: { hookEvent: 'PreToolUse', matcher: 'Bash', enabled: true },
    failMode: 'closed',
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_test_sentinel',
    name: 'Test Sentinel',
    description: 'Run the test suite after each edit and surface failures inline.',
    icon: '🧪',
    color: 'emerald',
    action: 'run-command',
    loopType: 'single-shot',
    trigger: { hookEvent: 'PostToolUse', matcher: 'Edit|Write', enabled: true },
    failMode: 'open',
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_self_critic',
    name: 'Self-Critic',
    description: 'Loop a critique-and-refine pass until the work meets quality bar.',
    icon: '🪞',
    color: 'violet',
    action: 'continue-loop',
    loopType: 'critic-refine',
    trigger: { hookEvent: 'Stop', enabled: true },
    failMode: 'open',
    maxIterations: 3,
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_plan_first',
    name: 'Plan-First',
    description: 'Force a plan-execute loop: write the plan, then execute against it.',
    icon: '🗺️',
    color: 'sky',
    action: 'continue-loop',
    loopType: 'plan-execute',
    // continue-loop is only meaningful on Stop / SubagentStop — exit 2 means
    // "keep going" there. On UserPromptSubmit the same exit code BLOCKS the
    // user's prompt, so bind plan-execute to Stop like spell_self_critic.
    trigger: { hookEvent: 'Stop', enabled: true },
    failMode: 'open',
    maxIterations: 2,
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_progress_pulse',
    name: 'Progress Pulse',
    description: 'Inject a "report progress" nudge at regular intervals.',
    icon: '📡',
    color: 'cyan',
    action: 'inject-prompt',
    loopType: 'single-shot',
    trigger: { hookEvent: 'Notification', enabled: true },
    failMode: 'open',
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_context_primer',
    name: 'Context Primer',
    description: 'Feed relevant docs and task context at session start.',
    icon: '📚',
    color: 'amber',
    action: 'feed-context',
    loopType: 'single-shot',
    trigger: { hookEvent: 'SessionStart', enabled: true },
    failMode: 'open',
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_lint_on_edit',
    name: 'Lint-on-Edit',
    description: 'Run the linter after each file edit and feed errors back.',
    icon: '✨',
    color: 'lime',
    action: 'run-command',
    loopType: 'single-shot',
    trigger: { hookEvent: 'PostToolUse', matcher: 'Edit|Write', enabled: true },
    failMode: 'open',
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_notify_on_done',
    name: 'Notify-on-Done',
    description: 'Send a notification to the configured channel when the session stops.',
    icon: '🔔',
    color: 'fuchsia',
    action: 'notify-channel',
    loopType: 'single-shot',
    trigger: { hookEvent: 'Stop', enabled: true },
    failMode: 'open',
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_scope_keeper',
    name: 'Scope Keeper',
    description: 'Gate file edits outside the task\'s declared scope.',
    icon: '🎯',
    color: 'indigo',
    action: 'gate',
    loopType: 'single-shot',
    trigger: { hookEvent: 'PreToolUse', matcher: 'Edit|Write', enabled: true },
    failMode: 'closed',
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
];

const SEED_IDS = new Set(SPELL_LIBRARY.map(s => s.id));

export class FileSystemSpellRepository implements ISpellRepository {
  private spellsDir: string;
  private initialized: boolean = false;
  private cache: Map<string, Spell> = new Map();
  private cacheLoaded: boolean = false;

  constructor(
    private dataDir: string,
    private idGenerator: IIdGenerator,
    private logger: ILogger,
  ) {
    this.spellsDir = path.join(dataDir, 'spells');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await fs.mkdir(this.spellsDir, { recursive: true });
      this.logger.info('Spell repository initialized');
      this.initialized = true;
    } catch (err) {
      this.logger.error('Failed to initialize spell repository:', err as Error);
      throw err;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }

  private async loadAll(): Promise<void> {
    if (this.cacheLoaded) return;

    try {
      const files = await fs.readdir(this.spellsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const data = await fs.readFile(path.join(this.spellsDir, file), 'utf-8');
          const spell = JSON.parse(data) as Spell;
          this.cache.set(spell.id, spell);
        } catch (err) {
          this.logger.warn(`Failed to load spell file: ${file}`, {
            error: (err as Error).message,
          });
        }
      }
    } catch (err) {
      // Directory may not exist yet
    }

    this.cacheLoaded = true;
  }

  /**
   * Merge curated SPELL_LIBRARY (seeds) with user-created spells from disk.
   * User-created spells with the same id take precedence (allows overriding
   * a seed's color/trigger without forking the code).
   */
  private mergeWithLibrary(): Spell[] {
    const merged: Spell[] = [];
    const seenIds = new Set<string>();
    for (const spell of this.cache.values()) {
      merged.push(spell);
      seenIds.add(spell.id);
    }
    for (const seed of SPELL_LIBRARY) {
      if (!seenIds.has(seed.id)) merged.push(seed);
    }
    return merged;
  }

  async findAll(): Promise<Spell[]> {
    await this.ensureInitialized();
    await this.loadAll();
    return this.mergeWithLibrary();
  }

  async findById(id: string): Promise<Spell | null> {
    await this.ensureInitialized();

    const cached = this.cache.get(id);
    if (cached) return cached;

    try {
      const filePath = path.join(this.spellsDir, `${id}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const spell = JSON.parse(data) as Spell;
      this.cache.set(spell.id, spell);
      return spell;
    } catch {
      // Fall through to seed lookup
    }

    const seed = SPELL_LIBRARY.find(s => s.id === id);
    return seed ?? null;
  }

  async create(spell: Spell): Promise<Spell> {
    await this.ensureInitialized();

    const filePath = path.join(this.spellsDir, `${spell.id}.json`);
    await atomicWriteFile(filePath, JSON.stringify(spell));

    this.cache.set(spell.id, spell);
    this.logger.debug(`Created spell: ${spell.id}`);
    return spell;
  }

  async update(id: string, data: Partial<Spell>): Promise<Spell> {
    await this.ensureInitialized();

    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Spell', id);

    const updated: Spell = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
      // Preserve isDefault flag on seed spells; user copies cannot promote themselves.
      isDefault: existing.isDefault,
    };

    const filePath = path.join(this.spellsDir, `${id}.json`);
    await atomicWriteFile(filePath, JSON.stringify(updated));

    this.cache.set(id, updated);
    this.logger.debug(`Updated spell: ${id}`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();

    // Guard: seed-library spells (isDefault) are protected from deletion,
    // mirroring the 'default_' guard pattern in SpellService.deleteCustomPrompt.
    if (SEED_IDS.has(id)) {
      throw new ValidationError('Cannot delete default library spells');
    }

    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Spell', id);
    if (existing.isDefault) {
      throw new ValidationError('Cannot delete default library spells');
    }

    const filePath = path.join(this.spellsDir, `${id}.json`);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // Seeds may not have a disk file; that's fine since the guard above caught them.
    }

    this.cache.delete(id);
    this.logger.debug(`Deleted spell: ${id}`);
  }
}
