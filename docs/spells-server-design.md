> ## ⚠️ SUPERSEDED (2026-07-04)
> This document describes the **legacy spell-invocation model** (server-side entity
> resolution + template injection for quick-action prompts). It does **not** describe the
> current spell system. The v2 multi-rule, hook-triggered spell system is authoritative in
> **`docs/spell-system-redesign.md` §11** and explained in **`docs/spell-system-explainer.md`**.
> Kept for historical context only.

# Spells Feature: Server-Side Design

## Overview

This document specifies the server-side architecture for the Spells feature. Spells are quick-action buttons that inject constructed prompts into active sessions. The server is responsible for:

1. Providing spell entity discovery APIs (list entity types, list entities, list available spells)
2. Resolving entities from existing repositories (tasks, team members, sessions, skills, docs)
3. Constructing prompts from spell templates + entity data
4. Delivering constructed prompts to target sessions via the existing `session:prompt_send` mechanism
5. Persisting custom prompt entities

---

## 1. Domain Model Types (types.ts)

### SpellEntityType

```typescript
// Spell entity types — each maps to an existing domain entity (except custom-prompt)
export type SpellEntityType = 'skill' | 'team-member' | 'task' | 'doc' | 'session' | 'custom-prompt';
```

### SpellDefinition

Describes an available spell for a given entity type. These are **statically defined** in the SpellService registry (not persisted).

```typescript
// A spell that can be invoked on an entity of a given type
export interface SpellDefinition {
  name: string;           // 'void' (default), 'refer', 'execute', 'adopt', etc.
  entityType: SpellEntityType;
  label: string;          // Human-readable: "Get Details", "Execute Task", "Adopt Persona"
  description: string;    // What this spell does
  icon?: string;          // Emoji or icon identifier for UI
  promptTemplate: string; // Template string with {{placeholders}} for entity fields
}
```

### SpellEntity

A resolved entity instance that can have spells cast on it. This is a lightweight wrapper returned by the API — not persisted separately (derived from existing repos).

```typescript
// A resolved entity that spells can be invoked on
export interface SpellEntity {
  id: string;                  // Entity ID (task ID, team member ID, etc.)
  type: SpellEntityType;
  name: string;                // Display name (task title, member name, skill name, etc.)
  description?: string;        // Brief description
  icon?: string;               // Avatar/emoji
  availableSpells: string[];   // Names of spells available for this entity
  metadata?: Record<string, any>; // Extra fields for prompt construction (status, role, etc.)
}
```

### SpellInvocation

The request payload for invoking a spell.

```typescript
// Request to invoke a spell on a target session
export interface SpellInvocationPayload {
  entityType: SpellEntityType;
  entityId: string;            // The entity to resolve
  spellName: string;           // 'void' for default, or named spell
  targetSessionId: string;     // Session to inject the prompt into
  projectId: string;           // Project context for entity resolution
}

// Result after invocation
export interface SpellInvocationResult {
  success: boolean;
  prompt: string;              // The constructed prompt that was sent
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;
  targetSessionId: string;
  timestamp: number;
}
```

### CustomPrompt

A user-defined custom prompt entity. These DO need persistence.

```typescript
// Custom prompt entity — user-created spell entities
export interface CustomPrompt {
  id: string;                  // 'cp_<timestamp>_<random>'
  name: string;                // Display name
  description?: string;        // What this prompt does
  icon?: string;               // Emoji
  content: string;             // The actual prompt text
  tags?: string[];             // Optional categorization
  createdAt: number;
  updatedAt: number;
}

export interface CreateCustomPromptPayload {
  name: string;
  description?: string;
  icon?: string;
  content: string;
  tags?: string[];
}

export interface UpdateCustomPromptPayload {
  name?: string;
  description?: string;
  icon?: string;
  content?: string;
  tags?: string[];
}
```

---

## 2. Spell Registry (Static Definitions)

The spell definitions are hardcoded per entity type. They live in the SpellService as a static registry.

### Task Spells

| Spell Name | Label | Prompt Template |
|---|---|---|
| `void` | Get Details | `Here is a task for context:\n\nTitle: {{title}}\nStatus: {{status}}\nPriority: {{priority}}\nDescription: {{description}}` |
| `refer` | Refer to Task | `Use this task as reference context while working:\n\nTask: {{title}} ({{status}})\n{{description}}\n\nKeep this task's requirements in mind.` |
| `execute` | Execute Task | `Execute the following task:\n\nTitle: {{title}}\nPriority: {{priority}}\n\n{{initialPrompt || description}}` |

