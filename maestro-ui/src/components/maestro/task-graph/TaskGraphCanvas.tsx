import React, { useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { TaskGraphNodeMemo, type TaskGraphNodeData } from './TaskGraphNode';
import type { TaskGraph, MaestroTask, TeamMember } from '../../../app/types/maestro';
import { useTaskGraphStore } from '../../../stores/useTaskGraphStore';

const nodeTypes = { taskNode: TaskGraphNodeMemo };

// Dagre layout helper
function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'LR') {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 120 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: 200, height: 60 });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return { ...node, position: { x: pos.x - 100, y: pos.y - 30 } };
  });

  return { nodes: layoutedNodes, edges };
}

interface TaskGraphCanvasProps {
  graph: TaskGraph;
  tasks: Record<string, MaestroTask>;
  teamMembers: Record<string, TeamMember>;
  onSave: () => void;
}

export const TaskGraphCanvas: React.FC<TaskGraphCanvasProps> = ({
  graph,
  tasks,
  teamMembers,
  onSave,
}) => {
  const { addEdge: addGraphEdge, removeEdge: removeGraphEdge, updateNodePosition } = useTaskGraphStore();
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Convert graph data to React Flow nodes/edges
  const initialNodes: Node[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.taskId,
        type: 'taskNode',
        position: n.position,
        data: {
          task: tasks[n.taskId] || { id: n.taskId, title: 'Loading...', status: 'todo' },
          teamMember: n.teamMemberId ? teamMembers[n.teamMemberId] : (tasks[n.taskId]?.teamMemberId ? teamMembers[tasks[n.taskId].teamMemberId!] : undefined),
          executionStatus: undefined,
        } satisfies TaskGraphNodeData,
      })),
    [graph.nodes, tasks, teamMembers]
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        source: e.sourceTaskId,
        target: e.targetTaskId,
        label: e.label,
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8E897B' },
        style: { stroke: '#8E897B', strokeWidth: 1.5 },
      })),
    [graph.edges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when graph changes externally
  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // Handle new edge connections
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      const edgeId = `e-${connection.source}-${connection.target}`;
      addGraphEdge(graph.id, {
        id: edgeId,
        sourceTaskId: connection.source,
        targetTaskId: connection.target,
      });
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: edgeId,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#8E897B' },
            style: { stroke: '#8E897B', strokeWidth: 1.5 },
          },
          eds
        )
      );
      debouncedSave();
    },
    [graph.id, addGraphEdge, setEdges]
  );

  // Handle node position changes
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          updateNodePosition(graph.id, change.id, change.position);
          debouncedSave();
        }
      }
    },
    [graph.id, onNodesChange, updateNodePosition]
  );

  // Handle edge deletion
  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      for (const change of changes) {
        if (change.type === 'remove') {
          removeGraphEdge(graph.id, change.id);
          debouncedSave();
        }
      }
    },
    [graph.id, onEdgesChange, removeGraphEdge]
  );

  // Debounced save
  const debouncedSave = useCallback(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      onSave();
    }, 1000);
  }, [onSave]);

  // Auto-layout
  const onAutoLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges,
      'LR'
    );
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    // Update store positions
    for (const node of layoutedNodes) {
      updateNodePosition(graph.id, node.id, node.position);
    }
    debouncedSave();
  }, [nodes, edges, graph.id, setNodes, setEdges, updateNodePosition, debouncedSave]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--pn-paper, #0a0a0a)' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--pn-line-2, rgba(255,255,255,0.05))" />
        <Controls
          showInteractive={false}
          style={{ background: 'var(--pn-surface, #1a1a1a)', border: '1px solid var(--pn-line, rgba(255,255,255,0.1))', borderRadius: 'var(--pn-r-sm, 6px)' }}
        />
        <MiniMap
          style={{ background: 'var(--pn-surface, #1a1a1a)', border: '1px solid var(--pn-line, rgba(255,255,255,0.1))' }}
          maskColor="rgba(40,34,24,0.14)"
          nodeColor="var(--pn-brand, #3b82f6)"
        />
      </ReactFlow>

      {/* Auto-layout button */}
      <button
        type="button"
        onClick={onAutoLayout}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          padding: '6px 12px',
          fontSize: 11,
          background: 'var(--pn-card, #1a1a1a)',
          border: '1px solid var(--pn-line-2, rgba(255,255,255,0.15))',
          borderRadius: 'var(--pn-r-sm, 6px)',
          color: 'var(--pn-ink, #e5e5e5)',
          cursor: 'pointer',
          zIndex: 5,
        }}
        title="Auto-arrange nodes"
      >
        Auto Layout
      </button>
    </div>
  );
};
