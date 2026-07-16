/**
 * #154 — POST /api/sessions/:id/pty/stop must stop PTY-only sessions cleanly.
 *
 * The web client spawns standalone terminals via /pty/spawn that have a LIVE
 * server PTY but no persisted Session record. When the user stops one, the route
 * must:
 *   - return 2xx when it killed a live PTY-only id (no Session to mark stopped —
 *     that is NOT a failure),
 *   - still mark a session-backed id stopped and return 2xx,
 *   - surface a GENUINE PTY kill-signal failure as a distinguishable non-2xx
 *     (its own error code, not conflated with the persistence-failure code).
 *
 * The bug being fixed: the old route killed the PTY, then unconditionally called
 * updateSession(id, {status:'stopped'}). For a PTY-only id that throws
 * NotFoundError, so a fully-successful kill was reported as 500 pty_stop_failed.
 *
 * These are route-flow tests: ptyHostService.kill and sessionService.updateSession
 * are injected fakes so each kill outcome × session-existence combination is
 * exercised deterministically. The NotFoundError rejection uses the SAME class
 * SessionService.updateSession throws, so the tolerance check is faithful.
 */

import express from 'express';
import supertest from 'supertest';
import { createSessionRoutes } from '../src/api/sessionRoutes';
import { NotFoundError } from '../src/domain/common/Errors';

function buildApp(opts: {
  kill: jest.Mock;
  updateSession: jest.Mock;
  ptyHost?: string;
}) {
  const config = {
    serverUrl: 'http://localhost:3002',
    dataDir: '/tmp/pty-stop-route-test',
    port: 3002,
    ptyHost: opts.ptyHost ?? 'server', // the /pty/stop guard requires 'server'
  } as any;

  const sessionService = { updateSession: opts.updateSession } as any;
  const ptyHostService = { kill: opts.kill } as any;

  const sessionRoutes = createSessionRoutes({
    sessionService,
    sessionPromptService: {} as any,
    huddleService: {} as any,
    commandUsageService: {} as any,
    logDigestService: {} as any,
    teamService: {} as any,
    projectRepo: {} as any,
    taskRepo: {} as any,
    teamMemberRepo: {} as any,
    modelProfileRepo: {} as any,
    spellRepo: {} as any,
    eventBus: {} as any,
    config,
    ptyHostService,
  } as any);

  const app = express();
  app.use(express.json());
  app.use('/api', sessionRoutes);
  return { app, sessionService, ptyHostService };
}

describe('POST /api/sessions/:id/pty/stop (#154)', () => {
  it('returns 2xx when a live PTY-only id is killed even though no Session backs it', async () => {
    // A standalone web terminal: live PTY killed cleanly, but no Session record —
    // updateSession rejects NotFound. That is NOT a failure; the terminal stopped.
    const kill = jest.fn().mockReturnValue('killed');
    const updateSession = jest.fn().mockRejectedValue(new NotFoundError('Session', 'pty-only-1'));
    const { app } = buildApp({ kill, updateSession });

    const res = await supertest(app).post('/api/sessions/pty-only-1/pty/stop');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(kill).toHaveBeenCalledWith('pty-only-1');
  });

  it('still marks a session-backed id stopped and returns 2xx', async () => {
    // A persisted session: kill finds no live PTY (or kills one), and the status
    // is persisted to 'stopped'.
    const kill = jest.fn().mockReturnValue('not_found');
    const updateSession = jest.fn().mockResolvedValue({ id: 'sess-1', status: 'stopped' });
    const { app } = buildApp({ kill, updateSession });

    const res = await supertest(app).post('/api/sessions/sess-1/pty/stop');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(kill).toHaveBeenCalledWith('sess-1');
    expect(updateSession).toHaveBeenCalledWith('sess-1', { status: 'stopped' });
  });

  it('returns a DISTINGUISHABLE non-2xx when the PTY kill genuinely fails', async () => {
    // proc.kill() threw: the kill signal genuinely failed. This must be surfaced
    // with its OWN error code, not the generic persistence-failure code, and must
    // not be masked by a subsequent updateSession.
    const kill = jest.fn().mockReturnValue('error');
    const updateSession = jest.fn().mockResolvedValue({ id: 'sess-2', status: 'stopped' });
    const { app } = buildApp({ kill, updateSession });

    const res = await supertest(app).post('/api/sessions/sess-2/pty/stop');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toBe(true);
    expect(res.body.code).toBe('pty_kill_failed');
    expect(res.body.code).not.toBe('pty_stop_failed'); // distinguishable
    // A genuine kill failure short-circuits: we do NOT then claim the session stopped.
    expect(updateSession).not.toHaveBeenCalled();
  });

  it('treats stopping an unknown id (no PTY, no Session) as idempotent success', async () => {
    // Neither a live PTY nor a persisted Session: there is nothing to stop, which
    // is the desired end-state. Stop is idempotent, so this is 2xx, not an error.
    const kill = jest.fn().mockReturnValue('not_found');
    const updateSession = jest.fn().mockRejectedValue(new NotFoundError('Session', 'ghost'));
    const { app } = buildApp({ kill, updateSession });

    const res = await supertest(app).post('/api/sessions/ghost/pty/stop');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('surfaces a real persistence failure as 500 pty_stop_failed (distinct from a kill failure)', async () => {
    // The session exists but the write fails for a non-NotFound reason: that is a
    // genuine stop failure and keeps the original error code.
    const kill = jest.fn().mockReturnValue('killed');
    const updateSession = jest.fn().mockRejectedValue(new Error('disk full'));
    const { app } = buildApp({ kill, updateSession });

    const res = await supertest(app).post('/api/sessions/sess-3/pty/stop');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('pty_stop_failed');
  });

  it('is gated to server-hosted PTY mode (403 when disabled)', async () => {
    const kill = jest.fn();
    const updateSession = jest.fn();
    const { app } = buildApp({ kill, updateSession, ptyHost: 'tauri' });

    const res = await supertest(app).post('/api/sessions/whatever/pty/stop');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('pty_host_not_server');
    expect(kill).not.toHaveBeenCalled();
  });
});
