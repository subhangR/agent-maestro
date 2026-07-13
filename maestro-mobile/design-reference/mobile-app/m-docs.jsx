/* m-docs.jsx — Task docs & diagrams for mobile, faithful to agent-maestro's
   DocViewer / ProjectDocsList / ExcalidrawBoard.

   - Markdown docs  → DocSheet: an editorial reader (icon · title · filename ·
     .ext badge · Path/Added/By/Session meta · rendered markdown with mermaid +
     inline ```excalidraw``` embeds).
   - Diagram docs   → DiagramSheet: a full-screen Excalidraw-style board in view
     mode (Edit/View toggle, pan + pinch-free zoom), rendered with rough.js.
   - DocsSheet      → the unified browser: Docs / Diagrams segmented, Open/Done/
     All sub-tabs, done-radio + close, time-ago — a phone port of ProjectDocsList.
   Exports DocSheet, DiagramSheet, DocsSheet to window. */
const { useState: useStateD, useEffect: useEffectD, useRef: useRefD } = React;

/* ============================ helpers ============================ */
function fmtDate(ts) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function docIcon(d) {
  if (window.isDiagramDoc(d)) return '⬡';
  return /\.(md|mdx|markdown)$/.test(d.filePath || '') ? 'M↓' : '{ }';
}
function fileName(p) { return (p || '').split('/').pop(); }
function fileExt(p) { const parts = (p || '').split('.'); return parts.length > 1 ? parts.pop().toLowerCase() : ''; }

/* ============================ markdown ============================ */
const MERMAID_LANGS = /^(mermaid|graph|flowchart|sequencediagram|erdiagram|classdiagram|statediagram|gantt|pie|journey|mindmap|timeline)$/i;
function isMermaidish(code) {
  const f = (code.trim().split('\n')[0] || '').trim();
  return /^(graph |flowchart |sequenceDiagram|erDiagram|classDiagram|stateDiagram|gantt|pie |journey|mindmap|timeline)/.test(f);
}

function mdInline(text) {
  const nodes = []; let k = 0, last = 0, m;
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**') || t.startsWith('__')) nodes.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t[0] === '`') nodes.push(<code key={k++} className="m-md__code">{t.slice(1, -1)}</code>);
    else if (t[0] === '[') { const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t); nodes.push(<a key={k++} className="m-md__a" href={mm[2]} onClick={(e) => e.preventDefault()}>{mm[1]}</a>); }
    else nodes.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function InlineExcaliEmbed({ docId, onOpen }) {
  const d = window.DOCS_BY_ID[docId];
  return (
    <button className="m-embed" onClick={() => d && onOpen && onOpen(d)}>
      <span className="m-embed__ic">⬡</span>
      <span className="m-embed__body">
        <span className="m-embed__t">{d ? d.title : 'Diagram'}</span>
        <span className="m-embed__sub">{d ? fileName(d.filePath) : docId}</span>
      </span>
      <span className="m-embed__open">Open <Icon name="chevronR" size={13} /></span>
    </button>
  );
}

function MermaidCard({ lang, code }) {
  return (
    <div className="m-mermaid">
      <div className="m-mermaid__bar"><span className="m-mermaid__hex">⬡</span> {lang || 'mermaid'} diagram</div>
      <pre className="m-mermaid__code"><code>{code}</code></pre>
    </div>
  );
}

function Markdown({ src, onOpenDiagram }) {
  const lines = (src || '').replace(/\r/g, '').split('\n');
  const out = []; let i = 0, key = 0;
  const BREAK = /^(#{1,4}\s|>\s?|```|\s*([-*+]|\d+\.)\s|(-{3,}|\*{3,}|_{3,})\s*$)/;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++;
      const code = buf.join('\n');
      if (/^excalidraw$/i.test(lang)) out.push(<InlineExcaliEmbed key={key++} docId={code.trim()} onOpen={onOpenDiagram} />);
      else if (MERMAID_LANGS.test(lang) || (!lang && isMermaidish(code))) out.push(<MermaidCard key={key++} lang={lang} code={code} />);
      else out.push(<pre key={key++} className="m-md__pre"><code>{code}</code></pre>);
      continue;
    }
    const hm = /^(#{1,4})\s+(.*)$/.exec(line);
    if (hm) { const lvl = Math.min(hm[1].length, 4); out.push(React.createElement('h' + lvl, { key: key++, className: 'm-md__h m-md__h' + lvl }, mdInline(hm[2]))); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push(<hr key={key++} className="m-md__hr" />); i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(<blockquote key={key++} className="m-md__quote">{mdInline(buf.join(' '))}</blockquote>); continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s/.test(line); const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        let it = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
        const task = /^\[([ xX])\]\s+/.exec(it);
        if (task) { const done = task[1].toLowerCase() === 'x'; it = it.replace(/^\[([ xX])\]\s+/, ''); items.push(<li key={i} className={'m-md__task' + (done ? ' m-md__task--done' : '')}><span className="m-md__check">{done ? '✓' : ''}</span><span>{mdInline(it)}</span></li>); }
        else items.push(<li key={i}>{mdInline(it)}</li>);
        i++;
      }
      out.push(React.createElement(ordered ? 'ol' : 'ul', { key: key++, className: 'm-md__list' }, items));
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const buf = [line]; i++;
    while (i < lines.length && lines[i].trim() !== '' && !BREAK.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push(<p key={key++} className="m-md__p">{mdInline(buf.join(' '))}</p>);
  }
  return <div className="m-md">{out}</div>;
}

