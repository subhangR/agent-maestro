import { IS_TAURI } from './detect';
import { tauriTerminal, webTerminal } from './terminal';
import { tauriLogs, webLogs } from './logs';

export const platform = {
  isTauri: IS_TAURI,
  terminal: IS_TAURI ? tauriTerminal : webTerminal,
  logs: IS_TAURI ? tauriLogs : webLogs,
} as const;

export { IS_TAURI, isTauri } from './detect';
export type { SessionLogs, LogProvider, AgentLogFile, LogTailResult } from './logs';
