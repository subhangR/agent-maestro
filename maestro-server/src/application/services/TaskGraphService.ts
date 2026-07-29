import { TaskGraph, TaskGraphEdge, CreateTaskGraphPayload, UpdateTaskGraphPayload } from '../../types';
import { ITaskGraphRepository, TaskGraphFilter } from '../../domain/repositories/ITaskGraphRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { ITaskRepository } from '../../domain/repositories/ITaskRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { ValidationError, NotFoundError } from '../../domain/common/Errors';

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  topologicalOrder?: string[];
  parallelLayers?: string[][];
}

export interface ReadyNodesResult {
  /** Nodes whose every upstream dependency has completed. */
  ready: string[];
  /** Nodes permanently blocked because at least one upstream dependency failed. */
  blocked: string[];
}

/**
 * Application service for task graph operations.
 * Handles CRUD, DAG validation, topological sorting, and execution orchestration.
 */
export class TaskGraphService {
  constructor(
    private graphRepo: ITaskGraphRepository,
    private projectRepo: IProjectRepository,
    private taskRepo: ITaskRepository,
    private eventBus: IEventBus
  ) {}

  async createGraph(input: CreateTaskGraphPayload): Promise<TaskGraph> {
    if (!input.projectId) {
      throw new ValidationError('Project ID is required');
    }
    if (!input.name || input.name.trim() === '') {
      throw new ValidationError('Graph name is required');
    }

    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      throw new NotFoundError('Project', input.projectId);
    }

    const nodes = input.nodes ?? [];
    const edges = input.edges ?? [];

    // Validate node task IDs exist
    await this.validateNodeTaskIds(input.projectId, nodes.map(n => n.taskId));

    // Validate edge references
    this.validateEdgeReferences(nodes.map(n => n.taskId), edges);

    // Validate DAG (no cycles)
    if (edges.length > 0) {
      const cycleCheck = this.detectCycles(nodes.map(n => n.taskId), edges);
      if (cycleCheck) {
        throw new ValidationError(`Graph contains a cycle: ${cycleCheck.join(' → ')}`);
      }
    }

    const graph = await this.graphRepo.create({
      ...input,
      name: input.name.trim(),
      nodes,
      edges,
    });

