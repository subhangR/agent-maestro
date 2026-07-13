/* kit.jsx — shared line icons, the Maestro mark, agent tiles, and the one
   canonical rule-summary renderer reused on every surface (FR-11.6). */

const PN_ICONS = {
  search: 'M11 11l3.5 3.5M7.5 13a5.5 5.5 0 100-11 5.5 5.5 0 000 11z',
  plus: 'M8 3.5v9M3.5 8h9',
  chevronR: 'M6 3.5L10.5 8 6 12.5',
  chevronD: 'M3.5 6L8 10.5 12.5 6',
  chevronL: 'M10 3.5L5.5 8 10 12.5',
  chevronUp: 'M3.5 10L8 5.5 12.5 10',
  sliders: 'M3 5h7M12.5 5H13M3 11h.5M6 11h7M9 3.5v3M5 9.5v3',
  play: 'M5 3.5l7 4.5-7 4.5z',
  playFill: 'M5 3.2l8 4.8-8 4.8z',
  settings: 'M8 10a2 2 0 100-4 2 2 0 000 4zM8 1.5v1.5M8 13v1.5M3.05 3.05l1.06 1.06M11.9 11.9l1.05 1.05M1.5 8H3M13 8h1.5M3.05 12.95l1.06-1.06M11.9 4.1l1.05-1.05',
  more: 'M4 8h.01M8 8h.01M12 8h.01',
  check: 'M3.5 8.5L6.5 11.5 12.5 5',
  clock: 'M8 4.5V8l2.5 1.5M8 14A6 6 0 108 2a6 6 0 000 12z',
  listChecks: 'M3 4l1 1 1.5-1.5M3 9l1 1 1.5-1.5M8 4h5M8 9h5M8 13.5h5',
  users: 'M6 7.5a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM2.5 13c0-2 1.6-3.2 3.5-3.2S9.5 11 9.5 13M10.5 7.2a2 2 0 000-4M11 9.9c1.5.2 2.5 1.3 2.5 3.1',
  sparkles: 'M8 2.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6zM12.5 9l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3z',
  folder: 'M2.5 4.5A1 1 0 013.5 3.5h2.4l1 1.3H12.5a1 1 0 011 1v6a1 1 0 01-1 1h-9a1 1 0 01-1-1z',
  terminal: 'M3 4l3 3-3 3M8 11h5',
  x: 'M4 4l8 8M12 4l-8 8',
  arrowRight: 'M3 8h9M8.5 4l4 4-4 4',
  inbox: 'M2.5 9.5h3l1 1.5h3l1-1.5h3M2.5 9.5l1.8-5.5h7.4l1.8 5.5v3a1 1 0 01-1 1h-10a1 1 0 01-1-1z',
  team: 'M8 6.5a2 2 0 100-4 2 2 0 000 4zM3.5 11a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM12.5 11a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM5 14c0-1.6 1.3-2.6 3-2.6s3 1 3 2.6',
  grid: 'M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5h-4.5zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5h-4.5z',
  pen: 'M2.5 13.5l2.5-.6 7-7-1.9-1.9-7 7zM10.6 4.6l1.9 1.9 1.3-1.3a1 1 0 000-1.4l-.5-.5a1 1 0 00-1.4 0z',
  refresh: 'M13 7a5 5 0 10-1.2 4.2M13 3.5V7h-3.5',
  copy: 'M5.5 5.5h7v8h-7zM3.5 10.5h-1v-8h7v1',
  info: 'M8 7.2v4M8 4.8h.01M8 14A6 6 0 108 2a6 6 0 000 12z',
  shield: 'M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4l5-2z',
  doc: 'M5 2h5l3.5 3.5V13a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zM10 2v4h4M6.5 9h4M6.5 11.5h2.5',
  sun: 'M8 11a3 3 0 100-6 3 3 0 000 6zM8 1.7v1.6M8 12.7v1.6M2.6 2.6l1.1 1.1M12.3 12.3l1.1 1.1M1.7 8h1.6M12.7 8h1.6M2.6 13.4l1.1-1.1M12.3 3.7l1.1-1.1',
  moon: 'M13.4 9.3A5.5 5.5 0 116.7 2.6 4.6 4.6 0 0013.4 9.3z',
  calendar: 'M3 4.5h10v9H3zM3 7h10M5.5 2.5v3M10.5 2.5v3',
  at: 'M10.6 8a2.6 2.6 0 11-2.6-2.6M10.6 5.4v3.1a1.8 1.8 0 003.4-.6A6 6 0 108 14',
  hash: 'M6.2 2.5L4.6 13.5M11.4 2.5L9.8 13.5M3 5.6h10.4M2.6 10.4H13',
  alert: 'M8 2.5l5.5 9.5h-11zM8 6.5v3M8 11.2h.01',
  trash: 'M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8M6.7 7v4M9.3 7v4',
  download: 'M8 2.5v7M5 6.5L8 9.5 11 6.5M3.5 12.5h9',
  star: 'M8 2l1.6 3.7 4 .4-3 2.7.9 3.9L8 10.7l-3.5 2 .9-3.9-3-2.7 4-.4z',
  dotsGrip: 'M5.5 4h.01M5.5 8h.01M5.5 12h.01M10.5 4h.01M10.5 8h.01M10.5 12h.01',
  /* spell-specific */
  quote: 'M5 4.5C3.6 5.2 3 6.4 3 8v3.5h3.5V8H5c0-1 .4-1.6 1.3-2zM11.5 4.5C10.1 5.2 9.5 6.4 9.5 8v3.5H13V8h-1.5c0-1 .4-1.6 1.3-2z',
  book: 'M3 3.5h4.5a1.5 1.5 0 011.5 1.5v8a1.2 1.2 0 00-1.2-1.2H3zM13 3.5H8.5A1.5 1.5 0 007 5v8a1.2 1.2 0 011.2-1.2H13z',
  loop: 'M3.5 8a4.5 4.5 0 017.8-3M12.5 8a4.5 4.5 0 01-7.8 3M11.3 2.2v2.8H8.5M4.7 13.8V11H7.5',
  bell: 'M8 2.5a3.5 3.5 0 013.5 3.5c0 3 1 4 1.5 4.5h-10c.5-.5 1.5-1.5 1.5-4.5A3.5 3.5 0 018 2.5zM6.5 12.5a1.5 1.5 0 003 0',
  bolt: 'M8.5 2L4 9h3.2L7 14l4.5-7H8.3L8.5 2z',
  wand: 'M11 3l2 2-8 8-2-2 8-8zM10.5 2.2l.3.9.9.3-.9.3-.3.9-.3-.9-.9-.3.9-.3.3-.9zM13.5 6.2l.2.6.6.2-.6.2-.2.6-.2-.6-.6-.2.6-.2.2-.6z',
  eye: 'M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8zM8 10a2 2 0 100-4 2 2 0 000 4z',
  regex: 'M8 4v6M5.4 5.5l5.2 3M10.6 5.5l-5.2 3M3.5 11.5h2v1.5h-2z',
  send: 'M13.5 2.5l-11 4 4.2 1.8L8.5 13l5-10.5zM6.7 8.3l3.3-3.3',
  layers: 'M8 2l5.5 3L8 8 2.5 5 8 2zM2.5 8L8 11l5.5-3M2.5 11L8 14l5.5-3',
  wifi: 'M2.5 6.2a8 8 0 0111 0M4.6 8.6a5 5 0 016.8 0M6.6 10.9a2 2 0 012.8 0M8 13h.01',
  wifiOff: 'M2.5 6.2a8 8 0 015.5-2.1M13.5 6.2a8 8 0 00-2-1.5M6.6 10.9a2 2 0 012.8 0M8 13h.01M2 2l12 12',
  power: 'M8 2v6M4.5 4.5a5 5 0 107 0',
  filter: 'M2.5 4h11l-4.2 5v3.5L6.7 14V9L2.5 4z',
  arrowUp: 'M8 12.5v-9M4 7l4-4 4 4',
  arrowDown: 'M8 3.5v9M4 9l4 4 4-4',
};

