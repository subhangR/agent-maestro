import React, { useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { EmptySectionState } from "../shared/EmptySectionState";

type Status = "todo" | "in_progress" | "blocked" | "completed";
type Priority = "low" | "medium" | "high";

type MockSpaceTask = {
    id: string;
    title: string;
    description: string;
    status: Status;
    priority: Priority;
    originDisplayName: string;
    originColor: string;
    originAt: string;
    pulledByCount: number;
    pulledByYou: boolean;
};

const MOCK_TASKS: MockSpaceTask[] = [
    {
        id: "t-oauth",
        title: "Add OAuth callback handler",
        description:
            "Wire the GitHub OAuth callback to the new `/api/auth/github/callback` route. Persist tokens in the keychain, not the JSON store.",
        status: "in_progress",
        priority: "high",
        originDisplayName: "Devon",
        originColor: "#66ddaa",
        originAt: "2h ago",
        pulledByCount: 2,
        pulledByYou: false,
    },
    {
        id: "t-session-mgr",
        title: "Refactor session manager",
        description:
            "Collapse `SessionService.spawn()` and `SessionService.resume()` into one code path. Manzil is on it.",
        status: "in_progress",
        priority: "medium",
        originDisplayName: "Subhang",
        originColor: "#7c9eff",
        originAt: "1d ago",
        pulledByCount: 3,
        pulledByYou: true,
    },
    {
        id: "t-postgres",
        title: "Plan migration off file-based persistence",
        description:
            "Spike doc on moving `~/.maestro/data` to Postgres. Schema, migration story, rollback plan.",
        status: "todo",
        priority: "medium",
        originDisplayName: "Priya",
        originColor: "#ffc864",
        originAt: "3d ago",
        pulledByCount: 0,
        pulledByYou: false,
    },
    {
        id: "t-ws-batching",
        title: "Investigate WebSocket message batching latency",
        description:
            "The 50ms batch window is hurting the snappiness of session timeline updates. Look into a 16ms (1 frame) cap.",
        status: "blocked",
        priority: "low",
        originDisplayName: "Manzil",
        originColor: "#f06767",
        originAt: "5d ago",
        pulledByCount: 1,
        pulledByYou: false,
    },
    {
        id: "t-typecheck-ci",
        title: "Add type-check to CI",
        description:
            "Run `tsc --noEmit` on every PR for all three packages. Server already has it; UI and CLI don't.",
        status: "completed",
        priority: "low",
        originDisplayName: "Asha",
        originColor: "#c084fc",
        originAt: "1w ago",
        pulledByCount: 4,
        pulledByYou: true,
    },
];

type StatusFilter = "all" | Status;

const STATUS_LABELS: Record<Status, string> = {
    todo: "todo",
    in_progress: "in progress",
    blocked: "blocked",
    completed: "completed",
};

type Props = {
    space: CollabSpace;
};

export const TasksSection: React.FC<Props> = ({ space }) => {
    void space;
    const [tasks] = useState<MockSpaceTask[]>(MOCK_TASKS);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [search, setSearch] = useState("");
    const [pushOpen, setPushOpen] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const filtered = tasks.filter((t) => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (search.trim()) {
            const q = search.toLowerCase();
            if (!`${t.title} ${t.description}`.toLowerCase().includes(q)) return false;
        }
        return true;
    });

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
                        <option value="blocked">Blocked</option>
                        <option value="completed">Completed</option>
                    </select>
                    <button
                        type="button"
                        className="spaceEntityPrimaryBtn"
                        onClick={() => setPushOpen(true)}
                    >
                        + Push from local
                    </button>
                </div>
            </header>

            <div className="spaceEntityBody">
                {filtered.length === 0 ? (
                    tasks.length === 0 ? (
                        <EmptySectionState
                            title="No shared tasks yet"
                            body="Push tasks from your local Maestro project to share them with everyone in this space."
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
                            return (
                                <article
                                    key={t.id}
                                    className={`spaceTaskItem ${expanded ? "spaceTaskItem--expanded" : ""}`}
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
                                                style={{ color: t.originColor }}
                                            >
                                                @{t.originDisplayName}
                                            </span>
                                            <span className="spaceTaskItemAt">{t.originAt}</span>
                                        </div>
                                    </button>

                                    {expanded && (
                                        <div className="spaceTaskItemDetail">
                                            <p className="spaceTaskItemDescription">{t.description}</p>
                                            <div className="spaceTaskItemDetailMeta">
                                                <span>
                                                    <span className="spaceEntityMetaLabel">Pulled by</span>{" "}
                                                    {t.pulledByCount} {t.pulledByCount === 1 ? "member" : "members"}
                                                </span>
                                                <span>
                                                    <span className="spaceEntityMetaLabel">Priority</span>{" "}
                                                    {t.priority}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="spaceTaskItemActions">
                                        {t.pulledByYou ? (
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
                                                className="spaceEntityPrimaryBtn"
                                            >
                                                ⤓ Pull to local
                                            </button>
                                        )}
                                        <button type="button" className="spaceEntityGhostBtn" disabled>
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="spaceEntityGhostBtn spaceEntityGhostBtn--danger"
                                            disabled
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {pushOpen && <PushTaskModal onClose={() => setPushOpen(false)} />}
        </section>
    );
};

function PriorityDot({ priority }: { priority: Priority }) {
    return (
        <span
            className={`spaceTaskPriorityDot spaceTaskPriorityDot--${priority}`}
            title={`Priority: ${priority}`}
        />
    );
}

function StatusPill({ status }: { status: Status }) {
    const cls =
        status === "todo"
            ? "spaceTaskStatus spaceTaskStatus--todo"
            : status === "in_progress"
                ? "spaceTaskStatus spaceTaskStatus--inProgress"
                : status === "blocked"
                    ? "spaceTaskStatus spaceTaskStatus--blocked"
                    : "spaceTaskStatus spaceTaskStatus--done";
    return <span className={cls}>{STATUS_LABELS[status]}</span>;
}

function PushTaskModal({ onClose }: { onClose: () => void }) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const localTasks = [
        { id: "lt1", title: "Wire up draft hook in TaskService", project: "agent-maestro" },
        { id: "lt2", title: "Add tests for SpellService.invoke", project: "agent-maestro" },
        { id: "lt3", title: "Bump bun to 1.2", project: "agent-maestro" },
    ];

    const toggle = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
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
                    Pick tasks from your active local project to share with everyone in this space.
                </p>
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
                                    <div className="spacePushPickerProject">{lt.project}</div>
                                </div>
                            </label>
                        );
                    })}
                </div>
                <div className="spaceModalActions">
                    <button type="button" className="spaceEntityGhostBtn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn"
                        disabled={selectedIds.size === 0}
                        onClick={onClose}
                    >
                        Push {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                    </button>
                </div>
            </div>
        </div>
    );
}