### Team Member Spells

| Spell Name | Label | Prompt Template |
|---|---|---|
| `void` | Get Details | `Here is a team member for context:\n\nName: {{name}} {{avatar}}\nRole: {{role}}\nIdentity: {{identity}}` |
| `adopt` | Adopt Persona | `Adopt the following persona for the remainder of this session:\n\nName: {{name}} {{avatar}}\nRole: {{role}}\n\n{{identity}}` |

### Skill Spells

| Spell Name | Label | Prompt Template |
|---|---|---|
| `void` | Get Details | `Here is a skill for context:\n\nName: {{name}}\nDescription: {{description}}` |
| `apply` | Apply Skill | `Apply the following skill guidelines:\n\nSkill: {{name}}\n\n{{instructions}}` |

### Session Spells

| Spell Name | Label | Prompt Template |
|---|---|---|
| `void` | Get Details | `Here is a session for context:\n\nName: {{name}}\nStatus: {{status}}\nTasks: {{taskIds}}\nStarted: {{startedAt}}` |

### Doc Spells

| Spell Name | Label | Prompt Template |
|---|---|---|
| `void` | Get Details | `Here is a document for context:\n\nTitle: {{title}}\nPath: {{filePath}}\n\n{{content}}` |
| `review` | Review Document | `Review the following document and provide feedback:\n\nTitle: {{title}}\n\n{{content}}` |

### Custom Prompt Spells

| Spell Name | Label | Prompt Template |
|---|---|---|
| `void` | Send Prompt | `{{content}}` |

---

## 3. SpellService (application/services/SpellService.ts)

### Constructor Dependencies

```typescript
export class SpellService {
  constructor(
    private taskRepo: ITaskRepository,
    private sessionRepo: ISessionRepository,
    private teamMemberRepo: ITeamMemberRepository,
    private skillLoader: ISkillLoader,
    private customPromptRepo: ICustomPromptRepository,
    private eventBus: IEventBus,
    private idGenerator: IIdGenerator,
  ) {}
```

### Key Methods

#### `getSpellDefinitions(entityType?: SpellEntityType): SpellDefinition[]`

Returns the static spell registry, optionally filtered by entity type. Used by the UI to know what spells exist.

#### `listEntities(type: SpellEntityType, projectId: string): Promise<SpellEntity[]>`

Resolves all entities of a given type from existing repos and wraps them as `SpellEntity`:

- **task**: `taskRepo.findAll({ projectId })` → map to SpellEntity with `availableSpells: ['void', 'refer', 'execute']`
- **team-member**: `teamMemberRepo.findByProjectId(projectId)` (+ global members) → map with `['void', 'adopt']`
- **skill**: `skillLoader.listAvailable()` then `skillLoader.load(id)` → map with `['void', 'apply']`
- **session**: `sessionRepo.findAll({ projectId })` → filter active sessions → map with `['void']`
- **doc**: Aggregate docs from sessions in the project (`session.docs`) → map with `['void', 'review']`
- **custom-prompt**: `customPromptRepo.findAll()` → map with `['void']`

#### `resolveEntity(type: SpellEntityType, entityId: string, projectId: string): Promise<Record<string, any>>`

Fetches the full entity data from the appropriate repo. Returns a flat key-value map of all fields needed for prompt template interpolation.

- **task**: `taskRepo.findById(entityId)` → `{ title, description, status, priority, initialPrompt }`
- **team-member**: `teamMemberRepo.findById(projectId, entityId)` → `{ name, avatar, role, identity }`
- **skill**: `skillLoader.load(entityId)` → `{ name, description, instructions }`
- **session**: `sessionRepo.findById(entityId)` → `{ name, status, taskIds, startedAt }`
- **doc**: Find doc by ID across session docs → `{ title, filePath, content }` (read content from `contentFilePath` if needed)
- **custom-prompt**: `customPromptRepo.findById(entityId)` → `{ name, content }`

Throws `NotFoundError` if entity doesn't exist.

