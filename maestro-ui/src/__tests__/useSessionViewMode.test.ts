import { describe, expect, it } from "vitest";
import { getInitialSessionViewMode, SESSION_VIEW_MODE_KEY } from "../hooks/useSessionViewMode";

describe("getInitialSessionViewMode", () => {
  it("uses chat on narrow screens", () => {
    expect(getInitialSessionViewMode({ getItem: () => "terminal" }, true)).toBe("chat");
  });

  it("restores a valid desktop preference", () => {
    expect(getInitialSessionViewMode({ getItem: (key) => key === SESSION_VIEW_MODE_KEY ? "terminal" : null }, false)).toBe("terminal");
  });

  it("uses split when the desktop preference is absent or invalid", () => {
    expect(getInitialSessionViewMode({ getItem: () => "invalid" }, false)).toBe("split");
  });
});
