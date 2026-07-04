import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Spell,
  SpellColorSlug,
  SpellHookEvent,
  CreateSpellPayload,
  UpdateSpellPayload,
} from '../../../../app/types/maestro';
import { ACTIONS_BY_EVENT } from '../../../../app/types/maestro';
import {
  ALL_HOOK_EVENTS,
  SPELL_LIMITS,
  blankRule,
  duplicateRule,
  initialRules,
  buildRulePayload,
  ruleError,
  headerErrors,
  type EditorRule,
  type HeaderErrors,
} from './editorState';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import { IconPicker } from './IconPicker';
import { RuleCard } from './RuleCard';
import '../../../../styles-spell-editor.css';

export interface SpellEditorProps {
  /** create a new spell, or edit an existing one. */
  mode: 'create' | 'edit';
  /** the spell being edited — required when `mode === 'edit'`. */
  spell?: Spell | null;
  /**
   * Persist the spell. The host (UI-A) owns the store write (createSpell /
   * updateSpell). Throw to surface a save error inline; resolve to signal done.
   */
  onSave: (payload: CreateSpellPayload | UpdateSpellPayload) => Promise<void> | void;
  /** Called once the internal discard guard has cleared. */
  onCancel: () => void;
  /** Seed spell → renders a read-only "Duplicate to edit" prompt. */
  readOnly?: boolean;
  /** CTA target for the read-only "Duplicate to edit" button. */
  onDuplicate?: () => void;
  /** Spell is cast on ≥1 session → shows "changes apply on the next trigger". */
  isActiveSomewhere?: boolean;
  /** Lets the host guard route/navigate-away while there are unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * SpellEditor (S3) — the centerpiece. A self-contained create/edit surface for
 * a multi-rule spell. Fully local state; the host provides `onSave`/`onCancel`.
 */
export function SpellEditor({
  mode,
  spell,
  onSave,
  onCancel,
  readOnly,
  onDuplicate,
  isActiveSomewhere,
  onDirtyChange,
}: SpellEditorProps) {
  const [name, setName] = useState(spell?.name ?? '');
  const [description, setDescription] = useState(spell?.description ?? '');
  const [icon, setIcon] = useState(spell?.icon ?? '✦');
  const [color, setColor] = useState<SpellColorSlug>(spell?.color ?? 'amber');
  const [rules, setRules] = useState<EditorRule[]>(() => initialRules(spell));

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const rulesRef = useRef<HTMLDivElement>(null);

  // Reset when the target spell changes (host may reuse the instance).
  useEffect(() => {
    setName(spell?.name ?? '');
    setDescription(spell?.description ?? '');
    setIcon(spell?.icon ?? '✦');
    setColor(spell?.color ?? 'amber');
    setRules(initialRules(spell));
    setDirty(false);
    setSaving(false);
    setSaveError(null);
    setShowErrors(false);
    setConfirmDiscard(false);
  }, [spell]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const markDirty = useCallback(() => { setDirty(true); setSaveError(null); }, []);

  // ── header setters ──
  const setNameD = (v: string) => { setName(v); markDirty(); };
  const setDescD = (v: string) => { setDescription(v); markDirty(); };
  const setIconD = (v: string) => { setIcon(v); markDirty(); };
  const setColorD = (v: SpellColorSlug) => { setColor(v); markDirty(); };

  // ── rule mutations ──
  const patchRule = useCallback((key: string, p: Partial<EditorRule>) => {
    setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
    markDirty();
  }, [markDirty]);

  const changeRuleEvent = useCallback((key: string, ev: SpellHookEvent) => {
    setRules((rs) => rs.map((r) => {
      if (r.key !== key) return r;
      const allowed = ACTIONS_BY_EVENT[ev];
      // auto-correct action if the new event invalidates it
      const actionType = allowed.includes(r.actionType) ? r.actionType : allowed[0];
      return { ...r, hookEvent: ev, actionType };
    }));
    markDirty();
  }, [markDirty]);

  const addRule = useCallback(() => {
    setRules((rs) => {
      if (rs.length >= SPELL_LIMITS.maxRules) return rs;
      return [...rs, blankRule()];
    });
    markDirty();
    // scroll the new rule into view next frame
    requestAnimationFrame(() => {
      rulesRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [markDirty]);

  const removeRule = useCallback((key: string) => {
    setRules((rs) => (rs.length <= 1 ? rs : rs.filter((r) => r.key !== key)));
    markDirty();
  }, [markDirty]);

  const dupRule = useCallback((key: string) => {
    setRules((rs) => {
      if (rs.length >= SPELL_LIMITS.maxRules) return rs;
      const i = rs.findIndex((r) => r.key === key);
      if (i < 0) return rs;
      const copy = duplicateRule(rs[i]);
      return [...rs.slice(0, i + 1), copy, ...rs.slice(i + 1)];
    });
    markDirty();
  }, [markDirty]);

  const moveRule = useCallback((key: string, dir: -1 | 1) => {
    setRules((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const next = rs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    markDirty();
  }, [markDirty]);

  const setAllCollapsed = (collapsed: boolean) => {
    setRules((rs) => rs.map((r) => ({ ...r, collapsed })));
  };

  // ── validation ──
  const hErrors: HeaderErrors = useMemo(
    () => headerErrors(name, description, icon, rules.length),
    [name, description, icon, rules.length],
  );
  const ruleErrs = useMemo(() => rules.map((r) => ruleError(r)), [rules]);
  const firstBadIndex = ruleErrs.findIndex(Boolean);
  const hasErrors = Object.keys(hErrors).length > 0 || firstBadIndex >= 0;

  const buildPayload = (): CreateSpellPayload | UpdateSpellPayload => ({
    name: name.trim(),
    description: description.trim(),
    icon: icon.trim() || undefined,
    color,
    rules: rules.map(buildRulePayload),
  });

  const handleSave = async () => {
    setShowErrors(true);
    if (hasErrors) {
      // expand + reveal the first invalid rule
      if (firstBadIndex >= 0) {
        setRules((rs) => rs.map((r, i) => (i === firstBadIndex ? { ...r, collapsed: false } : r)));
      }
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(buildPayload());
      setDirty(false);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const requestCancel = () => {
    if (dirty) setConfirmDiscard(true);
    else onCancel();
  };

  // ── read-only (seed) short-circuit ──
  if (readOnly) {
    return (
      <div className="spe-editor spe-editor--readonly">
        <SeedHeader name={spell?.name ?? 'Spell'} icon={spell?.icon ?? '✦'} color={color} />
        <div className="spe-readonly-note" role="status">
          <p><strong>This is a curated seed spell.</strong> Seeds are read-only.</p>
          <p>Duplicate it to make your own editable copy.</p>
          <div className="spe-readonly-actions">
            <button type="button" className="spe-btn spe-btn--primary" onClick={onDuplicate} disabled={!onDuplicate}>
              Duplicate to edit
            </button>
            <button type="button" className="spe-btn" onClick={onCancel}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const canAddRule = rules.length < SPELL_LIMITS.maxRules;

  return (
    <div className="spe-editor" role="form" aria-label={mode === 'create' ? 'Create spell' : 'Edit spell'}>
      {/* ── Sticky header ── */}
      <div className="spe-editor__topbar">
        <h2 className="spe-editor__title">{mode === 'create' ? 'Create spell' : `Edit ${spell?.name ?? 'spell'}`}</h2>
        <div className="spe-editor__topbar-actions">
          <button type="button" className="spe-btn" onClick={requestCancel} disabled={saving}>Cancel</button>
          <button type="button" className="spe-btn spe-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create spell' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="spe-editor__scroll">
        {mode === 'edit' && isActiveSomewhere && (
          <div className="spe-banner spe-banner--info" role="status">
            This spell is active on one or more sessions. Changes apply on the next trigger — no re-cast needed.
          </div>
        )}
        {saveError && <div className="spe-banner spe-banner--error" role="alert">{saveError}</div>}

        {/* ── Identity ── */}
        <section className="spe-section">
          <div className="spe-header-grid">
            <div className="spe-header-grid__icon">
              <span className="spe-field__label">Icon</span>
              <IconPicker value={icon} onChange={setIconD} />
              {showErrors && hErrors.icon && <span className="spe-err-text">{hErrors.icon}</span>}
            </div>
            <label className="spe-field spe-header-grid__name">
              <span className="spe-field__label">Name <span className="spe-field__req">*</span></span>
              <input
                className="spe-input"
                value={name}
                maxLength={SPELL_LIMITS.name}
                placeholder="e.g. Lint on Edit"
                onChange={(e) => setNameD(e.target.value)}
              />
              <span className="spe-field__count">{name.length}/{SPELL_LIMITS.name}</span>
              {showErrors && hErrors.name && <span className="spe-err-text">{hErrors.name}</span>}
            </label>
          </div>

          <label className="spe-field">
            <span className="spe-field__label">Description</span>
            <textarea
              className="spe-input spe-textarea spe-textarea--short"
              value={description}
              rows={2}
              maxLength={SPELL_LIMITS.description}
              placeholder="A human summary of what this spell does (not the injected text)."
              onChange={(e) => setDescD(e.target.value)}
            />
            <span className="spe-field__count">{description.length}/{SPELL_LIMITS.description}</span>
            {showErrors && hErrors.description && <span className="spe-err-text">{hErrors.description}</span>}
          </label>

          <div className="spe-field">
            <span className="spe-field__label">Color</span>
            <ColorSwatchPicker value={color} onChange={setColorD} />
          </div>
        </section>

        {/* ── Rules ── */}
        <section className="spe-section">
          <div className="spe-rules-head">
            <div className="spe-rules-head__title">
              <span className="spe-rules-head__label">Rules</span>
              <span className="spe-rules-head__count">{rules.length}/{SPELL_LIMITS.maxRules}</span>
            </div>
            <div className="spe-rules-head__actions">
              {rules.length > 1 && (
                <>
                  <button type="button" className="spe-btn spe-btn--ghost" onClick={() => setAllCollapsed(true)}>Collapse all</button>
                  <button type="button" className="spe-btn spe-btn--ghost" onClick={() => setAllCollapsed(false)}>Expand all</button>
                </>
              )}
            </div>
          </div>
          {showErrors && hErrors.rules && <p className="spe-err-text spe-err-text--block" role="alert">{hErrors.rules}</p>}

          <div className="spe-rules" ref={rulesRef}>
            {rules.map((r, i) => (
              <RuleCard
                key={r.key}
                rule={r}
                index={i}
                total={rules.length}
                readOnly={false}
                showError={showErrors}
                patch={(p) => patchRule(r.key, p)}
                onChangeEvent={(ev) => changeRuleEvent(r.key, ev)}
                onRemove={() => removeRule(r.key)}
                onDuplicate={() => dupRule(r.key)}
                onMove={(dir) => moveRule(r.key, dir)}
              />
            ))}
          </div>

          <button
            type="button"
            className="spe-add-rule"
            onClick={addRule}
            disabled={!canAddRule}
            title={canAddRule ? 'Add a rule' : `A spell can have at most ${SPELL_LIMITS.maxRules} rules`}
          >
            + Add rule
          </button>
        </section>
      </div>

      {/* ── Discard guard ── */}
      {confirmDiscard && (
        <div className="spe-discard" role="alertdialog" aria-modal="true" aria-label="Discard changes">
          <div className="spe-discard__box">
            <p className="spe-discard__title">Discard unsaved changes?</p>
            <p className="spe-discard__body">Your edits to this spell will be lost.</p>
            <div className="spe-discard__actions">
              <button type="button" className="spe-btn" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
              <button type="button" className="spe-btn spe-btn--danger" onClick={() => { setConfirmDiscard(false); onCancel(); }}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeedHeader({ name, icon, color }: { name: string; icon: string; color: SpellColorSlug }) {
  return (
    <div className="spe-editor__topbar">
      <h2 className="spe-editor__title" data-spell-color={color}>
        <span className="spe-seed-icon" aria-hidden>{icon}</span> {name}
      </h2>
    </div>
  );
}

export default SpellEditor;
