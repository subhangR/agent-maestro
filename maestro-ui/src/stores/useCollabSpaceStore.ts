import { create } from 'zustand';
import { User } from 'firebase/auth';
import { CollabSpaceClient } from '../firebase/CollabSpaceClient';
import { CollabSpace, CreateCollabSpaceInput } from '../firebase/collabSpaceTypes';
import { detectGitRemote } from '../utils/detectGitRemote';
import { ParsedGitRemote, parseGitRemote } from '../utils/parseGitRemote';

interface CollabSpaceState {
  // Per-project repo detection cache
  detectedRemoteByProject: Record<string, ParsedGitRemote | null>;
  detectionLoading: Record<string, boolean>;

  // Per-repo space lists
  mineByRepo: Record<string, CollabSpace[]>;
  publicByRepo: Record<string, CollabSpace[]>;
  listLoading: Record<string, boolean>;
  listError: Record<string, string | null>;

  // Active subscription bookkeeping
  subscriptions: Record<string, () => void>;

  // Create / join state
  creating: boolean;
  joining: boolean;
  actionError: string | null;

  detectRemote: (projectId: string, workingDir: string) => Promise<ParsedGitRemote | null>;
  setManualRemote: (projectId: string, raw: string) => ParsedGitRemote | null;
  subscribeForRepo: (githubUrl: string, uid: string) => void;
  unsubscribeForRepo: (githubUrl: string) => void;
  /** Tears down every live repo subscription and resets lists (sign-out path). */
  unsubscribeAll: () => void;
  createSpace: (user: User, input: CreateCollabSpaceInput) => Promise<CollabSpace>;
  joinSpace: (user: User, spaceId: string) => Promise<void>;
  leaveSpace: (user: User, spaceId: string) => Promise<void>;
  clearActionError: () => void;
}

/** Guards against out-of-order detectRemote resolutions per project. */
const detectionNonces: Record<string, number> = {};

export const useCollabSpaceStore = create<CollabSpaceState>((set, get) => ({
  detectedRemoteByProject: {},
  detectionLoading: {},
  mineByRepo: {},
  publicByRepo: {},
  listLoading: {},
  listError: {},
  subscriptions: {},
  creating: false,
  joining: false,
  actionError: null,

  detectRemote: async (projectId, workingDir) => {
    const nonce = (detectionNonces[projectId] ?? 0) + 1;
    detectionNonces[projectId] = nonce;
    set((s) => ({ detectionLoading: { ...s.detectionLoading, [projectId]: true } }));
    try {
      const result = await detectGitRemote(workingDir);
      // A newer detection superseded this one — drop the stale result.
      if (detectionNonces[projectId] !== nonce) return result;
      set((s) => ({
        detectedRemoteByProject: { ...s.detectedRemoteByProject, [projectId]: result },
      }));
      return result;
    } finally {
      if (detectionNonces[projectId] === nonce) {
        set((s) => ({ detectionLoading: { ...s.detectionLoading, [projectId]: false } }));
      }
    }
  },

  setManualRemote: (projectId, raw) => {
    const parsed = parseGitRemote(raw);
    set((s) => ({
      detectedRemoteByProject: { ...s.detectedRemoteByProject, [projectId]: parsed },
    }));
    return parsed;
  },

  subscribeForRepo: (githubUrl, uid) => {
    if (githubUrl in get().subscriptions) return;

    set((s) => ({
      listLoading: { ...s.listLoading, [githubUrl]: true },
      listError: { ...s.listError, [githubUrl]: null },
    }));

    const unsub = CollabSpaceClient.subscribeToRepo(githubUrl, uid, {
      onMine: (spaces) =>
        set((s) => ({
          mineByRepo: { ...s.mineByRepo, [githubUrl]: spaces },
          listLoading: { ...s.listLoading, [githubUrl]: false },
          listError: { ...s.listError, [githubUrl]: null },
        })),
      onPublic: (spaces) =>
        set((s) => ({
          publicByRepo: { ...s.publicByRepo, [githubUrl]: spaces },
          listLoading: { ...s.listLoading, [githubUrl]: false },
          listError: { ...s.listError, [githubUrl]: null },
        })),
      onError: (err) =>
        set((s) => ({
          listLoading: { ...s.listLoading, [githubUrl]: false },
          listError: {
            ...s.listError,
            [githubUrl]: err?.message ?? 'Failed to load spaces. Check your connection.',
          },
        })),
    });

    set((s) => ({ subscriptions: { ...s.subscriptions, [githubUrl]: unsub } }));
  },

  unsubscribeForRepo: (githubUrl) => {
    const unsub = get().subscriptions[githubUrl];
    if (unsub) unsub();
    set((s) => {
      const next = { ...s.subscriptions };
      delete next[githubUrl];
      return { subscriptions: next };
    });
  },

  unsubscribeAll: () => {
    Object.values(get().subscriptions).forEach((unsub) => unsub());
    set({
      subscriptions: {},
      mineByRepo: {},
      publicByRepo: {},
      listLoading: {},
      listError: {},
      creating: false,
      joining: false,
      actionError: null,
    });
  },

  createSpace: async (user, input) => {
    set({ creating: true, actionError: null });
    try {
      return await CollabSpaceClient.create(user, input);
    } catch (e: any) {
      set({ actionError: e?.message ?? 'Failed to create space' });
      throw e;
    } finally {
      set({ creating: false });
    }
  },

  joinSpace: async (user, spaceId) => {
    set({ joining: true, actionError: null });
    try {
      await CollabSpaceClient.join(user, spaceId);
    } catch (e: any) {
      set({ actionError: e?.message ?? 'Failed to join space' });
      throw e;
    } finally {
      set({ joining: false });
    }
  },

  leaveSpace: async (user, spaceId) => {
    set({ joining: true, actionError: null });
    try {
      await CollabSpaceClient.leave(user, spaceId);
    } catch (e: any) {
      set({ actionError: e?.message ?? 'Failed to leave space' });
      throw e;
    } finally {
      set({ joining: false });
    }
  },

  clearActionError: () => set({ actionError: null }),
}));
