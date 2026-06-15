import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpellLibraryStore } from '../../stores/useSpellLibraryStore';
import { useSpellActivationStore } from '../../stores/useSpellActivationStore';
import { useMaestroStore } from '../../stores/useMaestroStore';
import type {
  Spell, CreateSpellPayload, UpdateSpellPayload,
  SpellAction, SpellLoopType, SpellHookEvent, SpellFailMode, SpellColorSlug,
} from '../../app/types/maestro';

const ACTIONS: SpellAction[] = ['inject-prompt', 'feed-context', 'gate', 'continue-loop', 'run-command', 'notify-channel'];
const LOOP_TYPES: SpellLoopType[] = ['single-shot', 'continue-until-done', 'plan-execute', 'critic-refine'];
const HOOKS: SpellHookEvent[] = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'Notification', 'SessionStart'];
const COLORS: SpellColorSlug[] = ['amber', 'rose', 'violet', 'sky', 'emerald', 'fuchsia', 'lime', 'cyan', 'indigo'];

export interface CustomSpellEditorProps {
  spell: Spell | null;
  onClose: () => void;
  onSaved: (spell: Spell) => void;
}

interface FormState {
  name: string;
  description: string;
  icon: string;
  color: SpellColorSlug;
  action: SpellAction;
  loopType: SpellLoopType;
  triggerEnabled: boolean;
  hookEvent: SpellHookEvent;
  triggerMatcher: string;
  maxIterations: number;
  failMode: SpellFailMode;
  skillRef: string;
  prompt: string;
}

function fromSpell(spell: Spell | null): FormState {
  return {
    name: spell?.name ?? '',
    description: spell?.description ?? '',
    icon: spell?.icon ?? '✦',
    color: spell?.color ?? 'amber',
    action: spell?.action ?? 'inject-prompt',
    loopType: spell?.loopType ?? 'single-shot',
    triggerEnabled: spell?.trigger?.enabled ?? false,
    hookEvent: spell?.trigger?.hookEvent ?? 'Stop',
    triggerMatcher: spell?.trigger?.matcher ?? '',
    maxIterations: spell?.maxIterations ?? 1,
    failMode: spell?.failMode ?? 'open',
    skillRef: spell?.skillRef ?? '',
    prompt: '',
  };
}

/** CustomSpellEditor — full-modal editor (03 §6). */
export const CustomSpellEditor = React.memo(function CustomSpellEditor({
  spell,
  onClose,
  onSaved,
}: CustomSpellEditorProps) {
  const createSpell = useSpellLibraryStore((s) => s.createSpell);
  const updateSpell = useSpellLibraryStore((s) => s.updateSpell);
  const castSpell = useSpellActivationStore((s) => s.castSpell);
  const sessions = useMaestroStore((s) => s.sessions);
  // Active session is determined by the terminal layer; we just look at any working one for "Test cast".
  const activeMaestroSessionId = useMemo(
    () => Object.values(sessions).find((s) => s.status === 'working' || s.status === 'idle')?.id ?? null,
    [sessions],
  );

  const [form, setForm] = useState<FormState>(() => fromSpell(spell));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [testCasting, setTestCasting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    setForm(fromSpell(spell));
    setDirty(false);
    setErrors({});
  }, [spell]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.description.trim()) next.description = 'Description is required';
    if (form.action === 'continue-loop' && form.maxIterations < 1) next.maxIterations = 'At least 1';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): CreateSpellPayload | UpdateSpellPayload => ({
    name: form.name.trim(),
    description: form.description.trim(),
    icon: form.icon.trim() || undefined,
    color: form.color,
    action: form.action,
    loopType: form.loopType !== 'single-shot' ? form.loopType : undefined,
    trigger: form.triggerEnabled
      ? { hookEvent: form.hookEvent, matcher: form.triggerMatcher.trim() || undefined, enabled: true }
      : undefined,
    failMode: form.action === 'gate' ? form.failMode : undefined,
    maxIterations: form.action === 'continue-loop' ? form.maxIterations : undefined,
    skillRef: form.skillRef.trim() || undefined,
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
      setErrors({ name: e?.message ?? 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestCast = async () => {
    if (!activeMaestroSessionId || !spell) return;
    setTestCasting(true);
    try {
      await castSpell({
        spellId: spell.id,
        targetSessionIds: [activeMaestroSessionId],
        castMode: 'single',
      });
    } catch { /* surfaces in launcher / activation store */ }
    finally { setTestCasting(false); }
  };

  const handleClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const readOnly = Boolean(spell?.isDefault);

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

          <label className="sp-editor__field">
            Name
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              disabled={readOnly}
              maxLength={60}
            />
            {errors.name && <span className="sp-editor__err">{errors.name}</span>}
          </label>

          <label className="sp-editor__field">
            Icon
            <input
              type="text"
              value={form.icon}
              onChange={(e) => setField('icon', e.target.value)}
              disabled={readOnly}
              maxLength={4}
            />
          </label>

          <label className="sp-editor__field">
            Description
            <textarea
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              disabled={readOnly}
              rows={2}
              maxLength={240}
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
                  className={`sp-editor__color sp-editor__color--${c} ${form.color === c ? 'sp-editor__color--active' : ''}`}
                  onClick={() => setField('color', c)}
                  aria-label={c}
                  aria-pressed={form.color === c}
                />
              ))}
            </div>
          </fieldset>

          <label className="sp-editor__field">
            Action
            <select value={form.action} onChange={(e) => setField('action', e.target.value as SpellAction)} disabled={readOnly}>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          {form.action === 'continue-loop' && (
            <>
              <label className="sp-editor__field">
                Loop type
                <select value={form.loopType} onChange={(e) => setField('loopType', e.target.value as SpellLoopType)} disabled={readOnly}>
                  {LOOP_TYPES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="sp-editor__field">
                Max iterations
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.maxIterations}
                  onChange={(e) => setField('maxIterations', Math.max(1, Number(e.target.value) || 1))}
                  disabled={readOnly}
                />
              </label>
            </>
          )}

          {form.action === 'gate' && (
            <fieldset className="sp-editor__field" disabled={readOnly}>
              <legend>Fail mode</legend>
              <label><input type="radio" name="failMode" checked={form.failMode === 'open'} onChange={() => setField('failMode', 'open')} /> open</label>
              <label><input type="radio" name="failMode" checked={form.failMode === 'closed'} onChange={() => setField('failMode', 'closed')} /> closed (safer for gates)</label>
            </fieldset>
          )}

          <fieldset className="sp-editor__field" disabled={readOnly}>
            <legend>Trigger</legend>
            <label>
              <input
                type="checkbox"
                checked={form.triggerEnabled}
                onChange={(e) => setField('triggerEnabled', e.target.checked)}
              /> Bind to hook event
            </label>
            {form.triggerEnabled && (
              <>
                <label>
                  Hook event
                  <select value={form.hookEvent} onChange={(e) => setField('hookEvent', e.target.value as SpellHookEvent)}>
                    {HOOKS.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
                <label>
                  Matcher (optional)
                  <input
                    type="text"
                    value={form.triggerMatcher}
                    onChange={(e) => setField('triggerMatcher', e.target.value)}
                    placeholder="e.g. Bash(npm run lint*)"
                  />
                </label>
              </>
            )}
          </fieldset>

          <label className="sp-editor__field">
            Skill ref (optional)
            <input
              type="text"
              value={form.skillRef}
              onChange={(e) => setField('skillRef', e.target.value)}
              disabled={readOnly}
              placeholder="/code-review"
            />
          </label>
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
