# Token Analytics & Provider Quota Management — Implementation Design

**Status:** Design-only. Read-only audit of /home/ubuntu/agent-maestro as of 2026-07-29.

---

## 1. Current State (What Exists)

### Token Accounting (Ephemeral, On-Demand)
- `LogDigestService.getSessionStats()` (`maestro-server/src/application/services/LogDigestService.ts:270`) scans JSONL transcripts on-demand and returns `SessionStatsDigest` with `tokens: {input, output, cacheCreate, cacheRead, total}`.
- `GET /api/sessions/:id/stats` (`maestro-server/src/api/sessionRoutes.ts:~L52`) calls `getSessionStats()`.
- `SessionStatsView.tsx` (Tauri) reads JSONL via Tauri IPC and computes stats client-side via `computeTranscriptStats()`.
- `TokenUsageBadge.tsx` (`maestro-ui/src/components/session-log/viewers/TokenUsageBadge.tsx`) renders simple in/out display.
- Nothing is persisted: every stats fetch re-scans the JSONL file.

### Missing
1. No `tokenUsage` field on `Session` or `Task` entities.
2. No task-level or global token aggregation.
3. No per-provider breakdown or reporting.
4. No quota limits on `ModelProfile`.
5. No enforcement at spawn time.

---

## 2. Design Overview

### Smallest Production-Ready Vertical Slice (Phase 1)

**Hook on session termination → persist tokenUsage → aggregate on demand.**

No new repositories. No new tables. Four files changed plus tests.

### Phase 2 (Provider Quotas)

Extend `ModelProfile` with `quotas`. Enforce at spawn. Two additional files.

---

## 3. Schema Changes

### 3.1 Add `tokenUsage` to `Session` (`maestro-server/src/types.ts`)

**Where:** After the `activeSpells: ActiveSpell[]` field at approximately line 548.

```ts
// New interface (add near LaunchConfig definitions, ~line 105):
export interface TokenUsageSnapshot {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  provider: LaunchProvider | null;   // from teamMemberSnapshot.launchConfig.provider
  model: string | null;              // first model seen in the transcript
  capturedAt: number;                // epoch ms when snapshot was written
}

// Extend Session interface (after activeSpells field, ~line 548):
tokenUsage?: TokenUsageSnapshot;     // written once at session termination
```

**Migration:** Zero-risk additive field. Existing sessions read back without it; consumers treat absence as zero-tokens. No sentinel file needed.

### 3.2 Add quota fields to `ModelProfile` (`maestro-server/src/types.ts`)

**Where:** After `isDefault?: boolean` in `ModelProfile` interface (~line 120).

```ts
export interface ModelProfileQuotas {
  /** Hard cap on tokens consumed by any single session using this profile. */
  maxTokensPerSession?: number;
  /** Hard cap on tokens consumed globally across all sessions using this profile
   *  in a rolling 24-hour window. 0 = disabled. */
  maxTokensPerDay?: number;
  /** Hard cap on concurrently active sessions using this profile. 0 = disabled. */
  maxConcurrentSessions?: number;
}

// In ModelProfile (after isDefault line):
quotas?: ModelProfileQuotas;
```

---

## 4. Backend Changes

### 4.1 `SessionService` — Capture Token Stats on Termination

**File:** `maestro-server/src/application/services/SessionService.ts`

**Where:** In `updateSession()`, after the guard block for `stopped` overwriting `completed` (~line 182), inside the `if (updates.status && ['stopped', 'completed', 'failed'].includes(updates.status))` block.

Add a call to capture token stats:

```ts
// After task status propagation loop, before eventBus.emit:
if (updates.status && ['stopped', 'completed', 'failed'].includes(updates.status)) {
  // --- NEW: capture token usage snapshot ---
  try {
    const statsDigest = await this.logDigestService.getSessionStats(id, { lastMessages: 0 });
    if (statsDigest.jsonlFound) {
      const provider: LaunchProvider | null =
        (session.teamMemberSnapshot?.launchConfig?.provider as LaunchProvider) ?? null;
      const model: string | null = statsDigest.models[0] ?? null;
      const snap: TokenUsageSnapshot = {
        input: statsDigest.tokens.input,
        output: statsDigest.tokens.output,
        cacheCreate: statsDigest.tokens.cacheCreate,
        cacheRead: statsDigest.tokens.cacheRead,
        total: statsDigest.tokens.total,
        provider,
        model,
        capturedAt: Date.now(),
      };
      await this.sessionRepo.update(id, { tokenUsage: snap });
    }
  } catch {
    // Best-effort: don't block session status update on log scan failure.
  }
}
```

