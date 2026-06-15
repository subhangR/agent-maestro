import React, { useMemo } from 'react';
import { useActiveSpellsForSession } from '../../stores/useSpellActivationStore';
import { useActiveSpellsStore } from '../../stores/useActiveSpellsStore';
import { useMaestroStore } from '../../stores/useMaestroStore';
import { useSpellLauncherStore } from '../../stores/useSpellLauncherStore';
import { ActiveSpellChip } from './ActiveSpellChip';
import { ActiveSpellRow } from './ActiveSpellRow';

export type ActiveSpellsAnchor = 'header-strip' | 'session-detail' | 'ring-popover' | 'spellbook';

export interface ActiveSpellsPanelProps {
  anchor: ActiveSpellsAnchor;
  /** Required for header-strip / session-detail / ring-popover. */
  sessionId?: string;
  /** Spellbook only — scroll to this session. */
  scrollToSessionId?: string;
  onCastAnother?: () => void;
  /** Open SpellbookDrawer scoped to a session — passed through from the chip menu. */
  onViewInSpellbook?: (sessionId: string) => void;
  /** Open SpellDetailFlyout for the trigger row. */
  onEditTrigger?: (spellId: string) => void;
}

/** ActiveSpellsPanel — single source for all 4 surfaces (03 §3). */
export const ActiveSpellsPanel = React.memo(function ActiveSpellsPanel({
  anchor,
  sessionId,
  scrollToSessionId,
  onCastAnother,
  onViewInSpellbook,
  onEditTrigger,
}: ActiveSpellsPanelProps) {
  const launchOpen = useSpellLauncherStore((s) => s.openLauncher);
  const handleViewInSpellbook = onViewInSpellbook ?? ((_sid: string) => { /* default no-op */ });
  const handleEditTrigger = onEditTrigger ?? ((_spellId: string) => { /* default no-op */ });

  if (anchor === 'spellbook') {
    return (
      <SpellbookBody
        scrollToSessionId={scrollToSessionId}
        onCastAnother={onCastAnother ?? (() => launchOpen({ source: 'workspace', targetSessionIds: [] }))}
        onEditTrigger={handleEditTrigger}
      />
    );
  }

  return (
    <ChipStrip
      sessionId={sessionId ?? null}
      anchor={anchor}
      onViewInSpellbook={handleViewInSpellbook}
      onEditTrigger={handleEditTrigger}
    />
  );
});

/* ---------------- chip-strip (header-strip / session-detail / ring-popover) ---------------- */

interface ChipStripProps {
  sessionId: string | null;
  anchor: ActiveSpellsAnchor;
  onViewInSpellbook: (sessionId: string) => void;
  onEditTrigger: (spellId: string) => void;
}

const ChipStrip = React.memo(function ChipStrip({ sessionId, anchor, onViewInSpellbook, onEditTrigger }: ChipStripProps) {
  const actives = useActiveSpellsForSession(sessionId);
  const openLauncher = useSpellLauncherStore((s) => s.openLauncher);

  if (!sessionId) return null;
  if (actives.length === 0 && anchor === 'header-strip') {
    return (
      <div className={`sp-strip sp-strip--${anchor} sp-strip--empty`}>
        <button
          type="button"
          className="sp-strip__cast"
          onClick={() => openLauncher({ source: 'workspace', targetSessionIds: [sessionId] })}
          aria-label="Cast a spell"
        >
          <span aria-hidden>✦</span> Cast spell
        </button>
      </div>
    );
  }
  if (actives.length === 0) return null;

  return (
    <div className={`sp-strip sp-strip--${anchor}`}>
      {actives.map((a) => (
        <ActiveSpellChip
          key={`${sessionId}:${a.spellId}`}
          sessionId={sessionId}
          active={a}
          onViewInSpellbook={onViewInSpellbook}
          onEditTrigger={onEditTrigger}
        />
      ))}
      {anchor !== 'ring-popover' && (
        <button
          type="button"
          className="sp-strip__cast"
          onClick={() => openLauncher({ source: 'workspace', targetSessionIds: [sessionId] })}
          aria-label="Cast a spell on this session"
        >
          <span aria-hidden>✦</span> Cast
        </button>
      )}
    </div>
  );
});

/* ---------------- spellbook body (project-wide) ---------------- */

interface SpellbookBodyProps {
  scrollToSessionId?: string;
  onCastAnother: () => void;
  onEditTrigger: (spellId: string) => void;
}

const SpellbookBody = React.memo(function SpellbookBody({ scrollToSessionId, onCastAnother, onEditTrigger: _onEditTrigger }: SpellbookBodyProps) {
  const byMaestroSessionId = useActiveSpellsStore((s) => s.byMaestroSessionId);
  const maestroSessions = useMaestroStore((s) => s.sessions);

  const groups = useMemo(() => {
    return Object.entries(byMaestroSessionId)
      .map(([sid, list]) => ({
        sessionId: sid,
        session: maestroSessions[sid] ?? null,
        spells: list,
      }))
      .filter((g) => g.spells.length > 0)
      .sort((a, b) => (a.session?.name ?? '').localeCompare(b.session?.name ?? ''));
  }, [byMaestroSessionId, maestroSessions]);

  return (
    <div className="sp-spellbook__body">
      {groups.length === 0 && (
        <div className="sp-spellbook__empty">
          <p>No active spells in this project.</p>
          <button type="button" onClick={onCastAnother}>✦ Cast one</button>
        </div>
      )}
      {groups.map((g) => (
        <section
          key={g.sessionId}
          className="sp-spellbook__group"
          aria-current={g.sessionId === scrollToSessionId ? 'true' : undefined}
        >
          <h4 className="sp-spellbook__group-title">
            {g.session?.name ?? g.sessionId}
            <span className="sp-spellbook__count">{g.spells.length} active</span>
          </h4>
          {g.spells.map((a) => (
            <ActiveSpellRow key={a.spellId} sessionId={g.sessionId} active={a} />
          ))}
        </section>
      ))}
      <div className="sp-spellbook__footer">
        <button type="button" onClick={onCastAnother}>✦ Cast another</button>
      </div>
    </div>
  );
});
