import * as fs from 'fs/promises';
import * as path from 'path';
import { Spell } from '../../types';
import { ISpellRepository } from '../../domain/repositories/ISpellRepository';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError, ValidationError } from '../../domain/common/Errors';
import { atomicWriteFile } from './utils/atomicWrite';

/**
 * Curated SPELL_LIBRARY (v2 — §11.10). Fewer, higher-confidence multi-rule seeds.
 * Merged into findAll/findById at read time; user-created spells live in
 * data/spells/*.json alongside. isDefault: true makes them non-deletable
 * (see SpellService.deleteSpell), mirroring the 'default_' guard pattern.
 *
 * Every run-command rule ships `enabled: false` so a fresh install never fires a
 * command that may not exist; the user opts in after pointing it at a real script.
 * A seed-contract test runs each seed's rules through the real Zod schema.
 */
export const SPELL_LIBRARY: Spell[] = [
  {
    id: 'spell_self_critic',
    name: 'Self-Critic',
    description: 'Loop a critique-and-refine pass until the work meets the quality bar.',
    icon: '🪞',
    color: 'violet',
    rules: [
      {
        id: 'rule_self_critic_stop',
        label: 'Critique on stop',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'Stop' },
        action: { type: 'continue-loop', loopType: 'critic-refine', maxIterations: 3 },
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_plan_first',
    name: 'Plan-First',
    description: 'Write the plan, then loop back to execute against it.',
    icon: '🗺️',
    color: 'sky',
    rules: [
      {
        id: 'rule_plan_first_stop',
        label: 'Execute the plan',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'Stop' },
        action: { type: 'continue-loop', loopType: 'plan-execute', maxIterations: 2 },
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_progress_pulse',
    name: 'Progress Pulse',
    description: 'Nudge the agent to report progress when it goes idle.',
    icon: '📡',
    color: 'cyan',
    rules: [
      {
        id: 'rule_progress_pulse_notify',
        label: 'Report progress',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'Notification' },
        action: {
          type: 'inject-prompt',
          prompt: 'Briefly report your current progress: what you just did, what is next, and any blockers.',
        },
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_context_primer',
    name: 'Context Primer',
    description: 'Feed a working-context primer at session start.',
    icon: '📚',
    color: 'amber',
    rules: [
      {
        id: 'rule_context_primer_start',
        label: 'Prime context',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'SessionStart' },
        action: {
          type: 'feed-context',
          prompt: 'Before starting, review your assigned tasks and any attached docs. Confirm the goal and constraints, then proceed.',
        },
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_notify_on_done',
    name: 'Notify-on-Done',
    description: 'Send a notification when the session stops.',
    icon: '🔔',
    color: 'fuchsia',
    rules: [
      {
        id: 'rule_notify_on_done_stop',
        label: 'Notify on stop',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'Stop' },
        action: { type: 'notify-channel', message: 'Session finished a turn.' },
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_lint_on_edit',
    name: 'Lint-on-Edit',
    description: 'Run the linter after each file edit and feed errors back. Point it at your project\'s lint script, then enable it.',
    icon: '✨',
    color: 'lime',
    rules: [
      {
        id: 'rule_lint_on_edit_post',
        label: 'Lint after edit',
        // run-command seeds ship disabled — the user wires a real command first.
        enabled: false,
        trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' },
        action: { type: 'run-command', command: 'npm', args: ['run', 'lint'], feedOutput: true },
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_guardrail_combo',
    name: 'Guardrail Combo',
    description: 'Multi-rule demo: lint after edits (disabled until wired) plus a notification when the session stops.',
    icon: '🧱',
    color: 'indigo',
    rules: [
      {
        id: 'rule_guardrail_lint',
        label: 'Lint after edit',
        enabled: false,
        trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' },
        action: { type: 'run-command', command: 'npm', args: ['run', 'lint'], feedOutput: true },
      },
      {
        id: 'rule_guardrail_notify',
        label: 'Notify on stop',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'Stop' },
        action: { type: 'notify-channel', message: 'Session finished a turn.' },
      },
    ],
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
