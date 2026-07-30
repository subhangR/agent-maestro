import React from "react";
import { SecureStorageMode } from "../../app/types/app-state";
import { EnvironmentConfig } from "../../app/types/app";

interface SecureStorageModalProps {
    isOpen: boolean;
    onClose: () => void;
    error: string | null;
    mode: SecureStorageMode | null; // Current mode
    settingsMode: SecureStorageMode; // Selected mode in modal
    onSettingsModeChange: (mode: SecureStorageMode) => void;
    busy: boolean;
    onApply: () => void;
    environments: EnvironmentConfig[];
}

export function SecureStorageModal({
    isOpen,
    onClose,
    error,
    mode,
    settingsMode,
    onSettingsModeChange,
    busy,
    onApply,
    environments,
}: SecureStorageModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className="modalBackdrop modalBackdropTop"
            onClick={() => {
                if (busy) return;
                onClose();
            }}
        >
            <div className="modal pnLeakSkin" onClick={(e) => e.stopPropagation()}>
                <h3 className="modalTitle">Secure storage</h3>

                {error && (
                    <div className="pathPickerError" role="alert">
                        {error}
                    </div>
                )}

                <div className="hint" style={{ marginTop: 0 }}>
                    Agent Maestro stores environment configs and recording inputs on disk. Choose whether to encrypt them on this Mac.
                </div>

                <div className="formRow">
                    <div className="label">Encryption</div>
                    <label className="checkRow">
                        <input
                            type="radio"
                            name="secureStorageMode"
                            checked={settingsMode === "keychain"}
                            onChange={() => onSettingsModeChange("keychain")}
                            disabled={busy}
                        />
                        Encrypt with macOS Keychain (recommended)
                    </label>
                    <div className="hint" style={{ marginTop: 0 }}>
                        Stores a master key in macOS Keychain; you may see 1–2 system prompts when enabling for the first time.
                    </div>

                    <label className="checkRow" style={{ marginTop: 10 }}>
                        <input
                            type="radio"
                            name="secureStorageMode"
                            checked={settingsMode === "plaintext"}
                            onChange={() => onSettingsModeChange("plaintext")}
                            disabled={busy}
                        />
                        Store unencrypted (no Keychain prompts)
                    </label>
                    <div className="hint" style={{ marginTop: 0 }}>
                        Environments and recordings are stored in plaintext in the app data directory. Anyone with access to your account can read them.
                    </div>
                </div>

                {settingsMode !== "keychain" &&
                    environments.some((e) => (e.content ?? "").trimStart().startsWith("enc:v1:")) && (
                        <div className="pathPickerError" role="alert">
                            Some environments are currently encrypted and will remain locked until Keychain encryption is enabled.
                        </div>
                    )}

                <div className="modalActions">
                    <button
                        type="button"
                        className="pn-btn"
                        onClick={onClose}
                        disabled={busy}
                    >
                        {mode === null ? "Not now" : "Cancel"}
                    </button>
                    <button
                        type="button"
                        className="pn-btn pn-btn--primary"
                        onClick={() => onApply()}
                        disabled={busy}
                    >
                        {busy ? "Working…" : mode === null ? "Continue" : "Apply"}
                    </button>
                </div>
            </div>
        </div>
    );
}
