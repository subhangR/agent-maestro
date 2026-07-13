import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User, UserCredential } from 'firebase/auth';

const firebaseMocks = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ name: 'auth' })),
  GoogleAuthProvider: vi.fn(function GoogleAuthProvider() {}),
  signInWithPopup: firebaseMocks.signInWithPopup,
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('../firebase/config', () => ({
  getFirebaseApp: vi.fn(() => ({ name: 'app' })),
}));

import { signInWithGoogle } from '../firebase/auth';

const fakeUser = { uid: 'alice' } as User;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Firebase Google auth popup', () => {
  it('shares one popup across concurrent sign-in calls', async () => {
    let resolvePopup!: (credential: UserCredential) => void;
    firebaseMocks.signInWithPopup.mockReturnValueOnce(
      new Promise<UserCredential>((resolve) => {
        resolvePopup = resolve;
      }),
    );

    const first = signInWithGoogle();
    const second = signInWithGoogle();

    expect(first).toBe(second);
    expect(firebaseMocks.signInWithPopup).toHaveBeenCalledTimes(1);

    resolvePopup({ user: fakeUser } as UserCredential);
    await expect(first).resolves.toBe(fakeUser);
    await expect(second).resolves.toBe(fakeUser);
  });

  it('allows a fresh popup after the prior attempt settles', async () => {
    firebaseMocks.signInWithPopup
      .mockResolvedValueOnce({ user: fakeUser } as UserCredential)
      .mockResolvedValueOnce({ user: fakeUser } as UserCredential);

    await signInWithGoogle();
    await signInWithGoogle();

    expect(firebaseMocks.signInWithPopup).toHaveBeenCalledTimes(2);
  });
});
