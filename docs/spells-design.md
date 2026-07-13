> ## ⚠️ SUPERSEDED (2026-07-04)
> This document describes the **legacy spell-invocation model** (quick-action prompt
> buttons that `POST /api/spells/invoke`). It does **not** describe the current spell
> system. The v2 multi-rule, hook-triggered spell system is authoritative in
> **`docs/spell-system-redesign.md` §11** and explained in **`docs/spell-system-explainer.md`**.
> The invoke path summarized here still exists (see the explainer §7), but for anything
> about spell *behavior*, triggers, actions, or the library, read those two docs. Kept for
> historical context only.

# Spells Feature — Consolidated End-to-End Design

## Overview

Spells are quick-action buttons that inject constructed prompts into active sessions. They appear as overlay buttons on each terminal in the UI. When invoked, a spell:

1. **UI** sends `POST /api/spells/invoke` with spell details + target session
2. **Server** resolves the spell entity, constructs the prompt from a template
3. **Server** emits `spell:invoked` WebSocket event (IMMEDIATE) back to UI
4. **UI** receives event, injects the constructed prompt into the target session's terminal PTY

### Spell Concepts

| Concept | Description |
|---------|-------------|
| **Spell Entity Type** | Category: `skill`, `team-member`, `task`, `doc`, `session`, `custom-prompt` |
| **Spell Entity** | A specific instance of an entity type (e.g., a particular task, a particular team member) |
| **Spell** | An action on an entity. Each entity has a **default spell** (`void` — gives entity details) plus **named spells** (e.g., task has `refer`, `execute`) |
| **Custom Prompt** | A spell entity of type `custom-prompt` whose default spell simply injects raw prompt text |

Spells are **global** (not per-project scoped) for v1. Entity resolution IS project-scoped.

---

## End-to-End Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ UI: User clicks ✦ spell button on terminal                      │
│  → Opens SpellPicker → Browses/searches by entity type          │
│  → Selects entity + spell                                       │
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
│  3. Find SpellDefinition from static registry                   │
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
│ write_to_session()    │  │ Toast / animation         │
│ Prompt injected ✨    │  │ Update recent spells      │
└──────────────────────┘  └──────────────────────────┘
```

**CLI Flow** (alternative entry point):
```
CLI Agent → maestro spell invoke <entityId> [spellName] --target <sessionId>
  → POST /api/spells/invoke (same API)
  → Server constructs + injects prompt (same flow)
```

---

## Unified Type Definitions

### Core Types (shared across all layers)

```typescript
// Spell entity types — maps to existing domain entities + custom-prompt
type SpellEntityType = 'skill' | 'team-member' | 'task' | 'doc' | 'session' | 'custom-prompt';

// Static spell definition (lives in SpellService registry)
interface SpellDefinition {
  name: string;           // 'void' (default), 'refer', 'execute', 'adopt', etc.
  entityType: SpellEntityType;
  label: string;          // Human-readable: "Get Details", "Execute Task"
  description: string;    // What this spell does
  icon?: string;          // Emoji or icon identifier
  promptTemplate: string; // Template with {{placeholders}}
}

// A resolved entity instance
interface SpellEntity {
  id: string;                  // Entity ID
  type: SpellEntityType;
  name: string;                // Display name
  description?: string;
  icon?: string;
  availableSpells: string[];   // Spell names available for this entity
  metadata?: Record<string, any>;
}

// Invocation request payload
interface SpellInvocationPayload {
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;       // 'void' for default
  targetSessionId: string;
  projectId: string;
}

// Invocation result
interface SpellInvocationResult {
  success: boolean;
  prompt: string;          // Constructed prompt that was sent
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;
  targetSessionId: string;
  timestamp: number;
}

