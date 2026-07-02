import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpellLibraryStore } from '../../stores/useSpellLibraryStore';
import { useSpellActivationStore } from '../../stores/useSpellActivationStore';
import { useMaestroStore } from '../../stores/useMaestroStore';
import {
  HOOK_EVENT_LABELS,
  HOOK_EVENT_DESCRIPTIONS,
  ACTION_LABELS,
  LOOP_TYPE_LABELS,
  KNOWN_TOOLS,
  isToolEvent,
  triggerSummary,
  actionSummary,
} from '../../utils/spellSummary';
import type {
  Spell, CreateSpellPayload, UpdateSpellPayload, SpellRuleInput,
  SpellHookEvent, SpellActionType, SpellActionConfig, SpellLoopType, SpellColorSlug,
} from '../../app/types/maestro';
import { ACTIONS_BY_EVENT } from '../../app/types/maestro';

const ALL_HOOKS: SpellHookEvent[] = [
  'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop',
  'SubagentStop', 'Notification', 'SessionStart', 'SessionEnd',
];
const LOOP_TYPES: SpellLoopType[] = ['single-shot', 'continue-until-done', 'plan-execute', 'critic-refine'];
const COLORS: SpellColorSlug[] = ['amber', 'rose', 'violet', 'sky', 'emerald', 'fuchsia', 'lime', 'cyan', 'indigo'];

export interface CustomSpellEditorProps {
  spell: Spell | null;
  onClose: () => void;
  onSaved: (spell: Spell) => void;
}

/** One rule's editable state — a flattened superset of every action's fields. */
interface EditorRule {
  key: string;              // stable React key
  id?: string;              // server rule id (undefined for a fresh rule)
  label: string;
  enabled: boolean;
  hookEvent: SpellHookEvent;
  matcherTool: string;      // structured matcher (tool name / alternation)
  useAdvancedMatcher: boolean;
  advancedMatcher: string;  // raw regex — overrides structured when set
  actionType: SpellActionType;
  prompt: string;           // inject-prompt / feed-context
  command: string;          // run-command
  args: string;             // run-command (whitespace-separated)
  cwd: string;              // run-command
  feedOutput: boolean;      // run-command (defaults OFF)
  runCommandConfirmed: boolean; // run-command shell-exec acknowledgement
  loopType: SpellLoopType;  // continue-loop
  maxIterations: number;    // continue-loop
  channel: string;          // notify-channel
  message: string;          // notify-channel
}

let ruleSeq = 0;
function newRuleKey(): string {
  return `rk_${Date.now().toString(36)}_${(ruleSeq++).toString(36)}`;
}

function blankRule(hookEvent: SpellHookEvent = 'Stop'): EditorRule {
  const actionType = ACTIONS_BY_EVENT[hookEvent][0];
  return {
    key: newRuleKey(),
    label: '',
    enabled: true,
    hookEvent,
    matcherTool: '',
    useAdvancedMatcher: false,
    advancedMatcher: '',
    actionType,
    prompt: '',
    command: '',
    args: '',
    cwd: '',
    feedOutput: false,
    runCommandConfirmed: false,
    loopType: 'continue-until-done',
    maxIterations: 3,
    channel: '',
    message: '',
  };
}

/** Convert a persisted spell rule into editor state. */
function ruleFromSpell(rule: Spell['rules'][number]): EditorRule {
  const base = blankRule();
  base.key = newRuleKey();
  base.id = rule.id;
  base.label = rule.label ?? '';
  base.enabled = rule.enabled;

  const trig = rule.trigger;
  if (trig.type === 'hook') {
    base.hookEvent = trig.hookEvent;
    const matcher = trig.matcher ?? '';
    if (matcher) {
      if (isToolEvent(trig.hookEvent)) {
        base.matcherTool = matcher;
      } else {
        base.useAdvancedMatcher = true;
        base.advancedMatcher = matcher;
      }
    }
  }

  const act = rule.action;
  base.actionType = act.type;
  switch (act.type) {
    case 'inject-prompt':
    case 'feed-context':
      base.prompt = act.prompt;
      break;
    case 'run-command':
      base.command = act.command;
      base.args = (act.args ?? []).join(' ');
      base.cwd = act.cwd ?? '';
      base.feedOutput = act.feedOutput ?? false;
      base.runCommandConfirmed = true; // already-saved run-command is trusted
      break;
    case 'continue-loop':
      base.loopType = act.loopType ?? 'continue-until-done';
      base.maxIterations = act.maxIterations ?? 3;
      break;
    case 'notify-channel':
      base.channel = act.channel ?? '';
      base.message = act.message ?? '';
      break;
  }
  return base;
}