function Icon({ name, size = 16, sw = 1.6, style, className }) {
  const d = PN_ICONS[name] || PN_ICONS.info;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={style} className={className} aria-hidden="true">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

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

const PN_AGENT_SRC = {
  claude: '../assets/claude-code-icon.png',
  codex: '../assets/openai-codex-icon.png',
  gemini: '../assets/gemini-logo.png',
};
function AgentTile({ kind, lg, sm }) {
  const cls = 'pn-agent' + (lg ? ' pn-agent--lg' : '') + (sm ? ' sp-agent--sm' : '');
  if (kind === 'terminal') return <div className={cls + ' pn-agent--term'}>&gt;_</div>;
  return <div className={cls}><img src={PN_AGENT_SRC[kind]} alt={kind} /></div>;
}

/* ---- The canonical rule summary. Returns an array of tokens so callers can
   style the trigger/action/config parts consistently everywhere. FR-11.6. */
function eventPhrase(rule) {
  const t = rule.trigger;
  if (t.type === 'schedule') return 'On a schedule';
  const ev = HOOK_EVENTS.find(e => e.id === t.hookEvent);
  const base = {
    SessionStart: 'On session start',
    UserPromptSubmit: 'On every prompt',
    PreToolUse: 'Before',
    PostToolUse: 'After',
    Notification: 'On notify',
    Stop: 'On stop',
    SubagentStop: 'On subagent stop',
    SessionEnd: 'On session end',
  }[t.hookEvent] || (ev ? ev.label : t.hookEvent);
  if ((t.hookEvent === 'PreToolUse' || t.hookEvent === 'PostToolUse')) {
    const tools = t.matcher ? t.matcher.split('|').join('/') : 'any tool';
    return base + ' ' + tools;
  }
  if (t.matcher) return base + ' matching /' + t.matcher + '/';
  return base;
}
function actionPhrase(rule) {
  const a = rule.action;
  switch (a.type) {
    case 'inject-prompt': return { verb: 'say to the agent', code: truncate(a.prompt, 46) };
    case 'feed-context':  return { verb: 'feed context', code: truncate(a.prompt, 46) };
    case 'run-command': {
      const cmd = [a.command, ...(a.args || [])].join(' ');
      return { verb: 'run', code: cmd, tail: a.feedOutput ? 'and feed output back' : '' };
    }
    case 'continue-loop': {
      const lt = LOOP_TYPES.find(l => l.id === a.loopType);
      return { verb: 'keep going', code: (lt ? lt.label.toLowerCase() : a.loopType), tail: '· max ' + (a.maxIterations || 1) };
    }
    case 'notify-channel': return { verb: 'notify', code: a.channel || 'default channel' };
    default: return { verb: a.type, code: '' };
  }
}
function truncate(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/* Inline JSX summary used in cards / chips / detail. compact hides the code chip. */
function RuleSummary({ rule, compact }) {
  const ap = actionPhrase(rule);
  return (
    <span className="sp-rsum">
      <span className="sp-rsum__trig">{eventPhrase(rule)}</span>
      <span className="sp-rsum__arrow">→</span>
      <span className="sp-rsum__verb">{ap.verb}</span>
      {!compact && ap.code ? <code className="sp-rsum__code">{ap.code}</code> : null}
      {!compact && ap.tail ? <span className="sp-rsum__tail">{ap.tail}</span> : null}
    </span>
  );
}

/* A short one-line summary of a whole spell's rules for library cards. */
function spellSummary(spell) {
  const n = spell.rules.length;
  const head = n + (n === 1 ? ' rule' : ' rules');
  const bits = spell.rules.slice(0, 2).map(r => {
    const ap = actionPhrase(r);
    return eventPhrase(r).replace(/^On /, '').replace(/^After /, 'after ').replace(/^Before /, 'before ') + ' → ' + ap.verb;
  });
  return head + ' · ' + bits.join(' · ') + (n > 2 ? ' · …' : '');
}

/* Derived capability categories for filtering (FR-1.5). */
function spellCategories(spell) {
  const cats = new Set();
  for (const r of spell.rules) {
    const t = r.action.type;
    if (t === 'run-command') cats.add('runs');
    if (t === 'continue-loop') cats.add('loops');
    if (t === 'notify-channel') cats.add('notifies');
    if (t === 'inject-prompt' || t === 'feed-context') cats.add('injects');
  }
  return [...cats];
}
function spellIsRisky(spell) {
  return spell.rules.some(r => r.enabled && (r.action.type === 'run-command' || r.action.type === 'continue-loop'));
}

Object.assign(window, {
  Icon, Mark, AgentTile, RuleSummary, eventPhrase, actionPhrase, truncate,
  spellSummary, spellCategories, spellIsRisky,
});
