import { invoke } from '@tauri-apps/api/core';
import { API_BASE_URL } from '../utils/serverConfig';

export type LogProvider = 'claude' | 'codex';

export interface AgentLogFile {
  filename: string;
  relativePath?: string;
  modifiedAt: number;
  size: number;
  maestroSessionId?: string | null;
}

export interface LogTailResult {
  content: string;
  newOffset: number;
  fileSize: number;
}

/**
 * Reads an agent's session-log transcript. Two backends:
 *   - Tauri desktop → Rust `invoke` commands (claude_logs.rs / codex_logs.rs)
 *   - Browser web-ui → server REST endpoints (/api/agent-logs/*)
 * Same shape either way so TerminalStrip is host-agnostic.
 */
export interface SessionLogs {
  list(provider: LogProvider, cwd: string): Promise<AgentLogFile[]>;
  read(provider: LogProvider, cwd: string, filename: string): Promise<string>;
  tail(provider: LogProvider, cwd: string, filename: string, offset: number): Promise<LogTailResult>;
}

export const tauriLogs: SessionLogs = {
  list(provider, cwd) {
    const command = provider === 'codex' ? 'list_codex_session_logs' : 'list_claude_session_logs';
    return invoke<AgentLogFile[]>(command, { cwd });
  },
  read(provider, cwd, filename) {
    const command = provider === 'codex' ? 'read_codex_session_log' : 'read_claude_session_log';
    return invoke<string>(command, { cwd, filename });
  },
  tail(provider, cwd, filename, offset) {
    const command = provider === 'codex' ? 'tail_codex_session_log' : 'tail_claude_session_log';
    return invoke<LogTailResult>(command, { cwd, filename, offset });
  },
};

async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}${path}?${qs}`);
  if (!res.ok) {
    throw new Error(`agent-logs request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const webLogs: SessionLogs = {
  list(provider, cwd) {
    return getJson<AgentLogFile[]>('/agent-logs/list', { provider, cwd });
  },
  async read(provider, cwd, filename) {
    const { content } = await getJson<{ content: string }>('/agent-logs/read', { provider, cwd, filename });
    return content;
  },
  tail(provider, cwd, filename, offset) {
    return getJson<LogTailResult>('/agent-logs/tail', { provider, cwd, filename, offset: String(offset) });
  },
};
