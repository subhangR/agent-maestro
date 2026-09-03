/* tm8 public site — session to session. The Sessions panel from the product's Work tab, drawn as it
   is, with one real exchange from 3 September 2026 travelling along the tree: the Fable 5.1 session
   (Claude Code) messages the GPT 5.6 session (Codex) by its id, it lands as that session's next turn,
   and the reply comes back the same way. No framework, no tracking. */
(function () {
  'use strict';
  var root = document.querySelector('[data-sess]');
  if (!root) return;
  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var cap = root.querySelector('[data-sess-cap]');
  var wire = root.querySelector('[data-sess-wire]');
  var path = wire.querySelector('path'), dot = wire.querySelector('circle');
  var rows = { fable: root.querySelector('[data-n="fable"] > .row'), codex: root.querySelector('[data-n="codex"] > .row'), opus: root.querySelector('[data-n="opus"] > .row') };
  var bubbles = { codex: root.querySelector('[data-b="to-codex"]'), fable: root.querySelector('[data-b="to-fable"]') };
  var timers = [], raf = null;
  var BEATS = [
    'Three sessions on one task on tm8.sh: Fable 5.1 and Opus 5 on Claude Code, GPT 5.6 on Codex. One tree, one record.',
    'Fable messages the Codex session by its id. tm8 message send --to 01a0692a… No bridge, no copy and paste.',
    'It is stored on the record first, then delivered into the Codex session as its next turn.',
    'The reply comes back the same way, in the same thread, on the record.',
    'Anyone on the team can read the exchange later. That is the point of tm8.sh.'
  ];
  function say(i) { if (cap && cap.textContent !== BEATS[i]) cap.textContent = BEATS[i]; }
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clear() { timers.forEach(clearTimeout); timers = []; if (raf) cancelAnimationFrame(raf); raf = null; }
  function centre(el) {
    var r = el.getBoundingClientRect(), w = wire.getBoundingClientRect();
    return { x: r.left - w.left + 14, y: r.top - w.top + r.height / 2 };
  }
  function layout() {
    var w = wire.getBoundingClientRect();
    wire.setAttribute('viewBox', '0 0 ' + Math.max(1, Math.round(w.width)) + ' ' + Math.max(1, Math.round(w.height)));
    var a = centre(rows.fable), b = centre(rows.codex);
    path.setAttribute('d', 'M' + a.x + ' ' + a.y + ' L' + a.x + ' ' + b.y + ' L' + (b.x - 6) + ' ' + b.y);
  }
  function travel(reverse, ms, done) {
    var len = path.getTotalLength(), t0 = null;
    dot.style.opacity = '1';
    function step(now) {
      if (t0 === null) t0 = now;
      var k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      var p = path.getPointAtLength((reverse ? 1 - e : e) * len);
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
      if (k < 1) raf = requestAnimationFrame(step); else { raf = null; dot.style.opacity = '0'; done(); }
    }
    raf = requestAnimationFrame(step);
  }
  function reset() {
    clear();
    Object.keys(rows).forEach(function (k) { rows[k].classList.remove('lit'); });
    Object.keys(bubbles).forEach(function (k) { bubbles[k].classList.remove('on'); });
    dot.style.opacity = '0';
  }
  function finished() { reset(); bubbles.codex.classList.add('on'); bubbles.fable.classList.add('on'); say(4); }
  function play() {
    reset(); layout(); say(0);
    at(1600, function () { rows.fable.classList.add('lit'); say(1); travel(false, 1500, function () {
      rows.codex.classList.add('lit'); bubbles.codex.classList.add('on'); say(2);
      at(3200, function () { rows.codex.classList.remove('lit'); travel(true, 1500, function () {
        rows.fable.classList.add('lit'); bubbles.fable.classList.add('on'); say(3);
        at(3400, function () { rows.fable.classList.remove('lit'); say(4); });
        at(6600, function () { if (onScreen) play(); });
      }); });
    }); });
  }
  var onScreen = false;
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 120); });
  layout();
  if (calm) { finished(); return; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && !onScreen) { onScreen = true; play(); } else if (!e.isIntersecting && onScreen) { onScreen = false; finished(); } });
    }, { threshold: 0.35 }).observe(root);
  } else { onScreen = true; play(); }
})();
