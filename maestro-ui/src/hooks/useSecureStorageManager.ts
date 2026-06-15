import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../platform";
import {
    SecureStorageMode,
    PersistedStateV1,
    Prompt,
    AssetTemplate,
    AssetSettings,
} from "../app/types/app-state";
import { PersistedTerminalSession, TerminalSession } from "../app/types/session";
import { EnvironmentConfig } from "../app/types/app";
import { MaestroProject } from "../app/types/maestro";
import { formatError } from "../utils/formatters";

interface UseSecureStorageManagerProps {
    projects: MaestroProject[];
    activeProjectId: string;
    sessions: TerminalSession[];
    activeSessionByProject: Record<string, string>;
    prompts: Prompt[];
    environments: EnvironmentConfig[];
    setEnvironments: (envs: EnvironmentConfig[]) => void;
    assets: AssetTemplate[];
    assetSettings: AssetSettings;
    agentShortcutIds: string[];
    showNotice: (msg: string, duration?: number) => void;
    reportError: (msg: string, err: unknown) => void;
    hydrated: boolean;
}

export function useSecureStorageManager({
    projects,
    activeProjectId,
    sessions,
    activeSessionByProject,
    prompts,
    environments,
    setEnvironments,
    assets,
    assetSettings,
    agentShortcutIds,
    showNotice,
    reportError,
    hydrated
}: UseSecureStorageManagerProps) {
    const [persistenceDisabledReason, setPersistenceDisabledReason] = useState<string | null>(null);
    const [secureStorageMode, setSecureStorageMode] = useState<SecureStorageMode | null>(null);
    const [secureStorageSettingsOpen, setSecureStorageSettingsOpen] = useState(false);
    const [secureStorageSettingsMode, setSecureStorageSettingsMode] =
        useState<SecureStorageMode>("keychain");
    const [secureStorageSettingsBusy, setSecureStorageSettingsBusy] = useState(false);
    const [secureStorageSettingsError, setSecureStorageSettingsError] = useState<string | null>(null);
    const [secureStorageRetrying, setSecureStorageRetrying] = useState(false);

    const secureStoragePromptedRef = useRef(false);
    const sessionsRef = useRef(sessions);

    // Keep sessionsRef updated for async callbacks
    useEffect(() => {
        sessionsRef.current = sessions;
    }, [sessions]);

    function openSecureStorageSettings() {
        setSecureStorageSettingsError(null);
        setSecureStorageSettingsMode(secureStorageMode ?? "keychain");
        setSecureStorageSettingsOpen(true);
    }

    function closeSecureStorageSettings() {
        if (secureStorageSettingsBusy) return;
        setSecureStorageSettingsOpen(false);
        setSecureStorageSettingsError(null);
    }

    async function applySecureStorageSettings() {
        if (secureStorageSettingsBusy) return;
        setSecureStorageSettingsError(null);

        const nextMode = secureStorageSettingsMode;
        if (nextMode === secureStorageMode) {
            setSecureStorageSettingsOpen(false);
            return;
        }

        if (!IS_TAURI) {
            setSecureStorageMode("plaintext");
            setPersistenceDisabledReason(null);
            setSecureStorageSettingsOpen(false);
            showNotice("Running in browser — secure storage is not available; state stored in memory only.", 8000);
            return;
        }

        const persistedSessions: PersistedTerminalSession[] = sessionsRef.current
            .filter((s) => !s.closing)
            .map((s) => ({
                persistId: s.persistId,
                projectId: s.projectId,
                name: s.name,
                launchCommand: s.launchCommand,
                restoreCommand: s.restoreCommand ?? null,
                sshTarget: s.sshTarget ?? null,
                sshRootDir: s.sshRootDir ?? null,
                lastRecordingId: s.lastRecordingId ?? null,
                cwd: s.cwd,
                persistent: s.persistent,
                createdAt: s.createdAt,
            }))
            .sort((a, b) => a.createdAt - b.createdAt);

        const state: PersistedStateV1 = {
            schemaVersion: 1,
            secureStorageMode: nextMode,
            projects,
            activeProjectId,
            sessions: persistedSessions,
            activeSessionByProject,
            prompts,
            environments,
            assets,
            assetSettings,
            agentShortcutIds,
        };

        if (nextMode === "plaintext") {
            setSecureStorageMode("plaintext");
            setPersistenceDisabledReason(null);
            try {
                await invoke("save_persisted_state", { state });
            } catch (err) {
                reportError("Failed to save state", err);
            }
            setSecureStorageSettingsOpen(false);
            showNotice(
                "Secure storage disabled: environments + recordings will be stored unencrypted on disk.",
                12000,
            );
            return;
        }

        setSecureStorageSettingsBusy(true);
        showNotice(
            "macOS Keychain access is needed to enable encryption. You may see 1–2 prompts; choose “Always Allow” to avoid future prompts.",
            20000,
        );
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

        try {
            await invoke("reset_secure_storage");
            await invoke("prepare_secure_storage");

            await invoke("save_persisted_state", { state });
            setSecureStorageMode("keychain");
            setPersistenceDisabledReason(null);

            const refreshed = await invoke<PersistedStateV1 | null>("load_persisted_state").catch(() => null);
            if (refreshed?.schemaVersion === 1) {
                setEnvironments(refreshed.environments ?? []);
            }

            setSecureStorageSettingsOpen(false);
            showNotice(
                "Secure storage enabled: environments + recording inputs are encrypted at rest (key stored in macOS Keychain).",
                10000,
            );
        } catch (err) {
            setSecureStorageSettingsError(formatError(err));
        } finally {
            setSecureStorageSettingsBusy(false);
        }
    }

    async function retrySecureStorage() {
        if (!IS_TAURI) return;
        if (secureStorageRetrying) return;
        setSecureStorageRetrying(true);
        showNotice(
            "macOS Keychain access is needed to decrypt/encrypt your environments + recordings. Choose “Always Allow” to avoid future prompts.",
            20000,
        );
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        try {
            await invoke("reset_secure_storage");
            await invoke("prepare_secure_storage");
            setPersistenceDisabledReason(null);

            const refreshed = await invoke<PersistedStateV1 | null>("load_persisted_state").catch(() => null);
            if (refreshed?.schemaVersion === 1) {
                setEnvironments(refreshed.environments ?? []);
            }

            showNotice("Secure storage unlocked.", 7000);
        } catch (err) {
            setPersistenceDisabledReason(`Secure storage is locked (changes won’t be saved): ${formatError(err)}`);
        } finally {
            setSecureStorageRetrying(false);
        }
    }

    // Initial prompt effect
    useEffect(() => {
        if (!IS_TAURI) {
            setSecureStorageMode("plaintext");
            setPersistenceDisabledReason(null);
            return;
        }
        if (!hydrated) return;
        if (secureStoragePromptedRef.current) return;
        if (secureStorageMode !== null) return;
        secureStoragePromptedRef.current = true;
        setSecureStorageSettingsError(null);
        setSecureStorageSettingsMode("keychain");
        setSecureStorageSettingsOpen(true);
    }, [hydrated, secureStorageMode]);

    return {
        secureStorageMode,
        setSecureStorageMode,
        secureStorageSettingsOpen,
        setSecureStorageSettingsOpen,
        secureStorageSettingsMode,
        setSecureStorageSettingsMode,
        secureStorageSettingsBusy,
        secureStorageSettingsError,
        setSecureStorageSettingsError,
        secureStorageRetrying,
        persistenceDisabledReason,
        setPersistenceDisabledReason,
        openSecureStorageSettings,
        closeSecureStorageSettings,
        applySecureStorageSettings,
        retrySecureStorage,
    };
}