// Custom prompt (persisted server-side)
interface CustomPrompt {
  id: string;              // 'cp_<timestamp>_<random>'
  name: string;
  description?: string;
  icon?: string;
  content: string;         // The prompt text
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}
```

---

## Server Design

> Full details: [docs/spells-server-design.md](./spells-server-design.md)

### Architecture Summary

| Component | Location | Purpose |
|-----------|----------|---------|
| Types | `types.ts` | SpellEntityType, SpellDefinition, SpellEntity, SpellInvocationPayload, SpellInvocationResult, CustomPrompt |
| SpellService | `application/services/SpellService.ts` | Entity resolution, prompt construction, invocation |
| Spell Registry | Inside SpellService (static) | Hardcoded spell definitions per entity type |
| Routes | `api/spellRoutes.ts` | REST API endpoints |
| Repository | `infrastructure/repositories/FileSystemCustomPromptRepository.ts` | Custom prompt persistence |
| Events | `domain/events/DomainEvents.ts` | spell:invoked, custom_prompt:* events |
| WebSocket | `infrastructure/websocket/WebSocketBridge.ts` | spell:invoked as IMMEDIATE_EVENT |
| Container | `container.ts` | DI wiring for SpellService + CustomPromptRepository |

### Spell Registry (Static Definitions)

| Entity Type | Spell | Label | What it does |
|-------------|-------|-------|--------------|
| **task** | `void` | Get Details | Injects task title, status, priority, description |
| **task** | `refer` | Refer to Task | Provides task as reference context |
| **task** | `execute` | Execute Task | Instructs agent to execute the task |
| **team-member** | `void` | Get Details | Injects member name, role, identity |
| **team-member** | `adopt` | Adopt Persona | Instructs agent to adopt this persona |
| **skill** | `void` | Get Details | Injects skill name and description |
| **skill** | `apply` | Apply Skill | Injects full skill instructions |
| **session** | `void` | Get Details | Injects session name, status, tasks |
| **doc** | `void` | Get Details | Injects document title, path, content |
| **doc** | `review` | Review Document | Instructs agent to review the document |
| **custom-prompt** | `void` | Send Prompt | Injects raw prompt text verbatim |

### SpellService Key Methods

- `getSpellDefinitions(entityType?)` — Returns static spell registry
- `listEntities(type, projectId)` — Resolves entities from existing repos (tasks, team members, etc.)
- `resolveEntity(type, entityId, projectId)` — Fetches full entity data for template interpolation
- `invoke(payload)` — Core method: validate session → resolve entity → find spell → interpolate template → emit events
- `createCustomPrompt/updateCustomPrompt/deleteCustomPrompt` — CRUD for custom prompt entities

### Template Interpolation

Simple `{{placeholder}}` replacement with fallback support (`{{field || fallbackField}}`):

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

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/spells/definitions` | List all spell definitions (optionally `?entityType=X`) |
| `GET` | `/api/spells/entities/:type` | List entities of a type (`?projectId=X` required) |
| `POST` | `/api/spells/invoke` | Invoke a spell on a target session |
| `GET` | `/api/spells/custom-prompts` | List custom prompts |
| `POST` | `/api/spells/custom-prompts` | Create custom prompt |
| `PUT` | `/api/spells/custom-prompts/:id` | Update custom prompt |
| `DELETE` | `/api/spells/custom-prompts/:id` | Delete custom prompt |

### WebSocket Events

| Event | Timing | Description |
|-------|--------|-------------|
| `spell:invoked` | IMMEDIATE | Spell was invoked — carries constructed prompt |
| `custom_prompt:created` | Batched | Custom prompt created |
| `custom_prompt:updated` | Batched | Custom prompt updated |
| `custom_prompt:deleted` | Batched | Custom prompt deleted |

### Zod Validation

```typescript
const invokeSpellSchema = z.object({
  entityType: z.enum(['skill', 'team-member', 'task', 'doc', 'session', 'custom-prompt']),
  entityId: safeId,
  spellName: z.string().min(1).max(100),
  targetSessionId: safeId,
  projectId: safeId,
}).strict();
```

---

## CLI Design

> Full details: [docs/spells-cli-design.md](./spells-cli-design.md)

### Architecture Summary

