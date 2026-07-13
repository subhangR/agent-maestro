/* left-panels.jsx — three layouts for the Maestro (left) panel.
   A · Ledger   — editorial, airy, hairline rows, sectioned
   B · Stack    — grouped collapsible, structured, denser
   C · Console  — refined terminal-influenced, mono-forward            */

/* ----- shared row pieces ----- */
function TaskRow({ status, title, prio, id, subs, assignee, sel }) {
  const dotClass = { run: 'pn-dot--run', wait: 'pn-dot--wait', todo: 'pn-dot--idle', block: 'pn-dot--block' }[status] || 'pn-dot--idle';
  return (
    <div className={'pn-row' + (sel ? ' pn-row--sel' : '')}>
      <div className="pn-row__lead">
        <span className={'pn-dot-wrap'}>
          <span className={'pn-dot ' + dotClass + (status === 'run' ? ' pn-dot--live' : '')}></span>
        </span>
      </div>
      <div className="pn-row__body">
        <div className="pn-row__title">{title}</div>
        <div className="pn-row__sub">
          {prio && <span className={'pn-tag pn-tag--' + prio}>{prio}</span>}
          <span className="pn-meta">#{id}{subs ? ` · ${subs} subtasks` : ''}</span>
        </div>
      </div>
      <div className="pn-row__trail">
        {assignee && <AgentTile kind={assignee} />}
        <button className="pn-row__run" title="Run"><Icon name="play" /></button>
      </div>
    </div>
  );
}

/* ============================== A · LEDGER ============================== */
function LedgerLeft() {
  return (
    <div className="pn-panel">
      <div className="pn-head">
        <span className="pn-mark"><Mark /></span>
        <span className="pn-proj">agent-maestro <Icon name="chevronD" size={13} /></span>
        <span className="pn-head-spacer"></span>
        <button className="pn-ib" title="Settings"><Icon name="settings" /></button>
      </div>

      <div className="pn-tabs">
        <button className="pn-tab pn-tab--active">Tasks <span className="pn-tab-n">6</span></button>
        <button className="pn-tab">Team <span className="pn-tab-n">4</span></button>
        <button className="pn-tab">Skills</button>
        <button className="pn-tab">Lists <span className="pn-tab-n">2</span></button>
      </div>

      <div className="pn-search">
        <Icon name="search" />
        <input placeholder="Search tasks" />
        <span className="pn-kbd">⌘K</span>
      </div>
      <div className="pn-filters">
        <button className="pn-filter pn-filter--active">All</button>
        <button className="pn-filter">High</button>
        <button className="pn-filter">Mine</button>
        <button className="pn-filter" style={{ marginLeft: 'auto' }}><Icon name="sliders" size={13} /> Sort</button>
      </div>

      <div className="pn-scroll">
        <div className="pn-sec-head"><span className="pn-eyebrow">In progress <span className="pn-count">· 2</span></span><span className="pn-line"></span></div>
        <div className="pn-list">
          <TaskRow status="run" title="Fix terminal reparenting crash on board close" prio="high" id="142" subs={3} assignee="claude" />
          <TaskRow status="run" title="WebSocket pipeline — dedupe session updates" prio="med" id="138" assignee="codex" />
        </div>

        <div className="pn-sec-head"><span className="pn-eyebrow">Up next <span className="pn-count">· 4</span></span><span className="pn-line"></span></div>
        <div className="pn-list">
          <TaskRow status="todo" title="Add a model-profile indirection layer" prio="med" id="151" subs={2} />
          <div className="pn-sub"><span className="pn-sub__check"><Icon name="check" size={10} sw={2} /></span><span className="pn-sub__title">Define profile config schema</span></div>
          <div className="pn-sub pn-sub--done"><span className="pn-sub__check"><Icon name="check" size={10} sw={2} /></span><span className="pn-sub__title">Audit current model strings</span></div>
          <TaskRow status="todo" title="Verify Opus 1M spawns with 1M context window" prio="low" id="149" />
          <TaskRow status="block" title="Migrate task ordering to server persistence" prio="med" id="144" assignee="gemini" />
          <TaskRow status="todo" title="Voice directives — Alexa coordinator handoff" prio="low" id="156" />
        </div>
      </div>
      <div className="pn-fade"></div>
      <div className="pn-foot">
        <button className="pn-btn pn-btn--primary pn-btn--block"><Icon name="plus" size={14} /> New task <span className="pn-kbd" style={{ color: 'rgba(244,242,236,.6)', borderColor: 'rgba(244,242,236,.25)', background: 'transparent' }}>⌘N</span></button>
      </div>
    </div>
  );
}

