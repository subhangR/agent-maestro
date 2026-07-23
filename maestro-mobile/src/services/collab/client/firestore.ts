// src/services/collab/client/firestore.ts — the ONE Firestore handle + the
// read-boundary normalizers every client module shares. Keeping the db accessor
// and the Timestamp→millis mappers here means the spaces/messaging/invites/shared
// modules stay disjoint (no cross-imports) and every document is decoded the same
// way. @react-native-firebase namespaced API throughout.
import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';

export type Db = FirebaseFirestoreTypes.Module;
export type DocData = FirebaseFirestoreTypes.DocumentData;
export type QuerySnapshot = FirebaseFirestoreTypes.QuerySnapshot;
export type DocumentSnapshot = FirebaseFirestoreTypes.DocumentSnapshot;

export const COLLAB = 'collabSpaces';

/** The shared Firestore module handle. */
export function db(): Db {
  return firestore();
}

// Field-value helpers (namespaced) — re-exported so modules don't each import.
export const serverTimestamp = (): FirebaseFirestoreTypes.FieldValue =>
  firestore.FieldValue.serverTimestamp();
export const arrayUnion = (
  ...values: unknown[]
): FirebaseFirestoreTypes.FieldValue => firestore.FieldValue.arrayUnion(...values);
export const arrayRemove = (
  ...values: unknown[]
): FirebaseFirestoreTypes.FieldValue => firestore.FieldValue.arrayRemove(...values);
export const deleteField = (): FirebaseFirestoreTypes.FieldValue =>
  firestore.FieldValue.delete();
export const tsFromMillis = (ms: number): FirebaseFirestoreTypes.Timestamp =>
  firestore.Timestamp.fromMillis(ms);

// ── Read-boundary normalizers ────────────────────────────────────────────────
/** Firestore Timestamp | null | pending-server-write → epoch millis | null. */
export function millis(v: unknown): number | null {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

export function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function asEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

/**
 * Retry a transient Firestore op with linear backoff. Mirrors desktop
 * firestoreUtils.withRetry — 'unavailable'/'deadline-exceeded'/network blips only.
 */
export async function withRetry<T>(op: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string })?.code ?? '';
      const retriable =
        code.includes('unavailable') ||
        code.includes('deadline') ||
        code.includes('internal') ||
        code.includes('aborted');
      if (!retriable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastErr;
}

export function logSubError(scope: string, err: Error): void {
  // eslint-disable-next-line no-console
  console.warn(`[collab] ${scope} subscription failed:`, err.message);
}
