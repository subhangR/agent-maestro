> ## ⚠️ SUPERSEDED (2026-07-04)
> This document describes the **legacy spell-invocation UI** (terminal-overlay quick-action
> picker). It does **not** describe the current spell system. The live UI is the **Spell
> Studio** (Cmd/Ctrl+Shift+S); the v2 multi-rule, hook-triggered spell system is
> authoritative in **`docs/spell-system-redesign.md` §11** and explained in
> **`docs/spell-system-explainer.md`**. Kept for historical context only.

# Spells Feature — UI-Side Design Document

## Overview

Spells are quick-action buttons that inject constructed prompts into active sessions. They appear as an overlay button on the terminal pane, opening a searchable picker categorized by entity type.

**Flow:**
1. User clicks spell wand button on terminal overlay
2. SpellPicker opens — user browses/searches spell entities by type
3. User selects an entity + spell (or uses the default void spell)
4. UI sends `POST /api/spells/invoke` with `{ entityType, entityId, spellName, targetSessionId }`
5. Server resolves entity, constructs prompt, emits `spell:invoked` WebSocket event
6. UI receives event → injects prompt into target session's terminal PTY

---

## 1. TypeScript Types

Add to `maestro-ui/src/app/types/maestro.ts`:

```typescript
// ─── Spell Types ───

export type SpellEntityType = 'skill' | 'team-member' | 'task' | 'doc' | 'session' | 'custom-prompt';

export interface SpellDefinition {
  name: string;          // 'void' (default), 'refer', 'execute', etc.
  label: string;         // Human-readable: "Refer to task", "Execute task"
  description?: string;  // Tooltip text
}

export interface SpellEntity {
  id: string;
  type: SpellEntityType;
  label: string;          // Display name (task title, member name, etc.)
  icon?: string;          // Emoji or icon identifier
  spells: SpellDefinition[];  // Available spells; first is always 'void' (default)
}

export interface SpellInvocation {
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;       // 'void' for default
  targetSessionId: string; // Maestro session ID
}

export interface SpellInvokedEvent {
  sessionId: string;       // Target maestro session ID
  content: string;         // Constructed prompt text
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;
}
```

---

## 2. Zustand Store — `useSpellStore`

New file: `maestro-ui/src/stores/useSpellStore.ts`

```typescript
import { create } from 'zustand';
import type { SpellEntity, SpellEntityType, SpellInvocation } from '../app/types/maestro';

interface SpellState {
  // Available spell entities (fetched from server)
  entities: SpellEntity[];
  entitiesByType: Record<SpellEntityType, SpellEntity[]>;

  // UI state
  isPickerOpen: boolean;
  targetSessionId: string | null;  // Which session the spell targets
  searchQuery: string;
  activeEntityType: SpellEntityType | 'all';

  // Invocation state
  invoking: boolean;
  lastInvokedSpell: { entityId: string; spellName: string } | null;

  // Recent spells (persisted to localStorage)
  recentSpells: Array<{ entityType: SpellEntityType; entityId: string; spellName: string; label: string; timestamp: number }>;

  // Actions
  fetchEntities: () => Promise<void>;
  openPicker: (targetSessionId: string) => void;
  closePicker: () => void;
  setSearchQuery: (query: string) => void;
  setActiveEntityType: (type: SpellEntityType | 'all') => void;
  invokeSpell: (invocation: SpellInvocation) => Promise<void>;
}
```

**Key patterns followed:**
- Record-based grouping via `entitiesByType` for O(1) type filtering
- Separate `invoking` boolean for loading state
- Recent spells persisted to localStorage (debounced, like `lastUsedTeamMember` pattern in useMaestroStore)
- Actions are async with optimistic UI updates

### Store Implementation Notes

