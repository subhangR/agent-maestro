import React, { useState, useRef, useLayoutEffect } from "react";
import { Icon } from "./Icon";
import { MaestroProject } from "../app/types/maestro";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { DisplaySettings } from "./DisplaySettings";
import { SoundSettingsContent } from "./modals/SoundSettingsModal";
import { soundManager } from "../services/soundManager";

type SavedProject = {
  id: string;
  name: string;
  workingDir: string;
};

type ProjectTabBarProps = {
  projects: MaestroProject[];
  activeProjectId: string;
  sessionCountByProject: Map<string, number>;
  workingAgentCountByProject: Map<string, number>;
  needsInputByProject: Map<string, boolean>;
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onCloseProject: (projectId: string) => void;
  onFetchSavedProjects: () => Promise<SavedProject[]>;
  onReopenProject: (projectId: string) => void;
  onMoveProject: (projectId: string, targetProjectId: string, position: 'before' | 'after') => void;
  onOpenMultiProjectBoard?: () => void;
};

type SettingsDialogProps = {
  project: MaestroProject;
  sessionCount: number;
  onClose: () => void;
  onDelete: () => void;
  onCloseProject: () => void;
};

type SettingsTab = 'theme' | 'display' | 'sounds' | 'shortcuts';

type ShortcutRow = {
  action: string;
  mac: string;
  windowsLinux: string;
};

const SHORTCUT_ROWS: ShortcutRow[] = [
  { action: "Command palette", mac: "Cmd + K", windowsLinux: "Ctrl + K" },
  { action: "Create task", mac: "Cmd + T", windowsLinux: "Ctrl + Shift + T" },
  { action: "New terminal session", mac: "Cmd + N / Cmd + D", windowsLinux: "Ctrl + Shift + N" },
  { action: "Close active session", mac: "Cmd + W", windowsLinux: "Ctrl + Shift + W" },
  { action: "Next session", mac: "Cmd + E", windowsLinux: "Ctrl + Tab" },
  { action: "Previous session", mac: "Cmd + R", windowsLinux: "Ctrl + Shift + Tab" },
  { action: "Toggle prompts panel", mac: "Cmd + Shift + P", windowsLinux: "Ctrl + Shift + P" },
  { action: "Toggle recordings panel", mac: "Cmd + Shift + R", windowsLinux: "Ctrl + Shift + R" },
  { action: "Toggle assets panel", mac: "Cmd + Shift + A", windowsLinux: "Ctrl + Shift + A" },
  { action: "Send quick prompt (pinned)", mac: "Cmd + 1..5", windowsLinux: "Ctrl + 1..5" },
  { action: "Close open modal/panel", mac: "Esc", windowsLinux: "Esc" },
];

