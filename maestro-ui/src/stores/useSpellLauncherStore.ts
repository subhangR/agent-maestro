import { create } from 'zustand';
import type { SpellCategory } from '../app/types/maestro';

export type LauncherSource =
  | 'session-tile'
  | 'spaces-rail'
  | 'command-palette'
  | 'task-tile'
  | 'ensemble'
  | 'workspace';

export type LauncherMode = 'cast' | 'attach';

export interface OpenLauncherInput {
  targetSessionIds: string[];
  preselectSpellId?: string;
  initialCategory?: SpellCategory;
  source: LauncherSource;
  /** Attach mode (task-tile): writes Task.spellIds instead of casting. */
  mode?: LauncherMode;
  taskId?: string;
  /** Preselect coordinate cast (multi-target spaces-rail shortcut). */
  preselectCastMode?: 'single' | 'broadcast' | 'coordinate';
}

interface LauncherState {
  isOpen: boolean;
  source: LauncherSource | null;
  mode: LauncherMode;
  taskId: string | null;
  targetSessionIds: string[];
  preselectSpellId: string | null;
  initialCategory: SpellCategory | null;
  preselectCastMode: 'single' | 'broadcast' | 'coordinate' | null;

  openLauncher: (input: OpenLauncherInput) => void;
  closeLauncher: () => void;
}

export const useSpellLauncherStore = create<LauncherState>((set) => ({
  isOpen: false,
  source: null,
  mode: 'cast',
  taskId: null,
  targetSessionIds: [],
  preselectSpellId: null,
  initialCategory: null,
  preselectCastMode: null,

  openLauncher: (input) => set({
    isOpen: true,
    source: input.source,
    mode: input.mode ?? 'cast',
    taskId: input.taskId ?? null,
    targetSessionIds: input.targetSessionIds,
    preselectSpellId: input.preselectSpellId ?? null,
    initialCategory: input.initialCategory ?? null,
    preselectCastMode: input.preselectCastMode ?? null,
  }),

  closeLauncher: () => set({
    isOpen: false,
    source: null,
    mode: 'cast',
    taskId: null,
    targetSessionIds: [],
    preselectSpellId: null,
    initialCategory: null,
    preselectCastMode: null,
  }),
}));
