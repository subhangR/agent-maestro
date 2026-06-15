import React, { MutableRefObject, Suspense, useCallback, useMemo, useRef, useState } from "react";
import SessionTerminal, { TerminalRegistry } from "../../SessionTerminal";
import { PendingDataBuffer } from "../../app/types/app-state";
import { FileExplorerPanel } from "../FileExplorerPanel";
import { Icon } from "../Icon";
import { ErrorBoundary } from "../ErrorBoundary";
import { useSessionStore } from "../../stores/useSessionStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useUIStore } from "../../stores/useUIStore";
import { useSpacesStore } from "../../stores/useSpacesStore";
import {
  useWorkspaceStore,
  getActiveWorkspaceKey,
  getActiveWorkspaceView,
} from "../../stores/useWorkspaceStore";
import { isSshCommandLine, sshTargetFromCommandLine } from "../../app/utils/ssh";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../../platform";
import { TerminalStrip } from "../session-log/TerminalStrip";
import { ModeChip } from "../maestro/ModeChip";
import { isCoordinatorRole } from "../../utils/coordinatorRole";
import { isWhiteboardId, isFileId } from "../../app/types/space";
import type { WhiteboardSpace, FileSpace } from "../../app/types/space";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useMobilePanelStore } from "../../stores/useMobilePanelStore";
const LazyExcalidrawBoard = React.lazy(() => import("../ExcalidrawBoard").then(m => ({ default: m.ExcalidrawBoard })));

const LazyCodeEditorPanel = React.lazy(() => import("../CodeEditorPanel"));
const LazyMermaidDiagram = React.lazy(() => import("../maestro/MermaidDiagram").then(m => ({ default: m.MermaidDiagram })));
import { SessionStatsView } from "../maestro/SessionStatsView";