#### `invoke(payload: SpellInvocationPayload): Promise<SpellInvocationResult>`

The core method. Steps:

1. **Validate** target session exists and is active (`sessionRepo.findById`)
2. **Resolve** entity data via `resolveEntity()`
3. **Find** spell definition from registry by `entityType + spellName`
4. **Interpolate** prompt template with entity data (replace `{{field}}` placeholders)
5. **Emit** `session:prompt_send` event with the constructed prompt (reusing existing mechanism)
6. **Emit** `spell:invoked` event for UI feedback
7. **Return** `SpellInvocationResult`

```typescript
async invoke(payload: SpellInvocationPayload): Promise<SpellInvocationResult> {
  // 1. Validate target session
  const session = await this.sessionRepo.findById(payload.targetSessionId);
  if (!session) throw new NotFoundError('Session', payload.targetSessionId);
  if (session.status === 'completed' || session.status === 'failed' || session.status === 'stopped') {
    throw new ValidationError('Cannot invoke spell on inactive session');
  }

  // 2. Resolve entity
  const entityData = await this.resolveEntity(payload.entityType, payload.entityId, payload.projectId);

  // 3. Find spell definition
  const spellDef = this.getSpellDefinition(payload.entityType, payload.spellName);
  if (!spellDef) throw new NotFoundError('Spell', `${payload.entityType}:${payload.spellName}`);

  // 4. Interpolate template
  const prompt = this.interpolateTemplate(spellDef.promptTemplate, entityData);

  // 5. Emit prompt to target session (reuse existing mechanism)
  await this.eventBus.emit('session:prompt_send', {
    sessionId: payload.targetSessionId,
    content: prompt,
    mode: 'send' as const,
    senderSessionId: null,    // Spells are UI-initiated, no sender session
    timestamp: Date.now(),
  });

  // 6. Emit spell:invoked for UI feedback
  const result: SpellInvocationResult = {
    success: true,
    prompt,
    entityType: payload.entityType,
    entityId: payload.entityId,
    spellName: payload.spellName,
    targetSessionId: payload.targetSessionId,
    timestamp: Date.now(),
  };
  await this.eventBus.emit('spell:invoked', result);

  return result;
}
```

#### Template Interpolation

Simple `{{placeholder}}` replacement with fallback:

```typescript
private interpolateTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(\w+)(?:\s*\|\|\s*(\w+))?\}\}/g, (_, key, fallback) => {
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
    if (fallback) return data[fallback] !== undefined ? String(data[fallback]) : '';
    return '';
  });
}
```

### Custom Prompt CRUD Methods

```typescript
async createCustomPrompt(data: CreateCustomPromptPayload): Promise<CustomPrompt>
async updateCustomPrompt(id: string, data: UpdateCustomPromptPayload): Promise<CustomPrompt>
async deleteCustomPrompt(id: string): Promise<void>
async listCustomPrompts(): Promise<CustomPrompt[]>
```

---

## 4. ICustomPromptRepository (domain/repositories/ICustomPromptRepository.ts)

Minimal repository interface for custom prompt persistence:

```typescript
export interface ICustomPromptRepository {
  findAll(): Promise<CustomPrompt[]>;
  findById(id: string): Promise<CustomPrompt | null>;
  create(prompt: CustomPrompt): Promise<CustomPrompt>;
  update(id: string, data: Partial<CustomPrompt>): Promise<CustomPrompt>;
  delete(id: string): Promise<void>;
  initialize(): Promise<void>;
}
```

### FileSystemCustomPromptRepository

Stores custom prompts in `{dataDir}/custom-prompts/` as individual JSON files (following the same pattern as `FileSystemTeamMemberRepository`).

```
~/.maestro/data/custom-prompts/
  cp_1234567890_abc.json
  cp_1234567891_def.json
```

Uses the same `readJsonFile`/`writeJsonFile` utilities from the existing repo utils.

---

## 5. API Routes (api/spellRoutes.ts)

### Route Factory

```typescript
export function createSpellRoutes(spellService: SpellService): express.Router
```

### Endpoints

#### `GET /api/spells/definitions`

Returns all spell definitions (static registry), optionally filtered by entity type.

**Query params:**
- `entityType?` — filter by entity type

**Response:** `SpellDefinition[]`

#### `GET /api/spells/entities/:type`

