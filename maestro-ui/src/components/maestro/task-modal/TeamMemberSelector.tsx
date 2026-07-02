import React, { useRef } from "react";
import { TeamMember } from "../../../app/types/maestro";
import { useDropdownPosition } from "../../../hooks/useDropdownPosition";
import { AGENT_TOOL_LABELS } from "../../../app/constants/agentTools";

type TeamMemberSelectorProps = {
    selectedTeamMemberIds: string[];
    onSelectionChange: (ids: string[]) => void;
    teamMembers: TeamMember[];
};

export function TeamMemberSelector({
    selectedTeamMemberIds,
    onSelectionChange,
    teamMembers,
}: TeamMemberSelectorProps) {
    const [showDropdown, setShowDropdown] = React.useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    const pos = useDropdownPosition(btnRef, showDropdown, "above");

    const selectedTeamMembers = selectedTeamMemberIds
        .map(id => teamMembers.find(m => m.id === id))
        .filter(Boolean) as TeamMember[];

    const toggleMember = (memberId: string) => {
        const isSelected = selectedTeamMemberIds.includes(memberId);
        onSelectionChange(
            isSelected
                ? selectedTeamMemberIds.filter(id => id !== memberId)
                : [...selectedTeamMemberIds, memberId]
        );
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="pn-flabel" style={{ letterSpacing: '0.06em' }}>Assignee</span>
            <div className="themedDropdownPicker" style={{ position: 'relative' }}>
                <button
                    ref={btnRef}
                    type="button"
                    className="pn-mchip"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowDropdown(!showDropdown);
                    }}
                >
                    {selectedTeamMembers.length > 0 ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>{selectedTeamMembers.map(m => m.avatar).join('')}</span>
                            <span>{selectedTeamMembers.length === 1 ? selectedTeamMembers[0].name : `${selectedTeamMembers.length} members`}</span>
                        </span>
                    ) : (
                        <span style={{ opacity: 0.6 }}>Select Team Members</span>
                    )}
                    <span className="themedDropdownCaret">{showDropdown ? '\u25B4' : '\u25BE'}</span>
                </button>
                {/*
                  * Rendered inline (NOT portaled to document.body) so the
                  * dropdown stays a DOM descendant of the footer's picker
                  * panel. The footer's outside-click handler uses
                  * pickerPanelRef.contains(target); a document.body sibling
                  * would read as an "outside" click and swallow the selection
                  * on mousedown (issue #131). The menu is position:fixed, so it
                  * is still viewport-anchored and escapes the panel's overflow.
                  */}
                {showDropdown && pos && (
                    <>
                        <div
                            className="themedDropdownOverlay"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDropdown(false);
                            }}
                        />
                        <div
                            className="themedDropdownMenu"
                            style={{ top: 'auto', bottom: pos.bottom, left: pos.left, minWidth: '240px', maxHeight: `${Math.min(window.innerHeight - 40, 320)}px`, overflowY: 'auto', background: 'var(--pn-card)', border: '1px solid var(--pn-line-2)', borderRadius: 'var(--pn-r-sm)', color: 'var(--pn-ink)', boxShadow: 'var(--pn-sh-pop)' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="pn-fhint" style={{ padding: '6px 10px', borderBottom: '1px solid var(--pn-line)', position: 'sticky', top: 0, backgroundColor: 'var(--pn-card)', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Select team members</span>
                                {selectedTeamMemberIds.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onSelectionChange([]); }}
                                        style={{ background: 'none', border: 'none', color: 'var(--theme-primary)', cursor: 'pointer', padding: '0 2px', fontSize: '10px', opacity: 0.7 }}
                                    >
                                        clear
                                    </button>
                                )}
                            </div>
                            {teamMembers.map(member => {
                                const isSelected = selectedTeamMemberIds.includes(member.id);
                                return (
                                    <button type="button"
                                        key={member.id}
                                        className={`themedDropdownOption ${isSelected ? 'themedDropdownOption--current' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleMember(member.id);
                                        }}
                                        style={{ textAlign: 'left' }}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                            <span style={{ fontSize: '14px', flexShrink: 0 }}>{member.avatar}</span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span className="themedDropdownLabel">{member.name}</span>
                                                <span style={{ display: 'block', fontSize: '9px', opacity: 0.5 }}>
                                                    {[
                                                        member.role,
                                                        member.agentTool ? AGENT_TOOL_LABELS[member.agentTool] || member.agentTool : null,
                                                        member.model,
                                                    ].filter(Boolean).join(' · ')}
                                                </span>
                                            </span>
                                            {isSelected && (
                                                <span className="themedDropdownCheck">{'\u2713'}</span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                            {teamMembers.length === 0 && (
                                <div style={{ padding: '8px 12px', fontSize: '11px', opacity: 0.5 }}>
                                    No team members configured
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            {selectedTeamMembers.length === 1 && (
                <span style={{ fontSize: '10px', opacity: 0.5 }}>
                    {[
                        selectedTeamMembers[0].agentTool ? AGENT_TOOL_LABELS[selectedTeamMembers[0].agentTool] : null,
                        selectedTeamMembers[0].model,
                    ].filter(Boolean).join(' / ')}
                </span>
            )}
            {selectedTeamMembers.length > 1 && (
                <span style={{ fontSize: '10px', opacity: 0.5 }}>
                    {selectedTeamMembers.map(m => m.avatar).join(' ')}
                </span>
            )}
        </div>
    );
}