```typescript
export const useSpellStore = create<SpellState>((set, get) => {
  // Restore recent spells from localStorage
  let recentSpells: SpellState['recentSpells'] = [];
  try {
    const raw = localStorage.getItem('maestro:recentSpells');
    if (raw) recentSpells = JSON.parse(raw);
  } catch { /* best-effort */ }

  return {
    entities: [],
    entitiesByType: { skill: [], 'team-member': [], task: [], doc: [], session: [], 'custom-prompt': [] },
    isPickerOpen: false,
    targetSessionId: null,
    searchQuery: '',
    activeEntityType: 'all',
    invoking: false,
    lastInvokedSpell: null,
    recentSpells,

    fetchEntities: async (projectId?: string) => {
      try {
        // Fetch all entity types in parallel
        const types: SpellEntityType[] = ['skill', 'team-member', 'task', 'doc', 'session', 'custom-prompt'];
        const results = await Promise.all(
          types.map(type => maestroClient.getSpellEntities(type, projectId).catch(() => [] as SpellEntity[]))
        );
        const all = results.flat();
        const byType = groupByType(all);
        set({ entities: all, entitiesByType: byType });
      } catch { /* best-effort */ }
    },

    openPicker: (targetSessionId) => {
      set({ isPickerOpen: true, targetSessionId, searchQuery: '', activeEntityType: 'all' });
      // Refresh entities on open
      get().fetchEntities();
    },

    closePicker: () => set({ isPickerOpen: false, targetSessionId: null, searchQuery: '' }),

    setSearchQuery: (query) => set({ searchQuery: query }),
    setActiveEntityType: (type) => set({ activeEntityType: type }),

    invokeSpell: async (invocation) => {
      set({ invoking: true });
      try {
        await maestroClient.invokeSpell(invocation);
        // Add to recent (server will handle prompt injection via WebSocket)
        const entity = get().entities.find(e => e.id === invocation.entityId);
        set((prev) => {
          const recent = [
            { entityType: invocation.entityType, entityId: invocation.entityId, spellName: invocation.spellName, label: entity?.label ?? '', timestamp: Date.now() },
            ...prev.recentSpells.filter(r => !(r.entityId === invocation.entityId && r.spellName === invocation.spellName)),
          ].slice(0, 10);  // Keep last 10
          // Debounced localStorage save
          try { localStorage.setItem('maestro:recentSpells', JSON.stringify(recent)); } catch { /* */ }
          return { lastInvokedSpell: { entityId: invocation.entityId, spellName: invocation.spellName }, recentSpells: recent };
        });
        get().closePicker();
      } catch (err) {
        // Error handling — could add an error state field
        console.error('Spell invocation failed:', err);
      } finally {
        set({ invoking: false });
      }
    },
  };
});

function groupByType(entities: SpellEntity[]): Record<SpellEntityType, SpellEntity[]> {
  const result: Record<SpellEntityType, SpellEntity[]> = {
    skill: [], 'team-member': [], task: [], doc: [], session: [], 'custom-prompt': [],
  };
  for (const entity of entities) {
    result[entity.type]?.push(entity);
  }
  return result;
}
```

---

## 3. WebSocket Event Handling

Add to `handleSingleMessage()` in `useMaestroStore.ts`:

```typescript
case 'spell:invoked': {
  const { sessionId: maestroSessionId, content, entityType, entityId, spellName } = message.data;

  // Find terminal session for this maestro session
  const sessions = useSessionStore.getState().sessions;
  const terminalSession = sessions.find(
    (s) => s.maestroSessionId === maestroSessionId && !s.exited
  );
  if (!terminalSession) break;

  // Inject prompt into PTY (same pattern as session:prompt_send)
  const ptyId = terminalSession.id;
  const text = content.replace(/[\r\n]+$/, '');
  (async () => {
    try {
      if (text) {
        await invoke('write_to_session', { id: ptyId, data: text, source: 'system' });
        await new Promise(r => setTimeout(r, 200));
      }
      await invoke('write_to_session', { id: ptyId, data: '\r', source: 'system' });
    } catch {
      // best-effort
    }
  })();

  // Optional: trigger prompt animation
  usePromptAnimationStore.getState().addAnimation({
    senderMaestroSessionId: null,
    targetMaestroSessionId: maestroSessionId,
    content: `[Spell: ${spellName}] ${content.slice(0, 50)}...`,
  });

  break;
}
```

This follows the exact same pattern as the existing `session:prompt_send` handler at lines 357-392.

