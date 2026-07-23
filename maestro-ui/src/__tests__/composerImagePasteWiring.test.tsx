/**
 * Every chat composer must accept a pasted image — that is the owner-level
 * requirement ("paste into their respective chat interfaces, so it should be
 * generic"), and until now only SessionActivityPanel's ChatComposer honoured it.
 *
 * These are WIRING tests: the hook's own splice/upload contract is covered by
 * useComposerImagePaste.test.ts. What is asserted here is per-composer — that
 * the textarea claims an image paste at all, that it routes it to the right
 * destination, and that a PLAIN-TEXT paste is still left to the browser.
 *
 * Two destinations exist on purpose:
 *   - ensemble composers → maestro-server path (recipients are local sessions)
 *   - Collab MessageComposer → a staged Firebase attachment (recipients are
 *     remote, where a local absolute path resolves to nothing)
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const uploadClipboardImage = vi.hoisted(() => vi.fn());
const notifyUser = vi.hoisted(() => vi.fn(() => "notice-1"));
const dismissNotice = vi.hoisted(() => vi.fn());
const sendEnsembleMessage = vi.hoisted(() => vi.fn(async () => {}));
const shareFile = vi.hoisted(() => vi.fn(async () => "file-1"));
const encodeFileToBase64 = vi.hoisted(() => vi.fn(async () => "base64"));

vi.mock("../utils/clipboardUpload", () => ({ uploadClipboardImage }));
vi.mock("../utils/notify", () => ({ notifyUser, dismissNotice }));
vi.mock("../firebase/SpaceShareClient", () => ({ SpaceShareClient: { shareFile } }));
vi.mock("../firebase/SpaceFilesClient", () => ({ encodeFileToBase64 }));

const ensemble = {
  id: "ens_1",
  name: "Strike Team",
  memberSessionIds: ["sess_a", "sess_b"],
};

vi.mock("../stores/useEnsembleStore", () => ({
  useEnsembleStore: (selector: (s: unknown) => unknown) =>
    selector({
      sendEnsembleMessage,
      ensembleById: (id: string) => (id === ensemble.id ? ensemble : undefined),
    }),
}));

import { EnsembleMessageComposer as SpellsEnsembleComposer } from "../components/spells/EnsembleMessageComposer";
import { EnsembleMessageComposer as StudioEnsembleComposer } from "../components/spells/studio/ensemble/EnsembleMessageComposer";
import { MessageComposer } from "../components/maestro/messaging/MessageComposer";

function makeFile(name: string, type: string): File {
  return new File(["x"], name, { type });
}

/** jsdom ships no usable DataTransfer — mirror the shapes a real paste makes. */
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

/**
 * Dispatch a real bubbling `paste` so React's synthetic handler runs through
 * the actual JSX wiring — the point of these tests. Returns the event so the
 * caller can read `defaultPrevented`, i.e. whether the composer CLAIMED it.
 */
function firePaste(el: Element, data: DataTransfer): Event {
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: data });
  fireEvent(el, ev);
  return ev;
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadClipboardImage.mockReset();
  uploadClipboardImage.mockResolvedValue({
    filename: "image1.png",
    path: "/Users/dev/.maestro/data/clipboard/2026-07-23/image1.png",
    url: "",
    mimeType: "image/png",
    bytes: 42,
  });
  notifyUser.mockReturnValue("notice-1");
});

// ─── ensemble composers → server path ───────────────────────────────────────

const ensembleComposers = [
  ["spells/EnsembleMessageComposer", SpellsEnsembleComposer],
  ["spells/studio/ensemble/EnsembleMessageComposer", StudioEnsembleComposer],
] as const;

