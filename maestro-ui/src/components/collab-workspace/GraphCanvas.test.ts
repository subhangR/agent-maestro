import { describe, expect, it } from "vitest";
import { filterGraph } from "./GraphCanvas";
import { mockGraphCanvasResult } from "./GraphCanvas.fixture";

describe("GraphCanvas graph projection", () => {
    it("keeps only configured kinds and typed edges", () => {
        const graph = filterGraph(mockGraphCanvasResult, new Set(["task"]), new Set(["depends_on"]), null, 2);

        expect(graph.nodes).toHaveLength(4);
        expect(graph.edges).toHaveLength(2);
        expect(graph.edges.every((edge) => edge.type === "depends_on")).toBe(true);
    });

    it("projects focus mode by undirected hops without leaking unrelated entities", () => {
        const focused = mockGraphCanvasResult.nodes.find((node) => node.title === "Hover previews (Z2)");
        if (!focused) throw new Error("fixture is missing focus node");

        const graph = filterGraph(mockGraphCanvasResult, new Set(mockGraphCanvasResult.nodes.map((node) => node.kind)), new Set(mockGraphCanvasResult.edges.map((edge) => edge.type)), focused.id, 1);

        expect(graph.nodes.map((node) => node.title)).toEqual(expect.arrayContaining(["Hover previews (Z2)", "Entity chips (Z1)"]));
        expect(graph.nodes.map((node) => node.title)).not.toContain("Connections rail");
    });
});
