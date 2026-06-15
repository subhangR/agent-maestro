import React, { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "./platform";
import { useAuthStore } from "./stores/useAuthStore";
import { LoginOverlay } from "./components/LoginOverlay";
import { TerminalRegistry } from "./SessionTerminal";
import { PendingDataBuffer } from "./app/types/app-state";
import * as DEFAULTS from "./app/constants/defaults";

// Stores
import { useUIStore } from "./stores/useUIStore";
import { useSessionStore, initSessionStoreRefs } from "./stores/useSessionStore";
import { useProjectStore, initActiveSessionSync } from "./stores/useProjectStore";
import { useProjectDialogStore } from "./stores/useProjectDialogStore";
import { usePromptStore } from "./stores/usePromptStore";
import { useAgentShortcutStore } from "./stores/useAgentShortcutStore";
import { usePersistentSessionStore } from "./stores/usePersistentSessionStore";
import { useSshStore } from "./stores/useSshStore";
import { useMaestroStore } from "./stores/useMaestroStore";

// Store initialisation
import { initApp } from "./stores/initApp";
import { initCentralPersistence, initWorkspaceViewPersistence } from "./stores/persistence";
import { initTheme } from "./stores/useThemeStore";
import { initRedesignTheme } from "./components/maestro/redesign/useRedesignTheme";
import { initZoom } from "./stores/useZoomStore";

// Hooks
import { useBreakpoint } from "./hooks/useBreakpoint";
import { useMobilePanelStore } from "./stores/useMobilePanelStore";
import { MobilePanelNav } from "./components/app/MobilePanelNav";
import { useQuickLaunch } from "./hooks/useQuickLaunch";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useAppLayoutResizing } from "./hooks/useAppLayoutResizing";
import { useWorkspaceResizeEffect } from "./hooks/useWorkspaceResizeEffect";
import { useProjectSoundSync } from "./hooks/useProjectSoundSync";
import { useTeamMemberSoundSync } from "./hooks/useTeamMemberSoundSync";
import { useSoundEffects } from "./hooks/useSoundEffects";

// Components
const LazyCommandPalette = React.lazy(() =>
  import("./CommandPalette").then(m => ({ default: m.CommandPalette }))
);
import { ProjectTabBar } from "./components/ProjectTabBar";
import { AppLeftPanel } from "./components/AppLeftPanel";
import { SpacesPanel } from "./components/SpacesPanel";
import { AppSlidePanel } from "./components/AppSlidePanel";
import { AppModals } from "./components/app/AppModals";
import { AppWorkspace } from "./components/app/AppWorkspace";
import { ConfirmActionModal } from "./components/modals/ConfirmActionModal";
import { StartupSettingsOverlay } from "./components/StartupSettingsOverlay";
const LazyBoard = React.lazy(() =>
  import("./components/maestro/MultiProjectBoard").then(m => ({ default: m.Board }))
);
const LazyTeamView = React.lazy(() =>
  import("./components/maestro/TeamView").then(m => ({ default: m.TeamView }))
);
import { resolveTeamView, buildChildStatsFn } from "./utils/resolveTeamView";
import { useSpacesStore } from "./stores/useSpacesStore";
import { UpdateBanner } from "./components/UpdateBanner";
import { PromptSendAnimationLayer } from "./components/PromptSendAnimation";
import { createMaestroSession } from "./services/maestroService";
import { TaskDetailOverlay } from "./components/maestro/TaskDetailOverlay";
import { SessionDetailOverlay } from "./components/maestro/SessionDetailOverlay";
import { DocViewer } from "./components/maestro/DocViewer";
import { STORAGE_SETUP_COMPLETE_KEY } from "./app/constants/defaults";

// ---------------------------------------------------------------------------
// App  (thin layout shell -- all domain state lives in Zustand stores)
// ---------------------------------------------------------------------------

