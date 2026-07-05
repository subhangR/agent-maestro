import { IS_TAURI } from './detect';
import { tauriTerminal, webTerminal } from './terminal';
import { tauriLogs, webLogs } from './logs';
import { tauriFs, webFs } from './fs';

export const platform = {
  isTauri: IS_TAURI,
  terminal: IS_TAURI ? tauriTerminal : webTerminal,
  logs: IS_TAURI ? tauriLogs : webLogs,
  fs: IS_TAURI ? tauriFs : webFs,
} as const;

export { IS_TAURI, isTauri } from './detect';
export type { SessionLogs, LogProvider, AgentLogFile, LogTailResult } from './logs';
export type { FsProvider, FsEntry, DirectoryListing, DirectoryEntry } from './fs';
