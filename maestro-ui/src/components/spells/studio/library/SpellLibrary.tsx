import React, { useEffect, useMemo, useState } from 'react';
import { useSpellLibraryStore } from '../../../../stores/useSpellLibraryStore';
import { useActiveSpellsStore } from '../../../../stores/useActiveSpellsStore';
import { spellRuleSummary, isRiskySpell } from '../../../../utils/spellSummary';
import type { Spell } from '../../../../app/types/maestro';
import {
  spellColorVars, spellMatchesFilter, FILTER_LABELS, type SpellFilterKey,
  IconSearch, IconPlus, IconBook, IconWarn, StudioState, StudioSkeletons,
} from '../studioShared';

const FILTER_ORDER: SpellFilterKey[] = [
  'all', 'recent', 'seed', 'custom', 'runs-commands', 'loops', 'notifies', 'injects',
];

export interface SpellLibraryProps {
  onOpenDetail: (spellId: string) => void;
  onCreate: () => void;
}

/** S1 — Spell Library / Browser. Grid of all spells with search + derived filters. */
export function SpellLibrary({ onOpenDetail, onCreate }: SpellLibraryProps) {
  const spells = useSpellLibraryStore((s) => s.spells);
  const loading = useSpellLibraryStore((s) => s.loading);
  const error = useSpellLibraryStore((s) => s.error);
  const recentIds = useSpellLibraryStore((s) => s.recentSpellIds);
  const fetchLibrary = useSpellLibraryStore((s) => s.fetchLibrary);
  const byMaestroSessionId = useActiveSpellsStore((s) => s.byMaestroSessionId);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SpellFilterKey>('all');

  useEffect(() => { void fetchLibrary(); }, [fetchLibrary]);

  /** Count of sessions each spell is active on (for the active-somewhere badge). */
  const activeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const list of Object.values(byMaestroSessionId)) {
      for (const a of list) counts.set(a.spellId, (counts.get(a.spellId) ?? 0) + 1);
    }
    return counts;
  }, [byMaestroSessionId]);

  const filterCounts = useMemo(() => {
    const m = new Map<SpellFilterKey, number>();
    for (const key of FILTER_ORDER) {
      m.set(key, spells.filter((s) => spellMatchesFilter(s, key, recentIds)).length);
    }
    return m;
  }, [spells, recentIds]);

  const visible = useMemo<Spell[]>(() => {
    const q = query.trim().toLowerCase();
    let list = spells.filter((s) => spellMatchesFilter(s, filter, recentIds));
    if (q) {
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        spellRuleSummary(s).toLowerCase().includes(q),
      );
    }
    if (filter === 'recent') {
      const order = new Map(recentIds.map((id, i) => [id, i] as const));
      list = [...list].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    } else {
      list = [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
    }
    return list;
  }, [spells, query, filter, recentIds]);

  return (
    <div className="spst-main">
      <div className="spst-search">
        <IconSearch />
        <input
          type="search"
          placeholder="Search spells by name, description, or rule…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search spells"
        />
        <button className="spst-btn spst-btn--primary" onClick={onCreate} type="button">
          <IconPlus /> Create spell
        </button>
      </div>

      <div className="spst-filters" role="tablist" aria-label="Spell filters">
        {FILTER_ORDER.map((key) => {
          const n = filterCounts.get(key) ?? 0;
          if (key !== 'all' && n === 0) return null;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`spst-filter ${filter === key ? 'spst-filter--active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {FILTER_LABELS[key]} <span className="spst-filter__n">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="spst-scroll">
        {loading && spells.length === 0 ? (
          <StudioSkeletons />
        ) : error ? (
          <StudioState
            icon={<IconWarn />}
            title="Couldn't load spells"
            text={error}
            action={<button className="spst-btn" onClick={() => void fetchLibrary()} type="button">Retry</button>}
          />
        ) : spells.length === 0 ? (
          <StudioState
            icon={<IconBook />}
            title="No spells yet"
            text="Seed spells appear here once the server is reachable. Create your own automation to get started."
            action={<button className="spst-btn spst-btn--primary" onClick={onCreate} type="button"><IconPlus /> Create spell</button>}
          />
        ) : visible.length === 0 ? (
          <StudioState
            icon={<IconSearch />}
            title="No matching spells"
            text={query ? `Nothing matches “${query}”.` : 'No spells match this filter.'}
          />
        ) : (
          <div className="spst-grid">
            {visible.map((spell) => (
              <SpellCard
                key={spell.id}
                spell={spell}
                activeCount={activeCounts.get(spell.id) ?? 0}
                onClick={() => onOpenDetail(spell.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SpellCard({ spell, activeCount, onClick }: {
  spell: Spell; activeCount: number; onClick: () => void;
}) {
  const risky = isRiskySpell(spell);
  return (
    <button
      type="button"
      className={`spst-card ${activeCount > 0 ? 'spst-card--active-ring' : ''}`}
      style={spellColorVars(spell.color)}
      onClick={onClick}
      aria-label={`${spell.name} — ${spellRuleSummary(spell)}`}
    >
      <div className="spst-card__top">
        <span className="spst-swatch" aria-hidden>{spell.icon || '✦'}</span>
        <span className="spst-card__name">{spell.name}</span>
      </div>
      {spell.description && <div className="spst-card__desc">{spell.description}</div>}
      <div className="spst-card__rules">{spellRuleSummary(spell)}</div>
      <div className="spst-card__foot">
        <span className={`spst-badge ${spell.isDefault ? 'spst-badge--seed' : 'spst-badge--custom'}`}>
          {spell.isDefault ? 'Seed' : 'Custom'}
        </span>
        {risky && <span className="spst-badge spst-badge--risk">Side effects</span>}
        {activeCount > 0 && (
          <span className="spst-badge spst-badge--live">
            Live · {activeCount}
          </span>
        )}
      </div>
    </button>
  );
}
