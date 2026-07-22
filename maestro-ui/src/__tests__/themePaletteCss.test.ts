// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const redesignCss = fs.readFileSync(
  path.resolve(testDir, "..", "styles-maestro-redesign.css"),
  "utf8",
);

describe("redesign palette bridge", () => {
  it("derives redesign accents from the selected app palette", () => {
    expect(redesignCss).toContain("--pn-brand:      var(--theme-primary-dim)");
    expect(redesignCss).toContain("--pn-brand-2:    var(--theme-primary)");
    expect(redesignCss).toContain("--pn-brand-soft: rgba(var(--theme-primary-rgb), 0.12)");
    expect(redesignCss).toContain("--pn-run:        var(--theme-primary-dim)");
  });

  it("does not pin interactive accents to the previous green palette", () => {
    expect(redesignCss).not.toMatch(
      /#(?:2c7a54|38a06b|4fb07a|5cb381|e3efe6)|rgba\(\s*(?:44\s*,\s*122\s*,\s*84|79\s*,\s*176\s*,\s*122)/i,
    );
  });
});
