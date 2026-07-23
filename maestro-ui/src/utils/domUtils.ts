import { notifyUser } from "./notify";

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

/**
 * Copy text to the clipboard — in ANY browser, on ANY origin.
 *
 * `navigator.clipboard` only exists in a SECURE CONTEXT (https or localhost).
 * Maestro is routinely served over plain http on a LAN address, so on those
 * deployments the async Clipboard API is simply `undefined`; and even where it
 * exists, `writeText()` rejects with NotAllowedError when the document isn't
 * focused. Depending on it alone is why copy used to be a silent no-op.
 *
 * So: try the modern API as an OPTIMIZATION, then fall back to a hidden
 * textarea + `document.execCommand('copy')`. The fallback is user-gesture
 * based, needs no permission prompt and no TLS, and works everywhere —
 * including WKWebView, which is what Tauri renders in. Both environments run
 * this same code; there is deliberately no IS_TAURI branch.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    const value = text ?? "";
    if (!value) return false;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Insecure origin (undefined), or NotAllowedError without focus — fall through.
    }

    return copyViaExecCommand(value);
}

/**
 * Legacy-but-universal copy path: select the text inside an offscreen textarea
 * and ask the document to copy the current selection.
 *
 * Focus is restored to whatever held it before (usually xterm's hidden
 * textarea) — otherwise copying would silently steal keyboard input from the
 * terminal the user just copied from.
 */
function copyViaExecCommand(value: string): boolean {
    if (typeof document === "undefined" || !document.body) return false;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    // `position: fixed` at the viewport origin stops the page from scrolling
    // when the textarea takes focus; the rest keeps it invisible.
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.width = "1px";
    ta.style.height = "1px";
    ta.style.padding = "0";
    ta.style.border = "none";
    ta.style.outline = "none";
    ta.style.boxShadow = "none";
    ta.style.background = "transparent";
    ta.style.opacity = "0";
    document.body.appendChild(ta);

    let copied = false;
    try {
      ta.focus();
      ta.select();
      // iOS Safari ignores select() on a readonly textarea; a DOM Range plus an
      // explicit selection range is the portable way to get a live selection.
      try {
        const range = document.createRange();
        range.selectNodeContents(ta);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch {
        // Range APIs unavailable — select() above already covers desktop.
      }
      ta.setSelectionRange?.(0, value.length);
      copied = document.execCommand?.("copy") === true;
    } catch {
      copied = false;
    } finally {
      ta.remove();
      try {
        previouslyFocused?.focus?.();
      } catch {
        // Element detached while we were copying.
      }
    }

    return copied;
}

/**
 * Copy plus user-visible outcome. Never a silent no-op: when BOTH clipboard
 * paths fail the user gets a toast instead of nothing happening at all.
 */
export async function copyToClipboardOrWarn(text: string, label = "Text"): Promise<boolean> {
    const value = text ?? "";
    if (!value) return false;

    const ok = await copyToClipboard(value);
    if (!ok) {
      notifyUser(`${label} could not be copied — the browser blocked clipboard access.`, "warn");
    }
    return ok;
}
