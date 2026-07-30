import React from "react";
import { getProcessEffectById } from "../../processEffects";
import { shortenPathSmart } from "../../pathDisplay";
import { RecordingIndexEntry } from "../../app/types/recording";
import { MaestroProject } from "../../utils/MaestroClient";


interface RecordingsListModalProps {
    isOpen: boolean;
    onClose: () => void;
    recordings: RecordingIndexEntry[];
    loading: boolean;
    error: string | null;
    projects: MaestroProject[];
    onRefresh: () => void;
    onDelete: (id: string) => void;
    onOpenReplay: (id: string, mode: "step" | "all") => void;
}

export function RecordingsListModal({
    isOpen,
    onClose,
    recordings,
    loading,
    error,
    projects,
    onRefresh,
    onDelete,
    onOpenReplay,
}: RecordingsListModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modalBackdrop" onClick={onClose}>
            <div className="modal recordingsModal pnLeakSkin" onClick={(e) => e.stopPropagation()}>
                <h3 className="modalTitle">Recordings</h3>

                {error && (
                    <div className="pathPickerError" role="alert">
                        {error}
                    </div>
                )}

                <div className="recordingsList">
                    {loading ? (
                        <div className="empty">Loading…</div>
                    ) : recordings.length === 0 ? (
                        <div className="empty">No recordings yet.</div>
                    ) : (
                        recordings.map((r) => {
                            const meta = r.meta;
                            const displayName = meta?.name?.trim() || r.recordingId;
                            const projectTitle =
                                (meta?.projectId
                                    ? projects.find((p) => p.id === meta.projectId)?.name
                                    : null) ?? "Unknown project";
                            const effectLabel = getProcessEffectById(meta?.effectId)?.label ?? null;
                            const when = meta?.createdAt ? new Date(meta.createdAt).toLocaleString() : null;
                            const cwd = meta?.cwd ? shortenPathSmart(meta.cwd, 52) : null;
                            return (
                                <div key={r.recordingId} className="recordingItem">
                                    <div className="recordingMain">
                                        <div className="recordingName" title={displayName}>
                                            {displayName}
                                        </div>
                                        <div className="recordingMeta">
                                            {[when, projectTitle, effectLabel, cwd].filter(Boolean).join(" • ")}
                                        </div>
                                    </div>
                                    <div className="recordingActions">
                                        <button
                                            type="button"
                                            className="pn-btn pn-btn--sm"
                                            onClick={() => {
                                                onClose();
                                                onOpenReplay(r.recordingId, "step");
                                            }}
                                            title="View / replay"
                                        >
                                            Open
                                        </button>
                                        <button
                                            type="button"
                                            className="pn-btn pn-btn--sm"
                                            onClick={() => {
                                                onClose();
                                                onOpenReplay(r.recordingId, "all");
                                            }}
                                            title="View all inputs"
                                        >
                                            View
                                        </button>
                                        <button
                                            type="button"
                                            className="pn-btn pn-btn--sm pn-btn--danger"
                                            onClick={() => onDelete(r.recordingId)}
                                            title="Delete recording"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="modalActions">
                    <button type="button" className="pn-btn" onClick={onClose}>
                        Close
                    </button>
                    <button
                        type="button"
                        className="pn-btn"
                        onClick={onRefresh}
                        disabled={loading}
                    >
                        Refresh
                    </button>
                </div>
            </div>
        </div>
    );
}
