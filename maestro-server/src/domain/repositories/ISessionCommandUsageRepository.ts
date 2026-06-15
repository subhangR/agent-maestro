/**
 * One tracked maestro CLI invocation. Written by the CLI's command-tracker
 * (maestro-cli/src/services/command-tracker.ts) as one JSON line per command to
 * <dataDir>/command-logs/<sessionId>.jsonl. The server only ever reads it.
 */
export interface CommandUsageRecord {
  /** ISO timestamp captured when the CLI process started. */
  ts: string;
  sessionId: string | null;
  projectId: string | null;
  /** Resolved command path, e.g. "task report complete". */
  command: string | null;
  /** Full arguments after the binary (process.argv.slice(2)). */
  argv: string[];
  exitCode: number;
  durationMs: number;
  success: boolean;
  cliVersion: string | null;
}

export interface ISessionCommandUsageRepository {
  /**
   * All tracked command records for a session, oldest first. Returns an empty
   * array when the session has no log file yet.
   */
  findBySession(sessionId: string): Promise<CommandUsageRecord[]>;
}
