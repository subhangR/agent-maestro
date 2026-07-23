import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AgentTool, LaunchConfig, TeamMember } from "../../../app/types/maestro";
import { Icon, AgentTile, type AgentKind } from "../redesign/kit";
import {
    AGENT_TOOLS,
    AGENT_TOOL_LABELS,
    MODELS_BY_AGENT_TOOL,
    PROVIDER_TO_AGENT_TOOL,
    createLaunchConfig,
    getModelDisplayLabel,
} from "../../../app/constants/agentTools";

type ModelPickerChipProps = {
    value: LaunchConfig | null;
    onChange: (config: LaunchConfig | null) => void;
    // Sole assignee — their model is what "Auto" resolves to when set
    fallbackMember?: TeamMember;
};

const agentKindForTool = (tool?: string): AgentKind =>
    !tool || tool === "claude-code" ? "claude" : tool;

const PANEL_WIDTH = 260;
const PANEL_MAX_HEIGHT = 360;

/**
 * Always-visible model assignment for a task. Shows the effective model
 * (task override, else sole assignee's default, else "Auto") and opens a
 * grouped agent/model picker. Selecting a model persists it on the task so
 * every run of the task launches with it.
 */
export function ModelPickerChip({ value, onChange, fallbackMember }: ModelPickerChipProps) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

    // Same portal-anchoring approach as the assignee picker: the modal clips
    // overflow, so the panel is portaled to body and pinned above the chip.
    useLayoutEffect(() => {
        if (!open) return;
        const recalc = () => {
            const btn = btnRef.current;
            if (!btn) return;
            const rect = btn.getBoundingClientRect();
            const center = rect.left + rect.width / 2;
            const maxLeft = Math.max(8, window.innerWidth - PANEL_WIDTH - 8);
            const left = Math.min(Math.max(8, center - PANEL_WIDTH / 2), maxLeft);

            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            let bottom: number;
            if (spaceAbove >= PANEL_MAX_HEIGHT + 6) {
                bottom = window.innerHeight - rect.top + 6;
            } else if (spaceBelow >= PANEL_MAX_HEIGHT + 6) {
                bottom = window.innerHeight - (rect.bottom + 6 + PANEL_MAX_HEIGHT);
            } else {
                bottom = Math.max(8, Math.min(window.innerHeight - rect.top + 6,
                    window.innerHeight - PANEL_MAX_HEIGHT - 8));
            }
            setPos({ left, bottom });
        };
        recalc();
        window.addEventListener("resize", recalc);
        window.addEventListener("scroll", recalc, true);
        return () => {
            window.removeEventListener("resize", recalc);
            window.removeEventListener("scroll", recalc, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (btnRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const valueTool = value ? PROVIDER_TO_AGENT_TOOL[value.provider] : undefined;
    const chipKind = value
        ? agentKindForTool(valueTool)
        : fallbackMember?.model
            ? agentKindForTool(fallbackMember.agentTool)
            : undefined;
    const chipLabel = value
        ? getModelDisplayLabel(String(value.model))
        : fallbackMember?.model
            ? getModelDisplayLabel(fallbackMember.model)
            : "Model";
    const chipTitle = value
        ? `This task runs with ${getModelDisplayLabel(String(value.model))} — click to change`
        : fallbackMember?.model
            ? `Using ${fallbackMember.name}'s model — click to override for this task`
            : "Choose the model that runs this task";

    const handleSelect = (tool: AgentTool, model: string) => {
        onChange(createLaunchConfig(tool, model));
        setOpen(false);
    };

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={`pn-mchip ${value ? "pn-mchip--ref" : ""}`}
                onClick={() => setOpen(o => !o)}
                title={chipTitle}
            >
                {chipKind ? <AgentTile kind={chipKind} /> : <Icon name="sliders" size={13} />}
                <span style={{ marginLeft: 4 }}>{chipLabel}</span>
                {!value && fallbackMember?.model && (
                    <span style={{ marginLeft: 4, opacity: 0.55, fontSize: 10 }}>auto</span>
                )}
            </button>
            {open && pos && createPortal(
                <div
                    ref={panelRef}
                    className="ttp-pop__panel"
                    style={{
                        position: "fixed",
                        left: pos.left,
                        bottom: pos.bottom,
                        width: PANEL_WIDTH,
                        maxWidth: "calc(100vw - 16px)",
                        maxHeight: PANEL_MAX_HEIGHT,
                        overflowY: "auto",
                        zIndex: 1001,
                        background: "var(--pn-card)",
                        border: "1px solid var(--pn-line-2)",
                        borderRadius: "var(--pn-r-md)",
                        boxShadow: "var(--pn-sh-pop)",
                        padding: 8,
                    }}
                >
                    <div className="pn-flabel" style={{ padding: "2px 8px 6px" }}>
                        Model for this task
                    </div>
                    <button
                        type="button"
                        className={`pn-mopt ${value ? "" : "pn-mopt--selected"}`}
                        onClick={() => { onChange(null); setOpen(false); }}
                        title="Use the assignee's model, or the workspace default"
                    >
                        <Icon name="refresh" size={13} />
                        <span style={{ flex: 1 }}>
                            Auto
                            {fallbackMember?.model && (
                                <span style={{ opacity: 0.55 }}>
                                    {" "}· {getModelDisplayLabel(fallbackMember.model)}
                                </span>
                            )}
                        </span>
                        {!value && <Icon name="check" size={13} />}
                    </button>
                    {AGENT_TOOLS.map(tool => (
                        <div key={tool}>
                            <div
                                className="pn-fhint"
                                style={{
                                    display: "flex", alignItems: "center", gap: 6,
                                    padding: "8px 8px 3px", fontWeight: 600,
                                    textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em",
                                }}
                            >
                                <AgentTile kind={agentKindForTool(tool)} /> {AGENT_TOOL_LABELS[tool]}
                            </div>
                            {(MODELS_BY_AGENT_TOOL[tool] || []).map(m => {
                                const selected = !!value && valueTool === tool && String(value.model) === String(m.value);
                                return (
                                    <button
                                        key={m.value}
                                        type="button"
                                        className={`pn-mopt ${selected ? "pn-mopt--selected" : ""}`}
                                        onClick={() => handleSelect(tool, String(m.value))}
                                    >
                                        <span style={{ flex: 1 }}>{m.label}</span>
                                        {selected && <Icon name="check" size={13} />}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}
