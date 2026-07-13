import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTeamMemberIntroStore } from "../../stores/useTeamMemberIntroStore";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { getInstrumentEmoji } from "../../services/soundTemplates";
import { createLaunchConfigFromLegacy, formatLaunchConfigLabel } from "../../app/constants/agentTools";
import type { TeamMember } from "../../app/types/maestro";
import { Icon } from "./redesign/kit";
import { TeamMemberModal } from "./TeamMemberModal";

// ─── Helpers ────────────────────────────────────────────────────────────────

function modeLabel(mode?: TeamMember["mode"]): string {
    if (mode === "worker" || mode === "coordinated-worker" || (mode as string) === "execute") return "Worker";
    if (!mode) return "Worker";
    return "Orchestrator";
}

const CAPABILITY_LABELS: Record<string, string> = {
    can_spawn_sessions: "Spawn sessions",
    can_edit_tasks: "Edit tasks",
    can_report_task_level: "Report task-level",
    can_report_session_level: "Report session-level",
};

function enabledCapabilities(member: TeamMember): string[] {
    const caps = member.capabilities || {};
    return Object.entries(caps)
        .filter(([, on]) => !!on)
        .map(([key]) => CAPABILITY_LABELS[key] || key);
}

// ─── Config summary row ───────────────────────────────────────────────────────

function SummaryRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--pn-line)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, width: 116, flexShrink: 0, color: "var(--pn-ink-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                {icon}
                {label}
            </span>
            <span style={{ flex: 1, minWidth: 0, color: "var(--pn-ink)", fontSize: 12.5 }}>{children}</span>
        </div>
    );
}

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, border: "1px solid var(--pn-line-2)", background: "var(--pn-surface)", fontSize: 11, marginRight: 4, marginBottom: 4 }}>
            {children}
        </span>
    );
}

// ─── Host (self-mounted, reads the intro store) ───────────────────────────────