function initialRules(spell: Spell | null): EditorRule[] {
  const rules = spell?.rules ?? [];
  if (rules.length === 0) return [blankRule()];
  return rules.map(ruleFromSpell);
}

function computeMatcher(r: EditorRule): string | undefined {
  if (r.useAdvancedMatcher) return r.advancedMatcher.trim() || undefined;
  if (isToolEvent(r.hookEvent)) return r.matcherTool.trim() || undefined;
  return undefined;
}

function buildAction(r: EditorRule): SpellActionConfig {
  switch (r.actionType) {
    case 'inject-prompt':
      return { type: 'inject-prompt', prompt: r.prompt.trim() };
    case 'feed-context':
      return { type: 'feed-context', prompt: r.prompt.trim() };
    case 'run-command':
      return {
        type: 'run-command',
        command: r.command.trim(),
        args: r.args.trim() ? r.args.trim().split(/\s+/) : undefined,
        cwd: r.cwd.trim() || undefined,
        feedOutput: r.feedOutput,
      };
    case 'continue-loop':
      return { type: 'continue-loop', loopType: r.loopType, maxIterations: r.maxIterations };
    case 'notify-channel':
      return {
        type: 'notify-channel',
        channel: r.channel.trim() || undefined,
        message: r.message.trim() || undefined,
      };
  }
}

function buildRulePayload(r: EditorRule): SpellRuleInput {
  return {
    id: r.id,
    label: r.label.trim() || undefined,
    enabled: r.enabled,
    trigger: { type: 'hook', hookEvent: r.hookEvent, matcher: computeMatcher(r) },
    action: buildAction(r),
  };
}

/** Per-rule validation → error string, or null when valid. */
function ruleError(r: EditorRule): string | null {
  if (r.actionType === 'inject-prompt' || r.actionType === 'feed-context') {
    if (!r.prompt.trim()) return 'Prompt text is required.';
  }
  if (r.actionType === 'run-command') {
    if (!r.command.trim()) return 'Command is required.';
    if (!r.runCommandConfirmed) return 'Acknowledge the shell-command warning to save.';
  }
  if (r.actionType === 'continue-loop') {
    if (r.maxIterations < 1) return 'Max iterations must be at least 1.';
  }
  return null;
}

