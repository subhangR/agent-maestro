import { TaskGraphService } from '../src/application/services/TaskGraphService';
import type { TaskGraph } from '../src/types';

function makeService(): TaskGraphService {
  return new TaskGraphService(null as any, null as any, null as any, null as any);
}

describe('TaskGraphService graph algorithms', () => {
  it('reports the exact cycle when a traversal has multiple branches', () => {
    const service = makeService();
    const cycle = service.detectCycles(
      ['a', 'b', 'c', 'd', 'e'],
      [
        { sourceTaskId: 'a', targetTaskId: 'b' },
        { sourceTaskId: 'a', targetTaskId: 'c' },
        { sourceTaskId: 'b', targetTaskId: 'd' },
        { sourceTaskId: 'c', targetTaskId: 'd' },
        { sourceTaskId: 'd', targetTaskId: 'e' },
        { sourceTaskId: 'e', targetTaskId: 'c' },
      ] as any,
    );

    expect(cycle).toEqual(['d', 'e', 'c', 'd']);
  });

  it('returns null for an acyclic graph', () => {
    const service = makeService();
    expect(service.detectCycles(
      ['a', 'b', 'c'],
      [
        { sourceTaskId: 'a', targetTaskId: 'b' },
        { sourceTaskId: 'b', targetTaskId: 'c' },
      ] as any,
    )).toBeNull();
  });

  it('does not stack-overflow on a deep chain cycle (5000 nodes)', () => {
    const service = makeService();
    const n = 5000;
    const nodeIds = Array.from({ length: n }, (_, i) => `t${i}`);
    const edges: Array<{ sourceTaskId: string; targetTaskId: string }> = [];
    for (let i = 0; i < n - 1; i++) edges.push({ sourceTaskId: `t${i}`, targetTaskId: `t${i + 1}` });
    // close the cycle: last node → first
    edges.push({ sourceTaskId: `t${n - 1}`, targetTaskId: `t0` });

    expect(() => service.detectCycles(nodeIds, edges as any)).not.toThrow();
    const cycle = service.detectCycles(nodeIds, edges as any);
    expect(cycle).not.toBeNull();
    // The cycle must start and end with the same node
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });
});

// Helper: build a minimal TaskGraph stub for getReadyNodes tests
function makeGraph(
  nodeIds: string[],
  edges: Array<{ sourceTaskId: string; targetTaskId: string }>,
): TaskGraph {
  return {
    id: 'g1',
    projectId: 'p1',
    name: 'test',
    nodes: nodeIds.map(taskId => ({ taskId })),
    edges: edges.map((e, i) => ({ id: `e${i}`, ...e })),
    status: 'pending',
    createdAt: '',
    updatedAt: '',
  } as unknown as TaskGraph;
}

describe('getReadyNodes', () => {
  // Diamond shape:  A → B → D
  //                 A → C → D
  // A completes, B fails → C should be ready, D should be blocked
  it('returns blocked nodes when an upstream dependency has failed (diamond graph)', () => {
    const service = makeService();
    const graph = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        { sourceTaskId: 'A', targetTaskId: 'B' },
        { sourceTaskId: 'A', targetTaskId: 'C' },
        { sourceTaskId: 'B', targetTaskId: 'D' },
        { sourceTaskId: 'C', targetTaskId: 'D' },
      ],
    );

    const result = service.getReadyNodes(
      graph,
      new Set(['A']),       // A completed
      new Set(['B']),       // B failed
    );

    expect(result.ready).toEqual(['C']);   // C's only dep (A) completed
    expect(result.blocked).toEqual(['D']); // D has failed dep B
  });

  it('backward-compat: two-argument call (no failedTaskIds) behaves as before', () => {
    const service = makeService();
    // A → B → C (linear chain); A completed
    const graph = makeGraph(
      ['A', 'B', 'C'],
      [
        { sourceTaskId: 'A', targetTaskId: 'B' },
        { sourceTaskId: 'B', targetTaskId: 'C' },
      ],
    );

    const result = service.getReadyNodes(graph, new Set(['A']));

    expect(result.ready).toEqual(['B']);
    expect(result.blocked).toEqual([]);
  });

  it('does not include completed or failed nodes in ready/blocked', () => {
    const service = makeService();
    const graph = makeGraph(['A', 'B'], [{ sourceTaskId: 'A', targetTaskId: 'B' }]);

    const result = service.getReadyNodes(graph, new Set(['A']), new Set(['B']));
    // B is already in failedTaskIds — should not reappear in either list
    expect(result.ready).toEqual([]);
    expect(result.blocked).toEqual([]);
  });
});

describe('topologicalSort determinism', () => {
  it('returns the same order regardless of node insertion order', () => {
    const service = makeService();
    // Graph: a → c, b → c, c → d (a and b are independent roots)
    const edges = [
      { sourceTaskId: 'a', targetTaskId: 'c' },
      { sourceTaskId: 'b', targetTaskId: 'c' },
      { sourceTaskId: 'c', targetTaskId: 'd' },
    ] as any;

    const order1 = service.topologicalSort(['a', 'b', 'c', 'd'], edges);
    const order2 = service.topologicalSort(['d', 'c', 'b', 'a'], edges); // shuffled
    const order3 = service.topologicalSort(['b', 'd', 'a', 'c'], edges); // shuffled

    expect(order1).not.toBeNull();
    expect(order1).toEqual(order2);
    expect(order1).toEqual(order3);
    // Lexicographic: a and b are both roots; a < b so a comes first
    expect(order1![0]).toBe('a');
    expect(order1![1]).toBe('b');
  });
});
