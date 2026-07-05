/* mobile.jsx — shell: phone frame, bottom nav, router, sheet host. */
const { useState: mainS } = React;

const NAV = [
  { id: 'tasks', icon: 'listChecks', label: 'Tasks' },
  { id: 'sessions', icon: 'layers', label: 'Sessions', badge: true },
  { id: '_terminal', icon: 'terminal', label: '', center: true },
  { id: 'team', icon: 'users', label: 'Team' },
  { id: 'more', icon: 'more', label: 'More' },
];

const SCREENS = {
  tasks: 'TasksScreen', sessions: 'SessionsScreen', team: 'TeamScreen', more: 'MoreScreen',
};
const PUSH = {
  taskDetail: 'TaskDetail', teamview: 'TeamViewScreen', board: 'BoardScreen',
  memberDetail: 'MemberDetail', skills: 'SkillsScreenM', files: 'FilesScreenM', terminal: 'TerminalScreen',
};
const SHEETS = {
  createTask: 'CreateTaskSheet', createMember: 'CreateMemberSheet', runConfig: 'RunConfigSheet',
  coordConfig: 'RunConfigSheet', sessActions: 'SessActionsSheet', newSession: 'NewSessionSheet',
  switchSession: 'SwitchSessionSheet', settings: 'SettingsSheet', confirmClose: 'ConfirmCloseDialog',
};

function App() {
  const [tab, setTab] = mainS('tasks');
  const [stack, setStack] = mainS([]); // [{screen, data}]
  const [sheet, setSheet] = mainS(null); // {name, data}

  const nav = {
    setTab: (t) => { setStack([]); setTab(t); },
    push: (screen, data) => setStack((s) => [...s, { screen, data }]),
    pop: () => setStack((s) => s.slice(0, -1)),
    sheet: (name, data) => setSheet({ name, data }),
    closeSheet: () => setSheet(null),
  };

  const top = stack[stack.length - 1];
  const TabComp = window[SCREENS[tab]];

  let PushComp = null;
  if (top) PushComp = window[PUSH[top.screen]];

  let SheetComp = null;
  if (sheet) SheetComp = window[SHEETS[sheet.name]];
  const sheetExtra = sheet && sheet.name === 'coordConfig' ? { coord: true } : {};

  const onNav = (n) => {
    if (n.center) { nav.push('terminal'); return; }
    nav.setTab(n.id);
  };
  const terminalActive = top && top.screen === 'terminal';

  return (
    <div className="mb-stage">
      <div className="mb-phone">
        <div className="mb-island"></div>
        <div className="mb-screen-clip">
          <StatusBar />
          {TabComp ? <TabComp nav={nav} /> : null}

          {/* bottom nav (hidden when a full-screen terminal/push that wants full height is up — but keep for most) */}
          {!terminalActive && (
            <div className="mb-nav">
              {NAV.map((n) => n.center ? (
                <div className="mb-navcenter" key={n.id}>
                  <button className="mb-navcenter__btn" onClick={() => onNav(n)}><Icon name={n.icon} /></button>
                </div>
              ) : (
                <button key={n.id} className={'mb-navbtn' + (tab === n.id && !top ? ' mb-navbtn--on' : '')} onClick={() => onNav(n)}>
                  {n.badge && <span className="mb-navbtn__badge"></span>}
                  <Icon name={n.icon} />
                  <span className="mb-navbtn__lab">{n.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* pushed detail screens (stack) */}
          {stack.map((entry, i) => {
            const C = window[PUSH[entry.screen]];
            if (!C) return null;
            return <C key={i} nav={nav} data={entry.data} />;
          })}

          {/* sheet / dialog */}
          {SheetComp && <SheetComp nav={nav} data={sheet.data} {...sheetExtra} />}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
