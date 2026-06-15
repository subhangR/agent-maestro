import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { IS_TAURI } from '../platform';
import { LoadedRecording, RecordingIndexEntry } from '../app/types/recording';
import { makeId } from '../app/utils/id';
import { getProcessEffectById } from '../processEffects';
import {
  formatError,
  sanitizeRecordedInputForReplay,
  splitRecordingIntoSteps,
} from '../utils/formatters';
import { useSessionStore } from './useSessionStore';
import { useUIStore } from './useUIStore';
import { useSecureStorageStore } from './useSecureStorageStore';

/* ------------------------------------------------------------------ */
/*  Store interface                                                     */
/* ------------------------------------------------------------------ */

interface RecordingState {
  // Replay state
  replayOpen: boolean;
  replayLoading: boolean;
  replayError: string | null;
  replayRecording: LoadedRecording | null;
  replaySteps: string[];
  replayIndex: number;
  replayTargetSessionId: string | null;
  replayShowAll: boolean;
  replayFlowExpanded: Record<string, boolean>;

  // Record prompt state
  recordPromptOpen: boolean;
  recordPromptName: string;
  recordPromptSessionId: string | null;

  // Recordings list state
  recordingsOpen: boolean;
  recordingsLoading: boolean;
  recordingsError: string | null;
  recordings: RecordingIndexEntry[];

  // Confirm delete
  confirmDeleteRecordingId: string | null;