**Constructor:** `SessionService` already receives `LogDigestService` indirectly. Add `LogDigestService` as a constructor parameter and wire it in `container.ts`.

**Exact container.ts change** (after `logDigestService` instantiation, ~line 110):

```ts
const sessionService = new SessionService(
  sessionRepo,
  taskRepo,
  projectRepo,
  eventBus,
  idGenerator,
  logDigestService,  // ADD THIS
);
```

**Update `SessionService` constructor** (`maestro-server/src/application/services/SessionService.ts`, top of class):

```ts
constructor(
  private sessionRepo: ISessionRepository,
  private taskRepo: ITaskRepository,
  private projectRepo: IProjectRepository,
  private eventBus: IEventBus,
  private idGenerator: IIdGenerator,
  private logDigestService: LogDigestService,  // ADD
) {}
```

### 4.2 New Application Service: `TokenAnalyticsService`

**New file:** `maestro-server/src/application/services/TokenAnalyticsService.ts`

```ts
import { ISessionRepository } from '../../domain/repositories/ISessionRepository';
import { ITaskRepository } from '../../domain/repositories/ITaskRepository';
import { LaunchProvider, TokenUsageSnapshot } from '../../types';

export interface TaskTokenSummary {
  taskId: string;
  sessions: Array<{ sessionId: string; tokenUsage: TokenUsageSnapshot | null }>;
  totals: TokenUsageSnapshot;
}

export interface GlobalTokenSummary {
  totals: TokenUsageSnapshot;
  byProvider: Partial<Record<LaunchProvider | 'unknown', TokenUsageSnapshot>>;
  byModel: Record<string, TokenUsageSnapshot>;
  sessionCount: number;
  windowMs: number;   // rolling window used for the query
}

const ZERO = (): TokenUsageSnapshot => ({
  input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0,
  provider: null, model: null, capturedAt: Date.now(),
});

function add(a: TokenUsageSnapshot, b: TokenUsageSnapshot): TokenUsageSnapshot {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheCreate: a.cacheCreate + b.cacheCreate,
    cacheRead: a.cacheRead + b.cacheRead,
    total: a.total + b.total,
    provider: null,
    model: null,
    capturedAt: Date.now(),
  };
}

export class TokenAnalyticsService {
  constructor(
    private sessionRepo: ISessionRepository,
    private taskRepo: ITaskRepository,
  ) {}

  async getTaskTokenSummary(taskId: string): Promise<TaskTokenSummary> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const sessions = await Promise.all(
      task.sessionIds.map(async (sid) => {
        const s = await this.sessionRepo.findById(sid);
        return { sessionId: sid, tokenUsage: s?.tokenUsage ?? null };
      })
    );

    const totals = sessions.reduce(
      (acc, s) => s.tokenUsage ? add(acc, s.tokenUsage) : acc,
      ZERO()
    );

    return { taskId, sessions, totals };
  }

  async getGlobalSummary(windowMs = 24 * 60 * 60 * 1000): Promise<GlobalTokenSummary> {
    const cutoff = Date.now() - windowMs;
    const allSessions = await this.sessionRepo.findAll();
    const inWindow = allSessions.filter(
      (s) => s.tokenUsage && s.tokenUsage.capturedAt >= cutoff
    );

    let totals = ZERO();
    const byProvider: Partial<Record<string, TokenUsageSnapshot>> = {};
    const byModel: Record<string, TokenUsageSnapshot> = {};

    for (const s of inWindow) {
      const u = s.tokenUsage!;
      totals = add(totals, u);

      const pk = u.provider ?? 'unknown';
      byProvider[pk] = add(byProvider[pk] ?? ZERO(), u);

      if (u.model) {
        byModel[u.model] = add(byModel[u.model] ?? ZERO(), u);
      }
    }

    return {
      totals,
      byProvider: byProvider as any,
      byModel,
      sessionCount: inWindow.length,
      windowMs,
    };
  }
}
```

### 4.3 New API Routes: `tokenAnalyticsRoutes.ts`

**New file:** `maestro-server/src/api/tokenAnalyticsRoutes.ts`

