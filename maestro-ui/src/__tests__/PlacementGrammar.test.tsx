import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlacementCollection, placementOptions, reparentOption } from "../components/collab-workspace/PlacementGrammar";
import type { EntitySummary } from "../components/collab-workspace/types";

const actor = { id: "member-1", kind: "member" as const, displayName: "Mira", isAgent: false };
const base = (overrides: Partial<EntitySummary>): EntitySummary => ({
    id: "entity", spaceId: "space", kind: "task", title: "Task", parentId: null, createdBy: actor, createdAt: "2026-07-24T00:00:00.000Z", updatedAt: "2026-07-24T00:00:00.000Z", activityAt: "2026-07-24T00:00:00.000Z", version: 1, position: 0, visibility: "space", deletedAt: null,
    state: { kind: "task", workStatus: "open", priority: "medium", axes: {}, assignees: [], acceptance: { total: 0, completed: 0 } }, badges: {}, counters: { likes: 0, dislikes: 0, stars: 0, points: 0, messages: 0 },
    ...overrides,
});

const source = base({ id: "task-1", title: "Plan placement grammar" });
const target = base({ id: "task-2", title: "Build graph canvas" });
const channel = base({ id: "channel-1", kind: "channel", title: "collab-v2", state: { kind: "channel", topic: "Workspace", unreadCount: 0, workingAgentCount: 0 } });

describe("PlacementGrammar", () => {
    it("exposes the task-to-task ambiguity as exactly three explicit options", () => {
        expect(placementOptions(source, target).map((option) => option.intent)).toEqual(["attach", "depend", "subtask"]);
        expect(placementOptions(source, channel)[0]?.intent).toBe("attach");
        expect(placementOptions(source, target, "parent-zone")[0]?.intent).toBe("reparent");
        expect(reparentOption(source, target)?.ghostLabel).toContain("Move Plan placement grammar under Build graph canvas");
    });

    it("offers an explicit composer embed target for every placed entity", () => {
        render(<PlacementCollection items={[source, target]} onOpen={() => undefined} />);
        fireEvent.click(screen.getByRole("button", { name: "Place Plan placement grammar" }));
        fireEvent.click(screen.getByRole("button", { name: "Embed in message" }));
        expect(screen.getByText("Embed Plan placement grammar in message")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(screen.getByText(/embedded in a message/i)).toBeTruthy();
    });

    it("supports keyboard placement, an explicit preview, local activity, and undo", () => {
        render(<PlacementCollection items={[source, target]} onOpen={() => undefined} />);

        fireEvent.click(screen.getByRole("button", { name: "Place Plan placement grammar" }));
        fireEvent.click(screen.getByRole("button", { name: "Choose how to place Plan placement grammar with Build graph canvas" }));
        expect(screen.getByRole("region", { name: "Placement preview" })).toBeTruthy();
        expect(screen.getByText("Choose a placement for Plan placement grammar")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: /Make subtask/i }));
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(screen.getByText(/Local activity:/i)).toBeTruthy();
        expect(screen.getByText(/made a subtask/i)).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(screen.getByText(/Undid Plan placement grammar made a subtask/i)).toBeTruthy();
    });

    it("shows the semantic ghost label while a card is dragged over a destination", () => {
        const { container } = render(<PlacementCollection items={[source, channel]} onOpen={() => undefined} />);
        const cards = container.querySelectorAll("[data-placement-target]");
        fireEvent.dragStart(cards[0], { dataTransfer: { effectAllowed: "", setData: () => undefined } });
        fireEvent.dragOver(cards[1], { dataTransfer: { dropEffect: "" } });

        expect(screen.getByText("Attach to #collab-v2")).toBeTruthy();
        fireEvent.drop(cards[1], { dataTransfer: { dropEffect: "" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(screen.getByText(/attached to collab-v2/i)).toBeTruthy();
    });
});
