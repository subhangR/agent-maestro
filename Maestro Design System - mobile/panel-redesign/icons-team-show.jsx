/* icons-team-show.jsx — renders all 50 emblems + style variants. */

function Tile({ icon, cls }) {
  return (
    <span className={'ti-tile ' + (cls || '')}>
      <svg viewBox="0 0 24 24">{icon.svg}</svg>
    </span>
  );
}

function Gallery() {
  const all = [...window.TEAM_ICONS_1, ...window.TEAM_ICONS_2];
  const instruments = window.TEAM_ICONS_1.slice(0, 15);
  const notation = window.TEAM_ICONS_1.slice(15);
  const atelier = window.TEAM_ICONS_2.slice(0, 14);
  const celestial = window.TEAM_ICONS_2.slice(14);
  const hero = all.find((i) => i.id === 'baton');

  const Section = ({ label, count, items }) => (
    <>
      <div className="ti-cap">{label} <span style={{ color: 'var(--pn-ink-4)' }}>· {count}</span><span className="ln"></span></div>
      <div className="ti-grid">
        {items.map((ic) => (
          <div className="ti-cell" key={ic.id} title={ic.id}>
            <Tile icon={ic} />
            <span className="ti-name">{ic.name}</span>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="ti-stage">
      <h1 className="ti-h">Team member emblems</h1>
      <p className="ti-sub">Fifty bespoke avatars in one monoline family — instruments, notation, atelier tools and celestial marks — drawn on a 24px grid with a single brass accent each. Pick a glyph + a tile style per member.</p>

      <div className="ti-cap">Tile styles<span className="ln"></span></div>
      <div className="ti-variants">
        {[['Paper', ''], ['Ring', 'ti-tile--ring'], ['Tint', 'ti-tile--tint'], ['Sage', 'ti-tile--sage'], ['Solid', 'ti-tile--solid'], ['Ink', 'ti-tile--ink']].map(([label, cls]) => (
          <div className="ti-vcol" key={label}>
            <Tile icon={hero} cls={'ti-tile--lg ' + cls} />
            <span className="ti-vlabel">{label}</span>
          </div>
        ))}
      </div>

      <Section label="Instruments" count={instruments.length} items={instruments} />
      <Section label="Notation &amp; conducting" count={notation.length} items={notation} />
      <Section label="Atelier &amp; craft" count={atelier.length} items={atelier} />
      <Section label="Celestial &amp; nature" count={celestial.length} items={celestial} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Gallery />);
