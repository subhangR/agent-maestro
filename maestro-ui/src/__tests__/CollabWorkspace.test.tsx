import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollabWorkspace } from "../components/collab-workspace";

describe("CollabWorkspace", () => {
    it("renders projected fixture data and opens linked entities in the panel stack", () => {
        render(<CollabWorkspace />);

        expect(screen.getByRole("heading", { name: "My work" })).toBeTruthy();
        expect(screen.getAllByText("Connections rail — edges grouped by type").length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole("tab", { name: "Connections" }));
        expect(screen.getByText("Depends on")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: /T-104 unread semantics/i }));
        expect(screen.getAllByText("Resolve unread state semantics").length).toBeGreaterThan(0);
        expect(screen.getByText(/Back to Connections rail/i)).toBeTruthy();
    });

    it("keeps replies and agent provenance in the universal discussion view", () => {
        render(<CollabWorkspace />);

        fireEvent.click(screen.getByRole("tab", { name: "Discussion" }));
        expect(screen.getByText("Agent")).toBeTruthy();
        expect(screen.getByText(/re-pulled at v5/i)).toBeTruthy();
    });

    it("submits the workspace create journey through the live action seam", async () => {
        const createTask = vi.fn().mockResolvedValue(undefined);
        const actions = {
            createTask, createDoc: vi.fn(), createFile: vi.fn(), postMessage: vi.fn(), setReaction: vi.fn(), grantPoints: vi.fn(), place: vi.fn(), createEdge: vi.fn(), completeTask: vi.fn(), pullEntity: vi.fn(), updateWork: vi.fn(), markInboxRead: vi.fn(), refreshTracking: vi.fn(),
        };
        render(<CollabWorkspace actions={actions} />);
        fireEvent.click(screen.getByRole("button", { name: "New task" }));
        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Ship V2 onboarding" } });
        fireEvent.change(screen.getByLabelText("Description"), { target: { value: "No invites required" } });
        fireEvent.click(screen.getByRole("button", { name: "Create" }));
        await waitFor(() => expect(createTask).toHaveBeenCalledWith({ title: "Ship V2 onboarding", description: "No invites required", parentId: null }));
    });
});
