import { MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../platform";
import { TerminalSession } from "../app/types/session";
import { MaestroProject } from "../app/types/maestro";
import { TerminalRegistry } from "../SessionTerminal";
import { EnvironmentConfig } from "../app/types/app";
import { LoadedRecording } from "../app/types/recording";
import { getProcessEffectById } from "../processEffects";
import { envVarsForProjectId } from "../app/utils/env";
import { createSession } from "../services/sessionService";
import { sleep } from "../utils/domUtils";

interface UseReplayExecutionProps {
  registry: MutableRefObject<TerminalRegistry>;
  replayTargetSessionId: string | null;
  setReplayTargetSessionId: (id: string | null) => void;
  replayRecording: LoadedRecording | null;
  replaySteps: string[];
  replayIndex: number;
  setReplayIndex: React.Dispatch<React.SetStateAction<number>>;
  active: TerminalSession | null;
  activeProject: MaestroProject | null;
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  projects: MaestroProject[];
  environments: EnvironmentConfig[];
  homeDirRef: MutableRefObject<string | null>;
  setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  applyPendingExit: (session: TerminalSession) => TerminalSession;
  reportError: (title: string, error: unknown) => void;
}

export function useReplayExecution({
  registry,
  replayTargetSessionId,
  setReplayTargetSessionId,
  replayRecording,
  replaySteps,
  replayIndex,
  setReplayIndex,
  active,
  activeProject,
  activeProjectId,
  setActiveProjectId,
  projects,
  environments,
  homeDirRef,
  setSessions,
  setActiveId,
  applyPendingExit,
  reportError,
}: UseReplayExecutionProps) {
  async function ensureReplayTargetSession(): Promise<string | null> {
    if (replayTargetSessionId) return replayTargetSessionId;

    const rec = replayRecording;
    const cwd = rec?.meta?.cwd ?? active?.cwd ?? activeProject?.basePath ?? homeDirRef.current ?? null;
    const projectId =
      (rec?.meta?.projectId && projects.some((p) => p.id === rec.meta?.projectId)
        ? rec.meta.projectId
        : null) ?? activeProjectId;
    const bootstrapCommand = (() => {
      const fromMeta = rec?.meta?.bootstrapCommand?.trim() ?? "";
      if (fromMeta) return fromMeta;
      const effect = getProcessEffectById(rec?.meta?.effectId ?? null);
      return effect?.matchCommands?.[0] ?? null;
    })();
    const name = rec?.meta?.name?.trim()
      ? `replay: ${rec.meta.name.trim()}`
      : bootstrapCommand
        ? `replay ${bootstrapCommand}`
        : "replay";

    try {
      const createdRaw = await createSession({
        projectId,
        name,
        launchCommand: bootstrapCommand,
        cwd,
        envVars: envVarsForProjectId(projectId, projects, environments),
      });
      const created = applyPendingExit(createdRaw);
      setSessions((prev) => [...prev, created]);
      setActiveProjectId(projectId);
      setActiveId(created.id);
      setReplayTargetSessionId(created.id);
      return created.id;
    } catch (err) {
      reportError("Failed to create replay session", err);
      return null;
    }
  }

  async function sendNextReplayStep() {
    if (!IS_TAURI) return;
    if (!replaySteps.length) return;
    if (replayIndex >= replaySteps.length) return;

    const targetId = (await ensureReplayTargetSession()) ?? null;
    if (!targetId) return;

    const chunk = replaySteps[replayIndex];
    try {
      registry.current.get(targetId)?.term.focus();

      const newlineMatch = chunk.match(/[\r\n]+$/);
      const trailing = newlineMatch?.[0] ?? "";
      const body = trailing ? chunk.slice(0, -trailing.length) : chunk;

      if (body) {
        await invoke("write_to_session", { id: targetId, data: body, source: "system" });
      }

      if (trailing) {
        if (body) await sleep(30);
        const enterCount = trailing.replace(/[^\r\n]/g, "").length;
        for (let i = 0; i < enterCount; i++) {
          await invoke("write_to_session", { id: targetId, data: "\r", source: "system" });
          if (i < enterCount - 1) await sleep(10);
        }
      }

      setReplayIndex((i) => i + 1);
    } catch (err) {
      reportError("Failed to replay input", err);
    }
  }

  return {
    sendNextReplayStep,
  };
}
