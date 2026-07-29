import { ISessionRepository } from '../../domain/repositories/ISessionRepository';
import { ITaskRepository } from '../../domain/repositories/ITaskRepository';
import { LaunchProvider, TokenUsageSnapshot } from '../../types';
import { NotFoundError } from '../../domain/common/Errors';

export interface SessionTokenEntry {
  sessionId: string;
  tokenUsage: TokenUsageSnapshot | null;
}

export interface TaskTokenSummary {
  taskId: string;
  sessions: SessionTokenEntry[];
  totals: TokenUsageSnapshot;
}

export interface GlobalTokenSummary {
  totals: TokenUsageSnapshot;
  byProvider: Partial<Record<LaunchProvider | 'unknown', TokenUsageSnapshot>>;
  byModel: Record<string, TokenUsageSnapshot>;
  sessionCount: number;
  windowMs: number;
}

function zero(): TokenUsageSnapshot {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, provider: null, model: null, capturedAt: Date.now() };
}

function add(a: TokenUsageSnapshot, b: TokenUsageSnapshot): TokenUsageSnapshot {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheCreate: a.cacheCreate + b.cacheCreate,
    cacheRead: a.cacheRead + b.cacheRead,
    total: a.total + b.total,
    provider: null,
    model: null,
    capturedAt: a.capturedAt,
  };
}

export class TokenAnalyticsService {
  constructor(
    private sessionRepo: ISessionRepository,
    private taskRepo: ITaskRepository,
  ) {}

  async getTaskTokenSummary(taskId: string): Promise<TaskTokenSummary> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) throw new NotFoundError('Task', taskId);

    const sessions: SessionTokenEntry[] = await Promise.all(
      task.sessionIds.map(async (sid) => {
        const s = await this.sessionRepo.findById(sid);
        return { sessionId: sid, tokenUsage: s?.tokenUsage ?? null };
      }),
    );

    const totals = sessions.reduce(
      (acc, s) => (s.tokenUsage ? add(acc, s.tokenUsage) : acc),
      zero(),
    );

    return { taskId, sessions, totals };
  }

  async getGlobalSummary(windowMs = 24 * 60 * 60 * 1000): Promise<GlobalTokenSummary> {
    const cutoff = Date.now() - windowMs;
    const allSessions = await this.sessionRepo.findAll();
    const inWindow = allSessions.filter(
      (s) => s.tokenUsage && s.tokenUsage.capturedAt >= cutoff,
    );

    let totals = zero();
    const byProvider: Partial<Record<string, TokenUsageSnapshot>> = {};
    const byModel: Record<string, TokenUsageSnapshot> = {};

    for (const s of inWindow) {
      const u = s.tokenUsage!;
      totals = add(totals, u);

      const pk = u.provider ?? 'unknown';
      byProvider[pk] = add(byProvider[pk] ?? zero(), u);

      if (u.model) {
        byModel[u.model] = add(byModel[u.model] ?? zero(), u);
      }
    }

    return {
      totals,
      byProvider: byProvider as Partial<Record<LaunchProvider | 'unknown', TokenUsageSnapshot>>,
      byModel,
      sessionCount: inWindow.length,
      windowMs,
    };
  }
}
