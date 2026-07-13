import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
    AgentTool, LaunchAccessMode, ModelType, TeamMember, MemberLaunchOverride,
} from "../../app/types/maestro";
import { ClaudeCodeSkillsSelector } from "./ClaudeCodeSkillsSelector";
import { Icon } from "./redesign/kit";
import { useProjectStore } from "../../stores/useProjectStore";
import {
    getEffectiveCommandEnabled,
    isCommandAllowedForMode,
    toggleCommandOverride,
} from "../../utils/commandPermissions";
import {
    ACCESS_MODE_OPTIONS,
    accessModeFromPermissionMode,
    AGENT_TOOLS,
    AGENT_TOOL_LABELS,
    createLaunchConfig,
    DEFAULT_MODEL_BY_AGENT_TOOL,
    MODELS_BY_AGENT_TOOL,
} from "../../app/constants/agentTools";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODELS_BY_TOOL = MODELS_BY_AGENT_TOOL;
const DEFAULT_MODEL = DEFAULT_MODEL_BY_AGENT_TOOL;
const defaultAccessModeForMember = (member: TeamMember): LaunchAccessMode => (
    accessModeFromPermissionMode(member.permissionMode) || 'safe'
);

const COMMAND_GROUPS = [
    { key: 'root', label: 'Root', commands: ['whoami', 'status', 'commands'] },
    { key: 'task', label: 'Task', commands: ['task:list', 'task:get', 'task:create', 'task:edit', 'task:delete', 'task:children', 'task:report:progress', 'task:report:complete', 'task:report:blocked', 'task:report:error', 'task:docs:add', 'task:docs:list'] },
    { key: 'session', label: 'Session', commands: ['session:siblings', 'session:info', 'session:prompt', 'session:report:progress', 'session:report:complete', 'session:report:blocked', 'session:report:error', 'session:docs:add', 'session:docs:list'] },
    { key: 'team-member', label: 'Team Member', commands: ['team-member:create', 'team-member:list', 'team-member:get'] },
    { key: 'show', label: 'Show', commands: ['show:modal'] },
    { key: 'modal', label: 'Modal', commands: ['modal:events'] },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamLaunchConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    coordinatorId: string | null;
    workerIds: string[];
    teamMembers: TeamMember[];
    projectId: string;
    onLaunch: (overrides: Record<string, MemberLaunchOverride>) => void;
    onSave?: (overrides: Record<string, MemberLaunchOverride>) => void;
    onSaveAsTeam: (teamName: string, overrides: Record<string, MemberLaunchOverride>) => void;
}

