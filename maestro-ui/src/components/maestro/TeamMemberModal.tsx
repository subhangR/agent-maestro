import React, { useState, useCallback, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { MentionsInput, Mention } from 'react-mentions';
import { AgentTool, AgentMode, ModelType, TeamMember, TeamMemberScope, CreateTeamMemberPayload, UpdateTeamMemberPayload, InstrumentType, LaunchConfig, LaunchAccessMode } from "../../app/types/maestro";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { ClaudeCodeSkillsSelector } from "./ClaudeCodeSkillsSelector";
import { soundManager, getNotesForDisplay } from "../../services/soundManager";
import type { SoundCategory } from "../../services/soundManager";
import { assignRandomInstrument, getInstrumentEmoji, getInstrumentRole } from "../../services/soundTemplates";
import {
    getEffectiveCommandEnabled,
    isCommandAllowedForMode,
    toggleCommandOverride,
} from "../../utils/commandPermissions";
import { useAutoSave, AutoSaveStatus } from "../../hooks/useAutoSave";
import {
    DEFAULT_MODEL_BY_AGENT_TOOL,
    MODELS_BY_AGENT_TOOL,
    createLaunchConfigFromLegacy,
    formatLaunchConfigLabel,
    getAgentToolForLaunchConfig,
    sanitizeLaunchConfig,
} from "../../app/constants/agentTools";
import { LaunchConfigDropdown } from "./LaunchConfigDropdown";
import { Icon, AgentTile } from "./redesign/kit";

// Agent-tool tiles for the redesign `pn-toolsel` picker. `kind` maps each tool
// to the bundled agent asset (hermes has no asset → AgentTile initial-letter fallback).
const TOOL_TILES: { tool: AgentTool; kind: string; label: string }[] = [
    { tool: "claude-code", kind: "claude", label: "Claude" },
    { tool: "codex", kind: "codex", label: "Codex" },
    { tool: "gemini", kind: "gemini", label: "Gemini" },
    { tool: "hermes", kind: "hermes", label: "Hermes" },
];

const PERMISSION_OPTIONS: { value: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions'; label: string }[] = [
    { value: "acceptEdits", label: "Accept edits" },
    { value: "interactive", label: "Interactive" },
    { value: "readOnly", label: "Read only" },
    { value: "bypassPermissions", label: "Bypass — auto-approve" },
];

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

const DEFAULT_MODEL = DEFAULT_MODEL_BY_AGENT_TOOL;

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
    standup: {
        name: "Standup", role: "Team roster auditor and optimizer", avatar: "\u{1F4CB}",
        identity: "You are the team standup agent. You audit and optimize the team roster — review all members, merge duplicates, remove redundant ones, update stale configs, and identify gaps. You present a diff-style report and wait for confirmation before making changes.",
        agentTool: "claude-code", model: "opus", mode: "worker",
        commandPermissions: {
            commands: {
                "team-member:list": true,
                "team-member:get": true,
                "team-member:create": true,
                "team-member:edit": true,
                "team-member:archive": true,
                "team-member:delete": true,
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

function permissionModeFromAccessMode(accessMode?: LaunchAccessMode): TeamMember['permissionMode'] | undefined {
    switch (accessMode) {
        case 'fullAccess':
            return 'bypassPermissions';
        case 'acceptEdits':
            return 'acceptEdits';
        case 'plan':
            return 'readOnly';
        case 'safe':
            return 'interactive';
        default:
            return undefined;
    }
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
            fontFamily: 'var(--pn-mono)',
            minHeight: '140px',
            maxHeight: '350px',
        },
        highlighter: {
            padding: '9px 11px',
            border: '1px solid transparent',
            color: 'transparent',
            fontFamily: 'var(--pn-mono)',
            fontSize: '12.5px',
            lineHeight: '1.5',
            pointerEvents: 'none' as const,
            overflow: 'hidden' as const,
        },
        input: {
            padding: '9px 11px',
            border: '1px solid transparent',
            outline: 'none',
            color: 'var(--pn-ink)',
            fontFamily: 'var(--pn-mono)',
            fontSize: '12.5px',
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
        <div style={{ fontSize: '10px', fontFamily: 'var(--pn-ui)' }}>
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
                                    ? 'var(--pn-brand-soft)'
                                    : 'transparent',
                                transition: 'background 0.15s',
                            }}
                        >
                            <span style={{ fontSize: '11px', flexShrink: 0 }}>{emoji}</span>
                            <span style={{
                                flex: 1, minWidth: 0, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                color: 'var(--pn-ink)', opacity: 0.8,
                            }}>
                                {label}
                            </span>
                            <span style={{
                                fontFamily: 'var(--pn-mono)',
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
                                    border: '1px solid var(--pn-line-2)', borderRadius: '3px',
                                    background: isPlaying ? 'var(--pn-brand-soft)' : 'transparent',
                                    color: isPlaying ? 'var(--pn-brand)' : 'var(--pn-ink)',
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
    const projectName = useProjectStore(s => s.projects.find(p => p.id === projectId)?.name);

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
    // Model profile binding: when set, the member resolves its launch config from
    // the profile at spawn (raw model below is the fallback for "Custom").
    const [modelProfileId, setModelProfileId] = useState<string | null>(null);

    // Memory editing state (edit mode). Local mirror of teamMember.memory so per-entry
    // edit/delete give immediate feedback while persisting to the server.
    const [memoryEntries, setMemoryEntries] = useState<string[]>([]);
    const [editingMemoryIndex, setEditingMemoryIndex] = useState<number | null>(null);
    const [editingMemoryText, setEditingMemoryText] = useState('');
    const [memorySavingIndex, setMemorySavingIndex] = useState<number | null>(null);
    const [memoryError, setMemoryError] = useState<string | null>(null);

    // Auto-save tracking
    const [changeVersion, setChangeVersion] = useState(0);
    const bumpVersion = useCallback(() => setChangeVersion(v => v + 1), []);
    const populateCounterRef = useRef(0);
    const lastPopulateCounterRef = useRef(0);

    // Launch configuration dropdown
    const [showLaunchDropdown, setShowLaunchDropdown] = useState(false);
    const [activeLaunchTool, setActiveLaunchTool] = useState<AgentTool | null>("claude-code");
    const launchBtnRef = useRef<HTMLButtonElement>(null);
    const [launchDropdownPos, setLaunchDropdownPos] = useState<{ top: number; left: number } | null>(null);

    const computeLaunchDropdownPos = useCallback(() => {
        const btn = launchBtnRef.current;
        if (!btn) return null;
        const rect = btn.getBoundingClientRect();
        const menuWidth = Math.min(540, window.innerWidth - 16);
        const menuHeight = Math.min(460, window.innerHeight - 16);
        const gap = 8;
        const rightSpace = window.innerWidth - rect.right;
        const leftSpace = rect.left;
        const left = rightSpace >= menuWidth + gap
            ? rect.right + gap
            : leftSpace >= menuWidth + gap
                ? rect.left - menuWidth - gap
                : Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
        const top = Math.min(Math.max(8, rect.top - 12), window.innerHeight - menuHeight - 8);
        return { top, left };
    }, []);

    useLayoutEffect(() => {
        if (showLaunchDropdown) setLaunchDropdownPos(computeLaunchDropdownPos());
    }, [showLaunchDropdown, computeLaunchDropdownPos]);

    // Store
    const createTeamMember = useMaestroStore(s => s.createTeamMember);
    const updateTeamMember = useMaestroStore(s => s.updateTeamMember);
    const workflowTemplates = useMaestroStore(s => s.workflowTemplates);
    const fetchWorkflowTemplates = useMaestroStore(s => s.fetchWorkflowTemplates);
    const modelProfilesMap = useMaestroStore(s => s.modelProfiles);
    const fetchModelProfiles = useMaestroStore(s => s.fetchModelProfiles);
    const modelProfiles = useMemo(
        () => Object.values(modelProfilesMap).sort((a, b) => a.name.localeCompare(b.name)),
        [modelProfilesMap],
    );

    useEffect(() => {
        if (isOpen && Object.keys(modelProfilesMap).length === 0) fetchModelProfiles();
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && workflowTemplates.length === 0) fetchWorkflowTemplates();
    }, [isOpen]);

    const filteredTemplates = workflowTemplates.filter(t => t.mode === mode);
    const selectedTemplateObj = workflowTemplates.find(t => t.id === workflowTemplateId);

    // ─── Populate form ───────────────────────────────────���────────────
    useEffect(() => {
        if (!isOpen) return;
        populateCounterRef.current++;
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
            setModelProfileId(teamMember.modelProfileId || null);
            setMemoryEntries(teamMember.memory || []);
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
            setModelProfileId(null);
            setMemoryEntries([]);
        }
        setError(null);
        setActiveTab(null);
        setEditingMemoryIndex(null);
        setEditingMemoryText('');
        setMemorySavingIndex(null);
        setMemoryError(null);
        setExpandedGroups(new Set());
        setShowLaunchDropdown(false);
        setActiveLaunchTool(teamMember?.agentTool || "claude-code");
    }, [isOpen, teamMember]);

    // ─── Auto-save (edit mode) ─────────────────────────────────────────
    const hasUnsavedChanges = useMemo(() => {
        if (!isEditMode || !teamMember) return false;
        return (
            name !== teamMember.name ||
            role !== teamMember.role ||
            avatar !== teamMember.avatar ||
            identity !== teamMember.identity ||
            agentTool !== (teamMember.agentTool || "claude-code") ||
            model !== ((teamMember.model || "sonnet") as ModelType) ||
            mode !== (teamMember.mode || "worker") ||
            permissionMode !== (teamMember.permissionMode || "acceptEdits") ||
            JSON.stringify(selectedSkills) !== JSON.stringify(teamMember.skillIds || []) ||
            JSON.stringify(capabilities) !== JSON.stringify(
                teamMember.capabilities
                    ? { ...getDefaultCapabilities(teamMember.mode || 'worker'), ...teamMember.capabilities }
                    : getDefaultCapabilities(teamMember.mode || 'worker')
            ) ||
            JSON.stringify(commandOverrides) !== JSON.stringify(teamMember.commandPermissions?.commands || {}) ||
            soundInstrument !== (teamMember.soundInstrument || 'piano') ||
            scope !== (teamMember.scope || 'project')
        );
    }, [isEditMode, teamMember, name, role, avatar, identity, agentTool, model, mode, permissionMode, selectedSkills, capabilities, commandOverrides, soundInstrument, scope]);

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
            modelProfileId: modelProfileId ?? '',
            skillIds: selectedSkills,
            capabilities,
            soundInstrument,
            scope,
            ...(cmdPerms && { commandPermissions: cmdPerms }),
            workflowTemplateId: useCustomWorkflow ? undefined : (workflowTemplateId || undefined),
            customWorkflow: useCustomWorkflow && customWorkflow.trim() ? customWorkflow.trim() : undefined,
        };
        await updateTeamMember(teamMember.id, projectId, payload);
    }, [isEditMode, teamMember, name, role, avatar, identity, agentTool, model, mode, permissionMode, modelProfileId, selectedSkills, capabilities, commandOverrides, soundInstrument, scope, useCustomWorkflow, workflowTemplateId, customWorkflow, updateTeamMember, projectId]);

    const { status: autoSaveStatus, saveNow: saveTeamMemberNow } = useAutoSave({
        changeVersion,
        hasChanges: hasUnsavedChanges,
        saveFn: autoSaveFn,
        debounceMs: 1000,
        enabled: isEditMode,
    });

    // Bump version on field changes (skip populate-triggered changes)
    useEffect(() => {
        if (populateCounterRef.current !== lastPopulateCounterRef.current) {
            lastPopulateCounterRef.current = populateCounterRef.current;
            return;
        }
        if (isEditMode) bumpVersion();
    }, [name, role, avatar, identity, agentTool, model, mode, permissionMode, modelProfileId, selectedSkills, capabilities, commandOverrides, soundInstrument, scope]);

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
                    modelProfileId: modelProfileId ?? '',
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
                    ...(modelProfileId ? { modelProfileId } : {}),
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
            if (isEditMode) saveTeamMemberNow();
            else handleSubmit();
        }
    };

    // ─── Memory entry handlers (edit mode) ────────────────────────────
    const handleMemoryEditStart = useCallback((index: number) => {
        setEditingMemoryIndex(index);
        setEditingMemoryText(memoryEntries[index] ?? '');
        setMemoryError(null);
    }, [memoryEntries]);

    const handleMemoryEditCancel = useCallback(() => {
        setEditingMemoryIndex(null);
        setEditingMemoryText('');
        setMemoryError(null);
    }, []);

    const handleMemoryEditSave = useCallback(async (index: number) => {
        if (!teamMember) return;
        const trimmed = editingMemoryText.trim();
        if (!trimmed) { setMemoryError('Memory entry cannot be empty.'); return; }
        if (trimmed === memoryEntries[index]) { handleMemoryEditCancel(); return; }
        const next = memoryEntries.map((e, i) => (i === index ? trimmed : e));
        setMemorySavingIndex(index);
        setMemoryError(null);
        try {
            await updateTeamMember(teamMember.id, projectId, { memory: next });
            setMemoryEntries(next);
            setEditingMemoryIndex(null);
            setEditingMemoryText('');
        } catch (e) {
            setMemoryError(e instanceof Error ? e.message : 'Failed to update memory entry.');
        } finally {
            setMemorySavingIndex(null);
        }
    }, [teamMember, editingMemoryText, memoryEntries, projectId, updateTeamMember, handleMemoryEditCancel]);

    const handleMemoryDelete = useCallback(async (index: number) => {
        if (!teamMember) return;
        const next = memoryEntries.filter((_, i) => i !== index);
        setMemorySavingIndex(index);
        setMemoryError(null);
        try {
            await updateTeamMember(teamMember.id, projectId, { memory: next });
            setMemoryEntries(next);
            if (editingMemoryIndex === index) { setEditingMemoryIndex(null); setEditingMemoryText(''); }
        } catch (e) {
            setMemoryError(e instanceof Error ? e.message : 'Failed to delete memory entry.');
        } finally {
            setMemorySavingIndex(null);
        }
    }, [teamMember, memoryEntries, projectId, updateTeamMember, editingMemoryIndex]);

    const launchConfig = useMemo(
        () => createLaunchConfigFromLegacy(agentTool, model, undefined, permissionMode) || null,
        [agentTool, model, permissionMode],
    );
    const launchLabel = formatLaunchConfigLabel(launchConfig || undefined);
    const handleLaunchConfigChange: React.Dispatch<React.SetStateAction<LaunchConfig | null>> = (action) => {
        const next = typeof action === 'function' ? action(launchConfig) : action;
        const sanitized = sanitizeLaunchConfig(next);
        if (!sanitized) return;
        const nextTool = getAgentToolForLaunchConfig(sanitized);
        if (nextTool) {
            setAgentTool(nextTool);
            setActiveLaunchTool(nextTool);
        }
        setModel(sanitized.model as ModelType);
        const nextPermissionMode = permissionModeFromAccessMode(sanitized.accessMode);
        if (nextPermissionMode) setPermissionMode(nextPermissionMode);
    };

    const launchDropdownPortal = showLaunchDropdown && launchDropdownPos && createPortal(
        <>
            <div
                className="terminalInlineStatusOverlay"
                onClick={(e) => {
                    e.stopPropagation();
                    setShowLaunchDropdown(false);
                }}
            />
            <div
                className="terminalLaunchDropdown terminalLaunchDropdown--fixed"
                style={{ top: launchDropdownPos.top, left: launchDropdownPos.left }}
                onClick={(e) => e.stopPropagation()}
            >
                <LaunchConfigDropdown
                    launchConfig={launchConfig}
                    activeTool={activeLaunchTool}
                    onActiveToolChange={setActiveLaunchTool}
                    onLaunchConfigChange={handleLaunchConfigChange}
                    showAdvancedOptions
                />
            </div>
        </>,
        document.body
    );

    if (!isOpen) return null;

    // ─── Render ───────────────────────────────────────────────────────

    return createPortal(
        <div className="themedModalBackdrop" onClick={handleClose}>
            <div className="pn-mdl" onClick={(e) => e.stopPropagation()}>
                {/* ── Header ────────────────────────────────────────── */}
                <div className="pn-mdl__hd">
                    <div className="pn-mdl__hdmain">
                        <div className="pn-mdl__crumb">
                            <Icon name="users" />
                            <b>{projectName || 'agent-maestro'}</b>
                            <Icon name="chevronR" size={11} />
                            {isEditMode ? 'Edit team member' : 'New team member'}
                            {isEditMode && isDefault && (
                                <span className="pn-badge pn-badge--status-in_progress" style={{ marginLeft: 6 }}>DEFAULT</span>
                            )}
                        </div>
                        <input
                            type="text"
                            className="pn-mdl__titleinput"
                            placeholder={isEditMode ? "Name" : "Name — e.g. Frontend Dev"}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isSaving || (isEditMode && isDefault)}
                            autoFocus={!isEditMode}
                        />
                    </div>
                    <button type="button" className="pn-mdl__close" onClick={handleClose} disabled={isSaving}>
                        <Icon name="x" />
                    </button>
                </div>

                {/* ── Content (main) ──────────────────────────────── */}
                <div className="pn-mdl__body">
                    {error && (
                        <div className="pn-fhint" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--pn-block)' }}>
                            <span style={{ fontWeight: 700 }}>[ERROR]</span>
                            <span style={{ flex: 1, minWidth: 0 }}>{error}</span>
                            <button type="button" onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'var(--pn-block)', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                        </div>
                    )}

                    {isEditMode && isDefault && (
                        <div className="pn-fhint">
                            Default team member — name cannot be changed. You can customize all other fields.
                        </div>
                    )}

                    {/* Avatar / Role / Mode / Scope */}
                    <div className="pn-frow" style={{ alignItems: 'flex-end' }}>
                        <div className="pn-fld">
                            <span className="pn-flabel">Avatar</span>
                            <input
                                type="text"
                                className="pn-avatar-edit"
                                placeholder="🤖"
                                value={avatar}
                                onChange={(e) => setAvatar(e.target.value)}
                                maxLength={2}
                                disabled={isSaving}
                            />
                        </div>
                        <div className="pn-fld" style={{ flex: 1, minWidth: 160 }}>
                            <span className="pn-flabel">Role <span className="req">*</span></span>
                            <input
                                type="text"
                                className="pn-input"
                                placeholder="e.g. frontend specialist, tester"
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={isSaving}
                            />
                        </div>
                        <div className="pn-fld">
                            <span className="pn-flabel">Mode</span>
                            {isEditMode && isDefault ? (
                                <span className={`splitPlayDropdown__modeBadge splitPlayDropdown__modeBadge--${mode}`} style={{ fontSize: '11px' }}>
                                    {mode === 'worker' || mode === 'coordinated-worker' || (mode as string) === 'execute' ? 'Worker' : 'Orchestrator'}
                                </span>
                            ) : (
                                <div className="pn-seg">
                                    <button
                                        type="button"
                                        className={`pn-seg-i ${mode === 'worker' ? 'pn-seg-i--active' : ''}`}
                                        onClick={() => {
                                            setMode('worker');
                                            setCapabilities(getDefaultCapabilities('worker'));
                                            setWorkflowTemplateId('');
                                        }}
                                        disabled={isSaving}
                                    >
                                        Worker
                                    </button>
                                    <button
                                        type="button"
                                        className={`pn-seg-i ${mode === 'coordinator' ? 'pn-seg-i--active' : ''}`}
                                        onClick={() => {
                                            setMode('coordinator');
                                            setCapabilities(getDefaultCapabilities('coordinator'));
                                            setWorkflowTemplateId('');
                                        }}
                                        disabled={isSaving}
                                    >
                                        Orchestrator
                                    </button>
                                </div>
                            )}
                        </div>
                        {!isDefault && (
                            <div className="pn-fld">
                                <span className="pn-flabel">Scope</span>
                                <button
                                    type="button"
                                    className={`pn-toggle ${scope === 'global' ? 'pn-toggle--on-wt' : ''}`}
                                    onClick={() => setScope(prev => prev === 'global' ? 'project' : 'global')}
                                    style={{ height: 38 }}
                                    disabled={isSaving}
                                    title={scope === 'global' ? 'This member is shared across all projects' : 'Click to make this member available in all projects'}
                                >
                                    🌐 {scope === 'global' ? 'Global' : 'Project'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Identity */}
                    <div className="pn-fld">
                        <span className="pn-flabel">Identity</span>
                        <div className="mentionsWrapper" style={{ border: '1px solid var(--pn-line-2)', borderRadius: 'var(--pn-r-sm)', background: 'var(--pn-surface)', overflow: 'hidden' }}>
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

                    {/* Agent & model — pn-toolsel + model/permission selects; LaunchConfigDropdown kept in footer for the deeper knobs (reasoningEffort/speed/accessMode) */}
                    <div className="pn-fld">
                        <span className="pn-flabel">Agent &amp; model</span>
                        <div className="pn-toolsel">
                            {TOOL_TILES.map((t) => (
                                <button
                                    key={t.tool}
                                    type="button"
                                    className={`pn-tool ${agentTool === t.tool ? 'pn-tool--active' : ''}`}
                                    onClick={() => {
                                        if (t.tool === agentTool) return;
                                        setAgentTool(t.tool);
                                        setActiveLaunchTool(t.tool);
                                        const valid = MODELS_BY_AGENT_TOOL[t.tool] || [];
                                        if (!valid.some((m) => m.value === model)) setModel(DEFAULT_MODEL_BY_AGENT_TOOL[t.tool]);
                                    }}
                                    disabled={isSaving}
                                >
                                    <AgentTile kind={t.kind} />
                                    <span className="pn-tool__name">{t.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="pn-frow" style={{ marginTop: 4 }}>
                            <div className="pn-fld" style={{ flex: 1 }}>
                                <select
                                    className="pn-select"
                                    value={model}
                                    onChange={(e) => setModel(e.target.value as ModelType)}
                                    disabled={isSaving}
                                    title="Model"
                                >
                                    {!(MODELS_BY_AGENT_TOOL[agentTool] || []).some((m) => m.value === model) && model && (
                                        <option value={model}>{model}</option>
                                    )}
                                    {(MODELS_BY_AGENT_TOOL[agentTool] || []).map((m) => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="pn-fld" style={{ flex: 1 }}>
                                <select
                                    className="pn-select"
                                    value={permissionMode}
                                    onChange={(e) => setPermissionMode(e.target.value as typeof permissionMode)}
                                    disabled={isSaving}
                                    title="Permission mode"
                                >
                                    {PERMISSION_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {permissionMode === 'bypassPermissions' && (
                            <div className="pn-fhint" style={{ color: 'var(--pn-wait)' }}>
                                ⚠ All tool calls will be auto-approved. Use for trusted coordinator roles.
                            </div>
                        )}
                    </div>

                </div>

                {/* ── Tab Bar ───────────────────────────────────────── */}
                <div className="pn-mtabs">
                    <button
                        type="button"
                        className={`pn-mtab ${activeTab === 'caps' ? 'pn-mtab--active' : ''}`}
                        onClick={() => toggleTab('caps')}
                    >
                        <Icon name="shield" /> Capabilities
                    </button>
                    {isEditMode && (
                        <button
                            type="button"
                            className={`pn-mtab ${activeTab === 'memory' ? 'pn-mtab--active' : ''}`}
                            onClick={() => toggleTab('memory')}
                        >
                            <Icon name="doc" /> Memory
                            {memoryEntries.length > 0 && <span className="pn-mtab__n">{memoryEntries.length}</span>}
                        </button>
                    )}
                    <button
                        type="button"
                        className={`pn-mtab ${activeTab === 'skills' ? 'pn-mtab--active' : ''}`}
                        onClick={() => toggleTab('skills')}
                    >
                        <Icon name="sparkles" /> Skills
                        {selectedSkills.length > 0 && <span className="pn-mtab__n">{selectedSkills.length}</span>}
                    </button>
                    <button
                        type="button"
                        className={`pn-mtab ${activeTab === 'sound' ? 'pn-mtab--active' : ''}`}
                        onClick={() => toggleTab('sound')}
                    >
                        <Icon name="music" /> Sound
                        <span className="pn-mtab__n">{getInstrumentEmoji(soundInstrument)}</span>
                    </button>
                </div>

                {/* ── Tab Content ───────────────────────────────────── */}
                {activeTab && (
                    <div className="pn-mdl__body" style={{ maxHeight: 250, paddingTop: 16, paddingBottom: 16 }}>
                        {activeTab === 'caps' && (
                            <>
                                {/* Capabilities */}
                                <div className="pn-fld">
                                    <span className="pn-flabel">Capabilities</span>
                                    <div className="pn-caps">
                                        {CAPABILITY_DEFS.map((cap) => {
                                            const isChecked = capabilities[cap.key] ?? false;
                                            return (
                                                <div
                                                    key={cap.key}
                                                    className="pn-cap"
                                                    role="switch"
                                                    aria-checked={isChecked}
                                                    title={cap.desc}
                                                    onClick={() => { if (!isSaving) handleCapabilityToggle(cap.key); }}
                                                >
                                                    <div className="pn-cap__body">
                                                        <div className="pn-cap__name">{cap.label}</div>
                                                        <div className="pn-cap__desc">{cap.desc}</div>
                                                    </div>
                                                    <span className={`pn-switch ${isChecked ? 'pn-switch--on' : ''}`}></span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Workflow */}
                                <div className="pn-fld" style={{ marginTop: 16 }}>
                                    <span className="pn-flabel">Workflow</span>
                                    <select
                                        className="pn-select"
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
                                        <div style={{ fontSize: '10px', color: 'var(--pn-ink-3)', padding: '6px 8px', border: '1px solid var(--pn-line)', borderRadius: 'var(--pn-r-xs)', maxHeight: '80px', overflow: 'auto' }}>
                                            {selectedTemplateObj.phases.map((p, i) => (
                                                <div key={i} style={{ marginBottom: i < selectedTemplateObj.phases.length - 1 ? '4px' : 0 }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--pn-ink)' }}>{p.name}:</span> {p.instruction.substring(0, 80)}{p.instruction.length > 80 ? '...' : ''}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {useCustomWorkflow && (
                                        <textarea
                                            className="pn-textarea pn-textarea--mono"
                                            style={{ minHeight: '80px', maxHeight: '150px', resize: 'vertical' }}
                                            placeholder="Enter custom workflow instructions..."
                                            value={customWorkflow}
                                            onChange={(e) => setCustomWorkflow(e.target.value)}
                                            disabled={isSaving}
                                        />
                                    )}
                                </div>

                                {/* Command Permissions */}
                                <div className="pn-fld" style={{ marginTop: 16 }}>
                                    <span className="pn-flabel">Command Permissions</span>
                                    <div className="pn-fhint">
                                        Defaults depend on mode. Toggle to restrict or explicitly grant mode-supported commands.
                                    </div>
                                    {COMMAND_GROUPS.map(group => {
                                        const isExpanded = expandedGroups.has(group.key);
                                        const supportedCommands = group.commands.filter(c => isCommandAllowedForMode(c, mode));
                                        const enabledCount = supportedCommands.filter(c => getEffectiveCommandEnabled(c, mode, commandOverrides)).length;
                                        return (
                                            <div key={group.key}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroupExpanded(group.key)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11.5px', padding: '6px 0', color: 'var(--pn-ink)', display: 'flex', alignItems: 'center', gap: '6px', width: '100%', fontFamily: 'var(--pn-ui)' }}
                                                >
                                                    <Icon name={isExpanded ? 'chevronD' : 'chevronR'} size={11} style={{ color: 'var(--pn-ink-4)' }} />
                                                    <span style={{ fontWeight: 600 }}>{group.label}</span>
                                                    <span style={{ color: 'var(--pn-ink-4)', fontFamily: 'var(--pn-mono)', fontSize: '10px' }}>
                                                        ({enabledCount}/{supportedCommands.length})
                                                    </span>
                                                </button>
                                                {isExpanded && (
                                                    <div style={{ paddingLeft: 18 }}>
                                                        {group.commands.map(cmd => {
                                                            const modeSupported = isCommandAllowedForMode(cmd, mode);
                                                            const isChecked = getEffectiveCommandEnabled(cmd, mode, commandOverrides);
                                                            return (
                                                                <div
                                                                    key={cmd}
                                                                    className="pn-cap"
                                                                    role="switch"
                                                                    aria-checked={isChecked}
                                                                    title={modeSupported ? undefined : 'Not available for current mode'}
                                                                    style={{ cursor: modeSupported ? 'pointer' : 'not-allowed', opacity: modeSupported ? 1 : 0.4 }}
                                                                    onClick={() => { if (!isSaving && modeSupported) handleCommandToggle(cmd); }}
                                                                >
                                                                    <div className="pn-cap__body">
                                                                        <div className="pn-cap__name" style={{ fontFamily: 'var(--pn-mono)', fontSize: '11px', fontWeight: 500 }}>{cmd}</div>
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
                            </>
                        )}

                        {activeTab === 'memory' && (
                            <div className="pn-fld">
                                <span className="pn-flabel">
                                    Memory
                                    <span className="pn-mtab__n">{memoryEntries.length} {memoryEntries.length === 1 ? 'entry' : 'entries'}</span>
                                </span>
                                <div className="pn-fhint" style={{ marginBottom: 8 }}>
                                    Persistent notes the agent remembers across sessions. Edit or remove entries individually.
                                </div>
                                {memoryError && (
                                    <div className="pn-fhint" style={{ color: 'var(--pn-danger, #d64545)', marginBottom: 8 }}>{memoryError}</div>
                                )}
                                {memoryEntries.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {memoryEntries.map((entry, i) => {
                                            const isEditing = editingMemoryIndex === i;
                                            const isRowSaving = memorySavingIndex === i;
                                            return (
                                                <div
                                                    key={i}
                                                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid var(--pn-line)', borderRadius: 'var(--pn-r-sm)', background: 'var(--pn-surface)' }}
                                                >
                                                    <span style={{ fontFamily: 'var(--pn-mono)', fontSize: 11, color: 'var(--pn-ink-4)', flexShrink: 0, lineHeight: '22px' }}>{i + 1}</span>
                                                    {isEditing ? (
                                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            <textarea
                                                                className="pn-textarea"
                                                                style={{ minHeight: 56, resize: 'vertical', fontSize: 12 }}
                                                                value={editingMemoryText}
                                                                autoFocus
                                                                maxLength={500}
                                                                disabled={isRowSaving}
                                                                onChange={(e) => setEditingMemoryText(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleMemoryEditSave(i); }
                                                                    else if (e.key === 'Escape') { e.preventDefault(); handleMemoryEditCancel(); }
                                                                }}
                                                            />
                                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                                <button type="button" className="pn-btn pn-btn--ghost" style={{ fontSize: 11, padding: '3px 10px' }} disabled={isRowSaving} onClick={handleMemoryEditCancel}>Cancel</button>
                                                                <button type="button" className="pn-btn pn-btn--primary" style={{ fontSize: 11, padding: '3px 10px' }} disabled={isRowSaving || !editingMemoryText.trim()} onClick={() => handleMemoryEditSave(i)}>{isRowSaving ? 'Saving…' : 'Save'}</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span style={{ flex: 1, color: 'var(--pn-ink-2)', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{entry}</span>
                                                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                                                <button type="button" className="pn-btn pn-btn--ghost" style={{ padding: 4 }} title="Edit entry" aria-label="Edit memory entry" disabled={isRowSaving} onClick={() => handleMemoryEditStart(i)}>
                                                                    <Icon name="pen" size={13} />
                                                                </button>
                                                                <button type="button" className="pn-btn pn-btn--ghost" style={{ padding: 4 }} title="Delete entry" aria-label="Delete memory entry" disabled={isRowSaving} onClick={() => handleMemoryDelete(i)}>
                                                                    <Icon name="trash" size={13} />
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="pn-fhint">No memory entries yet. Entries are added by the agent via <code style={{ fontFamily: 'var(--pn-mono)', fontSize: '10px', padding: '1px 4px', background: 'var(--pn-brand-soft)', border: '1px solid var(--pn-line-2)', borderRadius: 3 }}>maestro team-member memory append</code>.</div>
                                )}
                            </div>
                        )}

                        {activeTab === 'skills' && (
                            <ClaudeCodeSkillsSelector selectedSkills={selectedSkills} onSelectionChange={setSelectedSkills} projectPath={projectWorkingDir} />
                        )}

                        {activeTab === 'sound' && (
                            <div className="pn-fld">
                                <span className="pn-flabel"><Icon name="music" size={12} /> Instrument — each agent plays a distinct voice</span>
                                <div className="pn-instr">
                                    {(['piano', 'guitar', 'violin', 'trumpet', 'drums'] as InstrumentType[]).map((inst) => (
                                        <button
                                            key={inst}
                                            type="button"
                                            title={getInstrumentRole(inst)}
                                            className={`pn-instr-i ${soundInstrument === inst ? 'pn-instr-i--active' : ''}`}
                                            onClick={() => setSoundInstrument(inst)}
                                            disabled={isSaving}
                                        >
                                            <span style={{ fontSize: '16px' }}>{getInstrumentEmoji(inst)}</span>
                                            <span className="pn-instr-i__name">{inst}</span>
                                        </button>
                                    ))}
                                </div>
                                <div style={{ marginTop: 12 }}>
                                    <SoundSignatureGrid instrument={soundInstrument} />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {launchDropdownPortal}

                {/* ── Footer ────────────────────────────────────────── */}
                <div className="pn-mdl__foot">
                    <div className="pn-mdl__footL">
                        <select
                            className="pn-select"
                            style={{ maxWidth: 200 }}
                            value={modelProfileId ?? ''}
                            onChange={(e) => setModelProfileId(e.target.value || null)}
                            disabled={isSaving}
                            title="Bind this member to a model profile, or pick Custom to set a model directly"
                        >
                            <option value="">Custom model</option>
                            {modelProfiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                    Profile: {p.name} ({formatLaunchConfigLabel(p.launchConfig)})
                                </option>
                            ))}
                        </select>
                        {modelProfileId ? (
                            <span className="pn-savehint">resolves at spawn</span>
                        ) : (
                            <button
                                ref={launchBtnRef}
                                type="button"
                                className="pn-btn pn-btn--ghost"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const willOpen = !showLaunchDropdown;
                                    setShowLaunchDropdown(willOpen);
                                    if (willOpen) {
                                        setActiveLaunchTool(getAgentToolForLaunchConfig(launchConfig || undefined) || agentTool || 'claude-code');
                                    }
                                }}
                                disabled={isSaving}
                                title={launchLabel}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{launchLabel}</span>
                                <Icon name="chevronD" size={11} />
                            </button>
                        )}
                    </div>
                    <div className="pn-mdl__footR">
                        {isEditMode && isDefault && (
                            <button
                                type="button"
                                className="pn-btn pn-btn--danger"
                                onClick={handleResetToDefault}
                                disabled={isSaving}
                            >
                                Reset Default
                            </button>
                        )}
                        {isEditMode && autoSaveStatus !== "idle" && (
                            <span className="pn-savehint">
                                <span className={`pn-dot ${autoSaveStatus === 'error' ? 'pn-dot--block' : autoSaveStatus === 'saving' ? 'pn-dot--wait' : 'pn-dot--run'}`}></span>
                                {autoSaveStatus === "saving" ? "Saving…" : autoSaveStatus === "saved" ? "Saved" : "Save error"}
                            </span>
                        )}
                        <button type="button" className="pn-btn pn-btn--ghost" onClick={handleClose} disabled={isSaving}>
                            {isEditMode ? "Close" : "Cancel"}
                        </button>
                        {!isEditMode && (
                            <button
                                type="button"
                                className="pn-btn pn-btn--primary"
                                onClick={handleSubmit}
                                disabled={isSaving || !name.trim() || !role.trim()}
                            >
                                <Icon name="plus" size={13} /> {isSaving ? "Creating…" : "Create member"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
