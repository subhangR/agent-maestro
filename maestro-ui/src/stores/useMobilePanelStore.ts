import { create } from "zustand";

export type MobilePanel = "left" | "main" | "right";
export type MobileMainView = "primary" | "editor" | "files";

interface MobilePanelState {
  activePanel: MobilePanel;
  setActivePanel: (panel: MobilePanel) => void;
  mainView: MobileMainView;
  setMainView: (view: MobileMainView) => void;
}

export const useMobilePanelStore = create<MobilePanelState>((set) => ({
  activePanel: "main",
  setActivePanel: (panel) => set({ activePanel: panel }),
  mainView: "primary",
  setMainView: (mainView) => set({ mainView }),
}));
