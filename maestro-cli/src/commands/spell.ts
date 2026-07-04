import { Command } from 'commander';
import { readFileSync } from 'fs';
import { api } from '../api.js';
import { config } from '../config.js';
import { resolveProjectScope } from '../utils/project-scope.js';
import { outputJSON, outputTable, outputKeyValue } from '../utils/formatter.js';
import { handleError } from '../utils/errors.js';
import { guardCommand } from '../services/command-permissions.js';
import type {
  SpellEntityResponse,
  SpellDefinitionResponse,
  SpellInvokeResponse,
  SpellCustomPromptResponse,
  SpellEntityType,
  SpellResponse,
  SpellRuleInput,
  CreateSpellPayload,
  UpdateSpellPayload,
  SpellActivateResponse,
  SpellDeactivateResponse,
  SpellResetLoopResponse,
  SpellColorSlug,
  SessionWithActiveSpellsResponse,
} from '../types/api-responses.js';
import ora from 'ora';

const ALL_ENTITY_TYPES: SpellEntityType[] = ['maestro', 'skill', 'team-member', 'task', 'doc', 'session', 'custom-prompt'];

const SPELL_COLORS: SpellColorSlug[] = ['amber', 'rose', 'violet', 'sky', 'emerald', 'fuchsia', 'lime', 'cyan', 'indigo'];
const DEFAULT_SPELL_COLOR: SpellColorSlug = 'violet';

/** Split a comma-separated --targets value into trimmed non-empty ids. */
function parseTargets(targets?: string, single?: string): string[] {
  const ids: string[] = [];
  if (targets) {
    for (const id of String(targets).split(',')) {
      const trimmed = id.trim();
      if (trimmed) ids.push(trimmed);
    }
  }
  if (single) ids.push(single);
  return ids;
}

/** Read + parse a JSON file, throwing a friendly error on failure. */
function readJsonFile<T>(path: string): T {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read file "${path}": ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`File "${path}" is not valid JSON`);
  }
}

