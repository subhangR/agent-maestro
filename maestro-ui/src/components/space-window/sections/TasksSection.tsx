import React, { useEffect, useMemo, useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { EmptySectionState } from "../shared/EmptySectionState";
import { useFirebaseAuthStore } from "../../../stores/useFirebaseAuthStore";
import { useProjectStore } from "../../../stores/useProjectStore";
import { maestroClient } from "../../../utils/MaestroClient";
import { SpaceShareClient } from "../../../firebase/SpaceShareClient";
import { SpaceTasksClient } from "../../../firebase/SpaceTasksClient";
import { pullSpaceTaskToLocal } from "../../../firebase/SpaceAdapters";
import {
    SpaceTask,
    SpaceTaskStatus,
    SpaceTaskPriority,
} from "../../../firebase/spaceShareTypes";
import type { MaestroTask } from "../../../app/types/maestro";
import {
    useSpaceTasks,
    resolveOrigin,
    canManageEntity,
    formatRelative,
    buildTaskShareInput,
    SPACE_STATUS_LABELS,
} from "../../../hooks/useSpaceSharing";
import "../../../styles-space-sharing.css";

type StatusFilter = "all" | SpaceTaskStatus;

type Props = {
    space: CollabSpace;
};

export const TasksSection: React.FC<Props> = ({ space }) => {
    const user = useFirebaseAuthStore((s) => s.user);
    const activeProjectId = useProjectStore((s) => s.activeProjectId);
    const { items: tasks, loading, error, retry } = useSpaceTasks(space.id);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [search, setSearch] = useState("");
    const [pushOpen, setPushOpen] = useState(false);
    const [editTask, setEditTask] = useState<SpaceTask | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [errorDismissed, setErrorDismissed] = useState(false);

    // Optimistic overlays: rows the user just pulled / deleted before the
    // subscription reconciles.
    const [pulling, setPulling] = useState<Set<string>>(new Set());
    const [optimisticPulled, setOptimisticPulled] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState<Set<string>>(new Set());
    const [rowError, setRowError] = useState<Record<string, string>>({});

    useEffect(() => setErrorDismissed(false), [error]);

    const filtered = useMemo(
        () =>
            tasks.filter((t) => {
                if (deleting.has(t.id)) return false;
                if (statusFilter !== "all" && t.status !== statusFilter) return false;
                if (search.trim()) {
                    const q = search.toLowerCase();
                    if (!`${t.title} ${t.description}`.toLowerCase().includes(q)) return false;
                }
                return true;
            }),
        [tasks, statusFilter, search, deleting],
    );

    const isPulled = (t: SpaceTask) =>
        optimisticPulled.has(t.id) || (user ? (t.pulledByUids ?? []).includes(user.uid) : false);

    const pulledCount = (t: SpaceTask) => {
        const base = new Set(t.pulledByUids ?? []);
        if (optimisticPulled.has(t.id) && user) base.add(user.uid);
        return base.size;
    };

    const handlePull = async (t: SpaceTask) => {
        if (!user) return;
        if (!activeProjectId) {
            setRowError((p) => ({ ...p, [t.id]: "Open a local project first to pull into it." }));
            return;
        }
        setRowError((p) => {
            const n = { ...p };
            delete n[t.id];
            return n;
        });
        setPulling((p) => new Set(p).add(t.id));
        try {
            await pullSpaceTaskToLocal(user, t, activeProjectId);
            setOptimisticPulled((p) => new Set(p).add(t.id));
        } catch (e: any) {
            setRowError((p) => ({ ...p, [t.id]: e?.message ?? "Pull failed. Try again." }));
        } finally {
            setPulling((p) => {
                const n = new Set(p);
                n.delete(t.id);
                return n;
            });
        }
    };

    const handleDelete = async (t: SpaceTask) => {
        setDeleting((p) => new Set(p).add(t.id));
        try {
            await SpaceTasksClient.delete(space.id, t.id);
        } catch (e: any) {
            setRowError((p) => ({ ...p, [t.id]: e?.message ?? "Delete failed." }));
            setDeleting((p) => {
                const n = new Set(p);
                n.delete(t.id);
                return n;
            });
        }
    };

    const showError = error && !errorDismissed;

    return (
        <section className="spaceEntityPane spaceEntityPane--tasks">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceEntityTitle">Shared Tasks</span>
                    <span className="spaceEntityCount">{tasks.length}</span>
                </div>
                <div className="spaceEntityHeaderRight">
                    <input
                        type="text"
                        className="spaceEntitySearchInput"
                        placeholder="Search tasks…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                        className="spaceEntityFilter"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    >
                        <option value="all">All statuses</option>
                        <option value="todo">Todo</option>
                        <option value="in_progress">In progress</option>
                        <option value="in_review">In review</option>
                        <option value="blocked">Blocked</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <button
                        type="button"
                        className="spaceEntityPrimaryBtn"
                        onClick={() => setPushOpen(true)}
                        disabled={!user}
                        title={user ? undefined : "Sign in to push tasks"}
                    >
                        + Push from local
                    </button>
                </div>
            </header>

            {showError && (
                <div className="spaceSharingError" role="alert">
                    <span className="spaceSharingErrorMsg">{error}</span>
                    <button type="button" className="spaceSharingErrorRetry" onClick={retry}>
                        Retry
                    </button>
                    <button
                        type="button"
                        className="spaceSharingErrorDismiss"
                        aria-label="Dismiss"
                        onClick={() => setErrorDismissed(true)}
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="spaceEntityBody">
                {loading && tasks.length === 0 ? (
                    <div className="spaceSharingSkeletonList" aria-busy="true">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="spaceSharingSkeletonRow" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    tasks.length === 0 ? (
                        <EmptySectionState
                            title="No shared tasks yet"
                            body="Push tasks from your local Maestro project to share them with everyone in this space."
                            action={
                                user
                                    ? { label: "Push from local", onClick: () => setPushOpen(true) }
                                    : undefined
                            }
                        />
                    ) : (
                        <div className="spaceEntityNoResults">
                            No tasks match the current filter.
                        </div>
                    )
                ) : (
                    <div className="spaceEntityList">
                        {filtered.map((t) => {
                            const expanded = expandedId === t.id;
                            const origin = resolveOrigin(space, t.sourceUserId ?? t.createdBy);
                            const canManage = canManageEntity(space, user?.uid, t.createdBy);
                            const pulled = isPulled(t);
                            const isPulling = pulling.has(t.id);
                            return (
                                <article
                                    key={t.id}
                                    className={`spaceTaskItem ${expanded ? "spaceTaskItem--expanded" : ""} ${isPulling ? "spaceTaskItem--pending" : ""}`}
                                >
                                    <button
                                        type="button"
                                        className="spaceTaskItemHeader"
                                        onClick={() => setExpandedId(expanded ? null : t.id)}
                                        aria-expanded={expanded}
                                    >
                                        <div className="spaceTaskItemTitleWrap">
                                            <PriorityDot priority={t.priority} />
                                            <span className="spaceTaskItemTitle">{t.title}</span>
                                        </div>
                                        <div className="spaceTaskItemMeta">
                                            <StatusPill status={t.status} />
                                            <span
                                                className="spaceTaskItemAuthor"
                                                style={{ color: origin.color }}
                                            >
                                                @{origin.displayName}
                                            </span>
                                            <span className="spaceTaskItemAt">
                                                {formatRelative(t.createdAt)}
                                            </span>
                                        </div>
                                    </button>

                                    {expanded && (
                                        <div className="spaceTaskItemDetail">
                                            {t.description && (
                                                <p className="spaceTaskItemDescription">{t.description}</p>
                                            )}
                                            <div className="spaceTaskItemDetailMeta">
                                                <span>
                                                    <span className="spaceEntityMetaLabel">Pulled by</span>{" "}
                                                    {pulledCount(t)}{" "}
                                                    {pulledCount(t) === 1 ? "member" : "members"}
                                                </span>
                                                <span>
                                                    <span className="spaceEntityMetaLabel">Priority</span>{" "}
                                                    {t.priority}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="spaceTaskItemActions">
                                        {pulled ? (
                                            <button
                                                type="button"
                                                className="spaceEntityGhostBtn spaceEntityGhostBtn--success"
                                                disabled
                                            >
                                                ✓ Pulled
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className={`spaceEntityPrimaryBtn ${isPulling ? "spaceSharingBtn--pending" : ""}`}
                                                onClick={() => handlePull(t)}
                                                disabled={!user || isPulling}
                                                title={user ? undefined : "Sign in to pull"}
                                            >
                                                {isPulling ? (
                                                    <>
                                                        <span className="spaceSharingBtnSpinner" />
                                                        Pulling…
                                                    </>
                                                ) : (
                                                    "⤓ Pull to local"
                                                )}
                                            </button>
                                        )}
                                        {canManage && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="spaceEntityGhostBtn"
                                                    onClick={() => setEditTask(t)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="spaceEntityGhostBtn spaceEntityGhostBtn--danger"
                                                    onClick={() => handleDelete(t)}
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {rowError[t.id] && (
                                        <div className="spaceSharingRowError">{rowError[t.id]}</div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {pushOpen && user && (
                <PushTaskModal
                    space={space}
                    projectId={activeProjectId}
                    onClose={() => setPushOpen(false)}
                />
            )}
            {editTask && (
                <EditTaskModal
                    space={space}
                    task={editTask}
                    onClose={() => setEditTask(null)}
                />
            )}
        </section>
    );
};

function PriorityDot({ priority }: { priority: SpaceTaskPriority }) {
    return (
        <span
            className={`spaceTaskPriorityDot spaceTaskPriorityDot--${priority}`}
            title={`Priority: ${priority}`}
        />
    );
}

function StatusPill({ status }: { status: SpaceTaskStatus }) {
    const variant =
        status === "todo"
            ? "todo"
            : status === "in_progress" || status === "in_review"
                ? "inProgress"
                : status === "blocked" || status === "cancelled"
                    ? "blocked"
                    : "done";
    return (
        <span className={`spaceTaskStatus spaceTaskStatus--${variant}`}>
            {SPACE_STATUS_LABELS[status] ?? status}
        </span>
    );
}

function PushTaskModal({
    space,
    projectId,
    onClose,
}: {
    space: CollabSpace;
    projectId: string;
    onClose: () => void;
}) {
    const user = useFirebaseAuthStore((s) => s.user);
    const projects = useProjectStore((s) => s.projects);
    const projectName = projects.find((p) => p.id === projectId)?.name ?? "local project";

    const [localTasks, setLocalTasks] = useState<MaestroTask[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        if (!projectId) {
            setLocalTasks([]);
            return;
        }
        maestroClient
            .getTasks(projectId)
            .then((tasks) => {
                if (!alive) return;
                setLocalTasks(tasks.filter((t) => t.status !== "archived"));
            })
            .catch((e) => alive && setLoadError(e?.message ?? "Failed to load local tasks."));
        return () => {
            alive = false;
        };
    }, [projectId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const toggle = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handlePush = async () => {
        if (!user || selectedIds.size === 0 || !localTasks) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const chosen = localTasks.filter((t) => selectedIds.has(t.id));
            for (const t of chosen) {
                await SpaceShareClient.shareTask(user, space.id, buildTaskShareInput(t));
            }
            onClose();
        } catch (e: any) {
            setSubmitError(e?.message ?? "Push failed. Try again.");
            setSubmitting(false);
        }
    };

    return (
        <div className="spaceModalOverlay" onClick={onClose}>
            <div
                className="spaceModal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="spaceModalTitle">Push tasks to space</div>
                <p className="spaceModalBody">
                    Pick tasks from <strong>{projectName}</strong> to share with everyone in this
                    space.
                </p>

                {!projectId ? (
                    <div className="spaceSharingPickerEmpty">
                        No active local project. Open a project first, then push its tasks.
                    </div>
                ) : loadError ? (
                    <div className="spaceSharingPickerEmpty">{loadError}</div>
                ) : localTasks === null ? (
                    <div className="spaceSharingPickerLoading">
                        <span className="spaceSharingSpinner" />
                        Loading local tasks…
                    </div>
                ) : localTasks.length === 0 ? (
                    <div className="spaceSharingPickerEmpty">
                        This project has no tasks to push yet.
                    </div>
                ) : (
                    <div className="spacePushPickerList">
                        {localTasks.map((lt) => {
                            const checked = selectedIds.has(lt.id);
                            return (
                                <label
                                    key={lt.id}
                                    className={`spacePushPickerRow ${checked ? "spacePushPickerRow--checked" : ""}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(lt.id)}
                                    />
                                    <div className="spacePushPickerBody">
                                        <div className="spacePushPickerTitle">{lt.title}</div>
                                        <div className="spacePushPickerProject">
                                            {lt.status} · {lt.priority}
                                        </div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                )}

                {submitError && <div className="spaceShareError">{submitError}</div>}

                <div className="spaceModalActions">
                    <button
                        type="button"
                        className="spaceEntityGhostBtn"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn"
                        disabled={selectedIds.size === 0 || submitting}
                        onClick={handlePush}
                    >
                        {submitting
                            ? "Pushing…"
                            : `Push ${selectedIds.size > 0 ? `(${selectedIds.size})` : ""}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

function EditTaskModal({
    space,
    task,
    onClose,
}: {
    space: CollabSpace;
    task: SpaceTask;
    onClose: () => void;
}) {
    const [title, setTitle] = useState(task.title);
    const [description, setDescription] = useState(task.description);
    const [status, setStatus] = useState<SpaceTaskStatus>(task.status);
    const [priority, setPriority] = useState<SpaceTaskPriority>(task.priority);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const handleSave = async () => {
        if (!title.trim()) return;
        setSaving(true);
        setSaveError(null);
        try {
            await SpaceTasksClient.update(space.id, task.id, {
                title: title.trim(),
                description,
                status,
                priority,
            });
            onClose();
        } catch (e: any) {
            setSaveError(e?.message ?? "Save failed. Try again.");
            setSaving(false);
        }
    };

    return (
        <div className="spaceModalOverlay" onClick={onClose}>
            <div
                className="spaceModal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="spaceModalTitle">Edit shared task</div>
                <input
                    type="text"
                    className="spaceEntitySearchInput"
                    style={{ width: "100%", marginBottom: 10 }}
                    value={title}
                    placeholder="Title"
                    onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                    className="spaceEntitySearchInput"
                    style={{ width: "100%", minHeight: 96, marginBottom: 10, resize: "vertical" }}
                    value={description}
                    placeholder="Description"
                    onChange={(e) => setDescription(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <select
                        className="spaceEntityFilter"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as SpaceTaskStatus)}
                    >
                        <option value="todo">Todo</option>
                        <option value="in_progress">In progress</option>
                        <option value="in_review">In review</option>
                        <option value="blocked">Blocked</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <select
                        className="spaceEntityFilter"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as SpaceTaskPriority)}
                    >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                </div>

                {saveError && <div className="spaceShareError">{saveError}</div>}

                <div className="spaceModalActions">
                    <button
                        type="button"
                        className="spaceEntityGhostBtn"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn"
                        disabled={!title.trim() || saving}
                        onClick={handleSave}
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}
