/* m-kit.jsx — mobile shared primitives: Icon, Mark, Glyph, Avatar, AgentTile.
   Self-contained (does not depend on the desktop kit). Exports to window. */

const M_ICONS = {
  search: 'M11 11l3.5 3.5M7.5 13a5.5 5.5 0 100-11 5.5 5.5 0 000 11z',
  plus: 'M8 3.5v9M3.5 8h9',
  chevronR: 'M6 3.5L10.5 8 6 12.5',
  chevronD: 'M3.5 6L8 10.5 12.5 6',
  chevronL: 'M10 3.5L5.5 8 10 12.5',
  chevronUp: 'M3.5 10L8 5.5 12.5 10',
  sliders: 'M3 5h7M12.5 5H13M3 11h.5M6 11h7M9 3.5v3M5 9.5v3',
  play: 'M5 3.5l7 4.5-7 4.5z',
  settings: 'M8 10a2 2 0 100-4 2 2 0 000 4zM8 1.5v1.5M8 13v1.5M3.05 3.05l1.06 1.06M11.9 11.9l1.05 1.05M1.5 8H3M13 8h1.5M3.05 12.95l1.06-1.06M11.9 4.1l1.05-1.05',
  pin: 'M6 2h4l-.5 3.5L11 8H5l1.5-2.5L6 2zM8 8v5',
  more: 'M4 8h.01M8 8h.01M12 8h.01',
  check: 'M3.5 8.5L6.5 11.5 12.5 5',
  clock: 'M8 4.5V8l2.5 1.5M8 14A6 6 0 108 2a6 6 0 000 12z',
  gitBranch: 'M5 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM5 5v3a3 3 0 003 3M12.5 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM11 5v.5a3 3 0 01-3 3M5 12.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
  listChecks: 'M3 4l1 1 1.5-1.5M3 9l1 1 1.5-1.5M8 4h5M8 9h5M8 13.5h5',
  users: 'M6 7.5a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM2.5 13c0-2 1.6-3.2 3.5-3.2S9.5 11 9.5 13M10.5 7.2a2 2 0 000-4M11 9.9c1.5.2 2.5 1.3 2.5 3.1',
  sparkles: 'M8 2.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6zM12.5 9l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3z',
  folder: 'M2.5 4.5A1 1 0 013.5 3.5h2.4l1 1.3H12.5a1 1 0 011 1v6a1 1 0 01-1 1h-9a1 1 0 01-1-1z',
  terminal: 'M3 4l3 3-3 3M8 11h5',
  layers: 'M8 2l5.5 3L8 8 2.5 5 8 2zM2.5 8L8 11l5.5-3M2.5 11L8 14l5.5-3',
  x: 'M4 4l8 8M12 4l-8 8',
  arrowRight: 'M3 8h9M8.5 4l4 4-4 4',
  arrowUp: 'M8 13V3.5M4 7l4-4 4 4',
  inbox: 'M2.5 9.5h3l1 1.5h3l1-1.5h3M2.5 9.5l1.8-5.5h7.4l1.8 5.5v3a1 1 0 01-1 1h-10a1 1 0 01-1-1z',
  team: 'M8 6.5a2 2 0 100-4 2 2 0 000 4zM3.5 11a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM12.5 11a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM5 14c0-1.6 1.3-2.6 3-2.6s3 1 3 2.6',
  graph: 'M4 4.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM12 4.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM8 14.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM5.3 4.1l1.7 5M10.7 4.1L9 9.1',
  archive: 'M2.5 3.5h11v3h-11zM3.5 6.5v6a1 1 0 001 1h7a1 1 0 001-1v-6M6.5 9h3',
  grid: 'M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5h-4.5zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5h-4.5z',
  pen: 'M2.5 13.5l2.5-.6 7-7-1.9-1.9-7 7zM10.6 4.6l1.9 1.9 1.3-1.3a1 1 0 000-1.4l-.5-.5a1 1 0 00-1.4 0z',
  refresh: 'M13 7a5 5 0 10-1.2 4.2M13 3.5V7h-3.5',
  copy: 'M5.5 5.5h7v8h-7zM3.5 10.5h-1v-8h7v1',
  info: 'M8 7.2v4M8 4.8h.01M8 14A6 6 0 108 2a6 6 0 000 12z',
  doc: 'M5 2h5l3.5 3.5V13a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zM10 2v4h4M6.5 9h4M6.5 11.5h2.5',
  teamview: 'M2.5 3.5h11v9h-11zM8 3.5v9M2.5 8h11',
  sun: 'M8 11a3 3 0 100-6 3 3 0 000 6zM8 1.7v1.6M8 12.7v1.6M2.6 2.6l1.1 1.1M12.3 12.3l1.1 1.1M1.7 8h1.6M12.7 8h1.6M2.6 13.4l1.1-1.1M12.3 3.7l1.1-1.1',
  moon: 'M13.4 9.3A5.5 5.5 0 116.7 2.6 4.6 4.6 0 0013.4 9.3z',
  paperclip: 'M12.5 7l-5.2 5.2a2.6 2.6 0 01-3.7-3.7l5.6-5.6a1.7 1.7 0 012.4 2.4l-5.4 5.4a.85.85 0 01-1.2-1.2L9.9 4.4',
  bot: 'M5 6.5h6a1 1 0 011 1V12a1 1 0 01-1 1H5a1 1 0 01-1-1V7.5a1 1 0 011-1zM8 4v2.5M6.4 9.2h.01M9.6 9.2h.01M3.5 8.5v2.2M12.5 8.5v2.2',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  bell: 'M8 2a4 4 0 00-4 4c0 3-1.2 4-1.2 4h10.4S12 9 12 6a4 4 0 00-4-4zM6.5 13a1.6 1.6 0 003 0',
  film: 'M2.5 3.5h11v9h-11zM5.5 3.5v9M10.5 3.5v9M2.5 6.5h3M10.5 6.5h3M2.5 9.5h3M10.5 9.5h3',
  cast: 'M2.5 11.5a2 2 0 012 2M2.5 8.5a5 5 0 015 5M2.5 5.5a8 8 0 018 8M2.6 13.4h.01',
  spell: 'M8 2.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6z',
  calendar: 'M3 4.5h10v9H3zM3 7h10M5.5 2.5v2M10.5 2.5v2',
  shield: 'M8 2l4.5 1.8v3.4c0 3-1.9 5-4.5 6-2.6-1-4.5-3-4.5-6V3.8L8 2z',
  music: 'M6 12.5a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0zM6 11V4l7-1.6v7M13 9.4a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0z',
  at: 'M8 11a3 3 0 100-6 3 3 0 000 6zM11 8v.8a2 2 0 004 0V8a6 6 0 10-2.3 4.7',
  hash: 'M5.5 2.5L4 13.5M12 2.5l-1.5 11M2.5 5.5h11M2 10.5h11',
};

