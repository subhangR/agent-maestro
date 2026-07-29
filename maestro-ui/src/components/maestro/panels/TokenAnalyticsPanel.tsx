import React, { useEffect, useMemo, useState } from "react";
import { useTokenAnalyticsStore } from "../../../stores/useTokenAnalyticsStore";
import { useMaestroStore } from "../../../stores/useMaestroStore";
import type { TokenUsageSnapshot } from "../../../app/types/maestro";

const WINDOWS = [
    { label: "1 h", ms: 60 * 60 * 1000 },
    { label: "24 h", ms: 24 * 60 * 60 * 1000 },
    { label: "7 d", ms: 7 * 24 * 60 * 60 * 1000 },
    { label: "30 d", ms: 30 * 24 * 60 * 60 * 1000 },
];

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

function QuotaBar({ used, limit, label }: { used: number; limit: number; label: string }) {
    const pct = fmtPct(used, limit);
    const isWarning = pct >= 80;
    const isOver = pct >= 100;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.8 }}>
                <span>{label}</span>
                <span style={{ fontFamily: "var(--pn-mono)", color: isOver ? "var(--pn-block, #e55)" : isWarning ? "var(--pn-warn, #e90)" : undefined }}>
                    {fmt(used)} / {fmt(limit)} ({pct}%)
                </span>
            </div>
            <div style={{ height: 4, background: "var(--pn-surface-2, rgba(255,255,255,0.07))", borderRadius: 2, overflow: "hidden" }}>
                <div
                    style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: isOver ? "var(--pn-block, #e55)" : isWarning ? "var(--pn-warn, #e90)" : "var(--pn-brand, #6e6ef8)",
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

    const windowMs = WINDOWS[windowIdx].ms;

    useEffect(() => {
        fetchGlobalSummary(windowMs);
    }, [windowMs, fetchGlobalSummary]);

    // Build a map of provider -> lowest maxTokensPerDay across all profiles
    const quotaByProvider = useMemo(() => {
        const result: Record<string, number> = {};
        for (const profile of Object.values(modelProfilesMap)) {
            if (!profile.quotas?.maxTokensPerDay) continue;
            const provider = profile.launchConfig.provider;
            const existing = result[provider];
            if (existing == null || profile.quotas.maxTokensPerDay < existing) {
                result[provider] = profile.quotas.maxTokensPerDay;
            }
        }
        return result;
    }, [modelProfilesMap]);

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
            <div style={{ display: "flex", gap: 4, padding: "8px 10px", borderBottom: "1px solid var(--theme-border, #333)" }}>
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
                {loading && <span style={{ fontSize: 11, opacity: 0.5, alignSelf: "center" }}>Loading…</span>}
                {!loading && (
                    <button
                        type="button"
                        className="pn-subtab"
                        style={{ fontSize: 11 }}
                        title="Refresh"
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
                                    const dailyLimit = quotaByProvider[provider];
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
                                            {dailyLimit != null && (
                                                <QuotaBar
                                                    used={snap.total}
                                                    limit={dailyLimit}
                                                    label="Daily token limit"
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