| Component | Location | Purpose |
|-----------|----------|---------|
| Commands | `commands/spell.ts` | `registerSpellCommands()` — entities, list, invoke, create, delete |
| Types | `types/api-responses.ts` | SpellEntityResponse, SpellDefinitionResponse, SpellInvokeResponse, SpellCustomPromptResponse |
| Capability | `capability-policy.ts` | `canUseSpells` flag |
| Catalog | `prompting/command-catalog.ts` | spell:* command definitions + syntax map |

### Command Group

```
maestro spell entities [--type <entityType>]     List available spell entities
maestro spell list [entityId] [--type <type>]    List spells for entity or all
maestro spell invoke <entityId> [spellName] --target <sessionId>  Invoke a spell
maestro spell create <name> --prompt <text>      Create custom prompt spell
maestro spell delete <entityId>                  Delete custom prompt spell
```

### Permission Model

- **All four modes** (worker, coordinator, coordinated-worker, coordinated-coordinator) can use spells
- Spells are purely additive (inject prompts) — no destructive operations
- Controlled via existing `guardCommand()` + manifest permission pipeline
- `canUseSpells` capability flag derived from `spell:invoke`/`spell:list`/`spell:entities` permissions

### Manifest Integration

**None required.** Spells are runtime-only:
- Entity resolution is server-side (dynamic from existing repos)
- Custom prompts are server-persisted (not per-session)
- Permission control via existing command catalog is sufficient

---

## UI Design

> Full details: [docs/spells-ui-design.md](./spells-ui-design.md)

### Architecture Summary

| Component | Location | Purpose |
|-----------|----------|---------|
| SpellButton | `components/maestro/SpellButton.tsx` | Terminal overlay button (✦ wand icon) |
| SpellPicker | `components/maestro/SpellPicker.tsx` | Modal picker with search + entity type tabs |
| Store | `stores/useSpellStore.ts` | Spell entities, picker state, invocation, recent spells |
| Hooks | `hooks/useSpells.ts`, `hooks/useSpellInvocation.ts` | Entity access, programmatic invocation |
| WebSocket | `stores/useMaestroStore.ts` | `spell:invoked` handler → PTY injection |
| Styles | `styles-spells.css` | All spell-related CSS |

### UI Flow

```
Terminal Pane                    SpellPicker Modal
┌─────────────────────┐        ┌───────────────────────────────┐
│                     │        │  ✦ Cast Spell             [×] │
│  $ claude           │  ──►   │  ┌───────────────────────┐    │
│  > Working...       │ click  │  │ 🔍 Search spells...   │    │
│                     │  ✦     │  └───────────────────────┘    │
│               ┌───┐ │        │  [All][⚡Skills][👤Team][☐Task]│
│               │ ✦ │ │        │                               │
│               └───┘ │        │  ─── Recent ──────────────── │
└─────────────────────┘        │  ⚡ code-review     [refer]   │
                               │                               │
                               │  ─── Tasks ──────────────── │
                               │  ☐ Fix login bug           ▾ │
                               │    ├─ Refer to task           │
                               │    ├─ Execute task            │
                               │    └─ Get details (default)   │
                               └───────────────────────────────┘
```

### Zustand Store (useSpellStore)

- `entities: SpellEntity[]` — all fetched spell entities
- `entitiesByType: Record<SpellEntityType, SpellEntity[]>` — O(1) type filtering
- `isPickerOpen / targetSessionId` — picker UI state
- `searchQuery / activeEntityType` — filtering state
- `invoking` — loading state
- `recentSpells` — persisted to localStorage (last 10)
- Actions: `fetchEntities()`, `openPicker()`, `closePicker()`, `invokeSpell()`

### WebSocket Handler

Added to `handleSingleMessage()` in `useMaestroStore.ts`:

```typescript
case 'spell:invoked': {
  // Find terminal session for target maestro session
  // Inject prompt via invoke('write_to_session', { id, data, source: 'system' })
  // Trigger prompt animation
}
```

Follows exact same pattern as existing `session:prompt_send` handler.

