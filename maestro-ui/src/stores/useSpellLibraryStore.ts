import { create } from 'zustand';
import { maestroClient } from '../utils/MaestroClient';
import type { Spell, SpellCategory, CreateSpellPayload, UpdateSpellPayload } from '../app/types/maestro';

const RECENT_KEY = 'maestro:spell-recents';
const RECENT_CAP = 8;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_CAP) : [];
  } catch { return []; }
}

function persistRecents(ids: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, RECENT_CAP))); } catch { /* */ }
}

/** Map a Spell to a launcher category. Custom = !isDefault. */
export function categoryForSpell(s: Spell): SpellCategory {
  if (!s.isDefault) return 'custom';
  switch (s.action) {
    case 'gate':            return 'gate';
    case 'notify-channel':  return 'notify';
    case 'continue-loop':
    case 'run-command':
    case 'inject-prompt':   return 'execute';
    case 'feed-context':    return 'plan';
    default:                return 'featured';
  }
}

interface SpellLibraryState {
  spells: Spell[];
  loading: boolean;
  error: string | null;
  recentSpellIds: string[];

  fetchLibrary: () => Promise<void>;
  upsertSpell: (spell: Spell) => void;
  removeSpell: (id: string) => void;

  createSpell: (payload: CreateSpellPayload) => Promise<Spell>;
  updateSpell: (id: string, payload: UpdateSpellPayload) => Promise<Spell>;
  deleteSpell: (id: string) => Promise<void>;

  /** Move a spell to the front of recents (called after a successful cast). */
  trackRecent: (id: string) => void;

  spellById: (id: string) => Spell | undefined;
}

export const useSpellLibraryStore = create<SpellLibraryState>((set, get) => ({
  spells: [],
  loading: false,
  error: null,
  recentSpellIds: loadRecents(),

  fetchLibrary: async () => {
    set({ loading: true, error: null });
    try {
      const spells = await maestroClient.listSpells();
      set({ spells, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'Failed to load spells' });
    }
  },

  upsertSpell: (spell) => set((s) => {
    const others = s.spells.filter((x) => x.id !== spell.id);
    return { spells: [...others, spell] };
  }),

  removeSpell: (id) => set((s) => ({ spells: s.spells.filter((x) => x.id !== id) })),

  createSpell: async (payload) => {
    const spell = await maestroClient.createSpell(payload);
    get().upsertSpell(spell);
    return spell;
  },

  updateSpell: async (id, payload) => {
    const spell = await maestroClient.updateSpell(id, payload);
    get().upsertSpell(spell);
    return spell;
  },

  deleteSpell: async (id) => {
    await maestroClient.deleteSpell(id);
    get().removeSpell(id);
  },

  trackRecent: (id) => set((s) => {
    const next = [id, ...s.recentSpellIds.filter((x) => x !== id)].slice(0, RECENT_CAP);
    persistRecents(next);
    return { recentSpellIds: next };
  }),

  spellById: (id) => get().spells.find((s) => s.id === id),
}));

/**
 * Group spells into the launcher's nav categories.
 *
 * NOTE: this allocates a fresh object every call, so it must NOT be passed
 * directly to a Zustand hook as a selector — `useSyncExternalStore` would see a
 * new snapshot reference on every store read and loop forever (React #185).
 * Call it inside a `useMemo` keyed on the spells array instead.
 */
export function groupSpellsByCategory(spells: Spell[]): Record<SpellCategory, Spell[]> {
  const empty: Record<SpellCategory, Spell[]> = {
    featured: [], execute: [], plan: [], gate: [], notify: [], custom: [], skills: [],
  };
  for (const s of spells) {
    empty[categoryForSpell(s)].push(s);
  }
  return empty;
}
