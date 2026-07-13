import { create } from 'zustand';

/**
 * Spell Studio shell state (Track UI-A). Drives the unified Studio modal:
 * Library (S1) · Detail (S2) · Cast (S4) · Entities/Casts (S10), plus the
 * editor overlay (mounts UI-B's <SpellEditor>) and UI-C surfaces
 * (active/spellbook/ensemble/observability).
 *
 * The legacy `useSpellLauncherStore.openLauncher(...)` remains the request
 * channel used by session tiles / spaces-rail / keyboard; SpellStudio bridges
 * that into `openStudio({ route: 'cast', ... })` so no existing call site breaks.
 */

export type StudioRoute = 'library' | 'cast' | 'entities' | 'spellbook';

export type StudioCastMode = 'single' | 'broadcast' | 'coordinate';

export interface EditorState {
  mode: 'create' | 'edit';
  /** Spell being edited (edit mode) or seed being duplicated (create mode). */
  sourceSpellId?: string | null;
  /** When true the source is a seed and we're creating a custom copy of it. */
  duplicating?: boolean;
}

export interface OpenStudioInput {
  route?: StudioRoute;
  /** Preselect a spell (drives Detail + preselected cast target). */
  selectedSpellId?: string | null;
  /** Cast context (from a session tile / spaces-rail / keyboard). */
  targetSessionIds?: string[];
  preselectCastMode?: StudioCastMode;
  /** Attach-to-task mode (writes Task.spellIds instead of casting). */
  attachTaskId?: string | null;
}

interface SpellStudioState {
  isOpen: boolean;
  route: StudioRoute;
  selectedSpellId: string | null;

  /** Cast context carried into the Cast surface. */
  castTargetSessionIds: string[];
  preselectCastMode: StudioCastMode | null;
  attachTaskId: string | null;

  /** Editor overlay (mounts UI-B). null = closed. */
  editor: EditorState | null;

  openStudio: (input?: OpenStudioInput) => void;
  close: () => void;
  navigate: (route: StudioRoute) => void;
  selectSpell: (id: string | null) => void;
  /** Open the editor overlay (UI-B). */
  openEditor: (state: EditorState) => void;
  closeEditor: () => void;
}

export const useSpellStudioStore = create<SpellStudioState>((set) => ({
  isOpen: false,
  route: 'library',
  selectedSpellId: null,
  castTargetSessionIds: [],
  preselectCastMode: null,
  attachTaskId: null,
  editor: null,

  openStudio: (input = {}) => set({
    isOpen: true,
    route: input.route ?? (input.targetSessionIds?.length ? 'cast' : 'library'),
    selectedSpellId: input.selectedSpellId ?? null,
    castTargetSessionIds: input.targetSessionIds ?? [],
    preselectCastMode: input.preselectCastMode ?? null,
    attachTaskId: input.attachTaskId ?? null,
    editor: null,
  }),

  close: () => set({
    isOpen: false,
    editor: null,
    attachTaskId: null,
    castTargetSessionIds: [],
    preselectCastMode: null,
  }),

  navigate: (route) => set({ route }),
  selectSpell: (selectedSpellId) => set({ selectedSpellId }),
  openEditor: (editor) => set({ editor }),
  closeEditor: () => set({ editor: null }),
}));
