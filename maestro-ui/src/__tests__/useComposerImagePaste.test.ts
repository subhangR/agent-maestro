import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useComposerImagePaste } from "../hooks/useComposerImagePaste";

// The hook's only side-effecting collaborators: the upload (network) and the
// toast queue. Both are stubbed so the test asserts the hook's own contract —
// what it CLAIMS and what it INSERTS — and nothing else.
const uploadClipboardImage = vi.hoisted(() => vi.fn());
const notifyUser = vi.hoisted(() => vi.fn(() => "notice-1"));
const dismissNotice = vi.hoisted(() => vi.fn());

vi.mock("../utils/clipboardUpload", () => ({ uploadClipboardImage }));
vi.mock("../utils/notify", () => ({ notifyUser, dismissNotice }));

function makeFile(name: string, type: string, content = "x"): File {
  return new File([content], name, { type });
}

/**
 * Minimal DataTransfer stand-in — jsdom ships no usable DataTransfer
 * constructor. Mirrors the two shapes a real paste produces (`items` for
 * screenshots, `files` for OS file copies) plus the `text/plain` flavour.
 */
function makeDataTransfer(opts: { itemFiles?: File[]; files?: File[]; text?: string }): DataTransfer {
  const itemFiles = opts.itemFiles ?? [];
  const types: string[] = [];
  if (opts.files?.length || itemFiles.length) types.push("Files");
  if (opts.text != null) types.push("text/plain");

  return {
    items: itemFiles.map((f) => ({ kind: "file" as const, type: f.type, getAsFile: () => f })),
    files: opts.files ?? [],
    types,
    getData: (format: string) => (format === "text/plain" ? (opts.text ?? "") : ""),
  } as unknown as DataTransfer;
}

