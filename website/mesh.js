/* tm8 public site — the graph. The whole product drawn as the one connected record it is
   stored as. It starts with one server and grows, slowly at first, until every kind of thing
   tm8 keeps is on the canvas, joined by the edges it really uses. Edge names set in code
   (assigned_to, depends_on, remembers, triggered_by …) are the product's own; plain words are
   descriptions. No framework, no tracking. */
(function () {
  'use strict';
  var cv = document.querySelector('[data-mesh]');
  if (!cv) return;
  var cap = document.querySelector('[data-mesh-cap]');
  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var playBtn = document.querySelector('[data-mesh-play]');
  var tip = document.querySelector('[data-mesh-tip]'), tipK = document.querySelector('[data-mesh-tip-kind]'), tipT = document.querySelector('[data-mesh-tip-title]'), live = document.querySelector('[data-mesh-live]');
  var ctx = cv.getContext('2d');

  /* ---------- deterministic randomness, so every visitor sees the same graph ---------- */
  function prng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- colours come from the page, so dark mode and the title agree ---------- */
  var T = {};
  function tokens() {
    var s = getComputedStyle(document.documentElement), g = function (n) { return s.getPropertyValue(n).trim(); };
    T = { ink: g('--ink'), ink2: g('--ink-2'), ink3: g('--ink-3'), ink4: g('--ink-4'), line: g('--line-2'), card: g('--card'), bg: g('--bg'),
          brand: g('--brand'), run: g('--run'), info: g('--info'), mate: g('--mate') || '#6B4FD6', ui: g('--ui'), mono: g('--mono') };
    T.dark = /^#0|^#1/.test(T.bg);
  }
  var RGBA = {}, DASH = [3, 4], DASH3 = [3, 3], NODASH = [];
  function rgba(hex, a) {
    a = Math.round(a * 1000) / 1000;
    var key = hex + '|' + a, v = RGBA[key]; if (v) return v;
    var h = hex.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    v = 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    RGBA[key] = v; return v;
  }

  /* ---------- the kinds tm8 keeps ---------- */
  var KIND = {
    server:     { r: 19, tone: 'ink',   label: 1, mass: 6,    name: 'the server', plain: 1 },
    space:      { r: 13, tone: 'ink',   label: 1, mass: 4,    name: 'a Space', plain: 1 },
    member:     { r: 7,  tone: 'info',  label: 1, mass: 2,    name: 'MEMBER' },
    teammate:   { r: 8,  tone: 'mate',  label: 1, mass: 2.2,  name: 'TEAMMATE' },
    project:    { r: 9.5, tone: 'ink3', label: 1, mass: 3,    name: 'PROJECT' },
    task:       { r: 4.6, tone: 'brand', label: 0, mass: 1,   name: 'TASK' },
    session:    { r: 5.2, tone: 'run',  label: 0, mass: 1,    name: 'SESSION' },
    message:    { r: 2,   tone: 'ink4', label: 0, mass: 0.35, name: 'MESSAGE' },
    pr:         { r: 3.6, tone: 'ink3', label: 0, mass: 0.7,  name: 'PULL REQUEST' },
    commit:     { r: 2,   tone: 'ink4', label: 0, mass: 0.35, name: 'COMMIT' },
    doc:        { r: 3.4, tone: 'ink3', label: 0, mass: 0.6,  name: 'DOC' },
    file:       { r: 3.4, tone: 'ink4', label: 0, mass: 0.6,  name: 'FILE' },
    memory:     { r: 4,   tone: 'ink2', label: 0, mass: 0.8,  name: 'MEMORY' },
    loop:       { r: 6.5, tone: 'brand', label: 1, mass: 1.6, name: 'LOOP' },
    collection: { r: 6.5, tone: 'ink3', label: 1, mass: 1.6,  name: 'COLLECTION' }
  };
  /* rest length of each edge, by the pair it joins */
  var REST = { 'space-server': 185, 'member-space': 88, 'teammate-space': 94, 'project-space': 112, 'task-project': 62, 'task-member': 82,
               'task-teammate': 82, 'task-task': 72, 'session-task': 30, 'session-teammate': 118, 'message-session': 18, 'message-task': 20,
               'message-member': 92, 'message-teammate': 92, 'pr-task': 36, 'commit-task': 34, 'commit-pr': 14, 'doc-task': 24, 'memory-teammate': 46,
               'memory-task': 42, 'memory-memory': 20, 'doc-memory': 38, 'loop-space': 104, 'session-loop': 38, 'task-loop': 62, 'collection-space': 108, 'collection-task': 56, 'file-task': 24, 'message-memory': 40, 'session-session': 130 };

  var TASKS = ['Fix login redirect loop', 'Rotate the signing key', 'Add retry to the webhook', 'Trim the cold start', 'Migrate the audit table',
    'Cache the board query', 'Wire the invoice export', 'Split the settings page', 'Index the search terms', 'Batch the mail sender',
    'Upgrade the PTY host', 'Move fonts in-house', 'Replace the date picker', 'Dedupe the event stream', 'Add the CSV importer',
    'Handle expired sessions', 'Tighten the CSP', 'Paginate the graph query', 'Explain the version conflict', 'Rename the space picker',
    'Record the demo terminal', 'Fix the tree collapse', 'Add reduced-motion styles', 'Backfill task journals', 'Sign the release',
    'Verify the email link', 'Reserve seats on sign-up', 'Draft the pricing copy', 'Compress the recordings', 'Fix the phone nav',
    'Check the status feed', 'Mirror the docs to llms.txt', 'Order the feed by seq', 'Guard the complete command', 'Time the spawn path',
    'Throttle the digest loop', 'Show liveness on the card', 'Attach the crash log', 'Unstick the scroll', 'Tag the first hundred',
    'Write the Codex profile', 'Bind the dispatch key', 'Probe the sandbox', 'Redact secrets in transcripts', 'Reconcile worktrees',
    'Trust the workspace once', 'Preflight the network', 'Checkout the branch', 'Log the launch manifest', 'Rotate the node token',
    'Route by model name', 'Settle the prompt signal', 'Snapshot the profile pin', 'Count the refusals', 'Ship the mesh',
    'Cap the effort tier', 'Inherit the posture', 'Expire the handoff', 'Fan out the loop', 'Pin the memory'];
  var MEMBERS = ['Mara Voss', 'Theo Iwu', 'Priya Nair', 'Jonas Lindqvist', 'Amal Haddad', 'Sunita Rao'];
  var MATES = [['Haiku 4.5', 'claude-code'], ['Opus 5', 'claude-code'], ['GPT 5.6 Sol', 'codex'], ['Fable 5', 'claude-code'], ['GPT 5.6 Terra', 'codex']];
  var SPACES = ['Northlake', 'Platform', 'Design'];
  var PROJECTS = [['tm8', 0], ['tm8-ui', 0], ['api', 1], ['docs', 1], ['website', 2]];
  var MEMS = ['Return path empty means loop', 'Guard must be idempotent', 'Release is signed on Fridays', 'Board query is cached 30s',
    'Fonts are self-hosted', 'CSP allows self only', 'Seats are tagged tm8site', 'PTY host restarts clean', 'Version 3 is current',
    'Digest posts at 09:17 UTC', 'Codex needs network preflight', 'Worktrees reconcile on spawn', 'Handoffs expire in a day', 'Tool follows the model name'];
  var DOCS = ['auth-notes.md', 'crash.log', 'design.fig', 'pricing.csv', 'runbook.md', 'spec.pdf', 'trace.json', 'mock.png',
    'release.txt', 'schema.sql', 'brief.md', 'audit.csv', 'notes.md', 'diff.patch', 'plan.md', 'evidence.png'];

  /* ---------- build the graph and its schedule. Slow at first, then it pours in. ---------- */
  var N = [], E = [], ORDER = [], PATHS = [], phone = false, stacked = false, LOOP = 68, HOLD = 66, FULL = 62;
  function build() {
    var rnd = prng(stacked ? 7 : 3), i, j, n;
    N = []; E = []; PATHS = [];
    function add(kind, title, at, parent, extra) {
      if (parent && at < parent.at + 0.15) at = parent.at + 0.15;
      n = { id: N.length, kind: kind, title: title, at: at, parent: parent, x: 0, y: 0, vx: 0, vy: 0, on: false, born: 0, r: 0, mass: 1, lab: 0,
            sub: null, v: 0, who: null, live: false, task: -1, coll: -1, session: null };
      if (extra) for (var k in extra) n[k] = extra[k];
      N.push(n); return n;
    }
    /* code:1 marks an edge name tm8 really uses; the rest are plain descriptions */
    function link(a, b, label, code) { E.push({ a: a.id, b: b.id, label: label, code: !!code, at: Math.max(a.at, b.at), key: a.kind + '-' + b.kind }); }
    var P = stacked;
    var nSp = P ? 2 : 3, nMem = P ? 4 : 6, nMate = P ? 3 : 5, nProj = P ? 3 : 5, nTask = P ? 26 : 60, nSess = P ? 9 : 20, nMsg = P ? 20 : 48,
        nPr = P ? 6 : 14, nCommit = P ? 8 : 20, nDoc = P ? 7 : 16, nMem2 = P ? 6 : 14, nLoop = P ? 2 : 3, nColl = P ? 2 : 3;
    var server = add('server', 'tm8.sh', 0, null);
    var spaces = [], members = [], mates = [], projects = [], tasks = [], sessions = [], prs = [], mems = [];
    for (i = 0; i < nSp; i++) { var sp = add('space', SPACES[i], 2.4 + i * 1.3, server); link(sp, server, 'hosted by'); spaces.push(sp); }
    for (i = 0; i < nMem; i++) { var m = add('member', MEMBERS[i], 6.0 + i * 0.5, spaces[i % nSp]); link(m, spaces[i % nSp], 'member of'); members.push(m); }
    for (i = 0; i < nMate; i++) {
      var tm = add('teammate', MATES[i][0], 9.6 + i * 0.5, spaces[i % nSp], { sub: MATES[i][1] });
      link(tm, spaces[i % nSp], 'member of');
      if (i < 2 && nSp > 1) link(tm, spaces[(i + 1) % nSp], 'member of');
      mates.push(tm);
    }
    for (i = 0; i < nProj; i++) {
      var spIdx = Math.min(PROJECTS[i][1], nSp - 1), pj = add('project', PROJECTS[i][0], 12.6 + i * 0.45, spaces[spIdx], { sub: 'subhangR/' + PROJECTS[i][0] });
      link(pj, spaces[spIdx], 'in space'); projects.push(pj);
    }
    for (i = 0; i < nTask; i++) {
      var at = 15 + 11.5 * Math.pow(i / nTask, 0.65), pj2 = projects[Math.floor(rnd() * nProj)];
      var who = rnd() < 0.55 ? mates[Math.floor(rnd() * nMate)] : members[Math.floor(rnd() * nMem)];
      var tk = add('task', TASKS[i % TASKS.length], at, pj2, { v: 1, who: who });
      link(tk, pj2, 'in_project', 1); link(tk, who, 'assigned_to', 1); tasks.push(tk);
      if (i > 3 && rnd() < 0.3) link(tk, tasks[Math.floor(rnd() * i)], 'depends_on', 1);
      else if (i > 3 && rnd() < 0.25) link(tk, tasks[Math.floor(rnd() * i)], 'relates_to', 1);
    }
    for (i = 0; i < nSess; i++) {
      var tk2 = tasks[Math.floor(i * nTask / nSess)], mate = tk2.who.kind === 'teammate' ? tk2.who : mates[i % nMate];
      var ss = add('session', mate.title, 26.5 + i * 0.38, tk2, { sub: mate.sub, live: i % 5 !== 3, task: tk2.id });
      link(ss, tk2, 'working_on', 1); link(ss, mate, 'runs as'); tk2.session = ss; tk2.v = 2; sessions.push(ss);
      if (ss.live) PATHS.push([tk2.who.id, tk2.id, ss.id]);
    }
    for (i = 0; i < nMsg; i++) {
      var host = rnd() < 0.65 ? sessions[Math.floor(rnd() * nSess)] : tasks[Math.floor(rnd() * nTask)];
      var msg = add('message', host.kind === 'session' ? 'turn' : 'message', 30.5 + 10 * Math.pow(i / nMsg, 0.9), host);
      link(msg, host, 'anchored_to', 1);
      if (i % 4 === 1) { var whom = rnd() < 0.5 ? mates[Math.floor(rnd() * nMate)] : members[Math.floor(rnd() * nMem)]; link(msg, whom, 'mentions'); }
    }
    for (i = 0; i < nPr; i++) {
      var s3 = sessions[Math.floor(i * nSess / nPr)], t3 = N[s3.task], pr = add('pr', '#' + (204 + i), 34.5 + i * 0.55, t3, { task: t3.id });
      link(t3, pr, 'tracks', 1); t3.v = 3; prs.push(pr);
    }
    for (i = 0; i < nCommit; i++) { var pr2 = prs[i % nPr], cm = add('commit', 'commit', 36.5 + i * 0.38, pr2); link(N[pr2.task], cm, 'tracks', 1); link(cm, pr2, 'in'); }
    for (i = 0; i < nDoc; i++) { var tk5 = tasks[Math.floor(rnd() * nTask)], dn = DOCS[i % DOCS.length], dc = add(/\.(md|txt)$/.test(dn) ? 'doc' : 'file', dn, 41 + i * 0.35, tk5); link(dc, tk5, 'attached_to', 1); }
    for (i = 0; i < nMem2; i++) {
      var owner = i % 3 === 2 ? tasks[Math.floor(rnd() * nTask)] : mates[i % nMate];
      var me = add('memory', MEMS[i % MEMS.length], 44 + i * 0.4, owner);
      link(owner, me, 'remembers', 1); mems.push(me);
      if (i >= 4 && i % 4 === 0) link(me, mems[i - 4], 'supersedes', 1);
    }
    if (!P) { var ev = N.filter(function (q) { return q.kind === 'message'; })[3]; if (ev) link(ev, mems[1], 'disputes', 1); }
    /* two sessions on different tools talk through the graph: the registered messaged edge */
    var sa = sessions.filter(function (q) { return q.sub === 'claude-code'; })[0], sb = sessions.filter(function (q) { return q.sub === 'codex'; })[0];
    if (sa && sb) link(sa, sb, 'messaged', 1);
    for (i = 0; i < nLoop; i++) {
      var lp = add('loop', ['daily digest', 'nightly tests', 'weekly review'][i], 48.5 + i * 0.6, spaces[i % nSp], { sub: ['every 1d', 'every 1d', 'every 7d'][i] });
      link(lp, spaces[i % nSp], 'in space');
      for (j = 0; j < 2; j++) {
        var mt = mates[(i + j) % nMate], fw = 49.6 + i * 0.6 + j * 0.4;
        var lt = add('task', lp.title + ' run', fw, lp, { v: 1, who: mt });
        link(lt, lp, 'triggered_by', 1); link(lt, mt, 'assigned_to', 1);
        var ls = add('session', mt.title, fw + 0.25, lt, { sub: mt.sub, live: j === 0, task: lt.id });
        link(ls, lp, 'triggered_by', 1); link(ls, lt, 'working_on', 1); link(ls, mt, 'runs as');
      }
    }
    for (i = 0; i < nColl; i++) {
      var co = add('collection', ['Launch', 'Auth', 'Q4'][i], 51.5 + i * 0.5, spaces[i % nSp]);
      link(co, spaces[i % nSp], 'in space');
      for (j = 0; j < (P ? 3 : 5); j++) { var tk4 = tasks[Math.floor(rnd() * nTask)]; if (tk4.coll !== co.id) { tk4.coll = co.id; link(co, tk4, 'contains', 1); } }
    }
    /* and it keeps growing: the record never holds still */
    for (i = 0; i < (P ? 6 : 12); i++) {
      var when = 54.5 + i * (P ? 1.6 : 0.85);
      if (i % 4 === 3) {
        var ntk = add('task', TASKS[(nTask + i) % TASKS.length], when, projects[i % nProj], { v: 1, who: mates[i % nMate] });
        link(ntk, projects[i % nProj], 'in_project', 1); link(ntk, mates[i % nMate], 'assigned_to', 1);
        var nss = add('session', mates[i % nMate].title, when + 0.5, ntk, { sub: mates[i % nMate].sub, live: true, task: ntk.id });
        link(nss, ntk, 'working_on', 1); link(nss, mates[i % nMate], 'runs as'); PATHS.push([mates[i % nMate].id, ntk.id, nss.id]);
      } else {
        var hs = sessions[(i * 5) % nSess], nm = add('message', 'turn', when, hs); link(nm, hs, 'anchored_to', 1);
      }
    }
    N.forEach(function (q) { q.r = KIND[q.kind].r; q.mass = KIND[q.kind].mass; q.lab = KIND[q.kind].label ? 1 : 0; q.lw = q.lab ? Math.max(q.title.length, (q.sub || '').length * 0.85) * 6.4 : 0; });
    ORDER = N.slice().sort(function (p, q) { return p.at - q.at; });
  }

  /* ---------- the caption under the canvas ---------- */
  var BEATS = [
    [0, 'One server. Yours, or hosted at tm8.sh.'],
    [2.4, 'Spaces. Each one is a team, with its own members and its own work.'],
    [6.0, 'People join a Space.'],
    [9.6, 'So do AI teammates. tm8 reads the model name and launches the right tool: Claude Code for Claude models, Codex for GPT models.'],
    [12.6, 'Projects carry repositories.'],
    [15, 'Tasks. Each has an id and a version; it can be assigned to a person or a teammate, and can depend on other tasks.'],
    [26.5, 'Run puts a teammate on a task. A session is a real process, and it is running.'],
    [30.5, 'Messages are stored on the task or the session, then delivered as the next turn. Two sessions on different tools can message each other the same way.'],
    [34.5, 'Pull requests and commits are tracked on the task they came from.'],
    [41, 'Docs and files attach to the work.'],
    [44, 'Memory rides along. A teammate carries what it remembers into every session, and a newer memory can supersede an older one.'],
    [48.5, 'Loops keep time in the graph. A firing derives a task and spawns a session, both edged back with triggered_by, so the fan is the run history.'],
    [51.5, 'Collections gather what belongs together.'],
    [54, 'One connected graph. The board, the tree, and the context an agent reads are all drawn from it.'],
    [59, 'Still growing. Every command that changes something writes another entry, and the history stays on the record.'],
    [HOLD, '']
  ];

  /* ---------- size ---------- */
  var W = 1160, H = 673, S = 1, CX = 580, CY = 336;
  function layout() {
    tokens();
    var cssW = cv.parentNode.clientWidth || 1160;
    var mq = function (q, fb) { return window.matchMedia ? window.matchMedia(q).matches : fb; };
    phone = mq('(max-width: 639px)', cssW < 640); stacked = mq('(max-width: 899px)', cssW < 900);
    W = cssW; H = phone ? Math.round(cssW * 1.3) : stacked ? Math.round(cssW * 0.9) : Math.round(Math.max(560, Math.min(760, cssW * 0.52)));
    S = phone ? 0.8 : stacked ? 0.9 : Math.max(0.82, Math.min(1.05, cssW / 1240));
    CX = stacked ? W / 2 : W * 0.57; CY = H / 2;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    glowGrad = ctx.createRadialGradient(CX, CY, 10, CX, CY, Math.max(W, H) * 0.55);
    glowGrad.addColorStop(0, rgba(T.brand, 1)); glowGrad.addColorStop(1, rgba(T.brand, 0));
  }
  var glowGrad = null;

  /* ---------- the simulation ---------- */
  var alive = [], born = 0, simT = 0, acc = 0, rndPos;
  function reset() {
    build();
    rndPos = prng(11);
    alive = []; born = 0; simT = 0; acc = 0; hover = -1; cv.style.cursor = '';
    N.forEach(function (n) { n.on = false; n.vx = 0; n.vy = 0; });
  }
  function insert(n) {
    var p = n.parent, a = rndPos() * 6.2832, d = (14 + rndPos() * 22) * S;
    if (!p) { n.x = CX; n.y = CY; }
    else { n.x = p.x + Math.cos(a) * d; n.y = p.y + Math.sin(a) * d; }
    n.on = true; n.born = n.at; alive.push(n);
  }
  function physics(steps) {
    var REP = 1900 * S * S, G = 0.0019, DAMP = 0.82, VMAX = 7 * S, SPREAD = phone ? 1.0 : 1.3, i, j, a, b, dx, dy, d2, d, f, e, L, RANGE = 90000 * S * S;
    for (var s = 0; s < steps; s++) {
      for (i = 0; i < alive.length; i++) {
        a = alive[i];
        for (j = i + 1; j < alive.length; j++) {
          b = alive[j];
          dx = b.x - a.x; dy = b.y - a.y; d2 = dx * dx + dy * dy;
          if (d2 > RANGE) continue;
          if (d2 < 1) { dx = 0.5; dy = 0.3; d2 = 0.34; }
          f = REP * a.mass * b.mass / (d2 + 30 * S); if (a.lab && b.lab) f *= 2.4;
          d = Math.sqrt(d2); dx /= d; dy /= d;
          a.vx -= dx * f / a.mass; a.vy -= dy * f / a.mass; b.vx += dx * f / b.mass; b.vy += dy * f / b.mass;
        }
      }
      for (i = 0; i < E.length; i++) {
        e = E[i]; a = N[e.a]; b = N[e.b]; if (!a.on || !b.on) continue;
        L = (REST[e.key] || REST[b.kind + '-' + a.kind] || 60) * S * SPREAD;
        dx = b.x - a.x; dy = b.y - a.y; d = Math.sqrt(dx * dx + dy * dy) || 1;
        f = (d - L) * 0.045;
        dx /= d; dy /= d;
        a.vx += dx * f / a.mass; a.vy += dy * f / a.mass; b.vx -= dx * f / b.mass; b.vy -= dy * f / b.mass;
      }
      for (i = 0; i < alive.length; i++) {
        a = alive[i];
        if (a.kind === 'server') { a.x = CX; a.y = CY; a.vx = a.vy = 0; continue; }
        if (!calm) { a.vx += Math.sin(simT * 0.7 + a.id * 1.3) * 0.05 * S / a.mass; a.vy += Math.cos(simT * 0.5 + a.id * 0.7) * 0.05 * S / a.mass; }
        a.vx += (CX - a.x) * G / Math.sqrt(a.mass); a.vy += (CY - a.y) * G * (phone ? 0.7 : stacked ? 1.0 : 2.6) / Math.sqrt(a.mass);
        var m = (KIND[a.kind].label ? 46 : 22) * S + a.r;
        if (a.x < m) a.vx += (m - a.x) * 0.08; if (a.x > W - m) a.vx -= (a.x - W + m) * 0.08;
        if (a.y < m) a.vy += (m - a.y) * 0.08; if (a.y > H - m) a.vy -= (a.y - H + m) * 0.08;
        a.vx *= DAMP; a.vy *= DAMP;
        var v = Math.sqrt(a.vx * a.vx + a.vy * a.vy); if (v > VMAX) { a.vx *= VMAX / v; a.vy *= VMAX / v; }
        a.x += a.vx; a.y += a.vy;
        var lim = a.r * S + 3, limx = Math.max(lim, a.lw * S * 0.5 + 4);
        if (a.x < limx) a.x = limx; else if (a.x > W - limx) a.x = W - limx;
        if (a.y < lim) a.y = lim; else if (a.y > H - lim) a.y = H - lim;
      }
    }
  }
  /* advance the world to time t, inserting whatever is due */
  function advance(t) {
    if (t < simT) reset();
    while (born < ORDER.length && ORDER[born].at <= t) { insert(ORDER[born]); born++; }
    if (t - simT > 0.25) simT = t - 0.25;
    acc += (t - simT) * 120;
    var steps = Math.min(30, Math.floor(acc)); acc -= steps;
    if (steps > 0) physics(steps);
    simT = t;
  }

  /* ---------- drawing ---------- */
  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3); }
  function tone(k) { return k === 'brand' ? T.brand : k === 'run' ? T.run : k === 'info' ? T.info : k === 'mate' ? T.mate : k === 'ink2' ? T.ink2 : k === 'ink3' ? T.ink3 : k === 'ink4' ? T.ink4 : T.ink; }
  var hover = -1;
  function draw(t) {
    var fade = t > HOLD ? 1 - ease((t - HOLD) / (LOOP - HOLD)) : 1;
    ctx.clearRect(0, 0, W, H);
    var glow = ease((t - 2) / 6);
    if (glow > 0 && glowGrad) { ctx.globalAlpha = (T.dark ? 0.09 : 0.05) * glow * fade; ctx.fillStyle = glowGrad; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = fade;
    if (t < 2.4 && !calm) {
      var ping = (t * 0.9) % 1;
      ctx.beginPath(); ctx.arc(CX, CY, (24 + ping * 70) * S, 0, 6.2832); ctx.strokeStyle = rgba(T.brand, 0.45 * (1 - ping)); ctx.lineWidth = 1.5; ctx.stroke();
    }
    var hov = hover >= 0 && N[hover] && N[hover].on ? N[hover] : null, hn = {};
    if (hov) { hn[hov.id] = 1; E.forEach(function (e) { if (e.a === hov.id) hn[e.b] = 1; if (e.b === hov.id) hn[e.a] = 1; }); }
    /* edges */
    var i, e, a, b, k, nEdges = 0, nLive = 0;
    for (i = 0; i < E.length; i++) {
      e = E[i]; a = N[e.a]; b = N[e.b]; if (!a.on || !b.on) continue;
      k = ease((t - e.at) / 0.9); if (k <= 0) continue;
      nEdges++;
      var lit = hov && (e.a === hov.id || e.b === hov.id), dim = hov && !lit ? 0.3 : 1;
      var col = (a.kind === 'session' && a.live) || e.label === 'messaged' ? T.run : (a.kind === 'collection' || e.label === 'triggered_by' || e.label === 'depends_on') ? T.brand : T.ink;
      var base = (a.kind === 'session' && a.live) ? 0.30 : (a.kind === 'collection' || e.label === 'triggered_by') ? 0.30 : e.label === 'depends_on' ? 0.22 : T.dark ? 0.16 : 0.12;
      ctx.strokeStyle = rgba(col, Math.min(0.9, base * k * dim * (lit ? 2.6 : 1)));
      ctx.lineWidth = lit ? 1.6 : (a.mass >= 3 || b.mass >= 3 ? 1.15 : 0.9);
      var dashed = a.kind === 'collection' || e.label === 'supersedes' || e.label === 'disputes' || e.label === 'messaged';
      if (dashed) ctx.setLineDash(DASH);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k); ctx.stroke();
      if (dashed) ctx.setLineDash(NODASH);
      if (lit && !phone) {
        var lx = (a.x + b.x) / 2, ly = (a.y + b.y) / 2;
        ctx.font = (e.code ? '500 10px ' + T.mono : '500 10.5px ' + T.ui); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var lw = ctx.measureText(e.label).width;
        ctx.fillStyle = T.bg; ctx.fillRect(lx - lw / 2 - 4, ly - 7, lw + 8, 14);
        ctx.fillStyle = e.code ? T.ink2 : T.ink3; ctx.fillText(e.label, lx, ly);
      }
    }
    /* packets: a message goes to the task, then into the session as its next turn */
    if (t >= 31 && t < HOLD && PATHS.length && !calm) {
      var slot = Math.floor(t / 0.55);
      for (var q = 0; q < 4; q++) {
        var sl = slot - q, u = (t - sl * 0.55) / 2.0; if (u < 0 || u > 1) continue;
        var path = PATHS[(sl * 7 + q * 3) % PATHS.length], p0 = N[path[0]], p1 = N[path[1]], p2 = N[path[2]];
        if (!p0.on || !p1.on || !p2.on) continue;
        var seg = u < 0.55 ? u / 0.55 : (u - 0.55) / 0.45, from = u < 0.55 ? p0 : p1, to = u < 0.55 ? p1 : p2, kk = ease(seg);
        var px = from.x + (to.x - from.x) * kk, py = from.y + (to.y - from.y) * kk, kt = ease(Math.max(0, seg - 0.16));
        ctx.beginPath(); ctx.moveTo(from.x + (to.x - from.x) * kt, from.y + (to.y - from.y) * kt); ctx.lineTo(px, py);
        ctx.strokeStyle = rgba(T.brand, 0.55); ctx.lineWidth = 2.2 * S; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(px, py, 4 * S, 0, 6.2832); ctx.fillStyle = T.brand; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, 9 * S, 0, 6.2832); ctx.strokeStyle = rgba(T.brand, 0.4 * (1 - kk)); ctx.lineWidth = 1.2; ctx.stroke();
        if (u > 0.96) { var rr = (u - 0.96) * 400 * S; ctx.beginPath(); ctx.arc(p2.x, p2.y, 6 + rr, 0, 6.2832); ctx.strokeStyle = rgba(T.run, 0.5 * (1 - (u - 0.96) / 0.04)); ctx.lineWidth = 1.5; ctx.stroke(); }
      }
    }
    /* nodes */
    var nNodes = 0;
    for (i = 0; i < alive.length; i++) {
      a = alive[i]; k = a.at <= 0 ? 1 : ease((t - a.born) / 0.7); if (k <= 0) continue;
      nNodes++; if (a.kind === 'session' && a.live) nLive++;
      var K = KIND[a.kind], r = a.r * S * (0.3 + 0.7 * k), c = tone(K.tone), dim2 = hov && !hn[a.id] ? 0.3 : 1;
      ctx.globalAlpha = fade * k * dim2;
      if (a.kind === 'session' && a.live) {
        var pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3.4 + a.id);
        ctx.beginPath(); ctx.arc(a.x, a.y, r + (4 + 5 * pulse) * S, 0, 6.2832); ctx.fillStyle = rgba(T.run, 0.10 + 0.12 * (1 - pulse)); ctx.fill();
      }
      if (a.kind === 'server') {
        ctx.beginPath(); ctx.arc(a.x, a.y, r + 7 * S, 0, 6.2832); ctx.strokeStyle = rgba(T.ink, 0.18); ctx.lineWidth = 1; ctx.stroke();
      }
      if (a.kind === 'space' || a.kind === 'collection') {
        ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, 6.2832); ctx.fillStyle = T.card; ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = a.kind === 'space' ? 2 : 1.4; if (a.kind === 'collection') ctx.setLineDash(DASH3);
        ctx.stroke(); if (a.kind === 'collection') ctx.setLineDash(NODASH);
        ctx.beginPath(); ctx.arc(a.x, a.y, r * 0.32, 0, 6.2832); ctx.fillStyle = c; ctx.fill();
      } else if (a.kind === 'loop') {
        ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, 6.2832); ctx.fillStyle = T.card; ctx.fill(); ctx.strokeStyle = rgba(c, 0.35); ctx.lineWidth = 1.4; ctx.stroke();
        var sweep = calm ? 0.7 : ((t * 0.35 + a.id * 0.2) % 1);
        ctx.beginPath(); ctx.arc(a.x, a.y, r, -1.5708, -1.5708 + sweep * 6.2832); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(a.x, a.y, 1.8 * S, 0, 6.2832); ctx.fillStyle = c; ctx.fill();
      } else if (a.kind === 'session' && !a.live) {
        ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, 6.2832); ctx.fillStyle = T.card; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (a.kind === 'doc' || a.kind === 'file') {
        ctx.fillStyle = c; ctx.fillRect(a.x - r, a.y - r, r * 2, r * 2);
      } else if (a.kind === 'memory') {
        ctx.beginPath(); ctx.moveTo(a.x, a.y - r * 1.25); ctx.lineTo(a.x + r * 1.25, a.y); ctx.lineTo(a.x, a.y + r * 1.25); ctx.lineTo(a.x - r * 1.25, a.y); ctx.closePath();
        ctx.fillStyle = T.card; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, 6.2832); ctx.fillStyle = c; ctx.fill();
        if (a.kind === 'teammate' || a.kind === 'member') { ctx.strokeStyle = T.bg; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
      if ((K.label || hn[a.id]) && k > 0.5 && !(phone && a.kind === 'member' && !hn[a.id])) {
        ctx.font = (a.kind === 'server' ? '700 ' : '600 ') + ((a.kind === 'server' ? 13 : a.kind === 'space' ? 12.5 : 11) * (phone ? 0.92 : 1)) + 'px ' + T.ui;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        var ty = a.y + r + 4 * S, tw = ctx.measureText(a.title).width;
        ctx.fillStyle = rgba(T.bg, 0.85); ctx.fillRect(a.x - tw / 2 - 3, ty - 1, tw + 6, 14);
        ctx.fillStyle = a.kind === 'server' || a.kind === 'space' ? T.ink : T.ink2;
        ctx.fillText(a.title, a.x, ty);
        if (a.sub && (a.kind === 'teammate' || a.kind === 'loop' || a.kind === 'project') && !phone) {
          ctx.font = '500 9px ' + T.mono; ctx.fillStyle = T.ink3; ctx.fillText(a.sub, a.x, ty + 14);
        }
      }
    }
    ctx.globalAlpha = fade;
    /* the count, top right: the mesh is as complex as the numbers say */
    if (nNodes > 1) {
      var cnt = nNodes + ' nodes · ' + nEdges + ' edges' + (nLive ? ' · ' + nLive + ' running' : '');
      ctx.font = '500 ' + (phone ? 9.5 : 10.5) + 'px ' + T.mono; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      var cw = ctx.measureText(cnt).width;
      ctx.fillStyle = rgba(T.bg, 0.85); ctx.fillRect(W - 14 - cw - 5, 10, cw + 10, 16);
      ctx.fillStyle = T.ink3; ctx.fillText(cnt, W - 14, 12);
    }
    /* tooltip: a DOM layer above the fade and the statement, so it is never washed out and it reads aloud */
    if (tip) {
      if (hov && t <= HOLD) {
        var K2 = KIND[hov.kind], t1 = K2.plain ? K2.name : K2.name + (hov.kind === 'task' ? ' · v' + hov.v : hov.kind === 'session' ? (hov.live ? ' · RUNNING' : ' · DONE') : ''), t2 = hov.title + (hov.sub ? ' · ' + hov.sub : '');
        if (tipK.textContent !== t1) { tipK.textContent = t1; tipK.style.color = K2.plain ? T.ink3 : tone(K2.tone === 'ink4' ? 'ink3' : K2.tone); tipK.className = K2.plain ? 'plain' : ''; }
        if (tipT.textContent !== t2) tipT.textContent = t2;
        tip.hidden = false;
        var bw = tip.offsetWidth, bh = tip.offsetHeight, bx = Math.min(W - bw - 6, Math.max(6, hov.x + 14)), by = hov.y - bh - 10; if (by < 6) by = hov.y + 14;
        tip.style.transform = 'translate(' + Math.round(bx) + 'px,' + Math.round(by) + 'px)';
      } else if (!tip.hidden) tip.hidden = true;
    }
    ctx.globalAlpha = 1;
    if (cap) { var bt = BEATS[0]; for (i = 0; i < BEATS.length; i++) if (t >= BEATS[i][0]) bt = BEATS[i]; if (cap.textContent !== bt[1]) cap.textContent = bt[1]; }
  }

  /* ---------- run ---------- */
  var raf = null, t0 = null, last = 0, lastRaw = 0, paused = false, inView = !('IntersectionObserver' in window);
  function frame(now) {
    if (t0 === null) { t0 = now - last * 1000; lastRaw = last; }
    var raw = (now - t0) / 1000;
    /* a stall (hidden tab, locked phone) resumes where it left off; it never catches up in one frame */
    if (raw - lastRaw > 1.5) { t0 += (raw - lastRaw - 1 / 60) * 1000; raw = lastRaw + 1 / 60; }
    lastRaw = raw;
    var t = raw % LOOP;
    if (t < last) reset();
    last = t;
    advance(t); draw(t);
    raf = requestAnimationFrame(frame);
  }
  function run() { if (raf === null && !paused && inView && !document.hidden) { t0 = null; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
  function still(t) { reset(); for (var s = 0; s <= t; s += 0.25) advance(s); last = t; draw(t); }
  function pick(x, y) {
    var best = -1, bd = 16 * S;
    for (var i = 0; i < alive.length; i++) { var a = alive[i]; if (a.at > 0 && last - a.born < 0.35) continue; var d = Math.hypot(a.x - x, a.y - y) - a.r * S; if (d < bd) { bd = d; best = a.id; } }
    return best;
  }
  layout(); reset(); advance(0); draw(0);
  if (playBtn) {
    playBtn.addEventListener('click', function () {
      paused = !paused; playBtn.setAttribute('aria-pressed', paused ? 'true' : 'false'); playBtn.textContent = paused ? 'Play' : 'Pause';
      if (paused) stop(); else run();
    });
  }
  var stage = cv.parentNode;
  function setHover(h) {
    if (h === hover) return;
    hover = h; stage.style.cursor = h >= 0 ? 'pointer' : '';
    if (live) { var n = h >= 0 ? N[h] : null; live.textContent = n ? (KIND[n.kind].plain ? KIND[n.kind].name : KIND[n.kind].name.toLowerCase()) + ', ' + n.title + (n.sub ? ', ' + n.sub : '') : ''; }
    if (raf === null) draw(last);
  }
  function under(ev) { var r = cv.getBoundingClientRect(); return pick(ev.clientX - r.left, ev.clientY - r.top); }
  stage.addEventListener('pointermove', function (ev) { if (ev.pointerType !== 'touch') setHover(under(ev)); });
  stage.addEventListener('pointerdown', function (ev) {
    if (playBtn && (ev.target === playBtn || playBtn.contains(ev.target))) return;
    var h = under(ev); setHover(ev.pointerType === 'touch' && h === hover ? -1 : h);
  });
  stage.addEventListener('pointerleave', function (ev) { if (ev.pointerType !== 'touch') setHover(-1); });
  stage.addEventListener('pointercancel', function () { setHover(-1); });
  cv.setAttribute('tabindex', '0');
  cv.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { setHover(-1); return; }
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault();
    var list = alive.filter(function (n) { return n.lab; }), i = -1, k;
    if (!list.length) return;
    for (k = 0; k < list.length; k++) if (list[k].id === hover) i = k;
    setHover(list[ev.key === 'ArrowRight' ? (i + 1) % list.length : (i - 1 + list.length) % list.length].id);
  });
  var rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      var ow = W, oh = H, wasPhone = phone; layout();
      if (phone !== wasPhone) { reset(); last = 0; t0 = null; advance(0); }
      else N.forEach(function (n) { n.x = n.x / ow * W; n.y = n.y / oh * H; });
      draw(last);
    }, 160);
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else run(); });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { layout(); draw(last); });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { inView = e.isIntersecting; if (inView) run(); else stop(); });
    }, { threshold: 0.12 }).observe(cv);
  } else run();
  /* capture hooks, only when the page is opened with ?capture=1: seeking is synchronous and heavy */
  if (/[?&]capture\b/.test(location.search)) {
    window.__meshNodes = function () { return alive.map(function (n) { return { id: n.id, kind: n.kind, x: n.x, y: n.y, title: n.title }; }); };
    window.__meshSeek = function (t, hx, hy) { stop(); still(t); if (hx != null) { hover = pick(hx, hy); draw(t); } return alive.length; };
  }
})();
