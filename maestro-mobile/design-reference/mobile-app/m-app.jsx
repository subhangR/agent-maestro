/* m-app.jsx — mobile app shell: header, screen switch, now-playing, tab bar, sheets. */
const { useState: useStateA } = React;

const ACTIVE_SESSION = TEAM.coord.children[0]; // fluffy-starlight

function MaestroMobile() {
  const [tab, setTab] = useStateA('sessions');
  const [dark, setDark] = useStateA(false);
  const [termSession, setTermSession] = useStateA(null);
  const [sheet, setSheet] = useStateA(null); // 'command' | 'project' | 'createTask' | 'newMember'
  const [editMember, setEditMember] = useStateA(null);
  const [runTask, setRunTask] = useStateA(null);
  const [picker, setPicker] = useStateA(null);
  const [doc, setDoc] = useStateA(null);
  const [diagram, setDiagram] = useStateA(null);
  const [docsKind, setDocsKind] = useStateA(null);
  const [toast, setToast] = useStateA(null);

  const notify = (msg) => {
    setToast(msg);
    clearTimeout(window.__mToast);
    window.__mToast = setTimeout(() => setToast(null), 1700);
  };
  const openTerminal = (s) => setTermSession(s);

  // populate the shared bus so deep tiles can open overlays across babel scopes
  MUI.openPicker = setPicker;
  MUI.openSheet = setSheet;
  MUI.openTerminal = openTerminal;
  MUI.openRun = setRunTask;
  MUI.openDoc = (ref) => { const d = window.resolveDoc(ref); if (!d) return; if (window.isDiagramDoc(d)) setDiagram(d); else setDoc(d); };
  MUI.openDocs = (k) => setDocsKind(k || 'markdown');
  MUI.notify = notify;

  const toggleDark = () => setDark((d) => {
    const nd = !d;
    document.documentElement.dataset.theme = nd ? 'dark' : '';
    return nd;
  });

  const newMember = (m) => { setEditMember(m || null); setSheet('newMember'); };

  return (
    <IOSDevice dark={dark}>
      <div className="m-app">
        {/* header */}
        <div className="m-head">
          <button className="m-proj" onClick={() => setSheet('project')}>
            <span className="m-proj__mark"><Mark size={24} /></span>
            <span className="m-proj__name"><span className="m-proj__live"></span> agent-maestro <Icon name="chevronD" size={13} /></span>
          </button>
          <span className="m-head-sp"></span>
          <button className="m-ib" onClick={() => notify('Search')}><Icon name="search" sw={1.7} /></button>
          <button className="m-ib" onClick={() => notify('Notifications')}><Icon name="bell" sw={1.5} /></button>
        </div>

        {/* screen */}
        {tab === 'sessions' && <SessionsScreen onOpen={openTerminal} onSpawn={(a) => notify('Spawn ' + a)} />}
        {tab === 'tasks' && <TasksScreen onNewTask={() => setSheet('createTask')} />}
        {tab === 'members' && <MembersScreen notify={notify} onNewMember={() => newMember(null)} onEditMember={(m) => newMember(m)} />}
        {tab === 'more' && <MoreScreen dark={dark} onToggleDark={toggleDark} notify={notify} />}

        {/* now-playing (hide on terminal/more) */}
        {tab !== 'more' && <NowPlaying session={ACTIVE_SESSION} onOpen={openTerminal} />}

        {/* tab bar */}
        <div className="m-tabs">
          <button className={'m-tab' + (tab === 'sessions' ? ' m-tab--active' : '')} onClick={() => setTab('sessions')}>
            <Icon name="layers" sw={1.6} /><span className="m-tab__lbl">Sessions</span><span className="m-tab__wait"></span>
          </button>
          <button className={'m-tab' + (tab === 'tasks' ? ' m-tab--active' : '')} onClick={() => setTab('tasks')}>
            <Icon name="listChecks" sw={1.6} /><span className="m-tab__lbl">Tasks</span>
          </button>
          <div className="m-tab m-tab--add">
            <button className="m-fab" onClick={() => setSheet('command')} aria-label="Conduct"><Icon name="plus" size={24} sw={1.8} /></button>
          </div>
          <button className={'m-tab' + (tab === 'members' ? ' m-tab--active' : '')} onClick={() => setTab('members')}>
            <Icon name="users" sw={1.6} /><span className="m-tab__lbl">Members</span>
          </button>
          <button className={'m-tab' + (tab === 'more' ? ' m-tab--active' : '')} onClick={() => setTab('more')}>
            <Icon name="menu" sw={1.7} /><span className="m-tab__lbl">More</span>
          </button>
        </div>

        {/* overlays */}
        {termSession && <TerminalSheet session={termSession} onClose={() => setTermSession(null)} notify={notify} />}
        {sheet === 'command' && <CommandSheet onClose={() => setSheet(null)} notify={notify} />}
        {sheet === 'project' && <ProjectSheet onClose={() => setSheet(null)} notify={notify} />}
        {sheet === 'createTask' && <CreateTaskSheet onClose={() => setSheet(null)} notify={notify} />}
        {sheet === 'newMember' && <TeamMemberSheet member={editMember} onClose={() => { setSheet(null); setEditMember(null); }} notify={notify} />}
        {runTask && <RunConfigSheet task={runTask} onClose={() => setRunTask(null)} notify={notify} />}
        {picker && <PickerSheet config={picker} onClose={() => setPicker(null)} notify={notify} />}
        {doc && <DocSheet doc={doc} onClose={() => setDoc(null)} notify={notify} />}
        {diagram && <DiagramSheet doc={diagram} onClose={() => setDiagram(null)} notify={notify} />}
        {docsKind && <DocsSheet initialKind={docsKind} onClose={() => setDocsKind(null)} notify={notify} />}

        {/* toast */}
        <div className={'m-toast' + (toast ? ' m-toast--in' : '')}>{toast}</div>
      </div>
    </IOSDevice>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<MaestroMobile />);
