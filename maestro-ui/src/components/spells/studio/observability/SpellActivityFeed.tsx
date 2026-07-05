import React from 'react';
import { useSpellActivityForSession, type RuleFiredEntry } from '../../../../stores/useActiveSpellsStore';
import { useSpellLibraryStore } from '../../../../stores/useSpellLibraryStore';
import { HOOK_EVENT_LABELS, ACTION_LABELS } from '../../../../utils/spellSummary';
import type { Spell, SpellHookEvent, SpellActionType } from '../../../../app/types/maestro';
import '../../../../styles-spell-active.css';

export interface SpellActivityFeedProps {
  sessionId: string;
  /** Max rows to render (default 20). */
  limit?: number;
}

/** Compact "Ns/m ago" relative time; absolute is exposed via title on the row. */
function relTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

/**
 * SpellActivityFeed (S8) — per-session "why did it fire?" observability. A live,
 * newest-first feed of rule-fired events (spell · rule · event · action ·
 * outcome), consuming the `spell:rule_fired` WS stream. Error outcomes are
 * highlighted so silent failures become visible (FR-7.1, FR-7.2). Real-time —
 * no manual refresh (FR-11.1).
 */
export const SpellActivityFeed = React.memo(function SpellActivityFeed({
  sessionId,
  limit = 20,
}: SpellActivityFeedProps) {
  const activity = useSpellActivityForSession(sessionId);
  const spellById = useSpellLibraryStore((s) => s.spellById);
  const rows = activity.slice(0, limit);

  if (rows.length === 0) {
    return (
      <div className="spa-feed spa-feed--quiet">
        <p className="spa-feed__quiet-title">No automation activity yet</p>
        <p className="spa-feed__quiet-detail">
          When a spell’s rule fires on this session, it’ll show up here — with what ran and
          whether it succeeded.
        </p>
      </div>
    );
  }

  return (
    <ul className="spa-feed" aria-label="Recent automation activity" aria-live="polite">
      {rows.map((e) => (
        <FeedRow key={e.key} entry={e} spellName={spellById(e.spellId)?.name}
          ruleLabel={resolveRuleLabel(spellById(e.spellId), e.ruleId)} />
      ))}
    </ul>
  );
});

function resolveRuleLabel(spell: Spell | undefined, ruleId: string): string | undefined {
  const rule = spell?.rules?.find((r) => r.id === ruleId);
  return rule?.label?.trim() || undefined;
}

const FeedRow = React.memo(function FeedRow({
  entry,
  spellName,
  ruleLabel,
}: {
  entry: RuleFiredEntry;
  spellName?: string;
  ruleLabel?: string;
}) {
  const eventLabel = HOOK_EVENT_LABELS[entry.event as SpellHookEvent] ?? entry.event;
  const actionLabel = ACTION_LABELS[entry.action as SpellActionType] ?? entry.action;
  const isError = entry.outcome === 'error';

  return (
    <li
      className={`spa-feed__row${isError ? ' spa-feed__row--error' : ''}`}
      title={new Date(entry.timestamp).toLocaleString()}
    >
      <span className={`spa-feed__outcome spa-feed__outcome--${entry.outcome}`} aria-hidden>
        {isError ? '✕' : '✓'}
      </span>
      <span className="spa-feed__spell">{spellName ?? entry.spellId}</span>
      {ruleLabel && <span className="spa-feed__rule">{ruleLabel}</span>}
      <span className="spa-feed__meta">
        <span className="spa-feed__event">{eventLabel}</span>
        <span className="spa-feed__arrow" aria-hidden>→</span>
        <span className="spa-feed__action">{actionLabel}</span>
      </span>
      <span className={`spa-feed__result${isError ? ' spa-feed__result--error' : ''}`}>
        {isError ? 'error' : 'ok'}
      </span>
      <span className="spa-feed__time">{relTime(entry.timestamp)}</span>
    </li>
  );
});
