import { create } from 'zustand';
import { IS_TAURI } from '../platform/detect';

interface AuthState {
  authEnabled: boolean;
  authenticated: boolean;
  checking: boolean;
  showLogin: boolean;

  checkStatus: () => Promise<void>;
  login: (password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  setShowLogin: (show: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  authEnabled: false,
  authenticated: false,
  checking: true,
  showLogin: false,

  checkStatus: async () => {
    // Tauri desktop app never needs auth
    if (IS_TAURI) {
      set({ authEnabled: false, authenticated: true, checking: false, showLogin: false });
      return;
    }
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' });
      if (!res.ok) {
        set({ checking: false });
        return;
      }
      const data = await res.json() as { authEnabled: boolean; authenticated: boolean };
      set({
        authEnabled: data.authEnabled,
        authenticated: data.authenticated,
        checking: false,
        showLogin: data.authEnabled && !data.authenticated,
      });
    } catch {
      set({ checking: false });
    }
  },

  login: async (password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        set({ authenticated: true, showLogin: false });
        return { ok: true };
      }
      const body = await res.json().catch(() => ({})) as { error?: string };
      return { ok: false, error: body.error || 'Login failed' };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  },

  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    set({ authenticated: false, showLogin: get().authEnabled });
  },

  setShowLogin: (show: boolean) => set({ showLogin: show }),
}));
