import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
    Background,
    BackgroundVariant,
    Controls,
    Handle,
    MarkerType,
    MiniMap,
    Panel,
    Position,
    ReactFlow,
    ReactFlowProvider,
    type Connection,
    type Edge,
    type Node,
    type NodeProps,
    useEdgesState,
    useNodesState,
} from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";
import "./GraphCanvas.css";
import { EntityGlyph, WorkStatusPill, entityWorkStatus } from "./EntityPrimitives";
import type { EntityKind, EntitySummary, GraphResult } from "./types";

type GraphEdge = GraphResult["edges"][number];

/**
 * `layout` is presentation metadata returned with a graph/saved-view projection.
 * It deliberately lives outside entity content so a future saved-view endpoint can
 * persist it without leaking a canvas concern into an entity DTO.
 */
export type GraphCanvasResult = GraphResult & {
    layout?: Record<string, { x: number; y: number }>;
};

export type GraphMode = "free" | "dependency";

export interface GraphCanvasProps {
    result: GraphCanvasResult;
    /** Opens the existing Z3 panel stack; the canvas never owns entity details. */
    onOpen: (entityId: string) => void;
    /** Persisted by a future saved-view API; called after drag and auto-layout. */
    onLayoutChange?: (layout: Record<string, { x: number; y: number }>) => void;
    /** Deferred edge command seam. The UI does not manufacture an edge locally. */
    onCreateEdge?: (input: { sourceId: string; targetId: string; type: string }) => void;
    canCreateEdges?: boolean;
    initialMode?: GraphMode;
    className?: string;
}

interface CanvasNodeData extends Record<string, unknown> {
    entity: EntitySummary;
    onOpen: (id: string) => void;
    onFocus: (id: string) => void;
}

interface ClusterNodeData extends Record<string, unknown> {
    label: string;
}

const NODE_WIDTH = 224;
const NODE_HEIGHT = 112;
const CLUSTER_PAD = 32;

function EntityGraphNode({ data, selected }: NodeProps<Node<CanvasNodeData, "entity">>) {
    const status = entityWorkStatus(data.entity);
    const blocked = data.entity.badges.blocked?.unresolvedHardDependencyCount;
    const activate = () => data.onOpen(data.entity.id);

    return <article className={`collabGraphNode ${selected ? "is-selected" : ""} ${blocked ? "is-blocked" : ""}`} aria-label={`${data.entity.kind}: ${data.entity.title}`}>
        <Handle type="target" position={Position.Left} aria-label={`Connect an edge into ${data.entity.title}`} className="collabGraphHandle" />
        <button type="button" className="collabGraphNodeButton" onClick={activate} onDoubleClick={() => data.onFocus(data.entity.id)} aria-label={`Open ${data.entity.title}. Double click to focus its graph.`}>
            <span className="collabGraphNodeMeta"><EntityGlyph kind={data.entity.kind} /><span>{data.entity.kind.replace("_", " ")}</span><span>v{data.entity.version}</span></span>
            <strong>{data.entity.title}</strong>
            <span className="collabGraphNodeFooter"><WorkStatusPill status={status} />{blocked ? <span className="collabGraphBlocked">⚠ {blocked} blocked</span> : <span>{data.entity.counters.messages} messages</span>}</span>
        </button>
        <Handle type="source" position={Position.Right} aria-label={`Create an edge from ${data.entity.title}`} className="collabGraphHandle" />
    </article>;
}

function ClusterNode({ data }: NodeProps<Node<ClusterNodeData, "cluster">>) {
    return <section className="collabGraphCluster" aria-label={`Hierarchy group: ${data.label}`}><span>{data.label}</span></section>;
}

const nodeTypes = { entity: memo(EntityGraphNode), cluster: memo(ClusterNode) };

function nodePosition(index: number) {
    return { x: 80 + (index % 3) * 290, y: 80 + Math.floor(index / 3) * 170 };
}

function entityNode(entity: EntitySummary, index: number, layout: GraphCanvasResult["layout"], onOpen: (id: string) => void, onFocus: (id: string) => void): Node<CanvasNodeData, "entity"> {
    return {
        id: entity.id,
        type: "entity",
        position: layout?.[entity.id] ?? nodePosition(index),
        data: { entity, onOpen, onFocus },
        ariaLabel: `${entity.kind}: ${entity.title}`,
    };
}

