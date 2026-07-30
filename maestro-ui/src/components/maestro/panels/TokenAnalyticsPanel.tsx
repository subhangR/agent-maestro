import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTokenAnalyticsStore } from "../../../stores/useTokenAnalyticsStore";
import { useMaestroStore } from "../../../stores/useMaestroStore";
import type { ModelProfile, TokenUsageSnapshot } from "../../../app/types/maestro";

const WINDOWS = [
    { label: "1 h", ms: 60 * 60 * 1000 },
    { label: "24 h", ms: 24 * 60 * 60 * 1000 },
    { label: "7 d", ms: 7 * 24 * 60 * 60 * 1000 },
    { label: "30 d", ms: 30 * 24 * 60 * 60 * 1000 },
];

const POLL_MS = 8000;

function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

function fmtPct(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
}

function TotalsCard({ totals, label }: { totals: TokenUsageSnapshot; label: string }) {
    return (
        <div
            style={{
                padding: "10px 12px",
                border: "1px solid var(--theme-border, #333)",
                borderRadius: 6,
                display: "flex",
                flexDirection: "column",
                gap: 6,
            }}
        >
            <div style={{ fontWeight: 600, fontSize: 12, opacity: 0.8 }}>{label}</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontFamily: "var(--pn-mono)", fontSize: 12 }}>
                <span title="Input tokens"><span style={{ opacity: 0.6 }}>in </span>{fmt(totals.input)}</span>
                <span title="Output tokens"><span style={{ opacity: 0.6 }}>out </span>{fmt(totals.output)}</span>
                {totals.cacheRead > 0 && (
                    <span title="Cache read" style={{ opacity: 0.7 }}><span style={{ opacity: 0.6 }}>cache </span>{fmt(totals.cacheRead)}</span>
                )}
                <span title="Total" style={{ fontWeight: 700 }}><span style={{ opacity: 0.6 }}>total </span>{fmt(totals.total)}</span>
            </div>
        </div>
    );
}

function EditableQuotaBar({
    used,
    limit,
    onSave,
}: {
    used: number;
    limit?: number;
    onSave: (newLimit: number) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(limit != null ? String(limit) : "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!editing) setValue(limit != null ? String(limit) : "");
    }, [limit, editing]);

    const pct = limit ? fmtPct(used, limit) : 0;
    const isWarning = pct >= 80;
    const isOver = pct >= 100;

    const cancel = () => {
        setValue(limit != null ? String(limit) : "");
        setError(null);
        setEditing(false);
    };

    const commit = async () => {
        const trimmed = value.trim();
        if (trimmed === "") return cancel();
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed <= 0) return cancel();
        if (parsed === limit) return cancel();
        setSaving(true);
        setError(null);
        try {
            await onSave(parsed);
            setEditing(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    if (editing) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                        autoFocus
                        type="number"
                        min={1}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commit();
                            if (e.key === "Escape") cancel();
                        }}
                        placeholder="Daily limit"
                        disabled={saving}
                        className="pn-input"
                        style={{ width: 110, fontSize: 11, fontFamily: "var(--pn-mono)" }}
                    />
                    <span style={{ fontSize: 10, color: "var(--pn-ink-4)" }}>tokens/day</span>
                    <button type="button" className="pn-subtab" style={{ fontSize: 11 }} onClick={commit} disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className="pn-subtab" style={{ fontSize: 11 }} onClick={cancel} disabled={saving}>
                        Cancel
                    </button>
                </div>
                {error && <div style={{ fontSize: 10, color: "var(--pn-block)" }}>{error}</div>}
            </div>
        );
    }

    if (limit == null) {
        return (
            <button type="button" className="pn-subtab" style={{ fontSize: 11 }} onClick={() => setEditing(true)}>
                + Set daily limit
            </button>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.8 }}>
                <span>Daily token limit</span>
                <span
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditing(true)}
                    onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}
                    title="Click to edit"
                    style={{
                        fontFamily: "var(--pn-mono)",
                        cursor: "pointer",
                        color: isOver ? "var(--pn-block)" : isWarning ? "var(--pn-wait)" : "var(--pn-ink-2)",
                    }}
                >
                    {fmt(used)} / {fmt(limit)} ({pct}%)
                </span>
            </div>
            <div style={{ height: 4, background: "var(--pn-active)", borderRadius: 2, overflow: "hidden" }}>
                <div
                    style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: isOver ? "var(--pn-block)" : isWarning ? "var(--pn-wait)" : "var(--pn-brand)",
                        borderRadius: 2,
                        transition: "width 0.3s ease",
                    }}
                />
            </div>
        </div>
    );
}