/* ============================ excalidraw board (rough.js) ============================ */
const DG_FILL = { yellow: '#ffec99', blue: '#a5d8ff', green: '#b2f2bb', red: '#ffc9c9', amber: '#ffe2a8', violet: '#d0bfff' };
const DG_NOTE = { red: '#bb4d3d', green: '#2f7d4f', blue: '#2b6cb0', amber: '#9a6b12', yellow: '#917516' };
const DG_STROKE = '#1f1d1a';

function rrPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} z`;
}
function edgePoint(a, b, pad) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  if (dx === 0 && dy === 0) return ac;
  const hw = a.w / 2 + pad, hh = a.h / 2 + pad;
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity, sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: ac.x + dx * s, y: ac.y + dy * s };
}
function svgEl(tag, attrs) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function drawScene(svg, scene) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const R = window.rough; const rc = R ? R.svg(svg) : null;
  const byId = {}; scene.nodes.forEach((n) => { byId[n.id] = n; });

  scene.edges.forEach((e, i) => {
    const a = byId[e.from], b = byId[e.to]; if (!a || !b) return;
    const s = edgePoint(a, b, 6), t = edgePoint(b, a, 6);
    const o = { roughness: 1.1, bowing: 1.2, stroke: DG_STROKE, strokeWidth: 1.5, seed: i * 7 + 3 };
    if (e.dashed) o.strokeLineDash = [8, 7];
    if (rc) svg.appendChild(rc.line(s.x, s.y, t.x, t.y, o));
    else svg.appendChild(svgEl('line', { x1: s.x, y1: s.y, x2: t.x, y2: t.y, stroke: DG_STROKE, 'stroke-width': 1.5, 'stroke-dasharray': e.dashed ? '8 7' : '' }));
    const ang = Math.atan2(t.y - s.y, t.x - s.x), L = 13, sp = 0.46;
    const h1 = { x: t.x - L * Math.cos(ang - sp), y: t.y - L * Math.sin(ang - sp) };
    const h2 = { x: t.x - L * Math.cos(ang + sp), y: t.y - L * Math.sin(ang + sp) };
    const ho = { roughness: 0.8, stroke: DG_STROKE, strokeWidth: 1.5, seed: i * 7 + 5 };
    if (rc) { svg.appendChild(rc.line(t.x, t.y, h1.x, h1.y, ho)); svg.appendChild(rc.line(t.x, t.y, h2.x, h2.y, ho)); }
    else { svg.appendChild(svgEl('line', { x1: t.x, y1: t.y, x2: h1.x, y2: h1.y, stroke: DG_STROKE, 'stroke-width': 1.5 })); svg.appendChild(svgEl('line', { x1: t.x, y1: t.y, x2: h2.x, y2: h2.y, stroke: DG_STROKE, 'stroke-width': 1.5 })); }
  });

  scene.nodes.forEach((n, i) => {
    const fill = DG_FILL[n.fill];
    const o = { roughness: 1, bowing: 0.9, stroke: DG_STROKE, strokeWidth: 1.7, seed: i * 13 + 9 };
    if (fill) { o.fill = fill; o.fillStyle = 'hachure'; o.hachureGap = 5.5; o.fillWeight = 1.7; }
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    let node;
    if (rc) {
      if (n.shape === 'diamond') node = rc.polygon([[cx, n.y], [n.x + n.w, cy], [cx, n.y + n.h], [n.x, cy]], o);
      else if (n.shape === 'ellipse') node = rc.ellipse(cx, cy, n.w, n.h, o);
      else node = rc.path(rrPath(n.x, n.y, n.w, n.h, 12), o);
    } else {
      node = svgEl(n.shape === 'ellipse' ? 'ellipse' : 'rect', n.shape === 'ellipse'
        ? { cx, cy, rx: n.w / 2, ry: n.h / 2, fill: fill || 'none', stroke: DG_STROKE, 'stroke-width': 1.7 }
        : { x: n.x, y: n.y, width: n.w, height: n.h, rx: 12, fill: fill || 'none', stroke: DG_STROKE, 'stroke-width': 1.7 });
    }
    svg.appendChild(node);
  });
}

function ExcaliBoard({ scene, zoom }) {
  const svgRef = useRefD(null);
  useEffectD(() => { if (svgRef.current) drawScene(svgRef.current, scene); }, [scene]);
  const byId = {}; scene.nodes.forEach((n) => { byId[n.id] = n; });
  return (
    <div className="m-board__sizer" style={{ width: scene.w * zoom, height: scene.h * zoom }}>
      <div className="m-board__inner" style={{ width: scene.w, height: scene.h, transform: `scale(${zoom})` }}>
        <svg ref={svgRef} className="m-board__svg" width={scene.w} height={scene.h} viewBox={`0 0 ${scene.w} ${scene.h}`}></svg>
        {scene.nodes.map((n) => (
          <div key={n.id} className="m-node" style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>
            {n.label.split('\n').map((l, j) => <span key={j} className="m-node__l">{l}</span>)}
          </div>
        ))}
        {(scene.notes || []).map((nt, i) => (
          <div key={'n' + i} className="m-note" style={{ left: nt.x, top: nt.y, color: DG_NOTE[nt.color] || DG_NOTE.red }}>
            {nt.text.split('\n').map((l, j) => <span key={j}>{l}</span>)}
          </div>
        ))}
        {scene.edges.filter((e) => e.label).map((e, i) => {
          const a = byId[e.from], b = byId[e.to]; if (!a || !b) return null;
          const s = edgePoint(a, b, 6), t = edgePoint(b, a, 6);
          return <div key={'el' + i} className="m-elabel" style={{ left: (s.x + t.x) / 2, top: (s.y + t.y) / 2 }}>{e.label}</div>;
        })}
      </div>
    </div>
  );
}

/* ============================ DiagramSheet (full-screen board) ============================ */
function DiagramSheet({ doc, onClose, notify }) {
  const scene = doc.scene;
  const [closing, setClosing] = useStateD(false);
  const [edit, setEdit] = useStateD(false);
  const [zoom, setZoom] = useStateD(0.5);
  const stageRef = useRefD(null);
  const close = () => { setClosing(true); setTimeout(onClose, 300); };
  const fit = () => {
    const el = stageRef.current; if (!el) return;
    const z = Math.min(1, (el.clientWidth - 28) / scene.w);
    setZoom(Math.max(0.3, +z.toFixed(3)));
  };
  useEffectD(() => { fit(); }, [scene]);
  const bump = (d) => setZoom((v) => Math.min(2, Math.max(0.25, +(v + d).toFixed(2))));
  const toggleEdit = () => { const nv = !edit; setEdit(nv); notify && notify(nv ? 'Edit mode — drawing is best on desktop' : 'View mode'); };

  return (
    <>
      <div className={'m-scrim' + (closing ? ' m-scrim--out' : '')} onClick={close}></div>
      <div className={'m-board' + (closing ? ' m-board--out' : '')}>
        <div className="m-board__bar">
          <button className="m-board__down" onClick={close}><Icon name="chevronD" /></button>
          <div className="m-board__title"><span className="m-board__hex">⬡</span><span className="m-board__name">{doc.title}</span><span className="m-board__ext">.excalidraw</span></div>
          <button className={'m-board__edit' + (edit ? ' m-board__edit--on' : '')} onClick={toggleEdit}>{edit ? 'View' : 'Edit'}</button>
          <button className="m-board__ib" onClick={() => notify && notify('Diagram menu')}><Icon name="more" /></button>
        </div>
        <div className="m-board__sub">
          <span className="m-board__metahex">{edit ? 'EDIT' : 'VIEW'}</span>
          <span className="m-board__submeta">{doc.addedBy ? 'by ' + doc.addedBy : 'project'} · {timeAgo(doc.addedAt)}</span>
          {doc.taskId && <span className="m-board__task">task {doc.taskId}</span>}
        </div>
        <div className="m-board__stage" ref={stageRef}>
          <ExcaliBoard scene={scene} zoom={zoom} />
        </div>
        <div className="m-board__tools">
          <button className="m-board__zb" onClick={() => bump(-0.15)} aria-label="Zoom out"><span className="m-board__zsign">−</span></button>
          <button className="m-board__pct" onClick={fit}>{Math.round(zoom * 100)}%</button>
          <button className="m-board__zb" onClick={() => bump(0.15)} aria-label="Zoom in"><span className="m-board__zsign">+</span></button>
          <span className="m-board__toolsp"></span>
          <button className="m-board__fit" onClick={fit}><Icon name="grid" size={14} /> Fit</button>
          <button className="m-board__export" onClick={() => notify && notify('Exported to task')}><Icon name="arrowUp" size={14} /> Export</button>
        </div>
      </div>
    </>
  );
}

/* ============================ DocSheet (markdown / code reader) ============================ */
function DocSheet({ doc, onClose, notify }) {
  const [closing, setClosing] = useStateD(false);
  const close = () => { setClosing(true); setTimeout(onClose, 300); };
  const ext = fileExt(doc.filePath);
  const isMd = /^(md|mdx|markdown)$/.test(ext);
  const openDiagram = (d) => MUI.openDoc(d);
  return (
    <>
      <div className={'m-scrim' + (closing ? ' m-scrim--out' : '')} onClick={close}></div>
      <div className={'m-doc' + (closing ? ' m-doc--out' : '')}>
        <div className="m-doc__bar">
          <button className="m-doc__down" onClick={close}><Icon name="chevronD" /></button>
          <span className="m-doc__icon">{docIcon(doc)}</span>
          <div className="m-doc__titlecol">
            <div className="m-doc__title">{doc.title}</div>
            <div className="m-doc__path"><span className="m-doc__file">{fileName(doc.filePath)}</span>{ext && <span className="m-doc__ext">.{ext}</span>}</div>
          </div>
          <button className="m-doc__ib" onClick={() => { notify && notify('Copied'); }}><Icon name="copy" size={17} /></button>
          <button className="m-doc__ib" onClick={() => notify && notify('Doc menu')}><Icon name="more" /></button>
        </div>
        <div className="m-doc__meta">
          <span className="m-doc__mi"><span className="m-doc__ml">Path</span><span className="m-doc__mv">{doc.filePath}</span></span>
          <span className="m-doc__mi"><span className="m-doc__ml">Added</span><span className="m-doc__mv">{fmtDate(doc.addedAt)}</span></span>
          {doc.addedBy && <span className="m-doc__mi"><span className="m-doc__ml">By</span><span className="m-doc__mv">{doc.addedBy}</span></span>}
          {doc.sessionName && <span className="m-doc__mi"><span className="m-doc__ml">Session</span><span className="m-doc__sess">{doc.sessionName}</span></span>}
        </div>
        <div className="m-doc__body">
          {doc.content
            ? (isMd ? <Markdown src={doc.content} onOpenDiagram={openDiagram} /> : <pre className="m-doc__code"><code>{doc.content}</code></pre>)
            : <div className="m-doc__empty"><span className="m-doc__emptyic">○</span><span>No content available</span><span className="m-doc__emptypath">{doc.filePath}</span></div>}
        </div>
      </div>
    </>
  );
}

/* ============================ DocsSheet (browser: docs / diagrams) ============================ */
function DocsSheet({ initialKind, onClose, notify }) {
  const [closing, setClosing] = useStateD(false);
  const [kind, setKind] = useStateD(initialKind === 'diagram' ? 'diagram' : 'markdown');
  const [sub, setSub] = useStateD('open');
  const [status, setStatus] = useStateD({});
  const close = () => { setClosing(true); setTimeout(onClose, 300); };
  const stOf = (id) => status[id] || 'open';
  const setSt = (id, v) => setStatus((s) => ({ ...s, [id]: v }));
  const toggleDone = (id) => setSt(id, stOf(id) === 'done' ? 'open' : 'done');

  const items = window.DOCS.filter((d) => kind === 'diagram' ? window.isDiagramDoc(d) : !window.isDiagramDoc(d));
  const openCount = items.filter((d) => stOf(d.id) === 'open').length;
  const doneCount = items.filter((d) => stOf(d.id) === 'done').length;
  const visible = sub === 'all' ? items : items.filter((d) => stOf(d.id) === sub);
  const noun = kind === 'diagram' ? 'diagrams' : 'documents';
  const empty = sub === 'open' ? `No open ${noun}.` : sub === 'done' ? `No ${noun} marked done.` : `No ${noun} yet.`;
  const open = (d) => { if (stOf(d.id) === 'closed') setSt(d.id, 'open'); MUI.openDoc(d); };

  const SUBS = [['open', 'Open', openCount], ['done', 'Done', doneCount], ['all', 'All', items.length]];

  return (
    <>
      <div className={'m-scrim' + (closing ? ' m-scrim--out' : '')} onClick={close}></div>
      <div className={'m-doc' + (closing ? ' m-doc--out' : '')}>
        <div className="m-doc__bar">
          <button className="m-doc__down" onClick={close}><Icon name="chevronD" /></button>
          <div className="m-doc__titlecol"><div className="m-doc__title">Docs &amp; diagrams</div><div className="m-doc__path"><span className="m-doc__file">agent-maestro</span></div></div>
          <button className="m-doc__ib" onClick={() => notify && notify(kind === 'diagram' ? 'New diagram' : 'New doc')}><Icon name="plus" size={18} /></button>
        </div>

        <div className="m-docs__seg">
          <button className={'m-docs__segi' + (kind === 'markdown' ? ' m-docs__segi--on' : '')} onClick={() => { setKind('markdown'); setSub('open'); }}><span className="m-docs__segic">M↓</span> Docs</button>
          <button className={'m-docs__segi' + (kind === 'diagram' ? ' m-docs__segi--on' : '')} onClick={() => { setKind('diagram'); setSub('open'); }}><span className="m-docs__segic">⬡</span> Diagrams</button>
        </div>
        <div className="m-docs__subbar">
          {SUBS.map(([id, label, n]) => (
            <button key={id} className={'m-docs__sub' + (sub === id ? ' m-docs__sub--on' : '')} onClick={() => setSub(id)}>
              {label}{n > 0 && <span className="m-docs__n">{n}</span>}
            </button>
          ))}
        </div>

        <div className="m-doc__body m-docs__list">
          {visible.length === 0 && <div className="m-docs__empty">{empty}</div>}
          {visible.map((d) => {
            const done = stOf(d.id) === 'done';
            const meta = d.sessionName ? 'session · ' + d.sessionName : d.taskId ? 'task · ' + d.taskId : 'project';
            return (
              <div key={d.id} className="m-docrow">
                <button className={'m-docrow__radio' + (done ? ' m-docrow__radio--on' : '')} onClick={() => toggleDone(d.id)} aria-label="Mark done">{done && <Icon name="check" size={10} sw={2.2} />}</button>
                <button className="m-docrow__main" onClick={() => open(d)}>
                  <span className={'m-docrow__ic' + (window.isDiagramDoc(d) ? ' m-docrow__ic--dg' : '')}>{docIcon(d)}</span>
                  <span className="m-docrow__body">
                    <span className={'m-docrow__title' + (done ? ' m-docrow__title--done' : '')}>{d.title}</span>
                    <span className="m-docrow__meta">{meta}</span>
                  </span>
                  <span className="m-docrow__time">{timeAgo(d.addedAt)}</span>
                </button>
                <button className="m-docrow__close" onClick={() => setSt(d.id, 'closed')} aria-label="Close"><Icon name="x" size={12} sw={2} /></button>
              </div>
            );
          })}
          <div className="m-bottompad"></div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { Markdown, DocSheet, DiagramSheet, DocsSheet, ExcaliBoard });
