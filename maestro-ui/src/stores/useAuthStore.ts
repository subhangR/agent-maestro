import { create } from 'zustand';
import { User } from 'firebase/auth';
import { isFirebaseConfigured } from '../firebase/config';
import {
  subscribeAuth,
  signInWithGoogle as fbSignInGoogle,
  signInWithEmail as fbSignInEmail,
  signUpWithEmail as fbSignUpEmail,
  signOut as fbSignOut,
} from '../firebase/auth';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  configured: boolean;
  initAuth: () => void;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

let authUnsub: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  error: null,
  configured: isFirebaseConfigured,

  initAuth: () => {
    if (!isFirebaseConfigured) {
      set({ initialized: true, configured: false });
      return;
    }
    if (authUnsub) return;
    authUnsub = subscribeAuth((user) => {
      set({ user, initialized: true });
    });
  },

  signInGoogle: async () => {
    set({ loading: true, error: null });
    try {
      await fbSignInGoogle();
    } catch (e: any) {
      set({ error: e?.message ?? 'Google sign-in failed' });
    } finally {
      set({ loading: false });
    }
  },

  signInEmail: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await fbSignInEmail(email, password);
    } catch (e: any) {
      set({ error: e?.message ?? 'Sign-in failed' });
    } finally {
      set({ loading: false });
    }
  },

  signUpEmail: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await fbSignUpEmail(email, password);
    } catch (e: any) {
      set({ error: e?.message ?? 'Sign-up failed' });
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    try {
      await fbSignOut();
    } catch (e: any) {
      set({ error: e?.message ?? 'Sign-out failed' });
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