---

## 4. API Client Extension

Add to the maestro API client (used by stores):

```typescript
// GET /api/spells/definitions — all spell definitions (entity types + their available spells)
async getSpellDefinitions(): Promise<SpellDefinition[]> {
  const res = await this.fetch('/api/spells/definitions');
  return res.json();
}

// GET /api/spells/entities/:type?projectId=X — resolved entities for a given type
async getSpellEntities(type: SpellEntityType, projectId?: string): Promise<SpellEntity[]> {
  const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const res = await this.fetch(`/api/spells/entities/${type}${params}`);
  return res.json();
}

// POST /api/spells/invoke
async invokeSpell(invocation: SpellInvocation): Promise<void> {
  await this.fetch('/api/spells/invoke', {
    method: 'POST',
    body: JSON.stringify(invocation),
  });
}

// Custom prompt CRUD
async getCustomPrompts(): Promise<SpellEntity[]> {
  const res = await this.fetch('/api/spells/custom-prompts');
  return res.json();
}

async createCustomPrompt(data: { label: string; content: string }): Promise<SpellEntity> {
  const res = await this.fetch('/api/spells/custom-prompts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

async updateCustomPrompt(id: string, data: { label?: string; content?: string }): Promise<SpellEntity> {
  const res = await this.fetch(`/api/spells/custom-prompts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res.json();
}

async deleteCustomPrompt(id: string): Promise<void> {
  await this.fetch(`/api/spells/custom-prompts/${id}`, { method: 'DELETE' });
}
```

---

## 5. Components

### 5.1 SpellButton — Terminal Overlay Button

New file: `maestro-ui/src/components/maestro/SpellButton.tsx`

Rendered inside `AppWorkspace.tsx` in the `terminalPane` div, alongside the existing `SessionLogStrip`:

```tsx
import React from 'react';
import { useSpellStore } from '../../stores/useSpellStore';

interface SpellButtonProps {
  maestroSessionId: string;
}

export const SpellButton = React.memo(function SpellButton({ maestroSessionId }: SpellButtonProps) {
  const openPicker = useSpellStore((s) => s.openPicker);

  return (
    <button
      type="button"
      className="spellButton"
      onClick={() => openPicker(maestroSessionId)}
      title="Cast spell — inject prompt into session"
      aria-label="Open spell picker"
    >
      <span className="spellButton__icon">✦</span>
    </button>
  );
});
```

**Placement in AppWorkspace.tsx** (inside `terminalPane`, after `SessionLogStrip`):

```tsx
<div className={`terminalPane ${...}`}>
  {/* Existing: Session log strip */}
  {active?.maestroSessionId && active?.cwd && (
    <SessionLogStrip ... />
  )}

  {/* NEW: Spell button overlay */}
  {active?.maestroSessionId && (
    <SpellButton maestroSessionId={active.maestroSessionId} />
  )}

  {/* Existing: Terminal containers */}
  {sessions.map((s) => (...))}
