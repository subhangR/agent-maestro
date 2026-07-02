import React from "react";
import { MentionsInput, Mention } from 'react-mentions';
import { rankSkillSuggestions, ensureUniqueSuggestionIds, type SkillSuggestion } from "../../../utils/skillRanking";

type TaskDescriptionFieldProps = {
    prompt: string;
    onPromptChange: (value: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    files: { id: string; display: string }[];
    skills?: SkillSuggestion[];
    isOverlay: boolean;
    children?: React.ReactNode; // For reference task chips/button rendered above textarea
};

export function TaskDescriptionField({
    prompt,
    onPromptChange,
    onKeyDown,
    files,
    skills = [],
    isOverlay,
    children,
}: TaskDescriptionFieldProps) {
    const mentionsStyle = {
        control: {
            backgroundColor: 'transparent',
            fontSize: '12px',
            fontWeight: 'normal' as const,
            lineHeight: '1.5',
            ...(isOverlay
                ? { height: '100%', minHeight: 0 }
                : { minHeight: '250px', maxHeight: '400px' }),
        },
        '&multiLine': {
            control: {
                fontFamily: 'var(--pn-mono)',
                ...(isOverlay
                    ? { height: '100%', minHeight: 0 }
                    : { minHeight: '250px', maxHeight: '400px' }),
            },
            highlighter: {
                padding: '9px 11px',
                border: '1px solid transparent',
                color: 'transparent',
                fontFamily: 'var(--pn-mono)',
                fontSize: '12px',
                lineHeight: '1.5',
                pointerEvents: 'none' as const,
                overflow: 'hidden' as const,
            },
            input: {
                padding: '9px 11px',
                border: '1px solid transparent',
                outline: 'none',
                fontFamily: 'var(--pn-mono)',
                fontSize: '12px',
                lineHeight: '1.5',
                color: 'var(--pn-ink)',
                ...(isOverlay ? {} : { maxHeight: '400px' }),
                overflow: 'auto' as const,
            },
        },
        suggestions: {
            list: {
                zIndex: 9999,
                width: '100%',
                maxWidth: '100%',
                left: 0,
                right: 0,
                boxSizing: 'border-box' as const,
            },
            item: {
                boxSizing: 'border-box' as const,
            },
        },
    };

    return (
        <div className="pn-desc pn-fld" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, marginBottom: 0 }}>
            {!isOverlay && <span className="pn-flabel">Description</span>}

            <div
                className="mentionsWrapper"
                style={{
                    flex: 1,
                    minHeight: 0,
                    color: 'var(--pn-ink)',
                    ...(isOverlay
                        ? { background: 'transparent', border: 'none', borderRadius: 0 }
                        : {
                              background: 'var(--pn-surface)',
                              border: '1px solid var(--pn-line-2)',
                              borderRadius: 'var(--pn-r-sm)',
                          }),
                }}
            >
                <MentionsInput
                    value={prompt}
                    onChange={(e) => onPromptChange(e.target.value)}
                    style={mentionsStyle}
                    placeholder="Describe the task — type @ to reference a file, / to pull in a skill."
                    className="mentionsInput"
                    onKeyDown={onKeyDown}
                >
                    <Mention
                        trigger="@"
                        data={files}
                        renderSuggestion={(entry, _search, _highlightedDisplay, _index, focused) => (
                            <div className={`suggestionItem ${focused ? 'focused' : ''}`}>
                                {entry.display}
                            </div>
                        )}
                    />
                    <Mention
                        trigger="/"
                        data={(query, callback) => {
                            // Function data source: react-mentions renders and selects
                            // (Tab/Enter) from exactly the array we return here, so the
                            // displayed order is guaranteed to equal the selected item —
                            // unlike the built-in array data source, which only applies a
                            // substring filter and preserves insertion order (no relevance
                            // ranking), which is what let a stale/irrelevant suggestion like
                            // "gstack" render above "frontend-design" for a query like
                            // "fronte" even though Tab correctly resolved to the latter.
                            callback(ensureUniqueSuggestionIds(rankSkillSuggestions(skills, query)));
                        }}
                        renderSuggestion={(entry, _search, _highlightedDisplay, _index, focused) => {
                            const skill = entry as SkillSuggestion;
                            const desc = typeof skill.description === 'string' ? skill.description : '';
                            const scope = typeof skill.scope === 'string' ? skill.scope : '';
                            return (
                                <div className={`suggestionItem suggestionItem--skill ${focused ? 'focused' : ''}`}>
                                    <span className="skillSuggestionName">{String(entry.display || '')}</span>
                                    {scope && (
                                        <span className="skillSuggestionScope">
                                            {scope === 'project' ? 'proj' : 'global'}
                                        </span>
                                    )}
                                    {desc && (
                                        <span className="skillSuggestionDesc">
                                            {desc}
                                        </span>
                                    )}
                                </div>
                            );
                        }}
                    />
                </MentionsInput>
            </div>

            {children && (
                <div className="pn-desc__bar">
                    {children}
                </div>
            )}
        </div>
    );
}
