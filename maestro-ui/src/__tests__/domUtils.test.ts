import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sleep, copyToClipboard, copyToClipboardOrWarn } from "../utils/domUtils";
import { useSpellNotificationsStore } from "../stores/useSpellNotificationsStore";

describe("sleep", () => {
  it("resolves after the specified delay", async () => {
    vi.useFakeTimers();
    const promise = sleep(100);
    vi.advanceTimersByTime(100);
    await promise;
    vi.useRealTimers();
  });
});

/** Remove navigator.clipboard entirely — this is what a non-secure origin looks like. */
function withoutClipboardApi() {
  Object.defineProperty(navigator, "clipboard", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

function withClipboardApi(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

describe("copyToClipboard", () => {
  beforeEach(() => {
    useSpellNotificationsStore.getState().clearHistory();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false for empty string", async () => {
    expect(await copyToClipboard("")).toBe(false);
  });

  // ---- Branch 1: the modern async Clipboard API (secure origin) ------------

  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    withClipboardApi(writeText);
    const execCommand = vi.fn().mockReturnValue(true);
    (document as any).execCommand = execCommand;

    expect(await copyToClipboard("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    // The fallback must NOT run when the modern API already succeeded.
    expect(execCommand).not.toHaveBeenCalled();
  });

  // ---- Branch 2: the execCommand fallback (insecure origin / no focus) -----

  it("falls back to execCommand when navigator.clipboard is undefined", async () => {
    // The plain-http LAN case: navigator.clipboard simply does not exist.
    withoutClipboardApi();
    const execCommand = vi.fn().mockReturnValue(true);
    (document as any).execCommand = execCommand;

    expect(await copyToClipboard("lan-origin text")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand when writeText rejects (NotAllowedError)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    withClipboardApi(writeText);
    const execCommand = vi.fn().mockReturnValue(true);
    (document as any).execCommand = execCommand;

    expect(await copyToClipboard("hello")).toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false only when BOTH paths fail", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    withClipboardApi(writeText);
    (document as any).execCommand = vi.fn().mockReturnValue(false);

    expect(await copyToClipboard("hello")).toBe(false);
  });

  it("leaves no stray textarea in the DOM and restores focus", async () => {
    withoutClipboardApi();
    (document as any).execCommand = vi.fn().mockReturnValue(true);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await copyToClipboard("hello");

    expect(document.querySelectorAll("textarea").length).toBe(0);
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});

describe("copyToClipboardOrWarn", () => {
  beforeEach(() => {
    useSpellNotificationsStore.getState().clearHistory();
  });

  it("does not notify when the copy succeeds", async () => {
    withClipboardApi(vi.fn().mockResolvedValue(undefined));

    expect(await copyToClipboardOrWarn("hello", "Selection")).toBe(true);
    expect(useSpellNotificationsStore.getState().toasts).toHaveLength(0);
  });

  it("surfaces a warn toast instead of failing silently", async () => {
    withClipboardApi(vi.fn().mockRejectedValue(new Error("denied")));
    (document as any).execCommand = vi.fn().mockReturnValue(false);

    expect(await copyToClipboardOrWarn("hello", "Selection")).toBe(false);

    const { toasts } = useSpellNotificationsStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].level).toBe("warn");
    expect(toasts[0].message).toContain("Selection");
  });
});
