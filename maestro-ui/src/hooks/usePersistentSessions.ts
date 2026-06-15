import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../platform";
import { formatError } from "../utils/formatters";
import { closeSession } from "../services/sessionService";
import type { PersistentSessionsModalItem } from "../components/modals/PersistentSessionsModal";
import type { PersistentSessionInfo } from "../app/types/app-state";
import type { MaestroProject } from "../app/types/maestro";
import type { TerminalSession } from "../app/types/session";

interface UsePersistentSessionsProps {
    projects: MaestroProject[];
    sessions: TerminalSession[];
    setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>;
    setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
    showNotice: (message: string, timeoutMs?: number) => void;
    reportError: (prefix: string, err: unknown) => void;
}

export function usePersistentSessions({
    projects,
    sessions,
    setSessions,
    setActiveId,
    showNotice,
    reportError,
}: UsePersistentSessionsProps) {
    const [persistentSessionsOpen, setPersistentSessionsOpen] = useState(false);
    const [manageTerminalsOpen, setManageTerminalsOpen] = useState(false);
    const [persistentSessionsLoading, setPersistentSessionsLoading] = useState(false);
    const [persistentSessionsError, setPersistentSessionsError] = useState<string | null>(null);
    const [persistentSessions, setPersistentSessions] = useState<PersistentSessionInfo[]>([]);
    const [confirmKillPersistentId, setConfirmKillPersistentId] = useState<string | null>(null);
    const [confirmKillPersistentBusy, setConfirmKillPersistentBusy] = useState(false);

    // Memoized list of persistent session items for the modal
    const persistentSessionItems = useMemo<PersistentSessionsModalItem[]>(() => {
        if (!persistentSessions.length) return [];
        const projectTitleById = new Map(projects.map((p) => [p.id, p.name]));
        const out: PersistentSessionsModalItem[] = [];

        for (const ps of persistentSessions) {
            const activeSession =
                sessions.find((s) => s.persistId === ps.persistId && !s.exited && !s.closing) ?? null;
            const openInUi = Boolean(activeSession);
            const projectTitle = activeSession ? projectTitleById.get(activeSession.projectId) ?? null : null;
            const label = activeSession
                ? projectTitle
                    ? `${activeSession.name} — ${projectTitle}`
                    : activeSession.name
                : ps.sessionName;
            out.push({
                persistId: ps.persistId,
                sessionName: ps.sessionName,
                label,
                openInUi,
            });
        }

        out.sort((a, b) => {
            if (a.openInUi !== b.openInUi) return a.openInUi ? -1 : 1;
            return a.persistId.localeCompare(b.persistId);
        });
        return out;
    }, [persistentSessions, projects, sessions]);

    // Fetch persistent sessions from backend
    const refreshPersistentSessions = useCallback(async () => {
        if (!IS_TAURI) {
            setPersistentSessions([]);
            setPersistentSessionsLoading(false);
            setPersistentSessionsError(null);
            return;
        }
        setPersistentSessionsLoading(true);
        setPersistentSessionsError(null);
        try {
            const list = await invoke<PersistentSessionInfo[]>("list_persistent_sessions");
            setPersistentSessions(list);
        } catch (err) {
            setPersistentSessionsError(formatError(err));
        } finally {
            setPersistentSessionsLoading(false);
        }
    }, []);

    function requestKillPersistent(id: string) {
        setConfirmKillPersistentId(id);
    }

    // Kill a persistent session
    const confirmKillPersistentSession = useCallback(async () => {
        const persistId = confirmKillPersistentId;
        if (!persistId) return;
        setConfirmKillPersistentBusy(true);
        try {
            // Close any open UI tabs for this session first
            const toClose = sessions.filter((s) => s.persistId === persistId).map((s) => s.id);
            await Promise.all(toClose.map((id) => closeSession(id).catch(() => { })));

            // Kill backend session (Tauri only)
            if (IS_TAURI) await invoke("kill_persistent_session", { persistId });

            // Update local state
            setSessions((prev) => prev.filter((s) => s.persistId !== persistId));
            setActiveId((prevActive) => {
                if (!prevActive) return prevActive;
                // Check if the previously active session ID is among those we just closed
                if (toClose.includes(prevActive)) return null;
                return prevActive;
            });

            showNotice(`Killed persistent session ${persistId.slice(0, 8)}`);
            void refreshPersistentSessions();
        } catch (err) {
            reportError("Failed to kill persistent session", err);
        } finally {
            setConfirmKillPersistentBusy(false);
            setConfirmKillPersistentId(null);
        }
    }, [confirmKillPersistentId, sessions, refreshPersistentSessions, setSessions, setActiveId, showNotice, reportError]);

    const closePersistentSessionsModal = useCallback(() => {
        if (confirmKillPersistentBusy) return;
        setPersistentSessionsOpen(false);
        setPersistentSessionsError(null);
    }, [confirmKillPersistentBusy]);

    return {
        persistentSessionsOpen,
        setPersistentSessionsOpen,
        manageTerminalsOpen,
        setManageTerminalsOpen,
        persistentSessionsLoading,
        persistentSessionsError,
        persistentSessions,
        confirmKillPersistentId,
        setConfirmKillPersistentId,
        confirmKillPersistentBusy,
        persistentSessionItems,
        refreshPersistentSessions,
        requestKillPersistent,
        confirmKillPersistentSession,
        closePersistentSessionsModal
    };
}
