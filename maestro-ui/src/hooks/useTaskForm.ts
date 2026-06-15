import { useState, useEffect, useMemo, useCallback } from "react";
import { TaskPriority, MaestroTask, MemberLaunchOverride, TeamMember, TaskImage } from "../app/types/maestro";
import { maestroClient } from "../utils/MaestroClient";
import { MemberConfig, buildDefaultMemberConfig, buildMemberConfigFromOverride, buildOverridesFromConfigs } from "../components/maestro/task-modal/LaunchConfigPanel";

export function useTaskForm(mode: "create" | "edit", isOpen: boolean, task?: MaestroTask, draftTask?: MaestroTask | null, selectedReferenceTasks?: MaestroTask[]) {
    const isEditMode = mode === "edit" && !!task;
    const baselineTask = task || draftTask || null;

    const [changeVersion, setChangeVersion] = useState(0);
    const bumpVersion = useCallback(() => setChangeVersion(v => v + 1), []);

    const [title, _setTitle] = useState("");
    const [prompt, _setPrompt] = useState("");
    const [priority, _setPriority] = useState<TaskPriority>("medium");
    const [selectedTeamMemberIds, _setSelectedTeamMemberIds] = useState<string[]>([]);
    const [selectedTeamId, _setSelectedTeamId] = useState<string | null>(null);
    const [selectedSkills, _setSelectedSkills] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [dueDate, _setDueDate] = useState<string>("");
    const [useWorktree, _setUseWorktree] = useState<boolean>(false);
    const [dangerousMode, _setDangerousMode] = useState<boolean>(false);

    const setTitle = useCallback((v: string) => { _setTitle(v); bumpVersion(); }, [bumpVersion]);
    const setPrompt = useCallback((v: string) => { _setPrompt(v); bumpVersion(); }, [bumpVersion]);
    const setPriority = useCallback((v: TaskPriority) => { _setPriority(v); bumpVersion(); }, [bumpVersion]);
    const setSelectedTeamMemberIds = useCallback((v: string[] | ((prev: string[]) => string[])) => { _setSelectedTeamMemberIds(v); bumpVersion(); }, [bumpVersion]);
    const setSelectedTeamId = useCallback((v: string | null) => { _setSelectedTeamId(v); bumpVersion(); }, [bumpVersion]);
    const setSelectedSkills = useCallback((v: string[] | ((prev: string[]) => string[])) => { _setSelectedSkills(v); bumpVersion(); }, [bumpVersion]);
    const setDueDate = useCallback((v: string) => { _setDueDate(v); bumpVersion(); }, [bumpVersion]);
    const setUseWorktree = useCallback((v: boolean) => { _setUseWorktree(v); bumpVersion(); }, [bumpVersion]);
    const setDangerousMode = useCallback((v: boolean) => { _setDangerousMode(v); bumpVersion(); }, [bumpVersion]);

    // Subtask state
    const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
    const [showSubtaskInput, setShowSubtaskInput] = useState(false);

    // Task docs (edit mode)
    const [taskDocs, setTaskDocs] = useState<any[]>([]);

    // Task images (edit mode)
    const [taskImages, setTaskImages] = useState<TaskImage[]>([]);

    // Staged image files (create mode — uploaded after task is created)
    const [stagedImageFiles, setStagedImageFiles] = useState<File[]>([]);
    const [stagedImagePreviews, setStagedImagePreviews] = useState<string[]>([]);

    // Launch config state
    const [showLaunchConfig, setShowLaunchConfig] = useState(false);
    const [memberConfigs, setMemberConfigs] = useState<Record<string, MemberConfig>>({});

    // Pre-fill form when task changes in edit mode
    useEffect(() => {
        if (isEditMode && task) {
            _setTitle(task.title);
            _setPrompt(task.description || "");
            _setPriority(task.priority);
            _setSelectedTeamMemberIds(
                task.teamMemberIds && task.teamMemberIds.length > 0
                    ? task.teamMemberIds
                    : task.teamMemberId ? [task.teamMemberId] : []
            );
            _setSelectedTeamId(task.teamId ?? null);
            _setSelectedSkills(task.skillIds || []);
            _setDueDate(task.dueDate || "");
            _setUseWorktree(task.useWorktree ?? false);
            _setDangerousMode(task.dangerousMode ?? false);
        }
    }, [isEditMode, isOpen, task?.id, task?.title, task?.description, task?.priority, task?.teamMemberId, JSON.stringify(task?.teamMemberIds), task?.teamId, JSON.stringify(task?.referenceTaskIds), task?.dueDate, task?.useWorktree, task?.dangerousMode]);

    // Fetch task docs in edit mode
    useEffect(() => {
        if (isEditMode && task?.id) {
            maestroClient.getTaskDocs(task.id).then(setTaskDocs).catch(() => setTaskDocs([]));
        } else {
            setTaskDocs([]);
        }
    }, [isEditMode, task?.id]);

    // Load images from the server task (edit mode or created draft)
    useEffect(() => {
        if (baselineTask) {
            setTaskImages(baselineTask.images || []);
        } else {
            setTaskImages([]);
        }
    }, [baselineTask?.id, JSON.stringify(baselineTask?.images)]);

    // Reset form when switching to create mode
    useEffect(() => {
        if (mode === "create" && isOpen) {
            _setTitle("");
            _setPrompt("");
            _setPriority("medium");
            _setSelectedTeamMemberIds([]);
            _setSelectedTeamId(null);
            _setSelectedSkills([]);
            _setDueDate("");
            _setUseWorktree(false);
            _setDangerousMode(false);
            setActiveTab(null);
            setChangeVersion(0);
        }
    }, [mode, isOpen]);

    const hasUnsavedContent = useMemo(() => {
        if (baselineTask) {
            // Compare form fields against server state (works for both edit and draft)
            return (
                title !== baselineTask.title ||
                prompt !== (baselineTask.description || "") ||
                priority !== baselineTask.priority ||
                dueDate !== (baselineTask.dueDate || "") ||
                useWorktree !== (baselineTask.useWorktree ?? false) ||
                dangerousMode !== (baselineTask.dangerousMode ?? false) ||
                JSON.stringify(selectedTeamMemberIds) !== JSON.stringify(baselineTask.teamMemberIds || (baselineTask.teamMemberId ? [baselineTask.teamMemberId] : [])) ||
                (selectedTeamId ?? null) !== (baselineTask.teamId ?? null) ||
                JSON.stringify(selectedSkills) !== JSON.stringify(baselineTask.skillIds || []) ||
                JSON.stringify(selectedReferenceTasks?.map(t => t.id) || []) !== JSON.stringify(baselineTask.referenceTaskIds || [])
            );
        }
        // No baseline — pure create mode, no draft yet
        return title.trim() !== "" || prompt.trim() !== "" || stagedImageFiles.length > 0;
    }, [baselineTask, title, prompt, priority, dueDate, useWorktree, dangerousMode, selectedTeamMemberIds, selectedTeamId, selectedSkills, selectedReferenceTasks, stagedImageFiles.length]);

    const isValid = title.trim() !== "" && prompt.trim() !== "";

    const toggleTab = (tab: string) => {
        setActiveTab(prev => prev === tab ? null : tab);
    };

    // Launch config helpers
    const initMemberConfig = useCallback((memberId: string, teamMembers: TeamMember[], savedOverrides?: Record<string, MemberLaunchOverride>) => {
        setMemberConfigs(prev => {
            if (prev[memberId]) return prev; // already initialized
            const member = teamMembers.find(m => m.id === memberId);
            if (!member) return prev;
            const override = savedOverrides?.[memberId];
            const config = override
                ? buildMemberConfigFromOverride(member, override)
                : buildDefaultMemberConfig(member);
            return { ...prev, [memberId]: config };
        });
    }, []);

    const updateMemberConfig = useCallback((memberId: string, patch: Partial<MemberConfig>) => {
        setMemberConfigs(prev => ({
            ...prev,
            [memberId]: { ...prev[memberId], ...patch },
        }));
    }, []);

    const removeMemberConfig = useCallback((memberId: string) => {
        setMemberConfigs(prev => {
            const next = { ...prev };
            delete next[memberId];
            return next;
        });
    }, []);

    const getMemberOverrides = useCallback((teamMembers: TeamMember[]): Record<string, MemberLaunchOverride> | undefined => {
        const overrides = buildOverridesFromConfigs(memberConfigs, teamMembers);
        return Object.keys(overrides).length > 0 ? overrides : undefined;
    }, [memberConfigs]);

    const addStagedFiles = (files: FileList | File[]) => {
        const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
        const previews = arr.map(f => URL.createObjectURL(f));
        setStagedImageFiles(prev => [...prev, ...arr]);
        setStagedImagePreviews(prev => [...prev, ...previews]);
    };

    const removeStagedFile = (index: number) => {
        setStagedImageFiles(prev => prev.filter((_, i) => i !== index));
        setStagedImagePreviews(prev => {
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    const clearStagedFiles = () => {
        setStagedImagePreviews(prev => { prev.forEach(url => URL.revokeObjectURL(url)); return []; });
        setStagedImageFiles([]);
    };

    const resetForm = () => {
        _setTitle("");
        _setPrompt("");
        _setPriority("medium");
        _setSelectedTeamMemberIds([]);
        _setSelectedTeamId(null);
        setActiveTab(null);
        _setSelectedSkills([]);
        setShowConfirmDialog(false);
        setNewSubtaskTitle("");
        setShowSubtaskInput(false);
        _setDueDate("");
        _setUseWorktree(false);
        _setDangerousMode(false);
        setShowLaunchConfig(false);
        setMemberConfigs({});
        setTaskImages([]);
        setStagedImagePreviews(prev => { prev.forEach(url => URL.revokeObjectURL(url)); return []; });
        setStagedImageFiles([]);
        setChangeVersion(0);
    };

    const getCreatePayload = (startImmediately: boolean, referenceTaskIds?: string[], parentId?: string) => ({
        title: title.trim(),
        description: prompt,
        priority,
        startImmediately,
        dueDate: dueDate || undefined,
        useWorktree: useWorktree || undefined,
        dangerousMode: dangerousMode || undefined,
        skillIds: selectedSkills.length > 0 ? selectedSkills : undefined,
        referenceTaskIds: referenceTaskIds && referenceTaskIds.length > 0 ? referenceTaskIds : undefined,
        parentId,
        teamMemberId: selectedTeamMemberIds.length === 1 ? selectedTeamMemberIds[0] : undefined,
        teamMemberIds: selectedTeamMemberIds.length > 0 ? selectedTeamMemberIds : undefined,
        teamId: selectedTeamId ?? null,
        // Staged image files — uploaded after task creation by the handler
        _stagedFiles: stagedImageFiles.length > 0 ? stagedImageFiles : undefined,
    });

    const getUpdateDiff = (referenceTaskIds: string[], teamMembers?: TeamMember[]): Partial<MaestroTask> | null => {
        if (!baselineTask) return null;
        const updates: Partial<MaestroTask> = {};
        // Skip title update if form title is empty — preserve the auto-generated "Untitled N"
        if (title.trim() && title !== baselineTask.title) updates.title = title.trim();
        if (prompt !== (baselineTask.description || "")) updates.description = prompt;
        if (priority !== baselineTask.priority) updates.priority = priority;
        const currentIds = baselineTask.teamMemberIds || (baselineTask.teamMemberId ? [baselineTask.teamMemberId] : []);
        if (JSON.stringify(selectedTeamMemberIds) !== JSON.stringify(currentIds)) {
            updates.teamMemberIds = selectedTeamMemberIds.length > 0 ? selectedTeamMemberIds : undefined;
            updates.teamMemberId = selectedTeamMemberIds.length === 1 ? selectedTeamMemberIds[0] : undefined;
        }
        if ((selectedTeamId ?? null) !== (baselineTask.teamId ?? null)) {
            updates.teamId = selectedTeamId ?? null;
        }
        const currentDueDate = baselineTask.dueDate || "";
        if (dueDate !== currentDueDate) updates.dueDate = dueDate || null;
        if (useWorktree !== (baselineTask.useWorktree ?? false)) updates.useWorktree = useWorktree;
        if (dangerousMode !== (baselineTask.dangerousMode ?? false)) updates.dangerousMode = dangerousMode;
        if (JSON.stringify(selectedSkills) !== JSON.stringify(baselineTask.skillIds || [])) updates.skillIds = selectedSkills;
        if (JSON.stringify(referenceTaskIds) !== JSON.stringify(baselineTask.referenceTaskIds || [])) updates.referenceTaskIds = referenceTaskIds;
        // Include memberOverrides if launch config was modified
        if (teamMembers && Object.keys(memberConfigs).length > 0) {
            const overrides = buildOverridesFromConfigs(memberConfigs, teamMembers);
            if (JSON.stringify(overrides) !== JSON.stringify(baselineTask.memberOverrides || {})) {
                updates.memberOverrides = Object.keys(overrides).length > 0 ? overrides : undefined;
            }
        }
        return Object.keys(updates).length > 0 ? updates : null;
    };

    return {
        changeVersion,
        title, setTitle,
        prompt, setPrompt,
        priority, setPriority,
        dueDate, setDueDate,
        useWorktree, setUseWorktree,
        dangerousMode, setDangerousMode,
        selectedTeamMemberIds, setSelectedTeamMemberIds,
        selectedTeamId, setSelectedTeamId,
        selectedSkills, setSelectedSkills,
        activeTab, setActiveTab, toggleTab,
        showConfirmDialog, setShowConfirmDialog,
        newSubtaskTitle, setNewSubtaskTitle,
        showSubtaskInput, setShowSubtaskInput,
        taskDocs,
        taskImages, setTaskImages,
        stagedImageFiles, stagedImagePreviews, addStagedFiles, removeStagedFile, clearStagedFiles,
        hasUnsavedContent,
        isValid,
        resetForm,
        getCreatePayload,
        getUpdateDiff,
        // Launch config
        showLaunchConfig, setShowLaunchConfig,
        memberConfigs,
        initMemberConfig,
        updateMemberConfig,
        removeMemberConfig,
        getMemberOverrides,
    };
}