export default function App() {
  type RunningSessionsByProject = {
    projectId: string;
    projectName: string;
    sessions: Array<{ id: string; name: string }>;
  };

  // DOM-bound refs (these cannot live in Zustand)
  const registry = useRef<TerminalRegistry>(new Map());
  const pendingData = useRef<PendingDataBuffer>(new Map());
  const sessionsRef = useRef<ReturnType<typeof useSessionStore.getState>["sessions"]>([]);
  const projectsRef = useRef<ReturnType<typeof useProjectStore.getState>["projects"]>([]);
  const onCloseRef = useRef<ReturnType<typeof useSessionStore.getState>["onClose"]>(async () => {});
  const bypassAppCloseConfirmRef = useRef(false);
  const [confirmCloseAppOpen, setConfirmCloseAppOpen] = useState(false);
  const [confirmCloseAppBusy, setConfirmCloseAppBusy] = useState(false);
  const [runningSessionsByProject, setRunningSessionsByProject] = useState<RunningSessionsByProject[]>([]);
  const [showStartupSettings, setShowStartupSettings] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_SETUP_COMPLETE_KEY) !== 'true';
    } catch {
      return true;
    }
  });
  const [showMultiProjectBoard, setShowMultiProjectBoard] = useState(false);

  // Keyboard shortcuts for overlays:
  //   Cmd/Ctrl+Shift+B -> Multi-project board
  //   Cmd/Ctrl+Shift+X -> Whiteboard space (create or toggle)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;

      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        setShowMultiProjectBoard((prev) => !prev);
        return;
      }

      if (key === "x") {
        e.preventDefault();
        // Create or toggle whiteboard space
        const { activeProjectId } = useProjectStore.getState();
        const spacesStore = useSpacesStore.getState();
        const { activeId, setActiveId: setActive } = useSessionStore.getState();

        // If currently viewing a whiteboard, go back to the first session
        if (activeId?.startsWith("wb_")) {
          const sessionStore = useSessionStore.getState();
          const projectSessions = sessionStore.sessions.filter((s) => s.projectId === activeProjectId);
          if (projectSessions.length > 0) {
            setActive(projectSessions[0].id);
          }
          return;
        }

        // Check for existing whiteboards in this project
        const projectWbs = spacesStore.spaces.filter(
          (s) => s.type === "whiteboard" && s.projectId === activeProjectId,
        );
        if (projectWbs.length > 0) {
          // Focus the first existing whiteboard
          setActive(projectWbs[0].id);
        } else {
          // Create a new whiteboard
          const id = spacesStore.createWhiteboard(activeProjectId);
          setActive(id);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Global drag-and-drop prevention: stop the browser/Tauri from showing the
  // OS copy cursor (arrow + plus) during in-app HTML5 drag operations.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  // ---------- auth status check (web mode only) ----------
  const checkAuthStatus = useAuthStore(s => s.checkStatus);
  const showLogin = useAuthStore(s => s.showLogin);
  const authChecking = useAuthStore(s => s.checking);
  useEffect(() => {
    if (!IS_TAURI) void checkAuthStatus();
  }, [checkAuthStatus]);

  // ---------- bootstrap stores & persistence ----------
  useEffect(() => {
    initTheme();
    // Apply the persisted light/dark axis (data-theme) AFTER initTheme. initTheme no
    // longer writes data-theme, so these don't collide; this restores a saved dark
    // choice on reload app-wide (even before the TopBar toggle mounts).
    initRedesignTheme();
    initZoom();
    initSessionStoreRefs(registry, pendingData, { current: null });
    const cleanupApp = initApp(registry, pendingData);
    const cleanupPersistence = initCentralPersistence();
    const cleanupWorkspace = initWorkspaceViewPersistence();
    const cleanupActiveSessionSync = initActiveSessionSync();
    return () => {
      cleanupApp();
      cleanupPersistence();
      cleanupWorkspace();
      cleanupActiveSessionSync();
    };
  }, []);

  // ---------- workspace panel resize ----------
  useWorkspaceResizeEffect();

  // ---------- keyboard shortcuts (reads from stores directly) ----------
  useKeyboardShortcuts();

  // ---------- sound effects (preload + enable) ----------
  useSoundEffects();
  // ---------- project sound sync ----------
  useProjectSoundSync();
  // ---------- team member instrument sync ----------
  useTeamMemberSoundSync();

  // ---------- responsive mode (kept for potential future use) ----------

  // ---------- read layout values from stores ----------
  // Only subscribe to values that affect conditional rendering in App.
  // Width values are read via getState() in the resize hook to avoid
  // re-rendering the entire App tree on every pixel change.
  const iconRailActiveSection = useUIStore((s) => s.iconRailActiveSection);
  const spacesRailActiveSection = useUIStore((s) => s.spacesRailActiveSection);
  const toggleSpacesPanel = useUIStore((s) => s.toggleSpacesPanel);
  const docOverlay = useUIStore((s) => s.docOverlay);
  const setDocOverlay = useUIStore((s) => s.setDocOverlay);
  // ---------- projects ----------
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setProjectOpen = useProjectDialogStore((s) => s.setProjectOpen);
  const selectProject = useProjectStore((s) => s.selectProject);
  const openNewProject = useProjectStore((s) => s.openNewProject);
  const checkAndDeleteProject = useProjectStore((s) => s.checkAndDeleteProject);
  const closeProject = useProjectStore((s) => s.closeProject);
  const fetchSavedProjects = useProjectStore((s) => s.fetchSavedProjects);
  const reopenProject = useProjectStore((s) => s.reopenProject);
  const moveProject = useProjectStore((s) => s.moveProject);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const handleDeleteProject = useCallback((projectId: string) => {
    void checkAndDeleteProject(projectId);
  }, [checkAndDeleteProject]);

  const handleCloseProject = useCallback((projectId: string) => {
    void closeProject(projectId);
  }, [closeProject]);

  const handleReopenProject = useCallback((projectId: string) => {
    void reopenProject(projectId);
  }, [reopenProject]);

  // ---------- sessions ----------
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const setActiveId = useSessionStore((s) => s.setActiveId);
  const setNewOpen = useSessionStore((s) => s.setNewOpen);
  const onClose = useSessionStore((s) => s.onClose);
  const quickStart = useSessionStore((s) => s.quickStart);
  const reorderSessions = useSessionStore((s) => s.reorderSessions);
  // sendPromptToActive removed (QuickPromptsSection moved out of layout)

  // ---------- auto-clear needsInput when user views a session ----------
  const checkAndClearNeedsInput = useMaestroStore((s) => s.checkAndClearNeedsInputForActiveSession);
  useEffect(() => {
    if (activeId) checkAndClearNeedsInput();
  }, [activeId, checkAndClearNeedsInput]);

  const projectSessions = useMemo(
    () => sessions.filter((s) => s.projectId === activeProjectId),
    [sessions, activeProjectId],
  );

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const sessionCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);
    return counts;
  }, [sessions]);

  const workingAgentCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      if (!s.effectId || s.exited || s.closing || !s.agentWorking) continue;
      counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);
    }
    return counts;
  }, [sessions]);

  const maestroSessions = useMaestroStore((s) => s.sessions);
  const needsInputByProject = useMemo(() => {
    const result = new Map<string, boolean>();
    for (const s of sessions) {
      if (!s.maestroSessionId) continue;
      const ms = maestroSessions[s.maestroSessionId];
      if (ms?.needsInput?.active) {
        result.set(s.projectId, true);
      }
    }
    return result;
  }, [sessions, maestroSessions]);

  // ---------- prompts (kept store import for keyboard shortcuts) ----------

  // ---------- agent shortcuts & quick-launch ----------
  const agentShortcutIds = useAgentShortcutStore((s) => s.agentShortcutIds);
  const setAgentShortcutsOpen = useAgentShortcutStore((s) => s.setAgentShortcutsOpen);
  const { agentShortcuts } = useQuickLaunch({ agentShortcutIds, sessions });

  // ---------- persistent sessions ----------
  const refreshPersistentSessions = usePersistentSessionStore((s) => s.refreshPersistentSessions);
  const setPersistentSessionsOpen = usePersistentSessionStore((s) => s.setPersistentSessionsOpen);
  const setManageTerminalsOpen = usePersistentSessionStore((s) => s.setManageTerminalsOpen);

  // ---------- open SSH manager (stable callback) ----------
  const openSshManager = useCallback(() => {
    setProjectOpen(false);
    setNewOpen(false);
    useSshStore.getState().setSshManagerOpen(true);
  }, [setProjectOpen, setNewOpen]);

  // ---------- team view ----------
  const teamViewRootId = useUIStore((s) => s.teamViewRootId);
  const setTeamViewRootId = useUIStore((s) => s.setTeamViewRootId);

  const teamViewData = useMemo(
    () => resolveTeamView(teamViewRootId, maestroSessions),
    [teamViewRootId, maestroSessions],
  );

  const teamViewChildStats = useMemo(
    () => buildChildStatsFn(maestroSessions),
    [maestroSessions],
  );

  // maestroSessionId -> live local terminal session id (single source of truth
  // for reparenting terminals into Team View slots).
  const teamViewLinkMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) {
      if (s.maestroSessionId) map.set(s.maestroSessionId, s.id);
    }
    return map;
  }, [sessions]);

  // ---------- stable callbacks for ProjectTabBar & SpacesPanel ----------
  const handleOpenMultiProjectBoard = useCallback(() => {
    setShowMultiProjectBoard(true);
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveId(id);
  }, [setActiveId]);

  const handleCloseSession = useCallback((id: string) => {
    void onClose(id);
  }, [onClose]);

  const handleQuickStart = useCallback((effect: import("./processEffects").ProcessEffect) => {
    void quickStart({
      id: effect.id,
      title: effect.label,
      command: effect.matchCommands[0] ?? effect.label,
    });
  }, [quickStart]);

  const handleOpenNewSession = useCallback(() => {
    setProjectOpen(false);
    setNewOpen(true);
  }, [setProjectOpen, setNewOpen]);

  const handleOpenPersistentSessions = useCallback(() => {
    setPersistentSessionsOpen(true);
    void refreshPersistentSessions();
  }, [setPersistentSessionsOpen, refreshPersistentSessions]);

  const handleOpenAgentShortcuts = useCallback(() => {
    setAgentShortcutsOpen(true);
  }, [setAgentShortcutsOpen]);

  const handleOpenManageTerminals = useCallback(() => {
    setManageTerminalsOpen(true);
  }, [setManageTerminalsOpen]);

  // ---------- multi-project board callbacks ----------
  const updateTask = useMaestroStore((s) => s.updateTask);
  const handleBoardSelectTask = useCallback((_taskId: string, projectId: string) => {
    selectProject(projectId);
    setShowMultiProjectBoard(false);
  }, [selectProject]);

  const handleBoardUpdateTaskStatus = useCallback((taskId: string, status: import("./app/types/maestro").TaskStatus) => {
    void updateTask(taskId, { status });
  }, [updateTask]);

  const handleBoardWorkOnTask = useCallback((task: import("./app/types/maestro").MaestroTask, project: import("./app/types/maestro").MaestroProject) => {
    void createMaestroSession({ task, project, mode: "worker", strategy: "simple" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: null | (() => void) = null;

    const groupRunningSessionsByProject = (): RunningSessionsByProject[] => {
      const runningSessions = sessionsRef.current.filter((s) => !s.exited && !s.closing);
      const projectNameById = new Map(
        projectsRef.current.map((p) => [p.id, p.name?.trim() || p.id]),
      );
      const grouped = new Map<string, RunningSessionsByProject>();

      for (const session of runningSessions) {
        const current = grouped.get(session.projectId);
        if (current) {
          current.sessions.push({ id: session.id, name: session.name });
          continue;
        }

        grouped.set(session.projectId, {
          projectId: session.projectId,
          projectName: projectNameById.get(session.projectId) ?? session.projectId,
          sessions: [{ id: session.id, name: session.name }],
        });
      }

      return Array.from(grouped.values());
    };

    const registerCloseHandler = async () => {
      if (!IS_TAURI) return;
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (cancelled) return;
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          if (bypassAppCloseConfirmRef.current) {
            bypassAppCloseConfirmRef.current = false;
            return;
          }
          // Always prevent the native close so the Rust handler doesn't
          // hide the window before we've had a chance to set the allow flag.
          event.preventDefault();

          const grouped = groupRunningSessionsByProject();
          if (grouped.length === 0) {
            // No running sessions — set flag then re-trigger close
            bypassAppCloseConfirmRef.current = true;
            await invoke("allow_window_close").catch(() => {});
            await win.close();
            return;
          }
          setRunningSessionsByProject(grouped);
          setConfirmCloseAppOpen(true);
        });
      } catch {
        // Running outside Tauri, or window API unavailable.
      }
    };

    void registerCloseHandler();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const closeAppWithRunningSessions = useCallback(async () => {
    if (confirmCloseAppBusy) return;
    setConfirmCloseAppBusy(true);
    try {
      const running = sessionsRef.current.filter((s) => !s.exited && !s.closing);

      // Close all sessions in parallel with a 3-second timeout per session
      await Promise.all(
        running.map((session) =>
          Promise.race([
            onCloseRef.current(session.id).catch(() => {}),
            new Promise<void>((resolve) => setTimeout(resolve, 3000)),
          ])
        )
      );

      bypassAppCloseConfirmRef.current = true;
      await invoke("allow_window_close").catch(() => {});
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      bypassAppCloseConfirmRef.current = false;
    } finally {
      setConfirmCloseAppBusy(false);
      setConfirmCloseAppOpen(false);
    }
  }, [confirmCloseAppBusy]);

  const runningSessionCount = useMemo(
    () => runningSessionsByProject.reduce((count, group) => count + group.sessions.length, 0),
    [runningSessionsByProject],
  );

  // ---------- layout resize handlers ----------
  const {
    handleMaestroSidebarResizePointerDown,
    handleRightPanelResizePointerDown,
  } = useAppLayoutResizing();

  // ---------- responsive breakpoint ----------
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "mobile";
  const activePanel = useMobilePanelStore((s) => s.activePanel);

  // ---------- render ----------
  const isEmpty = projects.length === 0;

  // Show login overlay in web mode when auth is enabled and user is not authenticated
  if (!IS_TAURI && (authChecking ? false : showLogin)) {
    return <LoginOverlay />;
  }

  return (
    <div className="app">
      {/* -------- Prompt Send Animation Overlay -------- */}
      <PromptSendAnimationLayer />

      {/* -------- Project Tab Bar -------- */}
      {!isEmpty && (
        <ProjectTabBar
          projects={projects}
          activeProjectId={activeProjectId}
          sessionCountByProject={sessionCountByProject}
          workingAgentCountByProject={workingAgentCountByProject}
          needsInputByProject={needsInputByProject}
          onSelectProject={selectProject}
          onNewProject={openNewProject}
          onDeleteProject={handleDeleteProject}
          onCloseProject={handleCloseProject}
          onFetchSavedProjects={fetchSavedProjects}
          onReopenProject={handleReopenProject}
          onMoveProject={moveProject}
          onOpenMultiProjectBoard={handleOpenMultiProjectBoard}
        />
      )}

      {/* -------- Update Banner -------- */}
      <UpdateBanner />

      {isEmpty ? (
        <>
          <div className="emptyState">
            <div className="emptyStateTitle">NO PROJECTS</div>
            <div className="emptyStateHint">Create a project to get started</div>
            <button
              type="button"
              className="emptyStateBtn"
              onClick={openNewProject}
            >
              + NEW PROJECT
            </button>
          </div>
          <AppModals />
        </>
      ) : (
        <>
          {/* -------- App Content -------- */}
          <div className={`appContent${isMobile ? ` appContent--${activePanel}` : ""}`}>
                {/* -------- Left Panel (Icon Rail + Maestro Sidebar) -------- */}
                <AppLeftPanel />

                {/* -------- Left panel resize handle -------- */}
                {!isMobile && iconRailActiveSection !== null && (
                  <div
                    className="sidebarRightResizeHandle"
                    role="separator"
                    aria-label="Resize Maestro Sidebar"
                    aria-orientation="vertical"
                    aria-valuemin={DEFAULTS.MIN_MAESTRO_SIDEBAR_WIDTH}
                    aria-valuemax={DEFAULTS.MAX_MAESTRO_SIDEBAR_WIDTH}
                    tabIndex={0}
                    onPointerDown={handleMaestroSidebarResizePointerDown}
                    title="Drag to resize"
                  />
                )}

                {/* -------- Main content -------- */}
                <main className="main">
                  <div className="terminalArea">
                    <AppWorkspace registry={registry} pendingData={pendingData} />
                    <TaskDetailOverlay />
                    <SessionDetailOverlay />
                    {docOverlay && (
                      <DocViewer doc={docOverlay} onClose={() => setDocOverlay(null)} />
                    )}
                    <AppModals />
                    <AppSlidePanel />
                  </div>
                </main>

                {/* -------- Right panel resize handle -------- */}
                {!isMobile && spacesRailActiveSection !== null && (
                  <div
                    className="sidebarLeftResizeHandle"
                    role="separator"
                    aria-label="Resize Spaces Panel"
                    aria-orientation="vertical"
                    aria-valuemin={DEFAULTS.MIN_RIGHT_PANEL_WIDTH}
                    aria-valuemax={DEFAULTS.MAX_RIGHT_PANEL_WIDTH}
                    tabIndex={0}
                    onPointerDown={handleRightPanelResizePointerDown}
                    title="Drag to resize"
                  />
                )}

                {/* -------- Spaces Panel (Sessions on right) -------- */}
                <SpacesPanel
                  agentShortcuts={agentShortcuts}
                  sessions={projectSessions}
                  activeSessionId={activeId}
                  activeProjectId={activeProjectId}
                  projectName={activeProject?.name ?? null}
                  projectBasePath={activeProject?.basePath ?? null}
                  onSelectSession={handleSelectSession}
                  onCloseSession={handleCloseSession}
                  onReorderSessions={reorderSessions}
                  onQuickStart={handleQuickStart}
                  onOpenNewSession={handleOpenNewSession}
                  onOpenPersistentSessions={handleOpenPersistentSessions}
                  onOpenSshManager={openSshManager}
                  onOpenAgentShortcuts={handleOpenAgentShortcuts}
                  onOpenManageTerminals={handleOpenManageTerminals}
                  activeSection={spacesRailActiveSection}
                  onToggle={toggleSpacesPanel}
                />
          </div>

          {/* -------- Mobile bottom tab bar -------- */}
          {isMobile && <MobilePanelNav />}
        </>
      )}

      {/* -------- Startup Settings Overlay -------- */}
      {showStartupSettings && (
        <StartupSettingsOverlay onComplete={() => setShowStartupSettings(false)} />
      )}

      {/* -------- Multi-Project Board -------- */}
      {showMultiProjectBoard && (
        <React.Suspense fallback={null}>
          <LazyBoard
            onClose={() => setShowMultiProjectBoard(false)}
            onSelectTask={handleBoardSelectTask}
            onUpdateTaskStatus={handleBoardUpdateTaskStatus}
            onWorkOnTask={handleBoardWorkOnTask}
            onCreateMaestroSession={createMaestroSession}
          />
        </React.Suspense>
      )}

      {/* -------- Team View -------- */}
      {teamViewData && (
        <React.Suspense fallback={null}>
          <LazyTeamView
            root={teamViewData.root}
            childrenSessions={teamViewData.children}
            trail={teamViewData.trail}
            registry={registry}
            linkMap={teamViewLinkMap}
            childStats={teamViewChildStats}
            onReRoot={(sessionId) => setTeamViewRootId(sessionId)}
            onClose={() => setTeamViewRootId(null)}
            onSelectSession={handleSelectSession}
          />
        </React.Suspense>
      )}

      {/* -------- Command Palette -------- */}
      <React.Suspense fallback={null}>
        <LazyCommandPalette />
      </React.Suspense>
      <ConfirmActionModal
        isOpen={confirmCloseAppOpen}
        title="Close App and All Running Sessions?"
        message={(
          <div>
            <div>
              {`There ${runningSessionCount === 1 ? "is" : "are"} `}
              <strong>{runningSessionCount}</strong>
              {` running ${runningSessionCount === 1 ? "session" : "sessions"}. Closing the app will stop all of them.`}
            </div>
            <div style={{ marginTop: 10 }}>
              {runningSessionsByProject.map((group) => (
                <div key={group.projectId} style={{ marginBottom: 8 }}>
                  <strong>{group.projectName}</strong>
                  <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                    {group.sessions.map((session) => (
                      <li key={session.id}>{session.name}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
        confirmLabel="Close App"
        cancelLabel="Cancel"
        confirmDanger
        busy={confirmCloseAppBusy}
        onClose={() => {
          if (confirmCloseAppBusy) return;
          setConfirmCloseAppOpen(false);
        }}
        onConfirm={() => {
          void closeAppWithRunningSessions();
        }}
      />
    </div>
  );
}