function hierarchyNodes(nodes: Array<Node<CanvasNodeData, "entity">>, clusters: GraphResult["clusters"]): Array<Node<CanvasNodeData | ClusterNodeData, "entity" | "cluster">> {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const parentForChild = new Map<string, string>();
    const groups: Array<Node<ClusterNodeData, "cluster">> = [];

    clusters.forEach((cluster) => {
        const children = cluster.childIds.map((id) => byId.get(id)).filter((node): node is Node<CanvasNodeData, "entity"> => Boolean(node));
        if (!children.length) return;
        const minX = Math.min(...children.map((child) => child.position.x));
        const minY = Math.min(...children.map((child) => child.position.y));
        const maxX = Math.max(...children.map((child) => child.position.x + NODE_WIDTH));
        const maxY = Math.max(...children.map((child) => child.position.y + NODE_HEIGHT));
        const parent = byId.get(cluster.parentId);
        const groupId = `cluster:${cluster.parentId}`;
        groups.push({
            id: groupId,
            type: "cluster",
            position: { x: minX - CLUSTER_PAD, y: minY - CLUSTER_PAD },
            data: { label: parent ? `${parent.data.entity.title} · hierarchy` : "Hierarchy" },
            style: { width: maxX - minX + CLUSTER_PAD * 2, height: maxY - minY + CLUSTER_PAD * 2 },
            selectable: false,
            draggable: false,
            focusable: false,
            zIndex: -1,
        });
        children.forEach((child) => parentForChild.set(child.id, groupId));
    });

    return [...groups, ...nodes.map((node) => {
        const parentId = parentForChild.get(node.id);
        if (!parentId) return node;
        const parent = groups.find((group) => group.id === parentId);
        return parent ? { ...node, parentId, extent: "parent" as const, position: { x: node.position.x - parent.position.x, y: node.position.y - parent.position.y } } : node;
    })];
}

export function filterGraph(result: GraphCanvasResult, kinds: Set<EntityKind>, edgeTypes: Set<string>, focusId: string | null, hops: number) {
    const allowedEdges = result.edges.filter((edge) => edgeTypes.has(edge.type));
    let ids = new Set(result.nodes.filter((node) => kinds.has(node.kind)).map((node) => node.id));
    if (focusId && ids.has(focusId)) {
        const nearby = new Set([focusId]);
        for (let level = 0; level < hops; level += 1) {
            for (const edge of allowedEdges) {
                if (nearby.has(edge.sourceId)) nearby.add(edge.targetId);
                if (nearby.has(edge.targetId)) nearby.add(edge.sourceId);
            }
        }
        ids = new Set([...ids].filter((id) => nearby.has(id)));
    }
    return {
        nodes: result.nodes.filter((node) => ids.has(node.id)),
        edges: allowedEdges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId)),
        clusters: result.clusters.filter((cluster) => cluster.childIds.some((id) => ids.has(id))),
    };
}

export function dependencyLayout(nodes: Array<Node<CanvasNodeData, "entity">>, edges: GraphEdge[]): Array<Node<CanvasNodeData, "entity">> {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: "LR", nodesep: 56, ranksep: 100, marginx: 50, marginy: 50 });
    nodes.forEach((node) => graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
    edges.forEach((edge) => graph.setEdge(edge.sourceId, edge.targetId));
    dagre.layout(graph);
    return nodes.map((node) => {
        const placed = graph.node(node.id);
        return { ...node, position: { x: placed.x - NODE_WIDTH / 2, y: placed.y - NODE_HEIGHT / 2 } };
    });
}

function toFlowEdges(edges: GraphEdge[]): Edge[] {
    return edges.map((edge) => {
        const isHardDependency = edge.type === "depends_on" && edge.hard && !edge.resolved;
        return {
            id: edge.id,
            source: edge.sourceId,
            target: edge.targetId,
            label: edge.type.replace(/_/g, " "),
            type: "smoothstep",
            animated: isHardDependency,
            markerEnd: { type: MarkerType.ArrowClosed, color: isHardDependency ? "#b34b3e" : "#8d877a" },
            style: { stroke: isHardDependency ? "#b34b3e" : "#8d877a", strokeWidth: isHardDependency ? 2 : 1.4, strokeDasharray: isHardDependency ? "5 3" : undefined },
            labelStyle: { fill: isHardDependency ? "#9d3c32" : "#625d52", fontWeight: 700, fontSize: 10 },
            labelBgStyle: { fill: "#f4f2ec", fillOpacity: 0.9 },
            labelBgPadding: [4, 3],
            ariaLabel: `${edge.type.replace(/_/g, " ")} from ${edge.sourceId} to ${edge.targetId}${isHardDependency ? ", unresolved hard dependency" : ""}`,
        };
    });
}

