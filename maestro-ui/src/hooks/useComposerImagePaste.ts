/**
 * Image paste / drop for a plain <textarea> prompt or chat composer.
 *
 * Mirrors the terminal's universal bridge, but the injection target is a text
 * field instead of a PTY: a pasted screenshot is uploaded to the server and the
 * returned ABSOLUTE SERVER-SIDE path is inserted at the caret, so the agent the
 * composer talks to can Read the image by path. Plain-text paste is left to the
 * browser's native textarea handling — we only CLAIM image pastes.
 *
 * Returns handlers to spread onto the textarea (`onPaste`, `onDrop`,
 * `onDragOver`). No IS_TAURI branch: `extractImageFiles` + the native events
 * work identically in WKWebView and every browser.
 */
import { useCallback, useRef } from "react";
import { extractImageFiles, dataTransferHasFiles } from "../utils/clipboardImages";
import { uploadClipboardImage } from "../utils/clipboardUpload";
import { notifyUser, dismissNotice } from "../utils/notify";

interface ComposerImagePasteOptions {
  /** Live textarea value. */
  value: string;
  /** Setter for the textarea value. */
  setValue: (next: string) => void;
  /** The textarea element, for caret position + focus restore. */
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Session the image belongs to (server may scope storage by it). */
  sessionId?: string;
  /** When true, paste/drop is ignored (composer disabled/sending). */
  disabled?: boolean;
}

/** Splice `insert` into `value` at [start,end); returns the new value + caret. */
function spliceAtSelection(
  value: string,
  start: number,
  end: number,
  insert: string,
): { next: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  // Keep a single space between an existing word and the path, and after it, so
  // the path is always its own whitespace-delimited token.
  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
  const glued = `${needsLeadingSpace ? " " : ""}${insert}`;
  const next = `${before}${glued}${after}`;
  return { next, caret: before.length + glued.length };
}

export function useComposerImagePaste(options: ComposerImagePasteOptions) {
  // Refs so the stable callbacks always read the latest value/options without
  // re-subscribing listeners on every keystroke.
  const optsRef = useRef(options);
  optsRef.current = options;

  const acceptImages = useCallback(async (files: File[]) => {
    const { sessionId } = optsRef.current;
    if (files.length === 0) return;

    const label = files.length === 1 ? "image" : `${files.length} images`;
    const progressId = notifyUser(`Uploading ${label}…`, "info", sessionId ?? null);

    const paths: string[] = [];
    try {
      for (const file of files) {
        const result = await uploadClipboardImage(file, sessionId);
        paths.push(result.path);
      }
    } catch (err) {
      dismissNotice(progressId);
      notifyUser(err instanceof Error ? err.message : "Image upload failed.", "warn", sessionId ?? null);
      return;
    }

    dismissNotice(progressId);
    if (paths.length === 0) return;

    // Re-read the LIVE value: the user may have kept typing while the upload
    // was in flight, so a stale closure value would clobber their edits.
    const { value, setValue, inputRef } = optsRef.current;
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const injection = paths.join(" ");
    const { next, caret } = spliceAtSelection(value, start, end, injection);
    setValue(next);

    // Restore the caret just after the inserted path(s), on the next frame so
    // React has committed the new value to the textarea.
    requestAnimationFrame(() => {
      const node = optsRef.current.inputRef.current;
      if (!node) return;
      node.focus();
      try {
        node.setSelectionRange(caret, caret);
      } catch {
        // Detached / unsupported — focus alone is fine.
      }
    });
  }, []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (optsRef.current.disabled) return;
      const images = extractImageFiles(e.clipboardData, { renameAll: true });
      if (images.length === 0) return; // plain text → native textarea paste
      e.preventDefault();
      void acceptImages(images);
    },
    [acceptImages],
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    if (optsRef.current.disabled) return;
    if (dataTransferHasFiles(e.dataTransfer)) e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      if (optsRef.current.disabled) return;
      const images = extractImageFiles(e.dataTransfer, { renameAll: true });
      if (images.length === 0) return;
      e.preventDefault();
      void acceptImages(images);
    },
    [acceptImages],
  );

  return { onPaste, onDrop, onDragOver };
}
