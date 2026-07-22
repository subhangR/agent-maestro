import { describe, it, expect, vi } from 'vitest';
import {
  selectStandaloneTerminalsToRestore,
  restoreStandaloneTerminals,
} from '../stores/sessionRestore';
import type { PersistedTerminalSession, TerminalSession } from '../app/types/session';

/**
 * On a browser reload the terminal store starts empty and initApp's web
 * early-return only reattaches MAESTRO sessions (those with a maestroSessionId,
 * tracked by the server session registry). A STANDALONE terminal — a plain
 * `bun run web` terminal with no maestroSessionId, whose only identity is its
 * persistId and its server-hosted PTY — was silently dropped: the persisted
 * localStorage entry existed but nothing re-created its terminal, so the tab
 * vanished after reload even though the server PTY kept running.
 *
 * These tests pin the restore-selection + orchestration so a persisted
 * standalone terminal survives hydration, reattaching (not replacing) its live
 * server PTY, while respecting server-authoritative project reconciliation.
 */

function persisted(
  overrides: Partial<PersistedTerminalSession> & { persistId: string; projectId: string },
): PersistedTerminalSession {
  return {
    persistId: overrides.persistId,
    projectId: overrides.projectId,
    name: overrides.name ?? overrides.persistId,
    launchCommand: overrides.launchCommand ?? null,
    restoreCommand: overrides.restoreCommand ?? null,
    sshTarget: overrides.sshTarget ?? null,
    sshRootDir: overrides.sshRootDir ?? null,
    lastRecordingId: overrides.lastRecordingId ?? null,
    cwd: overrides.cwd ?? null,
    persistent: overrides.persistent ?? false,
    createdAt: overrides.createdAt ?? 1,
    maestroSessionId: overrides.maestroSessionId ?? null,
    backendSessionId: overrides.backendSessionId,
  };
}

describe('selectStandaloneTerminalsToRestore', () => {
  it('selects a persisted standalone terminal whose project still exists (the missing-after-reload case)', () => {
    const standalone = persisted({ persistId: 'p1', projectId: 'A', maestroSessionId: null });

    const out = selectStandaloneTerminalsToRestore({
      persistedSessions: [standalone],
      existingProjectIds: new Set(['A']),
    });

    expect(out.map((s) => s.persistId)).toEqual(['p1']);
  });

  it('never selects a maestro session (those are restored from the server registry, not localStorage)', () => {
    const maestro = persisted({ persistId: 'p2', projectId: 'A', maestroSessionId: 'sess-123' });

    const out = selectStandaloneTerminalsToRestore({
      persistedSessions: [maestro],
      existingProjectIds: new Set(['A']),
    });

    expect(out).toEqual([]);
  });

  it('prunes a standalone terminal whose project no longer exists after server-authoritative reconciliation', () => {
    const orphan = persisted({ persistId: 'p3', projectId: 'GONE', maestroSessionId: null });

    const out = selectStandaloneTerminalsToRestore({
      persistedSessions: [orphan],
      existingProjectIds: new Set(['A']),
    });

    expect(out).toEqual([]);
  });

  it('skips entries with no persistId (a standalone terminal is identified by its persistId + PTY)', () => {
    const noId = persisted({ persistId: '', projectId: 'A', maestroSessionId: null });

    const out = selectStandaloneTerminalsToRestore({
      persistedSessions: [noId],
      existingProjectIds: new Set(['A']),
    });

    expect(out).toEqual([]);
  });

  it('dedups repeated persistIds and orders by createdAt', () => {
    const a = persisted({ persistId: 'p1', projectId: 'A', maestroSessionId: null, createdAt: 30 });
    const b = persisted({ persistId: 'p2', projectId: 'A', maestroSessionId: null, createdAt: 10 });
    const dup = persisted({ persistId: 'p1', projectId: 'A', maestroSessionId: null, createdAt: 99 });

    const out = selectStandaloneTerminalsToRestore({
      persistedSessions: [a, b, dup],
      existingProjectIds: new Set(['A']),
    });

    expect(out.map((s) => s.persistId)).toEqual(['p2', 'p1']);
  });
});

describe('restoreStandaloneTerminals', () => {
  function fakeCreated(input: { persistId?: string; projectId: string; name?: string }): TerminalSession {
    return {
      id: input.persistId ?? 'x',
      name: input.name ?? '',
      command: '',
      projectId: input.projectId,
      persistId: input.persistId ?? '',
      persistent: false,
      createdAt: 1,
      launchCommand: null,
      sshTarget: null,
      sshRootDir: null,
      cwd: null,
      maestroSessionId: null,
    };
  }

  it('re-creates each standalone terminal by its persistId (reattaching the existing PTY via the idempotent createSession path)', async () => {
    const createSession = vi.fn(async (input: any) => fakeCreated(input));
    const onRestored = vi.fn();

    const restored = await restoreStandaloneTerminals({
      persistedSessions: [
        persisted({ persistId: 'p1', projectId: 'A', maestroSessionId: null }),
        persisted({ persistId: 'p2', projectId: 'A', maestroSessionId: null }),
      ],
      existingProjectIds: new Set(['A']),
      createSession,
      onRestored,
    });

    expect(createSession).toHaveBeenCalledTimes(2);
    // The persistId must be threaded through so the server PTY is reattached by
    // identity (POST /pty/spawn is idempotent for a live PTY) — not spawned anew.
    expect(createSession.mock.calls.map((c) => c[0].persistId)).toEqual(['p1', 'p2']);
    expect(restored.map((s) => s.persistId)).toEqual(['p1', 'p2']);
    expect(onRestored).toHaveBeenCalledTimes(2);
  });

  it('does not re-create a terminal that is already present (repeated init / already-live guard)', async () => {
    const createSession = vi.fn(async (input: any) => fakeCreated(input));

    const restored = await restoreStandaloneTerminals({
      persistedSessions: [persisted({ persistId: 'p1', projectId: 'A', maestroSessionId: null })],
      existingProjectIds: new Set(['A']),
      existingSessionKeys: new Set(['p1']),
      createSession,
    });

    expect(createSession).not.toHaveBeenCalled();
    expect(restored).toEqual([]);
  });

  it('does not restore a standalone terminal into a pruned project', async () => {
    const createSession = vi.fn(async (input: any) => fakeCreated(input));

    await restoreStandaloneTerminals({
      persistedSessions: [persisted({ persistId: 'p1', projectId: 'GONE', maestroSessionId: null })],
      existingProjectIds: new Set(['A']),
      createSession,
    });

    expect(createSession).not.toHaveBeenCalled();
  });

  it('stops when cancelled (app teardown mid-restore) and keeps going past a single failure', async () => {
    const createSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('pty spawn failed'))
      .mockImplementation(async (input: any) => fakeCreated(input));
    const onError = vi.fn();

    const restored = await restoreStandaloneTerminals({
      persistedSessions: [
        persisted({ persistId: 'p1', projectId: 'A', maestroSessionId: null, createdAt: 1 }),
        persisted({ persistId: 'p2', projectId: 'A', maestroSessionId: null, createdAt: 2 }),
      ],
      existingProjectIds: new Set(['A']),
      createSession,
      onError,
    });

    // p1 failed but p2 still restored — one bad PTY must not abort the rest.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(restored.map((s) => s.persistId)).toEqual(['p2']);
  });
});
