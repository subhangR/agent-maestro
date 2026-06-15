import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../platform";
import { TerminalSession } from "../app/types/session";
import { LoadedRecording, RecordingIndexEntry } from "../app/types/recording";
import { SecureStorageMode } from "../app/types/app-state";
import { makeId } from "../app/utils/id";
import { getProcessEffectById } from "../processEffects";
import { 
  formatError, 
  sanitizeRecordedInputForReplay, 
  splitRecordingIntoSteps 
} from "../utils/formatters";

interface UseRecordingManagerProps {
  sessions: TerminalSession[];
  setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>;
  secureStorageMode: SecureStorageMode | null;
  onError: (prefix: string, err: unknown) => void;
  showNotice: (message: string, timeoutMs?: number) => void;
  hydrated: boolean;
  activeId: string | null;
  activeProjectId: string;
}

export function useRecordingManager({
  sessions,
  setSessions,
  secureStorageMode,
  onError,
  showNotice,
  hydrated,
  activeId,
  activeProjectId,
}: UseRecordingManagerProps) {
  // --- State ---
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayRecording, setReplayRecording] = useState<LoadedRecording | null>(null);
  const [replaySteps, setReplaySteps] = useState<string[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayTargetSessionId, setReplayTargetSessionId] = useState<string | null>(null);
  const [replayShowAll, setReplayShowAll] = useState(false);
  const [replayFlowExpanded, setReplayFlowExpanded] = useState<Record<string, boolean>>({});
  
  const [recordPromptOpen, setRecordPromptOpen] = useState(false);
  const [recordPromptName, setRecordPromptName] = useState("");
  const [recordPromptSessionId, setRecordPromptSessionId] = useState<string | null>(null);
  
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingsError, setRecordingsError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<RecordingIndexEntry[]>([]);
  
  const [confirmDeleteRecordingId, setConfirmDeleteRecordingId] = useState<string | null>(null);

  // --- Refs ---
  const replayNextItemRef = useRef<HTMLDivElement | null>(null);
  const recordNameRef = useRef<HTMLInputElement | null>(null);
  
  // Maintain a ref to sessions to avoid stale closures in async functions without re-creating them constantly
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // --- Replay Flow Logic ---
  const replayFlow = useMemo(() => {
    const rec = replayRecording;
    if (!rec) return [];
    const events = rec.events ?? [];
    if (!events.length) return [];

    const groups: Array<{ 
      key: string;
      t: number;
      startIndex: number;
      endIndex: number;
      preview: string;
      items: Array<{ index: number; text: string }>;
    }> = [];

    let groupIndex = -1;
    let currentT: number | null = null;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const clean = sanitizeRecordedInputForReplay(ev.data ?? "");
      const text = clean.replace(/[\r\n]+$/, "");

      if (currentT === null || ev.t !== currentT) {
        groupIndex += 1;
        currentT = ev.t;
        groups.push({
          key: `${ev.t}-${groupIndex}`,
          t: ev.t,
          startIndex: i,
          endIndex: i,
          preview: "",
          items: [{ index: i, text }],
        });
      } else {
        const group = groups[groups.length - 1];
        group.endIndex = i;
        group.items.push({ index: i, text });
      }
    }

    for (const group of groups) {
      const firstNonEmpty = group.items.find((it) => it.text.trim())?.text.trim();
      group.preview = firstNonEmpty ? firstNonEmpty : "⏎";
    }

    return groups;
  }, [replayRecording]);

  // Auto-expand next group in replay
  useEffect(() => {
    if (!replayShowAll) return;
    if (!replayFlow.length) return;
    if (replayIndex >= replaySteps.length) return;

    const nextGroup = replayFlow.find(
      (g) => replayIndex >= g.startIndex && replayIndex <= g.endIndex,
    );
    if (!nextGroup) return;
    setReplayFlowExpanded((prev) => {
      if (prev[nextGroup.key]) return prev;
      return { ...prev, [nextGroup.key]: true };
    });
  }, [replayFlow, replayIndex, replayShowAll, replaySteps.length]);

  // Auto-scroll in replay
  useEffect(() => {
    if (!replayShowAll) return;
    const raf = window.requestAnimationFrame(() => {
      replayNextItemRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [replayShowAll, replayIndex, replayFlowExpanded]);

  // --- Actions ---

  const refreshRecordings = useCallback(async () => {
    if (!IS_TAURI) { setRecordingsLoading(false); setRecordingsError(null); return; }
    setRecordingsLoading(true);
    setRecordingsError(null);
    try {
      const list = await invoke<RecordingIndexEntry[]>("list_recordings");
      setRecordings(list);
    } catch (err) {
      setRecordingsError(formatError(err));
    } finally {
      setRecordingsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!hydrated) return;
    void refreshRecordings();
  }, [hydrated, refreshRecordings]);

  function defaultRecordingName(s: TerminalSession): string {
    const effect = getProcessEffectById(s.effectId);
    const base = effect?.label ?? s.name ?? "recording";
    const when = new Date().toISOString().slice(0, 16).replace("T", " ");
    return `${base} ${when}`;
  }

  function openRecordPrompt(sessionId: string) {
    const s = sessionsRef.current.find((s) => s.id === sessionId);
    if (!s) return;
    setRecordPromptSessionId(sessionId);
    setRecordPromptName(defaultRecordingName(s));
    setRecordPromptOpen(true);
    window.setTimeout(() => recordNameRef.current?.focus(), 0);
  }

  function closeRecordPrompt() {
    setRecordPromptOpen(false);
    setRecordPromptSessionId(null);
    setRecordPromptName("");
  }

  async function startRecording(sessionId: string, name: string) {
    if (!IS_TAURI) return;
    const s = sessionsRef.current.find((s) => s.id === sessionId);
    if (!s) return;
    if (s.recordingActive) return;

    try {
      const recordingId = makeId();
      const effect = getProcessEffectById(s.effectId);
      const bootstrapCommand =
        (s.launchCommand ?? null) ||
        (s.restoreCommand?.trim() ? s.restoreCommand.trim() : null) ||
        (effect?.matchCommands?.[0] ?? null);
      
      const safeId = await invoke<string>("start_session_recording", {
        id: s.id,
        recordingId,
        recordingName: name,
        encrypt: secureStorageMode === "keychain",
        projectId: s.projectId,
        sessionPersistId: s.persistId,
        cwd: s.cwd,
        effectId: s.effectId ?? null,
        bootstrapCommand,
      });

      setSessions((prev) =>
        prev.map((x) =>
          x.id === sessionId
            ? { ...x, recordingActive: true, lastRecordingId: safeId }
            : x,
        ),
      );
      void refreshRecordings();
    } catch (err) {
      onError("Failed to start recording", err);
    }
  }

  async function stopRecording(sessionId: string) {
    if (!IS_TAURI) return;
    const s = sessionsRef.current.find((s) => s.id === sessionId);
    if (!s) return;
    if (!s.recordingActive) return;

    try {
      await invoke("stop_session_recording", { id: s.id });
    } catch (err) {
      onError("Failed to stop recording", err);
    } finally {
      setSessions((prev) =>
        prev.map((x) => (x.id === sessionId ? { ...x, recordingActive: false } : x)),
      );
    }
  }

  function closeReplayModal() {
    setReplayOpen(false);
    setReplayLoading(false);
    setReplayError(null);
    setReplayRecording(null);
    setReplaySteps([]);
    setReplayIndex(0);
    setReplayTargetSessionId(null);
    setReplayShowAll(false);
    setReplayFlowExpanded({});
  }

  async function openReplay(recordingId: string, mode: "step" | "all" = "step") {
    setReplayOpen(true);
    setReplayLoading(true);
    setReplayError(null);
    setReplayRecording(null);
    setReplaySteps([]);
    setReplayIndex(0);
    setReplayTargetSessionId(null);
    setReplayShowAll(mode === "all");
    setReplayFlowExpanded({});
    if (!IS_TAURI) { setReplayLoading(false); setReplayError("Replay is not available in the browser."); return; }

    try {
      const rec = await invoke<LoadedRecording>("load_recording", {
        recordingId,
        decrypt: secureStorageMode === "keychain",
      });
      setReplayRecording(rec);
      setReplaySteps(splitRecordingIntoSteps(rec.events));
    } catch (err) {
      setReplayError(formatError(err));
    } finally {
      setReplayLoading(false);
    }
  }

  async function openReplayForActive() {
    const activeSession = sessionsRef.current.find(s => s.id === activeId);
    if (!activeSession?.lastRecordingId) return;
    await openReplay(activeSession.lastRecordingId);
  }

  function requestDeleteRecording(recordingId: string) {
    setRecordingsOpen(false);
    setConfirmDeleteRecordingId(recordingId);
  }

  async function deleteRecording(recordingId: string) {
    if (!IS_TAURI) return;
    const label =
      recordings.find((r) => r.recordingId === recordingId)?.meta?.name?.trim() || recordingId;
    try {
      await invoke("delete_recording", { recordingId });
      setRecordings((prev) => prev.filter((r) => r.recordingId !== recordingId));
      setSessions((prev) =>
        prev.map((s) =>
          s.lastRecordingId === recordingId ? { ...s, lastRecordingId: null } : s,
        ),
      );
      if (replayRecording?.recordingId === recordingId) {
        closeReplayModal();
      }
      showNotice(`Deleted recording "${label}"`);
    } catch (err) {
      onError("Failed to delete recording", err);
    }
  }

  return {
    // State
    replayOpen, setReplayOpen,
    replayLoading,
    replayError,
    replayRecording,
    replaySteps,
    replayIndex, setReplayIndex,
    replayTargetSessionId, setReplayTargetSessionId,
    replayShowAll, setReplayShowAll,
    replayFlowExpanded, setReplayFlowExpanded,
    recordPromptOpen, setRecordPromptOpen,
    recordPromptName, setRecordPromptName,
    recordPromptSessionId, setRecordPromptSessionId,
    recordingsOpen, setRecordingsOpen,
    recordingsLoading,
    recordingsError,
    recordings, setRecordings,
    confirmDeleteRecordingId, setConfirmDeleteRecordingId,
    
    // Refs
    replayNextItemRef,
    recordNameRef,

    // Data
    replayFlow,

    // Actions
    refreshRecordings,
    openRecordPrompt,
    closeRecordPrompt,
    startRecording,
    stopRecording,
    closeReplayModal,
    openReplay,
    openReplayForActive,
    requestDeleteRecording,
    deleteRecording,
  };
}
