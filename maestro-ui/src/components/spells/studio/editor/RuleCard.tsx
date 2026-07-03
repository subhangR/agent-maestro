import React from 'react';
import type { SpellHookEvent, SpellActionType } from '../../../../app/types/maestro';
import { ACTIONS_BY_EVENT } from '../../../../app/types/maestro';
import { describeRule, ruleSentence } from '../../../../utils/spellSummary';
import {
  ALL_HOOK_EVENTS,
  HOOK_EVENT_FIRES_WHEN,
  HOOK_EVENT_GOOD_FOR,
  ACTION_META,
  SPELL_LIMITS,
  toPreviewRule,
  ruleError,
  type EditorRule,
} from './editorState';
import { MatcherField } from './MatcherField';
import { ActionPanel } from './ActionPanels';

interface Props {
  rule: EditorRule;
  index: number;
  total: number;
  readOnly?: boolean;
  patch: (p: Partial<EditorRule>) => void;
  onChangeEvent: (ev: SpellHookEvent) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  showError: boolean;
}

export const RuleCard = React.memo(function RuleCard({
  rule: r, index, total, readOnly, patch, onChangeEvent, onRemove, onDuplicate, onMove, showError,
}: Props) {
  const preview = toPreviewRule(r);
  const err = ruleError(r);
  const allowedActions = ACTIONS_BY_EVENT[r.hookEvent];

  const toggleCollapse = () => patch({ collapsed: !r.collapsed });

  return (
    <div
      className={`spe-rule${r.enabled ? '' : ' spe-rule--off'}${r.collapsed ? ' spe-rule--collapsed' : ''}${showError && err ? ' spe-rule--invalid' : ''}`}
      data-index={index}
    >
      {/* ── Header (always visible) ── */}
      <div className="spe-rule__head">
        <button
          type="button"
          className="spe-rule__disclose"
          aria-expanded={!r.collapsed}
          aria-label={r.collapsed ? 'Expand rule' : 'Collapse rule'}
          onClick={toggleCollapse}
        >
          <span className={`spe-rule__caret${r.collapsed ? '' : ' spe-rule__caret--open'}`} aria-hidden>▸</span>
        </button>

        <label className="spe-rule__enable" title={r.enabled ? 'Rule enabled' : 'Rule disabled (saved but never fires)'}>
          <input
            type="checkbox"
            checked={r.enabled}
            disabled={readOnly}
            onChange={(e) => patch({ enabled: e.target.checked })}
            aria-label="Rule enabled"
          />
          <span className="spe-rule__enable-track" aria-hidden><span className="spe-rule__enable-thumb" /></span>
        </label>

        <button type="button" className="spe-rule__summary-btn" onClick={toggleCollapse}>
          <span className="spe-rule__num">{index + 1}</span>
          <span className="spe-rule__summary" title={describeRule(preview)}>
            {r.label.trim() && <strong className="spe-rule__summary-label">{r.label.trim()} · </strong>}
            {describeRule(preview)}
          </span>
        </button>

        <div className="spe-rule__actions">
          <button type="button" className="spe-iconbtn" disabled={readOnly || index === 0} title="Move up" aria-label="Move rule up" onClick={() => onMove(-1)}>↑</button>
          <button type="button" className="spe-iconbtn" disabled={readOnly || index === total - 1} title="Move down" aria-label="Move rule down" onClick={() => onMove(1)}>↓</button>
          <button type="button" className="spe-iconbtn" disabled={readOnly} title="Duplicate rule" aria-label="Duplicate rule" onClick={onDuplicate}>⧉</button>
          <button type="button" className="spe-iconbtn spe-iconbtn--danger" disabled={readOnly || total <= 1} title={total <= 1 ? 'A spell needs at least one rule' : 'Remove rule'} aria-label="Remove rule" onClick={onRemove}>✕</button>
        </div>
      </div>

      {showError && err && r.collapsed && <p className="spe-rule__err spe-rule__err--head" role="alert">{err}</p>}

      {/* ── Body (expanded) ── */}
      {!r.collapsed && (
        <div className="spe-rule__body">
          {/* Trigger type: Hook active, Schedule visible-but-disabled */}
          <div className="spe-tt" role="group" aria-label="Trigger type">
            <button type="button" className="spe-tt__btn spe-tt__btn--on" aria-pressed="true" disabled={readOnly}>Hook</button>
            <button
              type="button"
              className="spe-tt__btn spe-tt__btn--soon"
              aria-pressed="false"
              disabled
              title="Scheduled triggers are coming soon"
            >
              Schedule <span className="spe-tt__soon">soon</span>
            </button>
          </div>

          {/* Event picker */}
          <label className="spe-field">
            <span className="spe-field__label">When this fires</span>
            <select
              className="spe-input spe-select"
              value={r.hookEvent}
              disabled={readOnly}
              onChange={(e) => onChangeEvent(e.target.value as SpellHookEvent)}
            >
              {ALL_HOOK_EVENTS.map((ev) => (
                <option key={ev} value={ev}>{ev} — fires when {HOOK_EVENT_FIRES_WHEN[ev]}</option>
              ))}
            </select>
            <span className="spe-field__help">Good for: {HOOK_EVENT_GOOD_FOR[r.hookEvent]}.</span>
          </label>

          {/* Matcher */}
          <MatcherField rule={r} disabled={readOnly} patch={patch} />

          {/* Action picker (filtered by event) */}
          <label className="spe-field">
            <span className="spe-field__label">Then do this</span>
            <select
              className="spe-input spe-select"
              value={r.actionType}
              disabled={readOnly}
              onChange={(e) => patch({ actionType: e.target.value as SpellActionType })}
            >
              {allowedActions.map((a) => (
                <option key={a} value={a}>{ACTION_META[a].label}</option>
              ))}
            </select>
            <span className="spe-field__help">{ACTION_META[r.actionType].blurb}</span>
          </label>

          {/* Action-specific config */}
          <ActionPanel rule={r} disabled={readOnly} patch={patch} />

          {/* Optional per-rule label */}
          <label className="spe-field">
            <span className="spe-field__label">Label <span className="spe-field__opt">(optional)</span></span>
            <input
              className="spe-input"
              value={r.label}
              disabled={readOnly}
              maxLength={SPELL_LIMITS.label}
              placeholder={`Rule ${index + 1}`}
              onChange={(e) => patch({ label: e.target.value })}
            />
          </label>

          {/* Live plain-English summary */}
          <div className="spe-rule__sentence" aria-live="polite">
            <span className="spe-rule__sentence-icon" aria-hidden>✦</span>
            {ruleSentence(preview)}
          </div>

          {showError && err && <p className="spe-rule__err" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
});
