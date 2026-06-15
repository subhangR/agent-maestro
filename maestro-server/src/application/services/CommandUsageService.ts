import {
  CommandUsageRecord,
  ISessionCommandUsageRepository,
} from '../../domain/repositories/ISessionCommandUsageRepository';

export interface CommandUsagePerCommand {
  command: string;
  total: number;
  failed: number;
}

export interface CommandUsageSummary {
  total: number;
  succeeded: number;
  failed: number;
  /** Per-command tallies, sorted by total usage descending. */
  byCommand: CommandUsagePerCommand[];
}

export interface SessionCommandUsage {
  sessionId: string;
  summary: CommandUsageSummary;
  records: CommandUsageRecord[];
}

/**
 * Read-only view over the maestro CLI command-usage logs. Surfaces per-session
 * command history (what commands an agent ran, exit codes, failures) for the
 * Session Stats UI.
 */
export class CommandUsageService {
  constructor(private repo: ISessionCommandUsageRepository) {}

  async getForSession(sessionId: string): Promise<SessionCommandUsage> {
    const records = await this.repo.findBySession(sessionId);
    return {
      sessionId,
      summary: this.summarize(records),
      records,
    };
  }

  private summarize(records: CommandUsageRecord[]): CommandUsageSummary {
    const byCommand = new Map<string, CommandUsagePerCommand>();
    let succeeded = 0;
    let failed = 0;

    for (const r of records) {
      if (r.success) succeeded += 1;
      else failed += 1;

      const key = r.command || '(unknown)';
      const entry = byCommand.get(key) || { command: key, total: 0, failed: 0 };
      entry.total += 1;
      if (!r.success) entry.failed += 1;
      byCommand.set(key, entry);
    }

    return {
      total: records.length,
      succeeded,
      failed,
      byCommand: Array.from(byCommand.values()).sort((a, b) => b.total - a.total),
    };
  }
}
