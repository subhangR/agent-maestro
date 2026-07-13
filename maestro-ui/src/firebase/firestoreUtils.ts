import { FirestoreError } from 'firebase/firestore';

/**
 * Shared low-level helpers for the Collab Space Firestore clients:
 * retry/backoff for transient failures, deep sanitization for writes
 * (Firestore rejects `undefined`), and coercion helpers that validate
 * snapshot data at the client boundary instead of blind `as` casts.
 */

/** Firestore error codes that are safe to retry (transient). */
const RETRYABLE_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'resource-exhausted',
  'aborted',
  'internal',
]);

export function isRetryableFirestoreError(err: unknown): boolean {
  const code = (err as FirestoreError | undefined)?.code;
  return typeof code === 'string' && RETRYABLE_CODES.has(code);
}

export interface RetryOptions {
  /** Total attempts including the first one. */
  attempts?: number;
  /** Base delay before the first retry; doubles each attempt (+ jitter). */
  baseDelayMs?: number;
}

/**
 * Runs `op`, retrying with exponential backoff + jitter on transient
 * Firestore errors. Permission / validation errors are NOT retried.
 *
 * Only use with idempotent operations — writes against a pre-allocated doc
 * ref, `updateDoc` patches, deletes, and reads all qualify.
 */
export async function withRetry<T>(op: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? 3);
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastError = err;
      const isLast = attempt === attempts - 1;
      if (isLast || !isRetryableFirestoreError(err)) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 150;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Recursively removes `undefined` values (Firestore rejects them) from plain
 * objects/arrays. Leaves class instances (Timestamp, FieldValue sentinels,
 * Date) untouched so serverTimestamp()/arrayUnion() survive.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => stripUndefinedDeep(v)) as unknown as T;
  }
  if (typeof value === 'object' && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

/** Human-readable message from an unknown error, with a safe fallback. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

/** True when the error is a Firestore permission failure (rules denial). */
export function isPermissionDenied(err: unknown): boolean {
  return (err as FirestoreError | undefined)?.code === 'permission-denied';
}

// ─── Snapshot coercion helpers ──────────────────────────────────────
// Firestore docs can be written by any (rules-permitting) client, so the
// read path validates shapes instead of trusting `as` casts.

export function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function asBoolean(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function asStringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

export function asEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
