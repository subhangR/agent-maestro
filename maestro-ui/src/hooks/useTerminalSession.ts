import React, { useCallback, useRef } from "react";
import { platform } from "../platform";
import { TerminalSession, TerminalSessionInfo } from "../app/types/session";

export function useTerminalSession(
  setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>,
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>,
  reportError: (prefix: string, err: unknown) => void
) {
  const reportErrorRef = useRef(reportError);
  reportErrorRef.current = reportError;

  const spawningSessionsRef = useRef<Set<string>>(new Set());

  const spawnTerminalSession = useCallback(async (sessionInfo: {
    name: string;
    command: string | null;
    args: string[];
    cwd: string;
    envVars: Record<string, string>;
    projectId: string;
  }) => {
    // Use session name + project as dedup key
    const dedupKey = `${sessionInfo.projectId}:${sessionInfo.name}`;

    // Prevent duplicate spawns - check and add atomically
    if (spawningSessionsRef.current.has(dedupKey)) {
      return;
    }

    // Add to set immediately to block duplicates
    spawningSessionsRef.current.add(dedupKey);

    try {
      const info = await platform.terminal.createSession({
        name: sessionInfo.name,
        command: sessionInfo.command,
        cwd: sessionInfo.cwd,
        envVars: sessionInfo.envVars,
        persistent: false,
        persistId: `${sessionInfo.projectId}:${sessionInfo.name}`,
      });

      const newSession: TerminalSession = {
        ...info,
        projectId: sessionInfo.projectId,
        persistId: "",
        persistent: false,
        createdAt: Date.now(),
        launchCommand: sessionInfo.command,
        sshTarget: null,
        sshRootDir: null,
        cwd: sessionInfo.cwd,
        agentWorking: false,
        exited: false,
      };

      setSessions((prev) => [...prev, newSession]);
      setActiveId(newSession.id);

      // Clean up dedup key after a short delay
      setTimeout(() => {
        spawningSessionsRef.current.delete(dedupKey);
      }, 2000);
    } catch (err) {
      reportErrorRef.current("Failed to spawn terminal session", err);
      // Clean up dedup key immediately on error so user can retry
      spawningSessionsRef.current.delete(dedupKey);
    }
  }, [setSessions, setActiveId]);

  return { spawnTerminalSession };
}
