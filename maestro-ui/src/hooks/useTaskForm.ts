import { useState, useEffect, useMemo, useCallback } from "react";
import { TaskPriority, MaestroTask, MemberLaunchOverride, TeamMember, TaskImage } from "../app/types/maestro";
import { maestroClient } from "../utils/MaestroClient";
import { MemberConfig, buildDefaultMemberConfig, buildMemberConfigFromOverride, buildOverridesFromConfigs } from "../components/maestro/task-modal/LaunchConfigPanel";

export function useTaskForm(mode: "create" | "edit", isOpen: boolean, task?: MaestroTask) {
    const isEditMode = mode === "edit" && !!task;

    const [title, _setTitle] = useState("");
    const [prompt, _setPrompt] = useState("");
    const [priority, _setPriority] = useState<TaskPriority>("medium");
    const [selectedTeamMemberIds, _setSelectedTeamMemberIds] = useState<string[]>([]);
    const [selectedSkills, _setSelectedSkills] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [dueDate, _setDueDate] = useState<string>("");

    // Change version counter — increments on every user edit to trigger auto-save debounce
    const [changeVersion, setChangeVersion] = useState(0);
    const bumpVersion = useCallback(() => setChangeVersion(v => v + 1), []);

    // Wrapped setters that bump the change version
    const setTitle = useCallback((v: string | ((prev: string) => string)) => { _setTitle(v); bumpVersion(); }, [bumpVersion]);
    const setPrompt = useCallback((v: string | ((prev: string) => string)) => { _setPrompt(v); bumpVersion(); }, [bumpVersion]);
    const setPriority = useCallback((v: TaskPriority) => { _setPriority(v); bumpVersion(); }, [bumpVersion]);
    const setSelectedTeamMemberIds = useCallback((v: string[] | ((prev: string[]) => string[])) => { _setSelectedTeamMemberIds(v); bumpVersion(); }, [bumpVersion]);
    const setSelectedSkills = useCallback((v: string[] | ((prev: string[]) => string[])) => { _setSelectedSkills(v); bumpVersion(); }, [bumpVersion]);
    const setDueDate = useCallback((v: string) => { _setDueDate(v); bumpVersion(); }, [bumpVersion]);

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
    // Uses raw setters (_set*) to avoid bumping changeVersion during server-synced updates
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
            _setSelectedSkills(task.skillIds || []);
            _setDueDate(task.dueDate || "");
        }
    }, [isEditMode, isOpen, task?.id, task?.title, task?.description, task?.priority, task?.teamMemberId, JSON.stringify(task?.teamMemberIds), JSON.stringify(task?.referenceTaskIds), task?.dueDate]);

    // Fetch task docs in edit mode
    useEffect(() => {
        if (isEditMode && task?.id) {
            maestroClient.getTaskDocs(task.id).then(setTaskDocs).catch(() => setTaskDocs([]));
        } else {
            setTaskDocs([]);
        }
    }, [isEditMode, task?.id]);

    // Load images in edit mode
    useEffect(() => {
        if (isEditMode && task) {
            setTaskImages(task.images || []);
        } else {
            setTaskImages([]);
        }
    }, [isEditMode, task?.id, JSON.stringify(task?.images)]);

    // Reset form when switching to create mode (raw setters to avoid version bumps)
    useEffect(() => {
        if (mode === "create" && isOpen) {
            _setTitle("");
            _setPrompt("");
            _setPriority("medium");
            _setSelectedTeamMemberIds([]);
            _setSelectedSkills([]);
            _setDueDate("");
            setActiveTab(null);
        }
    }, [mode, isOpen]);

    const hasUnsavedContent = useMemo(() => {
        if (mode === "create") {
            return title.trim() !== "" || prompt.trim() !== "" || dueDate !== "";
        }
        if (isEditMode && task) {
            return (
                title !== task.title ||
                prompt !== (task.description || "") ||
                priority !== task.priority ||
                dueDate !== (task.dueDate || "") ||
                JSON.stringify(selectedTeamMemberIds) !== JSON.stringify(task.teamMemberIds || (task.teamMemberId ? [task.teamMemberId] : [])) ||
                JSON.stringify(selectedSkills) !== JSON.stringify(task.skillIds || [])
            );
        }
        return false;
    }, [mode, isEditMode, task, title, prompt, priority, dueDate, selectedTeamMemberIds, selectedSkills]);

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

    const resetForm = () => {
        setTitle("");
        setPrompt("");
        setPriority("medium");
        setSelectedTeamMemberIds([]);
        setActiveTab(null);
        setSelectedSkills([]);
        setShowConfirmDialog(false);
        setNewSubtaskTitle("");
        setShowSubtaskInput(false);
        setDueDate("");
        setShowLaunchConfig(false);
        setMemberConfigs({});
        setTaskImages([]);
        setStagedImageFiles([]);
        setStagedImagePreviews(prev => {
            prev.forEach(url => URL.revokeObjectURL(url));
            return [];
        });
    };

    const getCreatePayload = (startImmediately: boolean, referenceTaskIds?: string[], parentId?: string) => ({
        title: title.trim(),
        description: prompt,
        priority,
        startImmediately,
        dueDate: dueDate || undefined,
        skillIds: selectedSkills.length > 0 ? selectedSkills : undefined,
        referenceTaskIds: referenceTaskIds && referenceTaskIds.length > 0 ? referenceTaskIds : undefined,
        parentId,
        teamMemberId: selectedTeamMemberIds.length === 1 ? selectedTeamMemberIds[0] : undefined,
        teamMemberIds: selectedTeamMemberIds.length > 0 ? selectedTeamMemberIds : undefined,
        // Staged image files — uploaded after task creation by the handler
        _stagedFiles: stagedImageFiles.length > 0 ? stagedImageFiles : undefined,
    });

    const getUpdateDiff = (referenceTaskIds: string[], teamMembers?: TeamMember[]): Partial<MaestroTask> | null => {
        if (!isEditMode || !task) return null;
        const updates: Partial<MaestroTask> = {};
        if (title.trim() && title !== task.title) updates.title = title.trim();
        if (prompt !== (task.description || "")) updates.description = prompt;
        if (priority !== task.priority) updates.priority = priority;
        const currentIds = task.teamMemberIds || (task.teamMemberId ? [task.teamMemberId] : []);
        if (JSON.stringify(selectedTeamMemberIds) !== JSON.stringify(currentIds)) {
            updates.teamMemberIds = selectedTeamMemberIds.length > 0 ? selectedTeamMemberIds : undefined;
            updates.teamMemberId = selectedTeamMemberIds.length === 1 ? selectedTeamMemberIds[0] : undefined;
        }
        const currentDueDate = task.dueDate || "";
        if (dueDate !== currentDueDate) updates.dueDate = dueDate || null;
        if (JSON.stringify(selectedSkills) !== JSON.stringify(task.skillIds || [])) updates.skillIds = selectedSkills;
        if (JSON.stringify(referenceTaskIds) !== JSON.stringify(task.referenceTaskIds || [])) updates.referenceTaskIds = referenceTaskIds;
        // Include memberOverrides if launch config was modified
        if (teamMembers && Object.keys(memberConfigs).length > 0) {
            const overrides = buildOverridesFromConfigs(memberConfigs, teamMembers);
            if (JSON.stringify(overrides) !== JSON.stringify(task.memberOverrides || {})) {
                updates.memberOverrides = Object.keys(overrides).length > 0 ? overrides : undefined;
            }
        }
        return Object.keys(updates).length > 0 ? updates : null;
    };

    return {
        title, setTitle,
        prompt, setPrompt,
        priority, setPriority,
        dueDate, setDueDate,
        selectedTeamMemberIds, setSelectedTeamMemberIds,
        selectedSkills, setSelectedSkills,
        activeTab, setActiveTab, toggleTab,
        showConfirmDialog, setShowConfirmDialog,
        changeVersion,
        newSubtaskTitle, setNewSubtaskTitle,
        showSubtaskInput, setShowSubtaskInput,
        taskDocs,
        taskImages, setTaskImages,
        stagedImageFiles, stagedImagePreviews, addStagedFiles, removeStagedFile,
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
