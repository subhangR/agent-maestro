import {
  useServerProfilesStore,
  migrateLegacyHost,
  __setServerProfilesStorage,
} from './serverProfilesStore';
import { createMemoryStorage, type StateStorage } from './storage';

function reset(storage: StateStorage = createMemoryStorage()): StateStorage {
  __setServerProfilesStorage(storage);
  return storage;
}

describe('serverProfilesStore', () => {
  beforeEach(() => reset());

  it('adds a profile, defaults its label from the host, and makes it active', () => {
    const p = useServerProfilesStore.getState().addProfile({ host: 'http://192.168.1.5:4569' });
    expect(p.label).toBe('192.168.1.5:4569'); // protocol stripped
    expect(p.authMode).toBe('none');
    expect(useServerProfilesStore.getState().activeProfileId).toBe(p.id);
  });

  it('dedups by host regardless of protocol/case/trailing slash', () => {
    const a = useServerProfilesStore.getState().addProfile({ host: 'http://Host:3001/' });
    const b = useServerProfilesStore.getState().addProfile({ host: 'host:3001' });
    expect(b.id).toBe(a.id);
    expect(useServerProfilesStore.getState().profiles).toHaveLength(1);
  });

  it('upsertByHost updates authMode on an existing profile', () => {
    const a = useServerProfilesStore.getState().addProfile({ host: 'hub.example:443', authMode: 'none' });
    const b = useServerProfilesStore.getState().upsertByHost({ host: 'hub.example:443', authMode: 'firebase' });
    expect(b.id).toBe(a.id);
    expect(b.authMode).toBe('firebase');
  });

  it('removing the active profile reassigns active to the first remaining', () => {
    const store = useServerProfilesStore.getState();
    const a = store.addProfile({ host: 'a:1' });
    const b = store.addProfile({ host: 'b:2' });
    store.setActiveProfile(b.id);
    store.removeProfile(b.id);
    expect(useServerProfilesStore.getState().activeProfileId).toBe(a.id);
    expect(useServerProfilesStore.getState().profiles).toHaveLength(1);
  });

  it('persists across a re-hydrate of the same storage', () => {
    const storage = reset();
    useServerProfilesStore.getState().addProfile({ host: 'persist:9', authMode: 'password' });
    // Re-point the store at the SAME backing storage → re-reads persisted blob.
    __setServerProfilesStorage(storage);
    const [restored] = useServerProfilesStore.getState().profiles;
    expect(restored).toBeDefined();
    expect(restored?.host).toBe('persist:9');
    expect(restored?.authMode).toBe('password');
  });
});

describe('migrateLegacyHost', () => {
  beforeEach(() => reset());

  it('seeds a profile from a legacy lastHost when empty', () => {
    const active = migrateLegacyHost('192.168.1.9:4569');
    expect(active?.host).toBe('192.168.1.9:4569');
    expect(useServerProfilesStore.getState().profiles).toHaveLength(1);
    expect(useServerProfilesStore.getState().activeProfileId).toBe(active?.id);
  });

  it('is a no-op when profiles already exist', () => {
    const existing = useServerProfilesStore.getState().addProfile({ host: 'existing:1' });
    const active = migrateLegacyHost('other:2');
    expect(active?.id).toBe(existing.id);
    expect(useServerProfilesStore.getState().profiles).toHaveLength(1);
  });

  it('returns null when there is nothing to migrate', () => {
    expect(migrateLegacyHost(null)).toBeNull();
    expect(migrateLegacyHost('')).toBeNull();
  });
});
