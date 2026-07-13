// The sheet stack store. A single Zustand store (Ledger's state lib — no second
// state library) holding the ordered stack of open sheets. The stack supports
// the `raise` case: a picker opened on top of a form pushes a second entry;
// dismissing it pops back to the form.
//
// This store is Compass-owned navigation machinery. It follows Ledger's Zustand
// 5 conventions but lives under navigation/ because it is pure UI-routing state,
// not server-entity state (the one entityStore stays the sole `set()` writer for
// entities).
import { create } from 'zustand';
import type { SheetIntent } from './types';

export interface SheetStackEntry {
  /** Stable id for React keys + ref maps (monotonic counter, not random). */
  id: string;
  intent: SheetIntent;
}

export interface SheetStoreState {
  stack: SheetStackEntry[];
  open: (intent: SheetIntent) => void;
  /** Remove a specific entry (fired by gorhom `onDismiss`). */
  remove: (id: string) => void;
  /** Pop the top entry. */
  pop: () => void;
  /** Clear the whole stack. */
  clear: () => void;
}

let seq = 0;
const nextId = (): string => `sheet_${(seq += 1)}`;

export const useSheetStore = create<SheetStoreState>((set) => ({
  stack: [],
  open: (intent) =>
    set((s) => ({ stack: [...s.stack, { id: nextId(), intent }] })),
  remove: (id) => set((s) => ({ stack: s.stack.filter((e) => e.id !== id) })),
  pop: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  clear: () => set({ stack: [] }),
}));