Lists all entities of a given type that can have spells invoked on them.

**Params:**
- `type` — SpellEntityType

**Query params:**
- `projectId` — required, determines which project's entities to list

**Response:** `SpellEntity[]`

#### `POST /api/spells/invoke`

Invoke a spell on a target session.

**Body:**
```json
{
  "entityType": "task",
  "entityId": "task_123_abc",
  "spellName": "execute",
  "targetSessionId": "sess_456_def",
  "projectId": "proj_789_ghi"
}
```

**Response:**
```json
{
  "success": true,
  "prompt": "Execute the following task: ...",
  "entityType": "task",
  "entityId": "task_123_abc",
  "spellName": "execute",
  "targetSessionId": "sess_456_def",
  "timestamp": 1234567890
}
```

#### `GET /api/spells/custom-prompts`

List all custom prompts.

**Response:** `CustomPrompt[]`

#### `POST /api/spells/custom-prompts`

Create a custom prompt.

**Body:** `CreateCustomPromptPayload`

**Response:** `CustomPrompt`

#### `PUT /api/spells/custom-prompts/:id`

Update a custom prompt.

**Body:** `UpdateCustomPromptPayload`

**Response:** `CustomPrompt`

#### `DELETE /api/spells/custom-prompts/:id`

Delete a custom prompt.

**Response:** `{ success: true }`

### Zod Validation Schemas (validation.ts additions)

```typescript
// Spell entity type enum
const spellEntityTypeSchema = z.enum([
  'skill', 'team-member', 'task', 'doc', 'session', 'custom-prompt'
]);

// Spell invocation
export const invokeSpellSchema = z.object({
  entityType: spellEntityTypeSchema,
  entityId: safeId,
  spellName: z.string().min(1).max(100),
  targetSessionId: safeId,
  projectId: safeId,
}).strict();

// Spell entity list query
export const listSpellEntitiesQuerySchema = z.object({
  projectId: safeId,
}).strict();

// Spell definitions query
export const listSpellDefinitionsQuerySchema = z.object({
  entityType: spellEntityTypeSchema.optional(),
}).strict();

// Custom prompt CRUD
export const createCustomPromptSchema = z.object({
  name: shortString,
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
  content: longString,
  tags: z.array(z.string().max(50)).max(10).optional(),
}).strict();

export const updateCustomPromptSchema = z.object({
  name: shortString.optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).optional(),
  content: longString.optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
}).strict();
```

---

## 6. Domain Events (DomainEvents.ts additions)

### New Event Types

```typescript
// Spell Events
export interface SpellInvokedEvent {
  type: 'spell:invoked';
  data: SpellInvocationResult;
}

export interface CustomPromptCreatedEvent {
  type: 'custom_prompt:created';
  data: CustomPrompt;
}

export interface CustomPromptUpdatedEvent {
  type: 'custom_prompt:updated';
  data: CustomPrompt;
}

export interface CustomPromptDeletedEvent {
  type: 'custom_prompt:deleted';
  data: { id: string };
}
```

### TypedEventMap Additions

```typescript
'spell:invoked': SpellInvocationResult;
'custom_prompt:created': CustomPrompt;
'custom_prompt:updated': CustomPrompt;
'custom_prompt:deleted': { id: string };
```

### EventName union gets these four new entries.

---

## 7. WebSocket Bridge Updates

### IMMEDIATE_EVENTS Addition

`spell:invoked` is added to the `IMMEDIATE_EVENTS` set because it triggers a time-sensitive UI action (prompt injection into terminal PTY).

```typescript
const IMMEDIATE_EVENTS = new Set<string>([
  'session:spawn',
  'session:resume',
  'session:prompt_send',
  'session:modal',
  'session:modal_action',
  'session:modal_closed',
  'spell:invoked',        // NEW
]);
```

### Events Array Addition

Add these to the `events` array in `setupEventHandlers()`:

```typescript
'spell:invoked',
'custom_prompt:created',
'custom_prompt:updated',
'custom_prompt:deleted',
```

### Subscription Filtering

`spell:invoked` events should be filtered by `sessionId` (the target session) — add a case in `shouldFilterOut()`:

