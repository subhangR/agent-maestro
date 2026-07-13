import { create } from 'zustand';

/**
 * Drives the "meet your new teammate" intro dialog.
 *
 * When team members are created by agents/CLI (or other clients), a
 * `team_member:created` WebSocket event arrives in useMaestroStore's handler,
 * which enqueues the new member's id here so the dialog can introduce it.
 *
 * Members created by THIS client's own create modal are suppressed — the user
 * already configured them, so there's nothing to introduce. The store action
 * `createTeamMember` calls `markLocallyCreated(id)` and the WS handler skips
 * any id that was marked (consuming the mark so it only applies once).
 */
interface TeamMemberIntroState {
  /** Ordered queue of team member ids still to introduce. */
  queue: string[];
  /** Index into `queue` of the member currently shown. */
  currentIndex: number;
  /** Whether the intro dialog is visible. */
  isOpen: boolean;
  /** Ids created by this client — their intro is suppressed once. */
  suppressedIds: Set<string>;

  /** Record an id created locally so its incoming intro event is skipped. */
  markLocallyCreated: (id: string) => void;
  /**
   * Queue a freshly-created member for introduction.
   * Returns true if it was enqueued, false if suppressed/duplicate.
   */
  enqueue: (id: string) => boolean;
  /** Advance to the next member; closes when past the end. */
  goNext: () => void;
  /** Step back to the previous member (no-op at the start). */
  goPrev: () => void;
  /** Dismiss the whole intro flow (skip / close). */
  close: () => void;
}

export const useTeamMemberIntroStore = create<TeamMemberIntroState>((set, get) => ({
  queue: [],
  currentIndex: 0,
  isOpen: false,
  suppressedIds: new Set<string>(),

  markLocallyCreated: (id) => {
    const next = new Set(get().suppressedIds);
    next.add(id);
    set({ suppressedIds: next });
  },

  enqueue: (id) => {
    const { suppressedIds, queue } = get();
    // Locally-created members are introduced silently — consume the mark.
    if (suppressedIds.has(id)) {
      const next = new Set(suppressedIds);
      next.delete(id);
      set({ suppressedIds: next });
      return false;
    }
    if (queue.includes(id)) return false;
    set({ queue: [...queue, id], isOpen: true });
    return true;
  },

  goNext: () => {
    const { currentIndex, queue } = get();
    if (currentIndex < queue.length - 1) {
      set({ currentIndex: currentIndex + 1 });
    } else {
      get().close();
    }
  },

  goPrev: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) set({ currentIndex: currentIndex - 1 });
  },

  close: () => set({ isOpen: false, queue: [], currentIndex: 0 }),
}));
