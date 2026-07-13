import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asBoolean,
  asEnum,
  asNumber,
  asString,
  asStringArray,
  asStringOrNull,
  asStringRecord,
  errorMessage,
  isPermissionDenied,
  isRetryableFirestoreError,
  stripUndefinedDeep,
  withRetry,
} from '../firebase/firestoreUtils';

describe('stripUndefinedDeep', () => {
  it('removes undefined keys from nested plain objects', () => {
    const input = {
      a: 1,
      b: undefined,
      c: {
        d: undefined,
        e: 'kept',
        f: { g: undefined, h: null },
      },
    };
    expect(stripUndefinedDeep(input)).toEqual({
      a: 1,
      c: { e: 'kept', f: { h: null } },
    });
  });

  it('filters undefined entries out of arrays and recurses into elements', () => {
    const input = {
      arr: [1, undefined, { x: undefined, y: 2 }, [undefined, 'z']],
    };
    expect(stripUndefinedDeep(input)).toEqual({
      arr: [1, { y: 2 }, ['z']],
    });
  });

  it('leaves class instances untouched (same reference, props intact)', () => {
    class Sentinel {
      kind = 'server-timestamp';
      hole: string | undefined = undefined;
    }
    const sentinel = new Sentinel();
    const date = new Date(0);
    const out = stripUndefinedDeep({ sentinel, date, drop: undefined });
    expect(out.sentinel).toBe(sentinel);
    expect(Object.prototype.hasOwnProperty.call(out.sentinel, 'hole')).toBe(true);
    expect(out.date).toBe(date);
    expect('drop' in out).toBe(false);
  });

  it('passes null and undefined straight through', () => {
    expect(stripUndefinedDeep(null)).toBeNull();
    expect(stripUndefinedDeep(undefined)).toBeUndefined();
  });

  it('passes primitives straight through', () => {
    expect(stripUndefinedDeep('s')).toBe('s');
    expect(stripUndefinedDeep(0)).toBe(0);
    expect(stripUndefinedDeep(false)).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Kill the jitter so backoff delays are exact.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries transient errors with exponential backoff and eventually succeeds', async () => {
    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: 'unavailable' })
      .mockRejectedValueOnce({ code: 'deadline-exceeded' })
      .mockResolvedValueOnce('ok');

    const p = withRetry(op, { attempts: 3, baseDelayMs: 100 });
    // First attempt runs immediately and fails.
    await vi.advanceTimersByTimeAsync(0);
    expect(op).toHaveBeenCalledTimes(1);

    // Backoff: 100ms before attempt 2.
    await vi.advanceTimersByTimeAsync(99);
    expect(op).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(op).toHaveBeenCalledTimes(2);

    // Backoff doubles: 200ms before attempt 3.
    await vi.advanceTimersByTimeAsync(200);
    expect(op).toHaveBeenCalledTimes(3);

    await expect(p).resolves.toBe('ok');
  });

  it('does not retry permission-denied errors', async () => {
    const op = vi.fn<() => Promise<never>>().mockRejectedValue({ code: 'permission-denied' });
    await expect(withRetry(op, { attempts: 3, baseDelayMs: 100 })).rejects.toEqual({
      code: 'permission-denied',
    });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-Firestore-shaped errors', async () => {
    const op = vi.fn<() => Promise<never>>().mockRejectedValue(new Error('plain failure'));
    await expect(withRetry(op, { attempts: 3, baseDelayMs: 100 })).rejects.toThrow('plain failure');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('throws the last error after exhausting max attempts', async () => {
    const op = vi.fn<() => Promise<never>>().mockRejectedValue({ code: 'unavailable' });
    const p = withRetry(op, { attempts: 3, baseDelayMs: 100 });
    const expectation = expect(p).rejects.toEqual({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(100); // before attempt 2
    await vi.advanceTimersByTimeAsync(200); // before attempt 3
    await expectation;
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('treats attempts below 1 as a single attempt', async () => {
    const op = vi.fn<() => Promise<never>>().mockRejectedValue({ code: 'unavailable' });
    await expect(withRetry(op, { attempts: 0 })).rejects.toEqual({ code: 'unavailable' });
    expect(op).toHaveBeenCalledTimes(1);
  });
});

describe('error helpers', () => {
  it('isRetryableFirestoreError recognizes transient codes only', () => {
    for (const code of ['unavailable', 'deadline-exceeded', 'resource-exhausted', 'aborted', 'internal']) {
      expect(isRetryableFirestoreError({ code })).toBe(true);
    }
    expect(isRetryableFirestoreError({ code: 'permission-denied' })).toBe(false);
    expect(isRetryableFirestoreError({ code: 'not-found' })).toBe(false);
    expect(isRetryableFirestoreError(new Error('nope'))).toBe(false);
    expect(isRetryableFirestoreError(undefined)).toBe(false);
    expect(isRetryableFirestoreError(null)).toBe(false);
  });

  it('isPermissionDenied matches only the permission-denied code', () => {
    expect(isPermissionDenied({ code: 'permission-denied' })).toBe(true);
    expect(isPermissionDenied({ code: 'unavailable' })).toBe(false);
    expect(isPermissionDenied(undefined)).toBe(false);
  });

  it('errorMessage prefers Error message, then string, then fallback', () => {
    expect(errorMessage(new Error('boom'), 'fb')).toBe('boom');
    expect(errorMessage('string error', 'fb')).toBe('string error');
    expect(errorMessage(new Error(''), 'fb')).toBe('fb');
    expect(errorMessage('', 'fb')).toBe('fb');
    expect(errorMessage({ code: 'x' }, 'fb')).toBe('fb');
    expect(errorMessage(undefined, 'fb')).toBe('fb');
  });
});

describe('snapshot coercers', () => {
  it('asString returns strings and falls back otherwise', () => {
    expect(asString('hi')).toBe('hi');
    expect(asString('')).toBe('');
    expect(asString(5)).toBe('');
    expect(asString(null, 'fb')).toBe('fb');
    expect(asString(undefined)).toBe('');
  });

  it('asStringOrNull returns strings or null', () => {
    expect(asStringOrNull('x')).toBe('x');
    expect(asStringOrNull('')).toBe('');
    expect(asStringOrNull(0)).toBeNull();
    expect(asStringOrNull(undefined)).toBeNull();
    expect(asStringOrNull(null)).toBeNull();
  });

  it('asNumber accepts only finite numbers', () => {
    expect(asNumber(3)).toBe(3);
    expect(asNumber(0)).toBe(0);
    expect(asNumber(-1.5)).toBe(-1.5);
    expect(asNumber(NaN)).toBe(0);
    expect(asNumber(Infinity, 7)).toBe(7);
    expect(asNumber('3')).toBe(0);
    expect(asNumber(null, 9)).toBe(9);
  });

  it('asBoolean accepts only booleans', () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean(false, true)).toBe(false);
    expect(asBoolean('true')).toBe(false);
    expect(asBoolean(1, true)).toBe(true);
    expect(asBoolean(undefined)).toBe(false);
  });

  it('asStringArray keeps only string elements and rejects non-arrays', () => {
    expect(asStringArray(['a', 1, 'b', null, undefined, {}])).toEqual(['a', 'b']);
    expect(asStringArray([])).toEqual([]);
    expect(asStringArray('a')).toEqual([]);
    expect(asStringArray({ 0: 'a' })).toEqual([]);
    expect(asStringArray(undefined)).toEqual([]);
  });

  it('asStringRecord keeps only string values and rejects arrays/null', () => {
    expect(asStringRecord({ a: 'x', b: 2, c: 'y', d: null })).toEqual({ a: 'x', c: 'y' });
    expect(asStringRecord(['x'])).toEqual({});
    expect(asStringRecord(null)).toEqual({});
    expect(asStringRecord('x')).toEqual({});
    expect(asStringRecord(undefined)).toEqual({});
  });

  it('asEnum accepts only allowed members and falls back otherwise', () => {
    const allowed = ['amber', 'rose', 'violet'] as const;
    expect(asEnum('rose', allowed, 'violet')).toBe('rose');
    expect(asEnum('chartreuse', allowed, 'violet')).toBe('violet');
    expect(asEnum(3, allowed, 'amber')).toBe('amber');
    expect(asEnum(undefined, allowed, 'amber')).toBe('amber');
  });
});
