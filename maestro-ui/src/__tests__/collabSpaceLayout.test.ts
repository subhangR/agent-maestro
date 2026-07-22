// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Layout contract for the Collab Space panel inside the redesign side panels.
 *
 * Regression guard for the bug where Collab content was clipped / unreachable
 * when the task-side panel (`.pn-mp`) and session-side panel (`.pn-sp`) are both
 * open at narrow desktop widths. The Collab surface renders as a
 * `.terminalContent.collabSpacePanel` flex child directly inside the `.pn-mp`
 * column, which is `display: flex; flex-direction: column; overflow: hidden`.
 *
 * In a flex column a child's `min-height` defaults to `auto`, so it cannot
 * shrink below its content height; tall Collab content then overflows and is
 * clipped by the parent `overflow: hidden` while the panel's own
 * `overflow-y: auto` never activates. The panel must instead be a bounded,
 * growable, scrollable region (`flex: 1` + `min-height: 0` + `overflow-y: auto`),
 * exactly like the working `.pn-scroll` region used by the tasks tab.
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
 * short class (`.collabSpacePanel`) from matching a longer one
 * (`.collabSpacePanelHeader`).
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

const collabCss = readCss("styles-collab-space.css");
const terminalCss = readCss("styles-terminal-theme.css");
const tokensCss = readCss("components/maestro/redesign/redesign-tokens.css");

describe("collab space panel layout contract", () => {
  const panel = ruleBody(collabCss, ".collabSpacePanel");
  const terminalContent = ruleBody(terminalCss, ".terminalContent");
  const pnMp = ruleBody(tokensCss, ".pn-mp");
  const pnSp = ruleBody(tokensCss, ".pn-sp");
  const pnShellBody = ruleBody(tokensCss, ".pn-shell-body");

  it("collab panel is a bounded, scrollable flex region (min-height:0 lets overflow-y bound)", () => {
    // The bug: without min-height:0 the panel can't shrink below its content in
    // the .pn-mp column, so content overflows and is clipped by the parent.
    expect(panel).toMatch(/min-height:\s*0/);
    expect(panel).toMatch(/overflow-y:\s*auto/);
    // Must grow to fill the column so its own scroll region spans the panel.
    expect(panel).toMatch(/flex:\s*1/);
    // Guard against a regression that pins the panel to its content height.
    expect(panel).not.toMatch(/min-height:\s*auto/);
  });

  it("terminalContent preserves a horizontal min-width:0 so narrow widths don't force overflow", () => {
    // Keeps Collab content from pushing the panel wider than its column when
    // both side panels are open at narrow desktop widths.
    expect(terminalContent).toMatch(/min-width:\s*0/);
  });

  it("both side panels are bounded columns that clip (so their children own the scroll)", () => {
    for (const rule of [pnMp, pnSp]) {
      expect(rule).toMatch(/display:\s*flex/);
      expect(rule).toMatch(/flex-direction:\s*column/);
      expect(rule).toMatch(/min-height:\s*0/);
      expect(rule).toMatch(/overflow:\s*hidden/);
      // Fixed-width rails that never grow to steal the other panel's width.
      expect(rule).toMatch(/flex:\s*0\s+0\s+auto/);
    }
  });

  it("the shell body is a horizontal flex row that can shrink (dual-panel row)", () => {
    expect(pnShellBody).toMatch(/display:\s*flex/);
    expect(pnShellBody).toMatch(/min-height:\s*0/);
  });
});
