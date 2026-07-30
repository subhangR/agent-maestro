import React from "react";
import { normalizeSmartQuotes } from "../../app/utils/string";
import { SecureStorageMode } from "../../app/types/app-state";

interface StartRecordingModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionName: string;
    sessionId: string | null;
    name: string;
    onChangeName: (name: string) => void;
    onStart: () => void;
    nameInputRef: React.RefObject<HTMLInputElement>;
    secureStorageMode: SecureStorageMode | null;
}

export function StartRecordingModal({
    isOpen,
    onClose,
    sessionId,
    name,
    onChangeName,
    onStart,
    nameInputRef,
    secureStorageMode,
}: StartRecordingModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modalBackdrop" onClick={onClose}>
            <div className="modal pnLeakSkin" onClick={(e) => e.stopPropagation()}>
                <h3 className="modalTitle">Start recording</h3>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = name.trim();
                        if (!sessionId || !trimmed) return;
                        onStart();
                        onClose();
                    }}
                >
                    <div className="formRow">
                        <div className="label">Name</div>
                        <input
                            ref={nameInputRef}
                            className="input"
                            value={name}
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            onChange={(e) => onChangeName(normalizeSmartQuotes(e.target.value))}
                            placeholder="e.g. Fix failing tests"
                        />
                        <div className="hint" style={{ marginTop: 0 }}>
                            Records only your input (may include secrets).
                            {secureStorageMode === "keychain"
                                ? " Stored encrypted at rest (key in macOS Keychain)."
                                : " Stored unencrypted on disk (secure storage disabled)."}
                        </div>
                    </div>
                    <div className="modalActions">
                        <button type="button" className="pn-btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="pn-btn pn-btn--primary"
                            disabled={!sessionId || !name.trim()}
                        >
                            Start
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
