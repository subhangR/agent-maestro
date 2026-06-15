import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../platform";
import { TerminalSession, PersistedTerminalSession } from "../app/types/session";
import { MaestroProject } from "../app/types/maestro";
import { EnvironmentConfig } from "../app/types/app";
import {
  PersistedStateV1,
  SecureStorageMode,
  Prompt,
  AssetTemplate,
  AssetSettings,
} from "../app/types/app-state";
import { WorkspaceView } from "../app/types/workspace";
import { buildWorkspaceViewStorageV1 } from "../utils/workSpaceStorage";
import { formatError } from "../utils/formatters";
import * as DEFAULTS from "../app/constants/defaults";

interface UseStatePersistenceProps {
  hydrated: boolean;
  persistenceDisabledReason: string | null;
  setPersistenceDisabledReason: (reason: string | null) => void;
  secureStorageMode: SecureStorageMode | null;
  projects: MaestroProject[];
  activeProjectId: string;
  activeSessionByProject: Record<string, string>;
  sessions: TerminalSession[];
  prompts: Prompt[];
  environments: EnvironmentConfig[];
  assets: AssetTemplate[];
  assetSettings: AssetSettings;
  agentShortcutIds: string[];
  reportError: (title: string, error: unknown) => void;
  // Workspace view persistence
  workspaceViewByKey: Record<string, WorkspaceView>;
  workspaceViewSaveTimerRef: React.MutableRefObject<number | null>;
  pendingWorkspaceViewSaveRef: React.MutableRefObject<any>;
  // Workspace width refs
  workspaceEditorWidthRef: React.MutableRefObject<number>;
  workspaceFileTreeWidthRef: React.MutableRefObject<number>;
  activeWorkspaceView: WorkspaceView;
  workspaceEditorWidthStorageKey: (projectId: string) => string;
  workspaceFileTreeWidthStorageKey: (projectId: string) => string;
}

export function useStatePersistence({
  hydrated,
  persistenceDisabledReason,
  setPersistenceDisabledReason,
  secureStorageMode,
  projects,
  activeProjectId,
  activeSessionByProject,
  sessions,
  prompts,
  environments,
  assets,
  assetSettings,
  agentShortcutIds,
  reportError,
  workspaceViewByKey,
  workspaceViewSaveTimerRef,
  pendingWorkspaceViewSaveRef,
  workspaceEditorWidthRef,
  workspaceFileTreeWidthRef,
  activeWorkspaceView,
  workspaceEditorWidthStorageKey,
  workspaceFileTreeWidthStorageKey,
}: UseStatePersistenceProps) {
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<PersistedStateV1 | null>(null);

  // Workspace view save effect
  useEffect(() => {
    if (!hydrated) return;
    if (workspaceViewSaveTimerRef.current !== null) {
      window.clearTimeout(workspaceViewSaveTimerRef.current);
    }

    const validProjectIds = new Set(projects.map((p) => p.id));
    pendingWorkspaceViewSaveRef.current = buildWorkspaceViewStorageV1(workspaceViewByKey, validProjectIds);

    workspaceViewSaveTimerRef.current = window.setTimeout(() => {
      workspaceViewSaveTimerRef.current = null;
      const state = pendingWorkspaceViewSaveRef.current;
      if (!state) return;
      try {
        localStorage.setItem(DEFAULTS.STORAGE_WORKSPACE_VIEW_BY_KEY, JSON.stringify(state));
      } catch {
        // Best-effort.
      }
    }, 500);
  }, [hydrated, projects, workspaceViewByKey]);

  // Workspace width ref sync
  useEffect(() => {
    workspaceEditorWidthRef.current = activeWorkspaceView.editorWidth;
  }, [activeWorkspaceView.editorWidth]);
  useEffect(() => {
    workspaceFileTreeWidthRef.current = activeWorkspaceView.treeWidth;
  }, [activeWorkspaceView.treeWidth]);

  // Workspace editor width localStorage persistence
  useEffect(() => {
    try {
      localStorage.setItem(
        workspaceEditorWidthStorageKey(activeProjectId),
        String(Math.max(DEFAULTS.MIN_WORKSPACE_EDITOR_WIDTH, Math.floor(activeWorkspaceView.editorWidth))),
      );
    } catch {
      // Best-effort.
    }
  }, [activeProjectId, activeWorkspaceView.editorWidth, workspaceEditorWidthStorageKey]);

  // Workspace file tree width localStorage persistence
  useEffect(() => {
    try {
      localStorage.setItem(
        workspaceFileTreeWidthStorageKey(activeProjectId),
        String(Math.max(DEFAULTS.MIN_WORKSPACE_FILE_TREE_WIDTH, Math.floor(activeWorkspaceView.treeWidth))),
      );
    } catch {
      // Best-effort.
    }
  }, [activeProjectId, activeWorkspaceView.treeWidth, workspaceFileTreeWidthStorageKey]);

  // Main state persistence to disk
  useEffect(() => {
    if (!hydrated || persistenceDisabledReason) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    const persistedSessions: PersistedTerminalSession[] = sessions
      .filter((s) => !s.closing)
      .map((s) => ({
        persistId: s.persistId,
        projectId: s.projectId,
        name: s.name,
        launchCommand: s.launchCommand,
        restoreCommand: s.restoreCommand ?? null,
        sshTarget: s.sshTarget ?? null,
        sshRootDir: s.sshRootDir ?? null,
        lastRecordingId: s.lastRecordingId ?? null,
        cwd: s.cwd,
        persistent: s.persistent,
        createdAt: s.createdAt,
      }))
      .sort((a, b) => a.createdAt - b.createdAt);

    pendingSaveRef.current = {
      schemaVersion: 1,
      secureStorageMode: secureStorageMode ?? undefined,
      projects,
      activeProjectId,
      sessions: persistedSessions,
      activeSessionByProject,
      prompts,
      environments,
      assets,
      assetSettings,
      agentShortcutIds,
    };

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const state = pendingSaveRef.current;
      if (!state) return;
      if (!IS_TAURI) {
        try {
          localStorage.setItem('maestro-persisted-state-v1', JSON.stringify(state));
        } catch {
          // best-effort
        }
        return;
      }
      void invoke("save_persisted_state", { state }).catch((err) => {
        const msg = formatError(err);
        const lower = msg.toLowerCase();
        if (
          secureStorageMode === "keychain" &&
          (lower.includes("keychain") || lower.includes("keyring"))
        ) {
          setPersistenceDisabledReason(`Secure storage is locked (changes won't be saved): ${msg}`);
          return;
        }
        reportError("Failed to save state", err);
      });
    }, 400);
  }, [projects, activeProjectId, activeSessionByProject, sessions, prompts, environments, assets, assetSettings, agentShortcutIds, secureStorageMode, hydrated, persistenceDisabledReason]);

  return { saveTimerRef, pendingSaveRef };
}
