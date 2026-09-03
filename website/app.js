/* tm8 public site, v7. No framework, no tracking. */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var staticCopy = document.documentElement.hasAttribute('data-static-plates');
  var videoMode = /[?&]video=1/.test(location.search);
  if (videoMode) document.documentElement.classList.add('video-mode');

  /* ======================================================================
     THE RIBBON — the product's Möbius figure-8, ported from RibbonMark.tsx
     to a canvas. Turns once with the product's own spin-rewind curve, then
     rests. Turns again on hover or tap.
     ====================================================================== */
  function ribbon(canvas) {
    var TAU = Math.PI * 2;
    var N = 150, W = 560, H = 700, S = 290, TILT = 9;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var cssW = canvas.clientWidth || 280, cssH = cssW * H / W;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.height = cssH + 'px';
    var scale = canvas.width / W;
    var inkCss = getComputedStyle(canvas).color;
    var m = /(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(inkCss);
    var INK = m ? [+m[1], +m[2], +m[3]] : [181, 98, 31];
    function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function vnorm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function curveP(t) { return [Math.sin(2 * t) * 0.4, -Math.sin(t) * 0.95, Math.cos(t) * 0.3]; }
    var st = [];
    (function () {
      var w = 0.155, dt = 0.001;
      for (var i = 0; i <= N; i++) {
        var t = (i / N) * TAU, P = curveP(t);
        var Tg = vnorm(vsub(curveP(t + dt), curveP(t - dt)));
        var N1 = vnorm(vcross(Tg, [0, 0, 1])), N2 = vcross(Tg, N1);
        var ph = t / 2 + Math.PI / 2;
        var D = [N1[0] * Math.cos(ph) + N2[0] * Math.sin(ph), N1[1] * Math.cos(ph) + N2[1] * Math.sin(ph), N1[2] * Math.cos(ph) + N2[2] * Math.sin(ph)];
        st.push({ A: [P[0] + D[0] * w, P[1] + D[1] * w, P[2] + D[2] * w], B: [P[0] - D[0] * w, P[1] - D[1] * w, P[2] - D[2] * w] });
      }
    })();
    function shade(k) {
      var r, g, b;
      if (k < 0.5) { var f = (0.5 - k) * 2 * 0.78; r = INK[0] * (1 - f); g = INK[1] * (1 - f); b = INK[2] * (1 - f); }
      else { var f2 = (k - 0.5) * 2 * 0.58; r = INK[0] + (255 - INK[0]) * f2; g = INK[1] + (255 - INK[1]) * f2; b = INK[2] + (255 - INK[2]) * f2; }
      return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    }
    var easeInOutCubic = function (t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; };
    function animate(from, to, start, end, ease) { return function (t) { if (t <= start) return from; if (t >= end) return to; return from + (to - from) * ease((t - start) / (end - start)); }; }
    function draw(T) {
      var angle = animate(0, 360, 0, 1, easeInOutCubic)(T) + animate(0, -360, 1, 2, easeInOutCubic)(T);
      var flow = ((T / 2) * 2) % 1;
      var tilt = TILT + 2.5 * Math.sin((TAU * T) / 2);
      var cA = Math.cos(angle * Math.PI / 180), sA = Math.sin(angle * Math.PI / 180);
      var cB = Math.cos(tilt * Math.PI / 180), sB = Math.sin(tilt * Math.PI / 180);
      var F = 2600, cx = W / 2, cy = H / 2, L = vnorm([-0.35, -0.5, 0.85]);
      function tx(p) { var x = p[0] * S, y = p[1] * S, z = p[2] * S; var x1 = x * cA + z * sA, z1 = -x * sA + z * cA; return [x1, y * cB - z1 * sB, y * sB + z1 * cB]; }
      function proj(p) { var f = F / (F - p[2]); return [cx + p[0] * f, cy + p[1] * f]; }
      var quads = [], pA = tx(st[0].A), pB = tx(st[0].B);
      for (var i = 0; i < N; i++) {
        var A2 = tx(st[i + 1].A), B2 = tx(st[i + 1].B), u = (i + 0.5) / N;
        var n = vnorm(vcross(vsub(A2, pA), vsub(pB, pA)));
        var k = 0.24 + 0.76 * Math.abs(vdot(n, L)); k += 0.13 * Math.sin(TAU * (u * 2 - flow)); k = Math.max(0, Math.min(1, k));
        quads.push({ z: (pA[2] + A2[2] + B2[2] + pB[2]) / 4, pts: [proj(pA), proj(A2), proj(B2), proj(pB)], fill: shade(k) });
        pA = A2; pB = B2;
      }
      quads.sort(function (a, b) { return a.z - b.z; });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineJoin = 'round'; ctx.lineWidth = 1.2 * scale;
      for (var q = 0; q < quads.length; q++) {
        var p = quads[q].pts; ctx.beginPath(); ctx.moveTo(p[0][0] * scale, p[0][1] * scale);
        for (var j = 1; j < 4; j++) ctx.lineTo(p[j][0] * scale, p[j][1] * scale);
        ctx.closePath(); ctx.fillStyle = quads[q].fill; ctx.strokeStyle = quads[q].fill; ctx.fill(); ctx.stroke();
      }
    }
    var running = false, t0 = 0;
    function loop(now) {
      if (!t0) t0 = now;
      var T = (now - t0) / 1000;
      if (T >= 2) { draw(0); running = false; t0 = 0; return; }
      draw(T); requestAnimationFrame(loop);
    }
    function turn() { if (running || reduced) return; running = true; t0 = 0; requestAnimationFrame(loop); }
    draw(0);
    canvas.addEventListener('mouseenter', turn);
    canvas.addEventListener('click', turn);
    return turn;
  }
  var ribbonEl = document.querySelector('[data-ribbon]');
  var turnRibbon = null;
  if (ribbonEl) {
    turnRibbon = ribbon(ribbonEl);
    var last = 0;
    window.addEventListener('resize', function () { clearTimeout(last); last = setTimeout(function () { turnRibbon = ribbon(ribbonEl); }, 200); });
  }

  /* ======================================================================
     THE STORY — one task, open to done.
     ====================================================================== */
  var scene = document.querySelector('[data-scene]');
  var playScene = null;
  if (scene) {
    var $ = function (sel) { return scene.querySelector(sel); };
    var $$ = function (sel) { return Array.prototype.slice.call(scene.querySelectorAll(sel)); };
    var cap = document.querySelector('[data-scene-cap]');
    var subs = scene.querySelector('[data-subs]');
    var replayBtn = document.querySelector('[data-scene-replay]');
    var cur = { mara: $('.cur.mara'), theo: $('.cur.theo'), juniper: $('.cur.juniper') };
    var canvas = $('.term .canvas');
    var strip = $('.term .strip');
    var composer = $('.composer');
    var typed = $('.composer .typed');
    var timers = [];
    function at(ms, fn) { timers.push(setTimeout(fn, reduced ? Math.round(ms * 0.55) : ms)); }
    function move(who, x, y) { if (!cur[who]) return; cur[who].style.setProperty('--x', x); cur[who].style.setProperty('--y', y); cur[who].classList.add('on'); }
    function click(who) { if (!cur[who]) return; cur[who].classList.add('click'); setTimeout(function () { cur[who].classList.remove('click'); }, 160); }
    function hide(who) { if (cur[who]) cur[who].classList.remove('on'); }
    function show(sel) { $$(sel).forEach(function (el) { el.classList.add('on'); }); }
    function say(text) { if (cap) cap.textContent = text; if (subs) { subs.textContent = text; subs.classList.toggle('on', !!text); } }
    function line(html) { var el = document.createElement('span'); el.className = 'l'; el.innerHTML = html; canvas.appendChild(el); requestAnimationFrame(function () { el.classList.add('on'); }); canvas.scrollTop = canvas.scrollHeight; }
    function setStatus(pill, text, ver) { var p = $('[data-task-pill]'); p.className = 'pill ' + pill; p.textContent = text; $('[data-task-ver]').textContent = ver; }
    function typeInto(text, done) {
      composer.classList.add('typing'); typed.textContent = '';
      if (reduced) { typed.textContent = text; done(); return; }
      var i = 0; var iv = setInterval(function () { typed.textContent = text.slice(0, ++i); if (i >= text.length) { clearInterval(iv); done(); } }, 34); timers.push(iv);
    }
    function reset() {
      timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); timers = [];
      Object.keys(cur).forEach(function (k) { hide(k); });
      $$('.fr').forEach(function (el) { el.classList.remove('on'); });
      canvas.innerHTML = '<span class="l on empty">no session on this task yet</span>';
      strip.innerHTML = '<span class="idle">no session</span>';
      composer.classList.remove('typing'); typed.textContent = '';
      setStatus('', 'Open', 'v1');
      $('[data-assignee]').innerHTML = '';
      $('[data-spawn]').classList.remove('pressed'); $('[data-complete]').classList.remove('pressed');
      say('');
    }
    playScene = function () {
      reset();
      var s = 0;
      at(s += 500, function () { move('mara', '22%', '30%'); say('Mara opens a task. It already has an id and a version.'); });
      at(s += 1100, function () { move('mara', '26%', '36%'); });
      at(s += 900, function () { click('mara'); $('[data-spawn]').classList.add('pressed'); say('Mara presses Run and picks Juniper: a real process on this machine, with the task as its first instruction.'); });
      at(s += 600, function () {
        strip.innerHTML = '<svg class="face sm"><use href="#face-juniper"/></svg><b>Juniper</b><span>claude-code</span><span class="live" aria-hidden="true"></span><span class="tag">running</span>';
        canvas.innerHTML = '';
        line('<span class="d">09:42:10</span> <span class="p">task</span> Fix login redirect loop');
        setStatus('run', 'Working', 'v2');
        $('[data-assignee]').innerHTML = '<svg class="face xs"><use href="#face-juniper"/></svg>Juniper';
        show('[data-fr="session"]');
        move('juniper', '84%', '34%');
      });
      at(s += 1000, function () { line('<span class="d">09:42:14</span> <span class="in">Reading Auth notes before I touch anything.</span>'); });
      at(s += 1000, function () { line('<span class="d">09:42:16</span> <span class="d">Read src/auth/callback.ts</span>'); show('[data-fr="doc"]'); move('juniper', '86%', '48%'); });
      at(s += 1100, function () { line('<span class="d">09:44:31</span> <span class="in">The loop starts when the return path is empty.</span>'); say('Everything Juniper does streams into the browser as it happens. Not a transcript. The terminal.'); });
      at(s += 1300, function () { move('theo', '30%', '84%'); });
      at(s += 800, function () {
        click('theo');
        typeInto('Keep the guard idempotent.', function () {
          at(300, function () { composer.classList.remove('typing'); typed.textContent = ''; show('[data-fr="theo"]'); say('Theo writes on the task. The message is stored first, then handed to the running session as its next turn.'); move('theo', '34%', '70%'); });
          at(1000, function () { line('<span class="d">09:47:20</span> <span class="p">message</span> from Theo Iwu · reply available'); line('<span class="d">        </span> <span class="in">Keep the guard idempotent.</span>'); });
          at(2100, function () { line('<span class="d">09:47:41</span> <span class="in">Understood. Reworking the guard so a second callback is a no-op.</span>'); });
          at(3600, function () { line('<span class="d">09:51:08</span> <span class="ok">✓ 14 tests pass</span>'); });
          at(4400, function () { line('<span class="d">09:52:02</span> <span class="ok">PR #212 opened · linked to the task</span>'); show('[data-fr="reply"]'); show('[data-fr="pr"]'); setStatus('review', 'In review', 'v3'); say('Juniper replies on the same thread and links the PR. The task moves, with a new version.'); });
          at(6000, function () { move('mara', '42%', '38%'); });
          at(6800, function () { click('mara'); $('[data-complete]').classList.add('pressed'); setStatus('done', 'Done', 'v4'); show('[data-fr="done"]'); say('Mara completes it. Completion names the version she read and records who did it. One record, start to finish.'); });
          at(7800, function () { hide('theo'); hide('juniper'); });
          at(8400, function () { move('mara', '48%', '46%'); });
        });
      });
    };
    if (replayBtn) replayBtn.addEventListener('click', playScene);
    reset();
    if (reduced && !videoMode) { playScene(); }
    else if (videoMode) { setTimeout(playScene, 900); }
    else {
      var started = false;
      var start = function () { if (!started) { started = true; setTimeout(playScene, 600); } };
      if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (entries) { if (entries.some(function (e) { return e.isIntersecting; })) { start(); io.disconnect(); } }, { threshold: 0.2 }); io.observe(scene); }
      else start();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (scene.getBoundingClientRect().top < window.innerHeight * 0.9) start(); });
    }
  }
  var watch = document.querySelector('[data-watch]');
  if (watch) watch.addEventListener('click', function (e) {
    e.preventDefault();
    var target = document.querySelector('.frame-wrap');
    if (target) target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    if (playScene) setTimeout(playScene, reduced ? 0 : 700);
  });

  /* ---------- explainers play once when they come on screen, hold their last frame, and replay on hover or tap ---------- */
  var tiles = Array.prototype.slice.call(document.querySelectorAll('.tile, .darkterm'));
  if (tiles.length) {
    var restart = function (t) {
      var stage = t.querySelector('.stage') || t.querySelector('.canvas'); if (!stage) return;
      var clone = stage.cloneNode(true); stage.parentNode.replaceChild(clone, stage); t._playedAt = Date.now();
    };
    if (reduced || !('IntersectionObserver' in window)) tiles.forEach(function (t) { t.classList.add('play'); });
    else {
      var tio = new IntersectionObserver(function (entries) { entries.forEach(function (en) { if (en.isIntersecting && !en.target.classList.contains('play')) { en.target.classList.add('play'); en.target._playedAt = Date.now(); } }); }, { threshold: 0.35 });
      tiles.forEach(function (t) {
        tio.observe(t);
        t.addEventListener('mouseenter', function () { if (t._playedAt && Date.now() - t._playedAt > 11000) restart(t); });
        var s = t.querySelector('.stage'); if (s) s.addEventListener('click', function () { restart(t); });
      });
    }
  }

  /* ---------- the setup journey: the rail and the six steps play once on arrival, hold, and replay on tap ---------- */
  var jt = document.querySelector('.jtile');
  if (jt) {
    var jstart = function () { jt.classList.add('play'); jt._playedAt = Date.now(); };
    var jrestart = function () {
      var w = jt.querySelector('.jplay'); if (!w) return;
      var c = w.cloneNode(true); w.parentNode.replaceChild(c, w); jt._playedAt = Date.now();
    };
    if (reduced || !('IntersectionObserver' in window)) jstart();
    else {
      /* the block is taller than a phone screen, so a low threshold is what actually fires */
      var jio = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { jstart(); jio.disconnect(); }
      }, { threshold: 0.12 });
      jio.observe(jt);
      jt.addEventListener('click', function () { if (jt._playedAt && Date.now() - jt._playedAt > 2000) jrestart(); });
    }
  }

  /* ---------- video ---------- */
  Array.prototype.slice.call(document.querySelectorAll('[data-vid]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var v = document.createElement('video');
      v.src = btn.getAttribute('data-vid'); v.controls = true; v.autoplay = true; v.muted = true; v.playsInline = true; v.loop = true;
      v.setAttribute('aria-label', btn.getAttribute('aria-label') || 'Recording');
      var host = btn.closest('.vframe'); host.innerHTML = ''; host.appendChild(v); v.tabIndex = 0; v.focus(); v.play().catch(function () {});
    });
  });
  if (staticCopy) Array.prototype.slice.call(document.querySelectorAll('[data-live-link]')).forEach(function (a) { a.hidden = true; });

  /* ---------- copy buttons ---------- */
  Array.prototype.slice.call(document.querySelectorAll('[data-copy]')).forEach(function (copy) {
    var target = document.getElementById(copy.getAttribute('data-copy'));
    copy.addEventListener('click', function () {
      var text = target ? target.textContent.trim() : '';
      function done(ok) { copy.setAttribute('data-state', ok ? 'done' : 'fail'); copy.textContent = ok ? 'Copied' : 'Select it'; setTimeout(function () { copy.removeAttribute('data-state'); copy.textContent = 'Copy'; }, 1800); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
  });
  /* ---------- account: create, verify by email, reserve a seat, request a demo ---------- */
  var acct = document.getElementById('account');
  var mailHrefFor = function (mailTo, d) { return 'mailto:' + mailTo + '?subject=' + encodeURIComponent('tm8 demo request · ' + d.name) + '&body=' + encodeURIComponent((d.message + '\n\n' + d.name + ' · ' + d.email + (d.company ? ' · ' + d.company : '')).replace(/\r?\n/g, '\r\n')); };
  if (acct && window.firebase && firebase.auth) {
    var fbcfg = JSON.parse(acct.getAttribute('data-firebase'));
    firebase.initializeApp(fbcfg);
    var auth = firebase.auth();
    var SIGNUPS = acct.getAttribute('data-signups'), INBOX = acct.getAttribute('data-inbox'), MAIL = acct.getAttribute('data-mail') || '';
    var panels = {}; Array.prototype.slice.call(acct.querySelectorAll('[data-panel]')).forEach(function (p) { panels[p.getAttribute('data-panel')] = p; });
    var show = function (name) { Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== name; }); };
    var setEmail = function (e) { Array.prototype.slice.call(acct.querySelectorAll('[data-email]')).forEach(function (el) { el.textContent = e || ''; }); };
    var say = function (sel, msg) { var el = acct.querySelector(sel); if (el) { el.textContent = ''; el.textContent = msg; } };
    var words = function (err) {
      var c = (err && err.code) || '';
      if (c === 'auth/email-already-in-use') return 'That email already has an account. Sign in instead.';
      if (c === 'auth/invalid-email') return 'That email does not look right.';
      if (c === 'auth/weak-password' || c === 'auth/password-does-not-meet-requirements') return 'Use eight characters or more.';
      if (c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/user-not-found' || c === 'auth/invalid-login-credentials') return 'Email or password did not match.';
      if (c === 'auth/too-many-requests') return 'Too many tries. Wait a minute and try again.';
      if (c === 'auth/network-request-failed') return 'No connection. Try again.';
      return 'Something went wrong. Try again.';
    };
    var fields = function (f) { var fd = new FormData(f); return { email: String(fd.get('email') || '').trim(), password: String(fd.get('password') || '') }; };
    var emailOk = function (e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); };
    /* An ID token minted before the visitor opened the verification link still carries
       email_verified:false, and the database rules read the TOKEN, not the account. reload()
       refreshes the account object and never the token, so a visitor who has just verified is
       shown as signed in while every write is refused until the old token expires — up to an
       hour. Ask for a fresh token whenever a write is refused, then try once more. */
    var reserve = function (user) {
      var attempt = function (force) {
        return user.getIdToken(force).then(function (t) {
          var url = SIGNUPS + '/' + user.uid + '.json?auth=' + encodeURIComponent(t);
          return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (rec) {
            if (rec) return rec;
            return fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, plan: 'free-100', source: 'tm8-site', createdAt: { '.sv': 'timestamp' } }) })
              .then(function (r) { if (!r.ok && !force) return attempt(true); return r.ok ? r.json() : null; });
          });
        });
      };
      return attempt(false);
    };
    var render = function (user) {
      if (!user) { setEmail(''); show('create'); return; }
      setEmail(user.email);
      if (!user.emailVerified) { show('verify'); return; }
      show('in'); reserve(user).catch(function () {});
    };
    auth.onAuthStateChanged(render);
    Array.prototype.slice.call(document.querySelectorAll('[data-show], [data-show-signin]')).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); var u = auth.currentUser; if (a.hasAttribute('data-show-signin') && u) { render(u); } else { show(a.getAttribute('data-show') || 'signin'); } acct.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }); });
    Array.prototype.slice.call(acct.querySelectorAll('[data-signout]')).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); auth.signOut(); }); });
    var createForm = acct.querySelector('[data-create-form]');
    createForm.addEventListener('submit', function (e) {
      e.preventDefault(); var v = fields(createForm);
      if (!emailOk(v.email)) { say('[data-astat]', 'That email does not look right.'); createForm.email.focus(); return; }
      if (v.password.length < 8) { say('[data-astat]', 'Use eight characters or more.'); createForm.password.focus(); return; }
      say('[data-astat]', 'Creating your account…');
      auth.createUserWithEmailAndPassword(v.email, v.password)
        .then(function (cred) { return cred.user.sendEmailVerification().then(function () { say('[data-astat]', ''); say('[data-vstat]', 'Sent. The email comes from noreply@' + fbcfg.authDomain + '; check spam if it is slow.'); }); })
        .catch(function (err) { say('[data-astat]', words(err)); });
    });
    var signinForm = acct.querySelector('[data-signin-form]');
    signinForm.addEventListener('submit', function (e) {
      e.preventDefault(); var v = fields(signinForm);
      if (!emailOk(v.email)) { say('[data-sstat]', 'That email does not look right.'); signinForm.email.focus(); return; }
      say('[data-sstat]', 'Signing in…');
      auth.signInWithEmailAndPassword(v.email, v.password).then(function () { say('[data-sstat]', ''); }).catch(function (err) { say('[data-sstat]', words(err)); });
    });
    var resetLink = acct.querySelector('[data-reset]');
    if (resetLink) resetLink.addEventListener('click', function (e) { e.preventDefault(); var v = fields(signinForm); if (!emailOk(v.email)) { say('[data-sstat]', 'Type your email above first, then tap this again.'); signinForm.email.focus(); return; } auth.sendPasswordResetEmail(v.email).then(function () { say('[data-sstat]', 'Reset link sent to ' + v.email + '.'); }).catch(function (err) { say('[data-sstat]', words(err)); }); });
    acct.querySelector('[data-verified]').addEventListener('click', function () { var u = auth.currentUser; if (!u) { show('create'); return; } say('[data-vstat]', 'Checking…'); u.reload().then(function () { if (auth.currentUser && auth.currentUser.emailVerified) { return auth.currentUser.getIdToken(true).catch(function () {}).then(function () { say('[data-vstat]', ''); render(auth.currentUser); }); } say('[data-vstat]', 'Not verified yet. Open the link in the email, then tap again.'); }).catch(function (err) { say('[data-vstat]', words(err)); }); });
    acct.querySelector('[data-resend]').addEventListener('click', function () { var u = auth.currentUser; if (!u) return; u.sendEmailVerification().then(function () { say('[data-vstat]', 'Sent again to ' + u.email + '.'); }).catch(function (err) { say('[data-vstat]', words(err)); }); });
    /* demo request, from a verified account; the mail draft is the fallback */
    var form = acct.querySelector('[data-demo-form]');
    var fstat = form.querySelector('[data-fstat]');
    var fallback = function (d, err) { fstat.textContent = (err ? err + ' ' : 'The request could not be sent. ') + 'Send it by email instead: '; var a = document.createElement('a'); a.href = mailHrefFor(MAIL, d); a.textContent = 'open your mail app →'; fstat.appendChild(a); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var u = auth.currentUser; if (!u || !u.emailVerified) { show(u ? 'verify' : 'create'); return; }
      var fd = new FormData(form);
      var d = { name: String(fd.get('name') || '').trim(), email: u.email, company: String(fd.get('company') || '').trim(), message: String(fd.get('message') || '').trim(), consent: !!fd.get('consent'), website: String(fd.get('website') || '') };
      var bad = function (field, msg) { fstat.textContent = ''; fstat.textContent = msg; field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', 'fstat'); field.focus(); };
      if (d.name.length < 2) { bad(form.name, 'Your name, please.'); return; }
      if (d.message.length < 20) { bad(form.message, 'Say a little more about the task, twenty characters or so.'); return; }
      if (!d.consent) { bad(form.consent, 'Tick the box so we may reply.'); return; }
      var btn = form.querySelector('button[type="submit"]'); btn.disabled = true; fstat.textContent = 'Sending…';
      var post = function (force) {
        return u.getIdToken(force)
          .then(function (t) { return fetch(INBOX + '?auth=' + encodeURIComponent(t), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: d.name, email: u.email, uid: u.uid, company: d.company, message: d.message, type: 'demo', consent: true, website: d.website, source: 'tm8-site', page: location.href.slice(0, 200), userAgent: navigator.userAgent.slice(0, 300), createdAt: { '.sv': 'timestamp' } }) }); })
          .then(function (r) { if (!r.ok && !force) return post(true); return r; });
      };
      post(false)
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, ref: b && b.name ? String(b.name).slice(-6).toUpperCase() : undefined }; }); })
        .then(function (x) { if (x.ok) { fstat.textContent = 'Received. Reference ' + (x.ref || 'sent') + ', filed under ' + u.email + '. Requests are read every working day.'; form.reset(); } else { fallback(d, 'The request was refused.'); } })
        .catch(function () { fallback(d); })
        .then(function () { btn.disabled = false; if (document.activeElement === document.body) (fstat.querySelector('a') || btn).focus(); });
    });
    Array.prototype.slice.call(acct.querySelectorAll('input, textarea')).forEach(function (f) { f.addEventListener('input', function () { f.removeAttribute('aria-invalid'); f.removeAttribute('aria-describedby'); }); });
  } else if (acct) {
    var offline = acct.querySelector('[data-astat]'); if (offline) offline.textContent = 'Sign-up is unavailable right now. Email ' + (acct.getAttribute('data-mail') || '') + ' instead.';
  }
  var fig = document.querySelector('.real .fig');
  if (fig) { var figTab = function () { if (fig.scrollWidth > fig.clientWidth + 1) fig.tabIndex = 0; else fig.removeAttribute('tabindex'); }; figTab(); window.addEventListener('resize', figTab); }
  var menu = document.querySelector('details.menu');
  if (menu) menu.addEventListener('click', function (e) { if (e.target && e.target.tagName === 'A') menu.removeAttribute('open'); });
})();
