import { useMemo, useEffect, useRef, useState, MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../platform";
import { TerminalSession } from "../app/types/session";
import { MaestroProject } from "../app/types/maestro";
import { RecentSessionKey, TrayRecentSession, TrayMenuEventPayload } from "../app/types/app-state";
import { getProcessEffectById } from "../processEffects";

interface TrayManagerProps {
  sessions: TerminalSession[];
  projects: MaestroProject[];
  activeId: string | null;
  activeProjectId: string;
  recentSessionKeys: RecentSessionKey[];
  hydrated: boolean;
  // Tray action handling
  sessionsRef: MutableRefObject<TerminalSession[]>;
  activeProjectIdRef: MutableRefObject<string>;
  activeIdRef: MutableRefObject<string | null>;
  setActiveProjectId: (id: string) => void;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setProjectOpen: (open: boolean) => void;
  setNewOpen: (open: boolean) => void;
  quickStart: (preset: { id: string; title: string; command: string | null }) => Promise<void>;
}

export function useTrayManager({
  sessions,
  projects,
  activeId,
  activeProjectId,
  recentSessionKeys,
  hydrated,
  sessionsRef,
  activeProjectIdRef,
  activeIdRef,
  setActiveProjectId,
  setActiveId,
  setProjectOpen,
  setNewOpen,
  quickStart,
}: TrayManagerProps) {
  const [pendingTrayAction, setPendingTrayAction] = useState<TrayMenuEventPayload | null>(null);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  const trayStatus = useMemo(() => {
    const workingCount = sessions.filter(
      (s) => Boolean(s.effectId) && Boolean(s.agentWorking) && !s.exited && !s.closing,
    ).length;
    const sessionsOpen = sessions.filter((s) => !s.exited && !s.closing).length;
    const recordingCount = sessions.filter(
      (s) => Boolean(s.recordingActive) && !s.exited && !s.closing,
    ).length;
    return {
      workingCount,
      sessionsOpen,
      recordingCount,
      activeProject: activeProject?.name ?? null,
      activeSession: active?.name ?? null,
    };
  }, [active?.name, activeProject?.name, sessions]);

  const lastTrayStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!IS_TAURI) return;
    if (!hydrated) return;
    const key = JSON.stringify(trayStatus);
    if (lastTrayStatusRef.current === key) return;
    lastTrayStatusRef.current = key;
    void invoke("set_tray_status", {
      workingCount: trayStatus.workingCount,
      sessionsOpen: trayStatus.sessionsOpen,
      activeProject: trayStatus.activeProject,
      activeSession: trayStatus.activeSession,
      recordingCount: trayStatus.recordingCount,
    }).catch(() => {});
  }, [trayStatus, hydrated]);

  const trayRecentSessions = useMemo<TrayRecentSession[]>(() => {
    const open = sessions.filter((s) => !s.exited && !s.closing);
    const byKey = new Map<string, TerminalSession>();
    for (const s of open) byKey.set(`${s.projectId}:${s.persistId}`, s);

    const projectTitleById = new Map(
      projects.map((p) => [p.id, p.name?.trim?.() ? p.name.trim() : p.name]),
    );

    const out: TrayRecentSession[] = [];
    const seen = new Set<string>();

    const add = (s: TerminalSession) => {
      const key = `${s.projectId}:${s.persistId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const projectTitle = projectTitleById.get(s.projectId) ?? "\u2014";
      const rec = s.recordingActive ? " (REC)" : "";
      const label = `${s.name}${rec} \u2014 ${projectTitle}`;
      out.push({ label, projectId: s.projectId, persistId: s.persistId });
    };

    if (active && !active.exited && !active.closing) add(active);

    for (const key of recentSessionKeys) {
      const s = byKey.get(`${key.projectId}:${key.persistId}`);
      if (s) add(s);
      if (out.length >= 10) break;
    }

    return out.slice(0, 10);
  }, [projects, recentSessionKeys, sessions, activeId, active]);

  const lastTrayRecentsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!IS_TAURI) return;
    if (!hydrated) return;
    const key = JSON.stringify(trayRecentSessions);
    if (lastTrayRecentsRef.current === key) return;
    lastTrayRecentsRef.current = key;
    void invoke("set_tray_recent_sessions", { sessions: trayRecentSessions }).catch(() => {});
  }, [trayRecentSessions, hydrated]);

  // Handle incoming tray actions
  useEffect(() => {
    if (!pendingTrayAction) return;
    if (!hydrated) return;

    const action = pendingTrayAction;
    setPendingTrayAction(null);

    if (action.id === "recent-session") {
      const projectId = action.projectId ?? null;
      const persistId = action.persistId ?? null;
      if (!projectId || !persistId) return;
      const target =
        sessionsRef.current.find(
          (s) =>
            s.projectId === projectId &&
            s.persistId === persistId &&
            !s.exited &&
            !s.closing,
        ) ?? null;
      if (!target) return;

      activeProjectIdRef.current = projectId;
      activeIdRef.current = target.id;
      setActiveProjectId(projectId);
      setActiveId(target.id);
      return;
    }

    if (action.id === "new-terminal") {
      setProjectOpen(false);
      setNewOpen(true);
      return;
    }

    if (action.id === "start-agent") {
      const effect = getProcessEffectById(action.effectId ?? null);
      if (!effect) return;
      void quickStart({
        id: effect.id,
        title: effect.label,
        command: effect.matchCommands[0] ?? effect.label,
      });
    }
  }, [hydrated, pendingTrayAction, quickStart]);

  return { pendingTrayAction, setPendingTrayAction };
}
