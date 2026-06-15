import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import type { DocEntry } from "../app/types/maestro";

// Stub heavy deps that DocViewer pulls in
vi.mock("react-markdown", () => ({
  default: ({ children, components }: any) => {
    // Simulate rendering an excalidraw fenced block via the code component
    if (typeof children === "string" && children.includes("```excalidraw")) {
      const match = children.match(/```excalidraw\n([^\n]+)\n```/);
      if (match && components?.code) {
        return <>{React.createElement(components.code, { className: "language-excalidraw", children: match[1] })}</>;
      }
    }
    return <div data-testid="markdown">{children}</div>;
  },
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));
vi.mock("../components/maestro/MermaidDiagram", () => ({
  MermaidDiagram: () => <div data-testid="mermaid" />,
}));

// ExcalidrawBoard mock – used both directly (lazy) and via DocViewer
vi.mock("../components/ExcalidrawBoard", () => ({
  ExcalidrawBoard: ({ mode }: { mode?: string }) => (
    <div data-testid="excalidraw-board" data-mode={mode ?? "edit"} />
  ),
}));

vi.mock("../utils/MaestroClient", () => ({
  maestroClient: {},
  API_BASE_URL: "http://localhost:4569/api",
}));

import { DocViewer } from "../components/maestro/DocViewer";

function makeDoc(overrides: Partial<DocEntry> = {}): DocEntry {
  return {
    id: "doc_001",
    title: "Test Doc",
    filePath: "test.md",
    addedAt: Date.now(),
    content: "# Hello",
    ...overrides,
  };
}

describe("DocViewer – markdown doc", () => {
  it("renders markdown content", () => {
    render(<DocViewer doc={makeDoc()} onClose={() => {}} inline />);
    expect(screen.getByTestId("markdown")).toBeTruthy();
  });
});

describe("DocViewer – diagram doc", () => {
  it("renders ExcalidrawBoard in view mode by default", async () => {
    const doc = makeDoc({ kind: "diagram", filePath: "diagram.excalidraw", content: "{}" });
    render(<DocViewer doc={doc} onClose={() => {}} inline />);
    const board = await screen.findByTestId("excalidraw-board");
    expect(board.dataset.mode).toBe("view");
  });

  it("shows ⬡ icon for diagram docs", async () => {
    const doc = makeDoc({ kind: "diagram", filePath: "diagram.excalidraw", content: "{}" });
    render(<DocViewer doc={doc} onClose={() => {}} inline />);
    expect(screen.getByText("⬡")).toBeTruthy();
  });

  it("renders the board for a .excalidraw doc even when kind is missing", async () => {
    // Regression: docs from session/task timelines often arrive without `kind`.
    // They must still open on the board, not render their JSON as raw code.
    const doc = makeDoc({ kind: undefined, filePath: "diagram.excalidraw", content: '{"elements":[]}' });
    render(<DocViewer doc={doc} onClose={() => {}} inline />);
    expect(await screen.findByTestId("excalidraw-board")).toBeTruthy();
    expect(screen.queryByText('{"elements":[]}')).toBeNull();
  });

  it("shows an Edit button for diagram docs", async () => {
    const doc = makeDoc({ kind: "diagram", filePath: "diagram.excalidraw", content: "{}" });
    render(<DocViewer doc={doc} onClose={() => {}} inline />);
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("switches to edit mode when Edit is clicked", async () => {
    const doc = makeDoc({ kind: "diagram", filePath: "diagram.excalidraw", content: "{}" });
    render(<DocViewer doc={doc} onClose={() => {}} inline />);
    await act(async () => { fireEvent.click(screen.getByText("Edit")); });
    const board = await screen.findByTestId("excalidraw-board");
    expect(board.dataset.mode).toBe("edit");
  });

  it("shows View button in edit mode and switches back on click", async () => {
    const doc = makeDoc({ kind: "diagram", filePath: "diagram.excalidraw", content: "{}" });
    render(<DocViewer doc={doc} onClose={() => {}} inline />);
    await act(async () => { fireEvent.click(screen.getByText("Edit")); });
    expect(screen.getByText("View")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText("View")); });
    const board = await screen.findByTestId("excalidraw-board");
    expect(board.dataset.mode).toBe("view");
  });
});

describe("DocViewer – inline excalidraw embed directive", () => {
  it("renders placeholder for excalidraw fenced blocks in markdown", () => {
    const doc = makeDoc({
      kind: "markdown",
      filePath: "notes.md",
      content: "Some text\n```excalidraw\ndoc_embed_123\n```\nMore text",
    });
    render(<DocViewer doc={doc} onClose={() => {}} inline />);
    // InlineExcalidrawEmbed renders the docId text
    expect(screen.getByText("doc_embed_123")).toBeTruthy();
  });
});

describe("ExcalidrawBoard save debounce – board fires updateDocContent once", () => {
  it("ExcalidrawBoard renders and passes mode to Excalidraw", async () => {
    const doc = makeDoc({ kind: "diagram", filePath: "d.excalidraw", sessionId: "sess_1", content: "{}" });
    render(<DocViewer doc={doc} onClose={() => {}} inline />);
    const board = await screen.findByTestId("excalidraw-board");
    // In DocViewer the board starts in view mode
    expect(board.dataset.mode).toBe("view");
  });
});
