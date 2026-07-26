import React, { useState, useRef, useEffect } from "react";
import { TaskStatus, TaskSessionStatus } from "../../app/types/maestro";

type TaskStatusControlProps = {
  taskId: string;
  currentStatus: TaskStatus;
  taskSessionStatuses?: Record<string, TaskSessionStatus>;  // Per-session status map
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  disabled?: boolean;
};

// Terminal-style status symbols and labels
const STATUS_SYMBOLS: Record<TaskStatus, string> = {
  todo: "○",
  in_progress: "◉",
  in_review: "◎",
  completed: "✓",
  cancelled: "⊘",
  blocked: "✗",
  archived: "▫",
};

import { TASK_STATUS_LABELS as STATUS_LABELS } from "../../app/constants/labels";

const SESSION_STATUS_LABELS: Record<TaskSessionStatus, string> = {
  queued: "Queued",
  working: "Working",
  blocked: "Blocked",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

export const TaskStatusControl = React.memo(function TaskStatusControl({
  taskId,
  currentStatus,
  taskSessionStatuses,
  onStatusChange,
  disabled = false,
}: TaskStatusControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear pending timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleStatusSelect = async (newStatus: TaskStatus) => {
    if (newStatus === currentStatus) {
      setIsOpen(false);
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      await onStatusChange(taskId, newStatus);
      setSuccessFlash(true);
      timersRef.current.push(setTimeout(() => setSuccessFlash(false), 500));
      setIsOpen(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update status";
      setError(errorMessage);
      timersRef.current.push(setTimeout(() => setError(null), 3000));
    } finally {
      setIsUpdating(false);
    }
  };

  const statusOptions: TaskStatus[] = ["todo", "in_progress", "in_review", "completed", "cancelled", "blocked"];

  return (
    <div className="terminalStatusControl">
      {/* User Status Selector */}
      <div ref={dropdownRef} className="terminalStatusSelector">
        <button type="button"
          className={`terminalStatusTrigger terminalStatusTrigger--${currentStatus} ${
            isOpen ? "open" : ""
          } ${isUpdating ? "loading" : ""} ${successFlash ? "success" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled && !isUpdating) {
              setIsOpen(!isOpen);
            }
          }}
          disabled={disabled || isUpdating}
          aria-label={`Change task status from ${STATUS_LABELS[currentStatus]}`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="terminalStatusSymbol">{STATUS_SYMBOLS[currentStatus]}</span>
          <span className="terminalStatusLabel">{STATUS_LABELS[currentStatus]}</span>
          {isUpdating ? (
            <span className="terminalStatusSpinner">⟳</span>
          ) : (
            <span className="terminalStatusCaret">{isOpen ? "▴" : "▾"}</span>
          )}
        </button>

        {isOpen && !isUpdating && (
          <div className="terminalStatusDropdown" role="listbox">
            {statusOptions.map((status) => (
              <button type="button"
                key={status}
                className={`terminalStatusOption ${status === currentStatus ? "current" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusSelect(status);
                }}
                role="option"
                aria-selected={status === currentStatus}
              >
                <span className="terminalStatusSymbol">{STATUS_SYMBOLS[status]}</span>
                <span className="terminalStatusLabel">{STATUS_LABELS[status]}</span>
                {status === currentStatus && (
                  <span className="terminalStatusCheck">✓</span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="terminalStatusError" role="alert">
            {error}
          </div>
        )}
      </div>

      {/* Session Status Display (Read-only, per-session) */}
      {taskSessionStatuses && Object.keys(taskSessionStatuses).length > 0 ? (
        Object.entries(taskSessionStatuses).map(([sid, sstatus]) => (
          <div key={sid} className={`terminalSessionStatusDisplay terminalSessionStatusDisplay--${sstatus}`}>
            <span className="terminalSessionStatusPrefix">SESSION:</span>
            <span className="terminalSessionStatusLabel">
              {SESSION_STATUS_LABELS[sstatus] || sstatus}
            </span>
          </div>
        ))
      ) : (
        <div className="terminalSessionStatusDisplay terminalSessionStatusDisplay--none">
          <span className="terminalSessionStatusPrefix">SESSION:</span>
          <span className="terminalSessionStatusLabel">NONE</span>
        </div>
      )}

      {/* Screen reader announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {isUpdating && "Updating task status..."}
        {error && `Error: ${error}`}
        {successFlash && "Status updated successfully"}
      </div>
    </div>
  );
});
