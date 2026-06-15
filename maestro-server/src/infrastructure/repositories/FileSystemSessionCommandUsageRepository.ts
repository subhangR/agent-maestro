import * as fs from 'fs/promises';
import * as path from 'path';
import {
  CommandUsageRecord,
  ISessionCommandUsageRepository,
} from '../../domain/repositories/ISessionCommandUsageRepository';
import { ILogger } from '../../domain/common/ILogger';

/**
 * Reads the per-session JSONL command-usage logs written by the maestro CLI at
 * <dataDir>/command-logs/<sessionId>.jsonl. Read-only: the CLI is the sole
 * writer. A missing file simply means the session ran no tracked commands.
 */
export class FileSystemSessionCommandUsageRepository implements ISessionCommandUsageRepository {
  private logsDir: string;

  constructor(
    private dataDir: string,
    private logger: ILogger
  ) {
    this.logsDir = path.join(dataDir, 'command-logs');
  }

  async findBySession(sessionId: string): Promise<CommandUsageRecord[]> {
    const filePath = path.join(this.logsDir, `${sessionId}.jsonl`);

    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      // ENOENT (no commands tracked yet) is expected; surface nothing else loudly.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Failed to read command-usage log for session ${sessionId}`, {
          error: (err as Error).message,
        });
      }
      return [];
    }

    const records: CommandUsageRecord[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as CommandUsageRecord);
      } catch {
        // Skip a partially-written or corrupt line without failing the request.
      }
    }
    return records;
  }
}
