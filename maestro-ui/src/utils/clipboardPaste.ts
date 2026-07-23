/**
 * Universal paste/drop dispatcher.
 *
 * The native `paste` DOM event (and a file `drop`) is the one clipboard read
 * path that works in EVERY browser, on ANY origin, with no permission prompt:
 * `event.clipboardData` / `event.dataTransfer` carries `text/plain` AND image
 * blobs together, needing neither a secure context nor `navigator.clipboard`
 * (which Safari & Firefox don't expose to scripts anyway).
 *
 * This module contains the pure classification + routing logic so it can be
 * unit-tested without a live terminal, an upload server, or a DOM event. The
 * SessionTerminal / chat-composer wiring supplies the side-effecting handlers.
 */
import { extractImageFiles } from "./clipboardImages";

export interface ClipboardDispatchHandlers {
  /** Plain text — e.g. `term.paste(text)` (bracketed) or insert at a cursor. */
  onText: (text: string) => void;
  /** One or more image Files — upload each, then inject its server path. */
  onImages: (files: File[]) => void;
}

export type ClipboardDispatchKind = "images" | "text" | "none";

export interface ClipboardDispatchResult {
  kind: ClipboardDispatchKind;
  /** True when a handler ran — the caller should `preventDefault()`. */
  handled: boolean;
  /** How many image files were routed to `onImages` (0 for text/none). */
  imageCount: number;
}

export interface ClipboardDispatchOptions {
  /** First index for sequence-renaming generic clipboard image names. */
  imageStartIndex?: number;
}

/**
 * Classify a DataTransfer and route it to exactly one handler.
 *
 * IMAGES WIN over text when both are present: a pasted screenshot frequently
 * carries a decorative `text/plain` label alongside the blob, and the user's
 * intent is the image. Only when there is no image do we fall through to text.
 * Returns what happened so the caller can decide whether to preventDefault.
 */
export function dispatchClipboardData(
  data: DataTransfer | null,
  handlers: ClipboardDispatchHandlers,
  options: ClipboardDispatchOptions = {},
): ClipboardDispatchResult {
  if (!data) return { kind: "none", handled: false, imageCount: 0 };

  const images = extractImageFiles(data, {
    startIndex: options.imageStartIndex ?? 1,
    renameAll: true,
  });

  if (images.length > 0) {
    handlers.onImages(images);
    return { kind: "images", handled: true, imageCount: images.length };
  }

  const text = data.getData?.("text/plain") ?? "";
  if (text) {
    handlers.onText(text);
    return { kind: "text", handled: true, imageCount: 0 };
  }

  return { kind: "none", handled: false, imageCount: 0 };
}
