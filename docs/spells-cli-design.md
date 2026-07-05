> ## ⚠️ SUPERSEDED (2026-07-04)
> This document describes the **legacy spell-invocation model** (CLI casting of quick-action
> prompts). It does **not** describe the current spell system. The v2 multi-rule,
> hook-triggered spell system is authoritative in **`docs/spell-system-redesign.md` §11** and
> explained in **`docs/spell-system-explainer.md`** (CLI hook shim + `maestro spell` surface).
> Kept for historical context only.

# Spells Feature — CLI-Side Design

## 1. Overview

This document specifies the CLI-side architecture for the **Spells** feature in Maestro. Spells are quick-action prompts that inject constructed context into active sessions. From the CLI perspective, spells provide agents (both workers and coordinators) with the ability to:

1. **List** available spell entities and their spells
2. **Invoke** a spell on a target session (call server API → server constructs prompt → injects into target PTY)
3. **Create** custom prompt spell entities

Spells are **global** (not per-project scoped) and **purely runtime** — they do not require manifest integration. The server resolves spell entities dynamically from existing data (tasks, team members, sessions, skills, docs).

---

## 2. Spell Concepts Recap

| Concept | Description |
|---------|-------------|
| **Spell Entity Type** | Category: `skill`, `team-member`, `task`, `doc`, `session`, `custom-prompt` |
| **Spell Entity** | A specific instance (e.g., a particular task, a particular team member) |
| **Spell** | An action on an entity. Each entity has a **default spell** (void — returns entity details) plus **named spells** (e.g., task has `refer`, `execute`) |
| **Custom Prompt** | A spell entity of type `custom-prompt` whose default spell simply injects the raw prompt text |

---

## 3. Command Group Design

### 3.1 Registration Pattern

Following the existing `registerXXXCommands(program)` pattern used by all command groups:

```typescript
// maestro-cli/src/commands/spell.ts
import { Command } from 'commander';
import { api } from '../api.js';
import { config } from '../config.js';
import { outputJSON, outputTable, outputKeyValue } from '../utils/formatter.js';
import { handleError } from '../utils/errors.js';
import { guardCommand } from '../services/command-permissions.js';
import type {
  SpellEntityResponse,
  SpellDefinitionResponse,
  SpellInvokeResponse,
  SpellCustomPromptResponse,
} from '../types/api-responses.js';
import ora from 'ora';

export function registerSpellCommands(program: Command): void {
  const spell = program.command('spell').description('Manage and invoke spells');

  // ... subcommands registered below
}
```

Registered in `index.ts`:

```typescript
import { registerSpellCommands } from './commands/spell.js';
// ...
registerSpellCommands(program);
```

### 3.2 Subcommands

#### `maestro spell entities [--type <entityType>] [--project <projectId>]`

List available spell entities, optionally filtered by entity type.

```typescript
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
      let endpoint = '/api/spells/entities';
      const queryParts: string[] = [];
      if (cmdOpts.type) queryParts.push(`type=${cmdOpts.type}`);
      if (projectId) queryParts.push(`projectId=${projectId}`);
      if (queryParts.length) endpoint += '?' + queryParts.join('&');

      const entities = await api.get<SpellEntityResponse[]>(endpoint);
      spinner?.stop();

      if (isJson) {
        outputJSON(entities);
      } else {
        if (entities.length === 0) {
          console.log('No spell entities found.');
        } else {
          // Group by entity type for display
          const grouped = groupByType(entities);
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
```

#### `maestro spell list [entityId]`

List spells available for a specific entity, or all spells across all entities.

```typescript
spell.command('list [entityId]')
  .description('List spells for an entity, or all available spells')
  .option('--type <entityType>', 'Filter by entity type')
  .action(async (entityId, cmdOpts) => {
    await guardCommand('spell:list');
    const globalOpts = program.opts();
    const isJson = globalOpts.json;
    const projectId = globalOpts.project || config.projectId;
    const spinner = !isJson ? ora('Fetching spells...').start() : null;

    try {
      let endpoint: string;
      if (entityId) {
        endpoint = `/api/spells/entities/${entityId}/spells`;
      } else {
        endpoint = '/api/spells';
        const queryParts: string[] = [];
        if (cmdOpts.type) queryParts.push(`type=${cmdOpts.type}`);
        if (projectId) queryParts.push(`projectId=${projectId}`);
        if (queryParts.length) endpoint += '?' + queryParts.join('&');
      }

      const spells = await api.get<SpellDefinitionResponse[]>(endpoint);
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
```

