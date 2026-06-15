import { invoke } from "@tauri-apps/api/core";
import { platform } from "../platform";
import { TerminalSession, TerminalSessionInfo } from "../app/types/session";
import { makeId } from "../app/utils/id";
import {
  commandTagFromCommandLine,
  detectProcessEffect,
} from "../processEffects";
import {
  isSshCommandLine,
  sshTargetFromCommandLine,
} from "../app/utils/ssh";

export async function createSession(input: {
  projectId: string;
  name?: string;
  launchCommand?: string | null;
  restoreCommand?: string | null;
  sshTarget?: string | null;
  sshRootDir?: string | null;
  lastRecordingId?: string | null;
  cwd?: string | null;
  envVars?: Record<string, string> | null;
  persistent?: boolean;
  persistId?: string;
  createdAt?: number;
}): Promise<TerminalSession> {
  const persistent = Boolean(input.persistent);
  const persistId = input.persistId ?? makeId();

  const trimmedCommand = (input.launchCommand ?? "").trim();
  const launchCommand = persistent ? null : trimmedCommand ? trimmedCommand : null;
  const isSshSession = isSshCommandLine(launchCommand ?? input.restoreCommand ?? null);
  const sshTarget = isSshSession
    ? (input.sshTarget?.trim() || sshTargetFromCommandLine(launchCommand ?? input.restoreCommand ?? null))
    : null;
  const sshRootDir = isSshSession ? input.sshRootDir?.trim() || null : null;
  const processTag = launchCommand ? commandTagFromCommandLine(launchCommand) : null;
  const effect = detectProcessEffect({
    command: launchCommand,
    name: input.name ?? null,
  });
  const info = await platform.terminal.createSession({
    name: input.name ?? null,
    command: launchCommand,
    cwd: input.cwd ?? null,
    envVars: input.envVars ?? null,
    persistent,
    persistId,
  });
  return {
    ...info,
    projectId: input.projectId,
    persistId,
    persistent,
    createdAt: input.createdAt ?? Date.now(),
    launchCommand,
    restoreCommand: input.restoreCommand ?? null,
    sshTarget,
    sshRootDir,
    lastRecordingId: input.lastRecordingId ?? null,
    recordingActive: false,
    cwd: info.cwd ?? input.cwd ?? null,
    effectId: effect?.id ?? null,
    processTag,
  };
}

export async function closeSession(id: string): Promise<void> {
  await platform.terminal.closeSession(id);
}

export async function detachSession(id: string): Promise<void> {
  await invoke("detach_session", { id });
}