```typescript
// Spell events — filter by target sessionId
if (event.startsWith('spell:')) {
  const sessionId = data?.targetSessionId;
  if (sub.sessionIds && sessionId && !sub.sessionIds.has(sessionId)) return true;
  return false;
}
```

`custom_prompt:*` events pass through to all clients (they're global, not scoped).

---

## 8. Container/DI Registration (container.ts)

### New Dependencies

```typescript
import { FileSystemCustomPromptRepository } from './infrastructure/repositories/FileSystemCustomPromptRepository';
import { ICustomPromptRepository } from './domain/repositories/ICustomPromptRepository';
import { SpellService } from './application/services/SpellService';
```

### Container Interface Additions

```typescript
export interface Container {
  // ... existing ...

  // Repositories
  customPromptRepo: ICustomPromptRepository;

  // Services
  spellService: SpellService;
}
```

### Wiring in createContainer()

```typescript
// 3. Repositories (add to existing block)
const customPromptRepo = new FileSystemCustomPromptRepository(config.dataDir, idGenerator, logger);

// 5. Services (add to existing block)
const spellService = new SpellService(
  taskRepo,
  sessionRepo,
  teamMemberRepo,
  skillLoader,
  customPromptRepo,
  eventBus,
  idGenerator,
);

// Initialize (add to Promise.all)
await Promise.all([
  // ... existing ...
  customPromptRepo.initialize(),
]);
```

### server.ts Registration

```typescript
import { createSpellRoutes } from './api/spellRoutes';

// In startServer():
const spellRoutes = createSpellRoutes(container.spellService);
app.use('/api', spellRoutes);
```

---

## 9. Prompt Construction Logic Per Entity Type

This is the core of the spell system — how each entity type's data gets turned into a useful prompt.

### Design Principle

Prompts should be **concise, actionable, and context-rich**. The void spell provides reference context; named spells provide instructions.

### Task Prompts

```
void → "Here is a task for context:

Title: Fix authentication timeout bug
Status: in_progress
Priority: high
Description: Users are getting logged out after 5 minutes...

Use this information as needed."

execute → "Execute the following task:

Title: Fix authentication timeout bug
Priority: high

Users are getting logged out after 5 minutes. The session token refresh
mechanism in auth.ts needs to be updated to use a sliding window..."
```

The `execute` spell uses `initialPrompt` if available, falling back to `description`. This matches how the existing spawn system works.

### Team Member Prompts

```
void → "Here is a team member for context:

Name: 🎨 UI Architect
Role: Frontend specialist
Identity: You are the UI Architect. Expert in React, Zustand, CSS..."

adopt → "Adopt the following persona for the remainder of this session:

Name: 🎨 UI Architect
Role: Frontend specialist

You are the UI Architect. Expert in React, Zustand, CSS..."
```

### Skill Prompts

```
void → "Here is a skill for context:

Name: react-vite-best-practices
Description: React and Vite performance optimization guidelines..."

apply → "Apply the following skill guidelines:

Skill: react-vite-best-practices

[full skill instructions content]"
```

Note: The `apply` spell loads the full skill `instructions` content (which can be large). The UI should warn users about this.

### Doc Prompts

For docs, content is loaded from `contentFilePath` on disk. If unavailable, falls back to inline `content` field.

```
void → "Here is a document for context:

Title: Spells Server Design
Path: docs/spells-server-design.md

[full document content]"

review → "Review the following document and provide feedback:

Title: Spells Server Design

[full document content]"
```

### Session Prompts

```
void → "Here is a session for context:

Name: Server Architect - Fix Auth Bug
Status: working
Tasks: task_123, task_456
Started: 2024-03-11T10:00:00Z"
```

### Custom Prompt

```
void → "[the user's custom prompt text, verbatim]"
```

---

## 10. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ UI: User clicks spell button on terminal                        │
│  → Opens SpellPicker → Selects entity + spell                   │
│  → POST /api/spells/invoke                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Server: spellRoutes.ts                                          │
│  → Zod validates SpellInvocationPayload                         │
│  → Calls spellService.invoke()                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ SpellService.invoke()                                           │
│  1. sessionRepo.findById(targetSessionId) — validate active     │
│  2. resolveEntity(type, entityId, projectId) — fetch from repo  │
│  3. Find SpellDefinition from registry                          │
│  4. interpolateTemplate(template, entityData)                   │
│  5. eventBus.emit('session:prompt_send', { ... })               │
│  6. eventBus.emit('spell:invoked', { ... })                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
┌──────────────────────┐  ┌──────────────────────────┐
│ session:prompt_send   │  │ spell:invoked             │
│ (IMMEDIATE_EVENT)     │  │ (IMMEDIATE_EVENT)         │
│                       │  │                           │
│ WebSocketBridge →     │  │ WebSocketBridge →          │
│ broadcastImmediate()  │  │ broadcastImmediate()       │
└──────────┬───────────┘  └──────────┬────────────────┘
           │                         │
           ▼                         ▼
┌──────────────────────┐  ┌──────────────────────────┐
│ UI: Terminal PTY      │  │ UI: SpellStore            │
│ write_to_session()    │  │ Toast "Spell cast!"       │
│ Prompt injected ✨    │  │ Update recent spells      │
└──────────────────────┘  └──────────────────────────┘
```

---

## 11. Implementation Order

1. **Types**: Add `SpellEntityType`, `SpellDefinition`, `SpellEntity`, `SpellInvocationPayload`, `SpellInvocationResult`, `CustomPrompt` to `types.ts`
2. **Events**: Add `spell:invoked`, `custom_prompt:*` events to `DomainEvents.ts` and `TypedEventMap`
3. **Repository**: Create `ICustomPromptRepository` interface and `FileSystemCustomPromptRepository`
4. **Service**: Create `SpellService` with spell registry, entity resolution, template interpolation, invocation
5. **Validation**: Add Zod schemas to `validation.ts`
6. **Routes**: Create `createSpellRoutes()` in `api/spellRoutes.ts`
7. **WebSocket**: Update `WebSocketBridge` — add events to array, `spell:invoked` to IMMEDIATE_EVENTS
8. **Container**: Wire up `customPromptRepo` and `spellService` in `container.ts`
9. **Server**: Register spell routes in `server.ts`

---

## 12. API Contract Summary (for UI/CLI teams)

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/spells/definitions` | List spell definitions (static registry) |
| `GET` | `/api/spells/definitions?entityType=task` | Filter definitions by entity type |
| `GET` | `/api/spells/entities/:type?projectId=X` | List entities of a type |
| `POST` | `/api/spells/invoke` | Invoke a spell on a target session |
| `GET` | `/api/spells/custom-prompts` | List custom prompts |
| `POST` | `/api/spells/custom-prompts` | Create custom prompt |
| `PUT` | `/api/spells/custom-prompts/:id` | Update custom prompt |
| `DELETE` | `/api/spells/custom-prompts/:id` | Delete custom prompt |

### WebSocket Events

| Event | Direction | Timing | Description |
|---|---|---|---|
| `spell:invoked` | Server → UI | IMMEDIATE | Spell was invoked, includes constructed prompt |
| `session:prompt_send` | Server → UI | IMMEDIATE | Prompt ready for terminal injection (existing) |
| `custom_prompt:created` | Server → UI | Batched | Custom prompt created |
| `custom_prompt:updated` | Server → UI | Batched | Custom prompt updated |
| `custom_prompt:deleted` | Server → UI | Batched | Custom prompt deleted |

---

## 13. Open Questions

1. **Prompt mode**: Should spells always use `mode: 'send'` (auto-submit) or should the UI/user choose between `'send'` and `'paste'` (paste into input without submitting)?
   - **Recommendation**: Default to `'send'` but allow override via an optional `mode` field on `SpellInvocationPayload`.

2. **Spell parameters**: Should spells support user-provided parameters (e.g., "Execute task with focus on X")?
   - **Recommendation**: Not for v1. Keep it simple — the template + entity data is sufficient. Can add `parameters` field later.

3. **Spell history**: Should we persist invocation history for analytics/recent spells?
   - **Recommendation**: Not server-side for v1. Let the UI store recent spells in Zustand (ephemeral). Add server persistence later if needed.

4. **Doc content loading**: Loading full doc content can be expensive for large files. Should we cap content size?
   - **Recommendation**: Cap at 50KB per doc content in `resolveEntity()`. Truncate with a note if exceeded.

5. **Scope**: Currently global (not per-project). Custom prompts are stored globally. Entity resolution IS project-scoped. This seems right for v1.