---

## Cross-Layer Integration Points

### API Contract Consistency

The three designs align on the following API contract:

| Endpoint | Server (provides) | CLI (consumes) | UI (consumes) |
|----------|-------------------|----------------|---------------|
| `GET /api/spells/definitions` | SpellDefinition[] | SpellDefinitionResponse[] | SpellDefinition[] |
| `GET /api/spells/entities/:type?projectId=X` | SpellEntity[] | SpellEntityResponse[] | SpellEntity[] |
| `POST /api/spells/invoke` | SpellInvocationResult | SpellInvokeResponse | `{ success: true }` |
| Custom prompt CRUD | CustomPrompt | SpellCustomPromptResponse | SpellEntity |

### WebSocket Event Consistency

| Event | Server (emits) | UI (handles) | CLI (N/A) |
|-------|----------------|--------------|-----------|
| `spell:invoked` | IMMEDIATE via WebSocketBridge | PTY injection in handleSingleMessage() | Not consumed |
| `custom_prompt:*` | Batched via WebSocketBridge | Store refresh | Not consumed |

### Type Alignment

All three layers define the same core `SpellEntityType` union:
```typescript
type SpellEntityType = 'skill' | 'team-member' | 'task' | 'doc' | 'session' | 'custom-prompt';
```

Server types are the source of truth; CLI and UI define their own response types that mirror the server's output.

---

## Implementation Order

### Phase 1: Server Foundation
1. **Types**: Add spell types to `types.ts`
2. **Events**: Add `spell:invoked`, `custom_prompt:*` to `DomainEvents.ts`
3. **Repository**: Create `ICustomPromptRepository` + `FileSystemCustomPromptRepository`
4. **Service**: Create `SpellService` with registry, entity resolution, template interpolation, invocation
5. **Validation**: Add Zod schemas to `validation.ts`
6. **Routes**: Create `createSpellRoutes()` in `api/spellRoutes.ts`
7. **WebSocket**: Update `WebSocketBridge` — add events, `spell:invoked` to IMMEDIATE_EVENTS
8. **Container**: Wire up in `container.ts`
9. **Server**: Register routes in `server.ts`

### Phase 2: UI Integration (can start after Phase 1 API is ready)
1. **Types**: Add spell types to `maestro.ts`
2. **Store**: Create `useSpellStore.ts`
3. **API Client**: Add spell methods to maestro client
4. **Components**: Create `SpellButton.tsx` and `SpellPicker.tsx`
5. **WebSocket**: Add `spell:invoked` handler to `useMaestroStore.ts`
6. **Hooks**: Create `useSpells.ts` and `useSpellInvocation.ts`
7. **CSS**: Create `styles-spells.css`
8. **Integration**: Wire into `AppWorkspace.tsx` and `AppModals.tsx`

### Phase 3: CLI Integration (can start after Phase 1 API is ready)
1. **Types**: Add spell response types to `api-responses.ts`
2. **Commands**: Create `commands/spell.ts` with `registerSpellCommands()`
3. **Catalog**: Add spell commands to `command-catalog.ts`
4. **Capability**: Add `canUseSpells` to `capability-policy.ts`
5. **Registration**: Import in `index.ts`

**Phases 2 and 3 can run in parallel** since they both depend only on the server API.

---

## File Impact Summary

### New Files
| File | Layer | Purpose |
|------|-------|---------|
| `maestro-server/src/application/services/SpellService.ts` | Server | Core spell logic |
| `maestro-server/src/domain/repositories/ICustomPromptRepository.ts` | Server | Repository interface |
| `maestro-server/src/infrastructure/repositories/FileSystemCustomPromptRepository.ts` | Server | Custom prompt persistence |
| `maestro-server/src/api/spellRoutes.ts` | Server | REST API routes |
| `maestro-ui/src/stores/useSpellStore.ts` | UI | Spell state management |
| `maestro-ui/src/hooks/useSpells.ts` | UI | Entity access hook |
| `maestro-ui/src/hooks/useSpellInvocation.ts` | UI | Invocation hook |
| `maestro-ui/src/components/maestro/SpellButton.tsx` | UI | Terminal overlay button |
| `maestro-ui/src/components/maestro/SpellPicker.tsx` | UI | Picker modal |
| `maestro-ui/src/styles-spells.css` | UI | Styles |
| `maestro-cli/src/commands/spell.ts` | CLI | Command group |

