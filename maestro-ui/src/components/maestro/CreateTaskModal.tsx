import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MaestroTask, MaestroProject, TeamMember, MemberLaunchOverride, TaskImage } from "../../app/types/maestro";
import { ClaudeCodeSkillsSelector } from "./ClaudeCodeSkillsSelector";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { maestroClient } from "../../utils/MaestroClient";
import {
    dataTransferHasFiles,
    extractDroppedImagePathFiles,
    extractImageFiles,
    nextImageNameIndex,
} from "../../utils/clipboardImages";
import { Icon } from "./redesign/kit";
import { useTaskForm } from "../../hooks/useTaskForm";
import { useReferenceTaskPicker } from "../../hooks/useReferenceTaskPicker";
import { useFileAutocomplete } from "../../hooks/useFileAutocomplete";
import { useSkillAutocomplete } from "../../hooks/useSkillAutocomplete";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useDraftTaskLifecycle } from "../../hooks/useDraftTaskLifecycle";

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
    onStartTask?: (taskId: string) => Promise<void> | void;
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
    onStartTask,
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

    const refPicker = useReferenceTaskPicker(project?.id);
    const files = useFileAutocomplete(project?.basePath, isOpen);
    const skills = useSkillAutocomplete(project?.basePath, isOpen);
    const modalRef = useRef<HTMLDivElement>(null);
    const stagedFileInputRef = useRef<HTMLInputElement>(null);
    const [stagedPreviewIndex, setStagedPreviewIndex] = useState<number | null>(null);
    const tasks = useMaestroStore(s => s.tasks);
    const teamMembersMap = useMaestroStore(s => s.teamMembers);
    const teamMembers = useMemo(() =>
        Object.values(teamMembersMap).filter((m: TeamMember) => m.status === 'active' && m.projectId === project?.id),
        [teamMembersMap, project?.id]
    );
    const teamsMap = useMaestroStore(s => s.teams);
    const teams = useMemo(() =>
        Object.values(teamsMap).filter((t) => t.status === 'active' && t.projectId === project?.id),
        [teamsMap, project?.id]
    );

    // ==================== DRAFT LIFECYCLE ====================

    const getAutoTitle = useCallback(() => {
        const storeTasks = useMaestroStore.getState().tasks;
        const projectTasks = Object.values(storeTasks).filter(
            (t: MaestroTask) => t.projectId === project?.id
        );
        let n = 1;
        const existingTitles = new Set(projectTasks.map((t: MaestroTask) => t.title));
        while (existingTitles.has(`Untitled ${n}`)) n++;
        return `Untitled ${n}`;
    }, [project?.id]);

    // We need a ref to read form state at create time (avoids stale closures)
    const formStateRef = useRef({
        title: "", prompt: "", priority: "medium" as string,
        selectedTeamMemberIds: [] as string[], selectedSkills: [] as string[],
        selectedReferenceTasks: [] as MaestroTask[],
        selectedTeamId: null as string | null,
        dueDate: "" as string,
        useWorktree: false,
        dangerousMode: false,
    });

    const draft = useDraftTaskLifecycle({
        projectId: project?.id,
        parentId,
        enabled: mode === "create" && isOpen,
        getFormData: () => ({
            title: formStateRef.current.title.trim() || getAutoTitle(),
            description: formStateRef.current.prompt,
            priority: formStateRef.current.priority as any,
            skillIds: formStateRef.current.selectedSkills.length > 0 ? formStateRef.current.selectedSkills : undefined,
            referenceTaskIds: formStateRef.current.selectedReferenceTasks.length > 0
                ? formStateRef.current.selectedReferenceTasks.map(t => t.id) : undefined,
            teamMemberId: formStateRef.current.selectedTeamMemberIds.length === 1 ? formStateRef.current.selectedTeamMemberIds[0] : undefined,
            teamMemberIds: formStateRef.current.selectedTeamMemberIds.length > 0 ? formStateRef.current.selectedTeamMemberIds : undefined,
            teamId: formStateRef.current.selectedTeamId ?? null,
            dueDate: formStateRef.current.dueDate || undefined,
            useWorktree: formStateRef.current.useWorktree || false,
            dangerousMode: formStateRef.current.dangerousMode || false,
        }),
    }) as ReturnType<typeof useDraftTaskLifecycle> & { _triggerAutoCreate: () => void; _uploadStagedImages: (taskId: string, files: File[]) => Promise<TaskImage[]> };

    const form = useTaskForm(mode, isOpen, task, draft.draftTask, refPicker.selectedReferenceTasks);

    // Keep formStateRef in sync (read at create time, not in a stale closure)
    formStateRef.current = {
        title: form.title,
        prompt: form.prompt,
        priority: form.priority,
        selectedTeamMemberIds: form.selectedTeamMemberIds,
        selectedSkills: form.selectedSkills,
        selectedReferenceTasks: refPicker.selectedReferenceTasks,
        selectedTeamId: form.selectedTeamId,
        dueDate: form.dueDate,
        useWorktree: form.useWorktree,
        dangerousMode: form.dangerousMode,
    };

    const effectiveEditMode = isEditMode || draft.phase === "created";
    const effectiveTask = isEditMode ? task : draft.draftTask;
    const getNextImageIndex = useCallback(() => {
        return nextImageNameIndex([...form.taskImages, ...form.stagedImageFiles]);
    }, [form.taskImages, form.stagedImageFiles]);

    useEffect(() => {
        if (stagedPreviewIndex !== null && stagedPreviewIndex >= form.stagedImagePreviews.length) {
            setStagedPreviewIndex(null);
        }
    }, [stagedPreviewIndex, form.stagedImagePreviews.length]);

    const formatImageSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Trigger auto-create when user starts typing (or attaches/pastes an image) in create mode
    useEffect(() => {
        if (mode !== "create" || draft.phase !== "idle") return;
        const hasContent = form.title.trim() !== "" || form.prompt.trim() !== "" || form.stagedImageFiles.length > 0;
        if (hasContent) {
            draft._triggerAutoCreate();
        }
    }, [mode, draft.phase, form.title, form.prompt, form.stagedImageFiles.length]);

    // Upload staged images after draft creation, then surface them as task images
    useEffect(() => {
        if (draft.phase === "created" && draft.draftTaskId && form.stagedImageFiles.length > 0) {
            const files = form.stagedImageFiles;
            form.clearStagedFiles();
            draft._uploadStagedImages(draft.draftTaskId, files).then(uploaded => {
                if (uploaded.length > 0) {
                    form.setTaskImages(prev => [...prev, ...uploaded]);
                }
            });
        }
    }, [draft.phase, draft.draftTaskId, form.stagedImageFiles.length]);

    // ==================== AUTO-SAVE ====================

    const autoSaveFn = useCallback(async () => {
        const targetTask = effectiveTask;
        if (!targetTask) return;

        const refIds = refPicker.selectedReferenceTasks.map(t => t.id);
        const updates = form.getUpdateDiff(refIds, teamMembers);
        if (!updates) return;

        if (isEditMode && onUpdateTask) {
            await onUpdateTask(targetTask.id, updates);
        } else {
            await useMaestroStore.getState().updateTask(targetTask.id, updates);
        }
    }, [effectiveTask, isEditMode, onUpdateTask, form, refPicker.selectedReferenceTasks, teamMembers]);

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
                        const { default: maestroClient } = await import("../../utils/MaestroClient").then(m => ({ default: m.maestroClient }));
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
            // Auto-save any pending changes before closing
            if (form.hasUnsavedContent) {
                await saveNow();
            }
            onClose();
        } else if (form.hasUnsavedContent || draft.phase !== "idle") {
            // Has content but no draft yet, or draft is creating — ask to discard
            form.setShowConfirmDialog(true);
        } else {
            onClose();
        }
    };

    const handleConfirmDiscard = async () => {
        await draft.discard();
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
        // Draft path: task already exists (or will be created) on server
        if (draft.phase !== "idle") {
            const taskId = await draft.ensureCreated();
            if (!taskId) return; // creation failed

            // Save any pending changes
            if (form.hasUnsavedContent) {
                await saveNow();
            }

            if (startImmediately && onStartTask) {
                await onStartTask(taskId);
            }

            form.resetForm();
            refPicker.reset();
            onClose();
            return;
        }

        // Normal create flow (user submitted before auto-create fired — rare but possible)
        if (!form.title.trim() && !form.prompt.trim()) return;

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

    // ==================== IMAGE PASTE / DROP ====================

    const [imageUploading, setImageUploading] = useState(false);

    // Route incoming images: upload directly when the task exists on the
    // server (edit mode or created draft), otherwise stage them locally —
    // staging triggers draft auto-create, which uploads them on creation.
    const acceptImageFiles = useCallback(async (files: File[]) => {
        const imageFiles = files.filter(file => file.type.startsWith("image/"));
        if (imageFiles.length === 0) return;

        if (effectiveEditMode && effectiveTask) {
            setImageUploading(true);
            try {
                for (const file of imageFiles) {
                    try {
                        const img = await maestroClient.uploadTaskImage(effectiveTask.id, file);
                        form.setTaskImages(prev => [...prev, img]);
                    } catch { /* skip failed upload, keep the rest */ }
                }
            } finally {
                setImageUploading(false);
            }
        } else {
            form.addStagedFiles(imageFiles);
        }
    }, [effectiveEditMode, effectiveTask?.id, form.setTaskImages, form.addStagedFiles]);

    // Ref so the document-level listener never sees a stale closure
    const acceptImageFilesRef = useRef(acceptImageFiles);
    acceptImageFilesRef.current = acceptImageFiles;
    const getNextImageIndexRef = useRef(getNextImageIndex);
    getNextImageIndexRef.current = getNextImageIndex;

    // Paste anywhere inside the modal (title, description, any focused element)
    const handlePaste = (e: React.ClipboardEvent) => {
        const images = extractImageFiles(e.clipboardData, {
            startIndex: getNextImageIndex(),
            renameAll: true,
        });
        if (images.length === 0) return;
        // Claim the paste: screenshots / copied images / copied files should
        // attach, not leak file paths into the focused text field.
        e.preventDefault();
        acceptImageFiles(images);
    };

    // Fallback: paste while no element inside the modal has focus
    useEffect(() => {
        if (!isOpen) return;
        const onDocPaste = (e: ClipboardEvent) => {
            const root = modalRef.current;
            const target = e.target as HTMLElement | null;
            // Inside the modal → the React onPaste handler covers it
            if (root && target instanceof Node && root.contains(target)) return;
            // Another editor (input, textarea, terminal) owns this paste
            if (target) {
                const tag = (target.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;
                if (typeof target.closest === 'function' && target.closest('.xterm')) return;
            }
            const images = extractImageFiles(e.clipboardData, {
                startIndex: getNextImageIndexRef.current(),
                renameAll: true,
            });
            if (images.length === 0) return;
            e.preventDefault();
            acceptImageFilesRef.current(images);
        };
        document.addEventListener('paste', onDocPaste);
        return () => document.removeEventListener('paste', onDocPaste);
    }, [isOpen]);

    // Drag & drop images onto the modal
    const handleDragOver = (e: React.DragEvent) => {
        if (dataTransferHasFiles(e.dataTransfer)) e.preventDefault();
    };
    const handleDrop = (e: React.DragEvent) => {
        const images = extractImageFiles(e.dataTransfer, {
            startIndex: getNextImageIndex(),
            renameAll: true,
        });
        if (images.length === 0) return;
        e.preventDefault();
        acceptImageFiles(images);
    };

    useEffect(() => {
        if (!isOpen) return;

        let unlistenWebview: (() => void) | null = null;
        let unlistenWindow: (() => void) | null = null;
        let cancelled = false;
        let lastDropSignature = "";
        let lastDropAt = 0;

        const pointIsInsideModal = (x: number, y: number) => {
            const root = modalRef.current;
            if (!root) return false;
            const element = document.elementFromPoint(x, y);
            return !!element && root.contains(element);
        };

        const dropPositionIsInsideModal = (position: { x: number; y: number } | undefined) => {
            const root = modalRef.current;
            if (!root) return false;
            if (!position) return root.matches(":hover");

            const scale = window.devicePixelRatio || 1;
            return (
                pointIsInsideModal(position.x / scale, position.y / scale) ||
                pointIsInsideModal(position.x, position.y) ||
                root.matches(":hover")
            );
        };

        const handleNativeDrop = async (event: { payload: any }) => {
            if (cancelled) return;
            const payload = event.payload;
            if (payload?.type !== "drop") return;
            if (!dropPositionIsInsideModal(payload.position)) return;

            const paths = Array.isArray(payload.paths) ? payload.paths.filter((p: unknown): p is string => typeof p === "string") : [];
            if (paths.length === 0) return;

            const signature = `${paths.join("\n")}@${payload.position?.x ?? ""},${payload.position?.y ?? ""}`;
            const now = Date.now();
            if (signature === lastDropSignature && now - lastDropAt < 300) return;
            lastDropSignature = signature;
            lastDropAt = now;

            const files = await extractDroppedImagePathFiles(paths, {
                startIndex: getNextImageIndexRef.current(),
                renameAll: true,
            });
            if (!cancelled && files.length > 0) {
                acceptImageFilesRef.current(files);
            }
        };

        const setupNativeDrop = async () => {
            try {
                const { getCurrentWebview } = await import("@tauri-apps/api/webview");
                unlistenWebview = await getCurrentWebview().onDragDropEvent(handleNativeDrop);
            } catch {
                // Browser dev mode or an older runtime: DOM drop handling remains active.
            }

            try {
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                unlistenWindow = await getCurrentWindow().onDragDropEvent(handleNativeDrop);
            } catch {
                // Browser dev mode or an older runtime: DOM drop handling remains active.
            }
        };

        void setupNativeDrop();
        return () => {
            cancelled = true;
            unlistenWebview?.();
            unlistenWindow?.();
        };
    }, [isOpen]);

    // ==================== EARLY RETURNS ====================

    if (!isOpen) return null;

    const subtasks = effectiveEditMode && effectiveTask ? (effectiveTask.subtasks || []) : [];

    // ==================== RENDER ====================

    const modalContent = (
        <>
            <div
                ref={modalRef}
                className={`pn-mdl ${isOverlay ? 'pn-mdl--overlay' : ''}`}
                onClick={(e) => e.stopPropagation()}
                onPaste={handlePaste}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                <TaskFormHeader
                    title={form.title}
                    onTitleChange={form.setTitle}
                    onKeyDown={handleKeyDown}
                    isEditMode={effectiveEditMode}
                    task={effectiveTask || undefined}
                    isOverlay={isOverlay}
                    onClose={handleClose}
                    parentId={parentId}
                    parentTitle={parentTitle}
                    projectName={project?.name}
                    onNavigateToTask={onNavigateToTask}
                    autoFocus={!isEditMode}
                />

                {form.showLaunchConfig ? (
                    /* Launch config panel replaces description + tabs */
                    <div className="pn-mdl__body">
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
                            <div className="pn-mdl__body">
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
                                                    className="pn-mchip pn-mchip--ref"
                                                    style={{ maxWidth: '120px', cursor: 'pointer' }}
                                                    title={form.stagedImageFiles[i]?.name}
                                                    onClick={() => setStagedPreviewIndex(i)}
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
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            form.removeStagedFile(i);
                                                        }}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0', display: 'inline-flex', lineHeight: 1, flexShrink: 0 }}
                                                    ><Icon name="x" size={11} /></button>
                                                </span>
                                            ))}
                                            <button
                                                type="button"
                                                className="pn-mchip"
                                                onClick={() => stagedFileInputRef.current?.click()}
                                                title="Attach image"
                                            ><Icon name="paperclip" size={12} /> Attach</button>
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
                                    {imageUploading && (
                                        <span className="pn-mchip" style={{ opacity: 0.7 }}>
                                            <Icon name="paperclip" size={12} /> Uploading…
                                        </span>
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
                            <div className={`pn-mdl__body${isOverlay ? ' themedModalTabContent--overlay' : ''}`} style={!isOverlay ? { maxHeight: '220px', borderTop: '1px solid var(--pn-line)' } : undefined}>
                                {form.activeTab === 'subtasks' && effectiveEditMode && effectiveTask && (
                                    <SubtasksTab
                                        taskId={effectiveTask.id}
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
                                        alwaysExpanded
                                    />
                                )}
                                {form.activeTab === 'sessions' && effectiveEditMode && effectiveTask && (
                                    <SessionsTab
                                        taskId={effectiveTask.id}
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
                                {form.activeTab === 'gen-docs' && effectiveEditMode && (
                                    <GeneratedDocsTab taskDocs={form.taskDocs} />
                                )}
                                {form.activeTab === 'timeline' && effectiveEditMode && effectiveTask && (
                                    <TimelineTab taskId={effectiveTask.id} />
                                )}
                                {form.activeTab === 'details' && (
                                    <DetailsTab
                                        priority={form.priority}
                                        onPriorityChange={form.setPriority}
                                        dueDate={form.dueDate}
                                        onDueDateChange={form.setDueDate}
                                        useWorktree={form.useWorktree}
                                        onUseWorktreeChange={form.setUseWorktree}
                                        dangerousMode={form.dangerousMode}
                                        onDangerousModeChange={form.setDangerousMode}
                                        isEditMode={effectiveEditMode}
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
                            isEditMode={effectiveEditMode}
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
                    onTeamMemberSelectionChange={(ids) => {
                        if (ids.length > 0 && form.selectedTeamId) form.setSelectedTeamId(null);
                        form.setSelectedTeamMemberIds(ids);
                    }}
                    teams={teams}
                    selectedTeamId={form.selectedTeamId}
                    onTeamChange={(teamId) => {
                        if (teamId && form.selectedTeamMemberIds.length > 0) form.setSelectedTeamMemberIds([]);
                        form.setSelectedTeamId(teamId);
                    }}
                    teamMembers={teamMembers}
                    dangerousMode={form.dangerousMode}
                    onDangerousModeChange={form.setDangerousMode}
                    useWorktree={form.useWorktree}
                    onUseWorktreeChange={form.setUseWorktree}
                    onClose={handleClose}
                    onSave={handleSave}
                    onSubmit={handleSubmit}
                    onWorkOn={onWorkOn}
                    showLaunchConfig={form.showLaunchConfig}
                    onToggleLaunchConfig={handleToggleLaunchConfig}
                    autoSaveStatus={effectiveEditMode ? autoSaveStatus : undefined}
                    isDraft={draft.phase === "created"}
                />
            </div>

            <ConfirmDiscardDialog
                isOpen={form.showConfirmDialog}
                onConfirm={handleConfirmDiscard}
                onCancel={() => form.setShowConfirmDialog(false)}
            />

            {stagedPreviewIndex !== null && form.stagedImagePreviews[stagedPreviewIndex] && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        cursor: 'pointer',
                    }}
                    onClick={() => setStagedPreviewIndex(null)}
                >
                    <img
                        src={form.stagedImagePreviews[stagedPreviewIndex]}
                        alt={form.stagedImageFiles[stagedPreviewIndex]?.name}
                        style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }}
                    />
                    <div style={{ color: '#fff', marginTop: '8px', fontSize: '12px', textAlign: 'center' }}>
                        {form.stagedImageFiles[stagedPreviewIndex]?.name}
                        {' '}&middot;{' '}
                        {formatImageSize(form.stagedImageFiles[stagedPreviewIndex]?.size ?? 0)}
                    </div>
                </div>
            )}
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
