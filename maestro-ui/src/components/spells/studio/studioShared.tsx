import React from 'react';
import type { CSSProperties } from 'react';
import { SPELL_COLORS, resolveSpellColorId } from '../../../app/constants/spellColors';
import type { Spell, SpellColorSlug } from '../../../app/types/maestro';

/**
 * Resolve a server color slug to the `--spst-color-*` CSS custom properties the
 * Studio stylesheet reads (swatch, ring, active-card border). Picks the light
 * or dark scheme off the document theme (non-reactive to mid-session toggles,
 * which is acceptable for an identity accent).
 */
export function spellColorVars(color: SpellColorSlug | string | undefined | null): CSSProperties {
  const id = resolveSpellColorId(color ?? undefined);
  const def = SPELL_COLORS.find((c) => c.id === id) ?? SPELL_COLORS[0];
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';
  const scheme = isDark ? def.dark : def.light;
  return {
    ['--spst-color-primary' as any]: scheme.primary,
    ['--spst-color-dim' as any]: scheme.dim,
    ['--spst-color-border' as any]: scheme.border,
    ['--spst-color-text' as any]: scheme.text,
  } as CSSProperties;
}

/* ── Derived spell filters (FR-1.5 — categories from the rule set) ─────────── */
export type SpellFilterKey =
  | 'all'
  | 'recent'
  | 'seed'
  | 'custom'
  | 'runs-commands'
  | 'loops'
  | 'notifies'
  | 'injects';

export const FILTER_LABELS: Record<SpellFilterKey, string> = {
  all: 'All',
  recent: 'Recent',
  seed: 'Seed',
  custom: 'Custom',
  'runs-commands': 'Runs commands',
  loops: 'Loops',
  notifies: 'Notifies',
  injects: 'Injects',
};

export function spellMatchesFilter(spell: Spell, key: SpellFilterKey, recentIds: string[]): boolean {
  const rules = spell.rules ?? [];
  const has = (t: string) => rules.some((r) => r.action?.type === t);
  switch (key) {
    case 'all': return true;
    case 'recent': return recentIds.includes(spell.id);
    case 'seed': return Boolean(spell.isDefault);
    case 'custom': return !spell.isDefault;
    case 'runs-commands': return has('run-command');
    case 'loops': return has('continue-loop');
    case 'notifies': return has('notify-channel');
    case 'injects': return has('inject-prompt') || has('feed-context');
    default: return true;
  }
}

/* ── Inline icons (16px, currentColor — no external dep) ───────────────────── */
type IconProps = { className?: string };
const svg = (path: React.ReactNode): React.FC<IconProps> =>
  function Icon({ className }: IconProps) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
      </svg>
    );
  };

export const IconSpark = svg(<><path d="M12 3v18M3 12h18" /><path d="M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" opacity="0.5" /></>);
export const IconSearch = svg(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>);
export const IconBook = svg(<><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" /><path d="M8 3v18" /></>);
export const IconCast = svg(<><path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" /><path d="M2 12a6 6 0 0 1 6 6M2 16a2 2 0 0 1 2 2" /><circle cx="3" cy="20" r="0.5" /></>);
export const IconEntity = svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>);
export const IconPlus = svg(<><path d="M12 5v14M5 12h14" /></>);
export const IconEdit = svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>);
export const IconCopy = svg(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>);
export const IconTrash = svg(<><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></>);
export const IconWarn = svg(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>);
export const IconChevron = svg(<><path d="M9 18l6-6-6-6" /></>);
export const IconBack = svg(<><path d="M19 12H5M12 19l-7-7 7-7" /></>);
export const IconSend = svg(<><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></>);

/* ── State views ──────────────────────────────────────────────────────────── */
export function StudioState({ icon, title, text, action }: {
  icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode;
}) {
  return (
    <div className="spst-state" role="status">
      {icon && <div className="spst-state__icon">{icon}</div>}
      <div className="spst-state__title">{title}</div>
      {text && <div className="spst-state__text">{text}</div>}
      {action}
    </div>
  );
}

export function StudioSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="spst-grid" aria-hidden>
      {Array.from({ length: count }).map((_, i) => <div key={i} className="spst-skel" />)}
    </div>
  );
}
