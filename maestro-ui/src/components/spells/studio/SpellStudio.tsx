import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSpellStudioStore, type StudioRoute } from '../../../stores/useSpellStudioStore';
import { useSpellLauncherStore } from '../../../stores/useSpellLauncherStore';
import { useSpellLibraryStore } from '../../../stores/useSpellLibraryStore';
import { useActiveSpellsStore } from '../../../stores/useActiveSpellsStore';
import type { CreateSpellPayload, UpdateSpellPayload, Spell } from '../../../app/types/maestro';
import { SpellLibrary } from './library/SpellLibrary';
import { SpellDetail } from './detail/SpellDetail';
import { CastPanel } from './launcher/CastPanel';
import { EntitiesPanel } from './entities/EntitiesPanel';
import { SpellEditor } from './externalMounts';
import { IconSpark, IconBook, IconCast, IconEntity } from './studioShared';

const NAV: Array<{ key: StudioRoute; label: string; icon: React.FC<{ className?: string }> }> = [
  { key: 'library', label: 'Library', icon: IconBook },
  { key: 'cast', label: 'Cast', icon: IconCast },
  { key: 'entities', label: 'Casts', icon: IconEntity },
];

/**
 * SpellStudio — the unified Spell surface (Track UI-A). Hosts Library (S1),
 * Detail (S2), Cast (S4), Entities/Casts (S10), and the editor overlay that
 * mounts Track UI-B's <SpellEditor>. Bridges the legacy launcher store so
 * every existing "cast this spell" call site opens the Studio in cast mode.
 */
