import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../firebase/CollabSpaceClient", () => ({
  CollabSpaceClient: {
    subscribeToAllForUser: vi.fn(() => vi.fn()),
  },
}));

vi.mock("../firebase/SpaceShareClient", () => ({
  SpaceShareClient: {
    shareTask: vi.fn(),
    shareTeamMember: vi.fn(),
    shareSpell: vi.fn(),
    shareDoc: vi.fn(),
  },
}));

vi.mock("../utils/MaestroClient", () => ({
  maestroClient: {
    getProjectDocs: vi.fn(),
  },
}));

import { ShareToSpaceModal, SharePayload } from "../components/share/ShareToSpaceModal";
import { CollabSpace } from "../firebase/collabSpaceTypes";
import { SpaceShareClient } from "../firebase/SpaceShareClient";
import { maestroClient } from "../utils/MaestroClient";
import { useFirebaseAuthStore } from "../stores/useFirebaseAuthStore";
import { useJoinedSpacesStore } from "../stores/useJoinedSpacesStore";
import { useProjectStore } from "../stores/useProjectStore";

const user = { uid: "user-1" } as any;
const timestamp = { toMillis: () => 1 } as any;

function space(id: string, githubUrl: string): CollabSpace {
  return {
    id,
    name: id === "alpha-space" ? "Alpha Space" : "Beta Space",
    description: "",
    githubUrl,
    githubHost: "github.com",
    githubOwner: "owner",
    githubRepo: id,
    visibility: "private",
    ownerId: user.uid,
    memberIds: [user.uid],
    members: {
      [user.uid]: {
        uid: user.uid,
        displayName: "User",
        email: "user@example.com",
        photoUrl: null,
        role: "owner",
        joinedAt: timestamp,
      },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const taskPayload: SharePayload = {
  kind: "task",
  entityLabel: "Task",
  data: {
    title: "Task",
    description: "",
    status: "todo",
    priority: "medium",
    sourceTaskId: "task-1",
    sourceProjectId: "alpha",
  },
};

const teamMemberPayload: SharePayload = {
  kind: "team-member",
  entityLabel: "Member",
  data: {
    name: "Member",
    role: "Engineer",
    identity: "Identity",
    avatar: null,
    model: null,
    agentTool: null,
    mode: null,
    skillIds: [],
    commandPermissions: {},
    sourceTeamMemberId: "member-1",
    sourceProjectId: "alpha",
  },
};

const spellPayload: SharePayload = {
  kind: "spell",
  entityLabel: "Spell",
  data: {
    name: "Spell",
    description: "",
    body: "",
    color: "blue" as any,
    rules: [],
    icon: null,
    sourceSpellId: "spell-1",
    sourceProjectId: null,
  },
};

function renderModal(payload: SharePayload) {
  return render(<ShareToSpaceModal payload={payload} onClose={vi.fn()} />);
}

describe("ShareToSpaceModal repository scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFirebaseAuthStore.setState({ user });
    useProjectStore.setState({
      activeProjectId: "alpha",
      projects: [
        {
          id: "alpha",
          name: "Alpha",
          workingDir: "/work/alpha",
          createdAt: 1,
          updatedAt: 1,
          environmentId: null,
          githubUrl: "https://github.com/owner/alpha",
        },
      ],
    });
    useJoinedSpacesStore.setState({
      spaces: [
        space("alpha-space", "github.com/owner/alpha"),
        space("beta-space", "github.com/owner/beta"),
      ],
      loading: false,
      error: null,
      uid: user.uid,
      unsub: vi.fn(),
    });
    (maestroClient.getProjectDocs as any).mockResolvedValue([
      {
        id: "doc-1",
        title: "Plan",
        filePath: "/work/alpha/plan.md",
        kind: "markdown",
        content: "# Plan",
        addedAt: 1,
      },
    ]);
  });

  it.each([
    ["task", taskPayload, "Share task", "shareTask"],
    ["team member", teamMemberPayload, "Publish", "shareTeamMember"],
    ["spell", spellPayload, "Publish", "shareSpell"],
  ] as const)(
    "only publishes a %s to the active project's repository",
    async (_kind, payload, action, method) => {
      renderModal(payload);

      expect(screen.getByRole("button", { name: /^Alpha Space/ })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^Beta Space/ })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /^Alpha Space/ }));
      fireEvent.click(screen.getByRole("button", { name: action }));

      await waitFor(() => {
        expect((SpaceShareClient as any)[method]).toHaveBeenCalledWith(
          user,
          "alpha-space",
          expect.any(Object),
        );
      });
      expect((SpaceShareClient as any)[method]).not.toHaveBeenCalledWith(
        user,
        "beta-space",
        expect.any(Object),
      );
    },
  );

  it("only shares a project doc to the active project's repository", async () => {
    renderModal({ kind: "doc" });

    fireEvent.click(await screen.findByRole("button", { name: "Share doc Plan" }));
    expect(screen.queryByRole("button", { name: /^Beta Space/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Alpha Space/ }));
    fireEvent.click(screen.getByRole("button", { name: "Share doc" }));

    await waitFor(() => {
      expect(SpaceShareClient.shareDoc).toHaveBeenCalledWith(
        user,
        "alpha-space",
        expect.objectContaining({ sourceDocId: "doc-1", sourceProjectId: "alpha" }),
      );
    });
  });

  it("fails closed when the active project has no durable GitHub binding", () => {
    useProjectStore.setState({
      projects: [
        {
          id: "alpha",
          name: "Alpha",
          workingDir: "/work/alpha",
          createdAt: 1,
          updatedAt: 1,
          environmentId: null,
        },
      ],
    });

    renderModal(taskPayload);

    expect(screen.queryByRole("button", { name: /^Alpha Space/ })).toBeNull();
    expect(screen.getByText(/connect a canonical github repository/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Share task" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