/** CustomSpellEditor — rule-list editor (redesign §5.3 / §11.11). */
export const CustomSpellEditor = React.memo(function CustomSpellEditor({
  spell,
  onClose,
  onSaved,
}: CustomSpellEditorProps) {
  const createSpell = useSpellLibraryStore((s) => s.createSpell);
  const updateSpell = useSpellLibraryStore((s) => s.updateSpell);
  const castSpell = useSpellActivationStore((s) => s.castSpell);
  const sessions = useMaestroStore((s) => s.sessions);
  const activeMaestroSessionId = useMemo(
    () => Object.values(sessions).find((s) => s.status === 'working' || s.status === 'idle')?.id ?? null,
    [sessions],
  );

  const [name, setName] = useState(spell?.name ?? '');
  const [description, setDescription] = useState(spell?.description ?? '');
  const [icon, setIcon] = useState(spell?.icon ?? '✦');
  const [color, setColor] = useState<SpellColorSlug>(spell?.color ?? 'amber');
  const [rules, setRules] = useState<EditorRule[]>(() => initialRules(spell));

  const [errors, setErrors] = useState<{ name?: string; description?: string; rules?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);
  const [testCasting, setTestCasting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    setName(spell?.name ?? '');
    setDescription(spell?.description ?? '');
    setIcon(spell?.icon ?? '✦');
    setColor(spell?.color ?? 'amber');
    setRules(initialRules(spell));
    setErrors({});
    setDirty(false);
  }, [spell]);

  const readOnly = Boolean(spell?.isDefault);

  const markDirty = () => setDirty(true);

  const updateRule = (key: string, patch: Partial<EditorRule>) => {
    setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    markDirty();
  };

  const changeHookEvent = (key: string, hookEvent: SpellHookEvent) => {
    setRules((rs) => rs.map((r) => {
      if (r.key !== key) return r;
      const allowed = ACTIONS_BY_EVENT[hookEvent];
      const actionType = allowed.includes(r.actionType) ? r.actionType : allowed[0];
      return { ...r, hookEvent, actionType };
    }));
    markDirty();
  };

  const addRule = () => {
    setRules((rs) => [...rs, blankRule()]);
    markDirty();
  };

  const removeRule = (key: string) => {
    setRules((rs) => rs.filter((r) => r.key !== key));
    markDirty();
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Name is required';
    if (!description.trim()) next.description = 'Description is required';
    if (rules.length === 0) next.rules = 'Add at least one rule.';
    const badRule = rules.find((r) => ruleError(r));
    if (badRule) {
      next.form = `Rule "${badRule.label.trim() || HOOK_EVENT_LABELS[badRule.hookEvent]}": ${ruleError(badRule)}`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): CreateSpellPayload | UpdateSpellPayload => ({
    name: name.trim(),
    description: description.trim(),
    icon: icon.trim() || undefined,
    color,
    rules: rules.map(buildRulePayload),
  });

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      const saved = spell
        ? await updateSpell(spell.id, payload as UpdateSpellPayload)
        : await createSpell(payload as CreateSpellPayload);
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setErrors((prev) => ({ ...prev, form: e?.message ?? 'Save failed' }));
    } finally {
      setSaving(false);
    }
  };

  const handleTestCast = async () => {
    if (!activeMaestroSessionId || !spell) return;
    setTestCasting(true);
    try {
      await castSpell({ spellId: spell.id, targetSessionIds: [activeMaestroSessionId], castMode: 'single' });
    } catch { /* surfaces in the activation store */ }
    finally { setTestCasting(false); }
  };

  const handleClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const node = (
    <div className="sp-editor__backdrop" onClick={handleClose} role="presentation">
      <div
        className="sp-editor"
        role="dialog"
        aria-modal="true"
        aria-label={spell ? 'Edit spell' : 'Create spell'}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sp-editor__header">
          <h3>{spell ? `Edit ${spell.name}` : 'Create custom spell'}</h3>
          <button type="button" onClick={handleClose} aria-label="Close">✕</button>
        </header>

        <div className="sp-editor__body">
          {readOnly && (
            <p className="sp-editor__readonly" role="status">Curated spell — duplicate to edit.</p>
          )}

          <div className="sp-editor__meta">
            <label className="sp-editor__field">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); markDirty(); }}
                disabled={readOnly}
                maxLength={60}
              />
              {errors.name && <span className="sp-editor__err">{errors.name}</span>}
            </label>

            <label className="sp-editor__field sp-editor__field--icon">
              Icon
              <input
                type="text"
                value={icon}
                onChange={(e) => { setIcon(e.target.value); markDirty(); }}
                disabled={readOnly}
                maxLength={4}
              />
            </label>
          </div>

          <label className="sp-editor__field">
            Description
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); markDirty(); }}
              disabled={readOnly}
              rows={2}
              maxLength={240}
              placeholder="Human summary of what this spell does"
            />
            {errors.description && <span className="sp-editor__err">{errors.description}</span>}
          </label>

          <fieldset className="sp-editor__field" disabled={readOnly}>
            <legend>Color</legend>
            <div className="sp-editor__colors">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`sp-editor__color sp-editor__color--${c} ${color === c ? 'sp-editor__color--active' : ''}`}
                  onClick={() => { setColor(c); markDirty(); }}
                  aria-label={c}
                  aria-pressed={color === c}
                />
              ))}
            </div>
          </fieldset>

          <div className="sp-editor__rules-head">
            <span className="sp-editor__rules-title">Rules</span>
            {!readOnly && (
              <button type="button" className="sp-editor__add-rule" onClick={addRule}>+ Add rule</button>
            )}
          </div>
          {errors.rules && <span className="sp-editor__err">{errors.rules}</span>}

          <datalist id="sp-known-tools">
            {KNOWN_TOOLS.map((t) => <option key={t} value={t} />)}
          </datalist>

          <div className="sp-editor__rules">
            {rules.map((r, idx) => (
              <RuleCard
                key={r.key}
                rule={r}
                index={idx}
                readOnly={readOnly}
                onChange={(patch) => updateRule(r.key, patch)}
                onChangeHookEvent={(ev) => changeHookEvent(r.key, ev)}
                onRemove={() => removeRule(r.key)}
                canRemove={rules.length > 1}
              />
            ))}
          </div>

          {errors.form && <p className="sp-editor__err sp-editor__err--form" role="alert">{errors.form}</p>}
        </div>

        <footer className="sp-editor__footer">
          {spell && activeMaestroSessionId && !readOnly && (
            <button type="button" onClick={handleTestCast} disabled={testCasting}>
              {testCasting ? 'Testing…' : 'Test cast'}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={handleClose}>Cancel</button>
          <button type="button" className="sp-editor__save" disabled={readOnly || saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save spell'}
          </button>
        </footer>

        {confirmDiscard && (
          <div className="sp-editor__discard" role="alertdialog" aria-label="Discard changes">
            <p>Discard unsaved changes?</p>
            <button type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
            <button type="button" onClick={() => { setConfirmDiscard(false); onClose(); }}>Discard</button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
});

/* ---------------- one rule card ---------------- */

interface RuleCardProps {
  rule: EditorRule;
  index: number;
  readOnly: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<EditorRule>) => void;
  onChangeHookEvent: (ev: SpellHookEvent) => void;
  onRemove: () => void;
}

const RuleCard = React.memo(function RuleCard({
  rule: r,
  index,
  readOnly,
  canRemove,
  onChange,
  onChangeHookEvent,
  onRemove,
}: RuleCardProps) {
  const allowedActions = ACTIONS_BY_EVENT[r.hookEvent];
  const err = ruleError(r);
  const summary = `${triggerSummary({ type: 'hook', hookEvent: r.hookEvent, matcher: computeMatcher(r) })} → ${actionSummary(buildAction(r))}`;

  return (
    <fieldset className={`sp-rule ${r.enabled ? '' : 'sp-rule--off'}`} disabled={readOnly}>
      <div className="sp-rule__top">
        <label className="sp-rule__enable">
          <input
            type="checkbox"
            checked={r.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            aria-label="Rule enabled"
          />
          <span aria-hidden>{r.enabled ? 'On' : 'Off'}</span>
        </label>
        <input
          className="sp-rule__label"
          type="text"
          value={r.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={`Rule ${index + 1} label (optional)`}
          maxLength={48}
        />
        {canRemove && (
          <button type="button" className="sp-rule__remove" onClick={onRemove} aria-label="Remove rule">🗑</button>
        )}
      </div>

      {/* Trigger type toggle — Hook active, Schedule coming soon */}
      <div className="sp-rule__trigger-type" role="group" aria-label="Trigger type">
        <button type="button" className="sp-rule__tt sp-rule__tt--active" aria-pressed="true">Hook</button>
        <button type="button" className="sp-rule__tt" disabled title="Scheduled triggers are coming soon">
          Schedule · soon
        </button>
      </div>

      <div className="sp-rule__grid">
        <label className="sp-rule__field">
          When (hook event)
          <select
            value={r.hookEvent}
            onChange={(e) => onChangeHookEvent(e.target.value as SpellHookEvent)}
          >
            {ALL_HOOKS.map((h) => (
              <option key={h} value={h}>{HOOK_EVENT_LABELS[h]} — {HOOK_EVENT_DESCRIPTIONS[h]}</option>
            ))}
          </select>
        </label>

        <label className="sp-rule__field">
          Do (action)
          <select
            value={r.actionType}
            onChange={(e) => onChange({ actionType: e.target.value as SpellActionType })}
          >
            {allowedActions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Matcher — structured for tool events, advanced raw regex for all events */}
      {isToolEvent(r.hookEvent) && !r.useAdvancedMatcher && (
        <label className="sp-rule__field">
          Match tool (optional)
          <input
            type="text"
            list="sp-known-tools"
            value={r.matcherTool}
            onChange={(e) => onChange({ matcherTool: e.target.value })}
            placeholder="any tool — e.g. Edit|Write"
          />
        </label>
      )}
      <details className="sp-rule__advanced" open={r.useAdvancedMatcher}>
        <summary>Advanced matcher (raw regex)</summary>
        <label className="sp-rule__adv-toggle">
          <input
            type="checkbox"
            checked={r.useAdvancedMatcher}
            onChange={(e) => onChange({ useAdvancedMatcher: e.target.checked })}
          /> use raw regex instead
        </label>
        {r.useAdvancedMatcher && (
          <input
            type="text"
            className="sp-rule__adv-input"
            value={r.advancedMatcher}
            onChange={(e) => onChange({ advancedMatcher: e.target.value })}
            placeholder="regex — matches tool name (tool events) or payload field"
            maxLength={4096}
          />
        )}
      </details>

      {/* Action-scoped config */}
      {(r.actionType === 'inject-prompt' || r.actionType === 'feed-context') && (
        <label className="sp-rule__field">
          {r.actionType === 'inject-prompt' ? 'Prompt to inject' : 'Context to feed'}
          <textarea
            value={r.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
            rows={3}
            placeholder={r.actionType === 'inject-prompt'
              ? 'Sent to the agent as a new prompt (e.g. "report progress")'
              : 'Returned to the agent as stdout context'}
          />
        </label>
      )}

      {r.actionType === 'run-command' && (
        <div className="sp-rule__cmd">
          <label className="sp-rule__field">
            Command
            <input
              type="text"
              value={r.command}
              onChange={(e) => onChange({ command: e.target.value })}
              placeholder="npm"
            />
          </label>
          <label className="sp-rule__field">
            Args
            <input
              type="text"
              value={r.args}
              onChange={(e) => onChange({ args: e.target.value })}
              placeholder="run lint"
            />
          </label>
          <label className="sp-rule__field">
            Working dir (optional)
            <input
              type="text"
              value={r.cwd}
              onChange={(e) => onChange({ cwd: e.target.value })}
              placeholder="defaults to session working dir"
            />
          </label>
          <label className="sp-rule__check">
            <input
              type="checkbox"
              checked={r.feedOutput}
              onChange={(e) => onChange({ feedOutput: e.target.checked })}
            /> Feed command output back to the agent
          </label>
          <label className="sp-rule__warn">
            <input
              type="checkbox"
              checked={r.runCommandConfirmed}
              onChange={(e) => onChange({ runCommandConfirmed: e.target.checked })}
            /> ⚠ this rule runs shell commands on your machine — I understand
          </label>
        </div>
      )}

      {r.actionType === 'continue-loop' && (
        <div className="sp-rule__grid">
          <label className="sp-rule__field">
            Loop type
            <select
              value={r.loopType}
              onChange={(e) => onChange({ loopType: e.target.value as SpellLoopType })}
            >
              {LOOP_TYPES.map((l) => <option key={l} value={l}>{LOOP_TYPE_LABELS[l]}</option>)}
            </select>
          </label>
          <label className="sp-rule__field">
            Max iterations
            <input
              type="number"
              min={1}
              max={20}
              value={r.maxIterations}
              onChange={(e) => onChange({ maxIterations: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
        </div>
      )}

      {r.actionType === 'notify-channel' && (
        <div className="sp-rule__grid">
          <label className="sp-rule__field">
            Channel (optional)
            <input
              type="text"
              value={r.channel}
              onChange={(e) => onChange({ channel: e.target.value })}
              placeholder="telegram · slack · (default)"
            />
          </label>
          <label className="sp-rule__field">
            Message (optional)
            <input
              type="text"
              value={r.message}
              onChange={(e) => onChange({ message: e.target.value })}
              placeholder="overrides the default fired-on-event text"
            />
          </label>
        </div>
      )}

      <p className="sp-rule__summary">{summary}</p>
      {err && <p className="sp-rule__err">{err}</p>}
    </fieldset>
  );
});
