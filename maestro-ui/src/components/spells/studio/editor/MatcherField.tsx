import React from 'react';
import { KNOWN_TOOLS, isToolEvent } from '../../../../utils/spellSummary';
import type { SpellHookEvent } from '../../../../app/types/maestro';
import { MATCHER_TARGET, SPELL_LIMITS, type EditorRule } from './editorState';

interface Props {
  rule: EditorRule;
  disabled?: boolean;
  patch: (p: Partial<EditorRule>) => void;
}

/**
 * Matcher control. For Pre/PostToolUse it renders a structured tool picker
 * (multi-select of known tools, serialized down to one `A|B` regex). An
 * "Advanced" escape hatch swaps in a raw-regex input for ALL events.
 */
export const MatcherField = React.memo(function MatcherField({ rule: r, disabled, patch }: Props) {
  const toolEvent = isToolEvent(r.hookEvent);
  const target = MATCHER_TARGET[r.hookEvent];

  const toggleTool = (tool: string) => {
    const has = r.matcherTools.includes(tool);
    patch({ matcherTools: has ? r.matcherTools.filter((t) => t !== tool) : [...r.matcherTools, tool] });
  };

  return (
    <div className="spe-matcher">
      <div className="spe-field__label-row">
        <span className="spe-field__label">Matcher <span className="spe-field__opt">(optional)</span></span>
        <label className="spe-adv-toggle">
          <input
            type="checkbox"
            checked={r.useAdvancedMatcher}
            disabled={disabled}
            onChange={(e) => patch({ useAdvancedMatcher: e.target.checked })}
          />
          Advanced (raw regex)
        </label>
      </div>

      {toolEvent && !r.useAdvancedMatcher && (
        <>
          <div className="spe-tools" role="group" aria-label="Match tools">
            {KNOWN_TOOLS.map((tool) => {
              const on = r.matcherTools.includes(tool);
              return (
                <button
                  key={tool}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  className={`spe-tool-chip${on ? ' spe-tool-chip--on' : ''}`}
                  onClick={() => toggleTool(tool)}
                >
                  {tool}
                </button>
              );
            })}
          </div>
          <p className="spe-field__help">
            {r.matcherTools.length === 0
              ? `Empty = fires on every tool. Matches ${target}.`
              : <>Fires only for <code>{r.matcherTools.join('|')}</code>.</>}
          </p>
        </>
      )}

      {!toolEvent && !r.useAdvancedMatcher && (
        <p className="spe-field__help">
          No structured matcher for this event — empty fires on every occurrence.
          Use <strong>Advanced</strong> to match {target} with a regex.
        </p>
      )}

      {r.useAdvancedMatcher && (
        <>
          <input
            type="text"
            className="spe-input spe-input--mono"
            value={r.advancedMatcher}
            disabled={disabled}
            maxLength={SPELL_LIMITS.matcher}
            spellCheck={false}
            placeholder={toolEvent ? 'e.g. Edit|Write|MultiEdit' : 'raw regex'}
            onChange={(e) => patch({ advancedMatcher: e.target.value })}
            aria-label="Advanced matcher regex"
          />
          <p className="spe-field__help">Regex tested against {target}. Empty = fire on every occurrence.</p>
        </>
      )}
    </div>
  );
});

/** Convenience re-export so the picker order stays stable in one place. */
export function eventsWithStructuredMatcher(): SpellHookEvent[] {
  return ['PreToolUse', 'PostToolUse'];
}
