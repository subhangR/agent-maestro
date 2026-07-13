/* app.jsx — assembles the panel layout exploration onto the design canvas. */
const { useState } = React;

const W = 360;
const H = 884;

function App() {
  return (
    <DesignCanvas>
      <DCSection id="left" title="Maestro panel · left" subtitle="Project, tasks, team, skills — three layout directions">
        <DCArtboard id="left-a" label="A · Ledger — editorial & airy" width={W} height={H}><LedgerLeft /></DCArtboard>
        <DCArtboard id="left-b" label="B · Stack — grouped & structured" width={W} height={H}><StackLeft /></DCArtboard>
        <DCArtboard id="left-c" label="C · Console — terminal-influenced" width={W} height={H}><ConsoleLeft /></DCArtboard>
      </DCSection>

      <DCSection id="right" title="Spaces panel · right" subtitle="Sessions & resources — three layout directions">
        <DCArtboard id="right-a" label="A · Roster — status-grouped rows" width={W} height={H}><RosterRight /></DCArtboard>
        <DCArtboard id="right-b" label="B · Cards — calm cards" width={W} height={H}><CardsRight /></DCArtboard>
        <DCArtboard id="right-c" label="C · Now playing — live activity" width={W} height={H}><NowPlayingRight /></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
