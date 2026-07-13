import { useEffect, useState } from 'react';
import { SpaceFile } from '../firebase/spaceShareTypes';
import { SpaceFilesClient } from '../firebase/SpaceFilesClient';

/**
 * Live subscription to a space's shared files.
 *
 * Mirrors the `useSharedList` pattern in `useSpaceSharing.ts` (kept local on
 * purpose — that hook file is owned by the sharing vertical).
 */
export interface SpaceFilesState {
  items: SpaceFile[];
  loading: boolean;
  error: string | null;
  /** Force a re-subscribe after an error. */
  retry: () => void;
}

export function useSpaceFiles(spaceId: string | null): SpaceFilesState {
  const [items, setItems] = useState<SpaceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!spaceId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = SpaceFilesClient.subscribe(
      spaceId,
      (next) => {
        setItems(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err?.message ?? 'Failed to load files. Check your connection and retry.');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [spaceId, nonce]);

  return {
    items,
    loading,
    error,
    retry: () => setNonce((n) => n + 1),
  };
}