```ts
import express, { Request, Response } from 'express';
import { z } from 'zod';
import { TokenAnalyticsService } from '../application/services/TokenAnalyticsService';
import { handleRouteError } from './middleware/errorHandler';
import { validateParams, validateQuery, idParamSchema } from './validation';

const windowQuerySchema = z.object({
  windowMs: z.coerce.number().int().min(60_000).max(30 * 24 * 60 * 60 * 1000)
    .optional().default(24 * 60 * 60 * 1000),
});

export function createTokenAnalyticsRoutes(service: TokenAnalyticsService) {
  const router = express.Router();

  // GET /analytics/tokens/global?windowMs=86400000
  router.get('/analytics/tokens/global', validateQuery(windowQuerySchema),
    async (req: Request, res: Response) => {
      try {
        const { windowMs } = windowQuerySchema.parse(req.query);
        res.json(await service.getGlobalSummary(windowMs));
      } catch (err) { handleRouteError(err, res); }
    }
  );

  // GET /analytics/tokens/tasks/:id
  router.get('/analytics/tokens/tasks/:id', validateParams(idParamSchema),
    async (req: Request, res: Response) => {
      try {
        res.json(await service.getTaskTokenSummary(req.params.id as string));
      } catch (err) { handleRouteError(err, res); }
    }
  );

  return router;
}
```

**Wire in `container.ts`** (after `tokenAnalyticsService` instantiation):

```ts
const tokenAnalyticsService = new TokenAnalyticsService(sessionRepo, taskRepo);
```

**Wire in `api/index.ts`**:

```ts
app.use('/api', createTokenAnalyticsRoutes(tokenAnalyticsService));
```

### 4.4 Provider Quota Enforcement (`ModelProfileService`)

**File:** `maestro-server/src/application/services/ModelProfileService.ts`

Add a new public method `checkQuota()`:

```ts
async checkSessionQuota(
  profileId: string,
  activeSessionCount: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const profile = await this.modelProfileRepo.findById(profileId);
  if (!profile?.quotas) return { allowed: true };
  const { maxConcurrentSessions } = profile.quotas;
  if (maxConcurrentSessions && activeSessionCount >= maxConcurrentSessions) {
    return {
      allowed: false,
      reason: `Profile "${profile.name}" concurrent session limit (${maxConcurrentSessions}) reached`,
    };
  }
  return { allowed: true };
}

async checkDailyTokenQuota(
  profileId: string,
  tokenAnalyticsService: TokenAnalyticsService,
): Promise<{ allowed: boolean; reason?: string }> {
  const profile = await this.modelProfileRepo.findById(profileId);
  if (!profile?.quotas?.maxTokensPerDay) return { allowed: true };
  const summary = await tokenAnalyticsService.getGlobalSummary(24 * 60 * 60 * 1000);
  // Filter by profile's provider for per-provider quota
  const providerKey = profile.launchConfig.provider;
  const used = summary.byProvider[providerKey]?.total ?? 0;
  if (used >= profile.quotas.maxTokensPerDay) {
    return {
      allowed: false,
      reason: `Profile "${profile.name}" daily token limit (${profile.quotas.maxTokensPerDay.toLocaleString()}) reached`,
    };
  }
  return { allowed: true };
}
```

**Spawn enforcement** — call `checkSessionQuota` in `SessionService.spawnSession()` (or wherever spawn occurs), before creating the session entity. Return HTTP 429 when blocked.

**Validation schema update** (`maestro-server/src/api/validation.ts`):

```ts
export const modelProfileQuotasSchema = z.object({
  maxTokensPerSession: z.number().int().positive().optional(),
  maxTokensPerDay: z.number().int().positive().optional(),
  maxConcurrentSessions: z.number().int().positive().optional(),
}).optional();

// Add to createModelProfileSchema and updateModelProfileSchema:
quotas: modelProfileQuotasSchema,
```

---

## 5. UI Changes

### 5.1 Global Analytics Panel

**New file:** `maestro-ui/src/components/maestro/TokenAnalyticsDashboard.tsx`

Display:
- Total tokens in last 24h, 7d, 30d (dropdown selector)
- Bar chart: breakdown by provider (claude / openai / gemini / etc.)
- Bar chart: breakdown by model
- Session count

Data source: `GET /api/analytics/tokens/global?windowMs=N`

Integration point: Add as a new tab in `Dashboard.tsx` (which already has project/session tabs).

### 5.2 Task-Level Token Summary

**File:** `maestro-ui/src/components/maestro/TaskTabContent.tsx`

Add a `TokenSummaryBar` sub-component that fetches `GET /api/analytics/tokens/tasks/:id` and renders:
- Total tokens across all sessions for this task
- Per-session breakdown (expandable)
- Provider attribution badge

