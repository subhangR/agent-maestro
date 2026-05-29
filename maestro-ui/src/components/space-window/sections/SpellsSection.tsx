import React, { useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { EmptySectionState } from "../shared/EmptySectionState";

type MockSharedSpell = {
    id: string;
    name: string;
    description: string;
    body: string;
    targetEntities: string[];
    originDisplayName: string;
    originColor: string;
    publishedRelative: string;
    installCount: number;
    installedByYou: boolean;
};

const MOCK_SPELLS: MockSharedSpell[] = [
    {
        id: "sp-review-pr",
        name: "review-pr",
        description: "Review the current PR for bugs, regressions, and missing tests.",
        body:
            "Review the diff in the current branch. For each file changed:\n- summarize the change in one line\n- flag any bug risk, especially around error handling at trust boundaries\n- check whether tests actually exercise the new code path\nReturn a punch list — done vs. missing.",
        targetEntities: ["session", "task"],
        originDisplayName: "Subhang",
        originColor: "#7c9eff",
        publishedRelative: "5d ago",
        installCount: 8,
        installedByYou: true,
    },
    {
        id: "sp-scaffold-feature",
        name: "scaffold-feature",
        description: "Scaffold a new feature: types, store, component skeleton, route.",
        body:
            "Scaffold a new feature in `maestro-ui` named ${input}. Generate:\n- a types file under `src/app/types/`\n- a Zustand store under `src/stores/`\n- a component skeleton under `src/components/`\n- a route entry if applicable\nUse existing patterns from neighboring features.",
        targetEntities: ["session"],
        originDisplayName: "Manzil",
        originColor: "#f06767",
        publishedRelative: "3d ago",
        installCount: 3,
        installedByYou: false,
    },
    {
        id: "sp-flake-hunter",
        name: "flake-hunter",
        description: "Diagnose flaky test by re-running 20 times and clustering failures.",
        body:
            "Run the failing test 20 times in isolation. Classify each failure by error message. Report the dominant failure mode and propose a root cause.",
        targetEntities: ["task"],
        originDisplayName: "Priya",
        originColor: "#ffc864",
        publishedRelative: "1w ago",
        installCount: 6,
        installedByYou: false,
    },
    {
        id: "sp-explain-incident",
        name: "explain-incident",
        description: "Synthesize an incident timeline from logs, metrics, and PR notes.",
        body:
            "Given the time window provided, build an incident timeline:\n- when did the on-call get paged\n- what was changing leading up to it\n- which signals fired\n- when was the rollback\nWrite it in the postmortem template.",
        targetEntities: ["session"],
        originDisplayName: "Devon",
        originColor: "#66ddaa",
        publishedRelative: "2w ago",
        installCount: 1,
        installedByYou: false,
    },
];

type Props = {
    space: CollabSpace;
};

export const SpellsSection: React.FC<Props> = ({ space }) => {
    void space;
    const [spells] = useState<MockSharedSpell[]>(MOCK_SPELLS);
    const [search, setSearch] = useState("");
    const [previewId, setPreviewId] = useState<string | null>(null);

    const filtered = spells.filter((sp) =>
        search.trim()
            ? `${sp.name} ${sp.description}`.toLowerCase().includes(search.toLowerCase())
            : true,
    );

    return (
        <section className="spaceEntityPane spaceEntityPane--spells">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceEntityTitle">Shared Spells</span>
                    <span className="spaceEntityCount">{spells.length}</span>
                </div>
                <div className="spaceEntityHeaderRight">
                    <input
                        type="text"
                        className="spaceEntitySearchInput"
                        placeholder="Search spells…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button type="button" className="spaceEntityPrimaryBtn">
                        + Publish from local
                    </button>
                </div>
            </header>

            <div className="spaceEntityBody">
                {filtered.length === 0 ? (
                    spells.length === 0 ? (
                        <EmptySectionState
                            title="No shared spells yet"
                            body="Publish a spell to give every member a one-click shortcut to your favorite prompts."
                        />
                    ) : (
                        <div className="spaceEntityNoResults">
                            No spells match this search.
                        </div>
                    )
                ) : (
                    <div className="spaceEntityList spaceEntityList--spells">
                        {filtered.map((sp) => {
                            const open = previewId === sp.id;
                            return (
                                <article
                                    key={sp.id}
                                    className={`spaceSpellItem ${open ? "spaceSpellItem--expanded" : ""}`}
                                >
                                    <div className="spaceSpellItemHeader">
                                        <div className="spaceSpellItemTitleWrap">
                                            <span className="spaceSpellItemName">/{sp.name}</span>
                                            <span className="spaceSpellItemTargetWrap">
                                                {sp.targetEntities.map((te) => (
                                                    <span key={te} className="spaceSpellTargetPill">
                                                        {te}
                                                    </span>
                                                ))}
                                            </span>
                                        </div>
                                        <div className="spaceSpellItemMeta">
                                            <span style={{ color: sp.originColor }}>
                                                @{sp.originDisplayName}
                                            </span>
                                            <span className="spaceSpellItemAt">{sp.publishedRelative}</span>
                                            <span className="spaceSpellItemInstalls">
                                                ↑ {sp.installCount}
                                            </span>
                                        </div>
                                    </div>

                                    <p className="spaceSpellItemDesc">{sp.description}</p>

                                    {open && (
                                        <pre className="spaceSpellItemBody">{sp.body}</pre>
                                    )}

                                    <div className="spaceSpellItemActions">
                                        {sp.installedByYou ? (
                                            <button
                                                type="button"
                                                className="spaceEntityGhostBtn spaceEntityGhostBtn--success"
                                                disabled
                                            >
                                                ✓ Installed
                                            </button>
                                        ) : (
                                            <button type="button" className="spaceEntityPrimaryBtn">
                                                Install
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="spaceEntityGhostBtn"
                                            onClick={() => setPreviewId(open ? null : sp.id)}
                                        >
                                            {open ? "Hide" : "Preview"}
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};
