import {
  setHubFirebaseAuth,
  hasHubFirebaseAuth,
  getHubFirebaseToken,
  refreshHubFirebaseToken,
  ensureHubFirebaseToken,
  getTokenForAuthMode,
  HubSignInRequiredError,
} from './hubToken';

afterEach(() => setHubFirebaseAuth(null));

describe('getTokenForAuthMode', () => {
  it('none carries no token', () => {
    expect(getTokenForAuthMode('none', () => 'pw')()).toBeNull();
  });

  it('password reads the provided password-token getter', () => {
    expect(getTokenForAuthMode('password', () => 'pw-jwt')()).toBe('pw-jwt');
  });

  it('firebase reads the Firebase token cache', async () => {
    setHubFirebaseAuth({ getIdToken: async () => 'fb-token' });
    await refreshHubFirebaseToken();
    expect(getTokenForAuthMode('firebase', () => 'pw')()).toBe('fb-token');
  });
});

describe('hubToken seam', () => {
  it('reports no auth and null token before wiring', () => {
    expect(hasHubFirebaseAuth()).toBe(false);
    expect(getHubFirebaseToken()).toBeNull();
  });

  it('refresh warms the sync cache from the async source', async () => {
    setHubFirebaseAuth({ getIdToken: async () => 'tok-1' });
    expect(hasHubFirebaseAuth()).toBe(true);
    expect(await refreshHubFirebaseToken()).toBe('tok-1');
    expect(getHubFirebaseToken()).toBe('tok-1');
  });

  it('refresh keeps the last good token when the source throws', async () => {
    let call = 0;
    setHubFirebaseAuth({
      getIdToken: async () => {
        call += 1;
        if (call === 1) return 'good';
        throw new Error('network');
      },
    });
    expect(await refreshHubFirebaseToken()).toBe('good');
    expect(await refreshHubFirebaseToken()).toBe('good'); // throw → keep last
  });

  it('unwiring clears the cache', async () => {
    setHubFirebaseAuth({ getIdToken: async () => 'x' });
    await refreshHubFirebaseToken();
    setHubFirebaseAuth(null);
    expect(getHubFirebaseToken()).toBeNull();
    expect(hasHubFirebaseAuth()).toBe(false);
  });

  it('ensure throws HubSignInRequiredError when nothing is wired', async () => {
    await expect(ensureHubFirebaseToken()).rejects.toBeInstanceOf(HubSignInRequiredError);
  });

  it('ensure returns an existing token without signing in', async () => {
    const signIn = jest.fn(async () => 'should-not-be-called');
    setHubFirebaseAuth({ getIdToken: async () => 'existing', signIn });
    expect(await ensureHubFirebaseToken()).toBe('existing');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('ensure triggers sign-in when no token yet', async () => {
    const signIn = jest.fn(async () => 'after-signin');
    setHubFirebaseAuth({ getIdToken: async () => null, signIn });
    expect(await ensureHubFirebaseToken()).toBe('after-signin');
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(getHubFirebaseToken()).toBe('after-signin');
  });

  it('ensure throws when sign-in yields nothing', async () => {
    setHubFirebaseAuth({ getIdToken: async () => null, signIn: async () => null });
    await expect(ensureHubFirebaseToken()).rejects.toBeInstanceOf(HubSignInRequiredError);
  });
});
