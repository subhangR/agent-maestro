// Maelstrom — MSW REST handlers (skeleton).
//
// Intercepts at the fetch layer so MaestroClient is tested unmodified (§2.3). These
// handlers double as the living REST contract spec (§3.2). Phase-0 covers only the
// boot path + the spawn endpoint; the full router inventory grows per phase.
//
// Requires `msw@^2` (added by Bedrock to package.json — not yet installed at Phase 0,
// so this file is import-guarded behind the test runner, not the app bundle).

import { http, HttpResponse } from 'msw';

// Base is parameterised by the test's chosen host; default mirrors staging (4569).
export function maestroHandlers(base = 'http://127.0.0.1:4569') {
  return [
    // Boot handshake: GET /health (outside /api, no auth) → accept host.
    http.get(`${base}/health`, () => HttpResponse.json({ ok: true })),
    http.get(`${base}/ws-status`, () => HttpResponse.json({ clients: 0 })),

    // Auth is OFF by default in v1 (no-auth directive). status reports disabled.
    http.get(`${base}/api/auth/status`, () => HttpResponse.json({ enabled: false })),

    // Read plane — minimal stand-ins, expanded in Phase 2.
    http.get(`${base}/api/projects`, () => HttpResponse.json([])),
    http.get(`${base}/api/tasks`, () => HttpResponse.json([])),
    http.get(`${base}/api/sessions`, () => HttpResponse.json([])),

    // Spawn (§3.3) — strict schema; Phase-3 tests assert the exact body. Skeleton
    // just echoes a 201 so the client's request path can be exercised early.
    http.post(`${base}/api/sessions/spawn`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(
        {
          success: true,
          sessionId: 'sess_spawned_1',
          manifestPath: '/tmp/manifest.json',
          message: 'spawned',
          session: { id: 'sess_spawned_1', taskIds: body.taskIds ?? [] },
        },
        { status: 201 },
      );
    }),
  ];
}
