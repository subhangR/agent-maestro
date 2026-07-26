import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { Icon } from "./components/Icon";
import { useUIStore } from "./stores/useUIStore";
import { usePromptStore } from "./stores/usePromptStore";
import { useRecordingStore } from "./stores/useRecordingStore";
import { useSessionStore } from "./stores/useSessionStore";
import { useProjectStore } from "./stores/useProjectStore";
import { useProjectDialogStore } from "./stores/useProjectDialogStore";
import { useSshStore } from "./stores/useSshStore";
import { useSecureStorageStore } from "./stores/useSecureStorageStore";
import { useAgentShortcutStore } from "./stores/useAgentShortcutStore";
import { useQuickLaunch } from "./hooks/useQuickLaunch";
import type { Prompt } from "./app/types/app-state";
import type { RecordingIndexEntry } from "./app/types/recording";

type CommandItem = {
  id: string;
  type: "quickstart" | "prompt" | "recording" | "session" | "action";
  title: string;
  subtitle?: string;
  icon?: string;
  iconSrc?: string;
  iconAlt?: string;
  shortcut?: string;
  pinned?: boolean;
  data?: unknown;
};

type QuickStartPreset = {
  id: string;
  title: string;
  command: string | null;
  iconSrc?: string | null;
};

function fuzzyMatch(text: string, query: string): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 };

  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact match gets highest score
  if (textLower === queryLower) return { match: true, score: 100 };

  // Starts with gets high score
  if (textLower.startsWith(queryLower)) return { match: true, score: 90 };

  // Contains gets medium score
  if (textLower.includes(queryLower)) return { match: true, score: 70 };

  // Fuzzy match: all query chars must appear in order
  let queryIndex = 0;
  let consecutiveMatches = 0;
  let maxConsecutive = 0;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
      consecutiveMatches++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
    } else {
      consecutiveMatches = 0;
    }
  }

  if (queryIndex === queryLower.length) {
    return { match: true, score: 30 + maxConsecutive * 5 };
  }

  return { match: false, score: 0 };
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function CommandPalette() {
  // --- UI store ---
  const isOpen = useUIStore((s) => s.commandPaletteOpen);
  const advancedMode = useUIStore((s) => s.advancedMode);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const setSlidePanelOpen = useUIStore((s) => s.setSlidePanelOpen);
  const setSlidePanelTab = useUIStore((s) => s.setSlidePanelTab);

  // --- Prompt store ---
  const prompts = usePromptStore((s) => s.prompts);
  const openPromptEditor = usePromptStore((s) => s.openPromptEditor);

  // --- Recording store ---
  const recordings = useRecordingStore((s) => s.recordings);
  const openReplay = useRecordingStore((s) => s.openReplay);
  const openRecordPrompt = useRecordingStore((s) => s.openRecordPrompt);
  const stopRecording = useRecordingStore((s) => s.stopRecording);
  const refreshRecordings = useRecordingStore((s) => s.refreshRecordings);

  // --- Session store ---
  const allSessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeId);
  const setActiveId = useSessionStore((s) => s.setActiveId);
  const quickStart = useSessionStore((s) => s.quickStart);
  const sendPromptFromCommandPalette = useSessionStore((s) => s.sendPromptFromCommandPalette);
  const setNewOpen = useSessionStore((s) => s.setNewOpen);

  // --- Project store ---
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setProjectOpen = useProjectDialogStore((s) => s.setProjectOpen);

  // --- SSH store ---
  const setSshManagerOpen = useSshStore((s) => s.setSshManagerOpen);

  // --- Secure storage store ---
  const openSecureStorageSettings = useSecureStorageStore((s) => s.openSecureStorageSettings);

  // --- Agent shortcut store ---
  const agentShortcutIds = useAgentShortcutStore((s) => s.agentShortcutIds);

  // --- Derived: sessions filtered by project ---
  const sessions = useMemo(
    () => allSessions.filter((s) => s.projectId === activeProjectId),
    [allSessions, activeProjectId],
  );

  // --- Quick launch hook ---
  const { quickStarts } = useQuickLaunch({ agentShortcutIds, sessions });

  // --- Derived: is any session recording? ---
  const activeSession = allSessions.find((s) => s.id === activeSessionId) ?? null;
  const isRecording = Boolean(activeSession?.recordingActive);

  // --- Close handler ---
  const onClose = useCallback(() => setCommandPaletteOpen(false), [setCommandPaletteOpen]);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build unified command items
  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // Pinned prompts first (with shortcuts)
    const pinnedPrompts = prompts
      .filter(p => p.pinned)
      .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0))
      .slice(0, 5);

    pinnedPrompts.forEach((p, i) => {
      items.push({
        id: `prompt-${p.id}`,
        type: "prompt",
        title: p.title,
        subtitle: p.content.split("\n")[0].slice(0, 60),
        icon: "star",
        shortcut: `${i + 1}`,
        pinned: true,
        data: p,
      });
    });

    // Unpinned prompts
    prompts
      .filter(p => !p.pinned)
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach(p => {
        items.push({
          id: `prompt-${p.id}`,
          type: "prompt",
          title: p.title,
          subtitle: p.content.split("\n")[0].slice(0, 60),
          data: p,
        });
      });

    // Recent recordings (top 5)
    recordings.slice(0, 5).forEach(r => {
      const meta = r.meta;
      items.push({
        id: `recording-${r.recordingId}`,
        type: "recording",
        title: meta?.name || r.recordingId.slice(0, 8),
        subtitle: meta ? formatTimeAgo(meta.createdAt) : undefined,
        icon: "recording",
        data: r,
      });
    });

    // Active sessions
    sessions.forEach(s => {
      items.push({
        id: `session-${s.id}`,
        type: "session",
        title: s.name,
        subtitle: s.command || s.cwd || undefined,
        icon: s.id === activeSessionId ? "active" : "session",
        data: s,
      });
    });

    // Quick starts
    (quickStarts ?? []).forEach((preset) => {
      items.push({
        id: `quickstart-${preset.id}`,
        type: "quickstart",
        title: `New ${preset.title}`,
        subtitle: preset.command ? `Runs: ${preset.command}` : "Opens a terminal",
        icon: preset.iconSrc ? "active" : "plus",
        iconSrc: preset.iconSrc ?? undefined,
        iconAlt: preset.title,
        data: preset,
      });
    });

    // Actions
    items.push({
      id: "action-new-session",
      type: "action",
      title: "New Session",
      icon: "plus",
      shortcut: "T",
    });

    // SSH is a developer / remote-machine feature — Advanced only.
    if (advancedMode) {
      items.push({
        id: "action-ssh-connect",
        type: "action",
        title: "Connect to a remote machine (SSH)",
        icon: "ssh",
      });
    }

    items.push({
      id: "action-new-prompt",
      type: "action",
      title: "New Prompt",
      icon: "plus",
    });

    items.push({
      id: isRecording ? "action-stop-recording" : "action-start-recording",
      type: "action",
      title: isRecording ? "Stop Recording" : "Start Recording",
      icon: "recording",
    });

    items.push({
      id: "action-open-prompts",
      type: "action",
      title: "Open Prompts Panel",
      icon: "panel",
      shortcut: "Shift+P",
    });

    items.push({
      id: "action-open-recordings",
      type: "action",
      title: "Open Recordings Panel",
      icon: "panel",
      shortcut: "Shift+R",
    });

    items.push({
      id: "action-open-assets",
      type: "action",
      title: "Open Assets Panel",
      icon: "panel",
      shortcut: "Shift+A",
    });

    items.push({
      id: "action-secure-storage",
      type: "action",
      title: "Secure Storage Settings",
      icon: "settings",
    });

    return items;
  }, [prompts, recordings, sessions, activeSessionId, isRecording, quickStarts, advancedMode]);

  // Filter and sort by query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;

    return allItems
      .map(item => ({
        item,
        ...fuzzyMatch(item.title, query),
      }))
      .filter(r => r.match)
      .sort((a, b) => b.score - a.score)
      .map(r => r.item);
  }, [allItems, query]);

  // Group items by type
  const groupedItems = useMemo(() => {
    const groups: { label: string; items: CommandItem[] }[] = [];

    const quickStartItems = filteredItems.filter(i => i.type === "quickstart");
    const promptItems = filteredItems.filter(i => i.type === "prompt");
    const recordingItems = filteredItems.filter(i => i.type === "recording");
    const sessionItems = filteredItems.filter(i => i.type === "session");
    const actionItems = filteredItems.filter(i => i.type === "action");

    if (quickStartItems.length) groups.push({ label: "New Sessions", items: quickStartItems });
    if (promptItems.length) groups.push({ label: "Prompts", items: promptItems });
    if (recordingItems.length) groups.push({ label: "Recordings", items: recordingItems });
    if (sessionItems.length) groups.push({ label: "Sessions", items: sessionItems });
    if (actionItems.length) groups.push({ label: "Actions", items: actionItems });

    return groups;
  }, [filteredItems]);

  const displayedItems = useMemo(() => groupedItems.flatMap((g) => g.items), [groupedItems]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [displayedItems]);

  // Focus input on open
  useLayoutEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const executeItem = useCallback((item: CommandItem) => {
    onClose();

    switch (item.type) {
      case "quickstart": {
        const preset = item.data as QuickStartPreset;
        void quickStart(preset);
        break;
      }
      case "prompt": {
        const prompt = item.data as Prompt;
        void sendPromptFromCommandPalette(prompt, "send");
        break;
      }
      case "recording": {
        const recording = item.data as RecordingIndexEntry;
        void openReplay(recording.recordingId, "step");
        break;
      }
      case "session": {
        const session = item.data as { id: string };
        setActiveId(session.id);
        break;
      }
      case "action": {
        switch (item.id) {
          case "action-new-session":
            setNewOpen(true);
            break;
          case "action-ssh-connect":
            setSshManagerOpen(true);
            break;
          case "action-new-prompt":
            openPromptEditor();
            break;
          case "action-start-recording":
            if (activeSessionId) openRecordPrompt(activeSessionId);
            break;
          case "action-stop-recording":
            if (activeSessionId) void stopRecording(activeSessionId);
            break;
          case "action-open-prompts":
            setSlidePanelTab("prompts");
            setSlidePanelOpen(true);
            break;
          case "action-open-recordings":
            void refreshRecordings();
            setSlidePanelTab("recordings");
            setSlidePanelOpen(true);
            break;
          case "action-open-assets":
            setSlidePanelTab("assets");
            setSlidePanelOpen(true);
            break;
          case "action-secure-storage":
            openSecureStorageSettings();
            break;
        }
        break;
      }
    }
  }, [
    onClose, quickStart, sendPromptFromCommandPalette, openReplay,
    setActiveId, setNewOpen, setSshManagerOpen, openPromptEditor,
    openRecordPrompt, stopRecording, setSlidePanelTab, setSlidePanelOpen,
    refreshRecordings, openSecureStorageSettings, activeSessionId,
  ]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, displayedItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (displayedItems[selectedIndex]) {
          executeItem(displayedItems[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          const pinnedIndex = parseInt(e.key) - 1;
          const pinnedPrompts = prompts.filter(p => p.pinned).sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
          if (pinnedPrompts[pinnedIndex]) {
            onClose();
            void sendPromptFromCommandPalette(pinnedPrompts[pinnedIndex], "send");
          }
        }
        break;
    }
  }, [displayedItems, selectedIndex, executeItem, onClose, prompts, sendPromptFromCommandPalette]);

  if (!isOpen) return null;

  const getIcon = (item: CommandItem): React.ReactNode => {
    switch (item.icon) {
      case "star": return "\u2605";
      case "recording": return <Icon name="record" />;
      case "plus": return <Icon name="plus" />;
      case "panel": return <Icon name="panel" />;
      case "settings": return <Icon name="settings" />;
      case "active": return "\u25CF";
      case "session": return "\u25CB";
      case "ssh": return <Icon name="ssh" />;
      default: return "\u25CB";
    }
  };

  let flatIndex = 0;

  return (
    <div className="commandPaletteBackdrop" onClick={onClose}>
      <div className="commandPalette" onClick={e => e.stopPropagation()}>
        <div className="commandPaletteSearch">
          <span className="commandPaletteSearchIcon">&gt;</span>
          <input
            ref={inputRef}
            className="commandPaletteInput"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search prompts, recordings, sessions..."
          />
        </div>
        <div className="commandPaletteList" ref={listRef}>
          {groupedItems.length === 0 && (
            <div className="commandPaletteEmpty">No results found</div>
          )}
          {groupedItems.map(group => (
            <div key={group.label} className="commandPaletteGroup">
              <div className="commandPaletteGroupLabel">{group.label}</div>
              {group.items.map(item => {
                const isSelected = flatIndex === selectedIndex;
                const currentIndex = flatIndex;
                flatIndex++;
                return (
                  <div
                    key={item.id}
                    className={`commandPaletteItem ${isSelected ? "commandPaletteItemSelected" : ""}`}
                    data-selected={isSelected}
                    onClick={() => executeItem(item)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                  >
                    <span className={`commandPaletteItemIcon ${item.icon === "star" ? "iconPinned" : ""} ${item.icon === "recording" ? "iconRecording" : ""} ${item.icon === "active" ? "iconActive" : ""}`}>
                      {item.iconSrc ? (
                        <img
                          className="commandPaletteItemIconImg"
                          src={item.iconSrc}
                          alt=""
                          aria-hidden="true"
                        />
                      ) : (
                        getIcon(item)
                      )}
                    </span>
                    <div className="commandPaletteItemContent">
                      <div className="commandPaletteItemTitle">{item.title}</div>
                      {item.subtitle && (
                        <div className="commandPaletteItemSubtitle">{item.subtitle}</div>
                      )}
                    </div>
                    {item.shortcut && (
                      <span className="commandPaletteItemShortcut">
                        {`\u2318${item.shortcut}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="commandPaletteFooter">
          <span className="commandPaletteHint">
            <kbd>↑</kbd><kbd>↓</kbd> navigate
            <kbd>↵</kbd> select
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
