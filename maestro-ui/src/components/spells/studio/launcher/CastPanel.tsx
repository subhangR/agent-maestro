import React, { useEffect, useMemo, useState } from 'react';
import { useSpellLibraryStore } from '../../../../stores/useSpellLibraryStore';
import { useSpellActivationStore } from '../../../../stores/useSpellActivationStore';
import { useSpellStudioStore, type StudioCastMode } from '../../../../stores/useSpellStudioStore';
import { useProjectStore } from '../../../../stores/useProjectStore';
import { useMaestroStore } from '../../../../stores/useMaestroStore';
import { spellRuleSummary, isRiskySpell, describeRule } from '../../../../utils/spellSummary';
import type { Spell } from '../../../../app/types/maestro';
import {
  spellColorVars, IconSearch, IconCast, IconWarn, IconBack, StudioState,
} from '../studioShared';

const CAST_MODES: Array<{ key: StudioCastMode; label: string; hint: string }> = [
  { key: 'single', label: 'Single', hint: 'Cast onto one session.' },
  { key: 'broadcast', label: 'Broadcast', hint: 'Cast independently onto each selected session.' },
  { key: 'coordinate', label: 'Coordinate', hint: 'Selected sessions form a named ensemble.' },
];

export interface CastPanelProps {
  /** Called after a successful cast/attach so the shell can close or navigate. */
  onDone: () => void;
}

