import { beforeEach, describe, expect, it, vi } from "vitest";

const { validateDirectory, updateProject, detectGitRemote } = vi.hoisted(() => ({
  validateDirectory: vi.fn(),
  updateProject: vi.fn(),
  detectGitRemote: vi.fn(),
}));

vi.mock("../platform", () => ({
  platform: { fs: { validateDirectory } },
}));

vi.mock("../utils/MaestroClient", () => ({
  maestroClient: { updateProject },
}));

vi.mock("../utils/detectGitRemote", () => ({ detectGitRemote }));

import { useProjectDialogStore } from "../stores/useProjectDialogStore";
import { useProjectStore } from "../stores/useProjectStore";
import { useCollabSpaceStore } from "../stores/useCollabSpaceStore";

const PROJECT_ID = "project-1";
const OLD_DIRECTORY = "/work/project-one";
const NEW_DIRECTORY = "/work/renamed-project";

describe("project rename working directory", () => {
  beforeEach(() => {
    validateDirectory.mockReset();
    updateProject.mockReset();
    detectGitRemote.mockReset();
    useProjectStore.setState({
      activeProjectId: PROJECT_ID,
      projects: [
        {
          id: PROJECT_ID,
          name: "Project One",
          workingDir: OLD_DIRECTORY,
          basePath: OLD_DIRECTORY,
          createdAt: 1,
          updatedAt: 1,
          environmentId: null,
        },
      ],
    });
    useProjectDialogStore.setState({
      projectOpen: true,
      projectMode: "rename",
      projectTitle: "Renamed Project",
      projectBasePath: NEW_DIRECTORY,
      projectEnvironmentId: "",
      projectAssetsEnabled: true,
      projectSoundInstrument: "piano",
      projectSoundConfig: undefined,
    });
    useCollabSpaceStore.setState({
      detectedRemoteByProject: {},
      detectionLoading: {},
    });
  });

  it("mirrors a successful move to workingDir so Collab detects the remote in the new folder", async () => {
    validateDirectory.mockResolvedValue(NEW_DIRECTORY);
    updateProject.mockResolvedValue({
      id: PROJECT_ID,
      name: "Renamed Project",
      workingDir: NEW_DIRECTORY,
      createdAt: 2,
      updatedAt: 2,
    });
    detectGitRemote.mockResolvedValue(null);

    await useProjectStore.getState().onProjectSubmit({ preventDefault: vi.fn() } as any);

    expect(updateProject).toHaveBeenCalledWith(PROJECT_ID, {
      name: "Renamed Project",
      workingDir: NEW_DIRECTORY,
    });
    const renamedProject = useProjectStore.getState().projects[0];
    expect(renamedProject).toMatchObject({
      name: "Renamed Project",
      workingDir: NEW_DIRECTORY,
      basePath: NEW_DIRECTORY,
    });

    await useCollabSpaceStore.getState().detectRemote(renamedProject.id, renamedProject.workingDir);

    expect(detectGitRemote).toHaveBeenCalledWith(NEW_DIRECTORY);
  });
});
