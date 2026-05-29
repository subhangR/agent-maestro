import { create } from 'zustand';
import { maestroClient } from '../utils/MaestroClient';
import { useProjectStore } from './useProjectStore';
import type { SpellEntity, SpellDefinition, SpellEntityType, SpellInvocation } from '../app/types/maestro';

interface SpellState {
  // Available spell entities (fetched from server)
  entities: SpellEntity[];
  entitiesByType: Record<SpellEntityType, SpellEntity[]>;

  // UI state
  isPickerOpen: boolean;
  targetSessionId: string | null;
  activeEntityType: SpellEntityType | 'all';

  // Create / edit form state
  isCreating: boolean;
  createEntityType: SpellEntityType | null;
  createSaving: boolean;
  editingEntityId: string | null;
  editInitialValues: { name: string; content: string; description?: string; icon?: string } | null;

  // Invocation state
  invoking: boolean;
  lastInvokedSpell: { entityId: string; spellName: string } | null;

  // Recent spells (persisted to localStorage)
  recentSpells: Array<{ entityType: SpellEntityType; entityId: string; spellName: string; label: string; timestamp: number }>;

  // Actions
  fetchEntities: (projectId?: string) => Promise<void>;
  openPicker: (targetSessionId: string) => void;
  closePicker: () => void;
  setActiveEntityType: (type: SpellEntityType | 'all') => void;
  invokeSpell: (invocation: SpellInvocation) => Promise<void>;
  startCreating: (entityType: SpellEntityType) => void;
  startEditing: (entityId: string, entityType: SpellEntityType) => Promise<void>;
  cancelCreating: () => void;
  saveSpellEntity: (data: { name: string; content: string; description?: string; icon?: string; entityType: SpellEntityType }) => Promise<void>;
  deleteSpellEntity: (id: string) => Promise<void>;
}

const EMPTY_BY_TYPE: Record<SpellEntityType, SpellEntity[]> = {
  maestro: [], skill: [], 'team-member': [], task: [], doc: [], session: [], 'custom-prompt': [],
};

function groupByType(entities: SpellEntity[]): Record<SpellEntityType, SpellEntity[]> {
  const result: Record<SpellEntityType, SpellEntity[]> = { ...EMPTY_BY_TYPE, maestro: [], skill: [], 'team-member': [], task: [], doc: [], session: [], 'custom-prompt': [] };
  for (const entity of entities) {
    result[entity.type]?.push(entity);
  }
  return result;
}

/** Server returns { name, availableSpells: string[] } but UI expects { label, spells: SpellDefinition[] } */
function transformServerEntity(
  raw: any,
  definitionsByType: Record<string, SpellDefinition[]>,
): SpellEntity {
  const availableSpells: string[] = raw.availableSpells ?? [];
  const entityType: SpellEntityType = raw.type;
  const defs = definitionsByType[entityType] ?? [];

  return {
    id: raw.id,
    type: entityType,
    label: raw.name ?? raw.label ?? '',
    icon: raw.icon,
    metadata: raw.metadata,
    spells: availableSpells.map(spellName => {
      const def = defs.find(d => d.name === spellName);
      return def ?? { name: spellName, label: spellName, description: undefined };
    }),
  };
}

const ALL_ENTITY_TYPES: SpellEntityType[] = ['maestro', 'skill', 'team-member', 'task', 'doc', 'session', 'custom-prompt'];

