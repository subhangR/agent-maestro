import React from "react";

const RELOAD_GUARD_KEY = "maestro:chunk-reload-at";
const RELOAD_GUARD_WINDOW_MS = 10_000;

/**
 * True when an error is a dynamic-import / chunk-load failure. This happens when
 * the served build is rebuilt while a page is open: the loaded bundle references
 * chunk hashes that no longer exist on the server, so the import 404s (or the SPA
 * fallback returns index.html, which fails the JS MIME check).
 */
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|dynamically imported module|failed to import/i.test(
    msg,
  );
}

/**
 * Like React.lazy, but self-heals stale-chunk failures: retry the import once,
 * and if it still fails with a chunk-load error, force a single full reload to
 * pick up the fresh index + chunk hashes. A short-lived sessionStorage flag
 * prevents reload loops if the chunk is genuinely missing.
 */
export function lazyWithReload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (!isChunkLoadError(err)) throw err;
      try {
        return await factory();
      } catch (retryErr) {
        if (isChunkLoadError(retryErr) && typeof window !== "undefined") {
          const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
          if (!last || Date.now() - last > RELOAD_GUARD_WINDOW_MS) {
            sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
            window.location.reload();
          }
        }
        throw retryErr;
      }
    }
  });
}