function Icon({ name, size = 16, sw = 1.6, style, className }) {
  const d = M_ICONS[name] || M_ICONS.info;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={style} className={className} aria-hidden="true">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

/* Maestro mark — command chevron spawning parallel agents: ›··+ */
function Mark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 7l4 5-4 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14.5" cy="12" r="1.1" fill="currentColor" />
      <circle cx="18.2" cy="12" r="1.1" fill="currentColor" />
      <path d="M12.5 12h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/* drawn status glyph (task + session statuses) */
function Glyph({ kind, size = 16 }) {
  const ring = <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />;
  let inner = null;
  switch (kind) {
    case 'todo': case 'idle': inner = ring; break;
    case 'in_progress':
      inner = <><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.28" />
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" pathLength="100" strokeDasharray="62 100" transform="rotate(-90 8 8)" /></>; break;
    case 'working': inner = <>{ring}<circle cx="8" cy="8" r="2.6" fill="currentColor" /></>; break;
    case 'in_review': inner = <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2.3" />; break;
    case 'completed': inner = <><circle cx="8" cy="8" r="6.5" fill="currentColor" /><path d="M5 8.2l2.1 2.1L11 6.4" fill="none" stroke="var(--pn-card)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></>; break;
    case 'cancelled': inner = <>{ring}<path d="M4.5 11.5l7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>; break;
    case 'blocked': case 'failed': inner = <>{ring}<path d="M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>; break;
    case 'archived': case 'stopped': inner = <rect x="3" y="3" width="10" height="10" rx="2.5" fill={kind === 'stopped' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />; break;
    case 'spawning': inner = <>{ring}<path d="M8 2a6 6 0 000 12z" fill="currentColor" /></>; break;
    case 'needsInput': inner = <><circle cx="8" cy="8" r="6.5" fill="currentColor" /><path d="M8 4.6v4" stroke="var(--pn-surface)" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="11" r="0.95" fill="var(--pn-surface)" /></>; break;
    default: inner = ring;
  }
  return <span className={'m-stat m-stat--' + kind} style={{ width: size, height: size }}><svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">{inner}</svg></span>;
}

function Avatar({ a, lg }) {
  return <span className={'m-av' + (lg ? ' m-mav' : '')} style={{ color: a.color, background: a.bg || 'var(--pn-active)' }}>{a.initial}</span>;
}
function Avatars({ list }) {
  if (!list || !list.length) return null;
  if (list.length === 1) return <Avatar a={list[0]} />;
  return <span className="m-av-group">{list.slice(0, 3).map((a, i) => <Avatar key={i} a={a} />)}</span>;
}

const M_AGENT_SRC = {
  claude: '../assets/claude-code-icon.png',
  codex: '../assets/openai-codex-icon.png',
  gemini: '../assets/gemini-logo.png',
};
function AgentTile({ kind }) {
  if (kind === 'terminal') return <div className="m-agent m-agent--term">&gt;_</div>;
  return <div className="m-agent"><img src={M_AGENT_SRC[kind]} alt={kind} /></div>;
}

/* small circular context gauge for the now-playing strip */
function Gauge({ pct, size = 24 }) {
  const r = (size - 5) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return (
    <span className="m-gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="m-gauge__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="2.5" />
        <circle className="m-gauge__fill" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
    </span>
  );
}

Object.assign(window, { Icon, Mark, Glyph, Avatar, Avatars, AgentTile, Gauge, M_AGENT_SRC });

/* Shared mobile-UI bus — lets deep tiles open app-level overlays (pickers,
   sheets) and fire toasts across the separate babel scopes. m-app populates
   these on each render; tiles call window.MUI.openPicker(…) / .notify(…). */
const MUI = { openPicker: () => {}, openSheet: () => {}, openTerminal: () => {}, openRun: () => {}, openDoc: () => {}, openDocs: () => {}, notify: () => {} };
window.MUI = MUI;
