import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTaskGraphStore } from '../../../stores/useTaskGraphStore';
import { useMaestroStore } from '../../../stores/useMaestroStore';
import { TaskGraphCanvas } from './TaskGraphCanvas';
import type { MaestroTask, TaskGraphNode, TeamMember } from '../../../app/types/maestro';

interface TaskGraphPanelProps {
  projectId: string;
  createGraphSignal?: number;
}

export const TaskGraphPanel: React.FC<TaskGraphPanelProps> = ({ projectId, createGraphSignal }) => {
  const { graphs, selectedGraphId, selectGraph, fetchGraphs, createGraph, deleteGraph, saveGraph, addNode, validateGraph, validationResult } = useTaskGraphStore();
  const tasks = useMaestroStore((s) => s.tasks);
  const teamMembers = useMaestroStore((s) => s.teamMembers);
  const [newGraphName, setNewGraphName] = useState('');
  const [showNewGraphInput, setShowNewGraphInput] = useState(false);
  const [showTaskPicker, setShowTaskPicker] = useState(false);

  useEffect(() => {
    fetchGraphs(projectId);
  }, [projectId, fetchGraphs]);

  // Handle create signal from parent
  useEffect(() => {
    if (createGraphSignal) {
      setShowNewGraphInput(true);
    }
  }, [createGraphSignal]);

  const projectGraphs = useMemo(
    () => Object.values(graphs).filter((g) => g.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt),
    [graphs, projectId]
  );

  const selectedGraph = selectedGraphId ? graphs[selectedGraphId] : null;

  const projectTasks = useMemo(
    () => Object.values(tasks).filter((t) => t.projectId === projectId && t.status !== 'archived' && t.status !== 'cancelled'),
    [tasks, projectId]
  );

  // Tasks not yet in the selected graph
  const availableTasks = useMemo(() => {
    if (!selectedGraph) return [];
    const nodeTaskIds = new Set(selectedGraph.nodes.map((n) => n.taskId));
    return projectTasks.filter((t) => !nodeTaskIds.has(t.id));
  }, [selectedGraph, projectTasks]);

  const handleCreateGraph = useCallback(async () => {
    if (!newGraphName.trim()) return;
    const graph = await createGraph({ projectId, name: newGraphName.trim() });
    selectGraph(graph.id);
    setNewGraphName('');
    setShowNewGraphInput(false);
  }, [projectId, newGraphName, createGraph, selectGraph]);

  const handleAddTask = useCallback(
    (task: MaestroTask) => {
      if (!selectedGraphId) return;
      const existingNodes = graphs[selectedGraphId]?.nodes || [];
      const x = existingNodes.length > 0 ? Math.max(...existingNodes.map((n) => n.position.x)) + 240 : 100;
      const y = existingNodes.length > 0 ? existingNodes[existingNodes.length - 1].position.y : 100;

      const node: TaskGraphNode = {
        taskId: task.id,
        position: { x, y },
        teamMemberId: task.teamMemberId,
      };
      addNode(selectedGraphId, node);
      // Save after adding
      setTimeout(() => saveGraph(selectedGraphId), 200);
    },
    [selectedGraphId, graphs, addNode, saveGraph]
  );

  const handleSave = useCallback(() => {
    if (selectedGraphId) {
      saveGraph(selectedGraphId);
    }
  }, [selectedGraphId, saveGraph]);

  const handleValidate = useCallback(async () => {
    if (selectedGraphId) {
      // Save first, then validate
      await saveGraph(selectedGraphId);
      await validateGraph(selectedGraphId);
    }
  }, [selectedGraphId, saveGraph, validateGraph]);

  const handleDeleteGraph = useCallback(async (graphId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this graph?')) return;
    await deleteGraph(graphId);
  }, [deleteGraph]);

  // Graph list view (no graph selected)
  if (!selectedGraph) {
    return (
      <div className="taskGraphPanel pnLeakSkin" style={{ padding: '12px 16px', height: '100%', overflow: 'auto' }}>
        {showNewGraphInput && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={newGraphName}
              onChange={(e) => setNewGraphName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGraph()}
              placeholder="Graph name..."
              autoFocus
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: 12,
                background: 'var(--pn-card)',
                border: '1px solid var(--pn-line-2)',
                borderRadius: 6,
                color: 'var(--pn-ink)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleCreateGraph}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                background: 'var(--pn-brand)',
                border: 'none',
                borderRadius: 6,
                color: 'var(--pn-paper)',
                cursor: 'pointer',
              }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setShowNewGraphInput(false); setNewGraphName(''); }}
              style={{
                padding: '6px 8px',
                fontSize: 12,
                background: 'transparent',
                border: '1px solid var(--pn-line-2)',
                borderRadius: 6,
                color: 'var(--pn-ink-3)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {projectGraphs.length === 0 && !showNewGraphInput && (
          <div style={{ textAlign: 'center', padding: '40px 20px', opacity: 0.5, fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
            <div>No task graphs yet.</div>
            <div style={{ marginTop: 4, fontSize: 11 }}>Create a graph to define task execution workflows.</div>
          </div>
        )}

        {projectGraphs.map((graph) => (
          <div
            key={graph.id}
            onClick={() => selectGraph(graph.id)}
            style={{
              padding: '12px',
              marginBottom: 8,
              minHeight: 52,
              gap: 12,
              background: 'var(--pn-card)',
              border: '1px solid var(--pn-line)',
              borderRadius: 'var(--pn-r-md)',
              boxShadow: 'var(--pn-sh-sm)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--pn-line-2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--pn-line)'; }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{graph.name}</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                {graph.nodes.length} nodes · {graph.edges.length} edges · {graph.status}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => handleDeleteGraph(graph.id, e)}
              style={{
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                width: 30,
                height: 30,
                background: 'transparent',
                border: 'none',
                color: 'var(--pn-ink-3)',
                cursor: 'pointer',
                fontSize: 16,
                borderRadius: 'var(--pn-r-sm)',
                opacity: 0.6,
              }}
              title="Delete graph"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  }

  // Graph editor view
  return (
    <div className="pnLeakSkin" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--pn-line)',
        fontSize: 12,
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => selectGraph(null)}
          style={{
            flex: '0 0 auto',
            display: 'grid',
            placeItems: 'center',
            width: 30,
            height: 30,
            background: 'transparent',
            border: 'none',
            color: 'var(--pn-ink-3)',
            cursor: 'pointer',
            fontSize: 16,
            borderRadius: 'var(--pn-r-sm)',
          }}
          title="Back to graph list"
        >
          ←
        </button>
        <span style={{ fontWeight: 600, flex: 1 }}>{selectedGraph.name}</span>
        <button
          type="button"
          onClick={() => setShowTaskPicker(!showTaskPicker)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 30,
            padding: '0 12px',
            fontSize: 12,
            background: showTaskPicker ? 'var(--pn-brand)' : 'var(--pn-card)',
            border: '1px solid var(--pn-line-2)',
            borderRadius: 'var(--pn-r-sm)',
            color: showTaskPicker ? 'var(--pn-paper)' : 'var(--pn-ink)',
            cursor: 'pointer',
          }}
        >
          + Add Tasks
        </button>
        <button
          type="button"
          onClick={handleValidate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 30,
            padding: '0 12px',
            fontSize: 12,
            background: 'var(--pn-card)',
            border: '1px solid var(--pn-line-2)',
            borderRadius: 'var(--pn-r-sm)',
            color: 'var(--pn-ink)',
            cursor: 'pointer',
          }}
        >
          Validate
        </button>
        <button
          type="button"
          onClick={handleSave}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 30,
            padding: '0 12px',
            fontSize: 12,
            background: 'var(--pn-card)',
            border: '1px solid var(--pn-line-2)',
            borderRadius: 'var(--pn-r-sm)',
            color: 'var(--pn-ink)',
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>

      {/* Validation result banner */}
      {validationResult && (
        <div style={{
          padding: '6px 12px',
          fontSize: 11,
          background: validationResult.valid ? 'var(--pn-run-soft)' : 'var(--pn-block-soft)',
          borderBottom: `1px solid ${validationResult.valid ? 'var(--pn-run)' : 'var(--pn-block)'}`,
          color: validationResult.valid ? 'var(--pn-run)' : 'var(--pn-block)',
          flexShrink: 0,
        }}>
          {validationResult.valid
            ? `Valid DAG — ${validationResult.parallelLayers?.length || 0} execution layers`
            : `Invalid: ${validationResult.errors.join(', ')}`}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Task picker sidebar */}
        {showTaskPicker && (
          <div style={{
            width: 200,
            borderRight: '1px solid var(--pn-line)',
            overflow: 'auto',
            padding: 8,
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, opacity: 0.6 }}>
              Available Tasks ({availableTasks.length})
            </div>
            {availableTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleAddTask(task)}
                style={{
                  padding: '6px 8px',
                  marginBottom: 4,
                  borderRadius: 5,
                  background: 'var(--pn-card)',
                  border: '1px solid var(--pn-line)',
                  cursor: 'pointer',
                  fontSize: 11,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--pn-brand)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--pn-line)'; }}
              >
                <div style={{ fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {task.title || 'Untitled'}
                </div>
                <div style={{ opacity: 0.5, fontSize: 10, marginTop: 1 }}>
                  {task.status} · {task.teamMemberId ? teamMembers[task.teamMemberId]?.name || 'Assigned' : 'Unassigned'}
                </div>
              </div>
            ))}
            {availableTasks.length === 0 && (
              <div style={{ opacity: 0.4, fontSize: 11, textAlign: 'center', padding: 16 }}>
                All tasks are in the graph
              </div>
            )}
          </div>
        )}

        {/* Canvas */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {selectedGraph.nodes.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4, fontSize: 13 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
                <div>Click "+ Add Tasks" to add tasks to this graph</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Then drag between nodes to create dependencies</div>
              </div>
            </div>
          ) : (
            <TaskGraphCanvas
              graph={selectedGraph}
              tasks={tasks}
              teamMembers={teamMembers}
              onSave={handleSave}
            />
          )}
        </div>
      </div>
    </div>
  );
};
