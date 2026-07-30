import React from "react";
import { LoadedRecording } from "../../app/types/recording";
import { formatRecordingT } from "../../utils/formatters";
import { shortenPathSmart } from "../../pathDisplay";
import { getProcessEffectById } from "../../processEffects";

interface ReplayModalProps {
    isOpen: boolean;
    onClose: () => void;
    loading: boolean;
    error: string | null;
    recording: LoadedRecording | null;
    index: number;
    steps: string[];
    showAll: boolean;
    setShowAll: React.Dispatch<React.SetStateAction<boolean>>;
    flow: Array<{
        key: string;
        t: number;
        startIndex: number;
        endIndex: number;
        preview: string;
        items: Array<{ index: number; text: string }>;
    }>;
    flowExpanded: Record<string, boolean>;
    setFlowExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    nextItemRef: React.MutableRefObject<HTMLDivElement | null>;
    onSendNext: () => void;
}

export function ReplayModal({
    isOpen,
    onClose,
    loading,
    error,
    recording,
    index,
    steps,
    showAll,
    setShowAll,
    flow,
    flowExpanded,
    setFlowExpanded,
    nextItemRef,
    onSendNext,
}: ReplayModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modalBackdrop" onClick={onClose}>
            <div className="modal recordingsModal pnLeakSkin" onClick={(e) => e.stopPropagation()}>
                <h3 className="modalTitle">Replay recording</h3>

                {error && (
                    <div className="pathPickerError" role="alert">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="empty">Loading…</div>
                ) : recording ? (
                    <>
                        <div className="hint" style={{ marginTop: 0 }}>
                            {(() => {
                                const parts: string[] = [];
                                parts.push(
                                    recording.meta?.cwd
                                        ? `CWD: ${shortenPathSmart(recording.meta.cwd, 64)}`
                                        : "CWD: —",
                                );
                                if (recording.meta?.name?.trim()) {
                                    parts.push(`Name: ${recording.meta.name.trim()}`);
                                }
                                const boot =
                                    recording.meta?.bootstrapCommand?.trim() ||
                                    getProcessEffectById(recording.meta?.effectId)?.matchCommands?.[0] ||
                                    null;
                                if (boot) parts.push(`Boot: ${boot}`);
                                parts.push(`${index}/${steps.length} steps sent`);
                                return parts.join(" • ");
                            })()}
                        </div>

                        <div className="formRow" style={{ marginBottom: 0 }}>
                            <div className="label">{showAll ? "Flow" : "Next input"}</div>
                            <div className={`replayPreview ${showAll ? "replayPreviewFlow" : ""}`}>
                                {showAll ? (
                                    <div className="replayFlow">
                                        {flow.length === 0 ? (
                                            <div className="empty">No inputs recorded.</div>
                                        ) : (
                                            flow.map((group) => {
                                                const hasNext =
                                                    index < steps.length &&
                                                    index >= group.startIndex &&
                                                    index <= group.endIndex;
                                                const expanded =
                                                    flowExpanded[group.key] ?? group.items.length <= 3;
                                                const range =
                                                    group.startIndex === group.endIndex
                                                        ? `#${group.startIndex + 1}`
                                                        : `#${group.startIndex + 1}\u2013${group.endIndex + 1}`;
                                                const headerPreview = (() => {
                                                    if (!hasNext) return group.preview;
                                                    const nextItem = group.items.find((it) => it.index === index);
                                                    const text = nextItem?.text?.trim() ?? "";
                                                    return text ? text : group.preview;
                                                })();
                                                return (
                                                    <div
                                                        key={group.key}
                                                        className={`replayFlowGroup ${hasNext ? "replayFlowGroupNext" : ""}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="replayFlowGroupHeader"
                                                            onClick={() =>
                                                                setFlowExpanded((prev) => ({
                                                                    ...prev,
                                                                    [group.key]: !expanded,
                                                                }))
                                                            }
                                                            aria-expanded={expanded}
                                                        >
                                                            <span className="replayFlowCaret" aria-hidden="true">
                                                                {expanded ? "\u25BE" : "\u25B8"}
                                                            </span>
                                                            <span className="replayFlowTime">{formatRecordingT(group.t)}</span>
                                                            <span className="replayFlowRange">{range}</span>
                                                            {group.items.length > 1 ? (
                                                                <span
                                                                    className={`replayFlowCount ${hasNext ? "replayFlowCountNext" : ""}`}
                                                                >
                                                                    {hasNext ? "NEXT" : `${group.items.length} lines`}
                                                                </span>
                                                            ) : null}
                                                            <span className="replayFlowPreview" title={headerPreview}>
                                                                {headerPreview}
                                                            </span>
                                                        </button>

                                                        {expanded ? (
                                                            <div className="replayFlowItems">
                                                                {group.items.map((it, idx) => {
                                                                    const marker =
                                                                        idx === group.items.length - 1
                                                                            ? "\u2514\u2500"
                                                                            : "\u251C\u2500";
                                                                    const display = it.text.length ? it.text : "\u23CE";
                                                                    const isSent = it.index < index;
                                                                    const isNext =
                                                                        it.index === index && index < steps.length;
                                                                    return (
                                                                        <div
                                                                            key={it.index}
                                                                            ref={(el) => {
                                                                                if (isNext) nextItemRef.current = el;
                                                                            }}
                                                                            className={`replayFlowItem ${isSent ? "replayFlowItemSent" : ""} ${isNext ? "replayFlowItemNext" : ""}`}
                                                                            aria-current={isNext ? "step" : undefined}
                                                                        >
                                                                            <span className="replayFlowItemMarker" aria-hidden="true">
                                                                                {marker}
                                                                            </span>
                                                                            <span className="replayFlowItemIndex">
                                                                                {it.index + 1}
                                                                                {isNext ? <span className="replayFlowNextBadge">next</span> : null}
                                                                            </span>
                                                                            <pre className="replayFlowItemText">{display}</pre>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                ) : steps[index] ? (
                                    steps[index]
                                ) : (
                                    "Done."
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="empty">No recording loaded.</div>
                )}

                <div className="modalActions">
                    <button type="button" className="pn-btn" onClick={onClose}>
                        Close
                    </button>
                    <button
                        type="button"
                        className="pn-btn"
                        onClick={() => setShowAll((v) => !v)}
                        disabled={loading || Boolean(error) || !recording}
                    >
                        {showAll ? "View next" : "View flow"}
                    </button>
                    <button
                        type="button"
                        className="pn-btn pn-btn--primary"
                        onClick={() => void onSendNext()}
                        disabled={loading || Boolean(error) || index >= steps.length}
                        title="Creates a new replay tab if needed"
                    >
                        Send next
                    </button>
                </div>
            </div>
        </div>
    );
}
