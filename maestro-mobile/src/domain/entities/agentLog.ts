// Mirrors maestro-server/src/application/services/AgentLogService.ts — the
// browser/mobile-facing shape of the agent session-log endpoints
// (GET /api/agent-logs/list|read|tail). These logs are the raw provider
// transcripts (Claude/Codex) surfaced to non-Tauri clients. Do not edit the
// shape without matching the server.

/** The provider whose on-disk session logs are being read. */
export type LogProvider = 'claude' | 'codex';

/** One discovered agent log file for a given cwd + provider. */
export interface AgentLogFile {
  filename: string;
  relativePath?: string;
  modifiedAt: number;
  size: number;
  /** The maestro session this log belongs to (parsed from the transcript), if any. */
  maestroSessionId: string | null;
}

/** Incremental tail result — `newOffset` feeds the next /tail poll. */
export interface LogTailResult {
  content: string;
  newOffset: number;
  fileSize: number;
}
