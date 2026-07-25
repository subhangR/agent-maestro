import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { TaskStatus, TaskPriority } from "../../app/types/maestro";
import { Icon } from "./redesign/kit";

export type SortByOption = "updatedAt" | "createdAt" | "priority" | "dueDate" | "custom";

type TaskFiltersProps = {
    statusFilter: TaskStatus[];
    priorityFilter: TaskPriority[];
    sortBy: SortByOption;
    overdueFilter: boolean;
    onStatusFilterChange: (statuses: TaskStatus[]) => void;
    onPriorityFilterChange: (priorities: TaskPriority[]) => void;
    onSortChange: (sort: SortByOption) => void;
    onOverdueFilterChange: (overdue: boolean) => void;
};

const STATUS_CONFIG: { value: TaskStatus; label: string; icon: React.ReactNode; colorVar: string }[] = [
    {
        value: "todo",
        label: "Todo",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" width="13" height="13">
                <circle cx="7" cy="7" r="5.5" strokeDasharray="2 2" />
            </svg>
        ),
        colorVar: "var(--pn-idle)",
    },
    {
        value: "in_progress",
        label: "In Progress",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" width="13" height="13">
                <circle cx="7" cy="7" r="5.5" />
                <circle cx="7" cy="7" r="2.5" fill="currentColor" stroke="none" />
            </svg>
        ),
        colorVar: "var(--pn-run)",
    },
    {
        value: "in_review",
        label: "In Review",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" width="13" height="13">
                <circle cx="7" cy="7" r="5.5" />
                <circle cx="7" cy="7" r="3" />
            </svg>
        ),
        colorVar: "var(--pn-info)",
    },
    {
        value: "completed",
        label: "Completed",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                <path d="M2.5 7.5L5.5 10.5L11.5 4.5" />
            </svg>
        ),
        colorVar: "var(--pn-run)",
    },
    {
        value: "blocked",
        label: "Blocked",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" width="13" height="13">
                <circle cx="7" cy="7" r="5.5" />
                <path d="M3.4 3.4l7.2 7.2" strokeLinecap="round" />
            </svg>
        ),
        colorVar: "var(--pn-block)",
    },
    {
        value: "cancelled",
        label: "Cancelled",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" width="13" height="13">
                <path d="M4 4l6 6M10 4l-6 6" />
            </svg>
        ),
        colorVar: "var(--pn-idle)",
    },
];

const PRIORITY_CONFIG: { value: TaskPriority; label: string; dot: string; colorVar: string }[] = [
    { value: "high", label: "High", dot: "●", colorVar: "var(--pn-block)" },
    { value: "medium", label: "Medium", dot: "●", colorVar: "var(--pn-wait)" },
    { value: "low", label: "Low", dot: "●", colorVar: "var(--pn-idle)" },
];

const SORT_OPTIONS: { value: SortByOption; label: string; icon: React.ReactNode }[] = [
    {
        value: "custom",
        label: "Custom",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="13" height="13">
                <path d="M2 4h10M4 7h6M6 10h2" />
            </svg>
        ),
    },
    {
        value: "updatedAt",
        label: "Last Updated",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="13" height="13">
                <circle cx="7" cy="7" r="5" />
                <path d="M7 4.5V7l1.5 1.5" />
            </svg>
        ),
    },
    {
        value: "createdAt",
        label: "Created",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="13" height="13">
                <rect x="2" y="3" width="10" height="9" rx="1" />
                <path d="M5 2v2M9 2v2M2 6h10" />
            </svg>
        ),
    },
    {
        value: "priority",
        label: "Priority",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="13" height="13">
                <path d="M2 3h10M2 7h7M2 11h4" />
            </svg>
        ),
    },
    {
        value: "dueDate",
        label: "Due Date",
        icon: (
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="13" height="13">
                <rect x="2" y="3" width="10" height="9" rx="1" />
                <path d="M5 2v2M9 2v2M2 6h10" />
                <circle cx="7" cy="9.5" r="1" fill="currentColor" stroke="none" />
            </svg>
        ),
    },
];