export function TeamMemberIntroDialog() {
    const isOpen = useTeamMemberIntroStore((s) => s.isOpen);
    const queue = useTeamMemberIntroStore((s) => s.queue);
    const currentIndex = useTeamMemberIntroStore((s) => s.currentIndex);
    const goNext = useTeamMemberIntroStore((s) => s.goNext);
    const goPrev = useTeamMemberIntroStore((s) => s.goPrev);
    const close = useTeamMemberIntroStore((s) => s.close);

    const teamMembers = useMaestroStore((s) => s.teamMembers);
    const [isEditing, setIsEditing] = useState(false);

    const currentId = queue[currentIndex];
    const member = currentId ? teamMembers[currentId] : undefined;

    // If the member currently being introduced is deleted out from under us,
    // advance past it so the dialog never shows a stale/empty card.
    useEffect(() => {
        if (isOpen && currentId && !member) goNext();
    }, [isOpen, currentId, member, goNext]);

    // Keyboard: Esc closes the intro (when not in the edit modal).
    useEffect(() => {
        if (!isOpen || isEditing) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                close();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, isEditing, close]);

    const launchLabel = useMemo(() => {
        if (!member) return "";
        const cfg = createLaunchConfigFromLegacy(member.agentTool || "claude-code", member.model || "sonnet", undefined, member.permissionMode);
        return formatLaunchConfigLabel(cfg || undefined);
    }, [member]);

    if (!isOpen || !member) {
        // Keep the edit modal mounted even after the intro closes so a save
        // initiated from Edit can finish; it self-dismisses via onClose.
        return null;
    }

    const total = queue.length;
    const isLast = currentIndex >= total - 1;
    const caps = enabledCapabilities(member);

    return createPortal(
        <>
            <div className="themedModalBackdrop" onClick={close}>
                <div className="pn-mdl" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <div className="pn-mdl__hd">
                        <div className="pn-mdl__hdmain">
                            <div className="pn-mdl__crumb">
                                <Icon name="users" />
                                <b>New teammate</b>
                                {total > 1 && (
                                    <>
                                        <Icon name="chevronR" size={11} />
                                        <span>{currentIndex + 1} of {total}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <button type="button" className="pn-mdl__close" onClick={close} title="Close">
                            <Icon name="x" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="pn-mdl__body">
                        {/* Hero */}
                        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                            <div style={{ fontSize: 40, lineHeight: 1, width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, background: "var(--pn-brand-soft)", border: "1px solid var(--pn-line-2)", flexShrink: 0 }}>
                                {member.avatar || "🤖"}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--pn-ink-4)", marginBottom: 2 }}>
                                    Say hello to
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--pn-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {member.name}
                                </div>
                                <div style={{ fontSize: 12.5, color: "var(--pn-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {member.role}
                                </div>
                            </div>
                        </div>

                        {/* Identity blurb */}
                        {member.identity?.trim() && (
                            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--pn-ink-2)", background: "var(--pn-surface)", border: "1px solid var(--pn-line)", borderRadius: "var(--pn-r-sm)", padding: "10px 12px", marginBottom: 14, maxHeight: 130, overflow: "auto", whiteSpace: "pre-wrap" }}>
                                {member.identity.trim()}
                            </div>
                        )}

                        {/* Config summary */}
                        <div>
                            <SummaryRow icon={<Icon name="bot" size={12} />} label="Agent">
                                {launchLabel}
                            </SummaryRow>
                            <SummaryRow icon={<Icon name="baton" size={12} />} label="Mode">
                                <Chip>{modeLabel(member.mode)}</Chip>
                                <Chip>{member.permissionMode || "acceptEdits"}</Chip>
                            </SummaryRow>
                            <SummaryRow icon={<Icon name="globe" size={12} />} label="Scope">
                                {member.scope === "global" ? "🌐 Global — all projects" : "Project"}
                            </SummaryRow>
                            <SummaryRow icon={<Icon name="sparkles" size={12} />} label="Skills">
                                {member.skillIds && member.skillIds.length > 0
                                    ? `${member.skillIds.length} skill${member.skillIds.length === 1 ? "" : "s"}`
                                    : <span style={{ color: "var(--pn-ink-4)" }}>None</span>}
                            </SummaryRow>
                            <SummaryRow icon={<Icon name="shield" size={12} />} label="Can">
                                {caps.length > 0
                                    ? caps.map((c) => <Chip key={c}>{c}</Chip>)
                                    : <span style={{ color: "var(--pn-ink-4)" }}>No extra capabilities</span>}
                            </SummaryRow>
                            <SummaryRow icon={<Icon name="music" size={12} />} label="Voice">
                                {getInstrumentEmoji(member.soundInstrument || "piano")} {member.soundInstrument || "piano"}
                            </SummaryRow>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="pn-mdl__foot">
                        <div className="pn-mdl__footL">
                            <button type="button" className="pn-btn pn-btn--ghost" onClick={() => setIsEditing(true)}>
                                <Icon name="pen" size={13} /> Edit config
                            </button>
                        </div>
                        <div className="pn-mdl__footR">
                            <button type="button" className="pn-btn pn-btn--ghost" onClick={close}>
                                {isLast ? "Close" : "Skip all"}
                            </button>
                            {currentIndex > 0 && (
                                <button type="button" className="pn-btn pn-btn--ghost" onClick={goPrev} title="Previous">
                                    <Icon name="chevronL" size={13} /> Back
                                </button>
                            )}
                            <button type="button" className="pn-btn pn-btn--primary" onClick={goNext}>
                                {isLast ? (
                                    <><Icon name="check" size={13} /> Done</>
                                ) : (
                                    <>Next <Icon name="arrowRight" size={13} /></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Full editor — reuses the canonical TeamMemberModal in edit mode. */}
            <TeamMemberModal
                isOpen={isEditing}
                onClose={() => setIsEditing(false)}
                projectId={member.projectId}
                teamMember={member}
            />
        </>,
        document.body
    );
}
