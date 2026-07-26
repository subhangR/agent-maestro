import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// The manual "set repository" flow persists through the Project API. Mock the
// REST client so we can assert whether a PUT happened (or didn't) without a
// server, exactly like collabRemoteStores.test.ts.
vi.mock("../utils/MaestroClient", () => ({
  maestroClient: {
    updateProject: vi.fn(),
  },
}));

// Space-list subscriptions go through Firestore, which isn't configured in
// this test env and is unrelated to the manual-remote-save behavior under
// test here; stub it out so mounting the signed-in tree doesn't reach it.
vi.mock("../firebase/CollabSpaceClient", () => ({
  CollabSpaceClient: {
    subscribeToRepo: vi.fn(() => () => {}),
    create: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
  },
}));

import { maestroClient } from "../utils/MaestroClient";
import {
  CollabSpacePanel,
  classifyGithubUrlSaveError,
} from "../components/maestro/CollabSpacePanel";
import { useFirebaseAuthStore } from "../stores/useFirebaseAuthStore";
import { useCollabSpaceStore } from "../stores/useCollabSpaceStore";

const updateProject = maestroClient.updateProject as unknown as ReturnType<
  typeof vi.fn
>;

const PROJECT_ID = "proj1";
const defaultDetectRemote = useCollabSpaceStore.getState().detectRemote;

function renderPanel() {
  return render(
    <CollabSpacePanel
      projectId={PROJECT_ID}
      workingDir="/work/proj1"
      projectName="Proj One"
    />,
  );
}

/** Opens the manual-remote editor, types `raw`, and submits the form. */
async function saveManualRemote(raw: string) {
  fireEvent.click(screen.getByRole("button", { name: /link a github repo|change/i }));
  const input = screen.getByPlaceholderText(/github\.com\/owner\/repo/i);
  fireEvent.change(input, { target: { value: raw } });
  const form = input.closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
}

describe("CollabSpacePanel manual repository save", () => {
  beforeEach(() => {
    updateProject.mockReset();
    useFirebaseAuthStore.setState({
      configured: true,
      initialized: true,
      user: { uid: "u1", email: "a@b.com" } as any,
      initAuth: () => {},
      signOut: vi.fn(),
    });
    // Seed a resolved (non-undefined) cache entry so the auto-detect effect
    // is a no-op and the panel starts from a deterministic "no remote" state.
    useCollabSpaceStore.setState({
      detectedRemoteByProject: { [PROJECT_ID]: null },
      detectionLoading: {},
      mineByRepo: {},
      publicByRepo: {},
      listLoading: {},
      listError: {},
      detectRemote: defaultDetectRemote,
    });
  });

  it.each([
    ["non-https scheme", "http://github.com/owner/repo"],
    [".git suffix", "https://github.com/owner/repo.git"],
    ["trailing slash", "https://github.com/owner/repo/"],
    ["query string", "https://github.com/owner/repo?x=1"],
    ["fragment", "https://github.com/owner/repo#section"],
    ["extra path segment", "https://github.com/owner/repo/extra"],
    ["lookalike host", "https://github.com.evil.com/owner/repo"],
  ])(
    "rejects %s client-side: no PUT, cache untouched, error shown",
    async (_label, raw) => {
      renderPanel();
      await saveManualRemote(raw);

      await waitFor(() => {
        // getByRole throws if the alert is absent (or if >1 exists), so a core
        // truthiness assertion fully captures "exactly one alert is shown".
        // Avoids the jest-dom `toBeInTheDocument` matcher, which this repo's
        // canonical install does not register (hoisted @vitest/expect@1.6.1 vs
        // maestro-ui's vitest@4 — expect.extend binds the wrong instance).
        expect(screen.getByRole("alert")).toBeTruthy();
      });
      expect(updateProject).not.toHaveBeenCalled();
      expect(
        useCollabSpaceStore.getState().detectedRemoteByProject[PROJECT_ID],
      ).toBeNull();
    },
  );

  it("saves a canonical manual URL: PUTs, then updates the cache only after success", async () => {
    updateProject.mockResolvedValue({
      id: PROJECT_ID,
      name: PROJECT_ID,
      workingDir: "/work/proj1",
      createdAt: 1,
      updatedAt: 1,
      githubUrl: "https://github.com/owner/repo",
    });
    renderPanel();
    await saveManualRemote("github.com/owner/repo");

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith(PROJECT_ID, {
        githubUrl: "https://github.com/owner/repo",
      });
    });
    await waitFor(() => {
      expect(
        useCollabSpaceStore.getState().detectedRemoteByProject[PROJECT_ID]
          ?.canonical,
      ).toBe("github.com/owner/repo");
    });
  });

  it("persists an automatically detected GitHub origin onto the current project", async () => {
    const detectRemote = vi.fn().mockResolvedValue({
      host: "github.com",
      owner: "owner",
      repo: "repo",
      canonical: "github.com/owner/repo",
    });
    updateProject.mockResolvedValue({
      id: PROJECT_ID,
      name: "Proj One",
      workingDir: "/work/proj1",
      createdAt: 1,
      updatedAt: 1,
      githubUrl: "https://github.com/owner/repo",
    });
    useCollabSpaceStore.setState({
      detectedRemoteByProject: {},
      detectRemote,
    });

    renderPanel();

    await waitFor(() => {
      expect(detectRemote).toHaveBeenCalledWith(PROJECT_ID, "/work/proj1");
      expect(updateProject).toHaveBeenCalledWith(PROJECT_ID, {
        githubUrl: "https://github.com/owner/repo",
      });
    });
  });

  it("surfaces a rejected repository URL (server 4xx) as a distinct message and leaves the cache untouched", async () => {
    updateProject.mockRejectedValue(
      new Error(
        "HTTP 400: githubUrl must be a canonical GitHub repository URL (https://github.com/owner/repo)",
      ),
    );
    renderPanel();
    await saveManualRemote("github.com/owner/repo");

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /rejected by the server/i,
      );
    });
    expect(
      useCollabSpaceStore.getState().detectedRemoteByProject[PROJECT_ID],
    ).toBeNull();
  });

  it("surfaces a network failure with a distinct connection message and leaves the cache untouched", async () => {
    updateProject.mockRejectedValue(new Error("Failed to fetch"));
    renderPanel();
    await saveManualRemote("github.com/owner/repo");

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /check your connection/i,
      );
    });
    expect(
      useCollabSpaceStore.getState().detectedRemoteByProject[PROJECT_ID],
    ).toBeNull();
  });
});

describe("classifyGithubUrlSaveError", () => {
  it.each([
    ["HTTP 400: bad request", "invalid-url"],
    ["HTTP 404: not found", "invalid-url"],
    ["HTTP 422: unprocessable", "invalid-url"],
  ])("classifies %s as %s", (message, expected) => {
    expect(classifyGithubUrlSaveError(new Error(message))).toBe(expected);
  });

  it.each([
    ["HTTP 500: internal error", "network"],
    ["HTTP 503: unavailable", "network"],
    ["Failed to fetch", "network"],
    ["NetworkError when attempting to fetch resource", "network"],
  ])("classifies %s as %s", (message, expected) => {
    expect(classifyGithubUrlSaveError(new Error(message))).toBe(expected);
  });

  it("treats a non-Error rejection as network (fails safe to the connectivity message)", () => {
    expect(classifyGithubUrlSaveError("boom")).toBe("network");
    expect(classifyGithubUrlSaveError(undefined)).toBe("network");
  });
});
