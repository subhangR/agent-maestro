import * as fs from 'fs/promises';
import * as path from 'path';
import { Spell } from '../../types';
import { ISpellRepository } from '../../domain/repositories/ISpellRepository';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError, ValidationError } from '../../domain/common/Errors';
import { atomicWriteFile } from './utils/atomicWrite';

/**
 * Curated SPELL_LIBRARY (v2 — designed in docs/spell-library.md). Multi-rule seeds
 * merged into findAll/findById at read time; user-created spells live in
 * data/spells/*.json alongside. isDefault: true makes them non-deletable
 * (see SpellService.deleteSpell), mirroring the 'default_' guard pattern.
 *
 * Safety invariants (enforced by test/spell-library-seeds.test.ts):
 *  - every seed's rules[] pass the real Zod createSpellSchema;
 *  - every `run-command` rule ships `enabled: false` (a fresh install never fires a
 *    command that may not exist — the user wires a real command, then enables it);
 *  - run-command defaults are self-describing (a harmless `echo` placeholder, or a
 *    genuinely universal `npx tsc --noEmit`) — never a hardcoded project script;
 *  - notify-channel is in-app only (no `channel` field — dropped in C3);
 *  - every rule's action is legal for its hook event per ACTIONS_BY_EVENT.
 *
 * NOTE (matcher semantics): for Pre/PostToolUse the dispatcher matches against the
 * TOOL NAME (payload.tool_name), not the file path — so `Edit|Write` fires on the
 * Edit/Write tools; you cannot narrow by file extension here.
 */

// Self-describing placeholder for run-command seeds that ship disabled: a harmless
// `echo` whose args tell the user exactly what to replace it with. Enabling it
// un-edited just feeds the instruction back — never assumes a project's toolchain.
const runCommandPlaceholder = (instruction: string) => ({
  type: 'run-command' as const,
  command: 'echo',
  args: [`[maestro spell] ${instruction}`],
  feedOutput: true,
});

