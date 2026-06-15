import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import { maestroClient } from "../../utils/MaestroClient";
import type {
    Team,
    TeamTreeNode,
    TeamTreeMember,
} from "../../app/types/maestro";
import { Icon } from "./redesign/kit";
import "./team-org-chart.css";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface TeamOrgChartProps {
    projectId: string;
    /** All active teams for the project. The caller passes them in. */
    teams: Team[];
    /** Fired when a member chip is clicked. */
    onSelectMember?: (member: TeamTreeMember, team: TeamTreeNode) => void;
}

// ---------------------------------------------------------------------------
// Fetch state for a single root tree
// ---------------------------------------------------------------------------

type RootTreeState =
    | { status: "loading"; team: Team }
    | { status: "error"; team: Team; error: string }
    | { status: "ready"; team: Team; tree: TeamTreeNode };

function isLeaderMember(member: TeamTreeMember, leaderId: string): boolean {
    return member.isLeader || member.id === leaderId;
}

// ---------------------------------------------------------------------------
// Member chip
// ---------------------------------------------------------------------------

interface MemberRowProps {
    member: TeamTreeMember;
    node: TeamTreeNode;
    onSelectMember?: (member: TeamTreeMember, team: TeamTreeNode) => void;
}

const MemberRow: React.FC<MemberRowProps> = ({ member, node, onSelectMember }) => {
    const isLeader = isLeaderMember(member, node.leaderId);
    const clickable = Boolean(onSelectMember);

    const handleActivate = useCallback(() => {
        onSelectMember?.(member, node);
    }, [onSelectMember, member, node]);

    const className =
        "toc-member" +
        (isLeader ? " toc-member--leader" : "") +
        (clickable ? " toc-member--clickable" : "");

    const content = (
        <>
            <span className="toc-member__av">{member.avatar || "\u{1F464}"}</span>
            <span className="toc-member__body">
                <span className="toc-member__name" title={member.name}>
                    {member.name}
                </span>
                {member.role && (
                    <span className="toc-member__role" title={member.role}>
                        {member.role}
                    </span>
                )}
            </span>
            {member.mode && (
                <span className="toc-member__mode">{member.mode}</span>
            )}
            {isLeader && (
                <span className="toc-member__leader-badge">
                    <Icon name="sparkles" size={9} /> Lead
                </span>
            )}
        </>
    );

    if (clickable) {
        return (
            <button
                type="button"
                className={className}
                onClick={handleActivate}
                title={member.identity || member.name}
            >
                {content}
            </button>
        );
    }

    return (
        <div className={className} title={member.identity || member.name}>
            {content}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Recursive node
// ---------------------------------------------------------------------------

interface OrgNodeProps {
    node: TeamTreeNode;
    isRoot?: boolean;
    onSelectMember?: (member: TeamTreeMember, team: TeamTreeNode) => void;
}

const OrgNode: React.FC<OrgNodeProps> = ({ node, isRoot, onSelectMember }) => {
    const [expanded, setExpanded] = useState(true);

    const subTeams = node.subTeams ?? [];
    const members = node.members ?? [];
    const hasSubTeams = subTeams.length > 0;
    const isArchived = node.status === "archived";
    const single = subTeams.length === 1;

    const toggle = useCallback(() => setExpanded((v) => !v), []);

    const cardClass =
        "toc-card" +
        (isRoot ? " toc-card--root" : "") +
        (isArchived ? " toc-card--archived" : "");

    return (
        <div className="toc-node">
            <div className={cardClass}>
                <div className="toc-card__head">
                    <span className="toc-card__av">
                        {node.avatar || "\u{1F46A}"}
                    </span>
                    <span className="toc-card__titles">
                        <span className="toc-card__name" title={node.name}>
                            {node.name}
                        </span>
                        <span className="toc-card__meta">
                            <span
                                className={
                                    "toc-status" +
                                    (isArchived ? " toc-status--archived" : "")
                                }
                            />
                            {members.length}{" "}
                            {members.length === 1 ? "member" : "members"}
                            {hasSubTeams && (
                                <>
                                    <span className="toc-card__meta-dot">
                                        &middot;
                                    </span>
                                    {subTeams.length}{" "}
                                    {subTeams.length === 1
                                        ? "sub-team"
                                        : "sub-teams"}
                                </>
                            )}
                        </span>
                    </span>
                    {hasSubTeams && (
                        <button
                            type="button"
                            className={
                                "toc-card__chev" +
                                (expanded ? " toc-card__chev--open" : "")
                            }
                            onClick={toggle}
                            aria-expanded={expanded}
                            title={
                                expanded
                                    ? "Collapse sub-teams"
                                    : `Expand ${subTeams.length} sub-team${
                                          subTeams.length === 1 ? "" : "s"
                                      }`
                            }
                        >
                            <Icon
                                name={expanded ? "chevronD" : "chevronR"}
                                size={14}
                            />
                        </button>
                    )}
                </div>

                <div className="toc-card__members">
                    {members.length === 0 ? (
                        <div className="toc-card__empty">No members</div>
                    ) : (
                        members.map((member) => (
                            <MemberRow
                                key={member.id}
                                member={member}
                                node={node}
                                onSelectMember={onSelectMember}
                            />
                        ))
                    )}
                </div>
            </div>

            {hasSubTeams && expanded && (
                <>
                    <div className="toc-node__connector" />
                    <div
                        className={
                            "toc-node__children" +
                            (single ? " toc-node__children--single" : "")
                        }
                    >
                        {subTeams.map((sub) => (
                            <div className="toc-node__child" key={sub.id}>
                                <OrgNode
                                    node={sub}
                                    onSelectMember={onSelectMember}
                                />
                            </div>
                        ))}
                    </div>
                </>
            )}

            {hasSubTeams && !expanded && (
                <button
                    type="button"
                    className="toc-node__collapsed"
                    onClick={toggle}
                    title="Expand sub-teams"
                >
                    <Icon name="gitBranch" size={11} />
                    {subTeams.length} hidden
                </button>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Root chart
// ---------------------------------------------------------------------------

export function TeamOrgChart({
    projectId,
    teams,
    onSelectMember,
}: TeamOrgChartProps) {
    // Active, non-archived teams only.
    const activeTeams = useMemo(
        () => teams.filter((t) => t.status !== "archived"),
        [teams]
    );

    // Roots = teams with no parent. Fallback: if none qualify, treat all as roots.
    const rootTeams = useMemo(() => {
        const withoutParent = activeTeams.filter((t) => !t.parentTeamId);
        return withoutParent.length > 0 ? withoutParent : activeTeams;
    }, [activeTeams]);

    const [roots, setRoots] = useState<RootTreeState[]>([]);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        if (rootTeams.length === 0) {
            setRoots([]);
            return;
        }

        // Seed loading state immediately.
        setRoots(
            rootTeams.map((team) => ({ status: "loading", team }))
        );

        rootTeams.forEach((team) => {
            maestroClient
                .getTeamTree(projectId, team.id)
                .then((tree) => {
                    if (cancelled) return;
                    setRoots((prev) =>
                        prev.map((r) =>
                            r.team.id === team.id
                                ? { status: "ready", team, tree }
                                : r
                        )
                    );
                })
                .catch((err: unknown) => {
                    if (cancelled) return;
                    const message =
                        err instanceof Error
                            ? err.message
                            : "Failed to load team tree";
                    setRoots((prev) =>
                        prev.map((r) =>
                            r.team.id === team.id
                                ? { status: "error", team, error: message }
                                : r
                        )
                    );
                });
        });

        return () => {
            cancelled = true;
        };
        // reloadKey forces a refetch on retry.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, rootTeams, reloadKey]);

    const handleRetry = useCallback(() => {
        setReloadKey((k) => k + 1);
    }, []);

    // ---- empty -------------------------------------------------------------
    if (rootTeams.length === 0) {
        return (
            <div className="toc">
                <div className="toc__state">
                    <Icon name="team" size={28} />
                    <div className="toc__state-title">No teams yet</div>
                    <div className="toc__state-msg">
                        Create a team to see it visualized here as an
                        interactive org chart.
                    </div>
                </div>
            </div>
        );
    }

    const allLoading =
        roots.length > 0 && roots.every((r) => r.status === "loading");
    const allErrored =
        roots.length > 0 && roots.every((r) => r.status === "error");

    // ---- whole-chart loading ----------------------------------------------
    if (allLoading) {
        return (
            <div className="toc">
                <div className="toc__state">
                    <div className="toc__spinner" />
                    <div className="toc__state-title">Building org chart…</div>
                </div>
            </div>
        );
    }

    // ---- whole-chart error -------------------------------------------------
    if (allErrored) {
        const first = roots.find((r) => r.status === "error") as
            | Extract<RootTreeState, { status: "error" }>
            | undefined;
        return (
            <div className="toc">
                <div className="toc__state toc__state--error">
                    <Icon name="alert" size={26} />
                    <div className="toc__state-title">
                        Couldn&apos;t load team trees
                    </div>
                    <div className="toc__state-msg">
                        {first?.error || "Unknown error"}
                    </div>
                    <button
                        type="button"
                        className="toc__retry"
                        onClick={handleRetry}
                    >
                        <Icon name="refresh" size={12} /> Retry
                    </button>
                </div>
            </div>
        );
    }

    // ---- ready (mix of ready / per-root loading / per-root error) ----------
    return (
        <div className="toc">
            <div className="toc__roots">
                {roots.map((r) => {
                    if (r.status === "loading") {
                        return (
                            <div className="toc-node" key={r.team.id}>
                                <div className="toc-card toc-card--root">
                                    <div className="toc-card__head">
                                        <span className="toc-card__av">
                                            {r.team.avatar || "\u{1F46A}"}
                                        </span>
                                        <span className="toc-card__titles">
                                            <span className="toc-card__name">
                                                {r.team.name}
                                            </span>
                                            <span className="toc-card__meta">
                                                loading…
                                            </span>
                                        </span>
                                        <span className="toc__spinner" />
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (r.status === "error") {
                        return (
                            <div className="toc-node" key={r.team.id}>
                                <div className="toc-card toc-card--root toc-card--archived">
                                    <div className="toc-card__head">
                                        <span className="toc-card__av">
                                            <Icon name="alert" size={16} />
                                        </span>
                                        <span className="toc-card__titles">
                                            <span className="toc-card__name">
                                                {r.team.name}
                                            </span>
                                            <span className="toc-card__meta">
                                                failed to load
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            className="toc-card__chev"
                                            onClick={handleRetry}
                                            title="Retry"
                                        >
                                            <Icon name="refresh" size={13} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <OrgNode
                            key={r.team.id}
                            node={r.tree}
                            isRoot
                            onSelectMember={onSelectMember}
                        />
                    );
                })}
            </div>
        </div>
    );
}

export default TeamOrgChart;