### 5.3 Quota Display on ModelProfile UI

**File:** `maestro-ui/src/components/maestro/TeamView.tsx` (or wherever model profiles are edited)

Add quota fields to the model profile edit form:
- `maxConcurrentSessions` (number input, 0 = disabled)
- `maxTokensPerDay` (number input, 0 = disabled)
- `maxTokensPerSession` (number input, 0 = disabled)

Display quota usage bar if limits are set.

### 5.4 Session Stats Improvements

**File:** `maestro-ui/src/components/maestro/SessionStatsView.tsx`

When session has `tokenUsage` field (from persisted snapshot), use it as a fast-path fallback instead of scanning JSONL. Prioritize the Tauri live scan when available (more accurate), fall back to server API, then fall back to `session.tokenUsage` snapshot.

---

## 6. Data Flow

```
Session terminates (stopped/completed/failed)
  → SessionService.updateSession()
  → logDigestService.getSessionStats(id, { lastMessages: 0 })
  → sessionRepo.update(id, { tokenUsage: snap })
  → Session JSON file updated atomically

GET /api/analytics/tokens/tasks/:taskId
  → TaskRepo.findById(taskId) → session IDs
  → For each: sessionRepo.findById(sid).tokenUsage
  → Sum & return (no JSONL scanning)

GET /api/analytics/tokens/global?windowMs=86400000
  → sessionRepo.findAll()
  → Filter by tokenUsage.capturedAt >= cutoff
  → Group by provider/model
  → Return totals

Spawn with ModelProfile
  → modelProfileService.checkSessionQuota(profileId, activeCount)
  → if blocked → 429 QuotaExceededError
  → if allowed → create session
```

---

## 7. Tests

### 7.1 New: `maestro-server/test/token-analytics.test.ts`

Tests for `TokenAnalyticsService`:

```ts
describe('TokenAnalyticsService', () => {
  it('sums tokenUsage across sessions for a task', async () => { ... });
  it('returns zeros for tasks with no sessions having tokenUsage', async () => { ... });
  it('global summary filters by windowMs', async () => { ... });
  it('global summary groups by provider', async () => { ... });
  it('global summary groups by model', async () => { ... });
});
```

### 7.2 New: `maestro-server/test/quota-enforcement.test.ts`

Tests for `ModelProfileService.checkSessionQuota()`:

```ts
describe('Provider quota', () => {
  it('allows spawn when no quotas set', async () => { ... });
  it('blocks spawn at maxConcurrentSessions limit', async () => { ... });
  it('allows spawn below maxConcurrentSessions limit', async () => { ... });
  it('blocks daily token quota when exceeded', async () => { ... });
});
```

### 7.3 Update: `maestro-server/test/command-usage.test.ts` pattern

Use same `TestDataDir` + `createTestContainer` helper pattern from `command-usage.test.ts:L14-L50`.

### 7.4 New: `maestro-ui/src/__tests__/TokenAnalyticsDashboard.test.tsx`

Vitest + React Testing Library:

```ts
it('renders total tokens from global analytics API', async () => { ... });
it('shows per-provider bar chart', async () => { ... });
it('shows --  when no data available', async () => { ... });
```

---

## 8. API Contracts (Full)

### `GET /api/analytics/tokens/global`

Query: `?windowMs=86400000` (default: 24h, min: 60000, max: 30d)

Response `200 GlobalTokenSummary`:
```json
{
  "totals": { "input": 1234, "output": 567, "cacheCreate": 89, "cacheRead": 123, "total": 2013, "provider": null, "model": null, "capturedAt": 1234567890 },
  "byProvider": {
    "claude": { "input": 900, "output": 400, ... },
    "openai": { "input": 334, "output": 167, ... }
  },
  "byModel": {
    "claude-sonnet-4-6": { ... }
  },
  "sessionCount": 47,
  "windowMs": 86400000
}
```

### `GET /api/analytics/tokens/tasks/:id`

Response `200 TaskTokenSummary`:
```json
{
  "taskId": "task_xxx",
  "sessions": [
    { "sessionId": "sess_aaa", "tokenUsage": { "input": 500, "output": 200, ... } },
    { "sessionId": "sess_bbb", "tokenUsage": null }
  ],
  "totals": { "input": 500, "output": 200, "cacheCreate": 0, "cacheRead": 50, "total": 750, ... }
}
```

