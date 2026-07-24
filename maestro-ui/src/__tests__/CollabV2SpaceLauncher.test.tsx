import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollabV2SpaceLauncher } from "../components/collab-workspace/CollabV2SpaceLauncher";

const spaces = [
    { id: "018f3e11-2c4d-7a40-a9d6-space000001", name: "Design", description: "Design decisions" },
    { id: "018f3e11-2c4d-7a40-a9d6-space000002", name: "Platform", description: "Platform delivery" },
];

describe("CollabV2SpaceLauncher", () => {
    it("loads V2 spaces, shows opaque IDs, and passes only the selected V2 id to the workspace", async () => {
        const renderWorkspace = vi.fn((spaceId: string) => <p>Workspace: {spaceId}</p>);
        render(<CollabV2SpaceLauncher api={{ listSpaces: vi.fn().mockResolvedValue(spaces), createSpace: vi.fn() }} renderWorkspace={renderWorkspace} />);

        expect(screen.getByText("Loading Collab V2 spaces…")).toBeTruthy();
        await screen.findByRole("button", { name: /Design/i });
        expect(screen.getByLabelText(`V2 space ID: ${spaces[0].id}`)).toBeTruthy();
        expect(screen.getByText(`Workspace: ${spaces[0].id}`)).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: /Platform/i }));
        expect(screen.getByText(`Workspace: ${spaces[1].id}`)).toBeTruthy();
        expect(renderWorkspace).toHaveBeenLastCalledWith(spaces[1].id);
    });

    it("renders an actionable fetch error and retries", async () => {
        const listSpaces = vi.fn().mockRejectedValueOnce(new Error("forbidden")).mockResolvedValueOnce(spaces);
        render(<CollabV2SpaceLauncher api={{ listSpaces, createSpace: vi.fn() }} renderWorkspace={(id) => <p>{id}</p>} />);

        expect((await screen.findByRole("alert")).textContent).toContain("forbidden");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        await waitFor(() => expect(screen.getByLabelText(`V2 space ID: ${spaces[0].id}`)).toBeTruthy());
        expect(listSpaces).toHaveBeenCalledTimes(2);
    });

    it("creates a first space, selects it, and loads its workspace", async () => {
        const created = { id: spaces[0].id };
        const listSpaces = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([spaces[0]]);
        const createSpace = vi.fn().mockResolvedValue(created);
        render(<CollabV2SpaceLauncher api={{ listSpaces, createSpace }} renderWorkspace={(id) => <p>Workspace: {id}</p>} />);

        await screen.findByRole("heading", { name: "No Collab V2 spaces yet" });
        fireEvent.change(screen.getByLabelText("Space name"), { target: { value: "Design" } });
        fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Design decisions" } });
        fireEvent.click(screen.getByRole("button", { name: "Create space" }));

        await screen.findByText(`Workspace: ${created.id}`);
        expect(createSpace).toHaveBeenCalledWith({ name: "Design", description: "Design decisions", visibility: "public" });
        expect(listSpaces).toHaveBeenCalledTimes(2);
    });

    it("discovers a repository-scoped public space, joins it, and opens the workspace", async () => {
        const publicSpace = { ...spaces[0], githubRepo: "maestro/app", isMember: false };
        let joined = false;
        const listSpaces = vi.fn().mockImplementation(() => Promise.resolve(joined ? [spaces[0]] : []));
        const discoverSpaces = vi.fn().mockResolvedValue([publicSpace]);
        const joinSpace = vi.fn().mockImplementation(() => { joined = true; return Promise.resolve({ spaceId: spaces[0].id, memberId: "member-1", joined: true }); });
        render(<CollabV2SpaceLauncher api={{ listSpaces, discoverSpaces, joinSpace, createSpace: vi.fn() }} renderWorkspace={(id) => <p>Opened {id}</p>} />);

        await screen.findByRole("button", { name: "Join public space" });
        fireEvent.change(screen.getByLabelText("Repository discovery"), { target: { value: "maestro/app" } });
        fireEvent.click(screen.getByRole("button", { name: "Discover" }));
        await waitFor(() => expect(discoverSpaces).toHaveBeenLastCalledWith("maestro/app"));
        fireEvent.click(screen.getByRole("button", { name: "Join public space" }));
        await screen.findByText(`Opened ${spaces[0].id}`);
        expect(joinSpace).toHaveBeenCalledWith(spaces[0].id);
    });
});