function GraphCanvasInner({ result, onOpen, onLayoutChange, onCreateEdge, canCreateEdges = false, initialMode = "free", className = "" }: GraphCanvasProps) {
    const [mode, setMode] = useState<GraphMode>(initialMode);
    const [activeKinds, setActiveKinds] = useState(() => new Set<EntityKind>(result.nodes.map((node) => node.kind)));
    const [activeEdgeTypes, setActiveEdgeTypes] = useState(() => new Set(result.edges.map((edge) => edge.type)));
    const [focusId, setFocusId] = useState<string | null>(null);
    const [hops, setHops] = useState(2);
    const [pendingLink, setPendingLink] = useState<Pick<Connection, "source" | "target"> | null>(null);
    const [announcement, setAnnouncement] = useState("Graph ready. Select a node to open its detail panel.");

    useEffect(() => {
        setActiveKinds(new Set(result.nodes.map((node) => node.kind)));
        setActiveEdgeTypes(new Set(result.edges.map((edge) => edge.type)));
        setFocusId(null);
    }, [result]);

    const filtered = useMemo(() => filterGraph(result, activeKinds, activeEdgeTypes, focusId, hops), [result, activeKinds, activeEdgeTypes, focusId, hops]);
    const baseNodes = useMemo(() => filtered.nodes.map((node, index) => entityNode(node, index, result.layout, onOpen, setFocusId)), [filtered.nodes, result.layout, onOpen]);
    const layoutedNodes = useMemo(() => mode === "dependency" ? dependencyLayout(baseNodes, filtered.edges) : baseNodes, [baseNodes, filtered.edges, mode]);
    const flowNodes = useMemo(() => hierarchyNodes(layoutedNodes, filtered.clusters), [layoutedNodes, filtered.clusters]);
    const flowEdges = useMemo(() => toFlowEdges(filtered.edges), [filtered.edges]);
    const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

    useEffect(() => setNodes(flowNodes), [flowNodes, setNodes]);
    useEffect(() => setEdges(flowEdges), [flowEdges, setEdges]);

    const persistLayout = useCallback((nextNodes: Array<Node<CanvasNodeData | ClusterNodeData>>) => {
        if (!onLayoutChange) return;
        const next = Object.fromEntries(nextNodes.filter((node) => node.type === "entity").map((node) => [node.id, node.position]));
        onLayoutChange(next);
    }, [onLayoutChange]);

    const autoArrange = useCallback(() => {
        const arranged = dependencyLayout(baseNodes, filtered.edges);
        const next = hierarchyNodes(arranged, filtered.clusters);
        setNodes(next);
        persistLayout(next);
        setAnnouncement("Graph auto-arranged left to right.");
    }, [baseNodes, filtered.edges, filtered.clusters, persistLayout, setNodes]);

    const toggleKind = (kind: EntityKind) => setActiveKinds((previous) => {
        const next = new Set(previous);
        next.has(kind) ? next.delete(kind) : next.add(kind);
        return next;
    });
    const toggleEdgeType = (edgeType: string) => setActiveEdgeTypes((previous) => {
        const next = new Set(previous);
        next.has(edgeType) ? next.delete(edgeType) : next.add(edgeType);
        return next;
    });
    const handleConnect = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target || connection.source === connection.target) return;
        if (!canCreateEdges || !onCreateEdge) {
            setAnnouncement("Creating graph links is not available yet. Use the entity Connections panel when enabled.");
            return;
        }
        setPendingLink({ source: connection.source, target: connection.target });
        setAnnouncement("Choose the relationship type for the new link.");
    }, [canCreateEdges, onCreateEdge]);
    const confirmLink = (type: string) => {
        if (!pendingLink?.source || !pendingLink.target || !onCreateEdge) return;
        onCreateEdge({ sourceId: pendingLink.source, targetId: pendingLink.target, type });
        setPendingLink(null);
        setAnnouncement(`${type.replace(/_/g, " ")} link requested.`);
    };

    const kinds = [...new Set(result.nodes.map((node) => node.kind))];
    const edgeTypes = [...new Set(result.edges.map((edge) => edge.type))];

    return <section className={`collabGraphCanvas ${className}`} aria-label="Entity graph canvas">
        <header className="collabGraphToolbar">
            <div><span className="collabEyebrow">GRAPH CANVAS</span><h2>Relationships and hierarchy</h2><p>{filtered.nodes.length} entities · {filtered.edges.length} typed edges</p></div>
            <div className="collabGraphToolbarActions">
                <div className="collabGraphSegmented" role="group" aria-label="Graph layout mode">
                    <button type="button" className={mode === "free" ? "is-active" : ""} onClick={() => { setMode("free"); setAnnouncement("Free layout selected."); }} aria-pressed={mode === "free"}>Free</button>
                    <button type="button" className={mode === "dependency" ? "is-active" : ""} onClick={() => { setMode("dependency"); setAnnouncement("Dependency layout selected: left to right."); }} aria-pressed={mode === "dependency"}>Dependency</button>
                </div>
                <button type="button" className="collabGraphAction" onClick={autoArrange}>Auto-arrange</button>
            </div>
        </header>
        <div className="collabGraphFilters">
            <fieldset><legend>Entity kinds</legend>{kinds.map((kind) => <label key={kind}><input type="checkbox" checked={activeKinds.has(kind)} onChange={() => toggleKind(kind)} /> {kind.replace("_", " ")}</label>)}</fieldset>
            <fieldset><legend>Edge types</legend>{edgeTypes.map((type) => <label key={type}><input type="checkbox" checked={activeEdgeTypes.has(type)} onChange={() => toggleEdgeType(type)} /> {type.replace(/_/g, " ")}</label>)}</fieldset>
            <label className="collabGraphFocus">Focus <select value={focusId ?? ""} onChange={(event) => { setFocusId(event.target.value || null); setAnnouncement(event.target.value ? "Focus graph updated." : "Showing the complete graph."); }}><option value="">Entire graph</option>{result.nodes.map((node) => <option value={node.id} key={node.id}>{node.title}</option>)}</select></label>
            {focusId && <label className="collabGraphFocus">Hops <select value={hops} onChange={(event) => setHops(Number(event.target.value))}>{[1, 2, 3].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>}
        </div>
        <div className="collabGraphViewport">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={(_, __, nextNodes) => { persistLayout(nextNodes); setAnnouncement("Node position saved for this view."); }}
                onConnect={handleConnect}
                onNodeDoubleClick={(_, node) => setFocusId(node.id)}
                fitView
                fitViewOptions={{ padding: 0.18 }}
                minZoom={0.2}
                maxZoom={1.5}
                nodesConnectable={canCreateEdges}
                nodesFocusable
                edgesFocusable
                proOptions={{ hideAttribution: true }}
                aria-label="Interactive entity graph. Press Tab to focus nodes and Enter to open a detail panel."
            >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d8d1c3" />
                <Controls showInteractive={false} aria-label="Canvas zoom controls" />
                <MiniMap ariaLabel="Graph overview" nodeColor={(node) => node.type === "cluster" ? "transparent" : "#b26a2b"} />
                <Panel position="bottom-right" className="collabGraphLegend"><strong>Legend</strong><span>── typed edge</span><span className="is-hard">╌╌ unresolved hard dependency</span><span>▱ hierarchy containment</span><span>{canCreateEdges ? "Drag a handle to link · choose its type" : "Links are feature-gated"}</span></Panel>
            </ReactFlow>
            {pendingLink && <div className="collabGraphLinkPicker" role="dialog" aria-modal="true" aria-labelledby="graphLinkPickerTitle"><h3 id="graphLinkPickerTitle">Create relationship</h3><p>Choose a meaning for this connection.</p><div>{["depends_on", "relates_to", "attached_to"].map((type) => <button type="button" onClick={() => confirmLink(type)} key={type}>{type.replace(/_/g, " ")}</button>)}</div><button type="button" className="collabGraphPickerCancel" onClick={() => { setPendingLink(null); setAnnouncement("Link creation cancelled."); }}>Cancel</button></div>}
        </div>
        <p className="sr-only" aria-live="polite">{announcement}</p>
    </section>;
}

/** GraphResult-driven full canvas. Wrap this in the workspace's graph route or CollectionView graph layout. */
export function GraphCanvas(props: GraphCanvasProps) {
    return <ReactFlowProvider><GraphCanvasInner {...props} /></ReactFlowProvider>;
}