</div>
```

### 5.2 SpellPicker — Modal/Popover Component

New file: `maestro-ui/src/components/maestro/SpellPicker.tsx`

Uses `createPortal()` following the `SplitPlayButton` dropdown pattern:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpellStore } from '../../stores/useSpellStore';
import type { SpellEntity, SpellEntityType } from '../../app/types/maestro';

const ENTITY_TYPE_META: Record<SpellEntityType, { label: string; icon: string }> = {
  skill:           { label: 'Skills',          icon: '⚡' },
  'team-member':   { label: 'Team Members',    icon: '👤' },
  task:            { label: 'Tasks',            icon: '☐' },
  doc:             { label: 'Documents',        icon: '📄' },
  session:         { label: 'Sessions',         icon: '▶' },
  'custom-prompt': { label: 'Custom Prompts',   icon: '✎' },
};

const ENTITY_TYPES: SpellEntityType[] = ['skill', 'team-member', 'task', 'doc', 'session', 'custom-prompt'];

export const SpellPicker = React.memo(function SpellPicker() {
  const isOpen = useSpellStore((s) => s.isPickerOpen);
  const targetSessionId = useSpellStore((s) => s.targetSessionId);
  const entities = useSpellStore((s) => s.entities);
  const entitiesByType = useSpellStore((s) => s.entitiesByType);
  const searchQuery = useSpellStore((s) => s.searchQuery);
  const activeEntityType = useSpellStore((s) => s.activeEntityType);
  const recentSpells = useSpellStore((s) => s.recentSpells);
  const invoking = useSpellStore((s) => s.invoking);
  const closePicker = useSpellStore((s) => s.closePicker);
  const setSearchQuery = useSpellStore((s) => s.setSearchQuery);
  const setActiveEntityType = useSpellStore((s) => s.setActiveEntityType);
  const invokeSpell = useSpellStore((s) => s.invokeSpell);

  const inputRef = useRef<HTMLInputElement>(null);
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);

  // Auto-focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePicker();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, closePicker]);

  // Filter entities by search + type
  const filteredEntities = useMemo(() => {
    const source = activeEntityType === 'all' ? entities : (entitiesByType[activeEntityType] ?? []);
    if (!searchQuery.trim()) return source;
    const q = searchQuery.toLowerCase();
    return source.filter(e => e.label.toLowerCase().includes(q));
  }, [entities, entitiesByType, activeEntityType, searchQuery]);

  // Group by type for "all" view
  const groupedEntities = useMemo(() => {
    if (activeEntityType !== 'all') return null;
    const groups: Partial<Record<SpellEntityType, SpellEntity[]>> = {};
    for (const entity of filteredEntities) {
      if (!groups[entity.type]) groups[entity.type] = [];
      groups[entity.type]!.push(entity);
    }
    return groups;
  }, [filteredEntities, activeEntityType]);

  if (!isOpen || !targetSessionId) return null;

  const handleInvoke = (entity: SpellEntity, spellName: string) => {
    invokeSpell({
      entityType: entity.type,
      entityId: entity.id,
      spellName,
      targetSessionId,
    });
  };

  const renderEntity = (entity: SpellEntity) => {
    const isExpanded = expandedEntityId === entity.id;
    const hasMultipleSpells = entity.spells.length > 1;

    return (
      <div key={entity.id} className="spellPicker__entity">
        <button
          type="button"
          className="spellPicker__entityRow"
          onClick={() => {
            if (hasMultipleSpells) {
              setExpandedEntityId(isExpanded ? null : entity.id);
            } else {
              handleInvoke(entity, entity.spells[0]?.name ?? 'void');
            }
          }}
          disabled={invoking}
        >
          <span className="spellPicker__entityIcon">{entity.icon ?? ENTITY_TYPE_META[entity.type].icon}</span>
          <span className="spellPicker__entityLabel">{entity.label}</span>
          <span className="spellPicker__entityType">{ENTITY_TYPE_META[entity.type].label}</span>
          {hasMultipleSpells && (
            <span className="spellPicker__entityExpand">{isExpanded ? '▴' : '▾'}</span>
          )}
        </button>

        {/* Expanded spell list */}
        {isExpanded && hasMultipleSpells && (
          <div className="spellPicker__spellList">
            {entity.spells.map((spell) => (
              <button
                key={spell.name}
                type="button"
                className="spellPicker__spellRow"
                onClick={() => handleInvoke(entity, spell.name)}
                disabled={invoking}
                title={spell.description}
              >
                <span className="spellPicker__spellName">{spell.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="spellPicker__backdrop" onClick={closePicker} />

      {/* Picker modal */}
      <div className="spellPicker">
        {/* Header */}
        <div className="spellPicker__header">
          <span className="spellPicker__title">✦ Cast Spell</span>
          <button type="button" className="spellPicker__close" onClick={closePicker}>×</button>
        </div>

        {/* Search */}
        <div className="spellPicker__search">
          <input
            ref={inputRef}
            type="text"
            className="spellPicker__searchInput"
            placeholder="Search spells..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Type tabs */}
        <div className="spellPicker__tabs">
          <button
            type="button"
            className={`spellPicker__tab ${activeEntityType === 'all' ? 'spellPicker__tab--active' : ''}`}
            onClick={() => setActiveEntityType('all')}
          >
            All
          </button>
          {ENTITY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`spellPicker__tab ${activeEntityType === type ? 'spellPicker__tab--active' : ''}`}
              onClick={() => setActiveEntityType(type)}
            >
              {ENTITY_TYPE_META[type].icon} {ENTITY_TYPE_META[type].label}
            </button>
          ))}
        </div>

        {/* Entity list */}
        <div className="spellPicker__list">
          {/* Recent spells section */}
          {activeEntityType === 'all' && !searchQuery && recentSpells.length > 0 && (
            <div className="spellPicker__section">
              <div className="spellPicker__sectionHeader">Recent</div>
              {recentSpells.slice(0, 3).map((recent, i) => {
                const entity = entities.find(e => e.id === recent.entityId);
                if (!entity) return null;
                return (
                  <button
                    key={`recent-${i}`}
                    type="button"
                    className="spellPicker__entityRow spellPicker__entityRow--recent"
                    onClick={() => handleInvoke(entity, recent.spellName)}
                    disabled={invoking}
                  >
                    <span className="spellPicker__entityIcon">{entity.icon ?? ENTITY_TYPE_META[entity.type].icon}</span>
                    <span className="spellPicker__entityLabel">{entity.label}</span>
                    {recent.spellName !== 'void' && (
                      <span className="spellPicker__spellBadge">{recent.spellName}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Grouped view (all tab) */}
          {groupedEntities && Object.entries(groupedEntities).map(([type, typeEntities]) => (
            <div key={type} className="spellPicker__section">
              <div className="spellPicker__sectionHeader">
                {ENTITY_TYPE_META[type as SpellEntityType].icon} {ENTITY_TYPE_META[type as SpellEntityType].label}
              </div>
              {typeEntities.map(renderEntity)}
            </div>
          ))}

          {/* Flat view (specific tab) */}
          {!groupedEntities && filteredEntities.map(renderEntity)}

          {/* Empty state */}
          {filteredEntities.length === 0 && (
            <div className="spellPicker__empty">
              {searchQuery ? `No spells matching "${searchQuery}"` : 'No spell entities available'}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
});
```

