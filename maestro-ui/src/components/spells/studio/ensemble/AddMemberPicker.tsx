import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMaestroStore } from '../../../../stores/useMaestroStore';

export interface AddMemberPickerProps {
  /** Sessions already in the ensemble — excluded from the list. */
  memberSessionIds: string[];
  onPick: (sessionId: string) => void;
  onClose: () => void;
}

/**
 * AddMemberPicker (S9) — pick a session to add to an ensemble. Lists sessions
 * not already members, searchable; dismisses on outside-click / Escape.
 */
export const AddMemberPicker = React.memo(function AddMemberPicker({
  memberSessionIds,
  onPick,
  onClose,
}: AddMemberPickerProps) {
  const sessions = useMaestroStore((s) => s.sessions);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const candidates = useMemo(() => {
    const members = new Set(memberSessionIds);
    const q = query.trim().toLowerCase();
    return Object.values(sessions)
      .filter((s) => s && !members.has(s.id))
      .filter((s) => !q || (s.name ?? s.id).toLowerCase().includes(q))
      .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  }, [sessions, memberSessionIds, query]);

  return (
    <div ref={ref} className="spa-ens-picker" role="dialog" aria-label="Add member to ensemble">
      <input
        autoFocus
        className="spa-ens-picker__search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add a session…"
        aria-label="Search sessions"
      />
      <ul className="spa-ens-picker__list">
        {candidates.length === 0 ? (
          <li className="spa-ens-picker__empty">No eligible sessions</li>
        ) : (
          candidates.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="spa-ens-picker__item"
                onClick={() => { onPick(s.id); onClose(); }}
              >
                {s.name ?? s.id}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
});
