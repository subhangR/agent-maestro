import React, { useState, useCallback, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { MentionsInput, Mention } from 'react-mentions';
import { AgentTool, AgentMode, ModelType, TeamMember, TeamMemberScope, CreateTeamMemberPayload, UpdateTeamMemberPayload, InstrumentType } from "../../app/types/maestro";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { useAutoSave, AutoSaveStatus } from "../../hooks/useAutoSave";
import { ClaudeCodeSkillsSelector } from "./ClaudeCodeSkillsSelector";
import { soundManager, getNotesForDisplay } from "../../services/soundManager";
import type { SoundCategory } from "../../services/soundManager";
import { assignRandomInstrument, getInstrumentEmoji, getInstrumentRole } from "../../services/soundTemplates";
import {
    getEffectiveCommandEnabled,
    isCommandAllowedForMode,
    toggleCommandOverride,
} from "../../utils/commandPermissions";

// ─── Constants ────────────────────────────────────────────────────────────────

const CAPABILITY_DEFS = [
    { key: 'can_spawn_sessions', label: 'Spawn Sessions', desc: 'Can create new agent sessions' },
    { key: 'can_edit_tasks', label: 'Edit Tasks', desc: 'Can create/edit/delete tasks' },
    { key: 'can_report_task_level', label: 'Report Task-Level', desc: 'Can report progress on individual tasks' },
    { key: 'can_report_session_level', label: 'Report Session-Level', desc: 'Can report session-wide progress' },
] as const;

const COMMAND_GROUPS = [
    { key: 'root', label: 'Root', commands: ['whoami', 'status', 'commands'] },
    { key: 'task', label: 'Task', commands: ['task:list', 'task:get', 'task:create', 'task:edit', 'task:delete', 'task:children', 'task:report:progress', 'task:report:complete', 'task:report:blocked', 'task:report:error', 'task:docs:add', 'task:docs:list'] },
    { key: 'session', label: 'Session', commands: ['session:siblings', 'session:info', 'session:prompt', 'session:report:progress', 'session:report:complete', 'session:report:blocked', 'session:report:error', 'session:docs:add', 'session:docs:list'] },
    { key: 'team-member', label: 'Team Member', commands: ['team-member:create', 'team-member:list', 'team-member:get'] },
    { key: 'show', label: 'Show', commands: ['show:modal'] },
    { key: 'modal', label: 'Modal', commands: ['modal:events'] },
] as const;

const AGENT_TOOLS: AgentTool[] = ["claude-code", "codex", "gemini"];
const AGENT_TOOL_LABELS: Partial<Record<AgentTool, string>> = {
    "claude-code": "Claude Code",
    "codex": "OpenAI Codex",
    "gemini": "Google Gemini",
};

const MODELS_BY_TOOL: Partial<Record<AgentTool, { value: ModelType; label: string }[]>> = {
    "claude-code": [
        { value: "haiku", label: "Haiku" },
        { value: "sonnet", label: "Sonnet" },
        { value: "opus", label: "Opus" },
    ],
    "codex": [
        { value: "gpt-5.3-codex", label: "GPT 5.3 Codex" },
        { value: "gpt-5.2-codex", label: "GPT 5.2 Codex" },
    ],
    "gemini": [
        { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
        { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
};

const DEFAULT_MODEL: Record<string, string> = {
    "claude-code": "sonnet",
    "codex": "gpt-5.3-codex",
    "gemini": "gemini-3-pro-preview",
};

const DEFAULT_CONFIGS: Record<string, {
    name: string;
    role: string;
    avatar: string;
    identity: string;
    agentTool: AgentTool;
    model: ModelType;
    mode: AgentMode;
    commandPermissions?: {
        commands?: Record<string, boolean>;
    };
}> = {
    simple_worker: {
        name: "Simple Worker", role: "Default executor", avatar: "\u26A1",
        identity: "You are a worker agent. You implement tasks directly \u2014 write code, run tests, fix bugs.",
        agentTool: "claude-code", model: "sonnet", mode: "worker",
    },
    coordinator: {
        name: "Coordinator", role: "Task orchestrator", avatar: "\u{1F3AF}",
        identity: "You are a coordinator agent. You break down complex tasks, assign work to team members, and track progress.",
        agentTool: "claude-code", model: "sonnet", mode: "coordinator",
    },
    batch_coordinator: {
        name: "Batch Coordinator", role: "Intelligent batch orchestrator", avatar: "\u{1F4E6}",
        identity: "You are a batch coordinator agent. You group related tasks into intelligent batches.",
        agentTool: "claude-code", model: "sonnet", mode: "coordinator",
    },
    dag_coordinator: {
        name: "DAG Coordinator", role: "DAG-based orchestrator", avatar: "\u{1F500}",
        identity: "You are a DAG coordinator agent. You model task dependencies as a directed acyclic graph.",
        agentTool: "claude-code", model: "sonnet", mode: "coordinator",
    },
    recruiter: {
        name: "Recruiter", role: "Team member recruiter with skill discovery", avatar: "\u{1F50D}",
        identity: "You are a recruiter agent. You analyze task requirements, discover and install relevant skills from the ecosystem using the find-skills skill (npx skills find/add), and create appropriately configured team members with matched skills. You present a detailed recruitment plan for approval before creating any team members.",
        agentTool: "claude-code", model: "sonnet", mode: "worker",
        commandPermissions: {
            commands: {
                "team-member:create": true,
                "team-member:list": true,
                "team-member:get": true,
            },
        },
    },
};

function getDefaultCapabilities(mode: AgentMode): Record<string, boolean> {
    return {
        can_spawn_sessions: mode === 'coordinator' || mode === 'coordinated-coordinator' || mode === 'coordinate' as any,
        can_edit_tasks: true,
        can_report_task_level: true,
        can_report_session_level: true,
    };
}

// ─── MentionsInput Style ──────────────────────────────────────────────────────

const mentionsStyle = {
    control: {
        backgroundColor: 'transparent',
        fontSize: '12px',
        fontWeight: 'normal' as const,
        lineHeight: '1.5',
        minHeight: '140px',
        maxHeight: '350px',
    },
    '&multiLine': {
        control: {
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            minHeight: '140px',
            maxHeight: '350px',
        },
        highlighter: {
            padding: '8px 10px',
            border: '1px solid transparent',
            color: 'transparent',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '12px',
            lineHeight: '1.5',
            pointerEvents: 'none' as const,
            overflow: 'hidden' as const,
        },
        input: {
            padding: '8px 10px',
            border: '1px solid transparent',
            outline: 'none',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '12px',
            lineHeight: '1.5',
            maxHeight: '350px',
            overflow: 'auto' as const,
        },
    },
    suggestions: {
        list: { zIndex: 9999, width: '100%', maxWidth: '100%', left: 0, right: 0, boxSizing: 'border-box' as const },
        item: { boxSizing: 'border-box' as const },
    },
};

// ─── Sound Signature Grid ─────────────────────────────────────────────────────
//
// Shows each notification type with its note sequence and a play button.
// Grouped into: Notifications (what agents fire) and Status events.

const SOUND_ROWS: Array<{
    emoji: string;
    label: string;
    category: SoundCategory;
}> = [
    // Key notifications
    { emoji: '✅', label: 'Task Done',       category: 'notify_task_completed' },
    { emoji: '❌', label: 'Task Failed',     category: 'notify_task_failed' },
    { emoji: '🚫', label: 'Task Blocked',    category: 'notify_task_blocked' },
    { emoji: '🎉', label: 'Session Done',    category: 'notify_session_completed' },
    { emoji: '💥', label: 'Session Failed',  category: 'notify_session_failed' },
    { emoji: '❓', label: 'Needs Input',     category: 'notify_needs_input' },
    // Status / general
    { emoji: '🟢', label: 'Success',         category: 'success' },
    { emoji: '🔴', label: 'Error',           category: 'error' },
    { emoji: '🚨', label: 'Critical Error',  category: 'critical_error' },
    { emoji: '⚠️', label: 'Warning',        category: 'warning' },
    { emoji: '🏆', label: 'Achievement',     category: 'achievement' },
    { emoji: '📈', label: 'Progress',        category: 'progress' },
];

function SoundSignatureGrid({ instrument }: { instrument: InstrumentType }) {
    const [playing, setPlaying] = React.useState<string | null>(null);

    const handlePlay = (category: SoundCategory) => {
        setPlaying(category);
        soundManager.playCategorySound(category, instrument).catch(() => {});
        // Clear playing state after ~600ms (longest note sequence)
        setTimeout(() => setPlaying(null), 700);
    };

    return (
        <div style={{ fontSize: '10px', fontFamily: 'var(--style-font-ui)' }}>
            <div style={{
                fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px',
                opacity: 0.5, marginBottom: '6px',
            }}>
                Sound signature — {getInstrumentEmoji(instrument)} {instrument}
            </div>
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '2px 8px',
            }}>
                {SOUND_ROWS.map(({ emoji, label, category }) => {
                    const notes = getNotesForDisplay(category, instrument);
                    const isPlaying = playing === category;
                    return (
                        <div
                            key={category}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '5px',
                                padding: '3px 4px', borderRadius: '3px',
                                background: isPlaying
                                    ? 'rgba(var(--theme-primary-rgb), 0.08)'
                                    : 'transparent',
                                transition: 'background 0.15s',
                            }}
                        >
                            <span style={{ fontSize: '11px', flexShrink: 0 }}>{emoji}</span>
                            <span style={{
                                flex: 1, minWidth: 0, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                color: 'var(--theme-text)', opacity: 0.8,
                            }}>
                                {label}
                            </span>
                            <span style={{
                                fontFamily: '"JetBrains Mono", monospace',
                                fontSize: '9px', opacity: 0.5,
                                flexShrink: 0, letterSpacing: '-0.2px',
                            }}>
                                {notes}
                            </span>
                            <button
                                type="button"
                                onClick={() => handlePlay(category)}
                                title={`Preview ${label}`}
                                style={{
                                    flexShrink: 0, padding: '2px 5px', cursor: 'pointer',
                                    border: '1px solid var(--theme-border)', borderRadius: '3px',
                                    background: isPlaying ? 'rgba(var(--theme-primary-rgb), 0.15)' : 'transparent',
                                    color: isPlaying ? 'var(--theme-primary)' : 'var(--theme-text)',
                                    fontSize: '9px', lineHeight: '1',
                                    transition: 'all 0.1s',
                                }}
                            >
                                {isPlaying ? '♪' : '▶'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type TeamMemberModalProps = {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    /** Pass a TeamMember to edit, or null/undefined to create */
    teamMember?: TeamMember | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TeamMemberModal({ isOpen, onClose, projectId, teamMember }: TeamMemberModalProps) {
    const isEditMode = !!teamMember;
    const isDefault = teamMember?.isDefault ?? false;

    // Resolve project working directory for local skill discovery
    const projectWorkingDir = useProjectStore(s => {
        const project = s.projects.find(p => p.id === projectId);
        return project?.basePath || project?.workingDir || undefined;
    });

    // Form state
    const [name, setName] = useState("");
    const [role, setRole] = useState("");
    const [avatar, setAvatar] = useState("\u{1F916}");
    const [identity, setIdentity] = useState("");
    const [agentTool, setAgentTool] = useState<AgentTool>("claude-code");
    const [model, setModel] = useState<ModelType>("sonnet");
    const [mode, setMode] = useState<AgentMode>("worker");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
    const [capabilities, setCapabilities] = useState<Record<string, boolean>>(() => getDefaultCapabilities('worker'));
    const [commandOverrides, setCommandOverrides] = useState<Record<string, boolean>>({});
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [workflowTemplateId, setWorkflowTemplateId] = useState<string>('');
    const [useCustomWorkflow, setUseCustomWorkflow] = useState(false);
    const [customWorkflow, setCustomWorkflow] = useState('');
    const [permissionMode, setPermissionMode] = useState<'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions'>('acceptEdits');
    const [soundInstrument, setSoundInstrument] = useState<InstrumentType>('piano');
    const [scope, setScope] = useState<TeamMemberScope>('project');

    // Auto-save change tracking
    const [changeVersion, setChangeVersion] = useState(0);
    const bumpVersion = useCallback(() => setChangeVersion(v => v + 1), []);

    // Detect if form has changes compared to the saved team member
    const hasUnsavedChanges = useMemo(() => {
        if (!isEditMode || !teamMember) return false;
        return (
            name !== teamMember.name ||
            role !== teamMember.role ||
            avatar !== teamMember.avatar ||
            identity !== teamMember.identity ||
            agentTool !== (teamMember.agentTool || "claude-code") ||
            model !== (teamMember.model || "sonnet") ||
            mode !== (teamMember.mode || "worker") ||
            permissionMode !== (teamMember.permissionMode || "acceptEdits") ||
            JSON.stringify(selectedSkills) !== JSON.stringify(teamMember.skillIds || []) ||
            JSON.stringify(capabilities) !== JSON.stringify({ ...getDefaultCapabilities(teamMember.mode || 'worker'), ...teamMember.capabilities }) ||
            JSON.stringify(commandOverrides) !== JSON.stringify(teamMember.commandPermissions?.commands || {}) ||
            soundInstrument !== (teamMember.soundInstrument || 'piano') ||
            scope !== (teamMember.scope || 'project') ||
            workflowTemplateId !== (teamMember.workflowTemplateId || '') ||
            (useCustomWorkflow ? (customWorkflow !== (teamMember.customWorkflow || '')) : false)
        );
    }, [isEditMode, teamMember, name, role, avatar, identity, agentTool, model, mode, permissionMode, selectedSkills, capabilities, commandOverrides, soundInstrument, scope, workflowTemplateId, useCustomWorkflow, customWorkflow]);

    // Agent tool dropdown
    const [showAgentDropdown, setShowAgentDropdown] = useState(false);
    const agentBtnRef = useRef<HTMLButtonElement>(null);
    const [agentDropdownPos, setAgentDropdownPos] = useState<{ top: number; left: number } | null>(null);

    const computeAgentDropdownPos = useCallback(() => {
        const btn = agentBtnRef.current;
        if (!btn) return null;
        const rect = btn.getBoundingClientRect();
        return { top: rect.bottom + 4, left: rect.left };
    }, []);

    useLayoutEffect(() => {
        if (showAgentDropdown) setAgentDropdownPos(computeAgentDropdownPos());
    }, [showAgentDropdown, computeAgentDropdownPos]);

    // Store
    const createTeamMember = useMaestroStore(s => s.createTeamMember);
    const updateTeamMember = useMaestroStore(s => s.updateTeamMember);
    const workflowTemplates = useMaestroStore(s => s.workflowTemplates);
    const fetchWorkflowTemplates = useMaestroStore(s => s.fetchWorkflowTemplates);

    useEffect(() => {
        if (isOpen && workflowTemplates.length === 0) fetchWorkflowTemplates();
    }, [isOpen]);

    // Auto-save for edit mode
    const autoSaveFn = useCallback(async () => {
        if (!isEditMode || !teamMember) return;
        const cmdPerms = Object.keys(commandOverrides).length > 0
            ? { commands: commandOverrides }
            : undefined;
        const payload: UpdateTeamMemberPayload = {
            name: name.trim(),
            role: role.trim(),
            avatar: avatar.trim() || "\u{1F916}",
            identity: identity.trim(),
            agentTool, model, mode, permissionMode,
            skillIds: selectedSkills,
            capabilities,
            soundInstrument,
            scope,
            ...(cmdPerms && { commandPermissions: cmdPerms }),
            workflowTemplateId: useCustomWorkflow ? undefined : (workflowTemplateId || undefined),
            customWorkflow: useCustomWorkflow && customWorkflow.trim() ? customWorkflow.trim() : undefined,
        };
        await updateTeamMember(teamMember.id, projectId, payload);
    }, [isEditMode, teamMember, name, role, avatar, identity, agentTool, model, mode, permissionMode, selectedSkills, capabilities, commandOverrides, soundInstrument, scope, workflowTemplateId, useCustomWorkflow, customWorkflow, projectId, updateTeamMember]);

    const { status: autoSaveStatus, saveNow: saveTeamMemberNow } = useAutoSave({
        changeVersion,
        hasChanges: hasUnsavedChanges,
        saveFn: autoSaveFn,
        debounceMs: 1000,
        enabled: isEditMode && !!name.trim() && !!role.trim(),
    });

    const filteredTemplates = workflowTemplates.filter(t => t.mode === mode);
    const selectedTemplateObj = workflowTemplates.find(t => t.id === workflowTemplateId);

    // Bump change version when form values change (but not on initial populate)
    // Use a populate counter instead of a boolean ref to avoid RAF race conditions
    const populateCounterRef = useRef(0);
    const lastPopulateCounterRef = useRef(0);
    useEffect(() => {
        // Only bump if this render wasn't triggered by a populate cycle
        if (populateCounterRef.current === lastPopulateCounterRef.current) {
            bumpVersion();
        } else {
            lastPopulateCounterRef.current = populateCounterRef.current;
        }
    }, [name, role, avatar, identity, agentTool, model, mode, permissionMode, selectedSkills, capabilities, commandOverrides, soundInstrument, scope, workflowTemplateId, useCustomWorkflow, customWorkflow]);

    // ─── Populate form ────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        // Increment populate counter so the version-bump effect knows to skip
        populateCounterRef.current += 1;
        // Reset changeVersion to 0 for a fresh session
        setChangeVersion(0);
        if (teamMember) {
            setName(teamMember.name);
            setRole(teamMember.role);
            setAvatar(teamMember.avatar);
            setIdentity(teamMember.identity);
            setAgentTool(teamMember.agentTool || "claude-code");
            setModel((teamMember.model || "sonnet") as ModelType);
            setMode(teamMember.mode || "worker");
            setPermissionMode(teamMember.permissionMode || "acceptEdits");
            setSelectedSkills(teamMember.skillIds || []);
            const memberMode = teamMember.mode || 'worker';
            setCapabilities(
                teamMember.capabilities
                    ? { ...getDefaultCapabilities(memberMode), ...teamMember.capabilities }
                    : getDefaultCapabilities(memberMode)
            );
            setCommandOverrides(teamMember.commandPermissions?.commands || {});
            if (teamMember.customWorkflow) {
                setUseCustomWorkflow(true);
                setCustomWorkflow(teamMember.customWorkflow);
                setWorkflowTemplateId('');
            } else {
                setUseCustomWorkflow(false);
                setCustomWorkflow('');
                setWorkflowTemplateId(teamMember.workflowTemplateId || '');
            }
            setSoundInstrument(teamMember.soundInstrument || 'piano');
            setScope(teamMember.scope || 'project');
        } else {
            // Create mode defaults — auto-assign a random instrument for variety
            setName("");
            setRole("");
            setAvatar("\u{1F916}");
            setIdentity("");
            setAgentTool("claude-code");
            setModel("sonnet");
            setMode("worker");
            setPermissionMode("acceptEdits");
            setSelectedSkills([]);
            setCapabilities(getDefaultCapabilities('worker'));
            setCommandOverrides({});
            setWorkflowTemplateId('');
            setUseCustomWorkflow(false);
            setCustomWorkflow('');
            // Auto-assign instrument based on existing team members for ensemble diversity
            const existingTeamMembers = useMaestroStore.getState().teamMembers;
            const existingInstruments = Object.values(existingTeamMembers)
                .map(m => m.soundInstrument)
                .filter((i): i is InstrumentType => !!i);
            setSoundInstrument(assignRandomInstrument(existingInstruments));
            setScope('project');
        }
        setError(null);
        setActiveTab(null);
        setExpandedGroups(new Set());
        setShowAgentDropdown(false);
    }, [isOpen, teamMember]);

    // ─── Handlers ─────────────────────────────────────────────────────
    const handleCapabilityToggle = useCallback((key: string) => {
        setCapabilities(prev => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const handleCommandToggle = useCallback((cmd: string) => {
        setCommandOverrides(prev => toggleCommandOverride(prev, cmd, mode));
    }, [mode]);

    const toggleGroupExpanded = useCallback((group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            next.has(group) ? next.delete(group) : next.add(group);
            return next;
        });
    }, []);

    const toggleTab = (tab: string) => setActiveTab(prev => prev === tab ? null : tab);

    const handleClose = async () => {
        if (isSaving) return;
        // In edit mode, save pending changes before closing
        if (isEditMode && hasUnsavedChanges) {
            await saveTeamMemberNow();
        }
        onClose();
    };

    const handleResetToDefault = () => {
        if (!teamMember?.isDefault) return;
        const type = teamMember.id.split('_').slice(2).join('_');
        const defaults = DEFAULT_CONFIGS[type];
        if (!defaults) return;
        setName(defaults.name);
        setRole(defaults.role);
        setAvatar(defaults.avatar);
        setIdentity(defaults.identity);
        setAgentTool(defaults.agentTool);
        setModel(defaults.model);
        setMode(defaults.mode);
        setPermissionMode('acceptEdits');
        setCapabilities(getDefaultCapabilities(defaults.mode));
        setCommandOverrides(defaults.commandPermissions?.commands ? { ...defaults.commandPermissions.commands } : {});
        setSelectedSkills([]);
        setWorkflowTemplateId('');
        setUseCustomWorkflow(false);
        setCustomWorkflow('');
        setSoundInstrument('piano');
    };

    const handleSubmit = async () => {
        if (!name.trim()) { setError("Name is required"); return; }
        if (!role.trim()) { setError("Role is required"); return; }

        setIsSaving(true);
        setError(null);

        try {
            const cmdPerms = Object.keys(commandOverrides).length > 0
                ? { commands: commandOverrides }
                : undefined;

            if (isEditMode && teamMember) {
                const payload: UpdateTeamMemberPayload = {
                    name: name.trim(),
                    role: role.trim(),
                    avatar: avatar.trim() || "\u{1F916}",
                    identity: identity.trim(),
                    agentTool, model, mode, permissionMode,
                    skillIds: selectedSkills,
                    capabilities,
                    soundInstrument,
                    scope,
                    ...(cmdPerms && { commandPermissions: cmdPerms }),
                    workflowTemplateId: useCustomWorkflow ? undefined : (workflowTemplateId || undefined),
                    customWorkflow: useCustomWorkflow && customWorkflow.trim() ? customWorkflow.trim() : undefined,
                };
                await updateTeamMember(teamMember.id, projectId, payload);
            } else {
                const payload: CreateTeamMemberPayload = {
                    projectId,
                    name: name.trim(),
                    role: role.trim(),
                    avatar: avatar.trim() || "\u{1F916}",
                    identity: identity.trim(),
                    agentTool, model, mode, permissionMode, capabilities,
                    soundInstrument,
                    ...(scope === 'global' && { scope: 'global' as const }),
                    ...(selectedSkills.length > 0 && { skillIds: selectedSkills }),
                    ...(cmdPerms && { commandPermissions: cmdPerms }),
                    ...(useCustomWorkflow && customWorkflow.trim()
                        ? { customWorkflow: customWorkflow.trim() }
                        : workflowTemplateId ? { workflowTemplateId } : {}),
                };
                await createTeamMember(payload);
            }
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} team member`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (isEditMode) {
                saveTeamMemberNow();
            } else {
                handleSubmit();
            }
        }
    };

    if (!isOpen) return null;

    const availableModels = MODELS_BY_TOOL[agentTool] || [];
    const memoryEntries = teamMember?.memory || [];

    // ─── Render ───────────────────────────────────────────────────────

    return createPortal(
        <div className="themedModalBackdrop" onClick={handleClose}>
            <div
                className="themedModal themedModal--wide"
                onClick={(e) => e.stopPropagation()}
                style={{ overflow: 'hidden' }}
            >
                {/* ── Header ────────────────────────────────────────── */}
                <div className="themedModalHeader">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                        {isEditMode && isDefault && (
                            <span className="themedTaskStatusBadge" data-status="in_progress" style={{ flexShrink: 0, padding: '3px 8px', fontSize: '9px', lineHeight: '1', letterSpacing: '0.5px' }}>
                                DEFAULT
                            </span>
                        )}
                        <span className="themedModalTitle" style={{ flexShrink: 0 }}>
                            {isEditMode ? '[ EDIT TEAM MEMBER ]' : '[ NEW TEAM MEMBER ]'}
                        </span>
                        <input
                            type="text"
                            className="themedFormInput"
                            style={{
                                flex: 1, minWidth: 0, margin: 0,
                                padding: '6px 10px', fontSize: '13px', fontWeight: 600,
                                boxSizing: 'border-box',
                            }}
                            placeholder={isEditMode ? undefined : "e.g., Frontend Dev"}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isSaving || (isEditMode && isDefault)}
                            autoFocus={!isEditMode}
                        />
                    </div>
                    <button type="button" className="themedModalClose" onClick={handleClose} disabled={isSaving}>{'\u00D7'}</button>
                </div>

                {/* ── Content ───────────────────────────────────────── */}
                <div className="themedModalContent" style={{ overflowX: 'hidden' }}>
                    {error && (
                        <div className="terminalErrorBanner" style={{ marginBottom: '10px' }}>
                            <span className="terminalErrorSymbol">[ERROR]</span>
                            <span className="terminalErrorText">{error}</span>
                            <button type="button" className="terminalErrorClose" onClick={() => setError(null)}>{'\u00D7'}</button>
                        </div>
                    )}

                    {isEditMode && isDefault && (
                        <div className="themedFormHint" style={{ marginBottom: '10px', fontSize: '10px' }}>
                            Default team member \u2014 name cannot be changed. You can customize all other fields.
                        </div>
                    )}

                    {/* Section: Basic Info + Mode (compact row) */}
                    <div className="tmModal__section">
                        <div className="tmModal__row" style={{ alignItems: 'flex-end' }}>
                            <div className="tmModal__field">
                                <div className="themedFormLabel" style={{ fontSize: '10px', marginBottom: '4px' }}>Role *</div>
                                <input
                                    type="text"
                                    className="themedFormInput"
                                    style={{ margin: 0, padding: '6px 10px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
                                    placeholder="e.g., frontend specialist, tester"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={isSaving}
                                />
                            </div>
                            <div className="tmModal__fieldSmall">
                                <div className="themedFormLabel" style={{ fontSize: '10px', marginBottom: '4px' }}>Avatar</div>
                                <input
                                    type="text"
                                    className="themedFormInput"
                                    style={{ margin: 0, padding: '6px 10px', fontSize: '16px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}
                                    placeholder="\u{1F916}"
                                    value={avatar}
                                    onChange={(e) => setAvatar(e.target.value)}
                                    maxLength={2}
                                    disabled={isSaving}
                                />
                            </div>
                            <div style={{ flexShrink: 0 }}>
                                <div className="themedFormLabel" style={{ fontSize: '10px', marginBottom: '4px' }}>Mode</div>
                                {isEditMode && isDefault ? (
                                    <span className={`splitPlayDropdown__modeBadge splitPlayDropdown__modeBadge--${mode}`} style={{ fontSize: '11px' }}>
                                        {mode === 'worker' || mode === 'coordinated-worker' || (mode as string) === 'execute' ? 'Worker' : 'Orchestrator'}
                                    </span>
                                ) : (
                                    <div className="themedSegmentedControl" style={{ margin: 0 }}>
                                        <button
                                            type="button"
                                            className={`themedSegmentedBtn ${mode === 'worker' ? 'active' : ''}`}
                                            onClick={() => {
                                                setMode('worker');
                                                setCapabilities(getDefaultCapabilities('worker'));
                                                setWorkflowTemplateId('');
                                            }}
                                            style={{ padding: '5px 12px', fontSize: '10px' }}
                                            disabled={isSaving}
                                        >
                                            Worker
                                        </button>
                                        <button
                                            type="button"
                                            className={`themedSegmentedBtn ${mode === 'coordinator' ? 'active' : ''}`}
                                            onClick={() => {
                                                setMode('coordinator');
                                                setCapabilities(getDefaultCapabilities('coordinator'));
                                                setWorkflowTemplateId('');
                                            }}
                                            style={{ padding: '5px 12px', fontSize: '10px' }}
                                            disabled={isSaving}
                                        >
                                            Orchestrator
                                        </button>
                                    </div>
                                )}
                            </div>
                            {/* Global scope toggle — not available for defaults */}
                            {!isDefault && (
                                <div style={{ flexShrink: 0 }}>
                                    <div className="themedFormLabel" style={{ fontSize: '10px', marginBottom: '4px' }}>Scope</div>
                                    <button
                                        type="button"
                                        className={`themedSegmentedBtn ${scope === 'global' ? 'active' : ''}`}
                                        onClick={() => setScope(prev => prev === 'global' ? 'project' : 'global')}
                                        style={{
                                            padding: '5px 10px', fontSize: '10px',
                                            border: `1px solid ${scope === 'global' ? 'var(--theme-primary)' : 'var(--theme-border)'}`,
                                            borderRadius: '4px',
                                            background: scope === 'global' ? 'rgba(var(--theme-primary-rgb), 0.1)' : 'transparent',
                                            color: scope === 'global' ? 'var(--theme-primary)' : 'var(--theme-text)',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                        }}
                                        disabled={isSaving}
                                        title={scope === 'global' ? 'This member is shared across all projects' : 'Click to make this member available in all projects'}
                                    >
                                        {'\uD83C\uDF10'} {scope === 'global' ? 'Global' : 'Project'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Section: Identity */}
                    <div className="tmModal__section" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div className="tmModal__sectionLabel">Identity</div>
                        <div className="mentionsWrapper" style={{ minHeight: 0, flex: 1 }}>
                            <MentionsInput
                                value={identity}
                                onChange={(e) => setIdentity(e.target.value)}
                                style={mentionsStyle}
                                placeholder="Describe this team member's persona, expertise, and how they should approach tasks..."
                                className="mentionsInput"
                                onKeyDown={handleKeyDown}
                            >
                                <Mention
                                    trigger="@"
                                    data={[]}
                                    renderSuggestion={(entry, search, highlightedDisplay, index, focused) => (
                                        <div className={`suggestionItem ${focused ? 'focused' : ''}`}>
                                            {entry.display}
                                        </div>
                                    )}
                                />
                            </MentionsInput>
                        </div>
                    </div>

                    {/* Section: Memory (edit mode only) */}
                    {isEditMode && (
                        <div className="tmModal__section" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
                            <div className="tmModal__sectionLabel">Memory</div>
                            <div className="tmModal__memoryCard">
                                <div className="tmModal__memoryHeader">
                                    <span className="tmModal__memoryHeaderLabel">Persistent Memory</span>
                                    <span className="tmModal__memoryCount">
                                        {memoryEntries.length} {memoryEntries.length === 1 ? 'entry' : 'entries'}
                                    </span>
                                </div>
                                {memoryEntries.length > 0 ? (
                                    <div className="tmModal__memoryList">
                                        {memoryEntries.map((entry, i) => (
                                            <div key={i} className="tmModal__memoryEntry">
                                                <span className="tmModal__memoryIndex">{i + 1}</span>
                                                <span className="tmModal__memoryText">{entry}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="tmModal__memoryEmpty">
                                        No memory entries yet. Memory is managed by the agent via CLI.
                                    </div>
                                )}
                                <div className="tmModal__memoryHint">
                                    Use{' '}
                                    <code style={{
                                        fontSize: '9px', padding: '1px 3px',
                                        background: 'rgba(var(--theme-primary-rgb), 0.06)',
                                        border: '1px solid rgba(var(--theme-primary-rgb), 0.1)',
                                        borderRadius: '2px',
                                    }}>
                                        maestro team-member memory append
                                    </code>{' '}
                                    to add entries
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Tab Content ───────────────────────────────────── */}
                {activeTab && (
                    <div className="themedModalTabContent" style={{ maxHeight: '250px', overflowY: 'auto', borderTop: '1px solid var(--theme-border)' }}>
                        {activeTab === 'sound' && (
                            <div style={{ overflowX: 'hidden' }}>
                                {/* Instrument picker */}
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                    {(['piano', 'guitar', 'violin', 'trumpet', 'drums'] as InstrumentType[]).map((inst) => (
                                        <button
                                            key={inst}
                                            type="button"
                                            title={getInstrumentRole(inst)}
                                            onClick={() => setSoundInstrument(inst)}
                                            style={{
                                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                gap: '3px', padding: '6px 10px', cursor: 'pointer',
                                                border: `1px solid ${soundInstrument === inst ? 'var(--theme-primary)' : 'var(--theme-border)'}`,
                                                borderRadius: '4px', fontSize: '10px',
                                                background: soundInstrument === inst
                                                    ? 'rgba(var(--theme-primary-rgb), 0.12)'
                                                    : 'transparent',
                                                color: soundInstrument === inst ? 'var(--theme-primary)' : 'var(--theme-text)',
                                                fontFamily: 'var(--style-font-ui)',
                                                transition: 'all 0.15s',
                                                minWidth: '56px',
                                            }}
                                            disabled={isSaving}
                                        >
                                            <span style={{ fontSize: '16px' }}>{getInstrumentEmoji(inst)}</span>
                                            <span style={{ textTransform: 'capitalize', fontWeight: soundInstrument === inst ? 600 : 400 }}>
                                                {inst}
                                            </span>
                                        </button>
                                    ))}
                                </div>

                                {/* Sound signature — per-notification-type preview */}
                                <SoundSignatureGrid instrument={soundInstrument} />
                            </div>
                        )}

                        {activeTab === 'skills' && (
                            <ClaudeCodeSkillsSelector selectedSkills={selectedSkills} onSelectionChange={setSelectedSkills} projectPath={projectWorkingDir} />
                        )}

                        {activeTab === 'permissions' && (
                            <div style={{ overflowX: 'hidden' }}>
                                {/* Permission Mode */}
                                <div className="tmModal__permCard">
                                    <div className="tmModal__permCardLabel">Permission Mode</div>
                                    <select
                                        className="themedFormSelect"
                                        style={{ margin: 0, padding: '5px 8px', fontSize: '11px', width: '100%', boxSizing: 'border-box' as const }}
                                        value={permissionMode}
                                        onChange={(e) => setPermissionMode(e.target.value as typeof permissionMode)}
                                        disabled={isSaving}
                                    >
                                        <option value="acceptEdits">Accept Edits (default)</option>
                                        <option value="interactive">Interactive</option>
                                        <option value="readOnly">Read Only</option>
                                        <option value="bypassPermissions">Bypass — auto-approves all tool calls</option>
                                    </select>
                                    {permissionMode === 'bypassPermissions' && (
                                        <div style={{ fontSize: '10px', color: 'var(--theme-warning, #e8a030)', marginTop: '6px', fontFamily: '"JetBrains Mono", monospace' }}>
                                            {'\u26A0'} All tool calls will be auto-approved. Use for trusted coordinator roles.
                                        </div>
                                    )}
                                </div>

                                {/* Workflow */}
                                <div className="tmModal__permCard">
                                    <div className="tmModal__permCardLabel">Workflow</div>
                                    <select
                                        className="themedFormSelect"
                                        style={{ margin: 0, padding: '5px 8px', fontSize: '11px', width: '100%', boxSizing: 'border-box', marginBottom: '4px' }}
                                        value={useCustomWorkflow ? '__custom__' : workflowTemplateId}
                                        onChange={(e) => {
                                            if (e.target.value === '__custom__') {
                                                setUseCustomWorkflow(true);
                                                if (selectedTemplateObj) {
                                                    setCustomWorkflow(selectedTemplateObj.phases.map(p => `[${p.name}]\n${p.instruction}`).join('\n\n'));
                                                }
                                            } else {
                                                setUseCustomWorkflow(false);
                                                setWorkflowTemplateId(e.target.value);
                                            }
                                        }}
                                        disabled={isSaving}
                                    >
                                        <option value="">Default (auto from mode)</option>
                                        {filteredTemplates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name} — {t.description}</option>
                                        ))}
                                        <option value="__custom__">Custom workflow...</option>
                                    </select>
                                    {selectedTemplateObj && !useCustomWorkflow && (
                                        <div style={{
                                            fontSize: '10px', opacity: 0.7, padding: '6px 8px',
                                            border: '1px solid var(--theme-border)', borderRadius: '3px',
                                            maxHeight: '80px', overflow: 'auto',
                                        }}>
                                            {selectedTemplateObj.phases.map((p, i) => (
                                                <div key={i} style={{ marginBottom: i < selectedTemplateObj.phases.length - 1 ? '4px' : 0 }}>
                                                    <span style={{ fontWeight: 600 }}>{p.name}:</span> {p.instruction.substring(0, 80)}{p.instruction.length > 80 ? '...' : ''}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {useCustomWorkflow && (
                                        <textarea
                                            className="themedFormInput"
                                            style={{
                                                margin: 0, padding: '6px 8px', fontSize: '11px',
                                                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                                                minHeight: '80px', maxHeight: '150px', resize: 'vertical',
                                                width: '100%', boxSizing: 'border-box',
                                            }}
                                            placeholder="Enter custom workflow instructions..."
                                            value={customWorkflow}
                                            onChange={(e) => setCustomWorkflow(e.target.value)}
                                            disabled={isSaving}
                                        />
                                    )}
                                </div>

                                {/* Capabilities */}
                                <div className="tmModal__permCard">
                                    <div className="tmModal__permCardLabel">Capabilities</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                                        {CAPABILITY_DEFS.map(cap => {
                                            const isChecked = capabilities[cap.key] ?? false;
                                            return (
                                                <label
                                                    key={cap.key}
                                                    className="terminalTaskCheckbox"
                                                    title={cap.desc}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginRight: 0 }}
                                                    onClick={(e) => { e.preventDefault(); if (!isSaving) handleCapabilityToggle(cap.key); }}
                                                >
                                                    <input type="checkbox" checked={isChecked} readOnly />
                                                    <span className={`terminalTaskCheckmark ${isChecked ? 'terminalTaskCheckmark--checked' : ''}`}>
                                                        {isChecked ? '\u2713' : ''}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: 'var(--theme-text)', fontFamily: '"JetBrains Mono", monospace' }}>
                                                        {cap.label}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Command Permissions */}
                                <div className="tmModal__permCard">
                                    <div className="tmModal__permCardLabel">Command Permissions</div>
                                    <div className="themedFormHint" style={{ marginBottom: '6px' }}>
                                        Defaults depend on mode. Toggle to restrict or explicitly grant mode-supported commands.
                                    </div>
                                    {COMMAND_GROUPS.map(group => {
                                        const isExpanded = expandedGroups.has(group.key);
                                        const supportedCommands = group.commands.filter(c => isCommandAllowedForMode(c, mode));
                                        const enabledCount = supportedCommands.filter(c => getEffectiveCommandEnabled(c, mode, commandOverrides)).length;
                                        return (
                                            <div key={group.key} style={{ marginBottom: '2px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroupExpanded(group.key)}
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
                                                            const modeSupported = isCommandAllowedForMode(cmd, mode);
                                                            const isChecked = getEffectiveCommandEnabled(cmd, mode, commandOverrides);
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
                                                                        if (!isSaving && modeSupported) handleCommandToggle(cmd);
                                                                    }}
                                                                >
                                                                    <input type="checkbox" checked={isChecked} readOnly />
                                                                    <span className={`terminalTaskCheckmark ${isChecked ? 'terminalTaskCheckmark--checked' : ''}`} style={{ width: '14px', height: '14px', fontSize: '9px' }}>
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
                        )}
                    </div>
                )}

                {/* ── Tab Bar ───────────────────────────────────────── */}
                <div className="themedModalTabBar" style={{ borderTop: '1px solid var(--theme-border)', marginTop: 'auto' }}>
                    <button
                        type="button"
                        className={`themedModalTab ${activeTab === 'sound' ? 'themedModalTab--active' : ''}`}
                        onClick={() => toggleTab('sound')}
                    >
                        Sound
                        <span style={{ fontSize: '11px' }}>{getInstrumentEmoji(soundInstrument)}</span>
                    </button>
                    <button
                        type="button"
                        className={`themedModalTab ${activeTab === 'skills' ? 'themedModalTab--active' : ''}`}
                        onClick={() => toggleTab('skills')}
                    >
                        Skills
                        {selectedSkills.length > 0 && <span className="themedModalTabBadge">{selectedSkills.length}</span>}
                    </button>
                    <button
                        type="button"
                        className={`themedModalTab ${activeTab === 'permissions' ? 'themedModalTab--active' : ''}`}
                        onClick={() => toggleTab('permissions')}
                    >
                        Permissions
                    </button>
                    {activeTab && (
                        <button
                            type="button"
                            className="themedModalTab themedModalTabClose"
                            onClick={() => setActiveTab(null)}
                            title="Collapse tab panel"
                        >
                            {'\u00D7'}
                        </button>
                    )}
                </div>

                {/* ── Footer ────────────────────────────────────────── */}
                <div className="tmModal__footer">
                    <div className="tmModal__footerLeft">
                        <div className="themedDropdownPicker" style={{ position: 'relative', flexShrink: 0 }}>
                            <button
                                ref={agentBtnRef}
                                type="button"
                                className={`themedDropdownButton ${showAgentDropdown ? 'themedDropdownButton--open' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setShowAgentDropdown(!showAgentDropdown); }}
                                disabled={isSaving}
                            >
                                {AGENT_TOOL_LABELS[agentTool]}
                                <span className="themedDropdownCaret">{showAgentDropdown ? '\u25B4' : '\u25BE'}</span>
                            </button>
                            {showAgentDropdown && agentDropdownPos && createPortal(
                                <>
                                    <div className="themedDropdownOverlay" onClick={(e) => { e.stopPropagation(); setShowAgentDropdown(false); }} />
                                    <div
                                        className="themedDropdownMenu"
                                        style={{ top: agentDropdownPos.top, left: agentDropdownPos.left }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {AGENT_TOOLS.map(tool => (
                                            <button type="button"
                                                key={tool}
                                                className={`themedDropdownOption ${tool === agentTool ? 'themedDropdownOption--current' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAgentTool(tool);
                                                    setModel(DEFAULT_MODEL[tool] as ModelType);
                                                    setShowAgentDropdown(false);
                                                }}
                                            >
                                                <span className="themedDropdownLabel">{AGENT_TOOL_LABELS[tool]}</span>
                                                {tool === agentTool && <span className="themedDropdownCheck">{'\u2713'}</span>}
                                            </button>
                                        ))}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>
                        <div className="themedSegmentedControl" style={{ margin: 0, flexShrink: 0 }}>
                            {availableModels.map(m => (
                                <button
                                    key={m.value}
                                    type="button"
                                    className={`themedSegmentedBtn ${model === m.value ? "active" : ""}`}
                                    onClick={() => setModel(m.value)}
                                    style={{ padding: '2px 8px', fontSize: '10px' }}
                                    disabled={isSaving}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="tmModal__footerRight">
                        {isEditMode && isDefault && (
                            <button
                                type="button"
                                className="themedBtn themedBtnDanger"
                                onClick={handleResetToDefault}
                                disabled={isSaving}
                                style={{ fontSize: '10px', padding: '4px 10px' }}
                            >
                                Reset Default
                            </button>
                        )}
                        {isEditMode && autoSaveStatus !== 'idle' && (
                            <span style={{
                                fontSize: '11px',
                                color: autoSaveStatus === 'saved' ? 'var(--theme-success, #4caf50)'
                                    : autoSaveStatus === 'error' ? 'var(--theme-error, #f44336)'
                                    : 'var(--theme-text-secondary)',
                                opacity: autoSaveStatus === 'saved' ? 0.7 : 1,
                                transition: 'opacity 0.3s ease',
                                whiteSpace: 'nowrap',
                            }}>
                                {autoSaveStatus === 'saving' ? 'Saving\u2026' : autoSaveStatus === 'saved' ? 'Saved' : 'Save failed'}
                            </span>
                        )}
                        <button type="button" className="themedBtn" onClick={handleClose} disabled={isSaving}>
                            {isEditMode ? 'Close' : 'Cancel'}
                        </button>
                        {!isEditMode && (
                            <button
                                type="button"
                                className="themedBtn themedBtnPrimary"
                                onClick={handleSubmit}
                                disabled={isSaving || !name.trim() || !role.trim()}
                            >
                                {isSaving ? "Creating..." : "Create Member"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
