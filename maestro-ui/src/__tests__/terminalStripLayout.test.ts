// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Layout contract for the session-log terminal strip.
 *
 * Regression guard for the bug where the strip was rendered as a vertical rail
 * `position: absolute` on the LEFT edge of the terminal (z-index overlay),
 * painting over xterm text. The strip must instead be a horizontal row that
 * sits ABOVE the terminal in normal flex flow, and the terminal must live in
 * its own positioned, flexible region below it.
 *
 * jsdom does not run a layout engine, so we assert the layout contract against
 * the CSS source directly rather than computed geometry.
 */
const testDir = path.dirname(fileURLToPath(import.meta.url));

function readCss(rel: string): string {
  return fs.readFileSync(path.resolve(testDir, "..", rel), "utf8");
}

/**
 * Return the declaration body of the first rule whose selector ends in
 * `selector` immediately followed by `{`. The trailing `\s*\{` guard prevents a
 * short class (`.termStrip`) from matching a longer one (`.termStripBar`).
 */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped + "\\s*\\{");
  const m = re.exec(css);
  if (!m) return "";
  const start = css.indexOf("{", m.index);
  const end = css.indexOf("}", start);
  return css.slice(start + 1, end);
}

const sessionLogCss = readCss("styles-session-log.css");
const layoutCss = readCss("styles-update-banner.css");

describe("session-log strip layout contract", () => {
  const strip = ruleBody(sessionLogCss, ".termStrip");
  const bar = ruleBody(sessionLogCss, ".termStripBar");
  const toggle = ruleBody(sessionLogCss, ".termStripToggle");
  const label = ruleBody(sessionLogCss, ".termStripLabel");
  const railInner = ruleBody(sessionLogCss, ".termStripRailInner");
  const actions = ruleBody(sessionLogCss, ".termStripActions");
  const overlay = ruleBody(sessionLogCss, ".termStripOverlay");
  const restore = ruleBody(sessionLogCss, ".termStripRestore");
  const pane = ruleBody(layoutCss, ".terminalPane");
  const deck = ruleBody(layoutCss, ".terminalDeck");

  it("strip is not an overlay (no absolute/fixed positioning)", () => {
    expect(strip).not.toMatch(/position:\s*absolute/);
    expect(strip).not.toMatch(/position:\s*fixed/);
  });

  it("strip participates in normal flow as a non-growing flex row", () => {
    expect(strip).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it("strip bar is a horizontal row, not a fixed-width vertical rail", () => {
    expect(bar).toMatch(/flex-direction:\s*row/);
    expect(bar).not.toMatch(/flex-direction:\s*column/);
    // The old vertical rail pinned itself to a 48px column width.
    expect(bar).not.toMatch(/width:\s*48px/);
  });

  it("terminal pane stacks the strip above the terminal deck (column flow)", () => {
    expect(pane).toMatch(/display:\s*flex/);
    expect(pane).toMatch(/flex-direction:\s*column/);
  });

  it("terminal deck is a positioned, flexible region that hosts xterm below the strip", () => {
    expect(deck).toMatch(/position:\s*relative/);
    expect(deck).toMatch(/flex:\s*1/);
    expect(deck).toMatch(/min-height:\s*0/);
  });

  it("toggle is a horizontal control, not a fixed-width vertical button", () => {
    expect(toggle).toMatch(/flex-direction:\s*row/);
    expect(toggle).not.toMatch(/flex-direction:\s*column/);
    // The old vertical rail pinned the toggle to a 40px column.
    expect(toggle).not.toMatch(/width:\s*40px/);
  });

  it("the 'Session Log' label reads left-to-right (no vertical writing mode)", () => {
    expect(label).not.toMatch(/writing-mode/);
    expect(label).not.toMatch(/text-orientation/);
  });

  it("stats rail lays out in a row and scrolls on the x axis", () => {
    expect(railInner).toMatch(/flex-direction:\s*row/);
    expect(railInner).not.toMatch(/flex-direction:\s*column/);
    expect(railInner).toMatch(/overflow-x:\s*auto/);
  });

  it("action buttons lay out in a row", () => {
    expect(actions).toMatch(/flex-direction:\s*row/);
    expect(actions).not.toMatch(/flex-direction:\s*column/);
  });

  it("expanded transcript drops down (full width, capped height, top border) — not a right-opening rail", () => {
    expect(overlay).toMatch(/width:\s*100%/);
    expect(overlay).toMatch(/max-height:/);
    expect(overlay).toMatch(/border-top:/);
    expect(overlay).not.toMatch(/border-left:/);
    expect(overlay).not.toMatch(/height:\s*100%/);
  });

  it("a compact restore control exists in normal flow (not an overlay)", () => {
    expect(restore).not.toMatch(/position:\s*absolute/);
    expect(restore).not.toMatch(/position:\s*fixed/);
    expect(restore).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it("no rule anywhere reinstates the old vertical rail (writing-mode / 42px column)", () => {
    expect(sessionLogCss).not.toMatch(/writing-mode:\s*vertical/);
    expect(sessionLogCss).not.toMatch(/width:\s*42px/);
    expect(sessionLogCss).not.toMatch(/min-width:\s*42px/);
  });
});
