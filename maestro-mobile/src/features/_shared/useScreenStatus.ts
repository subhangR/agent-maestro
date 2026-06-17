// useScreenStatus — the loading/empty/error triad every feature screen renders.
// It reads the keyed loading/error flags Ledger writes (`@/state`'s useLoading/
// useError, keyed per fetch action) and folds them with the current data count
// into ONE display status. Stale-while-revalidate is the rule: an overlay
// (loading/error/empty) is only shown when there is NOTHING to render yet —
// once data exists we keep showing it even while a background refetch runs.
import { useError, useLoading } from '@/state';

/** Mutually-exclusive screen states a feature body switches on. */
export type ScreenStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface ScreenStatusInput {
  /** The loading-flag key the relevant fetch action writes (e.g. 'sessions'). */
  loadingKey: string;
  /** Error-flag key; defaults to `loadingKey` (fetch actions key both the same). */
  errorKey?: string;
  /** How many rows the screen currently has to show. */
  count: number;
}

export interface ScreenStatusResult {
  status: ScreenStatus;
  /** True whenever a fetch is in flight (independent of whether data exists). */
  loading: boolean;
  /** The last error message, if any. */
  error?: string;
  /** True when there is nothing to render. */
  isEmpty: boolean;
}

/**
 * Fold keyed loading/error flags + a row count into a single screen status.
 * Precedence when empty: error → loading → empty. Non-empty always renders
 * `ready` (the data stays put; a refetch spinner is the caller's concern).
 */
export function useScreenStatus({ loadingKey, errorKey, count }: ScreenStatusInput): ScreenStatusResult {
  const loading = useLoading(loadingKey);
  const error = useError(errorKey ?? loadingKey);
  const isEmpty = count === 0;

  let status: ScreenStatus;
  if (isEmpty && error) status = 'error';
  else if (isEmpty && loading) status = 'loading';
  else if (isEmpty) status = 'empty';
  else status = 'ready';

  return { status, loading, error, isEmpty };
}
