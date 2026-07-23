// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(
  path.resolve(testDir, "../components/app/AppWorkspace.tsx"),
  "utf8",
);

describe("AppWorkspace Collab Space selection", () => {
  it("yields the Collab Space pane while inspecting a selected session", () => {
    // Selecting a stopped session opens SessionStatsView without changing the
    // active Collab Space ID. The space must not stay mounted beside it.
    expect(workspaceSource).toContain(
      "{!hasInspectedSession && isActiveCollab && activeCollabSpaceId && (",
    );
  });
});