export interface AppWorkspaceProps {
  registry: MutableRefObject<TerminalRegistry>;
  pendingData: MutableRefObject<PendingDataBuffer>;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function textToBase64(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

export const AppWorkspace = React.memo(function AppWorkspace(props: AppWorkspaceProps) {
  const { registry, pendingData } = props;
  const workspaceRowRef = useRef<HTMLDivElement | null>(null);

  // --- Session store ---
  const sessions = useSessionStore((s) => s.sessions);
  const activeId = useSessionStore((s) => s.activeId);
  const onCwdChange = useSessionStore((s) => s.onCwdChange);
  const onCommandChange = useSessionStore((s) => s.onCommandChange);
  const onSessionResize = useSessionStore((s) => s.onSessionResize);
  const handleOpenTerminalAtPath = useSessionStore((s) => s.handleOpenTerminalAtPath);
  const sendPromptToActive = useSessionStore((s) => s.sendPromptToActive);
  const sendPromptToSession = useSessionStore((s) => s.sendPromptToSession);
  const active = sessions.find((s) => s.id === activeId) ?? null;
  const maestroSessions = useMaestroStore((s) => s.sessions);
  const teamViewOpen = useUIStore((s) => s.teamViewRootId) !== null;
  const reportError = useUIStore((s) => s.reportError);
  const inspectedSessionId = useUIStore((s) => s.inspectedSessionId);
  const inspectedMaestroSession = inspectedSessionId
    ? maestroSessions[inspectedSessionId] ?? null
    : null;

  const activeMaestroSession = active?.maestroSessionId ? maestroSessions[active.maestroSessionId] : null;
  const activeIsCoordinator = isCoordinatorRole(activeMaestroSession?.mode);

  // --- Spaces store (whiteboards & documents) ---
  const allSpaces = useSpacesStore((s) => s.spaces);
  const activeSpace = useMemo(
    () => activeId ? allSpaces.find((s) => s.id === activeId) : undefined,
    [allSpaces, activeId],
  );
  const createWhiteboard = useSpacesStore((s) => s.createWhiteboard);
  const closeWhiteboard = useSpacesStore((s) => s.closeWhiteboard);
  const closeFile = useSpacesStore((s) => s.closeFile);
  const setActiveId = useSessionStore((s) => s.setActiveId);

  // Determine if we're showing a non-session space
  const isActiveWhiteboard = activeId ? isWhiteboardId(activeId) : false;
  const isActiveFile = activeId ? isFileId(activeId) : false;
  // Inspecting a maestro session (stats view) sets inspectedSessionId but does NOT
  // touch activeId. If activeId still points at a non-session space, the space
  // panes would render and the terminalPane (which hosts the stats view) would be
  // display:none'd below — a blank/wrong center pane. So an inspected session
  // takes over the workspace: terminalPane stays visible and the space panes
  // yield. This is reversible — clicking any tab calls setActiveId, which clears
  // inspectedSessionId (see useSessionStore.setActiveId).
  const hasInspectedSession = Boolean(inspectedMaestroSession);
  const isActiveSession =
    hasInspectedSession || (!isActiveWhiteboard && !isActiveFile);

  const activeLogAgentTool = (() => {
    if (!active?.maestroSessionId) return active?.effectId ?? null;
    const maestroSession = maestroSessions[active.maestroSessionId];
    const snapshots = maestroSession?.teamMemberSnapshots?.length
      ? maestroSession.teamMemberSnapshots
      : maestroSession?.teamMemberSnapshot
        ? [maestroSession.teamMemberSnapshot]
        : [];
    const metadataAgentTool = (maestroSession?.metadata as { agentTool?: string } | undefined)?.agentTool ?? null;
    return snapshots[0]?.agentTool ?? metadataAgentTool ?? active.effectId ?? null;
  })();

  // --- Project store ---
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // --- Derived SSH ---
  const activeIsSsh = active
    ? isSshCommandLine(active.launchCommand ?? active.restoreCommand ?? null)
    : false;
  const activeSshTarget = (() => {
    if (!active) return null;
    if (!activeIsSsh) return null;
    const stored = active.sshTarget?.trim() ?? "";
    if (stored) return stored;
    return sshTargetFromCommandLine(active.launchCommand ?? active.restoreCommand ?? null);
  })();

  // --- Workspace store ---
  const activeWorkspaceKey = getActiveWorkspaceKey();
  const activeWorkspaceView = getActiveWorkspaceView();
  const workspaceResizeMode = useWorkspaceStore((s) => s.workspaceResizeMode);
  const updateWorkspaceViewForKey = useWorkspaceStore((s) => s.updateWorkspaceViewForKey);
  const closeCodeEditor = useWorkspaceStore((s) => s.closeCodeEditor);
  const handleRenameWorkspacePath = useWorkspaceStore((s) => s.handleRenameWorkspacePath);
  const handleDeleteWorkspacePath = useWorkspaceStore((s) => s.handleDeleteWorkspacePath);
  const handleSelectWorkspaceFile = useWorkspaceStore((s) => s.handleSelectWorkspaceFile);
  const beginWorkspaceResize = useWorkspaceStore((s) => s.beginWorkspaceResize);

  // --- Mobile single-view switcher (≤768px) ---
  const isMobile = useBreakpoint() === "mobile";
  const mainView = useMobilePanelStore((s) => s.mainView);
  const setMainView = useMobilePanelStore((s) => s.setMainView);

  // --- Drag-and-drop task to terminal ---
  const [terminalDragOver, setTerminalDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleTerminalDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/maestro-task')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleTerminalDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/maestro-task')) {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current++;
      setTerminalDragOver(true);
    }
  }, []);

