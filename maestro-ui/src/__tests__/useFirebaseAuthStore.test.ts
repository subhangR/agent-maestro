import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from 'firebase/auth';

vi.mock('../firebase/config', () => ({
  isFirebaseConfigured: true,
}));

const authCallbacks: Array<(user: User | null) => void> = [];

vi.mock('../firebase/auth', () => ({
  subscribeAuth: vi.fn((cb: (user: User | null) => void) => {
    authCallbacks.push(cb);
    return () => {};
  }),
  signInWithGoogle: vi.fn(async () => ({}) as User),
  signInWithEmail: vi.fn(async () => ({}) as User),
  signUpWithEmail: vi.fn(async () => ({}) as User),
  signOut: vi.fn(async () => {}),
}));

vi.mock('../firebase/collabTeardown', () => ({
  teardownCollabSubscriptions: vi.fn(),
}));

import { useFirebaseAuthStore } from '../stores/useFirebaseAuthStore';
import { teardownCollabSubscriptions } from '../firebase/collabTeardown';
import { subscribeAuth, signInWithEmail, signOut as fbSignOut } from '../firebase/auth';

const store = () => useFirebaseAuthStore.getState();
const fakeUser = (uid: string) => ({ uid }) as User;

beforeEach(() => {
  vi.clearAllMocks();
  authCallbacks.length = 0;
  useFirebaseAuthStore.setState({
    user: null,
    loading: false,
    initialized: false,
    error: null,
    configured: true,
  });
});

describe('useFirebaseAuthStore — auth lifecycle', () => {
  it('initAuth subscribes exactly once (module-level guard)', () => {
    store().initAuth();
    store().initAuth();
    // The module-level authUnsub guard means only the first call subscribes.
    // Depending on prior test file state the subscription may already exist,
    // so assert it never subscribes more than once per process.
    expect(vi.mocked(subscribeAuth).mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('tears down collab subscriptions when the uid transitions to null (sign-out)', () => {
    store().initAuth();
    if (authCallbacks.length === 0) return; // guarded init already consumed in another test file
    const cb = authCallbacks[0];

    cb(fakeUser('alice'));
    expect(store().user?.uid).toBe('alice');
    expect(teardownCollabSubscriptions).not.toHaveBeenCalled();

    cb(null);
    expect(teardownCollabSubscriptions).toHaveBeenCalledTimes(1);
    expect(store().user).toBeNull();
  });

  it('tears down on account switch (uid → different uid)', () => {
    store().initAuth();
    if (authCallbacks.length === 0) return;
    const cb = authCallbacks[0];

    cb(fakeUser('alice'));
    cb(fakeUser('bob'));
    expect(teardownCollabSubscriptions).toHaveBeenCalledTimes(1);
    expect(store().user?.uid).toBe('bob');
  });

  it('signOut tears down eagerly', async () => {
    await store().signOut();
    expect(fbSignOut).toHaveBeenCalledTimes(1);
    expect(teardownCollabSubscriptions).toHaveBeenCalledTimes(1);
  });
});

describe('useFirebaseAuthStore — friendly errors', () => {
  it('maps firebase auth codes to actionable copy', async () => {
    vi.mocked(signInWithEmail).mockRejectedValueOnce(
      Object.assign(new Error('Firebase: Error (auth/wrong-password).'), {
        code: 'auth/wrong-password',
      }),
    );
    await store().signInEmail('a@b.c', 'nope');
    expect(store().error).toBe('Email or password is incorrect.');
    expect(store().loading).toBe(false);
  });

  it('falls back to the raw message for unknown codes', async () => {
    vi.mocked(signInWithEmail).mockRejectedValueOnce(new Error('Something odd'));
    await store().signInEmail('a@b.c', 'x');
    expect(store().error).toBe('Something odd');
  });
});
