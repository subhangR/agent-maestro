// Lazily loads the vendored offline mermaid UMD bundle (~4.5MB base64) exactly
// once and memoizes it across the app. Dynamic import keeps the big string out
// of the initial bundle — it's only pulled when a mermaid doc is first viewed.
import { useEffect, useState } from 'react';

// Module-level cache so a second mermaid doc doesn't re-import / re-await.
let cached: string | null = null;
let inflight: Promise<string> | null = null;

async function loadMermaidB64(): Promise<string> {
  if (cached != null) return cached;
  if (inflight != null) return inflight;
  inflight = import('./vendor/mermaidBundle').then((m) => {
    cached = m.MERMAID_JS_B64;
    return cached;
  });
  return inflight;
}

export interface MermaidRuntime {
  /** The base64 UMD bundle, or null while the dynamic import is in flight. */
  b64: string | null;
  /** True until the bundle has resolved (or failed). */
  loading: boolean;
  /** Set if the dynamic import itself threw. */
  error: boolean;
}

/** Load the mermaid bundle once; returns its readiness + the base64 payload. */
export function useMermaidRuntime(enabled: boolean): MermaidRuntime {
  const [b64, setB64] = useState<string | null>(cached);
  const [loading, setLoading] = useState<boolean>(enabled && cached == null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || cached != null) {
      if (cached != null) setB64(cached);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    loadMermaidB64()
      .then((v) => {
        if (alive) {
          setB64(v);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { b64, loading, error };
}
