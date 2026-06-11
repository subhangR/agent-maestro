import React, { useState, useRef, useLayoutEffect } from "react";
import { Icon } from "./Icon";
import { Icon as PnIcon } from "./maestro/redesign/kit";
import { useRedesignTheme } from "./maestro/redesign/useRedesignTheme";
import { MaestroProject, ProjectSoundConfig } from "../app/types/maestro";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { DisplaySettings } from "./DisplaySettings";
import { GitSettings } from "./GitSettings";
import { SoundSettingsContent } from "./modals/SoundSettingsModal";
import { ProjectSoundSettings } from "./modals/ProjectSoundSettings";
import { TerminalSettings } from "./TerminalSettings";
import { soundManager } from "../services/soundManager";
import { useProjectStore } from "../stores/useProjectStore";
import { useUIStore } from "../stores/useUIStore";

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
  onOpenWhiteboard?: () => void;
};

type SettingsDialogProps = {
  project: MaestroProject;
  sessionCount: number;
  onClose: () => void;
  onDelete: () => void;
  onCloseProject: () => void;
};

type SettingsTab = 'theme' | 'display' | 'sounds' | 'git' | 'shortcuts';
type ProjectSettingsTab = 'info' | 'sounds' | 'terminal';

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
  { action: "Toggle whiteboard", mac: "Cmd + Shift + X", windowsLinux: "Ctrl + Shift + X" },
  { action: "Send quick prompt (pinned)", mac: "Cmd + 1..5", windowsLinux: "Ctrl + 1..5" },
  { action: "Close open modal/panel", mac: "Esc", windowsLinux: "Esc" },
];

