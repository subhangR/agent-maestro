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
  createSpace: (user: User, input: CreateCollabSpaceInput) => Promise<CollabSpace>;
  joinSpace: (user: User, spaceId: string) => Promise<void>;
  leaveSpace: (user: User, spaceId: string) => Promise<void>;
  clearActionError: () => void;
}

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
    set((s) => ({ detectionLoading: { ...s.detectionLoading, [projectId]: true } }));
    try {
      const result = await detectGitRemote(workingDir);
      set((s) => ({
        detectedRemoteByProject: { ...s.detectedRemoteByProject, [projectId]: result },
      }));
      return result;
    } finally {
      set((s) => ({ detectionLoading: { ...s.detectionLoading, [projectId]: false } }));
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
        })),
      onPublic: (spaces) =>
        set((s) => ({
          publicByRepo: { ...s.publicByRepo, [githubUrl]: spaces },
          listLoading: { ...s.listLoading, [githubUrl]: false },
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
