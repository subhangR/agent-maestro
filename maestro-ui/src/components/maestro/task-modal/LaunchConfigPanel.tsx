import React, { useState } from "react";
import {
    AgentTool, ModelType, TeamMember, MemberLaunchOverride,
} from "../../../app/types/maestro";
import { ClaudeCodeSkillsSelector } from "../ClaudeCodeSkillsSelector";
import {
    getEffectiveCommandEnabled,
    isCommandAllowedForMode,
    toggleCommandOverride,
} from "../../../utils/commandPermissions";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_TOOLS: AgentTool[] = ["claude-code", "codex", "gemini"];
const AGENT_TOOL_LABELS: Record<AgentTool, string> = {
    "claude-code": "Claude Code",
    "codex": "OpenAI Codex",
    "gemini": "Google Gemini",
};

const MODELS_BY_TOOL: Record<AgentTool, { value: ModelType; label: string }[]> = {
    "claude-code": [
        { value: "haiku", label: "Haiku" },
        { value: "sonnet", label: "Sonnet" },
        { value: "sonnet[1m]", label: "Sonnet [1M]" },
        { value: "opus", label: "Opus" },
        { value: "opus[1m]", label: "Opus [1M]" },
    ],
    "codex": [
        { value: "gpt-5.3-codex", label: "GPT 5.3" },
        { value: "gpt-5.2-codex", label: "GPT 5.2" },
    ],
    "gemini": [
        { value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
        { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
};

const DEFAULT_MODEL: Record<string, string> = {
    "claude-code": "sonnet",
    "codex": "gpt-5.3-codex",
    "gemini": "gemini-3-pro-preview",
};

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
    isDangerous: boolean;
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
        isDangerous: member.permissionMode === 'bypassPermissions',
        skillIds: member.skillIds ? [...member.skillIds] : [],
        commandOverrides: member.commandPermissions?.commands
            ? { ...member.commandPermissions.commands }
            : {},
    };
}

export function buildMemberConfigFromOverride(member: TeamMember, override: MemberLaunchOverride): MemberConfig {
    const tool = (override.agentTool || member.agentTool || 'claude-code') as AgentTool;
    const basePerm = override.permissionMode || member.permissionMode;
    return {
        agentTool: tool,
        model: (override.model || member.model || DEFAULT_MODEL[tool] || 'sonnet') as ModelType,
        isDangerous: basePerm === 'bypassPermissions',
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
        if (config.agentTool !== (member.agentTool || 'claude-code')) override.agentTool = config.agentTool;
        if (config.model !== (member.model || DEFAULT_MODEL[member.agentTool || 'claude-code'])) override.model = config.model;

        const expectedPerm = config.isDangerous ? 'bypassPermissions' : (member.permissionMode === 'bypassPermissions' ? 'acceptEdits' : member.permissionMode);
        if (expectedPerm !== member.permissionMode) override.permissionMode = expectedPerm as any;

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
            <div className="launchConfigInline">
                <div className="launchConfigInline__header">
                    <span className="launchConfigInline__title">Launch Configuration</span>
                    <button type="button" className="launchConfigInline__closeBtn" onClick={onClose} title="Back to description">&times;</button>
                </div>
                <div style={{ color: 'rgba(var(--theme-primary-rgb), 0.4)', textAlign: 'center', padding: '20px', fontSize: '11px' }}>
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
            <div key={member.id} className="launchConfigInline__card">
                {/* Member identity (only show for multi-member) */}
                {!isSingleMember && (
                    <div className="launchConfigInline__cardIdentity">
                        <span className="launchConfigInline__avatar">{member.avatar}</span>
                        <span className="launchConfigInline__name">{member.name}</span>
                        <span className="launchConfigInline__role">{member.role}</span>
                    </div>
                )}

                {/* Core controls row */}
                <div className="launchConfigInline__controls">
                    <div className="launchConfigInline__field">
                        <label className="launchConfigInline__label">Agent</label>
                        <select
                            className="launchConfigSelect launchConfigSelect--compact"
                            value={config.agentTool}
                            onChange={(e) => handleToolChange(member.id, e.target.value as AgentTool)}
                        >
                            {AGENT_TOOLS.map(t => (
                                <option key={t} value={t}>{AGENT_TOOL_LABELS[t]}</option>
                            ))}
                        </select>
                    </div>

                    <div className="launchConfigInline__field">
                        <label className="launchConfigInline__label">Model</label>
                        <select
                            className="launchConfigSelect launchConfigSelect--compact"
                            value={config.model}
                            onChange={(e) => onUpdateConfig(member.id, { model: e.target.value as ModelType })}
                        >
                            {models.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="launchConfigInline__field">
                        <label className="launchConfigInline__label">Permissions</label>
                        <button type="button"
                            className={`launchConfigToggle launchConfigToggle--compact ${config.isDangerous ? 'launchConfigToggle--active launchConfigToggle--danger' : ''}`}
                            onClick={() => onUpdateConfig(member.id, { isDangerous: !config.isDangerous })}
                            title={config.isDangerous ? 'Dangerous mode ON (bypassPermissions)' : 'Dangerous mode OFF'}
                        >
                            {config.isDangerous ? '\u26A0 dangerous' : '\u{1F6E1} safe'}
                        </button>
                    </div>
                </div>

                {/* Advanced toggle */}
                <button type="button"
                    className="launchConfigInline__advancedToggle"
                    onClick={() => toggleAdvanced(member.id)}
                >
                    <span style={{ fontSize: '9px', opacity: 0.5 }}>{isAdvancedOpen ? '\u25BC' : '\u25B6'}</span>
                    <span>Advanced</span>
                    {(config.skillIds.length > 0 || Object.keys(config.commandOverrides).length > 0) && (
                        <span className="launchConfigInline__badge">
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
                            <div className="tmModal__permCard">
                                <div className="tmModal__permCardLabel">Command Permissions</div>
                                <div className="themedFormHint" style={{ marginBottom: '6px' }}>
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
                                                    fontSize: '11px', padding: '3px 0', color: 'var(--theme-text)',
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    width: '100%', fontFamily: '"JetBrains Mono", monospace',
                                                }}
                                            >
                                                <span style={{ color: 'rgba(var(--theme-primary-rgb), 0.5)', fontSize: '10px' }}>
                                                    {isExpanded ? '\u25BC' : '\u25B6'}
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
                                                                <span style={{ fontSize: '10px', whiteSpace: 'nowrap', fontFamily: '"JetBrains Mono", monospace', color: 'var(--theme-text)' }}>
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
        <div className="launchConfigInline">
            <div className="launchConfigInline__header">
                <span className="launchConfigInline__title">
                    Launch Configuration
                    {isSingleMember && selectedMembers[0] && (
                        <span className="launchConfigInline__headerMember">
                            <span>{selectedMembers[0].avatar}</span>
                            <span>{selectedMembers[0].name}</span>
                        </span>
                    )}
                </span>
                <button type="button" className="launchConfigInline__closeBtn" onClick={onClose} title="Back to description">&times;</button>
            </div>
            <div className="launchConfigInline__body">
                {selectedMembers.map(renderMemberConfig)}
            </div>
        </div>
    );
}
