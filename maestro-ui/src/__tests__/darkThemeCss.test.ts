// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STYLE_THEMES } from "../app/constants/themes";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const redesignCss = fs.readFileSync(
  path.resolve(testDir, "..", "styles-maestro-redesign.css"),
  "utf8",
);

function declarationsFor(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = redesignCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  if (!match) throw new Error(`Missing CSS block for ${selector}`);

  return new Map(
    [...match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((entry) => [
      entry[1],
      entry[2].trim(),
    ]),
  );
}

function luminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("redesign dark theme", () => {
  const tokens = declarationsFor("html[data-redesign][data-redesign][data-theme='dark']");

  it("overrides the complete surface and text palette", () => {
    const requiredTokens = [
      "--pn-paper",
      "--pn-surface",
      "--pn-card",
      "--pn-canvas",
      "--pn-hover",
      "--pn-line",
      "--pn-line-2",
      "--pn-ink",
      "--pn-ink-2",
      "--pn-ink-3",
      "--pn-ink-4",
      "--pn-muted",
      "--pn-faint",
    ];

    for (const token of requiredTokens) {
      expect(tokens.get(token), `${token} must have a dark override`).toBeTruthy();
    }
  });

  it("keeps every chat text tier readable on every dark surface", () => {
    const textTokens = ["--pn-ink", "--pn-ink-2", "--pn-ink-3", "--pn-ink-4"];
    const surfaceTokens = ["--pn-paper", "--pn-surface", "--pn-card", "--pn-canvas", "--pn-hover"];

    for (const textToken of textTokens) {
      for (const surfaceToken of surfaceTokens) {
        const ratio = contrastRatio(tokens.get(textToken)!, tokens.get(surfaceToken)!);
        expect(
          ratio,
          `${textToken} on ${surfaceToken} has ${ratio.toFixed(2)}:1 contrast`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("uses a readable foreground on every selectable dark accent", () => {
    const foreground = tokens.get("--pn-on-accent")!;
    for (const style of Object.values(STYLE_THEMES)) {
      for (const variant of style.variants) {
        const ratio = contrastRatio(foreground, variant.colors.primary);
        expect(
          ratio,
          `${style.styleId}/${variant.key} has ${ratio.toFixed(2)}:1 accent contrast`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