function AppSettingsDialog({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('theme');

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'theme', label: 'Theme' },
    { id: 'display', label: 'Display' },
    { id: 'sounds', label: 'Sounds' },
    { id: 'git', label: 'Git' },
    { id: 'shortcuts', label: 'Shortcuts' },
  ];

  return (
    <div className="projectSettingsBackdrop" onClick={onClose}>
      <div
        className={`pn-mdl appSettingsDialog${activeTab === 'display' ? ' appSettingsDialog--wide' : ''}`}
        style={{ width: activeTab === 'display' ? 820 : 720, maxWidth: '94vw' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="pn-mdl__hd">
          <div className="pn-mdl__hdmain">
            <div className="pn-mdl__titleinput">Settings</div>
          </div>
          <button type="button" className="pn-mdl__close" onClick={onClose} aria-label="Close">
            <PnIcon name="x" size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', minHeight: 0 }}>
          <div
            className="pn-mtabs pn-mtabs--vert"
            role="tablist"
            aria-orientation="vertical"
            style={{ flex: '0 0 auto' }}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                className={`pn-mtab ${activeTab === t.id ? 'pn-mtab--active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="pn-mdl__body" style={{ flex: 1, minWidth: 0 }}>
            {activeTab === 'theme' && <ThemeSwitcher />}
            {activeTab === 'display' && (
              <div className="appSettingsContent--terminal">
                <DisplaySettings />
              </div>
            )}
            {activeTab === 'sounds' && <SoundSettingsContent />}
            {activeTab === 'git' && <GitSettings />}
            {activeTab === 'shortcuts' && (
              <div className="pn-fld">
                <div className="pn-flabel">Available keyboard shortcuts</div>
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
  const [activeTab, setActiveTab] = useState<ProjectSettingsTab>('info');
  const setProjects = useProjectStore((s) => s.setProjects);
  const toggleMasterProject = useProjectStore((s) => s.toggleMasterProject);

  const handleSoundConfigChange = (config: ProjectSoundConfig | undefined) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? {
              ...p,
              soundConfig: config,
              soundInstrument: config?.instrument ?? p.soundInstrument,
            }
          : p
      )
    );
    if (config) {
      soundManager.setProjectConfig(project.id, config);
    } else {
      soundManager.removeProjectConfig(project.id);
    }
  };

  const TABS: { id: ProjectSettingsTab; label: string }[] = [
    { id: 'info', label: 'Info' },
    { id: 'sounds', label: 'Sounds' },
    { id: 'terminal', label: 'Terminal' },
  ];

  const isMaster = project.isMaster ?? false;

  return (
    <div className="projectSettingsBackdrop" onClick={onClose}>
      <div
        className={`pn-mdl appSettingsDialog${activeTab === 'terminal' ? ' appSettingsDialog--wide' : ''}`}
        style={{ width: activeTab === 'terminal' ? 820 : 640, maxWidth: '94vw' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Project settings"
      >
        <div className="pn-mdl__hd">
          <div className="pn-mdl__hdmain">
            <div className="pn-mdl__crumb">
              <span>PROJECT</span>
              <PnIcon name="chevronR" size={12} />
              <b>{project.name}</b>
            </div>
            <div className="pn-mdl__titleinput">Project Settings</div>
          </div>
          <button type="button" className="pn-mdl__close" onClick={onClose} aria-label="Close">
            <PnIcon name="x" size={16} />
          </button>
        </div>

        <div className="pn-mtabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`pn-mtab ${activeTab === t.id ? 'pn-mtab--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pn-mdl__body">
          {activeTab === 'info' && (
            <>
              <div className="pn-fld">
                <span className="pn-flabel">Name</span>
                <span style={{ fontSize: 13.5, color: 'var(--pn-ink)' }}>{project.name}</span>
              </div>

              {project.basePath && (
                <div className="pn-fld">
                  <span className="pn-flabel">Path</span>
                  <span style={{ fontFamily: 'var(--pn-mono)', fontSize: 12, color: 'var(--pn-ink-2)', wordBreak: 'break-all' }}>
                    {project.basePath}
                  </span>
                </div>
              )}

              <div className="pn-frow">
                <div className="pn-fld" style={{ flex: 1 }}>
                  <span className="pn-flabel">Sessions</span>
                  <span style={{ fontSize: 13.5, color: 'var(--pn-ink)' }}>{sessionCount}</span>
                </div>
                <div className="pn-fld" style={{ flex: 1 }}>
                  <span className="pn-flabel">Created</span>
                  <span style={{ fontSize: 13.5, color: 'var(--pn-ink)' }}>
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="pn-caps">
                <label className="pn-cap" title="Sessions in this project can access all other projects">
                  <input
                    type="checkbox"
                    className="sr-only"
                    style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                    checked={isMaster}
                    onChange={() => void toggleMasterProject(project.id)}
                  />
                  <div className="pn-cap__body">
                    <div className="pn-cap__name">{isMaster ? '★ Master Project' : 'Master Project'}</div>
                    <div className="pn-cap__desc">Sessions in this project can access all other projects</div>
                  </div>
                  <span className={`pn-switch ${isMaster ? 'pn-switch--on' : ''}`} />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="pn-btn"
                  onClick={() => {
                    onCloseProject();
                    onClose();
                  }}
                >
                  <Icon name="close" size={14} />
                  Close project
                </button>

                <button
                  type="button"
                  className="pn-btn pn-btn--danger"
                  onClick={() => {
                    onDelete();
                    onClose();
                  }}
                >
                  <Icon name="trash" size={14} />
                  Delete project
                </button>
              </div>
            </>
          )}

          {activeTab === 'sounds' && (
            <ProjectSoundSettings
              config={project.soundConfig}
              onChange={handleSoundConfigChange}
            />
          )}

          {activeTab === 'terminal' && (
            <div className="appSettingsContent appSettingsContent--terminal">
              <TerminalSettings />
            </div>
          )}
        </div>
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
  onOpenWhiteboard,
}: ProjectTabBarProps) {
  const { isDark, toggle: toggleTheme } = useRedesignTheme({ ensureRedesign: false });
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
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

    // Don't intercept clicks on the settings button
    const clickTarget = e.target as HTMLElement;
    if (clickTarget.closest('.projectTabSettingsBtn')) return;

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
      <div className="pn-top projectTabBar">
        <div className="pn-ptabs projectTabs" ref={tabsRef}>
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            const count = sessionCountByProject.get(p.id) ?? 0;
            const workingCount = workingAgentCountByProject.get(p.id) ?? 0;
            const isDragging = p.id === draggingProjectId;
            const isDropBefore = dropTarget?.projectId === p.id && dropTarget.position === 'before';
            const isDropAfter = dropTarget?.projectId === p.id && dropTarget.position === 'after';
            const hasNeedsInput = needsInputByProject.get(p.id) ?? false;
            const dotKind = hasNeedsInput ? "wait" : workingCount > 0 ? "run" : "idle";
            const dotLive = dotKind === "run" ? " pn-dot--live" : "";

            return (
              <div
                key={p.id}
                data-project-id={p.id}
                className={`pn-ptab ${isActive ? "pn-ptab--active" : ""} projectTab ${isActive ? "projectTabActive" : ""} ${isDragging ? "projectTabDragging" : ""} ${isDropBefore ? "projectTabDropBefore" : ""} ${isDropAfter ? "projectTabDropAfter" : ""} ${hasNeedsInput ? "projectTabNeedsInput" : ""}`}
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => handleTabPointerDown(e, p)}
              >
                <button
                  type="button"
                  className="projectTabMain"
                  onClick={() => onSelectProject(p.id)}
                  title={p.basePath || p.name}
                >
                  <span className={`pn-dot pn-dot--${dotKind}${dotLive}`} />
                  {p.isMaster && <span className="projectTabMasterIcon" title="Master Project">★</span>}
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
                    <PnIcon name="settings" size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {/* Add-project menu lives OUTSIDE the .projectTabs scroller: that
            scroller sets overflow-x:auto, which forces overflow-y to auto too
            and would clip this dropdown (rendering it unclickable). */}
        <div className="projectAddMenuWrapper" ref={addMenuRef}>
          <button
            type="button"
            className="pn-ib"
            style={{ width: 26, height: 26 }}
            onClick={() => setAddMenuOpen((v) => !v)}
            title="Add project"
          >
            <PnIcon name="plus" size={14} />
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
                <PnIcon name="plus" size={12} />
                NEW PROJECT
              </button>
              <button
                type="button"
                className="projectAddMenuItem"
                onClick={() => void handleOpenSavedProjects()}
              >
                <PnIcon name="folder" size={12} />
                OPEN SAVED PROJECT
              </button>
            </div>
          )}
        </div>
        <div className="pn-top-r">
          {onOpenMultiProjectBoard && (
            <button
              type="button"
              className="pn-ib"
              onClick={onOpenMultiProjectBoard}
              title="Multi-Project Board (Cmd/Ctrl+Shift+B)"
            >
              <PnIcon name="layers" size={16} />
            </button>
          )}
          {onOpenWhiteboard && (
            <button
              type="button"
              className="pn-ib"
              onClick={onOpenWhiteboard}
              title="Whiteboard (Cmd/Ctrl+Shift+X)"
            >
              <PnIcon name="pen" size={16} />
            </button>
          )}
          <button
            type="button"
            className="pn-ib globalSoundToggle"
            onClick={() => {
              const next = !soundEnabled;
              soundManager.setEnabled(next);
              setSoundEnabled(next);
            }}
            title={soundEnabled ? "Mute sounds" : "Unmute sounds"}
          >
            <PnIcon name={soundEnabled ? "volume" : "volumeOff"} size={16} />
          </button>
          <button
            type="button"
            className="pn-ib"
            onClick={() => setAppSettingsOpen(true)}
            title="Settings"
          >
            <PnIcon name="settings" size={16} />
          </button>
          <button
            type="button"
            className="pn-ib"
            onClick={toggleTheme}
            title={isDark ? "Light mode" : "Dark mode"}
          >
            <PnIcon name={isDark ? "sun" : "moon"} size={16} />
          </button>
          <button
            type="button"
            className="pn-ib"
            onClick={() => setCommandPaletteOpen(true)}
            title="Search"
          >
            <PnIcon name="search" size={16} />
          </button>
          <button
            type="button"
            className="pn-ib"
            onClick={() => setCommandPaletteOpen(true)}
            title="Command palette (Cmd/Ctrl+K)"
          >
            <span className="pn-kbd">⌘K</span>
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
              <button type="button" className="projectSettingsClose" onClick={() => setSavedProjectsOpen(false)}>×</button>
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
