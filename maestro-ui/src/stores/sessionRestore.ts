import type { PersistedTerminalSession, TerminalSession } from '../app/types/session';

/**
 * Standalone terminal restore for the hosted-web (browser) init path.
 *
 * A MAESTRO session (has a `maestroSessionId`) is restored from the server
 * session registry on reload. A STANDALONE terminal — a plain terminal with no
 * `maestroSessionId`, whose only identity is its `persistId` and its
 * server-hosted PTY — has no server registry entry, so the browser init path
 * used to drop it: the localStorage record survived but nothing re-created the
 * tab, and it vanished on reload even though its server PTY kept running.
 *
 * These helpers re-create persisted standalone terminals after hydration,
 * reattaching (via the idempotent POST /pty/spawn, keyed by `persistId`) to a
 * live server PTY rather than replacing it. They respect server-authoritative
 * project reconciliation (a terminal in a pruned project is not resurrected)
 * and guard against duplicate entries across repeated init.
 */

/**
 * The subset of `sessionService.createSession`'s input this module depends on.
 * Injected so restore can be unit-tested without the platform/PTY layer.
 */
export type CreateStandaloneSessionInput = {
  projectId: string;
  name?: string;
  launchCommand?: string | null;
  restoreCommand?: string | null;
  sshTarget?: string | null;
  sshRootDir?: string | null;
  lastRecordingId?: string | null;
  cwd?: string | null;
  envVars?: Record<string, string> | null;
  persistent?: boolean;
  persistId?: string;
  createdAt?: number;
};

export type CreateStandaloneSessionFn = (
  input: CreateStandaloneSessionInput,
) => Promise<TerminalSession>;

/**
 * Selects the persisted standalone terminals that should be restored on a
 * browser reload, in a stable creation order.
 *
 * Excludes:
 * - maestro sessions (restored from the server registry, not localStorage),
 * - entries without a `persistId` (a standalone terminal is identified by it),
 * - terminals whose project no longer exists after server-authoritative
 *   reconciliation (`existingProjectIds`),
 * - duplicate `persistId`s (first occurrence wins).
 */
export function selectStandaloneTerminalsToRestore(params: {
  persistedSessions: PersistedTerminalSession[];
  existingProjectIds: Set<string>;
}): PersistedTerminalSession[] {
  const { persistedSessions, existingProjectIds } = params;
  const seen = new Set<string>();
  return persistedSessions
    .filter((s) => {
      if (s.maestroSessionId) return false;
      if (!s.persistId) return false;
      if (!existingProjectIds.has(s.projectId)) return false;
      if (seen.has(s.persistId)) return false;
      seen.add(s.persistId);
      return true;
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Re-creates the persisted standalone terminals selected by
 * {@link selectStandaloneTerminalsToRestore}, in creation order.
 *
 * Each restore threads the original `persistId` through `createSession` so the
 * server PTY is reattached by identity (idempotent /pty/spawn) rather than
 * spawned anew. Already-present terminals (`existingSessionKeys`, keyed by
 * `persistId`) are skipped so a repeated init never produces duplicate tabs. A
 * single failed restore is reported via `onError` and does not abort the rest;
 * `isCancelled` lets an app teardown stop the loop between terminals.
 *
 * @returns the terminals that were successfully created.
 */
export async function restoreStandaloneTerminals(params: {
  persistedSessions: PersistedTerminalSession[];
  existingProjectIds: Set<string>;
  createSession: CreateStandaloneSessionFn;
  existingSessionKeys?: Set<string>;
  envVarsForProject?: (projectId: string) => Record<string, string> | null | undefined;
  onRestored?: (session: TerminalSession, persisted: PersistedTerminalSession) => void;
  onError?: (error: unknown, persisted: PersistedTerminalSession) => void;
  isCancelled?: () => boolean;
}): Promise<TerminalSession[]> {
  const {
    persistedSessions,
    existingProjectIds,
    createSession,
    existingSessionKeys,
    envVarsForProject,
    onRestored,
    onError,
    isCancelled,
  } = params;

  const toRestore = selectStandaloneTerminalsToRestore({
    persistedSessions,
    existingProjectIds,
  });

  const restored: TerminalSession[] = [];
  for (const persisted of toRestore) {
    if (isCancelled?.()) break;
    // Already live in the store (e.g. a repeated init) — never create a second
    // tab for the same persistId.
    if (existingSessionKeys?.has(persisted.persistId)) continue;

    try {
      const session = await createSession({
        projectId: persisted.projectId,
        name: persisted.name,
        launchCommand: persisted.launchCommand,
        restoreCommand: persisted.restoreCommand ?? null,
        sshTarget: persisted.sshTarget ?? null,
        sshRootDir: persisted.sshRootDir ?? null,
        lastRecordingId: persisted.lastRecordingId ?? null,
        cwd: persisted.cwd,
        envVars: envVarsForProject?.(persisted.projectId) ?? null,
        persistent: persisted.persistent ?? false,
        persistId: persisted.persistId,
        createdAt: persisted.createdAt,
      });
      restored.push(session);
      onRestored?.(session, persisted);
    } catch (err) {
      onError?.(err, persisted);
    }
  }

  return restored;
}
