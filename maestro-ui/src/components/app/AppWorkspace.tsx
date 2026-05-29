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
import { SessionLogStrip } from "../session-log/SessionLogStrip";
import { SpellButton } from "../maestro/SpellButton";
import { isWhiteboardId, isDocumentId, isFileId, isCollabId, collabActiveIdToFirestoreId } from "../../app/types/space";
import type { WhiteboardSpace, DocumentSpace, FileSpace } from "../../app/types/space";
const LazyExcalidrawBoard = React.lazy(() => import("../ExcalidrawBoard").then(m => ({ default: m.ExcalidrawBoard })));
const LazyDocViewer = React.lazy(() => import("../maestro/DocViewer").then(m => ({ default: m.DocViewer })));
const LazySpaceWindow = React.lazy(() => import("../space-window/SpaceWindow").then(m => ({ default: m.SpaceWindow })));

const LazyCodeEditorPanel = React.lazy(() => import("../CodeEditorPanel"));
const LazyMermaidDiagram = React.lazy(() => import("../maestro/MermaidDiagram").then(m => ({ default: m.MermaidDiagram })));

export interface AppWorkspaceProps {
  registry: MutableRefObject<TerminalRegistry>;
  pendingData: MutableRefObject<PendingDataBuffer>;
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
  const active = sessions.find((s) => s.id === activeId) ?? null;
  const maestroSessions = useMaestroStore((s) => s.sessions);
  const teamViewOpen = useUIStore((s) => s.teamViewGroupId) !== null;

  // --- Spaces store (whiteboards & documents) ---
  const allSpaces = useSpacesStore((s) => s.spaces);
  const activeSpace = useMemo(
    () => activeId ? allSpaces.find((s) => s.id === activeId) : undefined,
    [allSpaces, activeId],
  );
  const closeWhiteboard = useSpacesStore((s) => s.closeWhiteboard);
  const closeDocument = useSpacesStore((s) => s.closeDocument);
  const closeFile = useSpacesStore((s) => s.closeFile);
  const setActiveId = useSessionStore((s) => s.setActiveId);

  // Determine if we're showing a non-session space
  const isActiveWhiteboard = activeId ? isWhiteboardId(activeId) : false;
  const isActiveDocument = activeId ? isDocumentId(activeId) : false;
  const isActiveFile = activeId ? isFileId(activeId) : false;
  const isActiveCollab = activeId ? isCollabId(activeId) : false;
  const activeCollabSpaceId = isActiveCollab && activeId ? collabActiveIdToFirestoreId(activeId) : null;
  const isActiveSession = !isActiveWhiteboard && !isActiveDocument && !isActiveFile && !isActiveCollab;

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

  return (
    <div
      ref={workspaceRowRef}
      className={`workspaceRow ${workspaceResizeMode ? "workspaceResizing" : ""}`}
      style={
        {
          "--workspaceEditorWidthPx": `${activeWorkspaceView.editorWidth}px`,
          "--workspaceFileTreeWidthPx": `${activeWorkspaceView.treeWidth}px`,
        } as React.CSSProperties
      }
    >
      {/* Inline whiteboard space */}
      {isActiveWhiteboard && activeSpace?.type === "whiteboard" && (
        <ErrorBoundary name="Excalidraw">
          <Suspense fallback={<div style={{ padding: 20, opacity: 0.5 }}>Loading whiteboard...</div>}>
            <LazyExcalidrawBoard
              key={activeSpace.id}
              inline
              storageKey={(activeSpace as WhiteboardSpace).storageKey}
              name={activeSpace.name}
              onClose={() => closeWhiteboard(activeSpace.id)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Inline document space */}
      {isActiveDocument && activeSpace?.type === "document" && (
        <ErrorBoundary name="DocViewer">
          <Suspense fallback={<div style={{ padding: 20, opacity: 0.5 }}>Loading document...</div>}>
            <LazyDocViewer
              key={activeSpace.id}
              inline
              doc={(activeSpace as DocumentSpace).doc}
              onClose={() => closeDocument(activeSpace.id)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Inline collab space — Firebase-backed collaboration room */}
      {isActiveCollab && activeCollabSpaceId && (
        <ErrorBoundary name="CollabSpace">
          <Suspense fallback={<div style={{ padding: 20, opacity: 0.5 }}>Loading space…</div>}>
            <LazySpaceWindow key={activeCollabSpaceId} spaceId={activeCollabSpaceId} inline />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Inline file space — full-width code editor */}
      {isActiveFile && activeSpace?.type === "file" && (
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
        {/* Live session log strip for Maestro sessions - inside terminalPane for overlay */}
        {active?.maestroSessionId && active?.cwd && (
          <SessionLogStrip
            key={active.id}
            cwd={active.cwd}
            maestroSessionId={active.maestroSessionId}
            agentTool={activeLogAgentTool}
          />
        )}
        {/* Spell button overlay */}
        {active?.maestroSessionId && (
          <SpellButton maestroSessionId={active.maestroSessionId} />
        )}
        {sessions.length === 0 && (
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
        {sessions.map((s) => (
          <div
            key={s.id}
            data-terminal-id={s.id}
            className={`terminalContainer ${s.id === activeId ? "" : "terminalHidden"}`}
          >
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
          </div>
        ))}
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