function AppSettingsDialog({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('theme');

  return (
    <div className="projectSettingsBackdrop" onClick={onClose}>
      <div className="appSettingsDialog" onClick={(e) => e.stopPropagation()}>
        <div className="projectSettingsHeader">
          <span className="projectSettingsTitle">[ SETTINGS ]</span>
          <button className="projectSettingsClose" onClick={onClose}>×</button>
        </div>

        <div className="appSettingsBody">
          <div className="appSettingsSidebar">
            <button
              type="button"
              className={`appSettingsTabBtn ${activeTab === 'theme' ? 'appSettingsTabBtnActive' : ''}`}
              onClick={() => setActiveTab('theme')}
            >
              THEME
            </button>
            <button
              type="button"
              className={`appSettingsTabBtn ${activeTab === 'display' ? 'appSettingsTabBtnActive' : ''}`}
              onClick={() => setActiveTab('display')}
            >
              DISPLAY
            </button>
            <button
              type="button"
              className={`appSettingsTabBtn ${activeTab === 'sounds' ? 'appSettingsTabBtnActive' : ''}`}
              onClick={() => setActiveTab('sounds')}
            >
              SOUNDS
            </button>
            <button
              type="button"
              className={`appSettingsTabBtn ${activeTab === 'shortcuts' ? 'appSettingsTabBtnActive' : ''}`}
              onClick={() => setActiveTab('shortcuts')}
            >
              SHORTCUTS
            </button>
          </div>

          <div className="appSettingsTabContent">
            {activeTab === 'theme' && (
              <div className="appSettingsContent">
                <ThemeSwitcher />
              </div>
            )}
            {activeTab === 'display' && (
              <div className="appSettingsContent">
                <DisplaySettings />
              </div>
            )}
            {activeTab === 'sounds' && (
              <SoundSettingsContent />
            )}
            {activeTab === 'shortcuts' && (
              <div className="appSettingsContent">
                <div className="appShortcutsHeader">
                  Available keyboard shortcuts
                </div>
                <div className="appShortcutsTable" role="table" aria-label="Keyboard shortcuts">
                  <div className="appShortcutsRow appShortcutsRowHeader" role="row">
                    <span role="columnheader">Action</span>
                    <span role="columnheader">macOS</span>
                    <span role="columnheader">Windows / Linux</span>
                  </div>
                  {SHORTCUT_ROWS.map((shortcut) => (
                    <div
                      key={shortcut.action}
                      className="appShortcutsRow"
                      role="row"
                    >
                      <span role="cell">{shortcut.action}</span>
                      <span role="cell">{shortcut.mac}</span>
                      <span role="cell">{shortcut.windowsLinux}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsDialog({ project, sessionCount, onClose, onDelete, onCloseProject }: SettingsDialogProps) {
  return (
    <div className="projectSettingsBackdrop" onClick={onClose}>
      <div className="projectSettingsDialog" onClick={(e) => e.stopPropagation()}>
        <div className="projectSettingsHeader">
          <span className="projectSettingsTitle">[ PROJECT SETTINGS ]</span>
          <button className="projectSettingsClose" onClick={onClose}>×</button>
        </div>

        <div className="projectSettingsContent">
          <div className="projectSettingsRow">
            <span className="projectSettingsLabel">NAME:</span>
            <span className="projectSettingsValue">{project.name}</span>
          </div>

          {project.basePath && (
            <div className="projectSettingsRow">
              <span className="projectSettingsLabel">PATH:</span>
              <span className="projectSettingsValue projectSettingsPath">{project.basePath}</span>
            </div>
          )}

          <div className="projectSettingsRow">
            <span className="projectSettingsLabel">SESSIONS:</span>
            <span className="projectSettingsValue">{sessionCount}</span>
          </div>

          <div className="projectSettingsRow">
            <span className="projectSettingsLabel">CREATED:</span>
            <span className="projectSettingsValue">
              {new Date(project.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="projectSettingsDivider" />

        <button
          className="projectSettingsCloseBtn"
          onClick={() => {
            onCloseProject();
            onClose();
          }}
        >
          <Icon name="close" size={14} />
          CLOSE PROJECT
        </button>

        <button
          className="projectSettingsDeleteBtn"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          <Icon name="trash" size={14} />
          DELETE PROJECT
        </button>
      </div>
    </div>
  );
}

export function ProjectTabBar({
  projects,
  activeProjectId,
  sessionCountByProject,
  workingAgentCountByProject,
  needsInputByProject,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onCloseProject,
  onFetchSavedProjects,
  onReopenProject,
  onMoveProject,
  onOpenMultiProjectBoard,
}: ProjectTabBarProps) {
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ projectId: string; position: 'before' | 'after' } | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [savedProjectsLoading, setSavedProjectsLoading] = useState(false);
  const [savedProjectsOpen, setSavedProjectsOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  const tabsRef = useRef<HTMLDivElement | null>(null);
  const previousItemRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const activeAnimationsRef = useRef<Map<string, Animation>>(new Map());

  const settingsProject = settingsProjectId
    ? projects.find((p) => p.id === settingsProjectId) ?? null
    : null;

  const handleDelete = () => {
    if (settingsProjectId) {
      onDeleteProject(settingsProjectId);
    }
  };

  const handleCloseProject = () => {
    if (settingsProjectId) {
      onCloseProject(settingsProjectId);
      setSettingsProjectId(null);
    }
  };

  const handleOpenSavedProjects = async () => {
    setAddMenuOpen(false);
    setSavedProjectsLoading(true);
    setSavedProjectsOpen(true);
    try {
      const saved = await onFetchSavedProjects();
      setSavedProjects(saved);
    } catch {
      setSavedProjects([]);
    } finally {
      setSavedProjectsLoading(false);
    }
  };

  // Close add menu on outside click
  React.useEffect(() => {
    if (!addMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addMenuOpen]);

  const handleDragEnd = () => {
    setDraggingProjectId(null);
    setDropTarget(null);
  };

  // FLIP animation for smooth reorder
  useLayoutEffect(() => {
    const list = tabsRef.current;
    if (!list) return;

    const items = Array.from(list.querySelectorAll<HTMLElement>('.projectTab'));
    const nextRects = new Map<string, DOMRect>();
    for (const item of items) {
      const id = item.dataset.projectId;
      if (!id) continue;
      nextRects.set(id, item.getBoundingClientRect());
    }

    const prevRects = previousItemRectsRef.current;
    if (prevRects.size > 0) {
      for (const item of items) {
        const id = item.dataset.projectId;
        if (!id) continue;
        const prev = prevRects.get(id);
        const next = nextRects.get(id);
        if (!prev || !next) continue;
        if (id === draggingProjectId) continue;

        const dx = prev.left - next.left;
        if (Math.abs(dx) < 0.5) continue;

        activeAnimationsRef.current.get(id)?.cancel();
        const animation = item.animate(
          [{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }],
          { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        );
        activeAnimationsRef.current.set(id, animation);
        void animation.finished
          .then(() => {
            if (activeAnimationsRef.current.get(id) === animation) {
              activeAnimationsRef.current.delete(id);
            }
          })
          .catch(() => {});
      }
    }

    previousItemRectsRef.current = nextRects;
  }, [projects, draggingProjectId]);

  const handleTabPointerDown = (e: React.PointerEvent, project: MaestroProject) => {
    if (projects.length <= 1) return;
    if (e.button !== 0) return;

    // Don't interfere with button clicks (settings button, etc.)
    const clickTarget = e.target as HTMLElement;
    if (clickTarget.closest('button')) return;

    const pointerId = e.pointerId;
    const target = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const startY = e.clientY;

    let dragging = false;
    let lastTargetId: string | null = null;
    let lastPosition: 'before' | 'after' | null = null;
    let latestPointer: { x: number; y: number } | null = null;
    let raf: number | null = null;

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;

    const getDropPosition = (clientX: number, rect: DOMRect, targetId: string): 'before' | 'after' => {
      const mid = rect.left + rect.width / 2;
      const delta = clientX - mid;
      const deadZonePx = 6;
      if (delta > deadZonePx) return 'after';
      if (delta < -deadZonePx) return 'before';
      if (lastTargetId === targetId && lastPosition) return lastPosition;
      return delta >= 0 ? 'after' : 'before';
    };

    const stop = () => {
      if (raf !== null) {
        window.cancelAnimationFrame(raf);
        raf = null;
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      try { target.releasePointerCapture(pointerId); } catch { /* ignore */ }
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      handleDragEnd();
    };

    const processPointer = () => {
      raf = null;
      if (!latestPointer) return;
      const { x, y } = latestPointer;

      if (!dragging) {
        const distance = Math.hypot(x - startX, y - startY);
        if (distance < 6) return;
        dragging = true;
        setDraggingProjectId(project.id);
        setDropTarget(null);
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }

      const list = tabsRef.current;
      if (!list) return;

      // Auto-scroll left/right at edges
      const listRect = list.getBoundingClientRect();
      const edgeZone = 22;
      if (x < listRect.left + edgeZone) {
        const ratio = (listRect.left + edgeZone - x) / edgeZone;
        list.scrollBy({ left: -Math.ceil(10 * ratio), behavior: 'auto' });
      } else if (x > listRect.right - edgeZone) {
        const ratio = (x - (listRect.right - edgeZone)) / edgeZone;
        list.scrollBy({ left: Math.ceil(10 * ratio), behavior: 'auto' });
      }

      const element = document.elementFromPoint(x, y) as HTMLElement | null;
      const item = element?.closest<HTMLElement>('.projectTab') ?? null;
      if (!item || !list.contains(item)) {
        setDropTarget(null);
        return;
      }

      const targetId = item.dataset.projectId ?? null;
      if (!targetId || targetId === project.id) {
        setDropTarget(null);
        return;
      }

      const rect = item.getBoundingClientRect();
      const position = getDropPosition(x, rect, targetId);
      setDropTarget((prev) => {
        if (prev?.projectId === targetId && prev.position === position) return prev;
        return { projectId: targetId, position };
      });

      if (lastTargetId === targetId && lastPosition === position) return;
      lastTargetId = targetId;
      lastPosition = position;
      onMoveProject(project.id, targetId, position);
    };

    const scheduleProcess = () => {
      if (raf !== null) return;
      raf = window.requestAnimationFrame(processPointer);
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      latestPointer = { x: ev.clientX, y: ev.clientY };
      scheduleProcess();
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      // If we didn't drag, treat it as a normal click
      if (!dragging) {
        onSelectProject(project.id);
      }
      stop();
    };

    e.preventDefault();
    e.stopPropagation();

    try { target.setPointerCapture(pointerId); } catch { /* ignore */ }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  };

  return (
    <>
      <div className="projectTabBar">
        <div className="projectTabs" ref={tabsRef}>
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            const count = sessionCountByProject.get(p.id) ?? 0;
            const workingCount = workingAgentCountByProject.get(p.id) ?? 0;
            const isDragging = p.id === draggingProjectId;
            const isDropBefore = dropTarget?.projectId === p.id && dropTarget.position === 'before';
            const isDropAfter = dropTarget?.projectId === p.id && dropTarget.position === 'after';
            const hasNeedsInput = needsInputByProject.get(p.id) ?? false;

            return (
              <div
                key={p.id}
                data-project-id={p.id}
                className={`projectTab ${isActive ? "projectTabActive" : ""} ${isDragging ? "projectTabDragging" : ""} ${isDropBefore ? "projectTabDropBefore" : ""} ${isDropAfter ? "projectTabDropAfter" : ""} ${hasNeedsInput ? "projectTabNeedsInput" : ""}`}
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => handleTabPointerDown(e, p)}
              >
                <button
                  type="button"
                  className="projectTabMain"
                  onClick={() => onSelectProject(p.id)}
                  title={p.basePath || p.name}
                >
                  <span className="projectTabName">{p.name}</span>
                  {workingCount > 0 && (
                    <span className="projectTabWorking">
                      <span className="projectTabWorkingDot" />
                      {workingCount}
                    </span>
                  )}
                  {count > 0 && <span className="projectTabCount">{count}</span>}
                </button>
                {isActive && (
                  <button
                    type="button"
                    className="projectTabSettingsBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsProjectId(p.id);
                    }}
                    title="Project settings"
                  >
                    <Icon name="settings" size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="projectTabBarActions">
          <div className="projectAddMenuWrapper" ref={addMenuRef}>
            <button
              type="button"
              className="projectTabBarBtn"
              onClick={() => setAddMenuOpen((v) => !v)}
              title="Add project"
            >
              <Icon name="plus" size={14} />
            </button>
            {addMenuOpen && (
              <div className="projectAddMenu">
                <button
                  type="button"
                  className="projectAddMenuItem"
                  onClick={() => {
                    setAddMenuOpen(false);
                    onNewProject();
                  }}
                >
                  <Icon name="plus" size={12} />
                  NEW PROJECT
                </button>
                <button
                  type="button"
                  className="projectAddMenuItem"
                  onClick={() => void handleOpenSavedProjects()}
                >
                  <Icon name="folder" size={12} />
                  OPEN SAVED PROJECT
                </button>
              </div>
            )}
          </div>
          {onOpenMultiProjectBoard && (
            <button
              type="button"
              className="projectTabBarBtn"
              onClick={onOpenMultiProjectBoard}
              title="Multi-Project Board (Cmd+Shift+B)"
            >
              <Icon name="layers" size={14} />
            </button>
          )}
          <button
            type="button"
            className="projectTabBarBtn"
            onClick={() => setAppSettingsOpen(true)}
            title="Settings"
          >
            <Icon name="settings" size={14} />
          </button>
          <button
            type="button"
            className="projectTabBarBtn globalSoundToggle"
            onClick={() => {
              const next = !soundEnabled;
              soundManager.setEnabled(next);
              setSoundEnabled(next);
            }}
            title={soundEnabled ? "Mute sounds" : "Unmute sounds"}
          >
            <Icon name={soundEnabled ? "volume" : "volume-off"} size={14} />
          </button>
        </div>
      </div>

      {settingsProject && (
        <ProjectSettingsDialog
          project={settingsProject}
          sessionCount={sessionCountByProject.get(settingsProject.id) ?? 0}
          onClose={() => setSettingsProjectId(null)}
          onDelete={handleDelete}
          onCloseProject={handleCloseProject}
        />
      )}

      {savedProjectsOpen && (
        <div className="projectSettingsBackdrop" onClick={() => setSavedProjectsOpen(false)}>
          <div className="projectSettingsDialog" onClick={(e) => e.stopPropagation()}>
            <div className="projectSettingsHeader">
              <span className="projectSettingsTitle">[ SAVED PROJECTS ]</span>
              <button className="projectSettingsClose" onClick={() => setSavedProjectsOpen(false)}>×</button>
            </div>
            <div className="projectSettingsContent">
              {savedProjectsLoading ? (
                <div className="projectSettingsRow">
                  <span className="projectSettingsValue">Loading...</span>
                </div>
              ) : savedProjects.length === 0 ? (
                <div className="projectSettingsRow">
                  <span className="projectSettingsValue">No saved projects to open</span>
                </div>
              ) : (
                savedProjects.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    className="savedProjectItem"
                    onClick={() => {
                      onReopenProject(sp.id);
                      setSavedProjectsOpen(false);
                    }}
                  >
                    <span className="savedProjectName">{sp.name}</span>
                    {sp.workingDir && (
                      <span className="savedProjectPath">{sp.workingDir}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {appSettingsOpen && (
        <AppSettingsDialog onClose={() => setAppSettingsOpen(false)} />
      )}
    </>
  );
}
