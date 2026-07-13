import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSkillStore } from '../../stores/useSkillStore';
import type { Skill } from '../../app/types/maestro';

export interface CustomSkillEditorProps {
  skill: Skill | null;
  linkBackToSpellId?: string;
  onClose: () => void;
  onSaved: (skill: Skill) => void;
}

/** CustomSkillEditor — full-modal skill editor (03 §6). */
export const CustomSkillEditor = React.memo(function CustomSkillEditor({
  skill,
  linkBackToSpellId,
  onClose,
  onSaved,
}: CustomSkillEditorProps) {
  const createSkill = useSkillStore((s) => s.createSkill);

  const [slug, setSlug] = useState(skill?.slug ?? '/');
  const [title, setTitle] = useState(skill?.title ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [scope, setScope] = useState<'project' | 'global'>(skill?.scope ?? 'project');
  const [body, setBody] = useState(skill?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSlug(skill?.slug ?? '/');
    setTitle(skill?.title ?? '');
    setDescription(skill?.description ?? '');
    setScope(skill?.scope ?? 'project');
    setBody(skill?.body ?? '');
    setDirty(false);
    setError(null);
  }, [skill]);

  const handleSave = async () => {
    if (!slug.trim() || !title.trim() || !body.trim()) {
      setError('Slug, title, and body are required.');
      return;
    }
    setSaving(true);
    try {
      const saved = await createSkill({
        slug: slug.trim(),
        title: title.trim(),
        description: description.trim() || undefined,
        scope,
        body,
      });
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const node = (
    <div className="sp-editor__backdrop" onClick={handleClose} role="presentation">
      <div className="sp-editor" role="dialog" aria-modal="true" aria-label={skill ? 'Edit skill' : 'Create skill'} onClick={(e) => e.stopPropagation()}>
        <header className="sp-editor__header">
          <h3>{skill ? `Edit ${skill.title}` : 'Create skill'}</h3>
          <button type="button" onClick={handleClose} aria-label="Close">✕</button>
        </header>
        <div className="sp-editor__body">
          <fieldset className="sp-editor__field">
            <legend>Scope</legend>
            <label><input type="radio" checked={scope === 'project'} onChange={() => { setScope('project'); setDirty(true); }} /> project</label>
            <label><input type="radio" checked={scope === 'global'} onChange={() => { setScope('global'); setDirty(true); }} /> global</label>
          </fieldset>
          <label className="sp-editor__field">
            Slug
            <input type="text" value={slug} onChange={(e) => { setSlug(e.target.value); setDirty(true); }} placeholder="/lint-fix" />
          </label>
          <label className="sp-editor__field">
            Title
            <input type="text" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
          </label>
          <label className="sp-editor__field">
            Description
            <input type="text" value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} />
          </label>
          <label className="sp-editor__field">
            SKILL.md
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); setDirty(true); }}
              rows={10}
            />
          </label>
          {error && <p className="sp-editor__err" role="alert">{error}</p>}
        </div>
        <footer className="sp-editor__footer">
          <span style={{ flex: 1 }} />
          <button type="button" onClick={handleClose}>Cancel</button>
          <button type="button" className="sp-editor__save" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : linkBackToSpellId ? 'Save and link' : 'Save'}
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