### 5.3 SpellPicker Integration Point

Render `SpellPicker` in `AppModals.tsx` or at the `App.tsx` level (alongside other global portals):

```tsx
import { SpellPicker } from '../maestro/SpellPicker';

// Inside AppModals or App root:
<SpellPicker />
```

---

## 6. Hooks

### 6.1 `useSpells()`

New file: `maestro-ui/src/hooks/useSpells.ts`

```typescript
import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSpellStore } from '../stores/useSpellStore';
import type { SpellEntityType } from '../app/types/maestro';

/**
 * Hook to access spell entities with optional type filtering.
 */
export function useSpells(filterType?: SpellEntityType) {
  const { entities, entitiesByType, fetchEntities } = useSpellStore(
    useShallow((s) => ({
      entities: s.entities,
      entitiesByType: s.entitiesByType,
      fetchEntities: s.fetchEntities,
    }))
  );

  // Fetch on mount
  useEffect(() => {
    if (entities.length === 0) {
      fetchEntities();
    }
  }, [entities.length, fetchEntities]);

  const filtered = useMemo(() => {
    if (!filterType) return entities;
    return entitiesByType[filterType] ?? [];
  }, [entities, entitiesByType, filterType]);

  return { entities: filtered, allEntities: entities };
}
```

### 6.2 `useSpellInvocation()`

New file: `maestro-ui/src/hooks/useSpellInvocation.ts`

```typescript
import { useCallback } from 'react';
import { useSpellStore } from '../stores/useSpellStore';
import type { SpellEntityType } from '../app/types/maestro';

/**
 * Hook for invoking spells programmatically (e.g., from keyboard shortcuts or drag-drop).
 */
export function useSpellInvocation() {
  const invokeSpell = useSpellStore((s) => s.invokeSpell);
  const invoking = useSpellStore((s) => s.invoking);

  const invoke = useCallback(
    (entityType: SpellEntityType, entityId: string, spellName: string, targetSessionId: string) => {
      return invokeSpell({ entityType, entityId, spellName, targetSessionId });
    },
    [invokeSpell]
  );

  return { invoke, invoking };
}
```

