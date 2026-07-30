import React, { useEffect, useMemo, useState } from "react";
import { useMaestroStore } from "../../../stores/useMaestroStore";
import type { ModelProfile } from "../../../app/types/maestro";
import { formatLaunchConfigLabel } from "../../../app/constants/agentTools";
import { ModelProfileModal } from "../ModelProfileModal";

type ModelProfilesPanelProps = {
    createSignal?: number;
};

export function ModelProfilesPanel({ createSignal = 0 }: ModelProfilesPanelProps) {
    const modelProfilesMap = useMaestroStore((s) => s.modelProfiles);
    const fetchModelProfiles = useMaestroStore((s) => s.fetchModelProfiles);
    const deleteModelProfile = useMaestroStore((s) => s.deleteModelProfile);
    const loading = useMaestroStore((s) => s.loading["modelProfiles"]);

    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<ModelProfile | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        fetchModelProfiles();
    }, [fetchModelProfiles]);

    useEffect(() => {
        if (createSignal > 0) {
            setEditing(null);
            setShowModal(true);
        }
    }, [createSignal]);

    const profiles = useMemo(
        () => Object.values(modelProfilesMap).sort((a, b) => a.name.localeCompare(b.name)),
        [modelProfilesMap],
    );

    const handleNew = () => { setEditing(null); setShowModal(true); };
    const handleEdit = (p: ModelProfile) => { setEditing(p); setShowModal(true); };
    const handleDelete = async (p: ModelProfile) => {
        if (deletingId) return;
        setDeletingId(p.id);
        try {
            await deleteModelProfile(p.id);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <>
            <div className="terminalContent pnLeakSkin">
                {loading && profiles.length === 0 ? (
                    <div className="terminalLoadingState">
                        <div className="terminalSpinner">
                            <span className="terminalSpinnerDot">●</span>
                            <span className="terminalSpinnerDot">●</span>
                            <span className="terminalSpinnerDot">●</span>
                        </div>
                        <p className="terminalLoadingText"><span className="terminalCursor">█</span> Loading model profiles...</p>
                    </div>
                ) : profiles.length === 0 ? (
                    <div className="terminalEmptyState">
                        <p className="terminalEmptyMessage">NO MODEL PROFILES</p>
                        <p className="terminalEmptySubMessage">Create reusable model classes (Heavy / Balanced / Fast) and point team members at them.</p>
                        <button type="button" className="themedBtn themedBtnPrimary" style={{ marginTop: 12 }} onClick={handleNew}>
                            + New Profile
                        </button>
                    </div>
                ) : (
                    <div className="modelProfileList" style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
                        {profiles.map((p) => (
                            <div
                                key={p.id}
                                className="modelProfileCard"
                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--theme-border, #333)", borderRadius: "var(--pn-r-sm, 6px)", background: "var(--pn-card, transparent)" }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                                        {p.isDefault && (
                                            <span className="themedTaskStatusBadge" data-status="in_progress" style={{ padding: "2px 6px", fontSize: 9, letterSpacing: 0.5 }}>
                                                DEFAULT
                                            </span>
                                        )}
                                        <span className="terminalMetaBadge terminalMetaBadge--model" style={{ fontSize: 10 }}>
                                            {formatLaunchConfigLabel(p.launchConfig)}
                                        </span>
                                    </div>
                                    {p.description && (
                                        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{p.description}</div>
                                    )}
                                </div>
                                <button type="button" className="themedBtn" style={{ fontSize: 10, padding: "4px 10px" }} onClick={() => handleEdit(p)}>
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    className="themedBtn themedBtnDanger"
                                    style={{ fontSize: 10, padding: "4px 10px" }}
                                    onClick={() => handleDelete(p)}
                                    disabled={deletingId === p.id}
                                >
                                    {deletingId === p.id ? "..." : "Delete"}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <ModelProfileModal
                isOpen={showModal}
                onClose={() => { setShowModal(false); setEditing(null); }}
                profile={editing}
            />
        </>
    );
}
