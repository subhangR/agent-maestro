import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpellLauncherStore } from '../../stores/useSpellLauncherStore';
import { useSpellLibraryStore, groupSpellsByCategory } from '../../stores/useSpellLibraryStore';
import { useSpellActivationStore } from '../../stores/useSpellActivationStore';
import { useEnsembleStore } from '../../stores/useEnsembleStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useMaestroStore } from '../../stores/useMaestroStore';
import { SpellCard } from './SpellCard';
import { SessionTargetChips } from './SessionTargetChips';
import { CastModeToggle, type CastMode } from './CastModeToggle';
import { SpellDetailFlyout } from './SpellDetailFlyout';
import type { Spell, SpellCategory } from '../../app/types/maestro';

const CATEGORY_LABELS: Record<SpellCategory | 'recent' | 'all' | 'mine', string> = {
  recent: 'Recent',
  all: 'All',
  featured: 'Featured',
  execute: 'Execute',
  plan: 'Plan',
  gate: 'Gate',
  notify: 'Notify',
  custom: 'Custom',
  skills: 'Skills',
  mine: 'My spells',
};

type CategoryKey = SpellCategory | 'recent' | 'all' | 'mine';

const NAV_ORDER: CategoryKey[] = ['recent', 'featured', 'execute', 'plan', 'gate', 'notify', 'custom', 'skills'];

function isRisky(spell: Spell | undefined): boolean {
  if (!spell) return false;
  return spell.action === 'gate' || spell.action === 'run-command' || spell.action === 'continue-loop';
}

