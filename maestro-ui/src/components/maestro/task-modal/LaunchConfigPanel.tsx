import React, { useState } from "react";
import {
    AgentTool, ModelType, TeamMember, MemberLaunchOverride, LaunchAccessMode,
} from "../../../app/types/maestro";
import { ClaudeCodeSkillsSelector } from "../ClaudeCodeSkillsSelector";
import { Icon } from "../redesign/kit";
import {
    getEffectiveCommandEnabled,
    isCommandAllowedForMode,
    toggleCommandOverride,
} from "../../../utils/commandPermissions";
import {
    ACCESS_MODE_OPTIONS,
    accessModeFromPermissionMode,
    AGENT_TOOLS,
    AGENT_TOOL_LABELS,
    createLaunchConfig,
    createLaunchConfigFromLegacy,
    DEFAULT_MODEL_BY_AGENT_TOOL,
    MODELS_BY_AGENT_TOOL,
} from "../../../app/constants/agentTools";

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

export interface MemberConfig {
    agentTool: AgentTool;
    model: ModelType;
    accessMode: LaunchAccessMode;
    skillIds: string[];
    commandOverrides: Record<string, boolean>;
}

interface LaunchConfigPanelProps {
    selectedTeamMemberIds: string[];
    teamMembers: TeamMember[];
    memberConfigs: Record<string, MemberConfig>;
    onUpdateConfig: (memberId: string, patch: Partial<MemberConfig>) => void;
    onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildDefaultMemberConfig(member: TeamMember): MemberConfig {
    const tool = (member.agentTool || 'claude-code') as AgentTool;
    return {
        agentTool: tool,
        model: (member.model || DEFAULT_MODEL[tool] || 'sonnet') as ModelType,
        accessMode: defaultAccessModeForMember(member),
        skillIds: member.skillIds ? [...member.skillIds] : [],
        commandOverrides: member.commandPermissions?.commands
            ? { ...member.commandPermissions.commands }
            : {},
    };
}

export function buildMemberConfigFromOverride(member: TeamMember, override: MemberLaunchOverride): MemberConfig {
    const launchConfig = override.launchConfig || createLaunchConfigFromLegacy(
        override.agentTool,
        override.model || member.model,
        override.reasoningEffort,
        override.permissionMode,
    );
    const providerTool = launchConfig?.provider === 'openai'
        ? 'codex'
        : launchConfig?.provider === 'claude'
            ? 'claude-code'
            : launchConfig?.provider;
    const tool = (providerTool || member.agentTool || 'claude-code') as AgentTool;
    return {
        agentTool: tool,
        model: (launchConfig?.model || member.model || DEFAULT_MODEL[tool] || 'sonnet') as ModelType,
        accessMode: launchConfig?.accessMode ?? defaultAccessModeForMember(member),
        skillIds: override.skillIds ? [...override.skillIds] : (member.skillIds ? [...member.skillIds] : []),
        commandOverrides: override.commandPermissions?.commands
            ? { ...override.commandPermissions.commands }
            : (member.commandPermissions?.commands ? { ...member.commandPermissions.commands } : {}),
    };
}

export function buildOverridesFromConfigs(
    configs: Record<string, MemberConfig>,
    teamMembers: TeamMember[],
): Record<string, MemberLaunchOverride> {
    const overrides: Record<string, MemberLaunchOverride> = {};
    for (const [id, config] of Object.entries(configs)) {
        const member = teamMembers.find(m => m.id === id);
        if (!member) continue;

        const override: MemberLaunchOverride = {};
        const modelChanged = config.model !== (member.model || DEFAULT_MODEL[member.agentTool || 'claude-code']);
        const toolChanged = config.agentTool !== (member.agentTool || 'claude-code');

        const memberDefaultAccess = defaultAccessModeForMember(member);
        const accessChanged = config.accessMode !== memberDefaultAccess;
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
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LaunchConfigPanel({
    selectedTeamMemberIds,
    teamMembers,
    memberConfigs,
    onUpdateConfig,
    onClose,
}: LaunchConfigPanelProps) {
    const [expandedAdvanced, setExpandedAdvanced] = useState<Set<string>>(new Set());
    const [expandedCommandGroups, setExpandedCommandGroups] = useState<Set<string>>(new Set());

    const selectedMembers = selectedTeamMemberIds
        .map(id => teamMembers.find(m => m.id === id))
        .filter(Boolean) as TeamMember[];

    const isSingleMember = selectedMembers.length === 1;

    const handleToolChange = (memberId: string, tool: AgentTool) => {
        const defaultModel = (DEFAULT_MODEL[tool] || 'sonnet') as ModelType;
        onUpdateConfig(memberId, { agentTool: tool, model: defaultModel });
    };

    const handleCommandToggle = (memberId: string, cmd: string, memberMode: string | undefined) => {
        const current = memberConfigs[memberId];
        if (!current) return;
        const newOverrides = toggleCommandOverride(current.commandOverrides, cmd, memberMode);
        onUpdateConfig(memberId, { commandOverrides: newOverrides });
    };

    const toggleCommandGroup = (groupKey: string) => {
        setExpandedCommandGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            return next;
        });
    };

    const toggleAdvanced = (memberId: string) => {
        setExpandedAdvanced(prev => {
            const next = new Set(prev);
            if (next.has(memberId)) next.delete(memberId);
            else next.add(memberId);
            return next;
        });
    };

    if (selectedMembers.length === 0) {
        return (
            <div className="launchConfigInline" style={{ background: 'transparent', border: 'none' }}>
                <div className="launchConfigInline__header" style={{ borderColor: 'var(--pn-line)' }}>
                    <span className="pn-flabel">Launch Configuration</span>
                    <button type="button" className="pn-mchip" onClick={onClose} title="Back to description"><Icon name="x" size={13} /></button>
                </div>
                <div className="pn-fhint" style={{ textAlign: 'center', padding: '20px' }}>
                    Select at least one team member to configure launch options.
                </div>
            </div>
        );
    }

    const renderMemberConfig = (member: TeamMember) => {
        const config = memberConfigs[member.id];
        if (!config) return null;

        const models = MODELS_BY_TOOL[config.agentTool] || [];
        const memberMode = member.mode || 'worker';
        const isAdvancedOpen = expandedAdvanced.has(member.id);

        return (
            <div key={member.id} className="launchConfigInline__card" style={{ background: 'var(--pn-surface)', border: '1px solid var(--pn-line-2)', borderRadius: 'var(--pn-r-sm)' }}>
                {/* Member identity (only show for multi-member) */}
                {!isSingleMember && (
                    <div className="launchConfigInline__cardIdentity">
                        <span className="launchConfigInline__avatar">{member.avatar}</span>
                        <span className="launchConfigInline__name" style={{ color: 'var(--pn-ink)' }}>{member.name}</span>
                        <span className="pn-fhint">{member.role}</span>
                    </div>
                )}

                {/* Core controls row */}
                <div className="launchConfigInline__controls" style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    <div className="pn-fld" style={{ flex: 1 }}>
                        <label className="pn-flabel">Agent</label>
                        <select
                            className="pn-select"
                            value={config.agentTool}
                            onChange={(e) => handleToolChange(member.id, e.target.value as AgentTool)}
                        >
                            {AGENT_TOOLS.map(t => (
                                <option key={t} value={t}>{AGENT_TOOL_LABELS[t]}</option>
                            ))}
                        </select>
                    </div>

                    <div className="pn-fld" style={{ flex: 1 }}>
                        <label className="pn-flabel">Model</label>
                        <select
                            className="pn-select"
                            value={config.model}
                            onChange={(e) => onUpdateConfig(member.id, { model: e.target.value as ModelType })}
                        >
                            {models.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="pn-fld" style={{ flex: '0 1 160px' }}>
                        <label className="pn-flabel">Access</label>
                        <select
                            className="pn-select"
                            value={config.accessMode}
                            onChange={(e) => onUpdateConfig(member.id, { accessMode: e.target.value as LaunchAccessMode })}
                            title={ACCESS_MODE_OPTIONS.find(option => option.value === config.accessMode)?.description}
                        >
                            {ACCESS_MODE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Advanced toggle */}
                <button type="button"
                    className="launchConfigInline__advancedToggle"
                    style={{ color: 'var(--pn-ink-2)' }}
                    onClick={() => toggleAdvanced(member.id)}
                >
                    <Icon name={isAdvancedOpen ? 'chevronD' : 'chevronR'} size={11} />
                    <span>Advanced</span>
                    {(config.skillIds.length > 0 || Object.keys(config.commandOverrides).length > 0) && (
                        <span className="pn-mtab__n">
                            {config.skillIds.length + Object.keys(config.commandOverrides).length}
                        </span>
                    )}
                </button>

                {/* Advanced section */}
                {isAdvancedOpen && (
                    <div className="launchConfigInline__advanced">
                        {/* Skills */}
                        <div className="launchConfigInline__section">
                            <ClaudeCodeSkillsSelector
                                selectedSkills={config.skillIds}
                                onSelectionChange={(skills) => onUpdateConfig(member.id, { skillIds: skills })}
                            />
                        </div>

                        {/* Command Permissions */}
                        <div className="launchConfigInline__section">
                            <div className="tmModal__permCard" style={{ background: 'var(--pn-surface)', border: '1px solid var(--pn-line)', borderRadius: 'var(--pn-r-sm)' }}>
                                <div className="pn-flabel" style={{ marginBottom: '6px' }}>Command Permissions</div>
                                <div className="pn-fhint" style={{ marginBottom: '6px' }}>
                                    Toggle to restrict or grant commands.
                                </div>
                                {COMMAND_GROUPS.map(group => {
                                    const groupKey = `${member.id}:${group.key}`;
                                    const isExpanded = expandedCommandGroups.has(groupKey);
                                    const supportedCommands = group.commands.filter(c => isCommandAllowedForMode(c, memberMode));
                                    const enabledCount = supportedCommands.filter(c => getEffectiveCommandEnabled(c, memberMode, config.commandOverrides)).length;
                                    return (
                                        <div key={group.key} style={{ marginBottom: '2px' }}>
                                            <button
                                                type="button"
                                                onClick={() => toggleCommandGroup(groupKey)}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    fontSize: '11px', padding: '3px 0', color: 'var(--pn-ink)',
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    width: '100%', fontFamily: 'var(--pn-mono)',
                                                }}
                                            >
                                                <span style={{ color: 'var(--pn-ink-3)', fontSize: '10px', display: 'inline-flex' }}>
                                                    <Icon name={isExpanded ? 'chevronD' : 'chevronR'} size={10} />
                                                </span>
                                                <span style={{ fontWeight: 500 }}>{group.label}</span>
                                                <span style={{ opacity: 0.5, fontSize: '10px' }}>
                                                    ({enabledCount}/{supportedCommands.length})
                                                </span>
                                            </button>
                                            {isExpanded && (
                                                <div style={{ paddingLeft: '20px', display: 'flex', flexWrap: 'wrap', gap: '4px 16px', paddingTop: '4px', paddingBottom: '4px' }}>
                                                    {group.commands.map(cmd => {
                                                        const modeSupported = isCommandAllowedForMode(cmd, memberMode);
                                                        const isChecked = getEffectiveCommandEnabled(cmd, memberMode, config.commandOverrides);
                                                        return (
                                                            <label
                                                                key={cmd}
                                                                className="terminalTaskCheckbox"
                                                                title={modeSupported ? undefined : 'Not available for current mode'}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '5px',
                                                                    cursor: modeSupported ? 'pointer' : 'not-allowed',
                                                                    opacity: modeSupported ? (isChecked ? 1 : 0.6) : 0.35,
                                                                    marginRight: 0,
                                                                }}
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    if (modeSupported) {
                                                                        handleCommandToggle(member.id, cmd, memberMode);
                                                                    }
                                                                }}
                                                            >
                                                                <input type="checkbox" checked={isChecked} readOnly />
                                                                <span
                                                                    className={`terminalTaskCheckmark ${isChecked ? 'terminalTaskCheckmark--checked' : ''}`}
                                                                    style={{ width: '14px', height: '14px', fontSize: '9px' }}
                                                                >
                                                                    {isChecked ? '\u2713' : ''}
                                                                </span>
                                                                <span style={{ fontSize: '10px', whiteSpace: 'nowrap', fontFamily: 'var(--pn-mono)', color: 'var(--pn-ink)' }}>
                                                                    {cmd}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="launchConfigInline" style={{ background: 'transparent', border: 'none' }}>
            <div className="launchConfigInline__header" style={{ borderColor: 'var(--pn-line)' }}>
                <span className="pn-flabel" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Launch Configuration
                    {isSingleMember && selectedMembers[0] && (
                        <span className="launchConfigInline__headerMember" style={{ color: 'var(--pn-ink-2)' }}>
                            <span>{selectedMembers[0].avatar}</span>
                            <span>{selectedMembers[0].name}</span>
                        </span>
                    )}
                </span>
                <button type="button" className="pn-mchip" onClick={onClose} title="Back to description"><Icon name="x" size={13} /></button>
            </div>
            <div className="launchConfigInline__body">
                {selectedMembers.map(renderMemberConfig)}
            </div>
        </div>
    );
}
