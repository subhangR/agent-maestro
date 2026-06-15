import React from "react";
import { useMobilePanelStore, type MobilePanel, type MobileMainView } from "../../stores/useMobilePanelStore";
import { useWorkspaceStore, getActiveWorkspaceView } from "../../stores/useWorkspaceStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { isWhiteboardId, isFileId } from "../../app/types/space";

type Tab =
  | { kind: "panel"; key: string; panel: MobilePanel; label: string; icon: React.ReactNode }
  | { kind: "main"; key: string; mainView: MobileMainView; label: string; icon: React.ReactNode };

const SidebarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor" />
    <rect x="2" y="8.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
    <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
  </svg>
);

const TerminalIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <polyline points="3,5 8,9 3,13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <line x1="10" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const EditorIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <polyline points="5,6 2,9 5,12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="13,6 16,9 13,12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <line x1="7" y1="12.5" x2="11" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const FilesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path
      d="M2 5.5C2 4.67 2.67 4 3.5 4H7.5L9 5.5H14.5C15.33 5.5 16 6.17 16 7V13.5C16 14.33 15.33 15 14.5 15H3.5C2.67 15 2 14.33 2 13.5V5.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinejoin="round"
    />
  </svg>
);

const SessionsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="10" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="2" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="10" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

export function MobilePanelNav() {
  const activePanel = useMobilePanelStore((s) => s.activePanel);
  const setActivePanel = useMobilePanelStore((s) => s.setActivePanel);
  const mainView = useMobilePanelStore((s) => s.mainView);
  const setMainView = useMobilePanelStore((s) => s.setMainView);

  // Subscribe so we re-render when panes open/close or context changes.
  useWorkspaceStore((s) => s.workspaceViewByKey);
  const activeId = useSessionStore((s) => s.activeId);
  useProjectStore((s) => s.activeProjectId);

  const view = getActiveWorkspaceView();
  const editorOpen = view.codeEditorOpen;
  const filesOpen = view.fileExplorerOpen;

  const primary = (() => {
    if (activeId && isWhiteboardId(activeId)) return { label: "Board", icon: <EditorIcon /> };
    if (activeId && isFileId(activeId)) return { label: "File", icon: <FilesIcon /> };
    return { label: "Terminal", icon: <TerminalIcon /> };
  })();

  const tabs: Tab[] = [
    { kind: "panel", key: "left", panel: "left", label: "Sidebar", icon: <SidebarIcon /> },
    { kind: "main", key: "primary", mainView: "primary", label: primary.label, icon: primary.icon },
  ];
  if (editorOpen) {
    tabs.push({ kind: "main", key: "editor", mainView: "editor", label: "Editor", icon: <EditorIcon /> });
  }
  if (filesOpen) {
    tabs.push({ kind: "main", key: "files", mainView: "files", label: "Files", icon: <FilesIcon /> });
  }
  tabs.push({ kind: "panel", key: "right", panel: "right", label: "Sessions", icon: <SessionsIcon /> });

  const isTabActive = (tab: Tab): boolean => {
    if (tab.kind === "panel") return activePanel === tab.panel;
    // main-kind tabs are only active when the outer panel is "main"
    if (activePanel !== "main") return false;
    const effective: MobileMainView =
      (mainView === "editor" && !editorOpen) || (mainView === "files" && !filesOpen)
        ? "primary"
        : mainView;
    return effective === tab.mainView;
  };

  const onTabClick = (tab: Tab) => {
    if (tab.kind === "panel") {
      setActivePanel(tab.panel);
    } else {
      setActivePanel("main");
      setMainView(tab.mainView);
    }
  };

  return (
    <nav className="mobilePanelNav" aria-label="Panel navigation">
      {tabs.map((tab) => {
        const active = isTabActive(tab);
        return (
          <button
            key={tab.key}
            type="button"
            className={`mobilePanelNavTab${active ? " mobilePanelNavTab--active" : ""}`}
            onClick={() => onTabClick(tab)}
            aria-pressed={active}
            aria-label={tab.label}
          >
            <span className="mobilePanelNavIcon">{tab.icon}</span>
            <span className="mobilePanelNavLabel">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