---

## 7. CSS — `styles-spells.css`

New file: `maestro-ui/src/styles-spells.css`

```css
/* ═══════════════════════════════════════════════════
   SPELLS — Terminal Overlay Button & Picker
   ═══════════════════════════════════════════════════ */

/* ─── Spell Button (Terminal Overlay) ─── */

.spellButton {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 100;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.3);
  background: rgba(var(--theme-primary-rgb), 0.08);
  color: var(--theme-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0.6;
  backdrop-filter: blur(4px);
}

.spellButton:hover {
  opacity: 1;
  border-color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.15);
  box-shadow: 0 0 12px rgba(var(--theme-primary-rgb), 0.3);
  transform: scale(1.1);
}

.spellButton:active {
  transform: scale(0.95);
}

.spellButton__icon {
  font-size: 16px;
  line-height: 1;
}

/* ─── Spell Picker Backdrop ─── */

.spellPicker__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  animation: spellFadeIn 0.1s ease-out;
}

/* ─── Spell Picker Modal ─── */

.spellPicker {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(520px, calc(100% - 32px));
  max-height: 70vh;
  background: linear-gradient(180deg,
    var(--style-surface-2, rgba(16, 21, 30, 0.98)),
    var(--style-surface-1, rgba(10, 14, 22, 0.98)));
  border: 1px solid rgba(var(--theme-primary-rgb), 0.2);
  border-radius: var(--style-radius-xl, 16px);
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(var(--theme-primary-rgb), 0.06),
    0 0 30px rgba(var(--theme-primary-rgb), 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1001;
  animation: spellSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes spellSlideIn {
  from {
    transform: translate(-50%, -48%) scale(0.96);
    opacity: 0;
  }
  to {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

@keyframes spellFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ─── Header ─── */

.spellPicker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.spellPicker__title {
  font-family: var(--style-font-ui, 'JetBrains Mono', monospace);
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-primary);
  letter-spacing: var(--style-letter-spacing, 0.5px);
  text-transform: var(--style-text-transform, uppercase);
}

.spellPicker__close {
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.15s ease;
}

.spellPicker__close:hover {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}

/* ─── Search ─── */

.spellPicker__search {
  padding: 8px 16px;
}

.spellPicker__searchInput {
  width: 100%;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--style-radius-sm, 8px);
  color: var(--text);
  font-family: var(--style-font-ui, 'JetBrains Mono', monospace);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease;
}

.spellPicker__searchInput:focus {
  border-color: rgba(var(--theme-primary-rgb), 0.4);
  box-shadow: 0 0 0 2px rgba(var(--theme-primary-rgb), 0.1);
}

.spellPicker__searchInput::placeholder {
  color: var(--muted);
  opacity: 0.5;
}

/* ─── Type Tabs ─── */

.spellPicker__tabs {
  display: flex;
  gap: 2px;
  padding: 4px 16px 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.spellPicker__tabs::-webkit-scrollbar {
  display: none;
}

.spellPicker__tab {
  flex-shrink: 0;
  padding: 5px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--style-radius-sm, 6px);
  color: var(--muted);
  font-family: var(--style-font-ui, 'JetBrains Mono', monospace);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.spellPicker__tab:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
}

.spellPicker__tab--active {
  background: rgba(var(--theme-primary-rgb), 0.1);
  border-color: rgba(var(--theme-primary-rgb), 0.25);
  color: var(--theme-primary);
}

/* ─── Entity List ─── */

.spellPicker__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  min-height: 0;
}

.spellPicker__list::-webkit-scrollbar {
  width: 6px;
}

.spellPicker__list::-webkit-scrollbar-thumb {
  background: rgba(var(--theme-primary-rgb), 0.15);
  border-radius: 3px;
}

.spellPicker__list::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--theme-primary-rgb), 0.25);
}

/* ─── Sections (grouped view) ─── */

.spellPicker__section {
  margin-bottom: 12px;
}

.spellPicker__sectionHeader {
  font-family: var(--style-font-ui, 'JetBrains Mono', monospace);
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 6px 12px 4px;
}

/* ─── Entity Row ─── */

.spellPicker__entity {
  margin-bottom: 1px;
}

.spellPicker__entityRow {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: var(--style-radius-sm, 6px);
  color: var(--text);
  cursor: pointer;
  font-family: var(--style-font-ui, 'JetBrains Mono', monospace);
  font-size: 13px;
  text-align: left;
  transition: background 0.1s ease;
}

.spellPicker__entityRow:hover {
  background: rgba(255, 255, 255, 0.04);
}

.spellPicker__entityRow:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spellPicker__entityRow--recent {
  opacity: 0.8;
}

.spellPicker__entityRow--recent:hover {
  opacity: 1;
}

.spellPicker__entityIcon {
  flex-shrink: 0;
  width: 20px;
  text-align: center;
  font-size: 14px;
}

.spellPicker__entityLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spellPicker__entityType {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--muted);
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.spellPicker__entityExpand {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--muted);
}

.spellPicker__spellBadge {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(var(--theme-primary-rgb), 0.1);
  color: var(--theme-primary);
  border: 1px solid rgba(var(--theme-primary-rgb), 0.2);
}

/* ─── Spell List (expanded) ─── */

.spellPicker__spellList {
  padding-left: 42px;
  margin-bottom: 4px;
}

.spellPicker__spellRow {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-left: 2px solid rgba(var(--theme-primary-rgb), 0.15);
  color: var(--muted);
  cursor: pointer;
  font-family: var(--style-font-ui, 'JetBrains Mono', monospace);
  font-size: 12px;
  text-align: left;
  transition: all 0.1s ease;
}

.spellPicker__spellRow:hover {
  color: var(--theme-primary);
  border-left-color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.05);
}

.spellPicker__spellRow:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spellPicker__spellName {
  font-size: 12px;
}

/* ─── Empty State ─── */

.spellPicker__empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  opacity: 0.6;
}
```