export function TokenAnalyticsPanel() {
    const [windowIdx, setWindowIdx] = useState(1); // default 24h
    const fetchGlobalSummary = useTokenAnalyticsStore((s) => s.fetchGlobalSummary);
    const summary = useTokenAnalyticsStore((s) => s.globalSummary);
    const loading = useTokenAnalyticsStore((s) => s.loadingGlobal);
    const error = useTokenAnalyticsStore((s) => s.globalError);
    const modelProfilesMap = useMaestroStore((s) => s.modelProfiles);
    const updateModelProfile = useMaestroStore((s) => s.updateModelProfile);

    const windowMs = WINDOWS[windowIdx].ms;

    // Auto-poll while the panel is open — skips a tick if the previous fetch
    // is still in flight, so a slow request can't pile up overlapping calls.
    const loadingRef = useRef(loading);
    useEffect(() => { loadingRef.current = loading; }, [loading]);

    useEffect(() => {
        fetchGlobalSummary(windowMs);
        const interval = setInterval(() => {
            if (!loadingRef.current) fetchGlobalSummary(windowMs);
        }, POLL_MS);
        return () => clearInterval(interval);
    }, [windowMs, fetchGlobalSummary]);

    // Provider -> the model profile whose quota should be shown/edited: prefer
    // the profile with the lowest existing daily quota, else any profile for
    // that provider (lets a provider with no quota yet get one set here).
    const profileByProvider = useMemo(() => {
        const withQuota: Record<string, ModelProfile> = {};
        const any: Record<string, ModelProfile> = {};
        for (const profile of Object.values(modelProfilesMap)) {
            const provider = profile.launchConfig.provider;
            if (!any[provider]) any[provider] = profile;
            const limit = profile.quotas?.maxTokensPerDay;
            if (limit != null) {
                const existingLimit = withQuota[provider]?.quotas?.maxTokensPerDay;
                if (existingLimit == null || limit < existingLimit) withQuota[provider] = profile;
            }
        }
        const result: Record<string, ModelProfile> = {};
        for (const provider of new Set([...Object.keys(any), ...Object.keys(withQuota)])) {
            result[provider] = withQuota[provider] ?? any[provider];
        }
        return result;
    }, [modelProfilesMap]);

    const handleSaveQuota = async (profile: ModelProfile, newLimit: number) => {
        await updateModelProfile(profile.id, { quotas: { ...profile.quotas, maxTokensPerDay: newLimit } });
    };

    const providerEntries = useMemo(
        () => (summary ? Object.entries(summary.byProvider).sort((a, b) => (b[1]?.total ?? 0) - (a[1]?.total ?? 0)) : []),
        [summary],
    );

    const modelEntries = useMemo(
        () => (summary ? Object.entries(summary.byModel).sort((a, b) => b[1].total - a[1].total) : []),
        [summary],
    );

    return (
        <div className="terminalContent pnLeakSkin" style={{ padding: 0 }}>
            {/* Window selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", borderBottom: "1px solid var(--theme-border, #333)" }}>
                {WINDOWS.map((w, i) => (
                    <button
                        key={w.label}
                        type="button"
                        className={`pn-subtab${i === windowIdx ? " pn-subtab--active" : ""}`}
                        onClick={() => setWindowIdx(i)}
                        style={{ fontSize: 11 }}
                    >
                        {w.label}
                    </button>
                ))}
                <span style={{ flex: 1 }} />
                <span className="pn-dot-wrap" title="Auto-refreshing live" style={{ marginRight: 4 }}>
                    <span className="pn-dot pn-dot--run pn-dot--live" />
                </span>
                {loading && <span style={{ fontSize: 11, opacity: 0.5, alignSelf: "center" }}>Loading…</span>}
                {!loading && (
                    <button
                        type="button"
                        className="pn-subtab"
                        style={{ fontSize: 11 }}
                        title="Refresh now"
                        onClick={() => fetchGlobalSummary(windowMs)}
                    >
                        ↺
                    </button>
                )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 10px", overflowY: "auto" }}>
                {error && (
                    <div style={{ fontSize: 12, color: "var(--pn-block, #e55)", padding: "6px 10px", border: "1px solid var(--pn-block, #e55)", borderRadius: 5 }}>
                        {error}
                    </div>
                )}

                {!summary && !loading && !error && (
                    <div className="pn-fhint">No token data for this window.</div>
                )}

                {summary && (
                    <>
                        {/* Disclaimer */}
                        <div className="pn-fhint" style={{ marginBottom: 0 }}>
                            Usage from completed sessions only — running sessions contribute zero and appear as pending.
                            {summary.sessionCount > 0 && <> ({summary.sessionCount} session{summary.sessionCount !== 1 ? "s" : ""} in window)</>}
                        </div>

                        {/* Global totals */}
                        <TotalsCard totals={summary.totals} label="Global totals" />

                        {/* By provider */}
                        {providerEntries.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.6 }}>By provider</div>
                                {providerEntries.map(([provider, snap]) => {
                                    if (!snap) return null;
                                    const profile = profileByProvider[provider];
                                    const dailyLimit = profile?.quotas?.maxTokensPerDay;
                                    return (
                                        <div
                                            key={provider}
                                            style={{
                                                padding: "8px 10px",
                                                border: "1px solid var(--theme-border, #333)",
                                                borderRadius: 5,
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 6,
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{provider}</span>
                                                <span style={{ fontFamily: "var(--pn-mono)", fontSize: 12 }}>
                                                    {fmt(snap.input)} in / {fmt(snap.output)} out / <strong>{fmt(snap.total)}</strong> total
                                                </span>
                                            </div>
                                            {profile && (
                                                <EditableQuotaBar
                                                    used={snap.total}
                                                    limit={dailyLimit}
                                                    onSave={(newLimit) => handleSaveQuota(profile, newLimit)}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* By model */}
                        {modelEntries.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, opacity: 0.6 }}>By model</div>
                                {modelEntries.map(([model, snap]) => (
                                    <div
                                        key={model}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            padding: "6px 10px",
                                            border: "1px solid var(--theme-border, #333)",
                                            borderRadius: 5,
                                            fontSize: 12,
                                        }}
                                    >
                                        <span style={{ flex: 1, fontFamily: "var(--pn-mono)", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {model}
                                        </span>
                                        <span style={{ fontFamily: "var(--pn-mono)", whiteSpace: "nowrap" }}>
                                            {fmt(snap.input)} in / {fmt(snap.output)} out / <strong>{fmt(snap.total)}</strong>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {summary.totals.total === 0 && (
                            <div className="pn-fhint">No completed sessions found in the selected window.</div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