### `GET /api/sessions/:id/stats` (unchanged, existing)

Continues to work as before — live JSONL scan, returns `SessionStatsDigest`.

---

## 9. Exact File/Line Summary

| File | Change | Lines Affected |
|---|---|---|
| `maestro-server/src/types.ts` | Add `TokenUsageSnapshot`, add `tokenUsage?` to `Session`, add `ModelProfileQuotas`, add `quotas?` to `ModelProfile` | ~L105, ~L120, ~L548 |
| `maestro-server/src/application/services/SessionService.ts` | Add `logDigestService` param, capture snapshot on termination | Constructor, `updateSession()` |
| `maestro-server/src/application/services/TokenAnalyticsService.ts` | **New file** | N/A |
| `maestro-server/src/application/services/ModelProfileService.ts` | Add `checkSessionQuota()`, `checkDailyTokenQuota()` | Append ~20 lines |
| `maestro-server/src/api/tokenAnalyticsRoutes.ts` | **New file** | N/A |
| `maestro-server/src/api/validation.ts` | Add `modelProfileQuotasSchema`, update model profile schemas | ~+10 lines |
| `maestro-server/src/container.ts` | Wire `TokenAnalyticsService`, pass `logDigestService` to `SessionService` | ~+8 lines |
| `maestro-server/src/api/index.ts` | Register `tokenAnalyticsRoutes` | ~+3 lines |
| `maestro-ui/src/components/maestro/TokenAnalyticsDashboard.tsx` | **New file** | N/A |
| `maestro-ui/src/components/maestro/TaskTabContent.tsx` | Add `TokenSummaryBar` | ~+50 lines |
| `maestro-ui/src/app/types/maestro.ts` | Add `TokenUsageSnapshot`, `GlobalTokenSummary`, `TaskTokenSummary` | ~+30 lines |
| `maestro-server/test/token-analytics.test.ts` | **New test file** | N/A |
| `maestro-server/test/quota-enforcement.test.ts` | **New test file** | N/A |

---

## 10. Compatibility & Deployment Risks

### Backward Compatibility
- **Session JSON files** without `tokenUsage` are read fine (field is `?` optional). No migration needed.
- **`GET /api/sessions/:id/stats`** is unchanged — existing UI still works.
- **Model profiles** without `quotas` work fine — quota enforcement is opt-in.

### Deployment Risks
1. **JSONL scan at session termination** adds latency to the `PATCH /api/sessions/:id` call that sets `status: completed`. Worst case: 25MB JSONL = ~500ms. Mitigate: already bounded by `MAX_STATS_FILE_BYTES = 25MB` in `LogDigestService`; run asynchronously (fire-and-forget inside `try/catch`).
2. **`sessionRepo.findAll()` in global summary** scans every session JSON on disk. For large fleets (1000+ sessions), this could be slow. Mitigate: add a `?windowMs` filter and trust OS filesystem caching; the field `capturedAt` is embedded so filtering is cheap after load. Long-term: maintain a separate `token-ledger.jsonl` append-log for O(1) global aggregation.
3. **Quota enforcement race condition** at spawn time (two concurrent spawns both checking concurrent limit, both passing). Mitigate: accept this race for Phase 1; add advisory-only enforcement. Phase 2 can add a mutex at the service layer.
4. **Daily token quota uses `byProvider` not `byProfile`**: A profile quota is checked against all tokens from its provider, not just its own sessions. Mitigate in Phase 2 by tagging each session's `tokenUsage` with `modelProfileId`.

### Zero-Downtime Deploy
All changes are additive. Server upgrade is safe while old UI is running. New API routes are new paths; no existing routes change.

---

## 11. Implementation Order (Recommended)

1. **`TokenUsageSnapshot` type + `Session.tokenUsage`** — 10 min, zero risk.
2. **`SessionService` finalization hook** — 20 min; test with `command-usage.test.ts` pattern.
3. **`TokenAnalyticsService` + routes** — 30 min; wire in container.
4. **Tests** (`token-analytics.test.ts`) — 30 min.
5. **UI: `TaskTabContent.tsx` token bar** — 30 min; query `GET /analytics/tokens/tasks/:id`.
6. **UI: `TokenAnalyticsDashboard.tsx`** — 45 min; global stats.
7. **`ModelProfileQuotas` + enforcement** — 30 min; opt-in, no breakage.
8. **Quota tests** (`quota-enforcement.test.ts`) — 20 min.

Total estimated implementation: ~4 hours of focused work.