  // Setters
  setReplayOpen: (open: boolean) => void;
  setReplayLoading: (loading: boolean) => void;
  setReplayError: (error: string | null) => void;
  setReplayRecording: (recording: LoadedRecording | null) => void;
  setReplaySteps: (steps: string[]) => void;
  setReplayIndex: (index: number | ((prev: number) => number)) => void;
  setReplayTargetSessionId: (id: string | null) => void;
  setReplayShowAll: (showAll: boolean) => void;
  setReplayFlowExpanded: (
    expanded: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => void;
  setRecordPromptOpen: (open: boolean) => void;
  setRecordPromptName: (name: string) => void;
  setRecordPromptSessionId: (id: string | null) => void;
  setRecordingsOpen: (open: boolean) => void;
  setRecordingsLoading: (loading: boolean) => void;
  setRecordingsError: (error: string | null) => void;
  setRecordings: (recordings: RecordingIndexEntry[] | ((prev: RecordingIndexEntry[]) => RecordingIndexEntry[])) => void;
  setConfirmDeleteRecordingId: (id: string | null) => void;

  // Derived
  getReplayFlow: () => ReplayFlowGroup[];

  // Actions
  refreshRecordings: () => Promise<void>;
  openRecordPrompt: (sessionId: string) => void;
  closeRecordPrompt: () => void;
  startRecording: (sessionId: string, name: string) => Promise<void>;
  stopRecording: (sessionId: string) => Promise<void>;
  closeReplayModal: () => void;
  openReplay: (recordingId: string, mode?: 'step' | 'all') => Promise<void>;
  openReplayForActive: () => Promise<void>;
  requestDeleteRecording: (recordingId: string) => void;
  deleteRecording: (recordingId: string) => Promise<void>;
}

export type ReplayFlowGroup = {
  key: string;
  t: number;
  startIndex: number;
  endIndex: number;
  preview: string;
  items: Array<{ index: number; text: string }>;
};

/* ------------------------------------------------------------------ */
/*  Store creation                                                      */
/* ------------------------------------------------------------------ */

export const useRecordingStore = create<RecordingState>((set, get) => ({
  // Replay state
  replayOpen: false,
  replayLoading: false,
  replayError: null,
  replayRecording: null,
  replaySteps: [],
  replayIndex: 0,
  replayTargetSessionId: null,
  replayShowAll: false,
  replayFlowExpanded: {},

  // Record prompt state
  recordPromptOpen: false,
  recordPromptName: '',
  recordPromptSessionId: null,

  // Recordings list state
  recordingsOpen: false,
  recordingsLoading: false,
  recordingsError: null,
  recordings: [],

  // Confirm delete
  confirmDeleteRecordingId: null,

  /* ---------------------------------------------------------------- */
  /*  Setters                                                          */
  /* ---------------------------------------------------------------- */

  setReplayOpen: (open) => set({ replayOpen: open }),
  setReplayLoading: (loading) => set({ replayLoading: loading }),
  setReplayError: (error) => set({ replayError: error }),
  setReplayRecording: (recording) => set({ replayRecording: recording }),
  setReplaySteps: (steps) => set({ replaySteps: steps }),
  setReplayIndex: (index) =>
    set((s) => ({
      replayIndex: typeof index === 'function' ? index(s.replayIndex) : index,
    })),
  setReplayTargetSessionId: (id) => set({ replayTargetSessionId: id }),
  setReplayShowAll: (showAll) => set({ replayShowAll: showAll }),
  setReplayFlowExpanded: (expanded) =>
    set((s) => ({
      replayFlowExpanded:
        typeof expanded === 'function'
          ? expanded(s.replayFlowExpanded)
          : expanded,
    })),
  setRecordPromptOpen: (open) => set({ recordPromptOpen: open }),
  setRecordPromptName: (name) => set({ recordPromptName: name }),
  setRecordPromptSessionId: (id) => set({ recordPromptSessionId: id }),
  setRecordingsOpen: (open) => set({ recordingsOpen: open }),
  setRecordingsLoading: (loading) => set({ recordingsLoading: loading }),
  setRecordingsError: (error) => set({ recordingsError: error }),
  setRecordings: (recordings) =>
    set((s) => ({
      recordings:
        typeof recordings === 'function'
          ? recordings(s.recordings)
          : recordings,
    })),
  setConfirmDeleteRecordingId: (id) => set({ confirmDeleteRecordingId: id }),

  /* ---------------------------------------------------------------- */
  /*  Derived                                                          */
  /* ---------------------------------------------------------------- */

  getReplayFlow: () => {
    const rec = get().replayRecording;
    if (!rec) return [];
    const events = rec.events ?? [];
    if (!events.length) return [];

    const groups: ReplayFlowGroup[] = [];
    let groupIndex = -1;
    let currentT: number | null = null;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const clean = sanitizeRecordedInputForReplay(ev.data ?? '');
      const text = clean.replace(/[\r\n]+$/, '');

      if (currentT === null || ev.t !== currentT) {
        groupIndex += 1;
        currentT = ev.t;
        groups.push({
          key: `${ev.t}-${groupIndex}`,
          t: ev.t,
          startIndex: i,
          endIndex: i,
          preview: '',
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
      group.preview = firstNonEmpty ? firstNonEmpty : '\u23CE';
    }

    return groups;
  },

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */

  refreshRecordings: async () => {
    if (!IS_TAURI) { set({ recordingsLoading: false, recordings: [] }); return; }
    set({ recordingsLoading: true, recordingsError: null });
    try {
      const list = await invoke<RecordingIndexEntry[]>('list_recordings');
      set({ recordings: list });
    } catch (err) {
      set({ recordingsError: formatError(err) });
    } finally {
      set({ recordingsLoading: false });
    }
  },

  openRecordPrompt: (sessionId) => {
    const { sessions } = useSessionStore.getState();
    const s = sessions.find((s) => s.id === sessionId);
    if (!s) return;
    const effect = getProcessEffectById(s.effectId);
    const base = effect?.label ?? s.name ?? 'recording';
    const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const defaultName = `${base} ${when}`;
    set({
      recordPromptSessionId: sessionId,
      recordPromptName: defaultName,
      recordPromptOpen: true,
    });
  },

  closeRecordPrompt: () => {
    set({
      recordPromptOpen: false,
      recordPromptSessionId: null,
      recordPromptName: '',
    });
  },

  startRecording: async (sessionId, name) => {
    if (!IS_TAURI) return;
    const { sessions, setSessions } = useSessionStore.getState();
    const { reportError } = useUIStore.getState();
    const s = sessions.find((s2) => s2.id === sessionId);
    if (!s) return;
    if (s.recordingActive) return;

    // Cross-store: get secureStorageMode
    const secureStorageMode = useSecureStorageStore.getState().secureStorageMode;

    try {
      const recordingId = makeId();
      const effect = getProcessEffectById(s.effectId);
      const bootstrapCommand =
        (s.launchCommand ?? null) ||
        (s.restoreCommand?.trim() ? s.restoreCommand.trim() : null) ||
        (effect?.matchCommands?.[0] ?? null);

      const safeId = await invoke<string>('start_session_recording', {
        id: s.id,
        recordingId,
        recordingName: name,
        encrypt: secureStorageMode === 'keychain',
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
      void get().refreshRecordings();
    } catch (err) {
      reportError('Failed to start recording', err);
    }
  },

  stopRecording: async (sessionId) => {
    if (!IS_TAURI) return;
    const { sessions, setSessions } = useSessionStore.getState();
    const { reportError } = useUIStore.getState();
    const s = sessions.find((s2) => s2.id === sessionId);
    if (!s) return;
    if (!s.recordingActive) return;

    try {
      await invoke('stop_session_recording', { id: s.id });
    } catch (err) {
      reportError('Failed to stop recording', err);
    } finally {
      setSessions((prev) =>
        prev.map((x) =>
          x.id === sessionId ? { ...x, recordingActive: false } : x,
        ),
      );
    }
  },

  closeReplayModal: () => {
    set({
      replayOpen: false,
      replayLoading: false,
      replayError: null,
      replayRecording: null,
      replaySteps: [],
      replayIndex: 0,
      replayTargetSessionId: null,
      replayShowAll: false,
      replayFlowExpanded: {},
    });
  },

  openReplay: async (recordingId, mode = 'step') => {
    set({
      replayOpen: true,
      replayLoading: true,
      replayError: null,
      replayRecording: null,
      replaySteps: [],
      replayIndex: 0,
      replayTargetSessionId: null,
      replayShowAll: mode === 'all',
      replayFlowExpanded: {},
    });
    if (!IS_TAURI) { set({ replayLoading: false, replayError: 'Replay is not available in the browser.' }); return; }

    // Cross-store: get secureStorageMode
    const secureStorageMode = useSecureStorageStore.getState().secureStorageMode;

    try {
      const rec = await invoke<LoadedRecording>('load_recording', {
        recordingId,
        decrypt: secureStorageMode === 'keychain',
      });
      set({
        replayRecording: rec,
        replaySteps: splitRecordingIntoSteps(rec.events),
      });
    } catch (err) {
      set({ replayError: formatError(err) });
    } finally {
      set({ replayLoading: false });
    }
  },

  openReplayForActive: async () => {
    const { sessions, activeId } = useSessionStore.getState();
    const activeSession = sessions.find((s) => s.id === activeId);
    if (!activeSession?.lastRecordingId) return;
    await get().openReplay(activeSession.lastRecordingId);
  },

  requestDeleteRecording: (recordingId) => {
    set({ recordingsOpen: false, confirmDeleteRecordingId: recordingId });
  },

  deleteRecording: async (recordingId) => {
    if (!IS_TAURI) return;
    const { setSessions } = useSessionStore.getState();
    const { showNotice, reportError } = useUIStore.getState();

    const { recordings, replayRecording, closeReplayModal } = get();
    const label =
      recordings.find((r) => r.recordingId === recordingId)?.meta?.name?.trim() ||
      recordingId;
    try {
      await invoke('delete_recording', { recordingId });
      set((s) => ({
        recordings: s.recordings.filter((r) => r.recordingId !== recordingId),
      }));
      setSessions((prev) =>
        prev.map((s) =>
          s.lastRecordingId === recordingId
            ? { ...s, lastRecordingId: null }
            : s,
        ),
      );
      if (replayRecording?.recordingId === recordingId) {
        closeReplayModal();
      }
      showNotice(`Deleted recording "${label}"`);
    } catch (err) {
      reportError('Failed to delete recording', err);
    }
  },
}));

// Internal type alias to avoid circular imports
type SessionLike = {
  id: string;
  projectId: string;
  persistId: string;
  name: string;
  effectId?: string | null;
  launchCommand: string | null;
  restoreCommand?: string | null;
  cwd: string | null;
  recordingActive?: boolean;
  lastRecordingId?: string | null;
};