Import in `App.tsx` or the CSS entry point:
```typescript
import './styles-spells.css';
```

---

## 8. ASCII Mockups

### 8.1 Spell Button Position on Terminal

```
┌─────────────────────────────────────────────────────────┐
│ [Tab1] [Tab2] [Tab3*]                    [+] [-] [□]   │  ← Session tabs
├─────────────────────────────────────────────────────────┤
│ ┌─ SESSION LOG STRIP ─────────────────────────────────┐ │
│ │ ◉ Working · 12.4k tokens · 2m 15s     [Expand ▾]   │ │  ← Existing overlay
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ $ claude                                                │
│ > I'll help you with that task. Let me start by...      │
│ > Reading the codebase structure...                     │
│                                                         │
│ > Found 3 relevant files:                               │
│   - src/components/Auth.tsx                             │
│   - src/hooks/useAuth.ts                                │
│   - src/api/auth.ts                                     │
│                                                         │
│                                                         │
│                                                         │
│                                                   ┌───┐ │
│                                                   │ ✦ │ │  ← Spell button
│                                                   └───┘ │     (bottom-right)
└─────────────────────────────────────────────────────────┘
```

### 8.2 Spell Picker Modal Layout

```
            ┌───────────────────────────────────────┐
            │  ✦ Cast Spell                     [×] │
            ├───────────────────────────────────────┤
            │  ┌─────────────────────────────────┐  │
            │  │ 🔍 Search spells...             │  │
            │  └─────────────────────────────────┘  │
            │                                       │
            │  [All] [⚡Skills] [👤Team] [☐Tasks]   │
            │  [📄Docs] [▶Sessions] [✎Custom]      │
            │                                       │
            │  ─── Recent ───────────────────────── │
            │  ⚡ code-review              [refer]  │
            │  👤 Server Architect                   │
            │  ☐ Fix login bug                       │
            │                                       │
            │  ─── Skills ───────────────────────── │
            │  ⚡ code-review                     ▾ │
            │  ⚡ test-runner                     ▾ │
            │  ⚡ deploy                          ▾ │
            │                                       │
            │  ─── Team Members ─────────────────── │
            │  👤 Server Architect                   │
            │  👤 UI Architect                       │
            │  👤 CLI Architect                      │
            │                                       │
            │  ─── Tasks ───────────────────────── │
            │  ☐ Fix login bug                    ▾ │
            │  ☐ Add dark mode                    ▾ │
            └───────────────────────────────────────┘
```

