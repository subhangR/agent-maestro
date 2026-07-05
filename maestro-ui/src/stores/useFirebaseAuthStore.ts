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
import { teardownCollabSubscriptions } from '../firebase/collabTeardown';

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

/** Maps raw Firebase auth error codes to copy a human can act on. */
function friendlyAuthError(err: unknown, fallback: string): string {
  const code = (err as { code?: string } | undefined)?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/invalid-email':
      return 'That email address doesn’t look valid.';
    case 'auth/email-already-in-use':
      return 'An account already exists for that email. Try signing in.';
    case 'auth/weak-password':
      return 'Password is too weak — use at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    default:
      return (err as Error | undefined)?.message ?? fallback;
  }
}

let authUnsub: (() => void) | null = null;

export const useFirebaseAuthStore = create<AuthState>((set, get) => ({
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
      const prevUid = get().user?.uid ?? null;
      const nextUid = user?.uid ?? null;
      // Sign-out or account switch: tear down every collab subscription so
      // no listener keeps streaming the previous identity's data.
      if (prevUid && prevUid !== nextUid) {
        teardownCollabSubscriptions();
      }
      set({ user, initialized: true });
    });
  },

  signInGoogle: async () => {
    set({ loading: true, error: null });
    try {
      await fbSignInGoogle();
    } catch (e: unknown) {
      set({ error: friendlyAuthError(e, 'Google sign-in failed') });
    } finally {
      set({ loading: false });
    }
  },

  signInEmail: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await fbSignInEmail(email, password);
    } catch (e: unknown) {
      set({ error: friendlyAuthError(e, 'Sign-in failed') });
    } finally {
      set({ loading: false });
    }
  },

  signUpEmail: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await fbSignUpEmail(email, password);
    } catch (e: unknown) {
      set({ error: friendlyAuthError(e, 'Sign-up failed') });
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    try {
      await fbSignOut();
      // The auth listener also tears down on uid change; do it eagerly here
      // so subscriptions stop before rules start rejecting their reads.
      teardownCollabSubscriptions();
    } catch (e: unknown) {
      set({ error: friendlyAuthError(e, 'Sign-out failed') });
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