#### `maestro spell invoke <entityId> [spellName] --target <sessionId>`

Invoke a spell. The server resolves the entity, constructs the prompt, and injects it into the target session. If `spellName` is omitted, the default (void) spell is used.

```typescript
spell.command('invoke <entityId> [spellName]')
  .description('Invoke a spell on a target session')
  .requiredOption('--target <sessionId>', 'Target session to receive the spell prompt')
  .option('--args <json>', 'Additional arguments as JSON string')
  .action(async (entityId, spellName, cmdOpts) => {
    await guardCommand('spell:invoke');
    const globalOpts = program.opts();
    const isJson = globalOpts.json;
    const sessionId = config.sessionId;
    const spinner = !isJson ? ora('Invoking spell...').start() : null;

    try {
      const body: Record<string, unknown> = {
        entityId,
        spellName: spellName || null,  // null = default spell
        targetSessionId: cmdOpts.target,
        invokerSessionId: sessionId || undefined,
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
        outputKeyValue('Target', cmdOpts.target);
        outputKeyValue('Status', result.status);
      }
    } catch (err) {
      spinner?.stop();
      handleError(err, isJson);
    }
  });
```

#### `maestro spell create <name> --prompt <text>`

Create a custom prompt spell entity. These are simple prompt-text entities with only a default spell.

```typescript
spell.command('create <name>')
  .description('Create a custom prompt spell')
  .requiredOption('--prompt <text>', 'The prompt text for this spell')
  .option('--description <text>', 'Description of what this spell does')
  .action(async (name, cmdOpts) => {
    await guardCommand('spell:create');
    const globalOpts = program.opts();
    const isJson = globalOpts.json;
    const spinner = !isJson ? ora('Creating custom spell...').start() : null;

    try {
      const result = await api.post<SpellCustomPromptResponse>('/api/spells/custom-prompts', {
        name,
        prompt: cmdOpts.prompt,
        description: cmdOpts.description || '',
      });

      spinner?.succeed('Custom spell created');

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
```

#### `maestro spell delete <entityId>`

Delete a custom prompt spell entity. Only custom-prompt entities can be deleted via CLI.

```typescript
spell.command('delete <entityId>')
  .description('Delete a custom prompt spell')
  .action(async (entityId) => {
    await guardCommand('spell:delete');
    const globalOpts = program.opts();
    const isJson = globalOpts.json;
    const spinner = !isJson ? ora('Deleting spell...').start() : null;

    try {
      await api.delete(`/api/spells/custom-prompts/${entityId}`);
      spinner?.succeed('Custom spell deleted');

      if (isJson) {
        outputJSON({ success: true, entityId });
      }
    } catch (err) {
      spinner?.stop();
      handleError(err, isJson);
    }
  });
```

---

## 4. Command Catalog Entries

Add to `maestro-cli/src/prompting/command-catalog.ts`:

```typescript
const ALL_MODES: AgentMode[] = ['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator'];

// Spell commands — available to ALL modes
{ id: 'spell:entities', description: 'List available spell entities', group: 'spell', allowedModes: ALL_MODES },
{ id: 'spell:list', description: 'List spells for entity or all', group: 'spell', allowedModes: ALL_MODES },
{ id: 'spell:invoke', description: 'Invoke a spell on a target session', group: 'spell', allowedModes: ALL_MODES },
{ id: 'spell:create', description: 'Create a custom prompt spell', group: 'spell', allowedModes: ALL_MODES },
{ id: 'spell:delete', description: 'Delete a custom prompt spell', group: 'spell', allowedModes: ALL_MODES },
```

Syntax map entries:

