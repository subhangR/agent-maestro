import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChannelHub } from "../components/collab-workspace/ChannelHub";
import { CollabCommandPalette } from "../components/collab-workspace/CollabCommandPalette";
import { FullEntityView } from "../components/collab-workspace/FullEntityView";
import { mockCollabWorkspaceData } from "../components/collab-workspace/mockData";

const channelId = Object.values(mockCollabWorkspaceData.entities).find((entity) => entity.kind === "channel")!.id;
const baseChannel = mockCollabWorkspaceData.entities[channelId]!;
const channel = {
    ...baseChannel,
    content: {
        ...baseChannel.content,
        pinned: [mockCollabWorkspaceData.collection.page.items[0]!],
        autoTabs: [{ key: "tasks", label: "Tasks", count: 2 }, { key: "docs", label: "Docs", count: 1 }],
    },
};

describe("Collab full entity views", () => {
    it("renders a DTO-projected channel shelf, feed, and server-keyed auto-tabs", () => {
        render(<ChannelHub channel={channel} thread={mockCollabWorkspaceData.threads[Object.keys(mockCollabWorkspaceData.threads)[0]!]} activity={mockCollabWorkspaceData.activity[Object.keys(mockCollabWorkspaceData.activity)[0]!]} tabResults={{ tasks: mockCollabWorkspaceData.collection }} onOpenEntity={vi.fn()} />);

        expect(screen.getByRole("heading", { name: "Keep the work everyone needs close" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Feed24" })).toBeTruthy();
        fireEvent.click(screen.getByRole("tab", { name: "Tasks2" }));
        expect(screen.getByRole("heading", { name: "My work" })).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: "Docs1" }));
        expect(screen.getByText(/Docs is ready for its projection/i)).toBeTruthy();
    });

    it("supports Z4 collapse and keeps unavailable palette commands visibly feature-gated", () => {
        const onCollapse = vi.fn();
        render(<><FullEntityView entity={channel} onOpenEntity={vi.fn()} onCollapse={onCollapse} /><CollabCommandPalette open entities={mockCollabWorkspaceData.entities} contextEntity={channel} onNavigate={vi.fn()} onOpenChange={vi.fn()} /></>);

        fireEvent.click(screen.getByRole("button", { name: /Collapse/i }));
        expect(onCollapse).toHaveBeenCalledOnce();
        expect(screen.getByText("Future actions")).toBeTruthy();
        expect(screen.getByRole("button", { name: /Link entities/i })).toHaveProperty("disabled", true);
    });
});