export const SPELL_LIBRARY: Spell[] = [
  {
    id: 'spell_self_critic',
    name: 'Self-Critic',
    description: 'On each stop, loop back for a critique-and-refine pass against the stated goal — bounded, then stop.',
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
    description: 'Turn a stop into "write a concrete, checkable plan, then loop back and execute against it".',
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
    id: 'spell_focus_keeper',
    name: 'Focus-Keeper',
    description: 'Keep the agent working toward completion instead of stopping early — bounded at 5 continuations.',
    icon: '🎯',
    color: 'indigo',
    rules: [
      {
        id: 'rule_focus_keeper_stop',
        label: 'Continue until done',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'Stop' },
        action: { type: 'continue-loop', loopType: 'continue-until-done', maxIterations: 5 },
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
    id: 'spell_no_secrets',
    name: 'No-Secrets Guard',
    description: 'Before an Edit/Write, remind the agent never to commit secrets, keys, tokens, or credentials.',
    icon: '🔑',
    color: 'rose',
    rules: [
      {
        id: 'rule_no_secrets_pre',
        label: 'Secrets reminder before edits',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'PreToolUse', matcher: 'Edit|Write' },
        action: {
          type: 'feed-context',
          prompt: 'Reminder: never write secrets, API keys, tokens, or credentials into source or committed files. Use environment variables or a secrets manager, and keep secrets out of version control.',
        },
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_conventional_commits',
    name: 'Conventional Commits',
    description: 'On stop, nudge a clean Conventional-Commits message — only if a commit is actually being made.',
    icon: '📝',
    color: 'emerald',
    rules: [
      {
        id: 'rule_conventional_commits_stop',
        label: 'Commit-message nudge',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'Stop' },
        action: {
          type: 'inject-prompt',
          prompt: 'If (and only if) you are about to commit, use a Conventional-Commits message: `type(scope): summary` in imperative mood, with a body explaining why (not just what). Do not commit unless the user asked you to.',
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
    description: 'Show an in-app notification when the session finishes a turn.',
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
    id: 'spell_session_recap',
    name: 'Session Recap',
    description: 'On session end, surface an in-app recap notification; optionally write a recap doc (wire it up first).',
    icon: '📓',
    color: 'lime',
    rules: [
      {
        id: 'rule_session_recap_notify',
        label: 'Recap notification',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'SessionEnd' },
        action: { type: 'notify-channel', message: 'Session ended — capture a short recap of what changed and what is left.' },
      },
      {
        id: 'rule_session_recap_write',
        label: 'Write recap doc',
        // run-command ships disabled — wire it to your own summary command first.
        enabled: false,
        trigger: { type: 'hook', hookEvent: 'SessionEnd' },
        action: runCommandPlaceholder('Configure this rule to write a session recap (e.g. your own summary script), then enable it.'),
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_type_safety',
    name: 'Type-Safety Sentinel',
    description: 'After a file edit, run a project-wide `tsc --noEmit` typecheck and feed failures back. TypeScript projects only; enable to use.',
    icon: '🛡️',
    color: 'sky',
    rules: [
      {
        id: 'rule_type_safety_post',
        label: 'Typecheck after edit',
        // run-command ships disabled — assumes a TS project with tsc resolvable via npx.
        enabled: false,
        trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' },
        action: { type: 'run-command', command: 'npx', args: ['tsc', '--noEmit'], feedOutput: true },
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_test_after_edit',
    name: 'Test-After-Edit',
    description: 'After a file edit, run your test command and feed the output back. Wire it to your test runner, then enable.',
    icon: '🧪',
    color: 'emerald',
    rules: [
      {
        id: 'rule_test_after_edit_post',
        label: 'Test after edit',
        enabled: false,
        trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' },
        action: runCommandPlaceholder('Replace with your test command (e.g. npm test, pytest, go test ./..., bun test), then enable it.'),
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_lint_on_edit',
    name: 'Lint-on-Edit',
    description: 'Run your linter after each file edit and feed errors back. Point it at your lint command, then enable it.',
    icon: '✨',
    color: 'lime',
    rules: [
      {
        id: 'rule_lint_on_edit_post',
        label: 'Lint after edit',
        enabled: false,
        trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' },
        action: runCommandPlaceholder('Replace with your lint command (e.g. npm run lint), then enable it.'),
      },
    ],
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'spell_guardrail_combo',
    name: 'Guardrail Combo',
    description: 'Multi-rule demo: lint after edits (disabled until wired) plus an in-app notification when the session stops.',
    icon: '🧱',
    color: 'indigo',
    rules: [
      {
        id: 'rule_guardrail_lint',
        label: 'Lint after edit',
        enabled: false,
        trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' },
        action: runCommandPlaceholder('Replace with your lint command (e.g. npm run lint), then enable it.'),
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

  /**
   * C3: strip the dropped `channel` field from any persisted notify-channel
   * action on load, so legacy spell files parse clean against the v2 schema
   * without a migration file. Idempotent and cheap; runs on every disk read.
   */
  private normalizeSpell(spell: Spell): Spell {
    if (!Array.isArray(spell.rules)) return spell;
    let changed = false;
    const rules = spell.rules.map((rule) => {
      const action = rule.action as any;
      if (action && action.type === 'notify-channel' && 'channel' in action) {
        const { channel, ...rest } = action;
        changed = true;
        return { ...rule, action: rest };
      }
      return rule;
    });
    return changed ? { ...spell, rules } : spell;
  }

  private async loadAll(): Promise<void> {
    if (this.cacheLoaded) return;

    try {
      const files = await fs.readdir(this.spellsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const data = await fs.readFile(path.join(this.spellsDir, file), 'utf-8');
          const spell = this.normalizeSpell(JSON.parse(data) as Spell);
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
      const spell = this.normalizeSpell(JSON.parse(data) as Spell);
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
