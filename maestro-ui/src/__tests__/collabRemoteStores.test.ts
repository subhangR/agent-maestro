import { describe, it, expect, beforeEach, vi } from "vitest";

// The project store persists a manual Collab repo selection through the Project
// API. Mock the REST client so we can assert the PUT payload + local mirror
// without a server.
vi.mock("../utils/MaestroClient", () => ({
  maestroClient: {
    updateProject: vi.fn(),
  },
}));

import { maestroClient } from "../utils/MaestroClient";
import { useProjectStore } from "../stores/useProjectStore";
import { useCollabSpaceStore } from "../stores/useCollabSpaceStore";
import { MaestroProject } from "../app/types/maestro";

const updateProject = maestroClient.updateProject as unknown as ReturnType<
  typeof vi.fn
>;

function project(id: string, extra?: Partial<MaestroProject>): MaestroProject {
  return {
    id,
    name: id,
    workingDir: `/work/${id}`,
    createdAt: 1,
    updatedAt: 1,
    basePath: `/work/${id}`,
    environmentId: null,
    ...extra,
  };
}

describe("useProjectStore.setProjectGithubUrl", () => {
  beforeEach(() => {
    updateProject.mockReset();
    useProjectStore.setState({ projects: [project("A"), project("B")] });
  });

  it("persists the githubUrl through PUT /projects/:id and mirrors it locally", async () => {
    updateProject.mockResolvedValue(
      project("A", { githubUrl: "https://github.com/owner/repo", updatedAt: 2 }),
    );

    await useProjectStore
      .getState()
      .setProjectGithubUrl("A", "https://github.com/owner/repo");

    expect(updateProject).toHaveBeenCalledWith("A", {
      githubUrl: "https://github.com/owner/repo",
    });
    const a = useProjectStore.getState().projects.find((p) => p.id === "A");
    expect(a?.githubUrl).toBe("https://github.com/owner/repo");
    expect(a?.updatedAt).toBe(2);
    // Only the target project changes.
    const b = useProjectStore.getState().projects.find((p) => p.id === "B");
    expect(b?.githubUrl).toBeUndefined();
  });

  it("clears the githubUrl with an empty string", async () => {
    useProjectStore.setState({
      projects: [project("A", { githubUrl: "https://github.com/owner/repo" })],
    });
    updateProject.mockResolvedValue(project("A", { githubUrl: undefined }));

    await useProjectStore.getState().setProjectGithubUrl("A", "");

    expect(updateProject).toHaveBeenCalledWith("A", { githubUrl: "" });
    const a = useProjectStore.getState().projects.find((p) => p.id === "A");
    expect(a?.githubUrl).toBeUndefined();
  });

  it("throws and does not mutate local state when the API rejects", async () => {
    updateProject.mockRejectedValue(new Error("network"));

    await expect(
      useProjectStore
        .getState()
        .setProjectGithubUrl("A", "https://github.com/owner/repo"),
    ).rejects.toThrow();

    const a = useProjectStore.getState().projects.find((p) => p.id === "A");
    expect(a?.githubUrl).toBeUndefined();
  });
});

describe("useCollabSpaceStore hydration seeding", () => {
  beforeEach(() => {
    useCollabSpaceStore.setState({ detectedRemoteByProject: {} });
  });

  it("seeds the parsed remote from a persisted githubUrl (Firebase key form)", () => {
    useCollabSpaceStore
      .getState()
      .hydrateRemoteFromProject("A", "https://github.com/owner/repo");

    const remote = useCollabSpaceStore.getState().detectedRemoteByProject["A"];
    expect(remote?.canonical).toBe("github.com/owner/repo");
    expect(remote?.host).toBe("github.com");
    expect(remote?.owner).toBe("owner");
    expect(remote?.repo).toBe("repo");
  });

  it("does not clobber an already-resolved remote (detection or a manual change wins)", () => {
    useCollabSpaceStore
      .getState()
      .hydrateRemoteFromProject("A", "https://github.com/owner/first");
    useCollabSpaceStore
      .getState()
      .hydrateRemoteFromProject("A", "https://github.com/owner/second");

    expect(
      useCollabSpaceStore.getState().detectedRemoteByProject["A"]?.canonical,
    ).toBe("github.com/owner/first");
  });

  it("is a no-op for an empty/absent githubUrl (falls through to git detection)", () => {
    useCollabSpaceStore.getState().hydrateRemoteFromProject("A", "");
    useCollabSpaceStore.getState().hydrateRemoteFromProject("A", undefined);

    expect(
      useCollabSpaceStore.getState().detectedRemoteByProject["A"],
    ).toBeUndefined();
  });

  it("setDetectedRemote overwrites the cache after a manual save succeeds", () => {
    useCollabSpaceStore
      .getState()
      .hydrateRemoteFromProject("A", "https://github.com/owner/first");
    useCollabSpaceStore.getState().setDetectedRemote("A", {
      host: "github.com",
      owner: "owner",
      repo: "second",
      canonical: "github.com/owner/second",
    });

    expect(
      useCollabSpaceStore.getState().detectedRemoteByProject["A"]?.canonical,
    ).toBe("github.com/owner/second");
  });
});