/** A React synthetic-event stand-in carrying a spy-able preventDefault. */
function makeEvent(data: DataTransfer, key: "clipboardData" | "dataTransfer") {
  return { [key]: data, preventDefault: vi.fn() } as never as {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

/**
 * Render the hook over a live <textarea> so caret reads (selectionStart/End)
 * and the focus restore go through real DOM, and expose the value the hook
 * pushes through setValue.
 */
function setup(initialValue = "", caret?: { start: number; end: number }) {
  const textarea = document.createElement("textarea");
  textarea.value = initialValue;
  document.body.appendChild(textarea);
  textarea.setSelectionRange(caret?.start ?? initialValue.length, caret?.end ?? initialValue.length);

  const state = { value: initialValue };
  const setValue = vi.fn((next: string) => {
    state.value = next;
    textarea.value = next;
  });

  const view = renderHook(() =>
    useComposerImagePaste({
      value: state.value,
      setValue,
      inputRef: { current: textarea },
      sessionId: "sess_abc",
    }),
  );

  return { view, setValue, state, textarea };
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
  uploadClipboardImage.mockReset();
  notifyUser.mockReturnValue("notice-1");
});

describe("useComposerImagePaste", () => {
  // ---- images ARE claimed -------------------------------------------------

  it("claims an image paste and inserts the absolute server path at the caret", async () => {
    uploadClipboardImage.mockResolvedValue({
      filename: "image1.png",
      path: "/Users/dev/.maestro/data/clipboard/2026-07-23/image1.png",
      url: "/api/clipboard/images/2026-07-23/image1.png",
      mimeType: "image/png",
      bytes: 42,
    });
    const { view, setValue } = setup("look at");

    const event = makeEvent(makeDataTransfer({ itemFiles: [makeFile("image.png", "image/png")] }), "clipboardData");
    await act(async () => {
      view.result.current.onPaste(event as never);
    });

    // Claimed: the browser's native textarea paste must not also run.
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(uploadClipboardImage).toHaveBeenCalledTimes(1);
    // Uploaded under the composer's session so the server can scope storage.
    expect(uploadClipboardImage.mock.calls[0][1]).toBe("sess_abc");
    // The ABSOLUTE server-side path is what lands in the textarea — never a blob
    // URL or base64 — because that is what the agent will Read.
    // …and it lands as its own whitespace-delimited token, trailing space and
    // all, so the next thing typed cannot glue onto the path.
    expect(setValue).toHaveBeenCalledWith(
      "look at /Users/dev/.maestro/data/clipboard/2026-07-23/image1.png ",
    );
  });

  it("inserts at the caret rather than appending, and replaces a selection", async () => {
    uploadClipboardImage.mockResolvedValue({
      filename: "image1.png",
      path: "/data/clipboard/2026-07-23/image1.png",
      url: "",
      mimeType: "image/png",
      bytes: 1,
    });
    // Caret spans "REPLACE" in "before REPLACE after".
    const { view, setValue } = setup("before REPLACE after", { start: 7, end: 15 });

    const event = makeEvent(makeDataTransfer({ itemFiles: [makeFile("image.png", "image/png")] }), "clipboardData");
    await act(async () => {
      view.result.current.onPaste(event as never);
    });

    // Inserted at the caret, replacing the selection — NOT appended.
    expect(setValue.mock.calls[0][0]).toContain("before /data/clipboard/2026-07-23/image1.png");
    expect(setValue.mock.calls[0][0]).not.toContain("REPLACE");

    // The word that followed the replaced selection stays a separate token —
    // "…image1.pngafter" would hand the agent a path that does not exist.
    expect(setValue).toHaveBeenCalledWith("before /data/clipboard/2026-07-23/image1.png after");
  });

  it("does not glue the path onto the text the caret sits in front of", async () => {
    uploadClipboardImage.mockResolvedValue({
      filename: "image1.png",
      path: "/tmp/image1.png",
      url: "",
      mimeType: "image/png",
      bytes: 1,
    });
    // Caret at the very start, with existing text to the right of it.
    const { view, setValue, textarea } = setup("after", { start: 0, end: 0 });

    const event = makeEvent(makeDataTransfer({ itemFiles: [makeFile("image.png", "image/png")] }), "clipboardData");
    await act(async () => {
      view.result.current.onPaste(event as never);
    });

    expect(setValue).toHaveBeenCalledWith("/tmp/image1.png after");
    // Nothing precedes the path, so no leading space is invented either.
    expect(setValue.mock.calls[0][0].startsWith(" ")).toBe(false);
    // The caret parks past the trailing space, ready for the next word.
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(textarea.selectionStart).toBe("/tmp/image1.png ".length);
  });

  it("does not double a space that already surrounds the insertion point", async () => {
    uploadClipboardImage.mockResolvedValue({
      filename: "image1.png",
      path: "/tmp/image1.png",
      url: "",
      mimeType: "image/png",
      bytes: 1,
    });
    // Caret between the existing trailing space and the following space.
    const { view, setValue } = setup("look at  after", { start: 8, end: 8 });

    const event = makeEvent(makeDataTransfer({ itemFiles: [makeFile("image.png", "image/png")] }), "clipboardData");
    await act(async () => {
      view.result.current.onPaste(event as never);
    });

    // One space either side — the hook adds neither, because both are present.
    expect(setValue).toHaveBeenCalledWith("look at /tmp/image1.png after");
    expect(setValue.mock.calls[0][0]).not.toContain("  ");
  });

  it("uploads every image in a multi-image paste and joins the paths", async () => {
    uploadClipboardImage
      .mockResolvedValueOnce({ filename: "image1.png", path: "/tmp/image1.png", url: "", mimeType: "image/png", bytes: 1 })
      .mockResolvedValueOnce({ filename: "image2.png", path: "/tmp/image2.png", url: "", mimeType: "image/png", bytes: 1 });
    const { view, setValue } = setup("");

    const event = makeEvent(
      makeDataTransfer({ itemFiles: [makeFile("a.png", "image/png"), makeFile("b.png", "image/png", "y")] }),
      "clipboardData",
    );
    await act(async () => {
      view.result.current.onPaste(event as never);
    });

    expect(uploadClipboardImage).toHaveBeenCalledTimes(2);
    expect(setValue).toHaveBeenCalledWith("/tmp/image1.png /tmp/image2.png ");
  });

  it("claims an image DROP the same way it claims a paste", async () => {
    uploadClipboardImage.mockResolvedValue({
      filename: "image1.png",
      path: "/tmp/dropped.png",
      url: "",
      mimeType: "image/png",
      bytes: 1,
    });
    const { view, setValue } = setup("");

    const event = makeEvent(makeDataTransfer({ files: [makeFile("shot.png", "image/png")] }), "dataTransfer");
    await act(async () => {
      view.result.current.onDrop(event as never);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(setValue).toHaveBeenCalledWith("/tmp/dropped.png ");
  });

  // ---- text is NOT claimed ------------------------------------------------

  it("does NOT claim a plain-text paste — the textarea pastes it natively", async () => {
    const { view, setValue } = setup("hello ");

    const event = makeEvent(makeDataTransfer({ text: "some pasted text" }), "clipboardData");
    await act(async () => {
      view.result.current.onPaste(event as never);
    });

    // The whole point of the hook: text falls through to the browser, so no
    // preventDefault, no upload, and no programmatic value rewrite.
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(uploadClipboardImage).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
  });

  it("does not claim a paste carrying a non-image file", async () => {
    const { view, setValue } = setup("");

    const event = makeEvent(makeDataTransfer({ files: [makeFile("notes.pdf", "application/pdf")] }), "clipboardData");
    await act(async () => {
      view.result.current.onPaste(event as never);
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(uploadClipboardImage).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
  });

  it("ignores paste and drop entirely while disabled", async () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    const setValue = vi.fn();
    const view = renderHook(() =>
      useComposerImagePaste({
        value: "",
        setValue,
        inputRef: { current: textarea },
        sessionId: "sess_abc",
        disabled: true,
      }),
    );

    const pasteEvent = makeEvent(makeDataTransfer({ itemFiles: [makeFile("image.png", "image/png")] }), "clipboardData");
    const dropEvent = makeEvent(makeDataTransfer({ files: [makeFile("image.png", "image/png")] }), "dataTransfer");
    await act(async () => {
      view.result.current.onPaste(pasteEvent as never);
      view.result.current.onDrop(dropEvent as never);
    });

    expect(pasteEvent.preventDefault).not.toHaveBeenCalled();
    expect(dropEvent.preventDefault).not.toHaveBeenCalled();
    expect(uploadClipboardImage).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
  });

  // ---- failure surfaces, and writes nothing -------------------------------

  it("warns and inserts NOTHING when the upload is rejected", async () => {
    uploadClipboardImage.mockRejectedValue(new Error("Image too large (max 10MB)"));
    const { view, setValue } = setup("keep me");

    const event = makeEvent(makeDataTransfer({ itemFiles: [makeFile("image.png", "image/png")] }), "clipboardData");
    await act(async () => {
      view.result.current.onPaste(event as never);
    });

    expect(setValue).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledWith("Image too large (max 10MB)", "warn", "sess_abc");
  });

  // ---- drag-over ----------------------------------------------------------

  it("accepts a drag carrying files, and ignores one that carries none", () => {
    const { view } = setup("");

    const withFiles = makeEvent(makeDataTransfer({ files: [makeFile("a.png", "image/png")] }), "dataTransfer");
    const withoutFiles = makeEvent(makeDataTransfer({ text: "dragged text" }), "dataTransfer");
    act(() => {
      view.result.current.onDragOver(withFiles as never);
      view.result.current.onDragOver(withoutFiles as never);
    });

    expect(withFiles.preventDefault).toHaveBeenCalledTimes(1);
    expect(withoutFiles.preventDefault).not.toHaveBeenCalled();
  });
});
