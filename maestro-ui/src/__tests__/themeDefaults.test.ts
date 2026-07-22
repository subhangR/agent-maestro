import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_STYLE_ID,
  DEFAULT_THEME_ID,
} from "../app/constants/themes";
import {
  STORAGE_STYLE_KEY,
  STORAGE_THEME_KEY,
} from "../app/constants/defaults";
import { initTheme, useThemeStore } from "../stores/useThemeStore";

describe("glass theme defaults", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-style");
    document.documentElement.removeAttribute("style");
    useThemeStore.getState().setStyleAndColor("glass", "frost");
  });

  it("uses glass frost as the product default", () => {
    expect(DEFAULT_STYLE_ID).toBe("glass");
    expect(DEFAULT_THEME_ID).toBe("glass-frost");
  });

  it("applies the glass default and its palette to the document", () => {
    initTheme();

    const root = document.documentElement;
    expect(root.dataset.style).toBe("glass");
    expect(root.style.getPropertyValue("--theme-primary")).toBe("#7dd3fc");
    expect(root.style.getPropertyValue("--theme-primary-rgb")).toBe("125, 211, 252");
  });

  it("propagates a selected glass palette and persists it", () => {
    useThemeStore.getState().setColor("lavender");

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--theme-primary")).toBe("#c4b5fd");
    expect(root.style.getPropertyValue("--theme-primary-dim")).toBe("#a78bfa");
    expect(root.style.getPropertyValue("--theme-primary-rgb")).toBe("196, 181, 253");
    expect(localStorage.getItem(STORAGE_STYLE_KEY)).toBe("glass");
    expect(localStorage.getItem(STORAGE_THEME_KEY)).toBe("glass-lavender");
  });
});
