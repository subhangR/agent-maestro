import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { DocEntry } from "../app/types/maestro";

const mockCreateWhiteboard = vi.fn(() => "wb_new");
const mockSetActiveId = vi.fn();
let mockSpaces: any[] = [];

vi.mock("../stores/useSpacesStore", () => ({
  useSpacesStore: (selector: any) =>
    selector({ spaces: mockSpaces, createWhiteboard: mockCreateWhiteboard }),
}));
vi.mock("../stores/useSessionStore", () => ({
  useSessionStore: (selector: any) => selector({ setActiveId: mockSetActiveId }),
}));

import { useOpenDiagram } from "../hooks/useOpenDiagram";

function makeDoc(overrides: Partial<DocEntry> = {}): DocEntry {
  return {
    id: "doc_1",
    title: "Diagram",
    filePath: "Diagram.excalidraw",
    addedAt: 1,
    sessionId: "sess_1",
    ...overrides,
  };
}

describe("useOpenDiagram", () => {
  beforeEach(() => {
    mockCreateWhiteboard.mockClear();
    mockSetActiveId.mockClear();
    mockSpaces = [];
  });

  it("opens a new whiteboard for a diagram and activates it", () => {
    const { result } = renderHook(() => useOpenDiagram());
    result.current(makeDoc(), "proj_abc");
    expect(mockCreateWhiteboard).toHaveBeenCalledWith("proj_abc", "Diagram", undefined, "doc_1", "sess_1");
    expect(mockSetActiveId).toHaveBeenCalledWith("wb_new");
  });

  it("reuses an existing whiteboard for the same doc instead of creating a duplicate", () => {
    mockSpaces = [{ id: "wb_existing", type: "whiteboard", docId: "doc_1" }];
    const { result } = renderHook(() => useOpenDiagram());
    result.current(makeDoc(), "proj_abc");
    expect(mockCreateWhiteboard).not.toHaveBeenCalled();
    expect(mockSetActiveId).toHaveBeenCalledWith("wb_existing");
  });
});
