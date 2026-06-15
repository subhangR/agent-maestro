import React, { useState, useEffect, useMemo } from "react";
import { ClaudeCodeSkill } from "../../app/types/maestro";
import { Icon } from "../Icon";
import { maestroClient } from "../../utils/MaestroClient";

interface ClaudeCodeSkillsSelectorProps {
    selectedSkills: string[];
    onSelectionChange: (skillIds: string[]) => void;
    projectPath?: string;
    alwaysExpanded?: boolean;
}

export function ClaudeCodeSkillsSelector({ selectedSkills, onSelectionChange, projectPath, alwaysExpanded = false }: ClaudeCodeSkillsSelectorProps) {
    const [skills, setSkills] = useState<ClaudeCodeSkill[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [expanded, setExpanded] = useState(false);
    const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
    const skillsExpanded = alwaysExpanded || expanded;

    useEffect(() => {
        loadSkills();
    }, [projectPath]);

    const loadSkills = async () => {
        setLoading(true);
        setError(null);
        try {
            const skillsList = await maestroClient.getSkills(projectPath);
            setSkills(skillsList);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load skills");
        } finally {
            setLoading(false);
        }
    };

    // Group by scope
    const { projectSkills, globalSkills, filteredSkills } = useMemo(() => {
        const filtered = skills.filter(skill => {
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesName = skill.name.toLowerCase().includes(query);
                const matchesDescription = skill.description.toLowerCase().includes(query);
                const matchesTriggers = skill.triggers?.some(t => t.toLowerCase().includes(query));
                const matchesTags = skill.tags?.some(t => t.toLowerCase().includes(query));
                if (!matchesName && !matchesDescription && !matchesTriggers && !matchesTags) {
                    return false;
                }
            }
            return true;
        });

        return {
            projectSkills: filtered.filter(s => s.skillScope === 'project'),
            globalSkills: filtered.filter(s => s.skillScope !== 'project'),
            filteredSkills: filtered,
        };
    }, [skills, searchQuery]);

    const handleToggleSkill = (skillId: string) => {
        if (selectedSkills.includes(skillId)) {
            onSelectionChange(selectedSkills.filter(id => id !== skillId));
        } else {
            onSelectionChange([...selectedSkills, skillId]);
        }
    };

    const renderSkillCard = (skill: ClaudeCodeSkill) => {
        const isSelected = selectedSkills.includes(skill.id);
        const isExpanded = expandedSkillId === skill.id;

        return (
            <div
                key={skill.id}
                className={`claudeCodeSkillCard ${isSelected ? "selected" : ""}`}
                onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
            >
                <div className="claudeCodeSkillCardHeader">
                    <span
                        className="claudeCodeSkillCheckbox"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSkill(skill.id);
                        }}
                    >
                        {isSelected ? "[\u2713]" : "[ ]"}
                    </span>
                    <span className="claudeCodeSkillName">{skill.name}</span>
                    {skill.skillScope && (
                        <span style={{
                            fontSize: '9px',
                            padding: '1px 4px',
                            border: '1px solid var(--theme-border)',
                            color: 'rgba(var(--theme-primary-rgb), 0.4)',
                            marginLeft: 'auto',
                            flexShrink: 0,
                        }}>
                            {skill.skillScope === 'project' ? 'proj' : 'global'}
                        </span>
                    )}
                </div>

                {isExpanded && (
                    <div className="claudeCodeSkillDetails">
                        <div className="claudeCodeSkillDescription">
                            {typeof skill.description === 'string' ? skill.description : 'No description'}
                        </div>

                        {Array.isArray(skill.triggers) && skill.triggers.length > 0 && (
                            <div className="claudeCodeSkillTriggers">
                                <strong>Triggers:</strong>{" "}
                                {skill.triggers.filter(t => typeof t === 'string').join(", ")}
                            </div>
                        )}

                        {Array.isArray(skill.tags) && skill.tags.length > 0 && (
                            <div className="claudeCodeSkillTags">
                                <strong>Tags:</strong>{" "}
                                {skill.tags.filter(t => typeof t === 'string').join(", ")}
                            </div>
                        )}

                        {skill.hasReferences && (
                            <div className="claudeCodeSkillReferences">
                                <Icon name="file" />{" "}
                                {skill.referenceCount} reference file{skill.referenceCount !== 1 ? "s" : ""}
                            </div>
                        )}

                        {skill.skillSource && (
                            <div style={{ fontSize: '9px', color: 'rgba(var(--theme-primary-rgb), 0.3)' }}>
                                source: {skill.skillSource === 'claude' ? '.claude/skills' : '.agents/skills'}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="claudeCodeSkillsLoading">
                <span className="claudeCodeSkillsSpinner">&#x27F3;</span> Loading skills...
            </div>
        );
    }

    if (error) {
        return (
            <div className="claudeCodeSkillsError">
                <div>{error}</div>
                <button type="button" onClick={loadSkills} className="claudeCodeSkillsRetry">
                    Retry
                </button>
            </div>
        );
    }

    if (skills.length === 0) {
        return (
            <div className="claudeCodeSkillsEmpty">
                No skills found. Expected at <code>~/.claude/skills/</code> or <code>~/.agents/skills/</code>
            </div>
        );
    }

    return (
        <div className="claudeCodeSkillsSelector">
            {/* Header line */}
            <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: alwaysExpanded ? 'default' : 'pointer' }}
                onClick={alwaysExpanded ? undefined : () => setExpanded(!expanded)}
            >
                {!alwaysExpanded && (
                    <span style={{ color: 'rgba(var(--theme-primary-rgb), 0.5)', fontSize: '10px' }}>
                        {expanded ? "\u25BC" : "\u25B6"}
                    </span>
                )}
                <span className="themedFormLabel" style={{ marginBottom: 0 }}>Skills</span>
                <span className="claudeCodeSkillsCount" style={{ flex: 1 }}>
                    ({selectedSkills.length > 0 ? `${selectedSkills.length} selected / ` : ""}{skills.length} available)
                </span>
            </div>

            {skillsExpanded && (
                <>
                    {/* Search */}
                    <div className="claudeCodeSkillsToolbar">
                        <div className="claudeCodeSkillsSearch">
                            <Icon name="search" />
                            <input
                                type="text"
                                placeholder="Search skills..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="claudeCodeSkillsSearchInput"
                            />
                            {searchQuery && (
                                <button type="button"
                                    className="claudeCodeSkillsSearchClear"
                                    onClick={() => setSearchQuery("")}
                                    title="Clear search"
                                >
                                    &times;
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Skills grid */}
                    <div className="claudeCodeSkillsGrid">
                        {filteredSkills.length === 0 ? (
                            <div className="claudeCodeSkillsNoResults">
                                No skills match your search.
                            </div>
                        ) : (
                            <>
                                {/* Show project skills first if any */}
                                {projectSkills.length > 0 && (
                                    <>
                                        <div style={{ gridColumn: '1 / -1', fontSize: '9px', color: 'rgba(var(--theme-primary-rgb), 0.4)', padding: '4px 0 2px 0', borderBottom: '1px solid var(--theme-border)' }}>
                                            PROJECT
                                        </div>
                                        {projectSkills.map(renderSkillCard)}
                                    </>
                                )}
                                {globalSkills.length > 0 && (
                                    <>
                                        <div style={{ gridColumn: '1 / -1', fontSize: '9px', color: 'rgba(var(--theme-primary-rgb), 0.4)', padding: '4px 0 2px 0', borderBottom: '1px solid var(--theme-border)' }}>
                                            GLOBAL
                                        </div>
                                        {globalSkills.map(renderSkillCard)}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