export const useSpellStore = create<SpellState>((set, get) => {
  // Restore recent spells from localStorage
  let recentSpells: SpellState['recentSpells'] = [];
  try {
    const raw = localStorage.getItem('maestro:recentSpells');
    if (raw) recentSpells = JSON.parse(raw);
  } catch { /* best-effort */ }

  return {
    entities: [],
    entitiesByType: { ...EMPTY_BY_TYPE },
    isPickerOpen: false,
    targetSessionId: null,
    activeEntityType: 'all',
    isCreating: false,
    createEntityType: null,
    createSaving: false,
    editingEntityId: null,
    editInitialValues: null,
    invoking: false,
    lastInvokedSpell: null,
    recentSpells,

    fetchEntities: async (projectId?: string) => {
      try {
        const pid = projectId || useProjectStore.getState().activeProjectId;
        if (!pid) return;

        // Fetch entities and definitions in parallel
        const [rawResults, allDefs] = await Promise.all([
          Promise.all(
            ALL_ENTITY_TYPES.map(type => maestroClient.getSpellEntities(type, pid).catch(() => []))
          ),
          maestroClient.getSpellDefinitions().catch(() => []),
        ]);

        // Build a lookup of definitions by entity type
        const definitionsByType: Record<string, SpellDefinition[]> = {};
        for (const def of allDefs) {
          const et = (def as any).entityType as string;
          if (!definitionsByType[et]) definitionsByType[et] = [];
          definitionsByType[et].push({ name: def.name, label: def.label, description: def.description });
        }

        // Transform server entities to UI shape
        const all: SpellEntity[] = rawResults.flat().map(raw => transformServerEntity(raw, definitionsByType));
        const byType = groupByType(all);
        set({ entities: all, entitiesByType: byType });
      } catch { /* best-effort */ }
    },

    openPicker: (targetSessionId) => {
      set({ isPickerOpen: true, targetSessionId, activeEntityType: 'all' });
      get().fetchEntities();
    },

    closePicker: () => set({ isPickerOpen: false, targetSessionId: null, isCreating: false, createEntityType: null, editingEntityId: null, editInitialValues: null }),

    setActiveEntityType: (type) => set({ activeEntityType: type }),

    invokeSpell: async (invocation) => {
      set({ invoking: true });
      try {
        await maestroClient.invokeSpell(invocation);
        const entity = get().entities.find(e => e.id === invocation.entityId);
        set((prev) => {
          const recent = [
            { entityType: invocation.entityType, entityId: invocation.entityId, spellName: invocation.spellName, label: entity?.label ?? '', timestamp: Date.now() },
            ...prev.recentSpells.filter(r => !(r.entityId === invocation.entityId && r.spellName === invocation.spellName)),
          ].slice(0, 10);
          try { localStorage.setItem('maestro:recentSpells', JSON.stringify(recent)); } catch { /* */ }
          return { lastInvokedSpell: { entityId: invocation.entityId, spellName: invocation.spellName }, recentSpells: recent };
        });
        get().closePicker();
      } catch (err) {
        console.error('Spell invocation failed:', err);
      } finally {
        set({ invoking: false });
      }
    },

    startCreating: (entityType) => set({ isCreating: true, createEntityType: entityType, editingEntityId: null, editInitialValues: null }),

    startEditing: async (entityId, entityType) => {
      try {
        const prompts = await maestroClient.getCustomPrompts();
        const prompt = (prompts as any[]).find(p => p.id === entityId);
        if (!prompt) {
          console.error('Custom prompt not found for editing:', entityId);
          return;
        }
        set({
          isCreating: true,
          createEntityType: entityType,
          editingEntityId: entityId,
          editInitialValues: {
            name: prompt.name ?? '',
            content: prompt.content ?? '',
            description: prompt.description,
            icon: prompt.icon,
          },
        });
      } catch (err) {
        console.error('Failed to load spell for editing:', err);
      }
    },

    cancelCreating: () => set({ isCreating: false, createEntityType: null, createSaving: false, editingEntityId: null, editInitialValues: null }),

    saveSpellEntity: async (data) => {
      const { editingEntityId } = get();
      set({ createSaving: true });
      try {
        if (editingEntityId) {
          await maestroClient.updateCustomPrompt(editingEntityId, {
            name: data.name,
            content: data.content,
            description: data.description,
            icon: data.icon,
            entityType: data.entityType,
          });
        } else {
          await maestroClient.createCustomPrompt({
            name: data.name,
            content: data.content,
            description: data.description,
            icon: data.icon,
            entityType: data.entityType,
          });
        }
        set({ isCreating: false, createEntityType: null, createSaving: false, editingEntityId: null, editInitialValues: null });
        await get().fetchEntities();
      } catch (err) {
        console.error('Failed to save spell entity:', err);
        set({ createSaving: false });
      }
    },

    deleteSpellEntity: async (id) => {
      try {
        await maestroClient.deleteCustomPrompt(id);
        await get().fetchEntities();
      } catch (err) {
        console.error('Failed to delete spell entity:', err);
      }
    },
  };
});