/** S4 — Cast / Launcher. Target picker + cast-mode + risky confirm + fire. */
export function CastPanel({ onDone }: CastPanelProps) {
  const spells = useSpellLibraryStore((s) => s.spells);
  const selectedSpellId = useSpellStudioStore((s) => s.selectedSpellId);
  const selectSpell = useSpellStudioStore((s) => s.selectSpell);
  const initialTargets = useSpellStudioStore((s) => s.castTargetSessionIds);
  const preselectCastMode = useSpellStudioStore((s) => s.preselectCastMode);
  const attachTaskId = useSpellStudioStore((s) => s.attachTaskId);

  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const sessionsMap = useMaestroStore((s) => s.sessions);
  const tasks = useMaestroStore((s) => s.tasks);
  const updateTask = useMaestroStore((s) => s.updateTask);

  const casting = useSpellActivationStore((s) => s.casting);
  const castSpell = useSpellActivationStore((s) => s.castSpell);

  const spell = useMemo(() => spells.find((s) => s.id === selectedSpellId) ?? null, [spells, selectedSpellId]);
  const isAttach = Boolean(attachTaskId);

  const eligible = useMemo(() => {
    if (!activeProjectId) return [];
    return Object.values(sessionsMap)
      .filter((s) => s.projectId === activeProjectId && s.status !== 'completed' && s.status !== 'stopped' && s.status !== 'failed')
      .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  }, [sessionsMap, activeProjectId]);

  const [selected, setSelected] = useState<Set<string>>(new Set(initialTargets));
  const [mode, setMode] = useState<StudioCastMode>(preselectCastMode ?? (initialTargets.length > 1 ? 'broadcast' : 'single'));
  const [ensembleName, setEnsembleName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmRisky, setConfirmRisky] = useState(false);
  const [query, setQuery] = useState('');

  // Auto-flip mode by target count (FR-5.3).
  useEffect(() => {
    if (selected.size <= 1 && mode !== 'single') setMode('single');
    else if (selected.size > 1 && mode === 'single') setMode('broadcast');
  }, [selected, mode]);

  const toggleTarget = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (mode === 'single') { next.clear(); next.add(id); return next; }
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doCast = async () => {
    if (!spell) return;
    const targetIds = Array.from(selected);
    if (!isAttach) {
      if (targetIds.length === 0) { setError('Select at least one target session.'); return; }
      if (mode === 'coordinate' && targetIds.length < 2) { setError('Coordinate needs two or more sessions.'); return; }
    }
    setError(null);
    try {
      if (isAttach && attachTaskId) {
        const task = tasks[attachTaskId];
        const existing = task?.spellIds ?? [];
        if (!existing.includes(spell.id)) {
          await updateTask(attachTaskId, { spellIds: [...existing, spell.id] } as any);
        }
      } else {
        await castSpell({
          spellId: spell.id,
          targetSessionIds: targetIds,
          castMode: mode,
          ensembleName: mode === 'coordinate' ? ensembleName.trim() || undefined : undefined,
        });
      }
      onDone();
    } catch (e: any) {
      setError(e?.message ?? 'Cast failed');
    }
  };

  const handleCastClick = () => {
    if (!spell) return;
    if (!isAttach && isRiskySpell(spell) && !confirmRisky) { setConfirmRisky(true); return; }
    void doCast();
  };

  // ── No spell chosen yet → inline picker ──
  if (!spell) {
    const q = query.trim().toLowerCase();
    const list = q
      ? spells.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      : spells;
    return (
      <div className="spst-main">
        <div className="spst-search">
          <IconSearch />
          <input type="search" placeholder="Pick a spell to cast…" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Pick a spell" autoFocus />
        </div>
        <div className="spst-scroll">
          <div className="spst-list">
            {list.map((s) => (
              <button key={s.id} type="button" className="spst-row" onClick={() => selectSpell(s.id)}>
                <span className="spst-swatch" style={spellColorVars(s.color)} aria-hidden>{s.icon || '✦'}</span>
                <span className="spst-row__body">
                  <span className="spst-row__title">{s.name}</span>
                  <span className="spst-row__sub">{spellRuleSummary(s)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const canCast = (isAttach || selected.size > 0) && !casting;

  return (
    <div className="spst-main">
      <div className="spst-cast">
        <div className="spst-cast__section">
          <div className="spst-cast__section-head">
            <button className="spst-btn spst-btn--ghost" onClick={() => selectSpell(null)} type="button" aria-label="Change spell">
              <IconBack />
            </button>
            <span className="spst-swatch" style={spellColorVars(spell.color)} aria-hidden>{spell.icon || '✦'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="spst-card__name">{spell.name}</div>
              <div className="spst-row__sub">{spellRuleSummary(spell)}</div>
            </div>
          </div>
        </div>

        {!isAttach && (
          <>
            <div className="spst-cast__section">
              <div className="spst-cast__section-head"><span className="spst-eyebrow">Cast mode</span></div>
              <div className="spst-seg" role="tablist" aria-label="Cast mode">
                {CAST_MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={mode === m.key}
                    disabled={m.key !== 'single' && selected.size < 2}
                    className={`spst-seg-i ${mode === m.key ? 'spst-seg-i--active' : ''}`}
                    onClick={() => setMode(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="spst-row__sub" style={{ marginTop: 8 }}>{CAST_MODES.find((m) => m.key === mode)?.hint}</div>
              {mode === 'coordinate' && (
                <input
                  className="spst-input"
                  style={{ marginTop: 10 }}
                  placeholder="Ensemble name (e.g. Refactor crew)"
                  value={ensembleName}
                  onChange={(e) => setEnsembleName(e.target.value)}
                  aria-label="Ensemble name"
                />
              )}
            </div>

            <div className="spst-cast__section">
              <div className="spst-cast__section-head">
                <span className="spst-eyebrow">Target sessions</span>
                <span className="spst-meta">{selected.size} selected</span>
              </div>
              {!activeProjectId ? (
                <div className="spst-row__sub">Open a project to see sessions.</div>
              ) : eligible.length === 0 ? (
                <StudioState icon={<IconCast />} title="No eligible sessions"
                  text="Spawn or resume a session in this project, then cast onto it." />
              ) : (
                <div className="spst-targets" role="listbox" aria-multiselectable={mode !== 'single'}>
                  {eligible.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      role="option"
                      aria-selected={selected.has(s.id)}
                      className={`spst-target ${selected.has(s.id) ? 'spst-target--selected' : ''}`}
                      onClick={() => toggleTarget(s.id)}
                    >
                      <span className="spst-target__idx">{idx + 1}</span>{s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {isAttach && (
          <div className="spst-cast__section">
            <div className="spst-row__sub">
              This spell will auto-activate whenever a session spawns for this task.
            </div>
          </div>
        )}

        {confirmRisky && !isAttach && (
          <div className="spst-confirm">
            <IconWarn />
            <div className="spst-confirm__body">
              <div className="spst-confirm__title">This spell has side effects</div>
              <div className="spst-confirm__text">
                {spell.rules.filter((r) => r.action.type === 'run-command' || r.action.type === 'continue-loop')
                  .map((r) => describeRule(r)).join(' · ')}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="spst-confirm"><IconWarn /><div className="spst-confirm__body"><div className="spst-confirm__text">{error}</div></div></div>
        )}

        <div className="spst-cast__foot">
          <span className="spst-cast__hint">
            {isAttach ? 'Attach to task' : confirmRisky ? 'Confirm to cast a side-effecting spell.' : 'Casting is undoable for a few seconds.'}
          </span>
          <button className="spst-btn spst-btn--primary" onClick={handleCastClick} type="button" disabled={!canCast}>
            <IconCast />
            {casting ? 'Casting…' : isAttach ? 'Attach spell' : confirmRisky ? 'Cast anyway' : 'Cast'}
          </button>
        </div>
      </div>
    </div>
  );
}
