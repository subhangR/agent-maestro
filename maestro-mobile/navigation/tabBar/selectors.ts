// navigation/tabBar/selectors.ts — the Ledger seam for the shell chrome.
//
// The tab bar + NowPlaying read live session state through these thin selectors
// (dependency D-Ledger-1/2). They derive from the active project's live sessions
// so the strip + the Sessions "needs input" dot stay in sync with the store the
// REST fetches + WS ingest write.
import type { Session, ProjectId } from '@/domain';
import { useUiStore, useLiveSessions } from '@/state';

/** Live sessions for the active project (empty when no project is active). */
function useActiveProjectLiveSessions(): Session[] {
  const projectId = useUiStore((s) => s.activeProjectId);
  // useLiveSessions returns [] for an unknown/empty id, so the sentinel is safe.
  return useLiveSessions((projectId ?? '') as ProjectId);
}

/**
 * The session the NowPlaying strip represents: the first live session in the
 * active project. Returns undefined when nothing is live (strip hides).
 * Refinable later into a user-pinned "active" session via Ledger.
 */
export function useActiveSession(): Session | undefined {
  return useActiveProjectLiveSessions()[0];
}

/** Count of live sessions awaiting input — drives the Sessions-tab dot. */
export function useNeedsInputCount(): number {
  const live = useActiveProjectLiveSessions();
  return live.reduce((n, s) => (s.needsInput ? n + 1 : n), 0);
}
