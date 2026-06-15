import { create } from "zustand";

// Local-only categorization for project docs/drawings.
// Status is keyed by DocEntry.id and persisted to localStorage (per-machine).
// Absence of an entry means "open" — so freshly created docs (by user or agent)
// surface in the Open tab automatically until explicitly marked done or closed.
export type DocStatus = "open" | "done" | "closed";

const STORAGE_KEY = "maestro-doc-status-v1";

function load(): Record<string, DocStatus> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, DocStatus>;
    }
    return {};
  } catch {
    return {};
  }
}

function persist(map: Record<string, DocStatus>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

interface DocStatusState {
  statuses: Record<string, DocStatus>;
  getStatus: (docId: string) => DocStatus;
  setStatus: (docId: string, status: DocStatus) => void;
  toggleDone: (docId: string) => void;
}

export const useDocStatusStore = create<DocStatusState>((set, get) => ({
  statuses: load(),

  getStatus: (docId) => get().statuses[docId] ?? "open",

  setStatus: (docId, status) =>
    set((s) => {
      const next = { ...s.statuses, [docId]: status };
      persist(next);
      return { statuses: next };
    }),

  toggleDone: (docId) => {
    const current = get().statuses[docId] ?? "open";
    get().setStatus(docId, current === "done" ? "open" : "done");
  },
}));
