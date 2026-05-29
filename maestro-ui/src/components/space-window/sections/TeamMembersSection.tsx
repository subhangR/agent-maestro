import React, { useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { EmptySectionState } from "../shared/EmptySectionState";

type Mode = "worker" | "coordinator" | "coordinated-worker" | "coordinated-coordinator";

type MockSharedTeamMember = {
    id: string;
    name: string;
    mode: Mode;
    model: string;
    agentTool: string;
    identity: string;
    commandPermissions: string[];
    originDisplayName: string;
    originColor: string;
    publishedRelative: string;
    adoptionCount: number;
    adoptedByYou: boolean;
};

const MOCK_TEAM: MockSharedTeamMember[] = [
    {
        id: "tm-reviewer",
        name: "Reviewer",
        mode: "worker",
        model: "claude-sonnet-4-6",
        agentTool: "code-reviewer",
        identity:
            "You are a strict but pragmatic code reviewer. Always read the diff in full before commenting. Flag genuine bugs, missing error handling at trust boundaries, and tests that don't actually exercise the new code path. Ignore style nits unless they hide a bug.",
        commandPermissions: ["read", "search", "review"],
        originDisplayName: "Priya",
        originColor: "#ffc864",
        publishedRelative: "published 6d ago",
        adoptionCount: 12,
        adoptedByYou: true,
    },
    {
        id: "tm-codegen",
        name: "Codegen Lead",
        mode: "coordinator",
        model: "claude-opus-4-7",
        agentTool: "general-purpose",
        identity:
            "You are a senior engineer who decomposes large frontend tasks into discrete, testable subtasks and delegates each to a worker. Always sketch the file plan first; never start writing files until the plan is approved.",
        commandPermissions: ["read", "search", "delegate", "synthesize"],
        originDisplayName: "Manzil",
        originColor: "#f06767",
        publishedRelative: "published 2w ago",
        adoptionCount: 4,
        adoptedByYou: false,
    },
    {
        id: "tm-test-runner",
        name: "Test-runner",
        mode: "worker",
        model: "claude-haiku-4-5",
        agentTool: "general-purpose",
        identity:
            "You run tests, parse failures, and produce a tight diff to fix them. Don't refactor — only fix what failed.",
        commandPermissions: ["read", "test", "edit"],
        originDisplayName: "Subhang",
        originColor: "#7c9eff",
        publishedRelative: "published 4w ago",
        adoptionCount: 2,
        adoptedByYou: false,
    },
];

type Props = {
    space: CollabSpace;
};

export const TeamMembersSection: React.FC<Props> = ({ space }) => {
    void space;
    const [team] = useState<MockSharedTeamMember[]>(MOCK_TEAM);
    const [search, setSearch] = useState("");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [publishOpen, setPublishOpen] = useState(false);

    const filtered = team.filter((m) =>
        search.trim()
            ? `${m.name} ${m.identity}`.toLowerCase().includes(search.toLowerCase())
            : true,
    );

    return (
        <section className="spaceEntityPane spaceEntityPane--team">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceEntityTitle">Shared Team Members</span>
                    <span className="spaceEntityCount">{team.length}</span>
                </div>
                <div className="spaceEntityHeaderRight">
                    <input
                        type="text"
                        className="spaceEntitySearchInput"
                        placeholder="Search agents…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                        type="button"
                        className="spaceEntityPrimaryBtn"
                        onClick={() => setPublishOpen(true)}
                    >
                        + Publish from local
                    </button>
                </div>
            </header>

            <div className="spaceEntityBody">
                {filtered.length === 0 ? (
                    team.length === 0 ? (
                        <EmptySectionState
                            title="No shared team members yet"
                            body="Publish your most-used agents so the rest of the space can adopt them with one click."
                        />
                    ) : (
                        <div className="spaceEntityNoResults">No agents match this search.</div>
                    )
                ) : (
                    <div className="spaceEntityList">
                        {filtered.map((m) => {
                            const expanded = expandedId === m.id;
                            return (
                                <article
                                    key={m.id}
                                    className={`spaceTeamItem ${expanded ? "spaceTeamItem--expanded" : ""}`}
                                >
                                    <button
                                        type="button"
                                        className="spaceTeamItemHeader"
                                        onClick={() => setExpandedId(expanded ? null : m.id)}
                                        aria-expanded={expanded}
                                    >
                                        <div className="spaceTeamItemAvatar">{m.name[0]}</div>
                                        <div className="spaceTeamItemTitleWrap">
                                            <div className="spaceTeamItemName">{m.name}</div>
                                            <div className="spaceTeamItemSubtitle">
                                                <span className="spaceModeBadge">{m.mode}</span>
                                                <span className="spaceTeamItemModel">{m.model}</span>
                                            </div>
                                        </div>
                                        <div className="spaceTeamItemMeta">
                                            <span style={{ color: m.originColor }}>
                                                @{m.originDisplayName}
                                            </span>
                                            <span className="spaceTeamItemAdoptions">
                                                ↑ {m.adoptionCount}
                                            </span>
                                        </div>
                                    </button>

                                    {expanded && (
                                        <div className="spaceTeamItemDetail">
                                            <div className="spaceTeamItemSection">
                                                <span className="spaceEntityMetaLabel">Identity prompt</span>
                                                <pre className="spaceTeamItemIdentity">{m.identity}</pre>
                                            </div>
                                            <div className="spaceTeamItemRow">
                                                <span className="spaceEntityMetaLabel">Agent tool</span>
                                                <span className="spaceTeamItemMono">{m.agentTool}</span>
                                            </div>
                                            <div className="spaceTeamItemRow">
                                                <span className="spaceEntityMetaLabel">Permissions</span>
                                                <span className="spaceTeamItemPermsWrap">
                                                    {m.commandPermissions.map((p) => (
                                                        <span key={p} className="spaceTeamPermPill">
                                                            {p}
                                                        </span>
                                                    ))}
                                                </span>
                                            </div>
                                            <div className="spaceTeamItemRow">
                                                <span className="spaceEntityMetaLabel">{m.publishedRelative}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="spaceTeamItemActions">
                                        {m.adoptedByYou ? (
                                            <button
                                                type="button"
                                                className="spaceEntityGhostBtn spaceEntityGhostBtn--success"
                                                disabled
                                            >
                                                ✓ Adopted
                                            </button>
                                        ) : (
                                            <button type="button" className="spaceEntityPrimaryBtn">
                                                Adopt locally
                                            </button>
                                        )}
                                        <button type="button" className="spaceEntityGhostBtn" disabled>
                                            Fork
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {publishOpen && <PublishTeamMemberModal onClose={() => setPublishOpen(false)} />}
        </section>
    );
};

function PublishTeamMemberModal({ onClose }: { onClose: () => void }) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const localTeam = [
        { id: "lm1", name: "PR Reviewer", mode: "worker", model: "claude-sonnet-4-6" },
        { id: "lm2", name: "Migrations Helper", mode: "worker", model: "claude-haiku-4-5" },
    ];

    return (
        <div className="spaceModalOverlay" onClick={onClose}>
            <div
                className="spaceModal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="spaceModalTitle">Publish team member</div>
                <p className="spaceModalBody">
                    Pick a team member from your active project. Its identity prompt and command
                    permissions will be visible to everyone in this space.
                </p>
                <div className="spacePushPickerList">
                    {localTeam.map((lm) => {
                        const checked = selectedId === lm.id;
                        return (
                            <label
                                key={lm.id}
                                className={`spacePushPickerRow ${checked ? "spacePushPickerRow--checked" : ""}`}
                            >
                                <input
                                    type="radio"
                                    name="local-team"
                                    checked={checked}
                                    onChange={() => setSelectedId(lm.id)}
                                />
                                <div className="spacePushPickerBody">
                                    <div className="spacePushPickerTitle">{lm.name}</div>
                                    <div className="spacePushPickerProject">
                                        <span className="spaceModeBadge">{lm.mode}</span>{" "}
                                        <span className="spaceTeamItemMono">{lm.model}</span>
                                    </div>
                                </div>
                            </label>
                        );
                    })}
                </div>
                <p className="spaceModalHint">Be sure the identity prompt has no secrets.</p>
                <div className="spaceModalActions">
                    <button type="button" className="spaceEntityGhostBtn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn"
                        disabled={!selectedId}
                        onClick={onClose}
                    >
                        Publish
                    </button>
                </div>
            </div>
        </div>
    );
}
