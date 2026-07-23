// src/state/collab/spacesStore.ts — Zustand store for the user's Collab Spaces.
// Subscribes to SpacesClient.subscribeToAllForUser on mount (started from
// SpacesHome via startSpacesSubscription/stopSpacesSubscription). Groups spaces
// by githubUrl client-side (no composite index needed). Wraps every mutating
// SpacesClient action with per-action busy + error state for optimistic UI.
import { create } from 'zustand';

import {
  SpacesClient,
  type CollabSpace,
  type CreateCollabSpaceInput,
  type CollabSpaceVisibility,
} from '@/services/collab';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpacesByRepo {
  githubUrl: string;
  githubOwner: string;
  githubRepo: string;
  spaces: CollabSpace[];
}

/** Per-action mutation state so the UI can show per-button spinners/errors. */
export interface ActionState {
  busy: boolean;
  error: string | null;
}

function freshAction(): ActionState {
  return { busy: false, error: null };
}

export interface SpacesState {
  // ── Subscription data ──────────────────────────────────────────────────────
  spaces: CollabSpace[];
  loading: boolean;
  error: string | null;

  // ── Derived (selector) ────────────────────────────────────────────────────
  /** Groups the current `spaces` list by githubUrl, sorted alphabetically. */
  spacesByRepo: () => SpacesByRepo[];

  // ── Per-action mutation state ─────────────────────────────────────────────
  createAction: ActionState;
  joinAction: ActionState;
  leaveAction: ActionState;
  updateAction: ActionState;
  removeAction: ActionState;
  memberRoleAction: ActionState;
  removeMemberAction: ActionState;

  // ── Internal subscription lifecycle ───────────────────────────────────────
  _unsub: (() => void) | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Start the Firestore subscription for the given uid. Idempotent. */
  startSpacesSubscription: (uid: string) => void;
  /** Tear down the active Firestore subscription. */
  stopSpacesSubscription: () => void;

  /** Wraps SpacesClient.create — pushes to router on success. */
  createSpace: (
    user: Parameters<typeof SpacesClient.create>[0],
    input: CreateCollabSpaceInput,
  ) => Promise<CollabSpace | null>;

  joinSpace: (
    user: Parameters<typeof SpacesClient.join>[0],
    spaceId: string,
  ) => Promise<void>;

  leaveSpace: (uid: string, spaceId: string) => Promise<void>;

  updateSpace: (
    spaceId: string,
    patch: Partial<Pick<CollabSpace, 'name' | 'description' | 'visibility'>>,
  ) => Promise<void>;

  removeSpace: (spaceId: string) => Promise<void>;

  setMemberRole: (
    spaceId: string,
    targetUid: string,
    role: 'admin' | 'member',
  ) => Promise<void>;

  removeMember: (spaceId: string, targetUid: string) => Promise<void>;
}

// ── Stable empty array (avoids useSyncExternalStore identity churn) ───────────
const EMPTY_SPACES: CollabSpace[] = [];

function groupByRepo(spaces: CollabSpace[]): SpacesByRepo[] {
  const map = new Map<string, SpacesByRepo>();
  for (const s of spaces) {
    const existing = map.get(s.githubUrl);
    if (existing) {
      existing.spaces.push(s);
    } else {
      map.set(s.githubUrl, {
        githubUrl: s.githubUrl,
        githubOwner: s.githubOwner,
        githubRepo: s.githubRepo,
        spaces: [s],
      });
    }
  }
  // Sort repos alphabetically; spaces within each repo by name
  return Array.from(map.values())
    .sort((a, b) => a.githubUrl.localeCompare(b.githubUrl))
    .map((g) => ({ ...g, spaces: g.spaces.slice().sort((a, b) => a.name.localeCompare(b.name)) }));
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSpacesStore = create<SpacesState>((set, get) => ({
  spaces: EMPTY_SPACES,
  loading: false,
  error: null,

  spacesByRepo: () => groupByRepo(get().spaces),

  createAction: freshAction(),
  joinAction: freshAction(),
  leaveAction: freshAction(),
  updateAction: freshAction(),
  removeAction: freshAction(),
  memberRoleAction: freshAction(),
  removeMemberAction: freshAction(),

  _unsub: null,

  startSpacesSubscription(uid: string) {
    // Tear down any prior subscription before starting a new one
    get().stopSpacesSubscription();
    set({ loading: true, error: null });

    const unsub = SpacesClient.subscribeToAllForUser(
      uid,
      (spaces) => set({ spaces: spaces.length ? spaces : EMPTY_SPACES, loading: false, error: null }),
      (err) => set({ loading: false, error: err.message }),
    );
    set({ _unsub: unsub });
  },

  stopSpacesSubscription() {
    const unsub = get()._unsub;
    if (unsub) {
      unsub();
      set({ _unsub: null });
    }
  },

  async createSpace(user, input) {
    set({ createAction: { busy: true, error: null } });
    try {
      const space = await SpacesClient.create(user, input);
      set({ createAction: freshAction() });
      return space;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ createAction: { busy: false, error } });
      return null;
    }
  },

  async joinSpace(user, spaceId) {
    set({ joinAction: { busy: true, error: null } });
    try {
      await SpacesClient.join(user, spaceId);
      set({ joinAction: freshAction() });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ joinAction: { busy: false, error } });
    }
  },

  async leaveSpace(uid, spaceId) {
    set({ leaveAction: { busy: true, error: null } });
    try {
      await SpacesClient.leave(uid, spaceId);
      set({ leaveAction: freshAction() });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ leaveAction: { busy: false, error } });
    }
  },

  async updateSpace(spaceId, patch) {
    set({ updateAction: { busy: true, error: null } });
    try {
      await SpacesClient.update(spaceId, patch);
      set({ updateAction: freshAction() });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ updateAction: { busy: false, error } });
    }
  },

  async removeSpace(spaceId) {
    set({ removeAction: { busy: true, error: null } });
    try {
      await SpacesClient.remove(spaceId);
      set({ removeAction: freshAction() });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ removeAction: { busy: false, error } });
    }
  },

  async setMemberRole(spaceId, targetUid, role) {
    set({ memberRoleAction: { busy: true, error: null } });
    try {
      await SpacesClient.setMemberRole(spaceId, targetUid, role);
      set({ memberRoleAction: freshAction() });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ memberRoleAction: { busy: false, error } });
    }
  },

  async removeMember(spaceId, targetUid) {
    set({ removeMemberAction: { busy: true, error: null } });
    try {
      await SpacesClient.removeMember(spaceId, targetUid);
      set({ removeMemberAction: freshAction() });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ removeMemberAction: { busy: false, error } });
    }
  },
}));

/** Convenience lifecycle exports so SpacesHome can call them without the store ref. */
export const startSpacesSubscription = (uid: string): void =>
  useSpacesStore.getState().startSpacesSubscription(uid);

export const stopSpacesSubscription = (): void =>
  useSpacesStore.getState().stopSpacesSubscription();
