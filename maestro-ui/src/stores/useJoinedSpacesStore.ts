import { create } from 'zustand';
import { Unsubscribe } from 'firebase/firestore';
import { CollabSpaceClient } from '../firebase/CollabSpaceClient';
import { CollabSpace } from '../firebase/collabSpaceTypes';

interface JoinedSpacesState {
  spaces: CollabSpace[];
  loading: boolean;
  uid: string | null;
  unsub: Unsubscribe | null;
  start: (uid: string) => void;
  stop: () => void;
}

export const useJoinedSpacesStore = create<JoinedSpacesState>((set, get) => ({
  spaces: [],
  loading: false,
  uid: null,
  unsub: null,

  start: (uid) => {
    const { uid: currentUid, unsub } = get();
    if (currentUid === uid && unsub) return;
    if (unsub) unsub();

    set({ uid, loading: true });
    const next = CollabSpaceClient.subscribeToAllForUser(uid, (spaces) => {
      set({ spaces, loading: false });
    });
    set({ unsub: next });
  },

  stop: () => {
    const { unsub } = get();
    if (unsub) unsub();
    set({ uid: null, unsub: null, spaces: [], loading: false });
  },
}));
