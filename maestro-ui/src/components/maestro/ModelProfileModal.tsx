import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { AgentTool, LaunchConfig, ModelProfile, ModelProfileQuotas } from "../../app/types/maestro";
import { useMaestroStore } from "../../stores/useMaestroStore";
import {
    createLaunchConfig,
    formatLaunchConfigLabel,
    getAgentToolForLaunchConfig,
    sanitizeLaunchConfig,
} from "../../app/constants/agentTools";
import { LaunchConfigDropdown } from "./LaunchConfigDropdown";
import { Icon } from "./redesign/kit";

type ModelProfileModalProps = {
    isOpen: boolean;
    onClose: () => void;
    profile?: ModelProfile | null;
};

const DEFAULT_CONFIG: LaunchConfig = createLaunchConfig("claude-code", "claude-opus-4-8");

export function ModelProfileModal({ isOpen, onClose, profile }: ModelProfileModalProps) {
    const createModelProfile = useMaestroStore((s) => s.createModelProfile);
    const updateModelProfile = useMaestroStore((s) => s.updateModelProfile);

    const isEditMode = !!profile;

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [launchConfig, setLaunchConfig] = useState<LaunchConfig | null>(DEFAULT_CONFIG);
    const [activeTool, setActiveTool] = useState<AgentTool | null>("claude-code");
    const [quotaTokensPerSession, setQuotaTokensPerSession] = useState("");
    const [quotaTokensPerDay, setQuotaTokensPerDay] = useState("");
    const [quotaConcurrentSessions, setQuotaConcurrentSessions] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        if (profile) {
            setName(profile.name);
            setDescription(profile.description || "");
            setLaunchConfig(profile.launchConfig);
            setActiveTool(getAgentToolForLaunchConfig(profile.launchConfig) || "claude-code");
            setQuotaTokensPerSession(profile.quotas?.maxTokensPerSession?.toString() ?? "");
            setQuotaTokensPerDay(profile.quotas?.maxTokensPerDay?.toString() ?? "");
            setQuotaConcurrentSessions(profile.quotas?.maxConcurrentSessions?.toString() ?? "");
        } else {
            setName("");
            setDescription("");
            setLaunchConfig(DEFAULT_CONFIG);
            setActiveTool("claude-code");
            setQuotaTokensPerSession("");
            setQuotaTokensPerDay("");
            setQuotaConcurrentSessions("");
        }
        setError(null);
    }, [isOpen, profile]);

    const handleClose = () => {
        if (isSaving) return;
        onClose();
    };

    const buildQuotas = (): ModelProfileQuotas | undefined => {
        const tps = parseInt(quotaTokensPerSession, 10);
        const tpd = parseInt(quotaTokensPerDay, 10);
        const mcs = parseInt(quotaConcurrentSessions, 10);
        const q: ModelProfileQuotas = {};
        if (!isNaN(tps) && tps > 0) q.maxTokensPerSession = tps;
        if (!isNaN(tpd) && tpd > 0) q.maxTokensPerDay = tpd;
        if (!isNaN(mcs) && mcs > 0) q.maxConcurrentSessions = mcs;
        return Object.keys(q).length > 0 ? q : undefined;
    };

    const handleSubmit = async () => {
        const sanitized = sanitizeLaunchConfig(launchConfig);
        if (!name.trim()) { setError("Name is required"); return; }
        if (!sanitized) { setError("Pick a model for this profile"); return; }

        setIsSaving(true);
        setError(null);
        try {
            const quotas = buildQuotas();
            if (isEditMode && profile) {
                await updateModelProfile(profile.id, {
                    name: name.trim(),
                    description: description.trim() || undefined,
                    launchConfig: sanitized,
                    quotas,
                });
            } else {
                await createModelProfile({
                    name: name.trim(),
                    description: description.trim() || undefined,
                    launchConfig: sanitized,
                    quotas,
                });
            }
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to ${isEditMode ? "update" : "create"} profile`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="themedModalBackdrop" onClick={handleClose}>
            <div className="pn-mdl" onClick={(e) => e.stopPropagation()} style={{ overflow: "hidden" }}>
                <div className="pn-mdl__hd">
                    <div className="pn-mdl__hdmain">
                        <div className="pn-mdl__crumb"><Icon name="sliders" /> <b>Model profile</b> <Icon name="chevronR" size={11} /> {isEditMode ? "Edit" : "New"}</div>
                        <input
                            type="text"
                            className="pn-mdl__titleinput"
                            placeholder="e.g., Heavy"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isSaving}
                            autoFocus
                        />
                    </div>
                    <button type="button" className="pn-mdl__close" onClick={handleClose} disabled={isSaving}><Icon name="x" /></button>
                </div>

                <div className="pn-mdl__body" style={{ overflowX: "hidden" }}>
                    {error && (
                        <div className="pn-fhint" style={{ color: "var(--pn-block)", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ flex: 1 }}>{error}</span>
                            <button type="button" className="pn-mdl__close" style={{ width: 22, height: 22 }} onClick={() => setError(null)}><Icon name="x" size={13} /></button>
                        </div>
                    )}

                    <div className="pn-fhint">
                        Team members bound to this profile resolve their model + launch settings here. Editing this
                        profile re-points every bound member the next time they spawn.
                    </div>

                    <div className="pn-fld">
                        <span className="pn-flabel">Description</span>
                        <input
                            type="text"
                            className="pn-input"
                            placeholder="Optional — what this tier is for"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={isSaving}
                        />
                    </div>

                    <div className="pn-fld">
                        <span className="pn-flabel">Launch config <span style={{ opacity: 0.6, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>— {formatLaunchConfigLabel(launchConfig || undefined)}</span></span>
                        <div className="terminalLaunchDropdown terminalLaunchDropdown--inline">
                            <LaunchConfigDropdown
                                launchConfig={launchConfig}
                                activeTool={activeTool}
                                onActiveToolChange={setActiveTool}
                                onLaunchConfigChange={setLaunchConfig}
                                showAdvancedOptions
                            />
                        </div>
                    </div>

                    <div className="pn-fld" style={{ marginTop: 4 }}>
                        <span className="pn-flabel">Quotas <span style={{ opacity: 0.6, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>— optional advisory limits</span></span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <label style={{ fontSize: 11, opacity: 0.7, minWidth: 160 }}>Max tokens / session</label>
                                <input
                                    type="number"
                                    className="pn-input"
                                    style={{ flex: 1 }}
                                    placeholder="e.g. 500000"
                                    value={quotaTokensPerSession}
                                    onChange={(e) => setQuotaTokensPerSession(e.target.value)}
                                    disabled={isSaving}
                                    min={0}
                                />
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <label style={{ fontSize: 11, opacity: 0.7, minWidth: 160 }}>Max tokens / day</label>
                                <input
                                    type="number"
                                    className="pn-input"
                                    style={{ flex: 1 }}
                                    placeholder="e.g. 2000000"
                                    value={quotaTokensPerDay}
                                    onChange={(e) => setQuotaTokensPerDay(e.target.value)}
                                    disabled={isSaving}
                                    min={0}
                                />
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <label style={{ fontSize: 11, opacity: 0.7, minWidth: 160 }}>Max concurrent sessions</label>
                                <input
                                    type="number"
                                    className="pn-input"
                                    style={{ flex: 1 }}
                                    placeholder="e.g. 3"
                                    value={quotaConcurrentSessions}
                                    onChange={(e) => setQuotaConcurrentSessions(e.target.value)}
                                    disabled={isSaving}
                                    min={0}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pn-mdl__foot">
                    <div className="pn-mdl__footL" />
                    <div className="pn-mdl__footR">
                        <button type="button" className="pn-btn pn-btn--ghost" onClick={handleClose} disabled={isSaving}>Cancel</button>
                        <button
                            type="button"
                            className="pn-btn pn-btn--primary"
                            onClick={handleSubmit}
                            disabled={isSaving || !name.trim()}
                        >
                            {isSaving ? (isEditMode ? "Saving..." : "Creating...") : isEditMode ? "Save Profile" : "Create Profile"}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
