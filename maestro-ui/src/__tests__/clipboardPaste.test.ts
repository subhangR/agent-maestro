import { describe, it, expect, vi } from "vitest";
import { dispatchClipboardData } from "../utils/clipboardPaste";

function makeFile(name: string, type: string, content = "x"): File {
  return new File([content], name, { type });
}

/**
 * Minimal DataTransfer stand-in covering both shapes a real paste produces:
 * `items` (screenshots / "Copy Image") and `files` (OS file copies), plus the
 * `text/plain` flavour that rides along with almost every clipboard write.
 */
function makeDataTransfer(opts: {
  itemFiles?: (File | null)[];
  files?: File[];
  text?: string;
}): DataTransfer {
  const itemFiles = opts.itemFiles ?? [];
  const items = itemFiles.map((f) => ({
    kind: "file" as const,
    type: f?.type ?? "",
    getAsFile: () => f,
  }));
  const types: string[] = [];
  if (opts.files?.length || itemFiles.length) types.push("Files");
  if (opts.text != null) types.push("text/plain");

  return {
    items,
    files: opts.files ?? [],
    types,
    getData: (format: string) => (format === "text/plain" ? (opts.text ?? "") : ""),
  } as unknown as DataTransfer;
}

function makeHandlers() {
  return { onText: vi.fn(), onImages: vi.fn() };
}

describe("dispatchClipboardData", () => {
  it("routes a null DataTransfer to nobody", () => {
    const handlers = makeHandlers();
    const result = dispatchClipboardData(null, handlers);

    expect(result).toEqual({ kind: "none", handled: false, imageCount: 0 });
    expect(handlers.onText).not.toHaveBeenCalled();
    expect(handlers.onImages).not.toHaveBeenCalled();
  });

  // ---- text ---------------------------------------------------------------

  it("routes plain text to onText", () => {
    const handlers = makeHandlers();
    const result = dispatchClipboardData(makeDataTransfer({ text: "echo hello" }), handlers);

    expect(result.kind).toBe("text");
    expect(result.handled).toBe(true);
    expect(handlers.onText).toHaveBeenCalledWith("echo hello");
    expect(handlers.onImages).not.toHaveBeenCalled();
  });

  it("routes MULTI-LINE text to onText intact — the caller brackets it, never auto-submits", () => {
    const handlers = makeHandlers();
    const multiline = "line one\nline two\nline three";

    const result = dispatchClipboardData(makeDataTransfer({ text: multiline }), handlers);

    expect(result.kind).toBe("text");
    // The newlines survive verbatim: term.paste() wraps them in bracketed-paste
    // markers so the agent receives them as text rather than as Enter presses.
    expect(handlers.onText).toHaveBeenCalledWith(multiline);
  });

  it("treats empty text as nothing to do", () => {
    const handlers = makeHandlers();
    const result = dispatchClipboardData(makeDataTransfer({ text: "" }), handlers);

    expect(result.kind).toBe("none");
    expect(result.handled).toBe(false);
    expect(handlers.onText).not.toHaveBeenCalled();
  });

  // ---- images -------------------------------------------------------------

  it("routes a pasted screenshot to onImages", () => {
    const handlers = makeHandlers();
    const png = makeFile("image.png", "image/png");

    const result = dispatchClipboardData(makeDataTransfer({ itemFiles: [png] }), handlers);

    expect(result.kind).toBe("images");
    expect(result.handled).toBe(true);
    expect(result.imageCount).toBe(1);
    expect(handlers.onImages).toHaveBeenCalledTimes(1);
    expect(handlers.onImages.mock.calls[0][0]).toHaveLength(1);
    expect(handlers.onText).not.toHaveBeenCalled();
  });

  it("routes multiple images in one paste", () => {
    const handlers = makeHandlers();
    const files = [makeFile("a.png", "image/png"), makeFile("b.jpg", "image/jpeg")];

    const result = dispatchClipboardData(makeDataTransfer({ files }), handlers);

    expect(result.kind).toBe("images");
    expect(result.imageCount).toBe(2);
    expect(handlers.onImages.mock.calls[0][0]).toHaveLength(2);
  });

  it("ignores non-image files (they are not uploadable clipboard images)", () => {
    const handlers = makeHandlers();
    const pdf = makeFile("doc.pdf", "application/pdf");

    const result = dispatchClipboardData(makeDataTransfer({ files: [pdf], text: "doc.pdf" }), handlers);

    // Falls through to the text flavour rather than claiming the paste.
    expect(result.kind).toBe("text");
    expect(handlers.onImages).not.toHaveBeenCalled();
    expect(handlers.onText).toHaveBeenCalledWith("doc.pdf");
  });

  // ---- mixed --------------------------------------------------------------

  it("prefers the IMAGE when a paste carries both an image and text", () => {
    const handlers = makeHandlers();
    const png = makeFile("image.png", "image/png");

    // Copying a screenshot (or a file from Finder) commonly attaches a
    // decorative text/plain label alongside the blob. The user meant the image.
    const result = dispatchClipboardData(
      makeDataTransfer({ itemFiles: [png], text: "Screenshot 2026-07-23.png" }),
      handlers,
    );

    expect(result.kind).toBe("images");
    expect(handlers.onImages).toHaveBeenCalledTimes(1);
    expect(handlers.onText).not.toHaveBeenCalled();
  });

  it("applies sequence names starting at the supplied index", () => {
    const handlers = makeHandlers();
    const png = makeFile("image.png", "image/png");

    dispatchClipboardData(makeDataTransfer({ itemFiles: [png] }), handlers, { imageStartIndex: 7 });

    const [files] = handlers.onImages.mock.calls[0];
    expect(files[0].name).toBe("image7.png");
  });

  it("never calls both handlers for one paste", () => {
    const handlers = makeHandlers();
    dispatchClipboardData(
      makeDataTransfer({ itemFiles: [makeFile("a.png", "image/png")], text: "some text" }),
      handlers,
    );

    const totalCalls = handlers.onText.mock.calls.length + handlers.onImages.mock.calls.length;
    expect(totalCalls).toBe(1);
  });
});
