import { SupabaseCollabV2Repository } from '../src/infrastructure/repositories/SupabaseCollabV2Repository';

describe('SupabaseCollabV2Repository auth modes', () => {
  const previousBypass = process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS;

  afterEach(() => {
    if (previousBypass === undefined) delete process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS;
    else process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS = previousBypass;
    jest.restoreAllMocks();
  });

  it('uses the explicit UID and omits Authorization in test bypass mode', async () => {
    process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS = 'true';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }));
    const repo = new SupabaseCollabV2Repository('https://project.supabase.co', 'publishable-key');

    await repo.select({ firebaseToken: 'firebase-token', firebaseUid: 'firebase-user-1' }, 'spaces', { select: '*' });

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ apikey: 'publishable-key', 'X-Collab-Firebase-Uid': 'firebase-user-1' }),
    }));
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('falls back to an unverified token subject for cached clients in test mode', async () => {
    process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS = 'true';
    const payload = Buffer.from(JSON.stringify({ sub: 'cached-firebase-user' })).toString('base64url');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }));
    const repo = new SupabaseCollabV2Repository('https://project.supabase.co', 'publishable-key');

    await repo.select({ firebaseToken: `x.${payload}.x` }, 'spaces', { select: '*' });

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ 'X-Collab-Firebase-Uid': 'cached-firebase-user' }),
    }));
  });

  it('keeps forwarding the Firebase token when bypass mode is disabled', async () => {
    delete process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }));
    const repo = new SupabaseCollabV2Repository('https://project.supabase.co', 'publishable-key');

    await repo.select({ firebaseToken: 'firebase-token', firebaseUid: 'ignored-user' }, 'spaces', { select: '*' });

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer firebase-token' }),
    }));
  });
});
