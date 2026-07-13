import { create } from 'zustand';

/**
 * Tiny UI store driving the SpellbookDrawer open state + initial scroll-target
 * session. Mounted globally in AppModals; toggled by Cmd/Ctrl+Shift+B and the
 * `+N` overflow click on every ring host.
 */
interface SpellbookState {
  isOpen: boolean;
  scrollToSessionId?: string;
  openSpellbook: (params?: { scrollToSessionId?: string }) => void;
  closeSpellbook: () => void;
  toggleSpellbook: () => void;
}

export const useSpellbookStore = create<SpellbookState>((set, get) => ({
  isOpen: false,
  scrollToSessionId: undefined,
  openSpellbook: (params) =>
    set({ isOpen: true, scrollToSessionId: params?.scrollToSessionId }),
  closeSpellbook: () => set({ isOpen: false, scrollToSessionId: undefined }),
  toggleSpellbook: () => set({ isOpen: !get().isOpen, scrollToSessionId: undefined }),
}));
