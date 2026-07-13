// The swappable persistence seam for prefsStore.
//
// Pre-paint hydration (theme + last host must be readable before first render)
// forces a SYNCHRONOUS interface. MMKV (JSI-backed) is sync and is the v1 path
// (the app ships a dev client, so the native module is always present). Memory
// is the test / no-native fallback. An AsyncStorage write-through adapter is
// provided behind the same interface for an Expo-Go path that lacks MMKV — it
// reads from a sync cache hydrated by `hydrate()` (boot awaits it once).
//
// Only tiny user-scoped prefs live here (theme, last host). NO entity data, NO
// secrets (tokens belong in expo-secure-store, owned by Conduit — not here).

export interface StateStorage {
  getString(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
  /** Optional async hydration (AsyncStorage path). No-op for sync stores. */
  hydrate?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// MMKV adapter (primary, synchronous)
// ---------------------------------------------------------------------------

/**
 * Create an MMKV-backed sync storage. Throws if the native module can't load
 * (e.g. under jest/node or stock Expo Go) — callers should fall back to memory.
 *
 * react-native-mmkv v4 (Nitro) replaced the `new MMKV()` constructor with the
 * `createMMKV(config)` factory and renamed `delete` → `remove`.
 */
export function createMmkvStorage(id: string): StateStorage {
  // Lazy require so importing this module never crashes a JS-only test runner.
  const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
  const mmkv = createMMKV({ id });
  return {
    getString: (key) => mmkv.getString(key) ?? null,
    set: (key, value) => mmkv.set(key, value),
    delete: (key) => {
      mmkv.remove(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Memory adapter (tests + last-resort fallback, synchronous)
// ---------------------------------------------------------------------------

export function createMemoryStorage(seed?: Record<string, string>): StateStorage {
  const map = new Map<string, string>(seed ? Object.entries(seed) : undefined);
  return {
    getString: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
    },
    delete: (key) => {
      map.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// AsyncStorage adapter (Expo-Go fallback) — sync reads off a hydrated cache,
// async write-through. `hydrate()` must be awaited at boot before reads are
// authoritative; until then reads return null (the documented hydration flash).
// ---------------------------------------------------------------------------

export function createAsyncStorageBackedStorage(keyPrefix = 'maestro:'): StateStorage {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AsyncStorage = require('@react-native-async-storage/async-storage')
    .default as typeof import('@react-native-async-storage/async-storage').default;
  const cache = new Map<string, string>();
  const k = (key: string) => `${keyPrefix}${key}`;
  return {
    getString: (key) => cache.get(key) ?? null,
    set: (key, value) => {
      cache.set(key, value);
      void AsyncStorage.setItem(k(key), value);
    },
    delete: (key) => {
      cache.delete(key);
      void AsyncStorage.removeItem(k(key));
    },
    hydrate: async () => {
      const keys = (await AsyncStorage.getAllKeys()).filter((x) => x.startsWith(keyPrefix));
      const pairs = await AsyncStorage.multiGet(keys);
      for (const [rawKey, value] of pairs) {
        if (value != null) cache.set(rawKey.slice(keyPrefix.length), value);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Default resolution: MMKV when available, else memory.
// ---------------------------------------------------------------------------

/**
 * Pick the best available sync storage. MMKV in the dev-client/native runtime;
 * memory under tests or any environment where the native module is absent.
 */
export function resolveDefaultStorage(id: string): StateStorage {
  try {
    return createMmkvStorage(id);
  } catch {
    return createMemoryStorage();
  }
}
