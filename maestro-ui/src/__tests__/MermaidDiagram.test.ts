import { describe, it, expect, beforeAll } from "vitest";
import mermaid from "mermaid";
import DOMPurify from "dompurify";

// jsdom doesn't implement SVG text measurement; stub it so mermaid can lay out
// native <text> labels (the htmlLabels:false path uses getComputedTextLength).
beforeAll(() => {
  (SVGElement.prototype as any).getComputedTextLength = () => 40;
  (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 40, height: 16 });
});

// Regression: with mermaid's default htmlLabels:true, flowchart labels render as
// HTML inside <foreignObject>. DOMPurify's svg profile strips that inner HTML,
// erasing every node label and leaving the diagram blank/broken. MermaidDiagram
// initializes mermaid with htmlLabels:false so labels are native SVG <text> that
// survive sanitization. This test mirrors that render+sanitize pipeline.
describe("MermaidDiagram render/sanitize pipeline", () => {
  it("keeps node labels (native <text>, no foreignObject) after DOMPurify", async () => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "strict",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });

    const { svg } = await mermaid.render("test-diagram", "flowchart TD\n A[Start] --> B[Finish]");

    // No foreignObject means labels aren't HTML — so DOMPurify won't strip them.
    expect(svg).not.toContain("foreignObject");

    const sanitized = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
    expect(sanitized).toContain("Start");
    expect(sanitized).toContain("Finish");
  });
});