    await this.eventBus.emit('task_graph:created', graph);
    return graph;
  }

  async getGraph(id: string): Promise<TaskGraph> {
    const graph = await this.graphRepo.findById(id);
    if (!graph) {
      throw new NotFoundError('Task graph', id);
    }
    return graph;
  }

  async listGraphs(filter?: TaskGraphFilter): Promise<TaskGraph[]> {
    return this.graphRepo.findAll(filter);
  }

  async listGraphsByProject(projectId: string): Promise<TaskGraph[]> {
    return this.graphRepo.findByProjectId(projectId);
  }

  async updateGraph(id: string, updates: UpdateTaskGraphPayload): Promise<TaskGraph> {
    if (updates.name !== undefined && updates.name.trim() === '') {
      throw new ValidationError('Graph name cannot be empty');
    }

    const existing = await this.graphRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Task graph', id);
    }

    // If graph is running, only allow status/executionSessionId updates
    if (existing.status === 'running') {
      const allowedRunningUpdates = ['status', 'executionSessionId', 'lastRunAt'];
      const attemptedKeys = Object.keys(updates).filter(k => updates[k as keyof UpdateTaskGraphPayload] !== undefined);
      const disallowed = attemptedKeys.filter(k => !allowedRunningUpdates.includes(k));
      if (disallowed.length > 0) {
        throw new ValidationError(`Cannot update ${disallowed.join(', ')} while graph is running`);
      }
    }

    const nodes = updates.nodes ?? existing.nodes;
    const edges = updates.edges ?? existing.edges;

    // If nodes or edges changed, re-validate
    if (updates.nodes !== undefined || updates.edges !== undefined) {
      await this.validateNodeTaskIds(existing.projectId, nodes.map(n => n.taskId));
      this.validateEdgeReferences(nodes.map(n => n.taskId), edges);

      if (edges.length > 0) {
        const cycleCheck = this.detectCycles(nodes.map(n => n.taskId), edges);
        if (cycleCheck) {
          throw new ValidationError(`Graph contains a cycle: ${cycleCheck.join(' → ')}`);
        }
      }
    }

    const nextUpdates: UpdateTaskGraphPayload = { ...updates };
    if (updates.name !== undefined) {
      nextUpdates.name = updates.name.trim();
    }

    const graph = await this.graphRepo.update(id, nextUpdates);
    await this.eventBus.emit('task_graph:updated', graph);
    return graph;
  }

  async deleteGraph(id: string): Promise<void> {
    const existing = await this.graphRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Task graph', id);
    }

    if (existing.status === 'running') {
      throw new ValidationError('Cannot delete a running graph. Cancel it first.');
    }

    await this.graphRepo.delete(id);
    await this.eventBus.emit('task_graph:deleted', { id, projectId: existing.projectId });
  }

  /**
   * Validate the graph and return topological order + parallel layers.
   */
  async validateGraph(id: string): Promise<GraphValidationResult> {
    const graph = await this.getGraph(id);
    const errors: string[] = [];
    const nodeTaskIds = graph.nodes.map(n => n.taskId);

    // Check for duplicate nodes
    const seen = new Set<string>();
    for (const taskId of nodeTaskIds) {
      if (seen.has(taskId)) {
        errors.push(`Duplicate node for task: ${taskId}`);
      }
      seen.add(taskId);
    }

    // Check all node tasks exist
    for (const taskId of nodeTaskIds) {
      const task = await this.taskRepo.findById(taskId);
      if (!task) {
        errors.push(`Task not found: ${taskId}`);
      }
    }

    // Check edge references
    for (const edge of graph.edges) {
      if (!seen.has(edge.sourceTaskId)) {
        errors.push(`Edge source ${edge.sourceTaskId} not in graph nodes`);
      }
      if (!seen.has(edge.targetTaskId)) {
        errors.push(`Edge target ${edge.targetTaskId} not in graph nodes`);
      }
      if (edge.sourceTaskId === edge.targetTaskId) {
        errors.push(`Self-loop on task: ${edge.sourceTaskId}`);
      }
    }

    // Check for cycles
    const cycle = this.detectCycles(nodeTaskIds, graph.edges);
    if (cycle) {
      errors.push(`Cycle detected: ${cycle.join(' → ')}`);
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const topologicalOrder = this.topologicalSort(nodeTaskIds, graph.edges)!;
    const parallelLayers = this.computeParallelLayers(nodeTaskIds, graph.edges);

    return { valid: true, errors: [], topologicalOrder, parallelLayers };
  }

  /**
   * Get nodes that are ready to execute or permanently blocked by a failed upstream.
   *
   * @param graph - the task graph
   * @param completedTaskIds - tasks that finished successfully
   * @param failedTaskIds - tasks that failed (permanently); defaults to empty set
   */
  getReadyNodes(
    graph: TaskGraph,
    completedTaskIds: Set<string>,
    failedTaskIds: Set<string> = new Set(),
  ): ReadyNodesResult {
    const ready: string[] = [];
    const blocked: string[] = [];

    for (const { taskId } of graph.nodes) {
      if (completedTaskIds.has(taskId) || failedTaskIds.has(taskId)) continue;

      const upstreamIds = graph.edges
        .filter(e => e.targetTaskId === taskId)
        .map(e => e.sourceTaskId);

      if (upstreamIds.some(id => failedTaskIds.has(id))) {
        blocked.push(taskId);
      } else if (upstreamIds.every(id => completedTaskIds.has(id))) {
        ready.push(taskId);
      }
      // else: still waiting on pending upstream(s) — not emitted
    }

    return { ready, blocked };
  }

  // --- Topology algorithms ---

  /**
   * Topological sort using Kahn's algorithm.
   * Zero-in-degree nodes are drained in lexicographic id order for determinism.
   * Returns null if the graph has a cycle.
   */
  topologicalSort(nodeIds: string[], edges: TaskGraphEdge[]): string[] | null {
    const { inDegree, adjacency } = this.buildGraph(nodeIds, edges);

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }
    queue.sort();

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      const newReady: string[] = [];
      for (const neighbor of adjacency.get(node) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) newReady.push(neighbor);
      }
      // Merge new ready nodes in sorted order to keep queue deterministic
      if (newReady.length > 0) {
        newReady.sort();
        queue.push(...newReady);
        queue.sort();
      }
    }

    return sorted.length === nodeIds.length ? sorted : null;
  }

  /**
   * Detect cycles. Returns the first cycle found as an array of task IDs, or null.
   */
  detectCycles(nodeIds: string[], edges: TaskGraphEdge[]): string[] | null {
    const sorted = this.topologicalSort(nodeIds, edges);
    if (sorted) return null;

    // Find a cycle using DFS
    const adjacency = new Map<string, string[]>();
    for (const id of nodeIds) adjacency.set(id, []);
    for (const edge of edges) {
      if (adjacency.has(edge.sourceTaskId)) {
        adjacency.get(edge.sourceTaskId)!.push(edge.targetTaskId);
      }
    }

    // Iterative DFS with explicit stack to avoid call-stack overflow on deep chains.
    // Each stack frame tracks the node and an iterator over its remaining neighbors.
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const id of nodeIds) color.set(id, WHITE);

    const path: string[] = [];

    for (const startId of nodeIds) {
      if (color.get(startId) !== WHITE) continue;

      // Stack entries: [node, neighborIteratorIndex]
      const stack: Array<[string, number]> = [[startId, 0]];
      color.set(startId, GRAY);
      path.push(startId);

      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const [node, idx] = frame;
        const neighbors = adjacency.get(node) || [];

        if (idx >= neighbors.length) {
          // All neighbors processed — backtrack
          color.set(node, BLACK);
          path.pop();
          stack.pop();
          continue;
        }

        // Advance the neighbor iterator
        frame[1]++;
        const neighbor = neighbors[idx];

        if (color.get(neighbor) === GRAY) {
          const cycleStart = path.lastIndexOf(neighbor);
          return [...path.slice(cycleStart), neighbor];
        }
        if (color.get(neighbor) === WHITE) {
          color.set(neighbor, GRAY);
          path.push(neighbor);
          stack.push([neighbor, 0]);
        }
      }
    }

    return ['cycle detected but could not reconstruct'];
  }

  /**
   * Compute parallel execution layers.
   * Each layer contains tasks that can run in parallel (all dependencies in prior layers).
   * Nodes within each layer are sorted by id for determinism.
   */
  computeParallelLayers(nodeIds: string[], edges: TaskGraphEdge[]): string[][] {
    const { inDegree, adjacency } = this.buildGraph(nodeIds, edges);

    const layers: string[][] = [];
    let currentLayer = nodeIds.filter(id => inDegree.get(id) === 0).sort();

    while (currentLayer.length > 0) {
      layers.push([...currentLayer]);
      const nextLayer: string[] = [];

      for (const node of currentLayer) {
        for (const neighbor of adjacency.get(node) || []) {
          const newDegree = (inDegree.get(neighbor) || 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) nextLayer.push(neighbor);
        }
      }

      currentLayer = nextLayer.sort();
    }

    return layers;
  }

  // --- Private helpers ---

  /** Build in-degree and adjacency maps shared by topologicalSort and computeParallelLayers. */
  private buildGraph(nodeIds: string[], edges: TaskGraphEdge[]): {
    inDegree: Map<string, number>;
    adjacency: Map<string, string[]>;
  } {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }
    for (const edge of edges) {
      if (!inDegree.has(edge.sourceTaskId) || !inDegree.has(edge.targetTaskId)) continue;
      inDegree.set(edge.targetTaskId, (inDegree.get(edge.targetTaskId) || 0) + 1);
      adjacency.get(edge.sourceTaskId)!.push(edge.targetTaskId);
    }
    return { inDegree, adjacency };
  }

  private async validateNodeTaskIds(projectId: string, taskIds: string[]): Promise<void> {
    const seen = new Set<string>();
    for (const taskId of taskIds) {
      if (seen.has(taskId)) {
        throw new ValidationError(`Duplicate node for task: ${taskId}`);
      }
      seen.add(taskId);

      const task = await this.taskRepo.findById(taskId);
      if (!task) {
        throw new NotFoundError('Task', taskId);
      }
      if (task.projectId !== projectId) {
        throw new ValidationError(`Task ${taskId} does not belong to project ${projectId}`);
      }
    }
  }

  private validateEdgeReferences(nodeTaskIds: string[], edges: TaskGraphEdge[]): void {
    const nodeSet = new Set(nodeTaskIds);
    const edgeIdSet = new Set<string>();

    for (const edge of edges) {
      if (edgeIdSet.has(edge.id)) {
        throw new ValidationError(`Duplicate edge ID: ${edge.id}`);
      }
      edgeIdSet.add(edge.id);

      if (!nodeSet.has(edge.sourceTaskId)) {
        throw new ValidationError(`Edge source ${edge.sourceTaskId} is not a node in the graph`);
      }
      if (!nodeSet.has(edge.targetTaskId)) {
        throw new ValidationError(`Edge target ${edge.targetTaskId} is not a node in the graph`);
      }
      if (edge.sourceTaskId === edge.targetTaskId) {
        throw new ValidationError(`Self-loop edge on task: ${edge.sourceTaskId}`);
      }
    }
  }
}
