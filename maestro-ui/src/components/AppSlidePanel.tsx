
import React, { useState } from "react";
import { SlidePanel, SlidePanelTab } from "../SlidePanel";
import { Icon } from "./Icon";
import { getProcessEffectById } from "../processEffects";
import { shortenPathSmart } from "../pathDisplay";
import { formatTimeAgo } from "../utils/formatters";
import { useUIStore } from "../stores/useUIStore";
import { usePromptStore } from "../stores/usePromptStore";
import { useRecordingStore } from "../stores/useRecordingStore";
import { useAssetStore } from "../stores/useAssetStore";
import { useSessionStore } from "../stores/useSessionStore";
import { useProjectStore } from "../stores/useProjectStore";

export function AppSlidePanel() {
    // --- UI store ---
    const slidePanelOpen = useUIStore((s) => s.slidePanelOpen);
    const setSlidePanelOpen = useUIStore((s) => s.setSlidePanelOpen);
    const slidePanelTab = useUIStore((s) => s.slidePanelTab) as SlidePanelTab;
    const setSlidePanelTab = useUIStore((s) => s.setSlidePanelTab);
    const slidePanelWidth = useUIStore((s) => s.slidePanelWidth);
    const setSlidePanelWidth = useUIStore((s) => s.setSlidePanelWidth);

    // --- Prompt store ---
    const prompts = usePromptStore((s) => s.prompts);
    const openPromptEditor = usePromptStore((s) => s.openPromptEditor);
    const togglePromptPin = usePromptStore((s) => s.togglePromptPin);

    // --- Recording store ---
    const recordings = useRecordingStore((s) => s.recordings);
    const recordingsLoading = useRecordingStore((s) => s.recordingsLoading);
    const refreshRecordings = useRecordingStore((s) => s.refreshRecordings);
    const openReplay = useRecordingStore((s) => s.openReplay);
    const requestDeleteRecording = useRecordingStore((s) => s.requestDeleteRecording);

    // --- Asset store ---
    const assets = useAssetStore((s) => s.assets);
    const assetSettings = useAssetStore((s) => s.assetSettings);
    const setAssetSettings = useAssetStore((s) => s.setAssetSettings);
    const openApplyAssetModal = useAssetStore((s) => s.openApplyAssetModal);
    const openAssetEditor = useAssetStore((s) => s.openAssetEditor);
    const toggleAssetAutoApply = useAssetStore((s) => s.toggleAssetAutoApply);
    const requestDeleteAsset = useAssetStore((s) => s.requestDeleteAsset);

    // --- Session store ---
    const activeId = useSessionStore((s) => s.activeId);
    const sessions = useSessionStore((s) => s.sessions);
    const active = sessions.find((s) => s.id === activeId) ?? null;
    const activeSessionCwd = active?.cwd ?? null;

    // --- Project store ---
    const projectsList = useProjectStore((s) => s.projects);
    const activeProjectId = useProjectStore((s) => s.activeProjectId);
    const activeProject = projectsList.find((p) => p.id === activeProjectId) ?? null;

    // --- onSendPrompt ---
    const onSendPrompt = (prompt: { id: string; title: string; content: string; createdAt: number }, mode: "paste" | "send") => {
        useSessionStore.getState().sendPromptToActive(prompt, mode);
    };

    const [promptSearch, setPromptSearch] = useState("");
    const [recordingSearch, setRecordingSearch] = useState("");
    const [assetSearch, setAssetSearch] = useState("");

    return (
        <SlidePanel
            isOpen={slidePanelOpen}
            onClose={() => setSlidePanelOpen(false)}
            activeTab={slidePanelTab}
            onTabChange={(tab) => setSlidePanelTab(tab)}
            width={slidePanelWidth}
            onWidthChange={setSlidePanelWidth}
        >
            {slidePanelTab === "prompts" ? (
                <>
                    {/* Prompts Search */}
                    <div className="panelSearch">
                        <span className="panelSearchIcon" aria-hidden="true">
                            <Icon name="search" size={14} />
                        </span>
                        <input
                            className="panelSearchInput"
                            type="text"
                            placeholder="Search prompts..."
                            value={promptSearch}
                            onChange={(e) => setPromptSearch(e.target.value)}
                        />
                    </div>

                    {/* Pinned Prompts */}
                    {(() => {
                        const pinnedPrompts = prompts
                            .filter((p) => p.pinned)
                            .filter((p) => !promptSearch || p.title.toLowerCase().includes(promptSearch.toLowerCase()))
                            .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
                        if (pinnedPrompts.length === 0) return null;
                        return (
                            <div className="panelSection">
                                <div className="panelSectionTitle">Pinned</div>
                                <div className="panelList">
                                    {pinnedPrompts.map((p) => (
                                        <div key={p.id} className="panelCard">
                                            <div className="panelCardHeader">
                                                <span className="panelCardPin">{"\u2605"}</span>
                                                <span className="panelCardTitle">{p.title}</span>
                                            </div>
                                            <div className="panelCardPreview">{p.content.slice(0, 100)}</div>
                                            <div className="panelCardActions">
                                                <button type="button"
                                                    className="panelCardBtn"
                                                    onClick={() => onSendPrompt(p, "paste")}
                                                    disabled={!activeId}
                                                >
                                                    Paste
                                                </button>
                                                <button type="button"
                                                    className="panelCardBtn"
                                                    onClick={() => onSendPrompt(p, "send")}
                                                    disabled={!activeId}
                                                >
                                                    Send
                                                </button>
                                                <button type="button" className="panelCardBtn" onClick={() => openPromptEditor(p)}>
                                                    Edit
                                                </button>
                                                <button type="button" className="panelCardBtn" onClick={() => togglePromptPin(p.id)}>
                                                    Unpin
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* All Prompts */}
                    <div className="panelSection">
                        <div className="panelSectionTitle">All Prompts</div>
                        <div className="panelList">
                            {prompts
                                .filter((p) => !p.pinned)
                                .filter((p) => !promptSearch || p.title.toLowerCase().includes(promptSearch.toLowerCase()))
                                .sort((a, b) => b.createdAt - a.createdAt)
                                .map((p) => (
                                    <div key={p.id} className="panelCard">
                                        <div className="panelCardHeader">
                                            <span className="panelCardTitle">{p.title}</span>
                                        </div>
                                        <div className="panelCardMeta">{formatTimeAgo(p.createdAt)}</div>
                                        <div className="panelCardPreview">{p.content.slice(0, 100)}</div>
                                        <div className="panelCardActions">
                                            <button type="button"
                                                className="panelCardBtn"
                                                onClick={() => onSendPrompt(p, "paste")}
                                                disabled={!activeId}
                                            >
                                                Paste
                                            </button>
                                            <button type="button"
                                                className="panelCardBtn"
                                                onClick={() => onSendPrompt(p, "send")}
                                                disabled={!activeId}
                                            >
                                                Send
                                            </button>
                                            <button type="button" className="panelCardBtn" onClick={() => openPromptEditor(p)}>
                                                Edit
                                            </button>
                                            <button type="button" className="panelCardBtn" onClick={() => togglePromptPin(p.id)}>
                                                Pin
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            {prompts.filter((p) => !p.pinned).length === 0 && (
                                <div className="panelCardMeta" style={{ textAlign: "center", padding: "16px" }}>
                                    No prompts yet
                                </div>
                            )}
                        </div>
                    </div>

                    {/* New Prompt Footer */}
                    <div className="panelFooter">
                        <button type="button" className="panelFooterBtn" onClick={() => openPromptEditor()}>
                            + New Prompt
                        </button>
                    </div>
                </>
            ) : slidePanelTab === "recordings" ? (
                <>
                    {/* Recordings Search */}
                    <div className="panelSearch">
                        <span className="panelSearchIcon" aria-hidden="true">
                            <Icon name="search" size={14} />
                        </span>
                        <input
                            className="panelSearchInput"
                            type="text"
                            placeholder="Search recordings..."
                            value={recordingSearch}
                            onChange={(e) => setRecordingSearch(e.target.value)}
                        />
                    </div>

                    {/* Recordings List */}
                    <div className="panelList">
                        {recordingsLoading ? (
                            <div className="panelCardMeta" style={{ textAlign: "center", padding: "16px" }}>
                                Loading...
                            </div>
                        ) : (
                            (() => {
                                const filteredRecordings = recordings.filter((r) => {
                                    if (!recordingSearch) return true;
                                    const name = r.meta?.name || r.recordingId;
                                    return name.toLowerCase().includes(recordingSearch.toLowerCase());
                                });

                                // Group by date
                                const today = new Date();
                                const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                                const yesterdayStart = todayStart - 86400000;
                                const weekStart = todayStart - 7 * 86400000;

                                const groups: { label: string; items: typeof recordings }[] = [];
                                const todayItems = filteredRecordings.filter((r) => (r.meta?.createdAt ?? 0) >= todayStart);
                                const yesterdayItems = filteredRecordings.filter((r) => {
                                    const t = r.meta?.createdAt ?? 0;
                                    return t >= yesterdayStart && t < todayStart;
                                });
                                const weekItems = filteredRecordings.filter((r) => {
                                    const t = r.meta?.createdAt ?? 0;
                                    return t >= weekStart && t < yesterdayStart;
                                });
                                const olderItems = filteredRecordings.filter((r) => (r.meta?.createdAt ?? 0) < weekStart);

                                if (todayItems.length) groups.push({ label: "Today", items: todayItems });
                                if (yesterdayItems.length) groups.push({ label: "Yesterday", items: yesterdayItems });
                                if (weekItems.length) groups.push({ label: "This Week", items: weekItems });
                                if (olderItems.length) groups.push({ label: "Older", items: olderItems });

                                if (groups.length === 0) {
                                    return (
                                        <div className="panelCardMeta" style={{ textAlign: "center", padding: "16px" }}>
                                            No recordings yet
                                        </div>
                                    );
                                }

                                return groups.map((group) => (
                                    <div key={group.label} className="panelSection">
                                        <div className="dateGroupHeader">{group.label}</div>
                                        {group.items.map((r) => {
                                            const meta = r.meta;
                                            const displayName = meta?.name || r.recordingId.slice(0, 12);
                                            const effect = meta?.effectId ? getProcessEffectById(meta.effectId) : null;
                                            return (
                                                <div key={r.recordingId} className="panelCard">
                                                    <div className="panelCardHeader">
                                                        <span className="panelCardTitle">{displayName}</span>
                                                    </div>
                                                    <div className="panelCardMeta">
                                                        {[
                                                            effect?.label,
                                                            meta?.cwd ? shortenPathSmart(meta.cwd, 30) : null,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" • ")}
                                                    </div>
                                                    <div className="panelCardActions">
                                                        <button type="button" className="panelCardBtn" onClick={() => openReplay(r.recordingId, "step")}>
                                                            Replay
                                                        </button>
                                                        <button type="button" className="panelCardBtn" onClick={() => openReplay(r.recordingId, "all")}>
                                                            View
                                                        </button>
                                                        <button type="button"
                                                            className="panelCardBtn panelCardBtnDanger"
                                                            onClick={() => requestDeleteRecording(r.recordingId)}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ));
                            })()
                        )}
                    </div>

                    {/* Refresh Button */}
                    <div className="panelFooter">
                        <button type="button" className="panelFooterBtn" onClick={() => void refreshRecordings()}>
                            Refresh
                        </button>
                    </div>
                </>
            ) : slidePanelTab === "assets" ? (
                <>
                    {/* Assets Search */}
                    <div className="panelSearch">
                        <span className="panelSearchIcon" aria-hidden="true">
                            <Icon name="search" size={14} />
                        </span>
                        <input
                            className="panelSearchInput"
                            type="text"
                            placeholder="Search assets..."
                            value={assetSearch}
                            onChange={(e) => setAssetSearch(e.target.value)}
                        />
                    </div>

                    {/* Auto-create Settings */}
                    <div className="panelSection">
                        <div className="panelSectionTitle">Auto-create</div>
                        <div className="panelCard">
                            <div className="panelCardHeader">
                                <span className="panelCardTitle">Create missing files on new sessions</span>
                            </div>
                            <label className="checkRow">
                                <input
                                    type="checkbox"
                                    checked={assetSettings.autoApplyEnabled}
                                    onChange={(e) => setAssetSettings({ ...assetSettings, autoApplyEnabled: e.target.checked })}
                                />
                                Enabled
                            </label>
                            <div className="panelCardMeta">
                                Applies enabled templates to the session working directory (only if missing).
                            </div>
                            {activeProject?.assetsEnabled === false && (
                                <div className="panelCardMeta">Disabled for this project in Project settings.</div>
                            )}
                        </div>
                    </div>

                    {/* Templates */}
                    <div className="panelSection">
                        <div className="panelSectionTitle">Templates</div>
                        <div className="panelList">
                            {(() => {
                                const q = assetSearch.trim().toLowerCase();
                                const filtered = assets
                                    .filter((a) => {
                                        if (!q) return true;
                                        return a.name.toLowerCase().includes(q) || a.relativePath.toLowerCase().includes(q);
                                    })
                                    .sort((a, b) => b.createdAt - a.createdAt);

                                if (filtered.length === 0) {
                                    return (
                                        <div className="panelCardMeta" style={{ textAlign: "center", padding: "16px" }}>
                                            No assets yet
                                        </div>
                                    );
                                }

                                return filtered.map((a) => (
                                    <div key={a.id} className="panelCard">
                                        <div className="panelCardHeader">
                                            <span className="panelCardTitle">{a.name}</span>
                                        </div>
                                        <div className="panelCardMeta">
                                            {[a.relativePath, a.autoApply ?? true ? "Auto" : "Manual"].join(" • ")}
                                        </div>
                                        <div className="panelCardPreview">{a.content.slice(0, 140)}</div>
                                        <div className="panelCardActions">
                                            <button type="button"
                                                className="panelCardBtn"
                                                onClick={() => {
                                                    const dir = activeProject?.basePath ?? null;
                                                    if (!dir) return;
                                                    openApplyAssetModal("project", dir, a.id);
                                                }}
                                                disabled={!activeProject?.basePath}
                                                title={activeProject?.basePath ? "Apply to project base path" : "Project has no base path"}
                                            >
                                                To project
                                            </button>
                                            <button type="button"
                                                className="panelCardBtn"
                                                onClick={() => {
                                                    const dir = activeSessionCwd ?? null;
                                                    if (!dir) return;
                                                    openApplyAssetModal("tab", dir, a.id);
                                                }}
                                                disabled={!activeSessionCwd}
                                                title={activeSessionCwd ? "Apply to current tab working directory" : "No active tab cwd"}
                                            >
                                                To tab
                                            </button>
                                            <button type="button" className="panelCardBtn" onClick={() => openAssetEditor(a)}>
                                                Edit
                                            </button>
                                            <button type="button" className="panelCardBtn" onClick={() => toggleAssetAutoApply(a.id)}>
                                                {a.autoApply ?? true ? "Disable auto" : "Enable auto"}
                                            </button>
                                            <button type="button" className="panelCardBtn panelCardBtnDanger" onClick={() => requestDeleteAsset(a.id)}>
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>

                    {/* New Asset Footer */}
                    <div className="panelFooter">
                        <button type="button" className="panelFooterBtn" onClick={() => openAssetEditor()}>
                            + New Asset
                        </button>
                    </div>
                </>
            ) : null}
        </SlidePanel>
    );
}