### Modified Files
| File | Layer | Changes |
|------|-------|---------|
| `maestro-server/src/types.ts` | Server | + spell type definitions |
| `maestro-server/src/domain/events/DomainEvents.ts` | Server | + spell event types |
| `maestro-server/src/infrastructure/websocket/WebSocketBridge.ts` | Server | + spell events, IMMEDIATE_EVENTS |
| `maestro-server/src/api/validation.ts` | Server | + Zod schemas for spells |
| `maestro-server/src/container.ts` | Server | + SpellService, CustomPromptRepo DI |
| `maestro-server/src/server.ts` | Server | + spell routes registration |
| `maestro-ui/src/app/types/maestro.ts` | UI | + spell types |
| `maestro-ui/src/stores/useMaestroStore.ts` | UI | + spell:invoked handler |
| `maestro-ui/src/components/app/AppWorkspace.tsx` | UI | + SpellButton in terminalPane |
| `maestro-ui/src/components/app/AppModals.tsx` | UI | + SpellPicker |
| `maestro-ui/src/App.tsx` | UI | + import styles-spells.css |
| `maestro-cli/src/index.ts` | CLI | + registerSpellCommands |
| `maestro-cli/src/types/api-responses.ts` | CLI | + spell response types |
| `maestro-cli/src/prompting/command-catalog.ts` | CLI | + spell commands |
| `maestro-cli/src/prompting/capability-policy.ts` | CLI | + canUseSpells |

---

## Open Questions (Consolidated)

### High Priority (Should decide before v1)

1. **Prompt mode — send vs paste**: Should spells always auto-submit (`mode: 'send'`) or allow paste-only (`mode: 'paste'`)?
   - **Recommendation**: Default to `send` with optional `mode` field on invocation payload. Most spells should auto-submit.

2. **Self-targeting shorthand**: Should CLI support `--target self` to resolve to current session?
   - **Recommendation**: Yes — simple to implement and very natural for agents.

### Medium Priority (Can defer to v1.1)

3. **Spell parameters**: Should spells support user-provided parameters (e.g., "Execute task with focus on X")?
   - **Recommendation**: Not for v1. Template + entity data is sufficient.

4. **Keyboard shortcut**: Should `Cmd+Shift+S` open the spell picker globally?
   - **Recommendation**: Yes, add to `useKeyboardShortcuts.ts`. Low effort, high discoverability.

5. **Spell history persistence**: Should invocation history be persisted server-side?
   - **Recommendation**: Not for v1. UI stores recent spells in localStorage. Add analytics later.

6. **Doc content cap**: Large docs could produce huge prompts.
   - **Recommendation**: Cap at 50KB per doc content in `resolveEntity()`. Truncate with note.

### Low Priority (v2+)

7. **Multi-session targeting**: Cast spells to multiple sessions at once (coordinator use case).
8. **Spell confirmation dialog**: Confirm before executing potentially impactful spells.
9. **Bulk invoke CLI**: `maestro spell invoke-batch` for coordinators.
10. **Custom spell creation from UI picker**: Inline custom prompt creation.

---

## Design Document References

| Document | Author | Lines | Focus |
|----------|--------|-------|-------|
| [spells-server-design.md](./spells-server-design.md) | Server Architect | 809 | Types, SpellService, routes, events, WebSocket, container |
| [spells-cli-design.md](./spells-cli-design.md) | CLI Architect | 531 | Commands, permissions, types, catalog, manifest decision |
| [spells-ui-design.md](./spells-ui-design.md) | UI Architect | 1193 | Components, store, hooks, WebSocket handler, CSS, mockups |