```typescript
'spell:entities': 'maestro spell entities [--type <entityType>] [--project <projectId>]',
'spell:list': 'maestro spell list [entityId] [--type <entityType>]',
'spell:invoke': 'maestro spell invoke <entityId> [spellName] --target <sessionId> [--args <json>]',
'spell:create': 'maestro spell create "<name>" --prompt "<text>" [--description "<text>"]',
'spell:delete': 'maestro spell delete <entityId>',
```

Group metadata entry:

```typescript
spell: { prefix: 'maestro spell', description: 'Spell management and invocation' },
```

---

## 5. Permission / Capability Mapping

### 5.1 Capability Flag

Add to `CapabilityFlags` in `capability-policy.ts`:

```typescript
export interface CapabilityFlags {
  // ... existing flags ...
  canUseSpells: boolean;
}
```

Derivation in `buildCapabilityFlags()`:

```typescript
canUseSpells: allowed.has('spell:invoke') || allowed.has('spell:list') || allowed.has('spell:entities'),
```

### 5.2 Mode Access

**All four modes** can use spells. Rationale:
- **Workers** invoke spells on themselves (e.g., "refer to task X") or request another session be given context
- **Coordinators** invoke spells on their worker sessions to inject context
- **Coordinated modes** inherit the same access

Spells are purely additive (inject prompts) — they don't modify state, so there's no security concern granting broad access.

### 5.3 guardCommand Integration

Each subcommand calls `await guardCommand('spell:...')` before executing, following the existing pattern. This ensures:
- Manifest-based permission control works for spell commands
- Team member command permission overrides (`commandPermissions.groups.spell = false`) can disable spells
- No special-case handling needed — the existing permission pipeline handles it

---

## 6. TypeScript Types

Add to `maestro-cli/src/types/api-responses.ts`:

```typescript
// ── Spell Types ──

export type SpellEntityType = 'skill' | 'team-member' | 'task' | 'doc' | 'session' | 'custom-prompt';

export interface SpellEntityResponse {
  /** Unique entity identifier (e.g., task ID, team member ID, or generated ID for custom prompts) */
  entityId: string;
  /** Entity type category */
  entityType: SpellEntityType;
  /** Human-readable name */
  name: string;
  /** Optional description */
  description?: string;
  /** Available spells for this entity */
  spells: SpellDefinitionResponse[];
}

export interface SpellDefinitionResponse {
  /** Spell name (null for default/void spell) */
  name: string | null;
  /** Human-readable description of what this spell does */
  description?: string;
  /** Entity this spell belongs to */
  entityId: string;
  /** Entity type */
  entityType: SpellEntityType;
  /** Entity display name */
  entityName?: string;
}

export interface SpellInvokeResponse {
  /** Whether the invocation was successful */
  status: 'sent' | 'failed';
  /** Entity ID that was invoked */
  entityId: string;
  /** Entity display name */
  entityName?: string;
  /** Spell name that was invoked (null for default) */
  spellName: string | null;
  /** Target session ID */
  targetSessionId: string;
  /** Error message if status is 'failed' */
  error?: string;
}

export interface SpellCustomPromptResponse {
  /** Generated entity ID */
  id: string;
  /** Display name */
  name: string;
  /** The prompt text */
  prompt: string;
  /** Optional description */
  description?: string;
  /** Created timestamp */
  createdAt: string;
}
```

---

## 7. Manifest Integration Decision

**Spells do NOT need manifest integration.** Rationale:

1. **Runtime-resolved**: Spell entities are derived from existing server data (tasks, team members, etc.) — there is nothing to embed in the manifest at spawn time
2. **Global scope**: Spells are not per-project scoped, so the manifest (which is per-session/per-task) is the wrong place
3. **Permission control is sufficient**: The command catalog + `guardCommand()` pipeline already controls which sessions can run spell commands. No new manifest fields needed.
4. **Custom prompts live server-side**: Custom prompt spells are created/stored on the server, not in the manifest

The only manifest-adjacent touchpoint is that `teamMemberCommandPermissions` can disable the `spell` command group — but this works automatically via the existing `applyGroupOverrides()` mechanism.

---

## 8. Data Flow: Spell Invocation from CLI

