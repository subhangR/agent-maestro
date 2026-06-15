import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../platform";
import { TerminalSession } from "../app/types/session";
import { WorkspaceView } from "../app/types/workspace";

interface UseSshRootResolutionProps {
  active: TerminalSession | null;
  activeIsSsh: boolean;
  activeSshTarget: string | null;
  activeProjectId: string;
  activeWorkspaceKey: string;
  activeWorkspaceView: WorkspaceView;
  updateWorkspaceViewForKey: (
    key: string,
    projectId: string,
    updater: (prev: WorkspaceView) => WorkspaceView,
  ) => void;
  setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>;
  reportError: (title: string, error: unknown) => void;
}

export function useSshRootResolution({
  active,
  activeIsSsh,
  activeSshTarget,
  activeProjectId,
  activeWorkspaceKey,
  activeWorkspaceView,
  updateWorkspaceViewForKey,
  setSessions,
  reportError,
}: UseSshRootResolutionProps) {
  const sshRootResolveInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!IS_TAURI) return;
    if (!activeIsSsh || !active) return;
    if (active.exited || active.closing) return;
    if (!activeWorkspaceView.fileExplorerOpen && !activeWorkspaceView.codeEditorOpen) return;

    const currentRoot = (
      activeWorkspaceView.fileExplorerRootDir ??
      activeWorkspaceView.codeEditorRootDir ??
      ""
    ).trim();
    if (currentRoot) return;

    const persistedRoot = (active.sshRootDir ?? "").trim();
    if (persistedRoot) {
      updateWorkspaceViewForKey(activeWorkspaceKey, activeProjectId, (prev) => {
        const existing = (prev.fileExplorerRootDir ?? prev.codeEditorRootDir ?? "").trim();
        if (existing) return prev;
        return { ...prev, fileExplorerRootDir: persistedRoot, codeEditorRootDir: persistedRoot };
      });
      return;
    }

    const target = activeSshTarget;
    if (!target) return;
    if (sshRootResolveInFlightRef.current.has(activeWorkspaceKey)) return;

    let cancelled = false;
    sshRootResolveInFlightRef.current.add(activeWorkspaceKey);
    void (async () => {
      try {
        const root = await invoke<string>("ssh_default_root", { target });
        if (cancelled) return;
        updateWorkspaceViewForKey(activeWorkspaceKey, activeProjectId, (prev) => {
          const existing = (prev.fileExplorerRootDir ?? prev.codeEditorRootDir ?? "").trim();
          if (existing) return prev;
          return { ...prev, fileExplorerRootDir: root, codeEditorRootDir: root };
        });
        setSessions((prev) =>
          prev.map((s) =>
            s.id === active.id
              ? { ...s, sshTarget: s.sshTarget ?? target, sshRootDir: root }
              : s,
          ),
        );
      } catch (err) {
        if (!cancelled) reportError(`Failed to load remote files for ${target}`, err);
      } finally {
        sshRootResolveInFlightRef.current.delete(activeWorkspaceKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    active,
    activeIsSsh,
    activeProjectId,
    activeSshTarget,
    activeWorkspaceKey,
    activeWorkspaceView.codeEditorOpen,
    activeWorkspaceView.codeEditorRootDir,
    activeWorkspaceView.fileExplorerOpen,
    activeWorkspaceView.fileExplorerRootDir,
    updateWorkspaceViewForKey,
  ]);
}