function FilterPop({
    open,
    anchorRef,
    onClose,
    children,
    minWidth = 180,
}: {
    open: boolean;
    anchorRef: React.RefObject<HTMLElement>;
    onClose: () => void;
    children: React.ReactNode;
    minWidth?: number;
}) {
    const [pos, setPos] = useState<{ left: number; top: number; flipUp: boolean } | null>(null);
    const popRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (open && anchorRef.current) {
            const r = anchorRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - r.bottom;
            const flipUp = spaceBelow < 220 && r.top > 220;
            setPos({ left: r.left, top: flipUp ? r.top : r.bottom + 4, flipUp });
        } else {
            setPos(null);
        }
    }, [open, anchorRef]);

    if (!open || !pos) return null;

    return createPortal(
        <>
            <div className="pn-pop-ov" onClick={onClose} />
            <div
                ref={popRef}
                className="pn-pop pn-filters-pop"
                style={{
                    left: pos.left,
                    top: pos.flipUp ? undefined : pos.top,
                    bottom: pos.flipUp ? window.innerHeight - pos.top : undefined,
                    minWidth,
                }}
            >
                {children}
            </div>
        </>,
        document.body
    );
}

export function TaskFilters({
    statusFilter,
    priorityFilter,
    sortBy,
    overdueFilter,
    onStatusFilterChange,
    onPriorityFilterChange,
    onSortChange,
    onOverdueFilterChange,
}: TaskFiltersProps) {
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);

    const statusRef = useRef<HTMLButtonElement>(null);
    const priorityRef = useRef<HTMLButtonElement>(null);
    const dueDateRef = useRef<HTMLButtonElement>(null);
    const sortRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!openDropdown) return;
        const close = () => setOpenDropdown(null);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, true);
        return () => {
            window.removeEventListener("resize", close);
            window.removeEventListener("scroll", close, true);
        };
    }, [openDropdown]);

    const toggleStatus = (status: TaskStatus) => {
        if (statusFilter.includes(status)) {
            onStatusFilterChange(statusFilter.filter((s) => s !== status));
        } else {
            onStatusFilterChange([...statusFilter, status]);
        }
    };

    const togglePriority = (priority: TaskPriority) => {
        if (priorityFilter.includes(priority)) {
            onPriorityFilterChange(priorityFilter.filter((p) => p !== priority));
        } else {
            onPriorityFilterChange([...priorityFilter, priority]);
        }
    };

    const activeFilterCount =
        statusFilter.length +
        priorityFilter.length +
        (sortBy !== "updatedAt" ? 1 : 0) +
        (overdueFilter ? 1 : 0);
    const noFilters = activeFilterCount === 0;

    const handleClearAll = () => {
        onStatusFilterChange([]);
        onPriorityFilterChange([]);
        onSortChange("updatedAt");
        onOverdueFilterChange(false);
        setOpenDropdown(null);
    };

    const toggle = (key: string) => setOpenDropdown((cur) => (cur === key ? null : key));

    const currentSort = SORT_OPTIONS.find((o) => o.value === sortBy);

    return (
        <>
            <div className="pn-filters pn-filters--bar">
                {/* All / clear pill */}
                <button
                    type="button"
                    className={`pn-filter ${noFilters ? "pn-filter--active" : ""}`}
                    onClick={handleClearAll}
                    title="All tasks (clear filters)"
                >
                    All
                </button>

                {/* High priority quick pill */}
                <button
                    type="button"
                    className={`pn-filter ${priorityFilter.includes("high") ? "pn-filter--active" : ""}`}
                    onClick={() => togglePriority("high")}
                >
                    <span style={{ color: "var(--pn-block)", fontSize: 9, lineHeight: 1 }}>●</span>
                    High
                </button>

                {/* Overdue quick pill */}
                <button
                    type="button"
                    className={`pn-filter ${overdueFilter ? "pn-filter--active" : ""}`}
                    onClick={() => onOverdueFilterChange(!overdueFilter)}
                >
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11">
                        <circle cx="6" cy="6" r="4.5" />
                        <path d="M6 3.5V6l1.5 1" />
                    </svg>
                    Overdue
                </button>

                {/* Divider */}
                <div className="pn-filters-div" />

                {/* Status multi-select dropdown */}
                <button
                    type="button"
                    ref={statusRef}
                    className={`pn-filter pn-filter--dd ${statusFilter.length > 0 ? "pn-filter--active" : ""}`}
                    onClick={() => toggle("status")}
                    aria-expanded={openDropdown === "status"}
                >
                    {statusFilter.length === 0 ? (
                        <>
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" width="11" height="11">
                                <circle cx="6" cy="6" r="4.5" />
                                <circle cx="6" cy="6" r="2" fill="currentColor" stroke="none" />
                            </svg>
                            Status
                        </>
                    ) : (
                        <>
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" width="11" height="11" style={{ color: "var(--pn-brand)" }}>
                                <circle cx="6" cy="6" r="4.5" />
                                <circle cx="6" cy="6" r="2" fill="currentColor" stroke="none" />
                            </svg>
                            Status
                            <span className="pn-filter-badge">{statusFilter.length}</span>
                        </>
                    )}
                    <Icon name="chevronD" size={10} style={{ opacity: 0.6, marginLeft: 1 }} />
                </button>
                <FilterPop open={openDropdown === "status"} anchorRef={statusRef} onClose={() => setOpenDropdown(null)} minWidth={172}>
                    <div className="pn-pop-header">Status</div>
                    {STATUS_CONFIG.map(({ value, label, icon, colorVar }) => {
                        const isActive = statusFilter.includes(value);
                        return (
                            <button
                                type="button"
                                key={value}
                                className={`pn-opt ${isActive ? "pn-opt--cur" : ""}`}
                                onClick={() => toggleStatus(value)}
                            >
                                <span style={{ color: colorVar, display: "inline-flex", width: 16 }}>{icon}</span>
                                <span>{label}</span>
                                {isActive && <Icon name="check" size={12} sw={2} className="pn-opt__chk" />}
                            </button>
                        );
                    })}
                    {statusFilter.length > 0 && (
                        <div className="pn-pop-footer">
                            <button type="button" className="pn-pop-clear" onClick={() => { onStatusFilterChange([]); }}>
                                Clear
                            </button>
                        </div>
                    )}
                </FilterPop>

                {/* Priority multi-select dropdown */}
                <button
                    type="button"
                    ref={priorityRef}
                    className={`pn-filter pn-filter--dd ${priorityFilter.length > 0 ? "pn-filter--active" : ""}`}
                    onClick={() => toggle("priority")}
                    aria-expanded={openDropdown === "priority"}
                >
                    {priorityFilter.length === 0 ? (
                        <>
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11">
                                <path d="M1.5 3h9M1.5 6h6.5M1.5 9h4" />
                            </svg>
                            Priority
                        </>
                    ) : (
                        <>
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11" style={{ color: "var(--pn-brand)" }}>
                                <path d="M1.5 3h9M1.5 6h6.5M1.5 9h4" />
                            </svg>
                            Priority
                            <span className="pn-filter-badge">{priorityFilter.length}</span>
                        </>
                    )}
                    <Icon name="chevronD" size={10} style={{ opacity: 0.6, marginLeft: 1 }} />
                </button>
                <FilterPop open={openDropdown === "priority"} anchorRef={priorityRef} onClose={() => setOpenDropdown(null)} minWidth={152}>
                    <div className="pn-pop-header">Priority</div>
                    {PRIORITY_CONFIG.map(({ value, label, dot, colorVar }) => {
                        const isActive = priorityFilter.includes(value);
                        return (
                            <button
                                type="button"
                                key={value}
                                className={`pn-opt ${isActive ? "pn-opt--cur" : ""}`}
                                onClick={() => togglePriority(value)}
                            >
                                <span style={{ color: colorVar, fontSize: 10 }}>{dot}</span>
                                <span>{label}</span>
                                {isActive && <Icon name="check" size={12} sw={2} className="pn-opt__chk" />}
                            </button>
                        );
                    })}
                    {priorityFilter.length > 0 && (
                        <div className="pn-pop-footer">
                            <button type="button" className="pn-pop-clear" onClick={() => { onPriorityFilterChange([]); }}>
                                Clear
                            </button>
                        </div>
                    )}
                </FilterPop>

                {/* Due Date dropdown */}
                <button
                    type="button"
                    ref={dueDateRef}
                    className={`pn-filter pn-filter--dd ${overdueFilter ? "pn-filter--active" : ""}`}
                    onClick={() => toggle("dueDate")}
                    aria-expanded={openDropdown === "dueDate"}
                >
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11" style={{ color: overdueFilter ? "var(--pn-brand)" : undefined }}>
                        <rect x="1" y="2" width="10" height="9" rx="1" />
                        <path d="M4 1v2M8 1v2M1 5h10" />
                    </svg>
                    Due Date
                    {overdueFilter && <span className="pn-filter-badge">1</span>}
                    <Icon name="chevronD" size={10} style={{ opacity: 0.6, marginLeft: 1 }} />
                </button>
                <FilterPop open={openDropdown === "dueDate"} anchorRef={dueDateRef} onClose={() => setOpenDropdown(null)} minWidth={152}>
                    <div className="pn-pop-header">Due Date</div>
                    <button
                        type="button"
                        className={`pn-opt ${overdueFilter ? "pn-opt--cur" : ""}`}
                        onClick={() => { onOverdueFilterChange(!overdueFilter); if (overdueFilter) setOpenDropdown(null); }}
                    >
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="12" height="12" style={{ color: "var(--pn-block)" }}>
                            <circle cx="6" cy="6" r="4.5" />
                            <path d="M6 3.5V6l1.5 1" />
                        </svg>
                        <span>Overdue</span>
                        {overdueFilter && <Icon name="check" size={12} sw={2} className="pn-opt__chk" />}
                    </button>
                </FilterPop>

                {/* Sort — pushed right */}
                <button
                    type="button"
                    ref={sortRef}
                    className={`pn-filter pn-filter--dd ${sortBy !== "updatedAt" ? "pn-filter--active" : ""}`}
                    style={{ marginLeft: "auto" }}
                    onClick={() => toggle("sort")}
                    aria-expanded={openDropdown === "sort"}
                >
                    <Icon name="sliders" size={12} />
                    {currentSort?.label ?? "Sort"}
                    <Icon name="chevronD" size={10} style={{ opacity: 0.6, marginLeft: 1 }} />
                </button>
                <FilterPop open={openDropdown === "sort"} anchorRef={sortRef} onClose={() => setOpenDropdown(null)} minWidth={158}>
                    <div className="pn-pop-header">Sort by</div>
                    {SORT_OPTIONS.map(({ value, label, icon }) => (
                        <button
                            type="button"
                            key={value}
                            className={`pn-opt ${sortBy === value ? "pn-opt--cur" : ""}`}
                            onClick={() => { onSortChange(value); setOpenDropdown(null); }}
                        >
                            <span style={{ display: "inline-flex", width: 16, color: "var(--pn-ink-3)" }}>{icon}</span>
                            <span>{label}</span>
                            {sortBy === value && <Icon name="check" size={12} sw={2} className="pn-opt__chk" />}
                        </button>
                    ))}
                </FilterPop>

                {/* Clear all — only when active filters exist */}
                {activeFilterCount > 0 && (
                    <button
                        type="button"
                        className="pn-filter pn-filter--clear"
                        onClick={handleClearAll}
                        title="Clear all filters"
                    >
                        <Icon name="x" size={11} />
                        {activeFilterCount}
                    </button>
                )}
            </div>
        </>
    );
}