  const handleTerminalDragLeave = useCallback((e: React.DragEvent) => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setTerminalDragOver(false);
    }
  }, []);

  const handleTerminalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setTerminalDragOver(false);

    const raw = e.dataTransfer.getData('application/maestro-task');
    if (!raw) return;

    try {
      const taskData = JSON.parse(raw);
      const content = taskData.initialPrompt || taskData.description || '';
      const text = `[Task: ${taskData.title}] ${content}`;
      sendPromptToActive({ id: crypto.randomUUID(), title: taskData.title, content: text, createdAt: Date.now() }, 'paste');
    } catch {
      // ignore malformed data
    }
  }, [sendPromptToActive]);

  // --- Session action bar: attachment ---
  const handleAttach = useCallback(async () => {
    if (!activeId || !IS_TAURI) return;
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: true, title: 'Attach files to session' });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;
      const refs = paths.map((p) => `@${p}`).join(' ');
      await sendPromptToActive(
        { id: crypto.randomUUID(), title: 'Attachment', content: refs, createdAt: Date.now() },
        'send',
      );
    } catch (err) {
      reportError('Failed to attach files', err);
    }
  }, [activeId, sendPromptToActive, reportError]);

  // --- Session action bar: draw (Excalidraw) ---
  const handleDraw = useCallback(() => {
    if (!activeProjectId || !activeId) return;
    const wbId = createWhiteboard(activeProjectId, 'Sketch → session', activeId);
    setActiveId(wbId);
  }, [activeProjectId, activeId, createWhiteboard, setActiveId]);

  const handleSendDrawingToSession = useCallback(
    async (originSessionId: string, png: Blob, sceneJson: string) => {
      if (!IS_TAURI) return;
      try {
        const ts = Date.now();
        const pngBase64 = await blobToBase64(png);
        const pngPath = await invoke<string>('save_session_asset', {
          filename: `sketch_${ts}.png`,
          contentBase64: pngBase64,
        });
        await invoke<string>('save_session_asset', {
          filename: `sketch_${ts}.excalidraw`,
          contentBase64: textToBase64(sceneJson),
        });
        setActiveId(originSessionId);
        await sendPromptToSession(
          originSessionId,
          { id: crypto.randomUUID(), title: 'Drawing', content: `@${pngPath}`, createdAt: ts },
          'send',
        );
      } catch (err) {
        reportError('Failed to send drawing to session', err);
      }
    },
    [setActiveId, sendPromptToSession, reportError],
  );

  // --- Mobile sub-view availability (matches the same rootDir guards used to
  //     render the editor / files panes below). ---
  const editorRootDirTrimmed = (
    activeWorkspaceView.codeEditorRootDir ??
    activeWorkspaceView.fileExplorerRootDir ??
    (!activeIsSsh ? activeProject?.basePath ?? active?.cwd ?? "" : "")
  ).trim();
  const filesRootDirTrimmed = (
    activeWorkspaceView.fileExplorerRootDir ??
    activeWorkspaceView.codeEditorRootDir ??
    (!activeIsSsh ? activeProject?.basePath ?? active?.cwd ?? "" : "")
  ).trim();
  const editorAvailable =
    isMobile && activeWorkspaceView.codeEditorOpen && editorRootDirTrimmed.length > 0;
  const filesAvailable =
    isMobile &&
    activeWorkspaceView.fileExplorerOpen &&
    (filesRootDirTrimmed.length > 0 || activeIsSsh);
  let effectiveMainView = mainView;
  if (mainView === "editor" && !editorAvailable) effectiveMainView = "primary";
  if (mainView === "files" && !filesAvailable) effectiveMainView = "primary";

  // Keep store in sync when the selected sub-view becomes unavailable. The
  // effective fallback above already prevents a blank screen — this just keeps
  // the bottom nav highlight from being stuck on an absent tab.
  React.useEffect(() => {
    if (!isMobile) return;
    if (mainView === "editor" && !editorAvailable) setMainView("primary");
    else if (mainView === "files" && !filesAvailable) setMainView("primary");
  }, [isMobile, mainView, editorAvailable, filesAvailable, setMainView]);

  const mobileClass = isMobile
    ? ` workspaceRow--mobile workspaceRow--mv-${effectiveMainView}`
    : "";

  return (
    <div
      ref={workspaceRowRef}
      className={`workspaceRow ${workspaceResizeMode ? "workspaceResizing" : ""}${mobileClass}`}
      style={
        {
          "--workspaceEditorWidthPx": `${activeWorkspaceView.editorWidth}px`,
          "--workspaceFileTreeWidthPx": `${activeWorkspaceView.treeWidth}px`,
        } as React.CSSProperties
      }
    >
      {/* Inline whiteboard space */}
      {!hasInspectedSession && isActiveWhiteboard && activeSpace?.type === "whiteboard" && (
        <ErrorBoundary name="Excalidraw">
          <Suspense fallback={<div style={{ padding: 20, opacity: 0.5 }}>Loading whiteboard...</div>}>
            <LazyExcalidrawBoard
              key={activeSpace.id}
              inline
              storageKey={(activeSpace as WhiteboardSpace).storageKey}
              name={activeSpace.name}
              originSessionId={(activeSpace as WhiteboardSpace).originSessionId}
              onSendToSession={handleSendDrawingToSession}
              onClose={() => closeWhiteboard(activeSpace.id)}
              docId={(activeSpace as WhiteboardSpace).docId}
              docSessionId={(activeSpace as WhiteboardSpace).docSessionId}
            />
          </Suspense>
        </ErrorBoundary>
      )}


      {/* Inline file space — full-width code editor */}
      {!hasInspectedSession && isActiveFile && activeSpace?.type === "file" && (
        <ErrorBoundary name="FileEditor">
          <React.Suspense
            fallback={
              <section className="codeEditorPanel codeEditorPanel--fileSpace" aria-label="Editor">
                <div className="empty">Loading editor...</div>
              </section>
            }
          >
            <LazyCodeEditorPanel
              key={`file-space:${activeSpace.id}`}
              className="codeEditorPanel--fileSpace"
              provider={(activeSpace as FileSpace).provider}
              sshTarget={(activeSpace as FileSpace).sshTarget}
              rootDir={(activeSpace as FileSpace).rootDir}
              openFileRequest={{ path: (activeSpace as FileSpace).filePath, nonce: activeSpace.createdAt }}
              persistedState={null}
              fsEvent={null}
              onPersistState={() => {}}
              onConsumeOpenFileRequest={() => {}}
              onActiveFilePathChange={() => {}}
              onCloseEditor={() => {
                closeFile(activeSpace.id);
                // Switch to first session or null
                const firstSession = sessions[0];
                setActiveId(firstSession?.id ?? null);
              }}
            />
          </React.Suspense>
        </ErrorBoundary>
      )}

      <div
        className={`terminalPane ${terminalDragOver ? "terminalPane--dragOver" : ""} ${teamViewOpen ? "terminalPane--teamView" : ""}`}
        aria-label="Terminal"
        style={!isActiveSession ? { display: "none" } : undefined}
        onDragOver={handleTerminalDragOver}
        onDragEnter={handleTerminalDragEnter}
        onDragLeave={handleTerminalDragLeave}
        onDrop={handleTerminalDrop}
      >
        {/* Mode chip — shows current session role (coordinator / worker) */}
        {activeMaestroSession && (
          <ModeChip mode={activeMaestroSession.mode} />
        )}
        {/*
          Center-pane decision:
          1. If the sidebar has explicitly selected an inactive maestro session
             for inspection → render the SessionStatsView (overrides terminal).
             This covers Done sessions with exited PTYs and Archived sessions
             whose local terminal row is gone entirely.
          2. Else, if there are no local terminals → show the empty hero.
          3. Else, render the terminal map. For any container whose underlying
             session has an exited PTY but a known maestro session, swap in the
             stats view in-place (this is the original locked seam — covers
             sessions that exit in real time without a sidebar re-click).
        */}
        {/* Inspected stats view — a sibling of the always-mounted terminal map,
            sharing the same absolute box (.terminalContainer is position:absolute
            inset:0). Keeping the map mounted whether or not stats is showing means
            toggling stats ↔ terminal never unmounts and re-creates every live PTY.
            That remount was the long freeze on every stats → terminal switch. */}
        {inspectedMaestroSession && (
          <div
            className={`terminalContainer ${activeIsCoordinator ? "coordinator-glow" : ""}`}
            data-terminal-id={`maestro:${inspectedMaestroSession.id}`}
          >
            <SessionStatsView session={inspectedMaestroSession} />
          </div>
        )}
        {/* Hero shows when no terminal is actually visible: no sessions, or
            activeId is stale/null. Suppressed while inspecting a stats view. */}
        {!inspectedMaestroSession && !sessions.some((s) => s.id === activeId) && (
              <div className="terminalEmptyState">
                <div className="terminalEmptyAscii" aria-hidden="true">
{`  ╔══════════════════════════════╗
  ║                              ║
  ║   ▓▓▓  ▓▓▓▓  ▓▓▓▓  ▓▓▓▓    ║
  ║   ▓  ▓ ▓  ▓  ▓     ▓       ║
  ║   ▓▓▓  ▓▓▓▓  ▓▓▓▓  ▓▓▓▓    ║
  ║   ▓  ▓ ▓  ▓     ▓  ▓       ║
  ║   ▓▓▓  ▓  ▓  ▓▓▓▓  ▓▓▓▓    ║
  ║                              ║
  ╚══════════════════════════════╝`}
                </div>
                <div className="terminalEmptyPrompt">
                  <span className="terminalEmptyCaretLine">
                    <span className="terminalEmptyCaret">{">"}</span>{" "}
                    <span className="terminalEmptyTyping">ready for instructions_</span>
                  </span>
                </div>
                <div className="terminalEmptyHint">
                  Launch a session from the sidebar to begin
                </div>
              </div>
            )}
            {sessions.map((s) => {
              // LOCKED predicate: show stats when the PTY has exited for an
              // active maestro-backed session. `s.exited` IS the linkMap liveness
              // signal (see SessionsSection.tsx:937-945). `closing` is dropped to
              // avoid flashing stats during the close animation.
              const isInactive =
                Boolean(s.exited) && Boolean(s.maestroSessionId) && s.id === activeId;
              const inactiveMaestroSession = isInactive && s.maestroSessionId
                ? maestroSessions[s.maestroSessionId] ?? null
                : null;
              // Hidden (not unmounted) while a stats overlay is showing, so the
              // map stays mounted underneath without painting over the stats view.
              const visible = s.id === activeId && !inspectedMaestroSession;
              return (
                <div
                  key={s.id}
                  data-terminal-id={s.id}
                  className={`terminalContainer ${visible ? "" : "terminalHidden"} ${visible && activeIsCoordinator ? "coordinator-glow" : ""}`}
                >
                  {inactiveMaestroSession ? (
                    <SessionStatsView session={inactiveMaestroSession} />
                  ) : (
                    <SessionTerminal
                      id={s.id}
                      active={s.id === activeId}
                      readOnly={Boolean(s.exited || s.closing)}
                      persistent={s.persistent}
                      onCwdChange={onCwdChange}
                      onCommandChange={onCommandChange}
                      onResize={onSessionResize}
                      registry={registry}
                      pendingData={pendingData}
                    />
                  )}
                </div>
              );
            })}

        {/* Fused terminal strip — log toggle + stats + model + actions, pinned at the foot */}
        {active?.maestroSessionId && active?.cwd && (
          <TerminalStrip
            key={active.id}
            cwd={active.cwd}
            maestroSessionId={active.maestroSessionId}
            agentTool={activeLogAgentTool}
            onAttach={handleAttach}
            onDraw={handleDraw}
          />
        )}
      </div>

      {activeWorkspaceView.codeEditorOpen &&
        (
          activeWorkspaceView.codeEditorRootDir ??
          activeWorkspaceView.fileExplorerRootDir ??
          (!activeIsSsh ? activeProject?.basePath ?? active?.cwd ?? "" : "")
        ).trim() ? (
        <>
          <div
            className="workspaceResize"
            onMouseDown={beginWorkspaceResize("editor")}
            aria-hidden="true"
          />
          <ErrorBoundary name="CodeEditor">
          <React.Suspense
            fallback={
              <section className="codeEditorPanel" aria-label="Editor">
                <div className="empty">Loading editor…</div>
              </section>
            }
          >
            <LazyCodeEditorPanel
              key={`code-editor:${activeWorkspaceKey}`}
              provider={activeIsSsh ? "ssh" : "local"}
              sshTarget={activeIsSsh ? activeSshTarget : null}
              rootDir={
                (
                  activeWorkspaceView.codeEditorRootDir ??
                  activeWorkspaceView.fileExplorerRootDir ??
                  (!activeIsSsh ? activeProject?.basePath ?? active?.cwd ?? "" : "")
                ).trim()
              }
              openFileRequest={activeWorkspaceView.openFileRequest}
              persistedState={activeWorkspaceView.codeEditorPersistedState}
              fsEvent={activeWorkspaceView.codeEditorFsEvent}
              onPersistState={(state) =>
                updateWorkspaceViewForKey(activeWorkspaceKey, activeProjectId, (prev) => ({
                  ...prev,
                  codeEditorPersistedState: state,
                }))
              }
              onConsumeOpenFileRequest={() =>
                updateWorkspaceViewForKey(activeWorkspaceKey, activeProjectId, (prev) => ({
                  ...prev,
                  openFileRequest: null,
                }))
              }
              onActiveFilePathChange={(path) =>
                updateWorkspaceViewForKey(activeWorkspaceKey, activeProjectId, (prev) => {
                  if (prev.codeEditorActiveFilePath === path) return prev;
                  return { ...prev, codeEditorActiveFilePath: path };
                })
              }
              onCloseEditor={closeCodeEditor}
            />
          </React.Suspense>
          </ErrorBoundary>
        </>
      ) : null}

      {activeWorkspaceView.fileExplorerOpen &&
        (
          activeWorkspaceView.fileExplorerRootDir ??
          activeWorkspaceView.codeEditorRootDir ??
          (!activeIsSsh ? activeProject?.basePath ?? active?.cwd ?? "" : "")
        ).trim() ? (
        <>
          <div
            className="workspaceResize"
            onMouseDown={beginWorkspaceResize("tree")}
            aria-hidden="true"
          />
          <FileExplorerPanel
            key={`file-tree:${activeWorkspaceKey}`}
            isOpen
            provider={activeIsSsh ? "ssh" : "local"}
            sshTarget={activeIsSsh ? activeSshTarget : null}
            rootDir={
              (
                activeWorkspaceView.fileExplorerRootDir ??
                activeWorkspaceView.codeEditorRootDir ??
                (!activeIsSsh ? activeProject?.basePath ?? active?.cwd ?? "" : "")
              ).trim()
            }
            persistedState={activeWorkspaceView.fileExplorerPersistedState}
            activeFilePath={activeWorkspaceView.codeEditorActiveFilePath}
            onSelectFile={handleSelectWorkspaceFile}
            onOpenTerminalAtPath={handleOpenTerminalAtPath}
            onPersistState={(state) =>
              updateWorkspaceViewForKey(activeWorkspaceKey, activeProjectId, (prev) => ({
                ...prev,
                fileExplorerPersistedState: state,
              }))
            }
            onPathRenamed={handleRenameWorkspacePath}
            onPathDeleted={handleDeleteWorkspacePath}
            onClose={() =>
              updateWorkspaceViewForKey(activeWorkspaceKey, activeProjectId, (prev) => ({
                ...prev,
                fileExplorerOpen: false,
              }))
            }
          />
        </>
      ) : activeWorkspaceView.fileExplorerOpen && activeIsSsh ? (
        <>
          <div
            className="workspaceResize"
            onMouseDown={beginWorkspaceResize("tree")}
            aria-hidden="true"
          />
          <aside className="fileExplorerPanel" aria-label="Files">
            <div className="fileExplorerHeader">
              <div className="fileExplorerTitle">
                <span>Files</span>
                <span className="fileExplorerPath">remote</span>
              </div>
              <div className="fileExplorerActions">
                <button
                  type="button"
                  className="btnSmall btnIcon"
                  onClick={() =>
                    updateWorkspaceViewForKey(activeWorkspaceKey, activeProjectId, (prev) => ({
                      ...prev,
                      fileExplorerOpen: false,
                    }))
                  }
                  title="Close"
                >
                  <Icon name="close" />
                </button>
              </div>
            </div>
            <div className="fileExplorerList" role="tree">
              <div className="fileExplorerRow fileExplorerMeta">
                {activeSshTarget ? "Loading remote files…" : "Missing SSH target."}
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
});
