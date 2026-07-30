import React, { useEffect } from "react";
import { useTokenAnalyticsStore } from "../../../stores/useTokenAnalyticsStore";

function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

type TaskTokenTabProps = {
    taskId: string;
};

export function TaskTokenTab({ taskId }: TaskTokenTabProps) {
    const fetchTaskSummary = useTokenAnalyticsStore((s) => s.fetchTaskSummary);
    const summary = useTokenAnalyticsStore((s) => s.taskSummaries[taskId]);
    const loading = useTokenAnalyticsStore((s) => s.loadingTasks[taskId] ?? false);

    useEffect(() => {
        fetchTaskSummary(taskId);
    }, [taskId, fetchTaskSummary]);

    if (loading && !summary) {
        return <div className="terminalTabPane pn-fhint">Loading token usage…</div>;
    }

    if (!summary) {
        return <div className="terminalTabPane pn-fhint">No token data available.</div>;
    }

    const hasSessions = summary.sessions.length > 0;
    const hasUsage = summary.totals.total > 0;

    return (
        <div className="terminalTabPane" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px" }}>
            <div className="pn-fhint" style={{ marginBottom: 0 }}>
                Token counts reflect completed sessions only. Running sessions appear as pending.
            </div>

            {!hasSessions ? (
                <div className="pn-fhint">No sessions attached to this task.</div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {summary.sessions.map((entry) => (
                        <div
                            key={entry.sessionId}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "7px 10px",
                                border: "1px solid var(--theme-border, #333)",
                                borderRadius: 5,
                                fontSize: 12,
                                fontFamily: "var(--pn-mono)",
                            }}
                        >
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.7 }}>
                                {entry.sessionId}
                            </span>
                            {entry.tokenUsage ? (
                                <span style={{ display: "flex", gap: 12, color: "var(--pn-ink-1)" }}>
                                    <span title="Input tokens">{fmt(entry.tokenUsage.input)} in</span>
                                    <span title="Output tokens">{fmt(entry.tokenUsage.output)} out</span>
                                    {entry.tokenUsage.cacheRead > 0 && (
                                        <span title="Cache read" style={{ opacity: 0.6 }}>{fmt(entry.tokenUsage.cacheRead)} cache</span>
                                    )}
                                    <span title="Total" style={{ fontWeight: 600 }}>{fmt(entry.tokenUsage.total)} total</span>
                                </span>
                            ) : (
                                <span style={{ opacity: 0.45, fontStyle: "italic" }}>pending</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {hasUsage && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "8px 10px",
                        background: "var(--pn-surface-2, rgba(255,255,255,0.04))",
                        borderRadius: 5,
                        fontSize: 12,
                        fontFamily: "var(--pn-mono)",
                        fontWeight: 600,
                    }}
                >
                    <span style={{ flex: 1, opacity: 0.7 }}>Total (completed sessions)</span>
                    <span title="Input tokens">{fmt(summary.totals.input)} in</span>
                    <span title="Output tokens">{fmt(summary.totals.output)} out</span>
                    {summary.totals.cacheRead > 0 && (
                        <span title="Cache read" style={{ opacity: 0.6 }}>{fmt(summary.totals.cacheRead)} cache</span>
                    )}
                    <span title="Total">{fmt(summary.totals.total)}</span>
                </div>
            )}
        </div>
    );
}