export function SpellStudio() {
  const isOpen = useSpellStudioStore((s) => s.isOpen);
  const route = useSpellStudioStore((s) => s.route);
  const selectedSpellId = useSpellStudioStore((s) => s.selectedSpellId);
  const editor = useSpellStudioStore((s) => s.editor);
  const openStudio = useSpellStudioStore((s) => s.openStudio);
  const close = useSpellStudioStore((s) => s.close);
  const navigate = useSpellStudioStore((s) => s.navigate);
  const selectSpell = useSpellStudioStore((s) => s.selectSpell);
  const openEditor = useSpellStudioStore((s) => s.openEditor);
  const closeEditor = useSpellStudioStore((s) => s.closeEditor);

  const spellCount = useSpellLibraryStore((s) => s.spells.length);

  // Bridge the legacy launcher store → Studio (preserves all existing callers).
  const launcherOpen = useSpellLauncherStore((s) => s.isOpen);
  useEffect(() => {
    if (!launcherOpen) return;
    const l = useSpellLauncherStore.getState();
    openStudio({
      route: l.mode === 'attach' ? 'cast' : 'cast',
      selectedSpellId: l.preselectSpellId ?? null,
      targetSessionIds: l.targetSessionIds,
      preselectCastMode: l.preselectCastMode ?? undefined,
      attachTaskId: l.mode === 'attach' ? l.taskId : null,
    });
    l.closeLauncher();
  }, [launcherOpen, openStudio]);

  const editorDirtyRef = useRef(false);

  // Escape closes the Studio (but not while the editor overlay owns focus).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useSpellStudioStore.getState().editor) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const node = (
    <div className="spst-backdrop" role="presentation"
      onClick={() => { if (!useSpellStudioStore.getState().editor) close(); }}>
      <div className="spell-studio" role="dialog" aria-modal="true" aria-label="Spell Studio"
        onClick={(e) => e.stopPropagation()}>
        <header className="spst-head">
          <span className="spst-head__mark"><IconSpark className="" /></span>
          <span className="spst-head__title">Spell Studio</span>
          <span className="spst-head__spacer" />
          <button className="spst-close" onClick={close} type="button" aria-label="Close">✕</button>
        </header>

        <div className="spst-body">
          <nav className="spst-nav" aria-label="Studio sections">
            <div className="spst-nav__group">Spells</div>
            {NAV.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className={`spst-nav__btn ${route === key ? 'spst-nav__btn--active' : ''}`}
                onClick={() => { navigate(key); if (key !== 'library') selectSpell(null); }}
                aria-current={route === key}
              >
                <Icon className="" /> {label}
                {key === 'library' && <span className="spst-nav__count">{spellCount}</span>}
              </button>
            ))}
          </nav>

          <StudioContent
            route={route}
            selectedSpellId={selectedSpellId}
            onOpenDetail={(id) => { navigate('library'); selectSpell(id); }}
            onBackToLibrary={() => selectSpell(null)}
            onCreate={() => openEditor({ mode: 'create' })}
            onEdit={(spell) => openEditor({ mode: 'edit', sourceSpellId: spell.id })}
            onDuplicate={(spell) => openEditor({ mode: 'create', sourceSpellId: spell.id, duplicating: true })}
            onCast={(id) => { selectSpell(id); navigate('cast'); }}
            onCastDone={() => close()}
          />
        </div>

        {editor && (
          <EditorOverlay
            key={`${editor.mode}:${editor.sourceSpellId ?? 'new'}`}
            onDirtyChange={(d) => { editorDirtyRef.current = d; }}
            onClose={() => { editorDirtyRef.current = false; closeEditor(); }}
            onCreated={(spell) => { selectSpell(spell.id); navigate('library'); }}
          />
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function StudioContent({
  route, selectedSpellId, onOpenDetail, onBackToLibrary, onCreate, onEdit, onDuplicate, onCast, onCastDone,
}: {
  route: StudioRoute;
  selectedSpellId: string | null;
  onOpenDetail: (id: string) => void;
  onBackToLibrary: () => void;
  onCreate: () => void;
  onEdit: (spell: Spell) => void;
  onDuplicate: (spell: Spell) => void;
  onCast: (id: string) => void;
  onCastDone: () => void;
}) {
  if (route === 'cast') return <CastPanel onDone={onCastDone} />;
  if (route === 'entities') return <EntitiesPanel />;
  // library route: detail when a spell is selected, else the grid.
  if (selectedSpellId) {
    return (
      <SpellDetail
        spellId={selectedSpellId}
        onBack={onBackToLibrary}
        onCast={onCast}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onDeleted={onBackToLibrary}
      />
    );
  }
  return <SpellLibrary onOpenDetail={onOpenDetail} onCreate={onCreate} />;
}

/** Editor overlay — mounts UI-B's <SpellEditor>, wires store writes (UI-A owns). */
function EditorOverlay({ onDirtyChange, onClose, onCreated }: {
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
  onCreated: (spell: Spell) => void;
}) {
  const editor = useSpellStudioStore((s) => s.editor)!;
  const spells = useSpellLibraryStore((s) => s.spells);
  const createSpell = useSpellLibraryStore((s) => s.createSpell);
  const updateSpell = useSpellLibraryStore((s) => s.updateSpell);
  const byMaestroSessionId = useActiveSpellsStore((s) => s.byMaestroSessionId);

  const source = editor.sourceSpellId ? spells.find((s) => s.id === editor.sourceSpellId) ?? null : null;

  // For duplicate, seed the editor from the source but drop identity/isDefault.
  const initialSpell = useMemo<Spell | null>(() => {
    if (!source) return null;
    if (editor.duplicating) {
      return { ...source, id: '', name: `${source.name} (copy)`, isDefault: false };
    }
    return source;
  }, [source, editor.duplicating]);

  const isActiveSomewhere = useMemo(() => {
    if (!editor.sourceSpellId || editor.duplicating) return false;
    return Object.values(byMaestroSessionId).some((list) => list.some((a) => a.spellId === editor.sourceSpellId));
  }, [byMaestroSessionId, editor.sourceSpellId, editor.duplicating]);

  const handleSave = async (payload: CreateSpellPayload | UpdateSpellPayload) => {
    if (editor.mode === 'edit' && editor.sourceSpellId) {
      await updateSpell(editor.sourceSpellId, payload as UpdateSpellPayload);
    } else {
      const created = await createSpell(payload as CreateSpellPayload);
      onCreated(created);
    }
    onClose();
  };

  const readOnly = editor.mode === 'edit' && Boolean(source?.isDefault);

  return (
    <div className="spst-backdrop" style={{ position: 'absolute', inset: 0, zIndex: 5 }}
      role="presentation" onClick={(e) => e.stopPropagation()}>
      <div className="spell-studio" role="dialog" aria-modal="true" aria-label="Spell editor"
        style={{ width: '100%', height: '100%', borderRadius: 0 }} onClick={(e) => e.stopPropagation()}>
        <SpellEditor
          mode={editor.mode}
          spell={initialSpell}
          onSave={handleSave}
          onCancel={onClose}
          readOnly={readOnly}
          onDuplicate={readOnly && source ? () => {
            useSpellStudioStore.getState().openEditor({ mode: 'create', sourceSpellId: source.id, duplicating: true });
          } : undefined}
          isActiveSomewhere={isActiveSomewhere}
          onDirtyChange={onDirtyChange}
        />
      </div>
    </div>
  );
}