/** SpellLauncher — replaces SpellPicker (03 §1). */
export const SpellLauncher = React.memo(function SpellLauncher() {
  const isOpen = useSpellLauncherStore((s) => s.isOpen);
  const source = useSpellLauncherStore((s) => s.source);
  const mode = useSpellLauncherStore((s) => s.mode);
  const taskId = useSpellLauncherStore((s) => s.taskId);
  const initialTargetIds = useSpellLauncherStore((s) => s.targetSessionIds);
  const preselectSpellId = useSpellLauncherStore((s) => s.preselectSpellId);
  const initialCategory = useSpellLauncherStore((s) => s.initialCategory);
  const preselectCastMode = useSpellLauncherStore((s) => s.preselectCastMode);
  const closeLauncher = useSpellLauncherStore((s) => s.closeLauncher);

  const spells = useSpellLibraryStore((s) => s.spells);
  const loading = useSpellLibraryStore((s) => s.loading);
  const recentIds = useSpellLibraryStore((s) => s.recentSpellIds);
  const fetchLibrary = useSpellLibraryStore((s) => s.fetchLibrary);
  // Derive grouped categories in-component. Subscribing to a selector that
  // builds a new object each call would loop useSyncExternalStore (React #185).
  const byCategory = useMemo(() => groupSpellsByCategory(spells), [spells]);

  const casting = useSpellActivationStore((s) => s.casting);
  const castSpellAction = useSpellActivationStore((s) => s.castSpell);

  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const tasks = useMaestroStore((s) => s.tasks);
  const updateTask = useMaestroStore((s) => s.updateTask);
  const sessionsMap = useMaestroStore((s) => s.sessions);

  const ensembleStore = useEnsembleStore();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryKey>(initialCategory ?? 'recent');
  const [cursorIndex, setCursorIndex] = useState(0);
  const [hoveredSpellId, setHoveredSpellId] = useState<string | null>(null);
  const [castMode, setCastMode] = useState<CastMode>(preselectCastMode ?? 'single');
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set(initialTargetIds));
  const [ensembleName, setEnsembleName] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [showRiskyConfirm, setShowRiskyConfirm] = useState(false);
  const [showDetailForId, setShowDetailForId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (!isOpen) return;
    lastFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    setQuery('');
    setCursorIndex(0);
    setHoveredSpellId(preselectSpellId ?? null);
    setCastMode(preselectCastMode ?? (initialTargetIds.length > 1 ? 'broadcast' : 'single'));
    setSelectedTargetIds(new Set(initialTargetIds));
    setEnsembleName('');
    setInlineError(null);
    setShowRiskyConfirm(false);
    setShowDetailForId(null);
    setCategory(initialCategory ?? 'recent');
    fetchLibrary();
    // focus search shortly after mount
    queueMicrotask(() => searchRef.current?.focus());
  }, [isOpen, preselectSpellId, preselectCastMode, initialCategory, initialTargetIds, fetchLibrary]);

  // Restore focus on close
  useEffect(() => {
    if (isOpen) return;
    queueMicrotask(() => lastFocusedRef.current?.focus());
  }, [isOpen]);

  // Filtered list
  const visibleSpells = useMemo<Spell[]>(() => {
    let list: Spell[];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = spells.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.action.toLowerCase().includes(q),
      );
    } else if (category === 'recent') {
      const byId = new Map(spells.map((s) => [s.id, s] as const));
      list = recentIds.map((id) => byId.get(id)).filter((x): x is Spell => Boolean(x));
      if (list.length === 0) list = spells.filter((s) => s.isDefault).slice(0, 8);
    } else if (category === 'all') {
      list = spells;
    } else if (category === 'mine') {
      list = spells.filter((s) => !s.isDefault);
    } else if (category === 'skills') {
      list = spells.filter((s) => Boolean(s.skillRef));
    } else {
      list = byCategory[category] ?? [];
    }
    return list;
  }, [spells, query, category, recentIds, byCategory]);

  const focusedSpell = visibleSpells[cursorIndex] ?? null;
  const previewSpell = hoveredSpellId
    ? spells.find((s) => s.id === hoveredSpellId)
    : focusedSpell;

  // Auto-flip cast mode based on target count (02 §2.4 / 03 §1.9)
  useEffect(() => {
    if (mode !== 'cast') return;
    if (selectedTargetIds.size <= 1 && castMode !== 'single') {
      setCastMode('single');
    } else if (selectedTargetIds.size > 1 && castMode === 'single') {
      setCastMode('broadcast');
    }
  }, [selectedTargetIds, castMode, mode]);

  // Pre-fill ensemble name when switching to coordinate
  useEffect(() => {
    if (castMode === 'coordinate' && !ensembleName && focusedSpell) {
      const date = new Date().toISOString().slice(0, 10);
      setEnsembleName(`${focusedSpell.name} on ${date}`);
    }
  }, [castMode, ensembleName, focusedSpell]);

  const handleToggleTarget = useCallback((sessionId: string, _shift: boolean) => {
    setSelectedTargetIds((prev) => {
      const next = new Set(prev);
      if (castMode === 'single') {
        next.clear();
        next.add(sessionId);
        return next;
      }
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, [castMode]);

  const handleQuickSelectByIndex = useCallback((idx: number) => {
    if (!activeProjectId) return;
    const sessions = Object.values(sessionsMap)
      .filter((s) => s.projectId === activeProjectId && s.status !== 'completed' && s.status !== 'stopped')
      .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
    const session = sessions[idx];
    if (session) handleToggleTarget(session.id, false);
  }, [activeProjectId, sessionsMap, handleToggleTarget]);

  const performAttach = useCallback(async (spell: Spell) => {
    if (!taskId) return;
    const task = tasks[taskId];
    const existing = task?.spellIds ?? [];
    const has = existing.includes(spell.id);
    const next = has ? existing.filter((id) => id !== spell.id) : [...existing, spell.id];
    try {
      await updateTask(taskId, { spellIds: next } as any);
    } catch (e: any) {
      setInlineError(e?.message ?? 'Failed to attach spell');
    }
  }, [taskId, tasks, updateTask]);

  const performCast = useCallback(async (spell: Spell) => {
    const targetIds = Array.from(selectedTargetIds);
    if (targetIds.length === 0) {
      setInlineError('Add at least one target session.');
      return;
    }
    if (castMode === 'coordinate' && targetIds.length < 2) {
      setInlineError('Coordinate needs two or more targets.');
      return;
    }
    try {
      const result = await castSpellAction({
        spellId: spell.id,
        targetSessionIds: targetIds,
        castMode,
        ensembleName: castMode === 'coordinate' ? ensembleName : undefined,
      });
      if (castMode === 'coordinate' && ensembleName.trim()) {
        try {
          await ensembleStore.fetchEnsembles();
        } catch { /* best-effort */ }
        // Best-effort: create ensemble entry mirroring the cast.
        try {
          await maybeCreateEnsemble(spell, ensembleName.trim(), result.sessionIds);
        } catch { /* server may auto-create in P4 */ }
      }
      closeLauncher();
    } catch (e: any) {
      setInlineError(e?.message ?? 'Cast failed');
    }
  }, [selectedTargetIds, castMode, ensembleName, castSpellAction, ensembleStore, closeLauncher]);

  const handleCastClick = useCallback(() => {
    const spell = focusedSpell ?? (hoveredSpellId ? spells.find((s) => s.id === hoveredSpellId) : undefined);
    if (!spell) return;
    if (mode === 'attach') {
      void performAttach(spell);
      return;
    }
    if (isRisky(spell) && !showRiskyConfirm) {
      setShowRiskyConfirm(true);
      return;
    }
    setShowRiskyConfirm(false);
    void performCast(spell);
  }, [focusedSpell, hoveredSpellId, spells, mode, performAttach, performCast, showRiskyConfirm]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showRiskyConfirm) setShowRiskyConfirm(false);
        else closeLauncher();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursorIndex((i) => Math.min(visibleSpells.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursorIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCastClick();
        return;
      }
      if (e.key === '/') {
        if (document.activeElement !== searchRef.current) {
          e.preventDefault();
          searchRef.current?.focus();
        }
        return;
      }
      // Letter shortcuts only when search not focused
      if (document.activeElement === searchRef.current) return;
      if (e.key === 'b' || e.key === 'B') {
        if (selectedTargetIds.size > 1) setCastMode('broadcast');
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        if (selectedTargetIds.size > 1) setCastMode('coordinate');
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        setCastMode('single');
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        handleQuickSelectByIndex(idx);
        return;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, visibleSpells.length, handleCastClick, closeLauncher, showRiskyConfirm, selectedTargetIds.size, handleQuickSelectByIndex]);

  if (!isOpen) return null;

  const canCast = visibleSpells.length > 0 && (mode === 'attach' || selectedTargetIds.size > 0) && !casting;
  const isAttach = mode === 'attach';

  const node = (
    <div className="sp-launcher__backdrop" onClick={closeLauncher} role="presentation">
      <div
        className="sp-launcher"
        role="dialog"
        aria-modal="true"
        aria-label={isAttach ? 'Attach spell to task' : 'Cast a spell'}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sp-launcher__header">
          <span className="sp-launcher__title">{isAttach ? 'Attach a spell' : 'Cast a spell'}</span>
          <input
            ref={searchRef}
            className="sp-launcher__search"
            type="search"
            placeholder="Search spells, skills, tasks…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursorIndex(0); }}
            aria-label="Search spells"
          />
          <button
            type="button"
            className="sp-launcher__close"
            onClick={closeLauncher}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="sp-launcher__main">
          <nav className="sp-launcher__nav" aria-label="Spell categories">
            {NAV_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                className={`sp-launcher__nav-btn ${category === c ? 'sp-launcher__nav-btn--active' : ''}`}
                onClick={() => { setCategory(c); setCursorIndex(0); setQuery(''); }}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </nav>

          <section className="sp-launcher__body" role="listbox" aria-label="Spell library">
            {loading && <p className="sp-launcher__loading">Loading spells…</p>}
            {!loading && visibleSpells.length === 0 && (
              <p className="sp-launcher__empty">
                {query ? `No matches for "${query}".` : 'No spells in this category.'}
              </p>
            )}
            {!loading && visibleSpells.map((spell, idx) => (
              <SpellCard
                key={spell.id}
                spell={spell}
                isFocused={idx === cursorIndex}
                isSelected={spell.id === focusedSpell?.id}
                onFocus={() => { setCursorIndex(idx); setHoveredSpellId(spell.id); }}
                onActivate={() => { setCursorIndex(idx); handleCastClick(); }}
              />
            ))}
          </section>
        </div>

        {!isAttach && (
          <footer className="sp-launcher__targets">
            <p className="sp-launcher__targets-label">Cast on</p>
            <SessionTargetChips
              projectId={activeProjectId}
              selectedIds={selectedTargetIds}
              onToggle={handleToggleTarget}
              singleMode={castMode === 'single'}
            />
            <CastModeToggle
              mode={castMode}
              onChange={setCastMode}
              disableMulti={selectedTargetIds.size <= 1}
              helper={
                selectedTargetIds.size <= 1
                  ? 'Add a second target to broadcast or coordinate.'
                  : undefined
              }
            />
            {castMode === 'coordinate' && (
              <div className="sp-launcher__ensemble">
                <label className="sp-launcher__ensemble-label">
                  Ensemble name
                  <input
                    type="text"
                    value={ensembleName}
                    onChange={(e) => setEnsembleName(e.target.value)}
                    maxLength={40}
                  />
                </label>
              </div>
            )}
          </footer>
        )}

        {showRiskyConfirm && (
          <div className="sp-launcher__risky" role="alertdialog" aria-label="Confirm risky cast">
            <p>This spell {focusedSpell?.action === 'gate' ? 'gates tool calls' : 'has side effects'}. Cast anyway?</p>
            <div>
              <button type="button" onClick={() => setShowRiskyConfirm(false)}>Back</button>
              <button type="button" className="sp-launcher__cta" onClick={handleCastClick}>Cast anyway</button>
            </div>
          </div>
        )}

        <div className="sp-launcher__cta-row">
          {inlineError && <p className="sp-launcher__error" role="alert">{inlineError}</p>}
          <button type="button" onClick={closeLauncher}>Cancel</button>
          <button
            type="button"
            className="sp-launcher__cta"
            disabled={!canCast}
            onClick={handleCastClick}
          >
            {casting ? 'Casting…' : isAttach ? 'Attach' : 'Cast'}
          </button>
        </div>

        {previewSpell && (
          <SpellDetailFlyout
            spellId={previewSpell.id}
            anchorTo="cast-sheet"
            onClose={() => setShowDetailForId(null)}
            embedded
          />
        )}
        {showDetailForId && previewSpell?.id !== showDetailForId && (
          <SpellDetailFlyout
            spellId={showDetailForId}
            anchorTo="cast-sheet"
            onClose={() => setShowDetailForId(null)}
          />
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
});

/**
 * Optional post-cast ensemble creation. Server P4 should ideally auto-create
 * when castMode is coordinate; this is a no-op stub kept for forward-compat.
 */
async function maybeCreateEnsemble(_spell: Spell, _name: string, _sessionIds: string[]): Promise<void> {
  // Server-driven creation handled in P4. UI does not double-create.
}
