/* buttons.jsx — Run + Coordinate buttons. Relies on kit.jsx (Icon). */

/* play triangle that nudges on hover (run) */
function RunGlyph() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3.2l8 4.8-8 4.8z" fill="currentColor" /></svg>;
}
/* conductor → spawning parallel agents (coordinate); dots fan out on hover */
function CoordGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="8" r="2.1" fill="currentColor" />
      <path className="pn-spawn__line" d="M5.8 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <g className="pn-spawn__node pn-spawn__n1"><circle cx="12" cy="8" r="1.7" fill="currentColor" /></g>
      <g className="pn-spawn__node pn-spawn__n2" style={{ opacity: 0.0 }}></g>
      <g className="pn-spawn__node pn-spawn__n3"><circle cx="12" cy="8" r="1.7" fill="currentColor" /></g>
    </svg>
  );
}

function RunButton({ solid, sm, kbd }) {
  return (
    <button className={'pn-run2 pn-run2--run' + (solid ? ' pn-run2--solid' : '') + (sm ? ' pn-run2--sm' : '')}>
      <span className="pn-run2__chip"><RunGlyph /></span>
      <span className="pn-run2__label">run{!sm && <span className="pn-run2__sub">single worker</span>}</span>
      {kbd && <span className="pn-run2__kbd">⌘↵</span>}
    </button>
  );
}
function CoordButton({ solid, sm, kbd }) {
  return (
    <button className={'pn-run2 pn-run2--coord' + (solid ? ' pn-run2--solid' : '') + (sm ? ' pn-run2--sm' : '')}>
      <span className="pn-run2__chip"><CoordGlyph /></span>
      <span className="pn-run2__label">coordinate{!sm && <span className="pn-run2__sub">spawn a team</span>}</span>
      {kbd && <span className="pn-run2__kbd">⇧⌘↵</span>}
    </button>
  );
}
function SplitRun({ avatar }) {
  return (
    <div className="pn-split">
      <button className="pn-split__play"><span className="pn-split__av">{avatar || '🎻'}</span>run with Rhea</button>
      <span className="pn-split__div"></span>
      <button className="pn-split__caret"><Icon name="chevronD" /></button>
    </div>
  );
}

function Buttons() {
  return (
    <div className="pn-b2-stage">
      <h1 className="pn-b2-h">Run &amp; Coordinate</h1>
      <p className="pn-b2-sub">The two ways to start work on a task. <strong>Run</strong> executes with a single worker; <strong>Coordinate</strong> hands it to an orchestrator that spawns a team. Run reads green/go; coordinate reads brass/conductor — the play nudges, the spawn-dots fan out.</p>

      <div className="pn-b2-cap">Default pair — hover to see them animate</div>
      <div className="pn-b2-row">
        <RunButton kbd />
        <CoordButton kbd />
      </div>
      <p className="pn-b2-note">Resting: a hairline button with a soft accent chip. Hover: border picks up the accent, the chip fills, the glyph animates.</p>

      <div className="pn-b2-cap">Solid — when run is the single primary action</div>
      <div className="pn-b2-row">
        <RunButton solid />
        <CoordButton solid />
      </div>

      <div className="pn-b2-cap">Compact — in a task row / footer</div>
      <div className="pn-b2-row">
        <RunButton sm />
        <CoordButton sm />
      </div>

      <div className="pn-b2-cap">Split run — pick which member executes</div>
      <div className="pn-b2-row">
        <SplitRun />
      </div>

      <div className="pn-b2-cap">In context</div>
      <div className="pn-b2-ctx">
        <div className="pn-b2-ctx__t">
          <div className="pn-b2-ctx__title">Fix terminal reparenting crash</div>
          <div className="pn-b2-ctx__sub">3 subtasks · high priority · unassigned</div>
        </div>
        <RunButton sm />
        <CoordButton sm />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Buttons />);