```
┌──────────────┐     POST /api/spells/invoke      ┌──────────────┐
│   CLI Agent   │ ──────────────────────────────►  │    Server     │
│ (any mode)    │   { entityId, spellName,         │  SpellService │
│               │     targetSessionId }            │               │
└──────────────┘                                    └──────┬───────┘
                                                           │
                                                    1. Resolve entity
                                                    2. Construct prompt
                                                    3. Emit session:prompt_send
                                                           │
                                                    ┌──────▼───────┐
                                                    │  WebSocket    │
                                                    │  Bridge       │
                                                    └──────┬───────┘
                                                           │
                                                    ┌──────▼───────┐
                                                    │   UI / PTY    │
                                                    │  Injection    │
                                                    └──────────────┘
```

The CLI's role is minimal: call the API. The server does all prompt construction. This is consistent with the existing `session:prompt` pattern (CLI sends text → server delivers via WebSocket).

---

## 9. Prompt Surface (Commands Reference)

When spells are enabled for a session, the compact command surface (rendered by `command-surface-renderer.ts`) will include:

```
maestro spell {entities|list|invoke|create|delete} - Spell management and invocation
```

And in the full render:
```
- `maestro spell entities [--type <entityType>]` - List available spell entities
- `maestro spell list [entityId] [--type <entityType>]` - List spells for entity or all
- `maestro spell invoke <entityId> [spellName] --target <sessionId>` - Invoke a spell on a target session
- `maestro spell create "<name>" --prompt "<text>"` - Create a custom prompt spell
- `maestro spell delete <entityId>` - Delete a custom prompt spell
```

This requires no special handling — the existing `groupCommandsByParent()` and `renderCompactSurface()` logic handles the new `spell` group automatically based on the catalog entries.

---

## 10. Server API Contract (Expected Endpoints)

The CLI design assumes the server will provide these endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/spells/entities?type=&projectId=` | List spell entities |
| `GET` | `/api/spells/entities/:entityId/spells` | List spells for a specific entity |
| `GET` | `/api/spells?type=&projectId=` | List all spells (flat) |
| `POST` | `/api/spells/invoke` | Invoke a spell (server constructs + injects prompt) |
| `POST` | `/api/spells/custom-prompts` | Create a custom prompt spell entity |
| `DELETE` | `/api/spells/custom-prompts/:id` | Delete a custom prompt spell entity |

The CLI treats these as opaque API calls — it does not need to know how the server resolves entities or constructs prompts.

---

## 11. Implementation Checklist

### Files to Create
- [ ] `maestro-cli/src/commands/spell.ts` — `registerSpellCommands()` with all subcommands

### Files to Modify
- [ ] `maestro-cli/src/index.ts` — Import and register `registerSpellCommands(program)`
- [ ] `maestro-cli/src/prompting/command-catalog.ts` — Add `spell:*` command definitions, syntax map, and group metadata
- [ ] `maestro-cli/src/prompting/capability-policy.ts` — Add `canUseSpells` to `CapabilityFlags` and `buildCapabilityFlags()`
- [ ] `maestro-cli/src/types/api-responses.ts` — Add `SpellEntityResponse`, `SpellDefinitionResponse`, `SpellInvokeResponse`, `SpellCustomPromptResponse` types

### No Changes Required
- `manifest.ts` — Spells are runtime-only, no manifest fields needed
- `prompt-composer.ts` — No spell-specific prompt blocks needed
- `prompt-builder.ts` — No spell-specific template blocks needed
- `agent-spawner.ts` — No spell-aware spawning needed
- `skill-loader.ts` — Skills are spell entities but resolution is server-side

---

## 12. Open Questions

1. **Spell invocation targeting self**: Should `maestro spell invoke <entityId> --target self` be a shorthand where `self` resolves to `config.sessionId`? This would make it natural for agents to invoke spells on their own session.

2. **Spell history/recent**: Should the CLI track recently invoked spells (local to session, via timeline events)? This could help agents avoid re-invoking the same spell.

3. **Bulk invoke**: Should there be a `maestro spell invoke-batch` for invoking multiple spells at once? This might be useful for coordinators setting up context for multiple workers simultaneously.

4. **Spell suggestions in prompts**: Should the system prompt include a brief mention of available spells (similar to how skills are mentioned)? Or is the command surface listing sufficient?
