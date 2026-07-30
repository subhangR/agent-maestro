import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { MaestroTask, TeamMember } from '../../../app/types/maestro';

export interface TaskGraphNodeData {
  task: MaestroTask;
  teamMember?: TeamMember;
  executionStatus?: string;
  [key: string]: unknown;
}

const statusColors: Record<string, { border: string; bg: string }> = {
  completed: { border: 'var(--pn-run, #22c55e)', bg: 'var(--pn-run-soft, rgba(34,197,94,0.1))' },
  in_progress: { border: 'var(--pn-run, #3b82f6)', bg: 'var(--pn-run-soft, rgba(59,130,246,0.1))' },
  working: { border: 'var(--pn-run, #3b82f6)', bg: 'var(--pn-run-soft, rgba(59,130,246,0.1))' },
  failed: { border: 'var(--pn-block, #ef4444)', bg: 'var(--pn-block-soft, rgba(239,68,68,0.1))' },
  blocked: { border: 'var(--pn-wait, #eab308)', bg: 'var(--pn-wait-soft, rgba(234,179,8,0.1))' },
  todo: { border: 'var(--pn-idle, #6b7280)', bg: 'var(--pn-idle-soft, rgba(107,114,128,0.08))' },
};

function TaskGraphNodeComponent({ data }: NodeProps) {
  const { task, teamMember, executionStatus } = data as TaskGraphNodeData;
  const status = executionStatus || task?.status || 'todo';
  const colors = statusColors[status] || statusColors.todo;

  return (
    <div
      style={{
        border: `2px solid ${colors.border}`,
        background: colors.bg,
        borderRadius: 'var(--pn-r-md, 8px)',
        padding: '8px 12px',
        minWidth: 160,
        maxWidth: 220,
        fontSize: 12,
        color: 'var(--pn-ink, inherit)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--pn-ink-3, #6b7280)', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--pn-ink-3, #6b7280)', width: 8, height: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>{teamMember?.avatar || '📋'}</span>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task?.title || 'Untitled'}
          </div>
          <div style={{ opacity: 0.6, fontSize: 11 }}>
            {teamMember?.name || 'Unassigned'}
          </div>
        </div>
      </div>
      {executionStatus && (
        <div style={{ marginTop: 4, fontSize: 10, textTransform: 'uppercase', color: colors.border, fontWeight: 600 }}>
          {executionStatus}
        </div>
      )}
    </div>
  );
}

export const TaskGraphNodeMemo = memo(TaskGraphNodeComponent);
