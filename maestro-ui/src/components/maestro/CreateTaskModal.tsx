import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { MaestroTask, MaestroProject, TeamMember, MemberLaunchOverride } from "../../app/types/maestro";
import { maestroClient } from "../../utils/MaestroClient";
import { ClaudeCodeSkillsSelector } from "./ClaudeCodeSkillsSelector";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useTaskForm } from "../../hooks/useTaskForm";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useReferenceTaskPicker } from "../../hooks/useReferenceTaskPicker";
import { useFileAutocomplete } from "../../hooks/useFileAutocomplete";
import { useSkillAutocomplete } from "../../hooks/useSkillAutocomplete";

// Sub-components
import { TaskFormHeader } from "./task-modal/TaskFormHeader";
import { TaskDescriptionField } from "./task-modal/TaskDescriptionField";
import { ReferenceTaskPicker } from "./task-modal/ReferenceTaskPicker";
import { TaskModalFooter } from "./task-modal/TaskModalFooter";
import { TaskTabBar } from "./task-modal/TaskTabBar";
import { ConfirmDiscardDialog } from "./task-modal/ConfirmDiscardDialog";
import { LaunchConfigPanel } from "./task-modal/LaunchConfigPanel";

// Tab content components
import { SubtasksTab } from "./task-modal/SubtasksTab";
import { SessionsTab } from "./task-modal/SessionsTab";
import { GeneratedDocsTab } from "./task-modal/GeneratedDocsTab";
import { TimelineTab } from "./task-modal/TimelineTab";
import { DetailsTab } from "./task-modal/DetailsTab";
import { RefDocsTab } from "./task-modal/RefDocsTab";
import { ImagesTab } from "./task-modal/ImagesTab";

type CreateTaskModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (task: {
        title: string;
        description: string;
        priority: string;
        startImmediately?: boolean;
        skillIds?: string[];
        referenceTaskIds?: string[];
        parentId?: string;
        teamMemberId?: string;
        teamMemberIds?: string[];
        memberOverrides?: Record<string, MemberLaunchOverride>;
    }) => Promise<void> | void;
    project: MaestroProject;
    parentId?: string;
    parentTitle?: string;
    mode?: "create" | "edit";
    task?: MaestroTask;
    onUpdateTask?: (taskId: string, updates: Partial<MaestroTask>) => void;
    onAddSubtask?: (title: string) => void;
    onToggleSubtask?: (subtaskId: string) => void;
    onDeleteSubtask?: (subtaskId: string) => void;
    onWorkOn?: () => void;
    onNavigateToTask?: (taskId: string) => void;
    onJumpToSession?: (sessionId: string) => void;
    onWorkOnSubtask?: (subtask: MaestroTask) => void;
    selectedAgentId?: string;
    onAgentSelect?: (agentId: string) => void;
    variant?: "modal" | "overlay";
};

