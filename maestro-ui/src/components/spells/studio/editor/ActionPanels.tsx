import React from 'react';
import type { SpellLoopType } from '../../../../app/types/maestro';
import { LOOP_TYPES, LOOP_TYPE_META, type EditorRule } from './editorState';

interface PanelProps {
  rule: EditorRule;
  disabled?: boolean;
  patch: (p: Partial<EditorRule>) => void;
}

/** inject-prompt & feed-context share a body textarea; a toggle picks delivery. */
export const InjectFeedPanel = React.memo(function InjectFeedPanel({ rule: r, disabled, patch }: PanelProps) {
  const inject = r.actionType === 'inject-prompt';
  return (
    <div className="spe-panel">
      <div className="spe-seg" role="group" aria-label="Delivery mode">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={inject}
          className={`spe-seg__btn${inject ? ' spe-seg__btn--on' : ''}`}
          onClick={() => patch({ actionType: 'inject-prompt' })}
        >
          As a prompt
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={!inject}
          className={`spe-seg__btn${!inject ? ' spe-seg__btn--on' : ''}`}
          onClick={() => patch({ actionType: 'feed-context' })}
        >
          As context
        </button>
      </div>
      <p className="spe-field__help">
        {inject
          ? 'Inject — pushed into the session as if you typed it.'
          : 'Feed — supplied to the agent as context it reads (stdout channel).'}
      </p>
      <label className="spe-field">
        <span className="spe-field__label">Body</span>
        <textarea
          className="spe-input spe-textarea"
          value={r.prompt}
          disabled={disabled}
          rows={4}
          placeholder={inject ? 'e.g. Report your progress so far.' : 'e.g. Project conventions the agent should keep in mind…'}
          onChange={(e) => patch({ prompt: e.target.value })}
        />
      </label>
    </div>
  );
});

export const RunCommandPanel = React.memo(function RunCommandPanel({ rule: r, disabled, patch }: PanelProps) {
  return (
    <div className="spe-panel">
      <div className="spe-grid-2">
        <label className="spe-field">
          <span className="spe-field__label">Command <span className="spe-field__req">*</span></span>
          <input
            className="spe-input spe-input--mono"
            value={r.command}
            disabled={disabled}
            spellCheck={false}
            placeholder="npm"
            onChange={(e) => patch({ command: e.target.value })}
          />
        </label>
        <label className="spe-field">
          <span className="spe-field__label">Args <span className="spe-field__opt">(space-separated)</span></span>
          <input
            className="spe-input spe-input--mono"
            value={r.args}
            disabled={disabled}
            spellCheck={false}
            placeholder="run lint"
            onChange={(e) => patch({ args: e.target.value })}
          />
        </label>
      </div>
      <label className="spe-field">
        <span className="spe-field__label">Working dir <span className="spe-field__opt">(optional)</span></span>
        <input
          className="spe-input spe-input--mono"
          value={r.cwd}
          disabled={disabled}
          spellCheck={false}
          placeholder="defaults to the session working dir"
          onChange={(e) => patch({ cwd: e.target.value })}
        />
      </label>
      <label className="spe-check">
        <input
          type="checkbox"
          checked={r.feedOutput}
          disabled={disabled}
          onChange={(e) => patch({ feedOutput: e.target.checked })}
        />
        <span>Feed the command's output back to the agent when it finishes</span>
      </label>
      <label className={`spe-ack${r.runCommandAck ? ' spe-ack--ok' : ''}`}>
        <input
          type="checkbox"
          checked={r.runCommandAck}
          disabled={disabled}
          onChange={(e) => patch({ runCommandAck: e.target.checked })}
        />
        <span>⚠ This rule runs shell commands on your machine. I understand and want to allow it.</span>
      </label>
      <p className="spe-field__help">Args are literal (no shell expansion). Runs async — the agent isn't blocked.</p>
    </div>
  );
});

export const ContinueLoopPanel = React.memo(function ContinueLoopPanel({ rule: r, disabled, patch }: PanelProps) {
  return (
    <div className="spe-panel">
      <label className="spe-field">
        <span className="spe-field__label">Loop style</span>
        <div className="spe-radio-list">
          {LOOP_TYPES.map((lt: SpellLoopType) => {
            const meta = LOOP_TYPE_META[lt];
            const on = r.loopType === lt;
            return (
              <button
                key={lt}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                className={`spe-radio${on ? ' spe-radio--on' : ''}`}
                onClick={() => patch({ loopType: lt })}
              >
                <span className="spe-radio__label">{meta.label}</span>
                <span className="spe-radio__blurb">{meta.blurb}</span>
              </button>
            );
          })}
        </div>
      </label>
      <label className="spe-field spe-field--narrow">
        <span className="spe-field__label">Max iterations</span>
        <input
          className="spe-input spe-input--num"
          type="number"
          min={1}
          max={99}
          value={r.maxIterations}
          disabled={disabled}
          onChange={(e) => patch({ maxIterations: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
        />
      </label>
      <p className="spe-field__help">
        The agent is nudged to continue each time it would stop, until it hits the cap
        ({r.maxIterations}×). Loop counters are per-rule and reset on re-cast or manually.
      </p>
    </div>
  );
});

export const NotifyChannelPanel = React.memo(function NotifyChannelPanel({ rule: r, disabled, patch }: PanelProps) {
  return (
    <div className="spe-panel">
      <div className="spe-grid-2">
        <label className="spe-field">
          <span className="spe-field__label">Channel <span className="spe-field__opt">(optional)</span></span>
          <input
            className="spe-input"
            value={r.channel}
            disabled={disabled}
            placeholder="telegram · slack · (default)"
            onChange={(e) => patch({ channel: e.target.value })}
          />
        </label>
        <label className="spe-field">
          <span className="spe-field__label">Message <span className="spe-field__opt">(optional)</span></span>
          <input
            className="spe-input"
            value={r.message}
            disabled={disabled}
            placeholder="overrides the default fired-on-event text"
            onChange={(e) => patch({ message: e.target.value })}
          />
        </label>
      </div>
      <p className="spe-field__help">Routing is a best-effort hint — the relay decides final delivery.</p>
    </div>
  );
});

/** Route to the right panel for the current action type. */
export const ActionPanel = React.memo(function ActionPanel(props: PanelProps) {
  switch (props.rule.actionType) {
    case 'inject-prompt':
    case 'feed-context':
      return <InjectFeedPanel {...props} />;
    case 'run-command':
      return <RunCommandPanel {...props} />;
    case 'continue-loop':
      return <ContinueLoopPanel {...props} />;
    case 'notify-channel':
      return <NotifyChannelPanel {...props} />;
    default:
      return null;
  }
});