### 8.3 Expanded Spell Entity (Multiple Spells)

```
            │  ─── Tasks ───────────────────────── │
            │  ☐ Fix login bug                    ▴ │  ← Expanded
            │    ├─ Refer to task                    │  ← Sub-spells
            │    ├─ Execute task                     │
            │    └─ Get task details (default)       │
            │  ☐ Add dark mode                    ▾ │  ← Collapsed
            │  ☐ Refactor auth                    ▾ │
```

---

## 9. File Structure Summary

```
maestro-ui/src/
├── app/types/maestro.ts          # + SpellEntity, SpellDefinition, SpellInvocation types
├── stores/
│   ├── useMaestroStore.ts        # + 'spell:invoked' case in handleSingleMessage
│   └── useSpellStore.ts          # NEW — Spell state management
├── hooks/
│   ├── useSpells.ts              # NEW — Access spell entities
│   └── useSpellInvocation.ts     # NEW — Programmatic spell invocation
├── components/
│   ├── maestro/
│   │   ├── SpellButton.tsx       # NEW — Terminal overlay button
│   │   └── SpellPicker.tsx       # NEW — Modal picker with search + tabs
│   └── app/
│       ├── AppWorkspace.tsx      # + SpellButton rendered in terminalPane
│       └── AppModals.tsx         # + SpellPicker rendered globally
├── styles-spells.css             # NEW — All spell-related CSS
└── App.tsx                       # + import styles-spells.css
```

---

## 10. Integration Points with Server & CLI

### API Contract (UI ↔ Server)

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/spells/definitions` | GET | — | `SpellDefinition[]` — all spell definitions |
| `/api/spells/entities/:type` | GET | `?projectId=X` | `SpellEntity[]` — entities for a given type |
| `/api/spells/invoke` | POST | `SpellInvocation` | `{ success: true }` |
| `/api/spells/custom-prompts` | GET | — | `SpellEntity[]` — custom prompt entities |
| `/api/spells/custom-prompts` | POST | `{ label, content }` | `SpellEntity` |
| `/api/spells/custom-prompts/:id` | PATCH | `{ label?, content? }` | `SpellEntity` |
| `/api/spells/custom-prompts/:id` | DELETE | — | `204` |

### WebSocket Events (Server → UI)

| Event | Direction | Payload | Handling |
|-------|-----------|---------|----------|
| `spell:invoked` | Server → UI | `SpellInvokedEvent` | Inject prompt into target session PTY |

### Prompt Injection Flow

```
SpellPicker.invokeSpell()
    │
    ▼
POST /api/spells/invoke { entityType, entityId, spellName, targetSessionId }
    │
    ▼ (Server resolves entity, builds prompt)
    │
WebSocket: spell:invoked { sessionId, content, ... }
    │
    ▼ (useMaestroStore.handleSingleMessage)
    │
invoke('write_to_session', { id: ptyId, data: content, source: 'system' })
    │
    ▼
Prompt appears in terminal, agent processes it
```

---

## 11. Open Questions

1. **Keyboard shortcut**: Should there be a global shortcut to open the spell picker (e.g., `Cmd+Shift+S`)? Would integrate with existing `useKeyboardShortcuts.ts`.

2. **Spell entity refresh**: Should entities refresh periodically or only when the picker opens? Current design refreshes on picker open.

3. **Multi-session targeting**: Should users be able to cast spells to any session (not just active)? Current design targets the active terminal session.

4. **Custom prompt creation**: Should users be able to create custom prompts from the picker itself, or only through a separate management interface?

5. **Spell confirmation**: Should some spells (e.g., execute task) show a confirmation dialog before sending?