describe.each(ensembleComposers)("%s image paste", (_name, Composer) => {
  it("claims an image paste and inserts the server-side path", async () => {
    render(<Composer ensembleId="ens_1" senderSessionId="sess_a" onClose={() => {}} />);
    const textarea = screen.getByLabelText("Message body");

    const ev = firePaste(textarea, makeDataTransfer({ itemFiles: [makeFile("image.png", "image/png")] }));

    // Claimed — the browser must not also run its own paste.
    expect(ev.defaultPrevented).toBe(true);
    await waitFor(() => expect(uploadClipboardImage).toHaveBeenCalledTimes(1));
    // Uploaded under the SENDING session so the server can scope storage.
    expect(uploadClipboardImage.mock.calls[0][1]).toBe("sess_a");
    await waitFor(() =>
      expect((textarea as HTMLTextAreaElement).value).toBe(
        "/Users/dev/.maestro/data/clipboard/2026-07-23/image1.png ",
      ),
    );
  });

  it("leaves a plain-text paste to the textarea", () => {
    render(<Composer ensembleId="ens_1" senderSessionId="sess_a" onClose={() => {}} />);
    const textarea = screen.getByLabelText("Message body");

    const ev = firePaste(textarea, makeDataTransfer({ text: "some pasted text" }));

    expect(ev.defaultPrevented).toBe(false);
    expect(uploadClipboardImage).not.toHaveBeenCalled();
  });
});

// ─── Collab channel composer → staged Firebase attachment ───────────────────

describe("messaging/MessageComposer image paste", () => {
  const props = {
    channelId: "chan_1",
    channelName: "general",
    spaceId: "space_1",
    user: { uid: "user-1" } as never,
    onSend: vi.fn(async () => {}),
  };

  it("stages a pasted image as a Collab attachment instead of a local path", async () => {
    render(<MessageComposer {...props} />);
    const textarea = screen.getByPlaceholderText("Message #general");

    const ev = firePaste(textarea, makeDataTransfer({ itemFiles: [makeFile("image.png", "image/png")] }));

    expect(ev.defaultPrevented).toBe(true);
    // The attachment chip is the staged File, shown exactly as a picked file is.
    await waitFor(() => expect(screen.getByTitle("image1.png")).toBeTruthy());
    // Deliberately NOT the maestro-server route: an absolute local path is dead
    // text to a space member reading this channel from another machine.
    expect(uploadClipboardImage).not.toHaveBeenCalled();
    // Staged only — nothing is uploaded to the space until the message is sent.
    expect(shareFile).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("uploads the staged image and attaches it when the message is sent", async () => {
    render(<MessageComposer {...props} />);
    const textarea = screen.getByPlaceholderText("Message #general");

    firePaste(textarea, makeDataTransfer({ itemFiles: [makeFile("image.png", "image/png")] }));
    await waitFor(() => expect(screen.getByTitle("image1.png")).toBeTruthy());

    fireEvent.change(textarea, { target: { value: "look at this" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => expect(shareFile).toHaveBeenCalledTimes(1));
    expect(shareFile.mock.calls[0][1]).toBe("space_1");
    await waitFor(() => expect(props.onSend).toHaveBeenCalled());
    const attachments = props.onSend.mock.calls[0][2];
    expect(attachments).toEqual([
      { fileId: "file-1", name: "image1.png", mimeType: "image/png", size: 1 },
    ]);
  });

  it("leaves a plain-text paste to the textarea", () => {
    render(<MessageComposer {...props} />);
    const textarea = screen.getByPlaceholderText("Message #general");

    const ev = firePaste(textarea, makeDataTransfer({ text: "some pasted text" }));

    expect(ev.defaultPrevented).toBe(false);
    expect(screen.queryByTitle("image1.png")).toBeNull();
  });

  it("does not stage anything when the user cannot attach (signed out)", () => {
    render(<MessageComposer {...props} user={null} spaceId={undefined} />);
    const textarea = screen.getByPlaceholderText("Message #general");

    const ev = firePaste(textarea, makeDataTransfer({ itemFiles: [makeFile("image.png", "image/png")] }));

    expect(ev.defaultPrevented).toBe(false);
    expect(screen.queryByTitle("image1.png")).toBeNull();
  });
});