export function CreateTaskModal({
    isOpen,
    onClose,
    onCreate,
    project,
    parentId,
    parentTitle,
    mode = "create",
    task,
    onUpdateTask,
    onAddSubtask,
    onToggleSubtask,
    onDeleteSubtask,
    onWorkOn,
    onNavigateToTask,
    onJumpToSession,
    onWorkOnSubtask,
    variant = "modal",
}: CreateTaskModalProps) {
    const isEditMode = mode === "edit" && !!task;
    const isOverlay = variant === "overlay";

    // ==================== HOOKS ====================

    const form = useTaskForm(mode, isOpen, task);
    const refPicker = useReferenceTaskPicker(project?.id);
    const files = useFileAutocomplete(project?.basePath, isOpen);
    const skills = useSkillAutocomplete(project?.basePath, isOpen);
    const stagedFileInputRef = useRef<HTMLInputElement>(null);
    const tasks = useMaestroStore(s => s.tasks);
    const teamMembersMap = useMaestroStore(s => s.teamMembers);
    const teamMembers = useMemo(() =>
        Object.values(teamMembersMap).filter((m: TeamMember) => m.status === 'active' && m.projectId === project?.id),
        [teamMembersMap, project?.id]
    );

    // ==================== AUTO-CREATE (create mode) ====================
    // When user types content in create mode, auto-create the task on the server
    // so that all further edits are auto-saved.

    const [autoCreatedTask, setAutoCreatedTask] = useState<MaestroTask | null>(null);
    const autoCreateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isAutoCreatingRef = useRef(false);

    // "Effective" edit mode — either passed in as edit, or auto-created from create
    const effectiveEditMode = isEditMode || !!autoCreatedTask;
    const effectiveTask = isEditMode ? task : autoCreatedTask;

    // Reset auto-created task when modal closes/reopens
    useEffect(() => {
        if (!isOpen || mode !== "create") {
            setAutoCreatedTask(null);
            isAutoCreatingRef.current = false;
        }
    }, [isOpen, mode]);

    // Auto-create: when user types content in create mode, debounce then create on server
    useEffect(() => {
        if (mode !== "create" || autoCreatedTask || isAutoCreatingRef.current) return;
        const hasContent = form.title.trim() !== "" || form.prompt.trim() !== "";
        if (!hasContent) return;

        if (autoCreateTimerRef.current) clearTimeout(autoCreateTimerRef.current);
        autoCreateTimerRef.current = setTimeout(async () => {
            if (isAutoCreatingRef.current) return;
            isAutoCreatingRef.current = true;
            try {
                const storeCreateTask = useMaestroStore.getState().createTask;
                const newTask = await storeCreateTask({
                    projectId: project.id,
                    title: form.title.trim(),
                    description: form.prompt,
                    priority: form.priority,
                    parentId: parentId || undefined,
                    skillIds: form.selectedSkills.length > 0 ? form.selectedSkills : undefined,
                    referenceTaskIds: refPicker.selectedReferenceTasks.length > 0
                        ? refPicker.selectedReferenceTasks.map(t => t.id) : undefined,
                    teamMemberId: form.selectedTeamMemberIds.length === 1 ? form.selectedTeamMemberIds[0] : undefined,
                    teamMemberIds: form.selectedTeamMemberIds.length > 0 ? form.selectedTeamMemberIds : undefined,
                });
                setAutoCreatedTask(newTask);
                // Upload staged images if any
                if (form.stagedImageFiles.length > 0) {
                    for (const file of form.stagedImageFiles) {
                        try { await maestroClient.uploadTaskImage(newTask.id, file); } catch { /* silent */ }
                    }
                }
            } catch {
                // Auto-create failed — user can still manually create via button
                isAutoCreatingRef.current = false;
            }
        }, 1000);

        return () => {
            if (autoCreateTimerRef.current) clearTimeout(autoCreateTimerRef.current);
        };
    }, [mode, autoCreatedTask, form.title, form.prompt, form.priority, form.selectedTeamMemberIds, form.selectedSkills, project?.id, parentId, refPicker.selectedReferenceTasks]);

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (autoCreateTimerRef.current) clearTimeout(autoCreateTimerRef.current);
        };
    }, []);

    // ==================== AUTO-SAVE ====================

    // Auto-save works for both edit mode AND auto-created tasks in create mode
    const autoSaveFn = useCallback(async () => {
        if (!effectiveEditMode || !effectiveTask || !onUpdateTask) {
            // For auto-created tasks, use the store's updateTask directly
            if (autoCreatedTask) {
                const updateTask = useMaestroStore.getState().updateTask;
                const refIds = refPicker.selectedReferenceTasks.map(t => t.id);
                const updates: Partial<MaestroTask> = {};
                if (form.title.trim() !== (autoCreatedTask.title || "")) updates.title = form.title.trim();
                if (form.prompt !== (autoCreatedTask.description || "")) updates.description = form.prompt;
                if (form.priority !== autoCreatedTask.priority) updates.priority = form.priority;
                if (form.dueDate !== (autoCreatedTask.dueDate || "")) updates.dueDate = form.dueDate || null;
                const currentIds = autoCreatedTask.teamMemberIds || (autoCreatedTask.teamMemberId ? [autoCreatedTask.teamMemberId] : []);
                if (JSON.stringify(form.selectedTeamMemberIds) !== JSON.stringify(currentIds)) {
                    updates.teamMemberIds = form.selectedTeamMemberIds.length > 0 ? form.selectedTeamMemberIds : undefined;
                    updates.teamMemberId = form.selectedTeamMemberIds.length === 1 ? form.selectedTeamMemberIds[0] : undefined;
                }
                if (JSON.stringify(form.selectedSkills) !== JSON.stringify(autoCreatedTask.skillIds || [])) updates.skillIds = form.selectedSkills;
                if (JSON.stringify(refIds) !== JSON.stringify(autoCreatedTask.referenceTaskIds || [])) updates.referenceTaskIds = refIds;
                if (Object.keys(updates).length > 0) {
                    const updated = await updateTask(autoCreatedTask.id, updates);
                    setAutoCreatedTask(updated);
                }
                return;
            }
            return;
        }
        const refIds = refPicker.selectedReferenceTasks.map(t => t.id);
        const updates = form.getUpdateDiff(refIds, teamMembers);
        if (updates) {
            await onUpdateTask(effectiveTask!.id, updates);
        }
    }, [effectiveEditMode, effectiveTask, autoCreatedTask, onUpdateTask, form.title, form.prompt, form.priority, form.dueDate, form.selectedTeamMemberIds, form.selectedSkills, form.memberConfigs, refPicker.selectedReferenceTasks, teamMembers]);

    const { status: autoSaveStatus, saveNow } = useAutoSave({
        changeVersion: form.changeVersion,
        hasChanges: effectiveEditMode ? form.hasUnsavedContent : false,
        saveFn: autoSaveFn,
        debounceMs: 1000,
        enabled: effectiveEditMode,
    });

    // Load reference tasks for edit mode
    useEffect(() => {
        if (isEditMode && task?.referenceTaskIds && task.referenceTaskIds.length > 0) {
            (async () => {
                const refTasks: MaestroTask[] = [];
                for (const refId of task.referenceTaskIds!) {
                    try {
                        const t = await maestroClient.getTask(refId);
                        refTasks.push(t);
                    } catch { /* skip if task not found */ }
                }
                refPicker.setSelectedReferenceTasks(refTasks);
            })();
        } else if (isEditMode) {
            refPicker.setSelectedReferenceTasks([]);
        }
    }, [isEditMode, isOpen, task?.id, JSON.stringify(task?.referenceTaskIds)]);

    // Reset reference picker when switching to create mode
    useEffect(() => {
        if (mode === "create" && isOpen) {
            refPicker.reset();
        }
    }, [mode, isOpen]);

    // ==================== HANDLERS ====================

    const handleClose = async () => {
        if (effectiveEditMode) {
            // Task exists on server (edit mode or auto-created) — save and close
            if (form.hasUnsavedContent) {
                await saveNow();
            }
            onClose();
        } else if (form.hasUnsavedContent) {
            // Create mode, no auto-created task yet — ask to discard
            form.setShowConfirmDialog(true);
        } else {
            onClose();
        }
    };

    const handleConfirmDiscard = () => {
        // Cancel any pending auto-create
        if (autoCreateTimerRef.current) clearTimeout(autoCreateTimerRef.current);
        form.resetForm();
        refPicker.reset();
        onClose();
    };

    const handleToggleLaunchConfig = () => {
        if (!form.showLaunchConfig) {
            const savedOverrides = isEditMode ? task?.memberOverrides : undefined;
            for (const id of form.selectedTeamMemberIds) {
                form.initMemberConfig(id, teamMembers, savedOverrides);
            }
            form.setActiveTab(null);
        }
        form.setShowLaunchConfig(!form.showLaunchConfig);
    };

    const handleSubmit = async (startImmediately: boolean) => {
        if (autoCreatedTask) {
            // Task already exists on server via auto-create
            // Save any pending changes first
            if (form.hasUnsavedContent) {
                await saveNow();
            }
            if (startImmediately) {
                // Pass _existingTaskId so MaestroPanel skips creation and just launches
                const overrides = form.getMemberOverrides(teamMembers);
                await onCreate({
                    title: form.title.trim() || "Untitled",
                    description: form.prompt,
                    priority: form.priority,
                    startImmediately: true,
                    skillIds: form.selectedSkills.length > 0 ? form.selectedSkills : undefined,
                    referenceTaskIds: refPicker.selectedReferenceTasks.length > 0
                        ? refPicker.selectedReferenceTasks.map(t => t.id) : undefined,
                    parentId,
                    teamMemberId: form.selectedTeamMemberIds.length === 1 ? form.selectedTeamMemberIds[0] : undefined,
                    teamMemberIds: form.selectedTeamMemberIds.length > 0 ? form.selectedTeamMemberIds : undefined,
                    ...(overrides && { memberOverrides: overrides }),
                    _existingTaskId: autoCreatedTask.id,
                } as any);
            }
            form.resetForm();
            refPicker.reset();
            setAutoCreatedTask(null);
            onClose();
            return;
        }

        // No auto-created task — normal create flow
        if (!form.title.trim() && !form.prompt.trim()) return;

        // Cancel any pending auto-create timer
        if (autoCreateTimerRef.current) clearTimeout(autoCreateTimerRef.current);

        const payload = form.getCreatePayload(
            startImmediately,
            refPicker.selectedReferenceTasks.map(t => t.id),
            parentId,
        );

        const overrides = form.getMemberOverrides(teamMembers);
        if (overrides) {
            (payload as any).memberOverrides = overrides;
        }

        await onCreate(payload);
        form.resetForm();
        refPicker.reset();
        onClose();
    };

    const handleSave = () => {
        if (!effectiveEditMode) return;
        saveNow();
    };

    const handleAddSubtask = () => {
        if (form.newSubtaskTitle.trim()) {
            onAddSubtask?.(form.newSubtaskTitle);
            form.setNewSubtaskTitle("");
            form.setShowSubtaskInput(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (effectiveEditMode) saveNow();
            else handleSubmit(false);
        }
    };

    // ==================== EARLY RETURNS ====================

    if (!isOpen) return null;

    const subtasks = isEditMode && task ? (task.subtasks || []) : [];

    // ==================== RENDER ====================

    const modalContent = (
        <>
            <div className={`themedModal themedModal--wide ${isOverlay ? 'themedModal--overlay' : ''}`} onClick={(e) => e.stopPropagation()}>
                <TaskFormHeader
                    title={form.title}
                    onTitleChange={form.setTitle}
                    onKeyDown={handleKeyDown}
                    isEditMode={isEditMode}
                    task={effectiveTask || undefined}
                    isOverlay={isOverlay}
                    onClose={handleClose}
                    parentId={parentId}
                    parentTitle={parentTitle}
                    onNavigateToTask={onNavigateToTask}
                    autoFocus={!isEditMode}
                />

                {form.showLaunchConfig ? (
                    /* Launch config panel replaces description + tabs */
                    <div className="themedModalContent">
                        <LaunchConfigPanel
                            selectedTeamMemberIds={form.selectedTeamMemberIds}
                            teamMembers={teamMembers}
                            memberConfigs={form.memberConfigs}
                            onUpdateConfig={form.updateMemberConfig}
                            onClose={() => form.setShowLaunchConfig(false)}
                        />
                    </div>
                ) : (
                    /* Normal description + tabs view */
                    <>
                        <div className={isOverlay ? 'themedModalDescriptionArea' : ''}>
                            <div className="themedModalContent">
                                <TaskDescriptionField
                                    prompt={form.prompt}
                                    onPromptChange={form.setPrompt}
                                    onKeyDown={handleKeyDown}
                                    files={files}
                                    skills={skills}
                                    isOverlay={isOverlay}
                                >
                                    {effectiveEditMode && effectiveTask ? (
                                        <ImagesTab
                                            variant="bar"
                                            taskId={effectiveTask.id}
                                            images={form.taskImages}
                                            onImagesChange={form.setTaskImages}
                                        />
                                    ) : (
                                        <>
                                            {form.stagedImagePreviews.map((preview, i) => (
                                                <span
                                                    key={i}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '2px 6px 2px 3px',
                                                        fontSize: '10px',
                                                        border: '1px solid var(--theme-border)',
                                                        borderRadius: '3px',
                                                        backgroundColor: 'rgba(var(--theme-primary-rgb), 0.05)',
                                                        color: 'var(--theme-text-secondary)',
                                                        maxWidth: '120px',
                                                    }}
                                                    title={form.stagedImageFiles[i]?.name}
                                                >
                                                    <img
                                                        src={preview}
                                                        alt={form.stagedImageFiles[i]?.name}
                                                        style={{ width: '16px', height: '16px', objectFit: 'cover', borderRadius: '2px', flexShrink: 0 }}
                                                    />
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70px' }}>
                                                        {form.stagedImageFiles[i]?.name}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => form.removeStagedFile(i)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-text-secondary)', padding: '0', fontSize: '12px', lineHeight: 1, flexShrink: 0, opacity: 0.6 }}
                                                    >×</button>
                                                </span>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => stagedFileInputRef.current?.click()}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', fontSize: '10px', border: '1px solid var(--theme-border)', borderRadius: '3px', background: 'transparent', color: 'var(--theme-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
                                                title="Attach image"
                                            >+ img</button>
                                            <input
                                                ref={stagedFileInputRef}
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                style={{ display: 'none' }}
                                                onChange={(e) => { if (e.target.files) { form.addStagedFiles(e.target.files); e.target.value = ''; } }}
                                            />
                                        </>
                                    )}
                                    <ReferenceTaskPicker
                                        selectedReferenceTasks={refPicker.selectedReferenceTasks}
                                        showPicker={refPicker.showPicker}
                                        candidates={refPicker.candidates}
                                        loading={refPicker.loading}
                                        displayCount={refPicker.displayCount}
                                        onTogglePicker={refPicker.togglePicker}
                                        onClosePicker={refPicker.closePicker}
                                        onToggleSelection={refPicker.toggleSelection}
                                        onRemoveTask={refPicker.removeTask}
                                        onLoadMore={refPicker.loadMore}
                                    />
                                </TaskDescriptionField>
                            </div>

                            {/* Tab Content */}
                            {form.activeTab && (
                            <div className={`themedModalTabContent${isOverlay ? ' themedModalTabContent--overlay' : ''}`} style={!isOverlay ? { maxHeight: '200px', overflowY: 'auto', borderTop: '1px solid var(--theme-border)' } : undefined}>
                                {form.activeTab === 'subtasks' && isEditMode && (
                                    <SubtasksTab
                                        taskId={task!.id}
                                        subtasks={subtasks}
                                        newSubtaskTitle={form.newSubtaskTitle}
                                        onNewSubtaskTitleChange={form.setNewSubtaskTitle}
                                        showSubtaskInput={form.showSubtaskInput}
                                        onToggleSubtaskInput={form.setShowSubtaskInput}
                                        onAddSubtask={handleAddSubtask}
                                        onToggleSubtask={onToggleSubtask}
                                        onDeleteSubtask={onDeleteSubtask}
                                        onNavigateToTask={onNavigateToTask}
                                        onWorkOnSubtask={onWorkOnSubtask}
                                    />
                                )}
                                {form.activeTab === 'skills' && (
                                    <ClaudeCodeSkillsSelector
                                        selectedSkills={form.selectedSkills}
                                        onSelectionChange={form.setSelectedSkills}
                                        projectPath={project?.basePath || project?.workingDir || undefined}
                                    />
                                )}
                                {form.activeTab === 'sessions' && isEditMode && (
                                    <SessionsTab
                                        taskId={task!.id}
                                        tasks={tasks}
                                        onJumpToSession={onJumpToSession}
                                    />
                                )}
                                {form.activeTab === 'ref-docs' && (
                                    <RefDocsTab
                                        selectedReferenceTasks={refPicker.selectedReferenceTasks}
                                        onRemoveTask={refPicker.removeTask}
                                    />
                                )}
                                {form.activeTab === 'gen-docs' && isEditMode && (
                                    <GeneratedDocsTab taskDocs={form.taskDocs} />
                                )}
                                {form.activeTab === 'timeline' && isEditMode && task && (
                                    <TimelineTab taskId={task.id} />
                                )}
                                {form.activeTab === 'details' && (
                                    <DetailsTab
                                        priority={form.priority}
                                        onPriorityChange={form.setPriority}
                                        dueDate={form.dueDate}
                                        onDueDateChange={form.setDueDate}
                                        isEditMode={isEditMode}
                                        task={effectiveTask || undefined}
                                    />
                                )}
                            </div>
                            )}
                        </div>

                        <TaskTabBar
                            activeTab={form.activeTab}
                            onToggleTab={form.toggleTab}
                            onCloseTab={() => form.setActiveTab(null)}
                            isEditMode={isEditMode}
                            taskId={effectiveTask?.id}
                            selectedSkillsCount={form.selectedSkills.length}
                            selectedRefTasksCount={refPicker.selectedReferenceTasks.length}
                            taskDocsCount={form.taskDocs.length}
                        />
                    </>
                )}

                <TaskModalFooter
                    isEditMode={isEditMode}
                    isValid={form.isValid}
                    selectedTeamMemberIds={form.selectedTeamMemberIds}
                    onTeamMemberSelectionChange={form.setSelectedTeamMemberIds}
                    teamMembers={teamMembers}
                    onClose={handleClose}
                    onSave={handleSave}
                    onSubmit={handleSubmit}
                    onWorkOn={onWorkOn}
                    showLaunchConfig={form.showLaunchConfig}
                    onToggleLaunchConfig={handleToggleLaunchConfig}
                    autoSaveStatus={effectiveEditMode ? autoSaveStatus : undefined}
                    autoCreatedTask={autoCreatedTask}
                />
            </div>

            <ConfirmDiscardDialog
                isOpen={form.showConfirmDialog}
                onConfirm={handleConfirmDiscard}
                onCancel={() => form.setShowConfirmDialog(false)}
            />
        </>
    );

    if (variant === 'overlay') {
        return modalContent;
    }

    return createPortal(
        <div className="themedModalBackdrop" onClick={handleClose}>
            {modalContent}
        </div>,
        document.body
    );
}
