import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntityCard, EntityChip, EntityPanel } from "../components/collab-workspace";
import type { ActorSummary, EntityContent, EntityDetail, EntityKind, EntityState } from "../components/collab-workspace/types";

const person: ActorSummary = { id: "member-001", kind: "member", displayName: "Mira", initials: "MI", color: "#78946b", isAgent: false };
const agent: ActorSummary = { id: "agent-001", kind: "team_member", displayName: "Forge", initials: "FG", color: "#b26a2b", isAgent: true, ownerMemberId: person.id };

function entity(kind: EntityKind, title: string, state: EntityState, content: EntityContent = {}): EntityDetail {
    return {
        id: `entity-${kind}`, spaceId: "space-001", kind, title, state, content, parentId: null, position: 0, visibility: "space", version: 4,
        activityAt: "2026-07-24T10:00:00.000Z", createdAt: "2026-07-24T09:00:00.000Z", updatedAt: "2026-07-24T10:00:00.000Z", deletedAt: null,
        createdBy: person, excerpt: `${title} excerpt`, counters: { likes: 1, dislikes: 0, stars: 2, points: 5, messages: 3 }, badges: {},
        hierarchy: { parent: null, path: [], children: { items: [], nextCursor: null } }, connections: { parent: null, children: [], groups: [] },
        capabilities: { canEdit: true, canDelete: true, canAddChild: true, canLink: true, canPull: true, canReact: true, canGrantPoints: true, canComplete: kind === "task" },
    };
}

const task = entity("task", "Ship graph canvas", { kind: "task", workStatus: "working", priority: "high", axes: { area: "graph" }, assignees: [agent], acceptance: { total: 2, completed: 1 } }, { acceptanceCriteria: [{ id: "criterion", text: "Render nodes", done: true }] });
const examples: EntityDetail[] = [
    entity("channel", "engineering", { kind: "channel", topic: "Build the workspace", unreadCount: 3, workingAgentCount: 1 }, { topic: "Build the workspace", pinned: [task], autoTabs: [{ key: "tasks", label: "Tasks", count: 1 }] }),
    task,
    entity("doc", "Entity contract", { kind: "doc", format: "markdown", childCount: 2 }, { body: "A durable entity graph contract.", format: "markdown" }),
    entity("file", "architecture.png", { kind: "file", name: "architecture.png", mimeType: "image/png", sizeBytes: 1536 }),
    entity("message", "Message from Mira", { kind: "message", anchorId: task.id, rootMessageId: null, author: person, editedAt: "2026-07-24T10:00:00.000Z" }, { body: "Please review this shape.", mentions: [{ entityId: agent.id, kind: "team_member", display: "Forge" }], attachments: [{ fileEntityId: "file-1", name: "architecture.png", mime: "image/png" }] }),
    entity("member", "Mira", { kind: "member", role: "admin", score: 71, taskDoneCount: 12 }, { teamMembers: [entity("team_member", "Forge", { kind: "team_member", owner: person, model: "gpt-5.6", agentTool: "codex" })], work: [task] }),
    entity("team_member", "Forge", { kind: "team_member", owner: person, model: "gpt-5.6", agentTool: "codex", liveWork: { actor: agent, task, startedAt: "2026-07-24T09:45:00.000Z" } }, { identity: "A UI implementation agent.", work: [task] }),
    entity("spell", "release-check", { kind: "spell", description: "Checks release readiness", equipped: true }, { description: "Checks release readiness" }),
    entity("skill", "react-ui", { kind: "skill", description: "Builds accessible React UI", equipped: false }, { description: "Builds accessible React UI" }),
    entity("pull_request", "Panel stack #482", { kind: "pull_request", repository: "maestro/ui", number: 482, state: "open", stale: true }),
    entity("commit", "Wire card renderer", { kind: "commit", repository: "maestro/ui", sha: "e4a91c2b", message: "Render all entity kinds" }),
];

describe("Collab V2 entity renderers", () => {
    it("renders every contract kind as a stateful Z1 chip and Z2 card", () => {
        render(<>{examples.map((item) => <React.Fragment key={item.id}><EntityChip entity={item} onOpen={() => undefined} /><EntityCard entity={item} onOpen={() => undefined} /></React.Fragment>)}</>);

        for (const item of examples) {
            expect(screen.getAllByRole("button", { name: new RegExp(`Open .* ${item.title}`, "i") }).length).toBeGreaterThanOrEqual(2);
        }
        expect(screen.getAllByText("3 unread").length).toBeGreaterThan(0);
        expect(screen.getAllByText("1/2 criteria").length).toBeGreaterThan(0);
        expect(screen.getAllByText("2 KB").length).toBeGreaterThan(0);
        expect(screen.getAllByText("#482").length).toBeGreaterThan(0);
    });

    it("renders kind-specific Z3 panel content without raw-table fields", () => {
        render(<>{examples.map((item) => <EntityPanel key={item.id} entity={item} onOpen={() => undefined} onClose={() => undefined} />)}</>);

        expect(screen.getByText("Pinned shelf")).toBeTruthy();
        expect(screen.getByText("Acceptance criteria")).toBeTruthy();
        expect(screen.getByText("Document preview")).toBeTruthy();
        expect(screen.getByText("File details")).toBeTruthy();
        expect(screen.getByText("Attachments")).toBeTruthy();
        expect(screen.getByText("Team members")).toBeTruthy();
        expect(screen.getByText("Agent identity")).toBeTruthy();
        expect(screen.getAllByText("Availability").length).toBe(2);
        expect(screen.getByText("Pull request status")).toBeTruthy();
        expect(screen.getByText("Commit details")).toBeTruthy();
    });
});
