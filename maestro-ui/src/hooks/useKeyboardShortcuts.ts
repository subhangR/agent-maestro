import { useEffect } from "react";
import { useSessionStore } from "../stores/useSessionStore";
import { useProjectStore } from "../stores/useProjectStore";
import { useProjectDialogStore } from "../stores/useProjectDialogStore";
import { useSshStore } from "../stores/useSshStore";
import { useAgentShortcutStore } from "../stores/useAgentShortcutStore";
import { usePromptStore } from "../stores/usePromptStore";
import { useRecordingStore } from "../stores/useRecordingStore";
import { useEnvironmentStore } from "../stores/useEnvironmentStore";
import { useAssetStore } from "../stores/useAssetStore";
import { usePathPickerStore } from "../stores/usePathPickerStore";
import { useSecureStorageStore } from "../stores/useSecureStorageStore";
import { useUIStore } from "../stores/useUIStore";
import { useSpellbookStore } from "../stores/useSpellbookStore";
import { useSpellStudioStore } from "../stores/useSpellStudioStore";

export function useKeyboardShortcuts() {
    // ── Read modal open states reactively ──
    // These determine which branch the escape handler takes,
    // so they must be effect dependencies to re-register the listener
    // whenever a modal opens or closes.
    const newOpen = useSessionStore((s) => s.newOpen);
    const sshManagerOpen = useSshStore((s) => s.sshManagerOpen);
    const agentShortcutsOpen = useAgentShortcutStore((s) => s.agentShortcutsOpen);
    const projectOpen = useProjectDialogStore((s) => s.projectOpen);
    const pathPickerOpen = usePathPickerStore((s) => s.pathPickerOpen);
    const confirmDeleteProjectOpen = useProjectDialogStore((s) => s.confirmDeleteProjectOpen);
    const confirmDeleteRecordingId = useRecordingStore((s) => s.confirmDeleteRecordingId);
    const confirmDeletePromptId = usePromptStore((s) => s.confirmDeletePromptId);
    const confirmDeleteEnvironmentId = useEnvironmentStore((s) => s.confirmDeleteEnvironmentId);
    const confirmDeleteAssetId = useAssetStore((s) => s.confirmDeleteAssetId);
    const applyAssetRequest = useAssetStore((s) => s.applyAssetRequest);
    const applyAssetApplying = useAssetStore((s) => s.applyAssetApplying);
    const replayOpen = useRecordingStore((s) => s.replayOpen);
    const recordPromptOpen = useRecordingStore((s) => s.recordPromptOpen);
    const recordingsOpen = useRecordingStore((s) => s.recordingsOpen);
    const secureStorageSettingsOpen = useSecureStorageStore((s) => s.secureStorageSettingsOpen);
    const promptsOpen = usePromptStore((s) => s.promptsOpen);
    const promptEditorOpen = usePromptStore((s) => s.promptEditorOpen);
    const environmentsOpen = useEnvironmentStore((s) => s.environmentsOpen);
    const environmentEditorOpen = useEnvironmentStore((s) => s.environmentEditorOpen);
    const assetEditorOpen = useAssetStore((s) => s.assetEditorOpen);
    const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
    const slidePanelOpen = useUIStore((s) => s.slidePanelOpen);
    const slidePanelTab = useUIStore((s) => s.slidePanelTab);

    useEffect(() => {
        const isMac = /Mac|iPhone|iPad|iPod/.test((navigator as any).userAgentData?.platform ?? navigator.platform);
        const onKeyDown = (e: KeyboardEvent) => {
            const modalOpen =
                newOpen ||
                sshManagerOpen ||
                agentShortcutsOpen ||
                projectOpen ||
                pathPickerOpen ||
                confirmDeleteProjectOpen ||
                Boolean(confirmDeleteRecordingId) ||
                Boolean(confirmDeletePromptId) ||
                Boolean(confirmDeleteEnvironmentId) ||
                Boolean(confirmDeleteAssetId) ||
                Boolean(applyAssetRequest) ||
                replayOpen ||
                recordPromptOpen ||
                recordingsOpen ||
                secureStorageSettingsOpen ||
                promptsOpen ||
                promptEditorOpen ||
                environmentsOpen ||
                environmentEditorOpen ||
                assetEditorOpen;

            // Command palette takes priority - Cmd+K or Ctrl+K
            const modKey = isMac ? e.metaKey : e.ctrlKey;
            if (modKey && e.key.toLowerCase() === "k" && !commandPaletteOpen) {
                e.preventDefault();
                e.stopPropagation();
                (document.activeElement as HTMLElement | null)?.blur?.();
                useUIStore.getState().setCommandPaletteOpen(true);
                return;
            }

            // Close command palette with Escape
            if (e.key === "Escape" && commandPaletteOpen) {
                e.preventDefault();
                e.stopPropagation();
                useUIStore.getState().setCommandPaletteOpen(false);
                return;
            }

            // Close slide panel with Escape
            if (e.key === "Escape" && slidePanelOpen && !modalOpen) {
                e.preventDefault();
                useUIStore.getState().setSlidePanelOpen(false);
                return;
            }

            if (e.key === "Escape" && modalOpen) {
                e.preventDefault();
                if (applyAssetRequest) {
                    if (applyAssetApplying) return;
                    useAssetStore.getState().closeApplyAssetModal();
                    return;
                }
                if (confirmDeleteAssetId) {
                    useAssetStore.getState().setConfirmDeleteAssetId(null);
                    return;
                }
                if (confirmDeleteEnvironmentId) {
                    useEnvironmentStore.getState().setConfirmDeleteEnvironmentId(null);
                    return;
                }
                if (confirmDeletePromptId) {
                    usePromptStore.getState().setConfirmDeletePromptId(null);
                    return;
                }
                if (confirmDeleteRecordingId) {
                    useRecordingStore.getState().setConfirmDeleteRecordingId(null);
                    return;
                }
                if (agentShortcutsOpen) {
                    useAgentShortcutStore.getState().setAgentShortcutsOpen(false);
                    return;
                }
                if (secureStorageSettingsOpen) {
                    useSecureStorageStore.getState().closeSecureStorageSettings();
                    return;
                }
                if (environmentEditorOpen) {
                    useEnvironmentStore.getState().setEnvironmentEditorOpen(false);
                    return;
                }
                if (environmentsOpen) {
                    useEnvironmentStore.getState().setEnvironmentsOpen(false);
                    return;
                }
                if (assetEditorOpen) {
                    useAssetStore.getState().closeAssetEditor();
                    return;
                }
                if (promptEditorOpen) {
                    usePromptStore.getState().setPromptEditorOpen(false);
                    return;
                }
                if (promptsOpen) {
                    usePromptStore.getState().setPromptsOpen(false);
                    return;
                }
                if (recordingsOpen) {
                    useRecordingStore.getState().setRecordingsOpen(false);
                    return;
                }
                if (recordPromptOpen) {
                    useRecordingStore.getState().closeRecordPrompt();
                    return;
                }
                if (replayOpen) {
                    useRecordingStore.getState().closeReplayModal();
                    return;
                }
                if (pathPickerOpen) {
                    usePathPickerStore.getState().closePathPicker();
                    return;
                }
                if (confirmDeleteProjectOpen) {
                    useProjectDialogStore.getState().setConfirmDeleteProjectOpen(false);
                    return;
                }
                if (projectOpen) {
                    useProjectDialogStore.getState().setProjectOpen(false);
                    return;
                }
                if (sshManagerOpen) {
                    useSshStore.getState().setSshManagerOpen(false);
                    return;
                }
                if (newOpen) {
                    useSessionStore.getState().setNewOpen(false);
                    return;
                }
                return;
            }

            if (commandPaletteOpen || modalOpen) return;

            // Read data values via getState() to avoid stale closures
            const { activeProjectId } = useProjectStore.getState();
            const { sessions, activeId } = useSessionStore.getState();
            const projectSessions = sessions.filter((s) => s.projectId === activeProjectId);

            // Cmd+B / Ctrl+B - Toggle left sidebar collapse
            if (modKey && !e.shiftKey && e.key.toLowerCase() === "b") {
                e.preventDefault();
                const ui = useUIStore.getState();
                const current = ui.iconRailActiveSection;
                if (current === null) {
                    ui.setIconRailActiveSection("tasks");
                } else {
                    ui.setIconRailActiveSection(null);
                }
                return;
            }

            // Cmd+Shift+B / Ctrl+Shift+B — Toggle the SpellbookDrawer (spell-system).
            if (modKey && e.shiftKey && e.key.toLowerCase() === "b") {
                e.preventDefault();
                useSpellbookStore.getState().toggleSpellbook();
                return;
            }

            // Cmd+Shift+S / Ctrl+Shift+S — Open the Spell Studio. If a session is
            // focused, jump straight to Cast targeting it; otherwise browse the Library.
            if (modKey && e.shiftKey && e.key.toLowerCase() === "s") {
                e.preventDefault();
                const { activeId } = useSessionStore.getState();
                useSpellStudioStore.getState().openStudio(
                    activeId
                        ? { route: 'cast', targetSessionIds: [activeId] }
                        : { route: 'library' },
                );
                return;
            }

            // Cmd+. / Ctrl+. — Toggle right spaces panel
            if (modKey && !e.shiftKey && e.key === ".") {
                e.preventDefault();
                useUIStore.getState().toggleSpacesPanel();
                return;
            }

            if (isMac) {
                // Cmd+T - Create new Maestro task
                if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "t") {
                    e.preventDefault();
                    const ui = useUIStore.getState();
                    ui.setActiveRightPanel("maestro");
                    ui.setActiveMobilePanel("maestro");
                    ui.setCreateTaskRequested(true);
                    return;
                }
                // Cmd+N - New terminal session
                if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "n") {
                    e.preventDefault();
                    useProjectDialogStore.getState().setProjectOpen(false);
                    useSessionStore.getState().setNewOpen(true);
                    return;
                }
                // Cmd+D - New terminal session (same as Cmd+N)
                if (e.metaKey && e.key.toLowerCase() === "d") {
                    e.preventDefault();
                    useProjectDialogStore.getState().setProjectOpen(false);
                    useSessionStore.getState().setNewOpen(true);
                    return;
                }
                // Cmd+E - Next session
                if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "e") {
                    e.preventDefault();
                    if (!projectSessions.length) return;
                    const idx = projectSessions.findIndex((s) => s.id === activeId);
                    const next = projectSessions[(idx + 1) % projectSessions.length];
                    useSessionStore.getState().setActiveId(next.id);
                    return;
                }
                // Cmd+R - Previous session
                if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "r") {
                    e.preventDefault();
                    if (!projectSessions.length) return;
                    const idx = projectSessions.findIndex((s) => s.id === activeId);
                    const prev = projectSessions[(idx - 1 + projectSessions.length) % projectSessions.length];
                    useSessionStore.getState().setActiveId(prev.id);
                    return;
                }
                if (e.metaKey && e.key.toLowerCase() === "w") {
                    if (!activeId) return;
                    e.preventDefault();
                    void useSessionStore.getState().onClose(activeId);
                    return;
                }
                // Cmd+Shift+P - Toggle Prompts Panel
                if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "p") {
                    e.preventDefault();
                    const ui = useUIStore.getState();
                    if (!slidePanelOpen) {
                        ui.setSlidePanelTab("prompts");
                        ui.setSlidePanelOpen(true);
                    } else if (slidePanelTab === "prompts") {
                        ui.setSlidePanelOpen(false);
                    } else {
                        ui.setSlidePanelTab("prompts");
                    }
                    return;
                }
                // Cmd+Shift+R - Toggle Recordings Panel
                if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "r") {
                    e.preventDefault();
                    void useRecordingStore.getState().refreshRecordings();
                    const ui = useUIStore.getState();
                    if (!slidePanelOpen) {
                        ui.setSlidePanelTab("recordings");
                        ui.setSlidePanelOpen(true);
                    } else if (slidePanelTab === "recordings") {
                        ui.setSlidePanelOpen(false);
                    } else {
                        ui.setSlidePanelTab("recordings");
                    }
                    return;
                }
                // Cmd+Shift+A - Toggle Assets Panel
                if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "a") {
                    e.preventDefault();
                    const ui = useUIStore.getState();
                    if (!slidePanelOpen) {
                        ui.setSlidePanelTab("assets");
                        ui.setSlidePanelOpen(true);
                    } else if (slidePanelTab === "assets") {
                        ui.setSlidePanelOpen(false);
                    } else {
                        ui.setSlidePanelTab("assets");
                    }
                    return;
                }
                // Cmd+1 through Cmd+5 - Quick prompts
                if (e.metaKey && /^[1-5]$/.test(e.key)) {
                    const idx = parseInt(e.key) - 1;
                    const { prompts } = usePromptStore.getState();
                    const pinnedPrompts = prompts
                        .filter(p => p.pinned)
                        .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
                    if (pinnedPrompts[idx] && activeId) {
                        e.preventDefault();
                        void useSessionStore.getState().sendPromptToActive(pinnedPrompts[idx], "send");
                    }
                    return;
                }
            } else {
                // Ctrl+Shift+T - Create new Maestro task
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
                    e.preventDefault();
                    const ui = useUIStore.getState();
                    ui.setActiveRightPanel("maestro");
                    ui.setActiveMobilePanel("maestro");
                    ui.setCreateTaskRequested(true);
                    return;
                }
                // Ctrl+Shift+N - New terminal session
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "n") {
                    e.preventDefault();
                    useProjectDialogStore.getState().setProjectOpen(false);
                    useSessionStore.getState().setNewOpen(true);
                    return;
                }
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "w") {
                    if (!activeId) return;
                    e.preventDefault();
                    void useSessionStore.getState().onClose(activeId);
                    return;
                }
                // Ctrl+Shift+P - Toggle Prompts Panel
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "p") {
                    e.preventDefault();
                    const ui = useUIStore.getState();
                    if (!slidePanelOpen) {
                        ui.setSlidePanelTab("prompts");
                        ui.setSlidePanelOpen(true);
                    } else if (slidePanelTab === "prompts") {
                        ui.setSlidePanelOpen(false);
                    } else {
                        ui.setSlidePanelTab("prompts");
                    }
                    return;
                }
                // Ctrl+Shift+R - Toggle Recordings Panel
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
                    e.preventDefault();
                    void useRecordingStore.getState().refreshRecordings();
                    const ui = useUIStore.getState();
                    if (!slidePanelOpen) {
                        ui.setSlidePanelTab("recordings");
                        ui.setSlidePanelOpen(true);
                    } else if (slidePanelTab === "recordings") {
                        ui.setSlidePanelOpen(false);
                    } else {
                        ui.setSlidePanelTab("recordings");
                    }
                    return;
                }
                // Ctrl+Shift+A - Toggle Assets Panel
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a") {
                    e.preventDefault();
                    const ui = useUIStore.getState();
                    if (!slidePanelOpen) {
                        ui.setSlidePanelTab("assets");
                        ui.setSlidePanelOpen(true);
                    } else if (slidePanelTab === "assets") {
                        ui.setSlidePanelOpen(false);
                    } else {
                        ui.setSlidePanelTab("assets");
                    }
                    return;
                }
                // Ctrl+1 through Ctrl+5 - Quick prompts
                if (e.ctrlKey && /^[1-5]$/.test(e.key)) {
                    const idx = parseInt(e.key) - 1;
                    const { prompts } = usePromptStore.getState();
                    const pinnedPrompts = prompts
                        .filter(p => p.pinned)
                        .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
                    if (pinnedPrompts[idx] && activeId) {
                        e.preventDefault();
                        void useSessionStore.getState().sendPromptToActive(pinnedPrompts[idx], "send");
                    }
                    return;
                }
            }

            if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
                e.preventDefault();
                if (!projectSessions.length) return;
                const idx = projectSessions.findIndex((s) => s.id === activeId);
                const next = projectSessions[(idx - 1 + projectSessions.length) % projectSessions.length];
                useSessionStore.getState().setActiveId(next.id);
                return;
            }
            if (e.ctrlKey && e.key === "Tab") {
                e.preventDefault();
                if (!projectSessions.length) return;
                const idx = projectSessions.findIndex((s) => s.id === activeId);
                const next = projectSessions[(idx + 1 + projectSessions.length) % projectSessions.length];
                useSessionStore.getState().setActiveId(next.id);
                return;
            }
        };

        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [
        newOpen,
        sshManagerOpen,
        agentShortcutsOpen,
        projectOpen,
        pathPickerOpen,
        confirmDeleteProjectOpen,
        confirmDeleteRecordingId,
        confirmDeletePromptId,
        confirmDeleteEnvironmentId,
        confirmDeleteAssetId,
        applyAssetRequest,
        applyAssetApplying,
        replayOpen,
        recordPromptOpen,
        recordingsOpen,
        secureStorageSettingsOpen,
        promptsOpen,
        promptEditorOpen,
        environmentsOpen,
        environmentEditorOpen,
        assetEditorOpen,
        commandPaletteOpen,
        slidePanelOpen,
        slidePanelTab,
    ]);
}