/** Collect repeatable --rule <json> flags into an array (commander reducer). */
function collectRule(value: string, acc: SpellRuleInput[]): SpellRuleInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Invalid --rule JSON: ${value}`);
  }
  acc.push(parsed as SpellRuleInput);
  return acc;
}

/** Render a spell's rules to stdout in a human-readable, expanded form. */
function printSpellRules(spell: SpellResponse): void {
  outputKeyValue('ID', spell.id);
  outputKeyValue('Name', spell.name);
  outputKeyValue('Color', spell.color);
  if (spell.icon) outputKeyValue('Icon', spell.icon);
  outputKeyValue('Kind', spell.isDefault ? 'seed' : 'custom');
  if (spell.description) outputKeyValue('Description', spell.description);
  outputKeyValue('Rules', String(spell.rules?.length ?? 0));
  for (const rule of spell.rules ?? []) {
    const trig = rule.trigger.type === 'hook'
      ? `hook:${rule.trigger.hookEvent}${rule.trigger.matcher ? ` /${rule.trigger.matcher}/` : ''}`
      : `schedule:${JSON.stringify(rule.trigger)}`;
    console.log(`\n  • ${rule.label || rule.id}  [${rule.enabled ? 'enabled' : 'disabled'}]`);
    console.log(`    id: ${rule.id}`);
    console.log(`    trigger: ${trig}`);
    console.log(`    action: ${JSON.stringify(rule.action)}`);
  }
}

function groupByType(entities: SpellEntityResponse[]): Record<string, SpellEntityResponse[]> {
  const grouped: Record<string, SpellEntityResponse[]> = {};
  for (const entity of entities) {
    const type = entity.entityType;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(entity);
  }
  return grouped;
}

export function registerSpellCommands(program: Command): void {
  const spell = program.command('spell').description('Manage and invoke spells');

  // maestro spell entities [--type <entityType>] [--project <projectId>]
  spell.command('entities')
    .description('List available spell entities')
    .option('--type <entityType>', 'Filter by entity type (skill, team-member, task, doc, session, custom-prompt)')
    .action(async (cmdOpts) => {
      await guardCommand('spell:entities');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const projectId = globalOpts.project || config.projectId;
      const spinner = !isJson ? ora('Fetching spell entities...').start() : null;

      try {
        const types = cmdOpts.type ? [cmdOpts.type as SpellEntityType] : ALL_ENTITY_TYPES;
        const allEntities: SpellEntityResponse[] = [];

        const results = await Promise.allSettled(
          types.map(type => {
            let endpoint = `/api/spells/entities/${type}`;
            if (projectId) endpoint += `?projectId=${projectId}`;
            return api.get<SpellEntityResponse[]>(endpoint);
          }),
        );
        for (const result of results) {
          if (result.status === 'fulfilled') {
            allEntities.push(...result.value);
          }
        }

        spinner?.stop();

        if (isJson) {
          outputJSON(allEntities);
        } else {
          if (allEntities.length === 0) {
            console.log('No spell entities found.');
          } else {
            const grouped = groupByType(allEntities);
            for (const [type, items] of Object.entries(grouped)) {
              console.log(`\n${type}:`);
              outputTable(
                ['ID', 'Name', 'Spells'],
                items.map(e => [
                  e.entityId,
                  e.name,
                  e.spells.map(s => s.name || 'default').join(', '),
                ]),
              );
            }
          }
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell list [entityId] [--type <entityType>] [--project-id <id>] [--all-projects]
  spell.command('list [entityId]')
    .description('List spells for an entity, or all available spells')
    .option('--type <entityType>', 'Filter by entity type')
    .option('--project-id <id>', 'Filter by project ID (overrides global --project)')
    .option('--all-projects', 'List spells from all projects')
    .action(async (entityId, cmdOpts) => {
      await guardCommand('spell:list');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const scope = resolveProjectScope(
        { projectId: cmdOpts.projectId, allProjects: cmdOpts.allProjects },
        globalOpts,
      );
      const spinner = !isJson ? ora('Fetching spells...').start() : null;

      try {
        let endpoint = '/api/spells/definitions';
        const queryParts: string[] = [];
        if (cmdOpts.type) queryParts.push(`entityType=${cmdOpts.type}`);
        if (scope.projectId) queryParts.push(`projectId=${scope.projectId}`);
        if (queryParts.length) endpoint += '?' + queryParts.join('&');

        let spells = await api.get<SpellDefinitionResponse[]>(endpoint);

        // Filter by entityId client-side if specified
        if (entityId) {
          spells = spells.filter(s => s.entityId === entityId);
        }
        spinner?.stop();

        if (isJson) {
          outputJSON(spells);
        } else {
          if (spells.length === 0) {
            console.log('No spells found.');
          } else {
            outputTable(
              ['Entity', 'Spell', 'Description'],
              spells.map(s => [
                s.entityName || s.entityId,
                s.name || '(default)',
                s.description || '',
              ]),
            );
          }
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell invoke <entityId> [spellName] --type <entityType> --targets <ids> [--args <json>]
  spell.command('invoke <entityId> [spellName]')
    .description('Invoke a spell on one or more target sessions')
    .requiredOption('--type <entityType>', 'Entity type (maestro|skill|team-member|task|doc|session|custom-prompt)')
    .option('--target <sessionId>', 'Single target session (alias for --targets with one id)')
    .option('--targets <sessionIds>', 'Comma-separated target session ids')
    .option('--project-id <id>', 'Project ID (overrides global --project / MAESTRO_PROJECT_ID)')
    .option('--args <json>', 'Additional arguments as JSON string')
    .action(async (entityId, spellName, cmdOpts) => {
      await guardCommand('spell:invoke');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const invokerSessionId = config.sessionId;
      const projectId = cmdOpts.projectId || globalOpts.project || config.projectId;
      const spinner = !isJson ? ora('Invoking spell...').start() : null;

      try {
        if (!projectId) {
          throw new Error('projectId is required (pass --project-id, --project, or set MAESTRO_PROJECT_ID)');
        }

        const targetSessionIds: string[] = [];
        if (cmdOpts.targets) {
          for (const id of String(cmdOpts.targets).split(',')) {
            const trimmed = id.trim();
            if (trimmed) targetSessionIds.push(trimmed);
          }
        }
        if (cmdOpts.target) targetSessionIds.push(cmdOpts.target);
        if (targetSessionIds.length === 0) {
          throw new Error('Provide --target <sessionId> or --targets <a,b,c>');
        }

        // Server schema accepts either targetSessionId (single) or targetSessionIds[] (multi).
        const body: Record<string, unknown> = {
          entityType: cmdOpts.type as SpellEntityType,
          entityId,
          projectId,
          spellName: spellName || null,
          targetSessionId: targetSessionIds[0],
          ...(targetSessionIds.length > 1 ? { targetSessionIds } : {}),
          ...(invokerSessionId ? { invokerSessionId } : {}),
        };

        if (cmdOpts.args) {
          try {
            body.args = JSON.parse(cmdOpts.args);
          } catch {
            throw new Error('Invalid --args JSON. Provide valid JSON string.');
          }
        }

        const result = await api.post<SpellInvokeResponse>('/api/spells/invoke', body);
        spinner?.succeed('Spell invoked');

        if (isJson) {
          outputJSON(result);
        } else {
          outputKeyValue('Entity', result.entityName || entityId);
          outputKeyValue('Spell', result.spellName || '(default)');
          outputKeyValue('Targets', targetSessionIds.join(', '));
          outputKeyValue('Status', result.status);
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // ──────────────────────────────────────────────────────────────────────────
  // Multi-rule spells (Mechanism A) — authoring, activation, loop control.
  // These drive the new Spell model over the /api/spells REST surface.
  // ──────────────────────────────────────────────────────────────────────────

  // maestro spell library — list real multi-rule spells (seeds + custom)
  spell.command('library')
    .description('List all multi-rule spells (seeds + custom)')
    .action(async () => {
      await guardCommand('spell:library');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const spinner = !isJson ? ora('Fetching spell library...').start() : null;

      try {
        const spells = await api.get<SpellResponse[]>('/api/spells');
        spinner?.stop();

        if (isJson) {
          outputJSON(spells);
        } else if (spells.length === 0) {
          console.log('No spells found.');
        } else {
          outputTable(
            ['ID', 'Name', 'Color', 'Rules', 'Kind'],
            spells.map(s => [
              s.id,
              s.name,
              s.color,
              String(s.rules?.length ?? 0),
              s.isDefault ? 'seed' : 'custom',
            ]),
          );
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell show <id> — GET /api/spells/:id (rules expanded)
  spell.command('show <id>')
    .description('Show a multi-rule spell with its rules expanded')
    .action(async (id) => {
      await guardCommand('spell:show');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const spinner = !isJson ? ora('Fetching spell...').start() : null;

      try {
        const spell = await api.get<SpellResponse>(`/api/spells/${id}`);
        spinner?.stop();

        if (isJson) {
          outputJSON(spell);
        } else {
          printSpellRules(spell);
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell create [--file <json>] [--name --description --color --icon --rule <json>...]
  // Authors a multi-rule spell (CreateSpellPayload) → POST /api/spells.
  spell.command('create')
    .description('Create a multi-rule spell from a JSON file and/or flags')
    .option('--file <path>', 'Path to a CreateSpellPayload JSON file ({name,description,color,icon?,rules[]})')
    .option('--name <name>', 'Spell name (overrides file)')
    .option('--description <text>', 'Spell description (overrides file)')
    .option('--color <color>', `Spell color slug (${SPELL_COLORS.join('|')})`)
    .option('--icon <icon>', 'Spell icon (emoji/short string, overrides file)')
    .option('--rule <json>', 'A SpellRuleInput JSON object; repeatable (appends to file rules)', collectRule, [])
    .action(async (cmdOpts) => {
      await guardCommand('spell:create');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const spinner = !isJson ? ora('Creating spell...').start() : null;

      try {
        const base: Partial<CreateSpellPayload> = cmdOpts.file
          ? readJsonFile<Partial<CreateSpellPayload>>(cmdOpts.file)
          : {};

        const rules: SpellRuleInput[] = [
          ...(base.rules ?? []),
          ...(cmdOpts.rule as SpellRuleInput[]),
        ];

        const color = (cmdOpts.color ?? base.color ?? DEFAULT_SPELL_COLOR) as SpellColorSlug;
        if (!SPELL_COLORS.includes(color)) {
          throw new Error(`Invalid --color "${color}". Use one of: ${SPELL_COLORS.join(', ')}`);
        }

        const payload: CreateSpellPayload = {
          name: cmdOpts.name ?? base.name,
          description: cmdOpts.description ?? base.description ?? '',
          color,
          ...(cmdOpts.icon ?? base.icon ? { icon: cmdOpts.icon ?? base.icon } : {}),
          rules,
        };

        if (!payload.name) throw new Error('Spell name is required (--name or "name" in --file)');
        if (!payload.rules.length) throw new Error('At least one rule is required (--rule or "rules" in --file)');

        const created = await api.post<SpellResponse>('/api/spells', payload as unknown as Record<string, unknown>);
        spinner?.succeed('Spell created');

        if (isJson) {
          outputJSON(created);
        } else {
          printSpellRules(created);
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell edit <id> [--file <json>] [--name --description --color --icon --rule <json>...]
  // PUT /api/spells/:id (UpdateSpellPayload; seeds rejected server-side).
  spell.command('edit <id>')
    .description('Update a multi-rule spell (PUT). Seeds are rejected by the server.')
    .option('--file <path>', 'Path to an UpdateSpellPayload JSON file')
    .option('--name <name>', 'New name')
    .option('--description <text>', 'New description')
    .option('--color <color>', `New color slug (${SPELL_COLORS.join('|')})`)
    .option('--icon <icon>', 'New icon')
    .option('--rule <json>', 'A SpellRuleInput JSON object; repeatable (appends to file rules)', collectRule, [])
    .action(async (id, cmdOpts) => {
      await guardCommand('spell:edit');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const spinner = !isJson ? ora('Updating spell...').start() : null;

      try {
        const base: Partial<UpdateSpellPayload> = cmdOpts.file
          ? readJsonFile<Partial<UpdateSpellPayload>>(cmdOpts.file)
          : {};

        const payload: UpdateSpellPayload = { ...base };
        if (cmdOpts.name !== undefined) payload.name = cmdOpts.name;
        if (cmdOpts.description !== undefined) payload.description = cmdOpts.description;
        if (cmdOpts.icon !== undefined) payload.icon = cmdOpts.icon;
        if (cmdOpts.color !== undefined) {
          if (!SPELL_COLORS.includes(cmdOpts.color)) {
            throw new Error(`Invalid --color "${cmdOpts.color}". Use one of: ${SPELL_COLORS.join(', ')}`);
          }
          payload.color = cmdOpts.color as SpellColorSlug;
        }
        const flagRules = cmdOpts.rule as SpellRuleInput[];
        const mergedRules = [...(base.rules ?? []), ...flagRules];
        if (mergedRules.length) payload.rules = mergedRules;

        if (Object.keys(payload).length === 0) {
          throw new Error('Nothing to update. Provide --file and/or --name/--description/--color/--icon/--rule.');
        }

        const updated = await api.put<SpellResponse>(`/api/spells/${id}`, payload as unknown as Record<string, unknown>);
        spinner?.succeed('Spell updated');

        if (isJson) {
          outputJSON(updated);
        } else {
          printSpellRules(updated);
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell remove <id> (alias: delete) — DELETE /api/spells/:id (seeds rejected)
  spell.command('remove <id>')
    .alias('delete')
    .description('Delete a multi-rule spell (DELETE). Seeds are rejected by the server.')
    .action(async (id) => {
      await guardCommand('spell:remove');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const spinner = !isJson ? ora('Deleting spell...').start() : null;

      try {
        await api.delete(`/api/spells/${id}`);
        spinner?.succeed('Spell deleted');
        if (isJson) outputJSON({ success: true, id });
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell activate <id> --targets <a,b> [--invoker <id>]
  spell.command('activate <id>')
    .description('Activate (cast) a multi-rule spell on target sessions')
    .option('--targets <sessionIds>', 'Comma-separated target session ids')
    .option('--target <sessionId>', 'Single target session (alias)')
    .option('--invoker <sessionId>', 'Invoker session id (defaults to MAESTRO_SESSION_ID)')
    .action(async (id, cmdOpts) => {
      await guardCommand('spell:activate');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const spinner = !isJson ? ora('Activating spell...').start() : null;

      try {
        const targetSessionIds = parseTargets(cmdOpts.targets, cmdOpts.target);
        if (targetSessionIds.length === 0) {
          throw new Error('Provide --targets <a,b,c> or --target <sessionId>');
        }
        const invokerSessionId = cmdOpts.invoker || config.sessionId || null;

        const result = await api.post<SpellActivateResponse>(`/api/spells/${id}/activate`, {
          targetSessionIds,
          invokerSessionId,
        });
        spinner?.succeed('Spell activated');

        if (isJson) {
          outputJSON(result);
        } else {
          outputKeyValue('Spell', `${result.spell.name} (${result.spell.id})`);
          outputKeyValue('Activated on', result.sessions.map(s => s.sessionId).join(', '));
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell deactivate <id> --targets <a,b>
  spell.command('deactivate <id>')
    .description('Deactivate a multi-rule spell on target sessions')
    .option('--targets <sessionIds>', 'Comma-separated target session ids')
    .option('--target <sessionId>', 'Single target session (alias)')
    .action(async (id, cmdOpts) => {
      await guardCommand('spell:deactivate');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const spinner = !isJson ? ora('Deactivating spell...').start() : null;

      try {
        const targetSessionIds = parseTargets(cmdOpts.targets, cmdOpts.target);
        if (targetSessionIds.length === 0) {
          throw new Error('Provide --targets <a,b,c> or --target <sessionId>');
        }

        const result = await api.post<SpellDeactivateResponse>(`/api/spells/${id}/deactivate`, {
          targetSessionIds,
        });
        spinner?.succeed('Spell deactivated');

        if (isJson) {
          outputJSON(result);
        } else {
          outputKeyValue('Spell', `${result.spell.name} (${result.spell.id})`);
          outputKeyValue('Deactivated on', result.sessionIds.join(', '));
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell active [--session <id>] — read Session.activeSpells
  spell.command('active')
    .description("List a session's active spells (spellId, enabled, ruleIterations)")
    .option('--session <sessionId>', 'Session id (defaults to MAESTRO_SESSION_ID)')
    .action(async (cmdOpts) => {
      await guardCommand('spell:active');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const sessionId = cmdOpts.session || config.sessionId;
      const spinner = !isJson ? ora('Fetching active spells...').start() : null;

      try {
        if (!sessionId) throw new Error('Provide --session <id> or set MAESTRO_SESSION_ID');
        const session = await api.get<SessionWithActiveSpellsResponse>(`/api/sessions/${sessionId}`);
        const active = session.activeSpells ?? [];
        spinner?.stop();

        if (isJson) {
          outputJSON(active);
        } else if (active.length === 0) {
          console.log(`No active spells on session ${sessionId}.`);
        } else {
          outputTable(
            ['Spell', 'Enabled', 'Color', 'Rule iterations'],
            active.map(a => [
              a.spellId,
              a.enabled ? 'yes' : 'no',
              a.color,
              Object.keys(a.ruleIterations ?? {}).length
                ? Object.entries(a.ruleIterations).map(([r, n]) => `${r}=${n}`).join(', ')
                : '—',
            ]),
          );
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell reset-loop <id> --session <id> [--rule <ruleId>]
  spell.command('reset-loop <id>')
    .description('Reset loop iteration counter(s) for an active spell on a session')
    .requiredOption('--session <sessionId>', 'Session the spell is active on')
    .option('--rule <ruleId>', 'Reset only this rule (omit to reset all rules)')
    .action(async (id, cmdOpts) => {
      await guardCommand('spell:reset-loop');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const spinner = !isJson ? ora('Resetting loop...').start() : null;

      try {
        const body: Record<string, unknown> = { sessionId: cmdOpts.session };
        if (cmdOpts.rule) body.ruleId = cmdOpts.rule;

        const result = await api.post<SpellResetLoopResponse>(`/api/spells/${id}/reset-loop`, body);
        spinner?.succeed('Loop reset');

        if (isJson) {
          outputJSON(result);
        } else {
          outputKeyValue('Spell', `${result.spell.name} (${result.spell.id})`);
          outputKeyValue('Session', result.sessionId);
          const iters = result.activeSpell.ruleIterations ?? {};
          outputKeyValue(
            'Rule iterations',
            Object.keys(iters).length
              ? Object.entries(iters).map(([r, n]) => `${r}=${n}`).join(', ')
              : '(all cleared)',
          );
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // ──────────────────────────────────────────────────────────────────────────
  // Custom prompt spells (Mechanism B authoring) — kept under a separate name
  // so `spell create` is unambiguously the multi-rule path.
  // ──────────────────────────────────────────────────────────────────────────

  // maestro spell prompt-create <name> --content <text> [--description <text>]
  // (Server schema field is `content`, not `prompt`.)
  spell.command('prompt-create <name>')
    .description('Create a custom prompt spell (Mechanism B one-shot cast template)')
    .requiredOption('--content <text>', 'The prompt content for this spell')
    .option('--description <text>', 'Description of what this spell does')
    .action(async (name, cmdOpts) => {
      await guardCommand('spell:prompt-create');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const spinner = !isJson ? ora('Creating custom prompt spell...').start() : null;

      try {
        const result = await api.post<SpellCustomPromptResponse>('/api/spells/custom-prompts', {
          name,
          content: cmdOpts.content,
          description: cmdOpts.description || '',
        });

        spinner?.succeed('Custom prompt spell created');

        if (isJson) {
          outputJSON(result);
        } else {
          outputKeyValue('ID', result.id);
          outputKeyValue('Name', result.name);
          outputKeyValue('Type', 'custom-prompt');
        }
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });

  // maestro spell prompt-delete <id> — DELETE /api/spells/custom-prompts/:id
  spell.command('prompt-delete <id>')
    .description('Delete a custom prompt spell')
    .action(async (id) => {
      await guardCommand('spell:prompt-delete');
      const globalOpts = program.opts();
      const isJson = globalOpts.json;
      const spinner = !isJson ? ora('Deleting custom prompt spell...').start() : null;

      try {
        await api.delete(`/api/spells/custom-prompts/${id}`);
        spinner?.succeed('Custom prompt spell deleted');
        if (isJson) outputJSON({ success: true, id });
      } catch (err) {
        spinner?.stop();
        handleError(err, isJson);
      }
    });
}