/* ============================== B · STACK ============================== */
function StackGroup({ label, count, open, children, prog }) {
  return (
    <div>
      <button className="pn-stack-head">
        <Icon name={open ? 'chevronD' : 'chevronR'} size={13} />
        <span className="pn-stack-title">{label}</span>
        <span className="pn-chip">{count}</span>
        {prog != null && <span className="pn-stack-prog"><i style={{ width: prog + '%' }}></i></span>}
      </button>
      {open && <div className="pn-list">{children}</div>}
    </div>
  );
}
function StackRow({ status, title, prio, id, assignee }) {
  const dotClass = { run: 'pn-dot--run', wait: 'pn-dot--wait', todo: 'pn-dot--idle', block: 'pn-dot--block' }[status] || 'pn-dot--idle';
  return (
    <div className="pn-srow">
      <span className={'pn-dot ' + dotClass}></span>
      <div className="pn-srow__body">
        <div className="pn-srow__title">{title}</div>
        <div className="pn-srow__meta">
          <span className="pn-meta">#{id}</span>
          <span className={'pn-prio pn-prio--' + prio}>{prio}</span>
        </div>
      </div>
      {assignee && <AgentTile kind={assignee} />}
    </div>
  );
}
function StackLeft() {
  return (
    <div className="pn-panel">
      <div className="pn-head">
        <span className="pn-mark"><Mark /></span>
        <span className="pn-proj">agent-maestro <Icon name="chevronD" size={13} /></span>
        <span className="pn-head-spacer"></span>
        <div className="pn-seg">
          <button className="pn-seg-i pn-seg-i--active">List</button>
          <button className="pn-seg-i">Board</button>
        </div>
      </div>

      <div className="pn-tabs">
        <button className="pn-tab pn-tab--active">Tasks <span className="pn-tab-n">6</span></button>
        <button className="pn-tab">Team <span className="pn-tab-n">4</span></button>
        <button className="pn-tab">Skills</button>
        <button className="pn-tab">Lists <span className="pn-tab-n">2</span></button>
      </div>

      <div className="pn-search">
        <Icon name="search" />
        <input placeholder="Search tasks" />
        <button className="pn-ib" style={{ width: 22, height: 22 }}><Icon name="filter" size={13} /></button>
      </div>

      <div className="pn-scroll">
        <StackGroup label="High priority" count={1} open prog={0}>
          <StackRow status="run" title="Fix terminal reparenting crash on board close" prio="high" id="142" assignee="claude" />
        </StackGroup>
        <StackGroup label="In progress" count={2} open prog={40}>
          <StackRow status="run" title="WebSocket pipeline — dedupe session updates" prio="med" id="138" assignee="codex" />
          <StackRow status="block" title="Migrate task ordering to server persistence" prio="med" id="144" assignee="gemini" />
        </StackGroup>
        <StackGroup label="Backlog" count={3} open prog={0}>
          <StackRow status="todo" title="Add a model-profile indirection layer" prio="med" id="151" />
          <StackRow status="todo" title="Verify Opus 1M spawns with 1M context window" prio="low" id="149" />
          <StackRow status="todo" title="Voice directives — Alexa coordinator handoff" prio="low" id="156" />
        </StackGroup>
        <StackGroup label="Done" count={8} open={false} />
      </div>
      <div className="pn-fade"></div>
      <div className="pn-foot">
        <button className="pn-btn pn-btn--primary pn-btn--block"><Icon name="plus" size={14} /> New task</button>
        <button className="pn-btn" title="Run selected"><Icon name="play" size={13} /></button>
      </div>
    </div>
  );
}

/* ============================== C · CONSOLE ============================== */
function ConRow({ idx, status, title, prio, k }) {
  const dotClass = { run: 'pn-dot--run', wait: 'pn-dot--wait', todo: 'pn-dot--idle', block: 'pn-dot--block' }[status] || 'pn-dot--idle';
  const prioColor = { high: 'var(--pn-block)', med: 'var(--pn-ink-3)', low: 'var(--pn-ink-4)' }[prio];
  return (
    <div className="pn-con-row">
      <span className="pn-con-row__idx">{idx}</span>
      <span className={'pn-dot ' + dotClass}></span>
      <span className="pn-con-row__title">{title}</span>
      <span className="pn-meta" style={{ color: prioColor, textTransform: 'uppercase', fontSize: 10 }}>{prio}</span>
      <span className="pn-con-row__k">{k}</span>
    </div>
  );
}
function ConsoleLeft() {
  return (
    <div className="pn-panel">
      <div className="pn-con-head">
        <span className="pn-prompt">›</span>
        <span>maestro/</span><span className="pn-proj-n">agent-maestro</span>
        <span className="pn-head-spacer" style={{ flex: 1 }}></span>
        <span className="pn-meta">6 open</span>
      </div>

      <div className="pn-con-input">
        <span className="pn-prompt">⌘</span>
        <span style={{ flex: 1 }}>search or run a command…</span>
        <span className="pn-kbd">K</span>
      </div>

      <div className="pn-con-tabs">
        <button className="pn-con-tab pn-con-tab--active">Tasks</button>
        <button className="pn-con-tab">Team</button>
        <button className="pn-con-tab">Skills</button>
        <button className="pn-con-tab">Lists</button>
      </div>

      <div className="pn-scroll">
        <div className="pn-con-rule"><span>running</span><span className="pn-line"></span><span style={{ color: 'var(--pn-run)' }}>2</span></div>
        <ConRow idx="142" status="run" title="Fix terminal reparenting crash" prio="high" k="↵ open" />
        <ConRow idx="138" status="run" title="WebSocket — dedupe session updates" prio="med" k="↵ open" />

        <div className="pn-con-rule"><span>queued</span><span className="pn-line"></span><span>4</span></div>
        <ConRow idx="151" status="todo" title="Model-profile indirection layer" prio="med" k="r run" />
        <ConRow idx="149" status="todo" title="Verify Opus 1M context window" prio="low" k="r run" />
        <ConRow idx="144" status="block" title="Migrate task ordering to server" prio="med" k="r run" />
        <ConRow idx="156" status="todo" title="Voice directives — Alexa handoff" prio="low" k="r run" />

        <div className="pn-con-rule"><span>done</span><span className="pn-line"></span><span>8</span></div>
        <ConRow idx="140" status="todo" title="Add /loop recurring command" prio="low" k="" />
      </div>
      <div className="pn-fade"></div>
      <div className="pn-foot" style={{ fontFamily: 'var(--pn-mono)' }}>
        <button className="pn-btn pn-btn--primary pn-btn--block" style={{ fontFamily: 'var(--pn-mono)', fontSize: 12 }}><span className="pn-prompt" style={{ color: 'rgba(244,242,236,.7)' }}>$</span> maestro new task</button>
      </div>
    </div>
  );
}

Object.assign(window, { LedgerLeft, StackLeft, ConsoleLeft });