// Per-member local state
interface MemberConfig {
    agentTool: AgentTool;
    model: ModelType;
    accessMode: LaunchAccessMode;
    skillIds: string[];
    commandOverrides: Record<string, boolean>;
    expanded: boolean; // whether this member's details panel is open
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TeamLaunchConfigModal({
    isOpen,
    onClose,
    coordinatorId,
    workerIds,
    teamMembers,
    projectId,
    onLaunch,
    onSave,
    onSaveAsTeam,
}: TeamLaunchConfigModalProps) {
    // Resolve project working directory for local skill discovery
    const projectWorkingDir = useProjectStore(s => {
        const project = s.projects.find(p => p.id === projectId);
        return project?.basePath || project?.workingDir || undefined;
    });

    // Build initial configs from team members
    const buildInitialConfigs = useCallback((): Record<string, MemberConfig> => {
        const configs: Record<string, MemberConfig> = {};
        const allIds = [coordinatorId, ...workerIds].filter(Boolean) as string[];

        for (const id of allIds) {
            const member = teamMembers.find(m => m.id === id);
            if (!member) continue;

            const tool = (member.agentTool || 'claude-code') as AgentTool;
            configs[id] = {
                agentTool: tool,
                model: (member.model || DEFAULT_MODEL[tool] || 'sonnet') as ModelType,
                accessMode: defaultAccessModeForMember(member),
                skillIds: member.skillIds ? [...member.skillIds] : [],
                commandOverrides: member.commandPermissions?.commands
                    ? { ...member.commandPermissions.commands }
                    : {},
                expanded: false,
            };
        }
        return configs;
    }, [coordinatorId, workerIds, teamMembers]);

    const [configs, setConfigs] = useState<Record<string, MemberConfig>>(() => buildInitialConfigs());
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [teamName, setTeamName] = useState('');
    const [expandedCommandGroups, setExpandedCommandGroups] = useState<Set<string>>(new Set());

    // Reset state when modal opens with new members
    React.useEffect(() => {
        if (isOpen) {
            setConfigs(buildInitialConfigs());
            setShowSaveDialog(false);
            setTeamName('');
        }
    }, [isOpen, buildInitialConfigs]);

    const updateConfig = (memberId: string, patch: Partial<MemberConfig>) => {
        setConfigs(prev => ({
            ...prev,
            [memberId]: { ...prev[memberId], ...patch },
        }));
    };

    const handleToolChange = (memberId: string, tool: AgentTool) => {
        const defaultModel = (DEFAULT_MODEL[tool] || 'sonnet') as ModelType;
        updateConfig(memberId, { agentTool: tool, model: defaultModel });
    };

    const handleCommandToggle = (memberId: string, cmd: string, memberMode: string | undefined) => {
        setConfigs(prev => {
            const current = prev[memberId];
            const newOverrides = toggleCommandOverride(current.commandOverrides, cmd, memberMode);
            return { ...prev, [memberId]: { ...current, commandOverrides: newOverrides } };
        });
    };

    const toggleCommandGroup = (groupKey: string) => {
        setExpandedCommandGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            return next;
        });
    };

    const toggleMemberExpanded = (memberId: string) => {
        updateConfig(memberId, { expanded: !configs[memberId]?.expanded });
    };

    // Build overrides from configs
    const buildOverrides = (): Record<string, MemberLaunchOverride> => {
        const overrides: Record<string, MemberLaunchOverride> = {};
        for (const [id, config] of Object.entries(configs)) {
            const member = teamMembers.find(m => m.id === id);
            if (!member) continue;

            const override: MemberLaunchOverride = {};
            const modelChanged = config.model !== (member.model || DEFAULT_MODEL[member.agentTool || 'claude-code']);
            const toolChanged = config.agentTool !== (member.agentTool || 'claude-code');

            const accessChanged = config.accessMode !== defaultAccessModeForMember(member);
            if (toolChanged || modelChanged || accessChanged) {
                override.launchConfig = {
                    ...createLaunchConfig(config.agentTool, config.model),
                    ...(accessChanged ? { accessMode: config.accessMode } : {}),
                };
            }

            const origSkills = member.skillIds || [];
            if (JSON.stringify(config.skillIds.sort()) !== JSON.stringify([...origSkills].sort())) {
                override.skillIds = config.skillIds;
            }

            const origCmds = member.commandPermissions?.commands || {};
            if (JSON.stringify(config.commandOverrides) !== JSON.stringify(origCmds)) {
                override.commandPermissions = { commands: config.commandOverrides };
            }

            if (Object.keys(override).length > 0) {
                overrides[id] = override;
            }
        }
        return overrides;
    };

    const handleLaunch = () => {
        onLaunch(buildOverrides());
        onClose();
    };

    const handleSave = () => {
        if (onSave) {
            onSave(buildOverrides());
            onClose();
        }
    };

    const handleSaveAsTeam = () => {
        if (!teamName.trim()) return;
        onSaveAsTeam(teamName.trim(), buildOverrides());
        onClose();
    };

    if (!isOpen) return null;

    const allMemberIds = [coordinatorId, ...workerIds].filter(Boolean) as string[];
    const members = allMemberIds
        .map(id => teamMembers.find(m => m.id === id))
        .filter(Boolean) as TeamMember[];

    return createPortal(
        <div className="themedModalBackdrop" onClick={onClose}>
            <div
                className="pn-mdl launchConfigModal"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="pn-mdl__hd">
                    <div className="pn-mdl__hdmain">
                        <div className="pn-mdl__crumb"><Icon name="play" /> <b>Launch</b></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h2 className="pn-mdl__titleinput" style={{ margin: 0, width: 'auto' }}>Launch configuration</h2>
                            <span className="pn-badge">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <button type="button" className="pn-mdl__close" onClick={onClose}><Icon name="x" /></button>
                </div>

                {/* Content */}
                <div className="pn-mdl__body" style={{ flex: 1 }}>
                    {members.length === 0 ? (
                        <div className="pn-fhint" style={{ textAlign: 'center', padding: '20px' }}>
                            No team members selected. Select a coordinator and workers first.
                        </div>
                    ) : (
                        <div className="launchConfigMembers" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {members.map((member) => {
                                const config = configs[member.id];
                                if (!config) return null;
                                const isCoordinator = member.id === coordinatorId;
                                const models = MODELS_BY_TOOL[config.agentTool] || [];
                                const memberMode = member.mode || 'worker';

                                return (
                                    <div
                                        key={member.id}
                                        className={`launchConfigCard ${isCoordinator ? 'launchConfigCard--coordinator' : ''}`}
                                        style={{
                                            border: `1px solid ${isCoordinator ? 'rgba(178,106,43,0.4)' : 'var(--pn-line-2)'}`,
                                            borderRadius: 'var(--pn-r-md)',
                                            background: isCoordinator ? 'var(--pn-brand-soft)' : 'var(--pn-surface)',
                                            padding: 12,
                                        }}
                                    >
                                        {/* Card header row */}
                                        <div className="launchConfigCardHeader" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                            <div className="launchConfigCardIdentity" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 160 }}>
                                                <span className="launchConfigCardAvatar" style={{ width: 30, height: 30, borderRadius: 'var(--pn-r-sm)', display: 'grid', placeItems: 'center', background: 'var(--pn-active)', fontSize: 16, flex: '0 0 auto' }}>{member.avatar}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                    <span className="launchConfigCardName" style={{ fontSize: 13, fontWeight: 600, color: 'var(--pn-ink)' }}>{member.name}</span>
                                                    {isCoordinator && (
                                                        <span className="pn-badge">COORD</span>
                                                    )}
                                                    <span className="launchConfigCardRole" style={{ fontSize: 11, color: 'var(--pn-ink-3)' }}>{member.role}</span>
                                                </div>
                                            </div>

                                            <div className="launchConfigCardControls" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                {/* Agent Tool */}
                                                <select
                                                    className="pn-select"
                                                    style={{ width: 'auto' }}
                                                    value={config.agentTool}
                                                    onChange={(e) => handleToolChange(member.id, e.target.value as AgentTool)}
                                                >
                                                    {AGENT_TOOLS.map(t => (
                                                        <option key={t} value={t}>{AGENT_TOOL_LABELS[t]}</option>
                                                    ))}
                                                </select>

                                                {/* Model */}
                                                <select
                                                    className="pn-select"
                                                    style={{ width: 'auto' }}
                                                    value={config.model}
                                                    onChange={(e) => updateConfig(member.id, { model: e.target.value as ModelType })}
                                                >
                                                    {models.map(m => (
                                                        <option key={m.value} value={m.value}>{m.label}</option>
                                                    ))}
                                                </select>

                                                {/* Access mode */}
                                                <select
                                                    className="pn-select"
                                                    style={{ width: 'auto', minWidth: 128 }}
                                                    value={config.accessMode}
                                                    onChange={(e) => updateConfig(member.id, { accessMode: e.target.value as LaunchAccessMode })}
                                                    title={ACCESS_MODE_OPTIONS.find(option => option.value === config.accessMode)?.description}
                                                >
                                                    {ACCESS_MODE_OPTIONS.map(option => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </select>

                                                {/* Expand/collapse */}
                                                <button type="button"
                                                    className="pn-mdl__close"
                                                    onClick={() => toggleMemberExpanded(member.id)}
                                                    title={config.expanded ? 'Collapse' : 'Skills & Commands'}
                                                >
                                                    <Icon name={config.expanded ? 'chevronD' : 'chevronR'} size={15} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded details */}
                                        {config.expanded && (
                                            <div className="launchConfigCardDetails" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                                                {/* Skills */}
                                                <div className="pn-fld">
                                                    <ClaudeCodeSkillsSelector
                                                        selectedSkills={config.skillIds}
                                                        onSelectionChange={(skills) => updateConfig(member.id, { skillIds: skills })}
                                                        projectPath={projectWorkingDir}
                                                    />
                                                </div>

                                                {/* Command Permissions */}
                                                <div className="pn-fld">
                                                    <span className="pn-flabel">Command Permissions</span>
                                                    <div className="pn-fhint" style={{ marginBottom: '4px' }}>
                                                        Defaults depend on mode. Toggle to restrict or explicitly grant mode-supported commands.
                                                    </div>
                                                    {COMMAND_GROUPS.map(group => {
                                                        const isExpanded = expandedCommandGroups.has(`${member.id}:${group.key}`);
                                                        const supportedCommands = group.commands.filter(c => isCommandAllowedForMode(c, memberMode));
                                                        const enabledCount = supportedCommands.filter(c => getEffectiveCommandEnabled(c, memberMode, config.commandOverrides)).length;
                                                        return (
                                                            <div key={group.key} style={{ marginBottom: '2px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleCommandGroup(`${member.id}:${group.key}`)}
                                                                    style={{
                                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                                        fontSize: '11.5px', padding: '4px 0', color: 'var(--pn-ink)',
                                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                                        width: '100%', fontFamily: 'var(--pn-ui)',
                                                                    }}
                                                                >
                                                                    <Icon name={isExpanded ? 'chevronD' : 'chevronR'} size={12} style={{ color: 'var(--pn-ink-3)' }} />
                                                                    <span style={{ fontWeight: 600 }}>{group.label}</span>
                                                                    <span style={{ opacity: 0.5, fontSize: '10px', fontFamily: 'var(--pn-mono)' }}>
                                                                        ({enabledCount}/{supportedCommands.length})
                                                                    </span>
                                                                </button>
                                                                {isExpanded && (
                                                                    <div className="pn-caps" style={{ paddingLeft: 18 }}>
                                                                        {group.commands.map(cmd => {
                                                                            const modeSupported = isCommandAllowedForMode(cmd, memberMode);
                                                                            const isChecked = getEffectiveCommandEnabled(cmd, memberMode, config.commandOverrides);
                                                                            return (
                                                                                <div
                                                                                    key={cmd}
                                                                                    className="pn-cap"
                                                                                    title={modeSupported ? undefined : 'Not available for current mode'}
                                                                                    style={{
                                                                                        cursor: modeSupported ? 'pointer' : 'not-allowed',
                                                                                        opacity: modeSupported ? 1 : 0.4,
                                                                                    }}
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        if (modeSupported) {
                                                                                            handleCommandToggle(member.id, cmd, memberMode);
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    <input type="checkbox" checked={isChecked} readOnly style={{ display: 'none' }} />
                                                                                    <div className="pn-cap__body">
                                                                                        <div className="pn-cap__name" style={{ fontFamily: 'var(--pn-mono)', fontSize: 11.5 }}>{cmd}</div>
                                                                                    </div>
                                                                                    <span className={`pn-switch ${isChecked ? 'pn-switch--on' : ''}`}></span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="pn-mdl__foot">
                    <div className="pn-mdl__footL" />
                    <div className="pn-mdl__footR">
                        <button type="button" className="pn-btn pn-btn--ghost" onClick={onClose}>
                            Cancel
                        </button>

                        {!showSaveDialog ? (
                            <>
                                {onSave && (
                                    <button
                                        type="button"
                                        className="pn-btn"
                                        onClick={handleSave}
                                        title="Save overrides for this launch context"
                                    >
                                        Save
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="pn-btn"
                                    onClick={() => setShowSaveDialog(true)}
                                    title="Save this configuration as a reusable team"
                                >
                                    Save as Team
                                </button>
                                <button
                                    type="button"
                                    className="pn-btn pn-btn--primary"
                                    onClick={handleLaunch}
                                    disabled={members.length === 0}
                                >
                                    <Icon name="play" size={13} /> Launch
                                </button>
                            </>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    className="pn-input"
                                    style={{ width: '160px' }}
                                    placeholder="Team name..."
                                    value={teamName}
                                    onChange={(e) => setTeamName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveAsTeam();
                                        if (e.key === 'Escape') setShowSaveDialog(false);
                                    }}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    className="pn-btn pn-btn--ghost"
                                    onClick={() => setShowSaveDialog(false)}
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    className="pn-btn pn-btn--primary"
                                    onClick={handleSaveAsTeam}
                                    disabled={!teamName.trim()}
                                >
                                    Save & Launch
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
