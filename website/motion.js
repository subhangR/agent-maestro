(function(){
    "use strict";
    var docEl = document.documentElement;
    docEl.classList.add("js");
    var mqRM = window.matchMedia("(prefers-reduced-motion: reduce)");
    function reduced(){ return mqRM.matches; }
    if (reduced()) docEl.classList.add("no-motion");

    /* ---------- theme: the lit stage or the printed programme ---------- */
    var THEME_KEY = "maestro-theme";
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    var themeBtn = document.querySelector("[data-theme-toggle]");
    var mqLight = window.matchMedia("(prefers-color-scheme: light)");
    function storedTheme(){
      try {
        var t = localStorage.getItem(THEME_KEY);
        return (t === "light" || t === "dark") ? t : null;
      } catch(_e){ return null; }
    }
    function currentTheme(){
      return docEl.getAttribute("data-theme") === "light" ? "light" : "dark";
    }
    function applyTheme(t){
      docEl.setAttribute("data-theme", t);
      if (themeMeta) themeMeta.setAttribute("content", getComputedStyle(docEl).getPropertyValue("--bg").trim());
      if (themeBtn) themeBtn.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
      document.dispatchEvent(new Event("maestro:theme"));
    }
    (function(){
      var initial = docEl.getAttribute("data-theme");
      if (initial !== "light" && initial !== "dark"){
        initial = storedTheme() || (mqLight.matches ? "light" : "dark");
      }
      applyTheme(initial);
    })();
    if (themeBtn){
      themeBtn.addEventListener("click", function(){
        var next = currentTheme() === "light" ? "dark" : "light";
        applyTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch(_e){}
      });
    }
    function onSchemeChange(){
      if (!storedTheme()) applyTheme(mqLight.matches ? "light" : "dark");
    }
    if (mqLight.addEventListener) mqLight.addEventListener("change", onSchemeChange);
    else if (mqLight.addListener) mqLight.addListener(onSchemeChange);

    /* ---------- year ---------- */
    var yr = document.querySelector("[data-year]");
    if (yr) yr.textContent = String(new Date().getFullYear());

    /* ---------- header state ---------- */
    var header = document.querySelector("[data-header]");
    function onScrollHeader(){
      if (!header) return;
      header.classList.toggle("scrolled", window.scrollY > 24);
    }
    window.addEventListener("scroll", onScrollHeader, {passive:true});
    onScrollHeader();

    /* ---------- mobile menu ---------- */
    var menuBtn = document.querySelector("[data-menu-button]");
    var menu = document.querySelector("[data-menu]");
    function closeMenu(){
      if (!menu || !menuBtn) return;
      menu.classList.remove("open");
      menuBtn.setAttribute("aria-expanded","false");
    }
    if (menuBtn && menu){
      menuBtn.addEventListener("click", function(){
        var open = menu.classList.toggle("open");
        menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      menu.addEventListener("click", function(e){
        if (e.target && e.target.tagName === "A") closeMenu();
      });
      document.addEventListener("keydown", function(e){
        if (e.key === "Escape") closeMenu();
      });
    }

    /* ---------- copy install command ---------- */
    var copyBtn = document.querySelector("[data-copy]");
    if (copyBtn){
      copyBtn.addEventListener("click", function(){
        var cmd = copyBtn.getAttribute("data-command") || "";
        function done(){
          copyBtn.textContent = "Copied";
          copyBtn.classList.add("done");
          window.setTimeout(function(){
            copyBtn.textContent = "Copy";
            copyBtn.classList.remove("done");
          }, 1700);
        }
        if (navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(cmd).then(done, function(){ fallback(); });
        } else { fallback(); }
        function fallback(){
          var ta = document.createElement("textarea");
          ta.value = cmd;
          ta.setAttribute("readonly","");
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); done(); } catch(_e){}
          document.body.removeChild(ta);
        }
      });
    }

    /* ---------- scroll choreography ---------- */
    var cues = Array.prototype.slice.call(document.querySelectorAll("[data-cue]"));
    cues.forEach(function(el){
      var d = el.getAttribute("data-cue-delay");
      if (d) el.style.setProperty("--d", d);
    });
    // stagger tracklist rows like fugue entries
    Array.prototype.slice.call(document.querySelectorAll(".trk")).forEach(function(el, i){
      el.style.setProperty("--d", (i % 5) * 0.07 + "s");
    });
    if ("IntersectionObserver" in window && !reduced()){
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          if (en.isIntersecting){
            en.target.classList.add("on");
            io.unobserve(en.target);
          }
        });
      }, {threshold:.16, rootMargin:"0px 0px -6% 0px"});
      cues.forEach(function(el){ io.observe(el); });
    } else {
      cues.forEach(function(el){ el.classList.add("on"); });
    }

    /* ---------- canon scroll progress (four voices, slight lag each) ---------- */
    var canonBars = Array.prototype.slice.call(document.querySelectorAll(".canon i"));
    if (canonBars.length && !reduced()){
      var canonP = [0,0,0,0];
      var canonRaf = 0;
      function canonTick(){
        var max = Math.max(1, docEl.scrollHeight - window.innerHeight);
        var target = Math.min(1, Math.max(0, window.scrollY / max));
        var busy = false;
        for (var i = 0; i < canonBars.length; i++){
          canonP[i] += (target - canonP[i]) * (0.18 - i * 0.035);
          if (Math.abs(target - canonP[i]) > 0.0004) busy = true;
          canonBars[i].style.transform = "scaleX(" + canonP[i].toFixed(4) + ")";
        }
        canonRaf = busy ? window.requestAnimationFrame(canonTick) : 0;
      }
      window.addEventListener("scroll", function(){
        if (!canonRaf) canonRaf = window.requestAnimationFrame(canonTick);
      }, {passive:true});
      canonTick();
    }

    /* ==========================================================
       THE SCORE · generative hero
       Four voices flow across the stage. A baton (auto sweep, or
       your pointer) conducts them: where it passes, the voices
       resolve into one chord; behind it they drift apart again.
       On each beat, notes are struck at the baton and fade.
       ========================================================== */
    var canvas = document.getElementById("score");
    var hero = canvas ? canvas.parentElement : null;
    if (canvas && hero){
      var ctx = canvas.getContext("2d");
      if (ctx){
        var VOICES = [
          {c:"#e3a55a", f:0.95, f2:2.15, ph:0.0, amp:1.0},
          {c:"#84c4b1", f:1.20, f2:1.70, ph:1.7, amp:0.86},
          {c:"#93aae7", f:0.78, f2:2.60, ph:3.1, amp:0.92},
          {c:"#da8aa0", f:1.38, f2:1.35, ph:4.6, amp:0.80}
        ];
        /* the score reads its palette from the same tokens as the page,
           so both lit states paint with their own inks */
        var STAVE = "rgba(240,233,221,0.05)";
        var BAND = "rgba(240,233,221,0.05)";
        var BAND0 = "rgba(240,233,221,0)";
        var BATON = "rgba(240,233,221,0.10)";
        function readScoreColors(){
          var cs = getComputedStyle(docEl);
          function tok(name, fb){
            var v = cs.getPropertyValue(name).trim();
            return v || fb;
          }
          for (var i = 0; i < VOICES.length; i++){
            VOICES[i].c = tok("--v" + (i + 1), VOICES[i].c);
          }
          STAVE = tok("--score-stave", STAVE);
          BAND = tok("--score-band", BAND);
          BAND0 = tok("--score-band-0", BAND0);
          BATON = tok("--score-baton", BATON);
        }
        readScoreColors();
        var TAU = Math.PI * 2;
        var TEMPO = 0.75;            // beats per second
        var SIGMA = 0.075;           // baton focus width
        var W = 0, H = 0, dpr = 1;
        var raf = 0, inView = true;
        var t0 = performance.now();
        var introStart = t0;
        var batonX = 0.62;
        var pointer = {x:0.62, y:0.5, active:false};
        var notes = [];
        var lastBeat = -1;

        function easeOutCubic(x){ return 1 - Math.pow(1 - x, 3); }

        function voiceBase(i){ return H * (0.47 + i * 0.115); }

        function edgeTaper(u){
          return Math.min(1, u * 5.5, (1 - u) * 5.5);
        }

        function voiceY(u, t, i, g, bx){
          var v = VOICES[i];
          var du = u - bx;
          var align = Math.exp(-(du * du) / (2 * SIGMA * SIGMA));
          var personal = Math.sin(u * TAU * v.f * 1.55 + t * 1.05 + v.ph) * 0.62
                       + Math.sin(u * TAU * v.f2 + t * 0.72 + v.ph * 2.3) * 0.38;
          var chord = Math.sin(u * 7.5 - t * 1.15 + 0.4);
          var base = voiceBase(i);
          var mean = (voiceBase(0) + voiceBase(3)) / 2;
          var b = base + (mean - base) * align * 0.22;
          var A = H * 0.058 * v.amp * g * edgeTaper(u) * (0.9 + 0.35 * (1 - pointer.y));
          return b + A * (personal * (1 - align * 0.8) + chord * align * 0.8 * 0.62);
        }

        function drawFrame(t, g, bx, now){
          ctx.clearRect(0, 0, W, H);

          // faint stave rules
          ctx.strokeStyle = STAVE;
          ctx.lineWidth = 1;
          for (var i = 0; i < 4; i++){
            ctx.beginPath();
            ctx.moveTo(0, voiceBase(i));
            ctx.lineTo(W, voiceBase(i));
            ctx.stroke();
          }

          // baton band
          var px = bx * W;
          var grad = ctx.createLinearGradient(px - 80, 0, px + 80, 0);
          grad.addColorStop(0, BAND0);
          grad.addColorStop(0.5, BAND);
          grad.addColorStop(1, BAND0);
          ctx.fillStyle = grad;
          ctx.fillRect(px - 80, voiceBase(0) - H * 0.1, 160, voiceBase(3) - voiceBase(0) + H * 0.2);
          ctx.strokeStyle = BATON;
          ctx.beginPath();
          ctx.moveTo(px, voiceBase(0) - H * 0.08);
          ctx.lineTo(px, voiceBase(3) + H * 0.08);
          ctx.stroke();

          // voices: a bright strand and a soft echo strand each
          var step = Math.max(10, W / 110);
          for (var vi = 0; vi < 4; vi++){
            for (var s = 0; s < 2; s++){
              ctx.beginPath();
              ctx.strokeStyle = VOICES[vi].c;
              ctx.globalAlpha = s ? 0.28 : 0.85;
              ctx.lineWidth = s ? 1 : 1.6;
              var first = true;
              for (var x = 0; x <= W + step; x += step){
                var u = Math.min(1, x / W);
                var y = voiceY(u, t + s * 0.35, vi, g * (s ? 0.7 : 1), bx);
                if (first){ ctx.moveTo(x, y); first = false; }
                else ctx.lineTo(x, y);
              }
              ctx.stroke();
            }
            // node where the baton meets the voice
            var ny = voiceY(bx, t, vi, g, bx);
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = VOICES[vi].c;
            ctx.beginPath();
            ctx.arc(px, ny, 2.6, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;

          // struck notes
          for (var n = notes.length - 1; n >= 0; n--){
            var note = notes[n];
            var age = (now - note.born) / note.life;
            if (age >= 1){ notes.splice(n, 1); continue; }
            ctx.globalAlpha = (1 - age) * 0.85;
            ctx.fillStyle = VOICES[note.vi].c;
            ctx.beginPath();
            ctx.arc(note.x, note.y - age * 16, 2.1 + age * 1.2, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        function frame(now){
          raf = window.requestAnimationFrame(frame);
          var t = (now - t0) / 1000;

          // the downbeat: tense near-flat lines, then bloom at ~0.55s
          var it = now - introStart;
          var g;
          if (it < 550) g = 0.09 + 0.015 * Math.sin(t * 24);
          else g = 0.09 + 0.91 * easeOutCubic(Math.min(1, (it - 550) / 950));

          var target = pointer.active ? pointer.x : 0.5 + 0.34 * Math.sin(t * 0.33);
          batonX += (target - batonX) * 0.05;

          // strike notes on the beat
          var beat = Math.floor(t * TEMPO);
          if (beat !== lastBeat && g > 0.6){
            lastBeat = beat;
            for (var k = 0; k < 2; k++){
              var vi = (beat * 2 + k) % 4;
              if (notes.length < 40){
                notes.push({
                  x: batonX * W,
                  y: voiceY(batonX, t, vi, g, batonX),
                  vi: vi,
                  born: now,
                  life: 1500
                });
              }
            }
          }
          drawFrame(t, g, batonX, now);
        }

        function drawStatic(){
          // one premium still: the score mid-phrase, resolved at the baton
          notes.length = 0;
          var t = 6.4, bx = 0.62, now = performance.now();
          for (var k = 0; k < 4; k++){
            notes.push({
              x: (0.30 + k * 0.13) * W,
              y: voiceY(0.30 + k * 0.13, t, k % 4, 1, bx),
              vi: k % 4,
              born: now - 400,
              life: 100000
            });
          }
          drawFrame(t, 1, bx, now);
          notes.length = 0;
        }

        function start(){
          if (!raf && !reduced() && inView && !document.hidden){
            raf = window.requestAnimationFrame(frame);
          }
        }
        function stop(){
          if (raf){ window.cancelAnimationFrame(raf); raf = 0; }
        }

        function resize(){
          var r = hero.getBoundingClientRect();
          dpr = Math.min(window.devicePixelRatio || 1, 2);
          W = Math.max(1, Math.round(r.width));
          H = Math.max(1, Math.round(r.height));
          canvas.width = Math.round(W * dpr);
          canvas.height = Math.round(H * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          if (reduced() || !raf) drawStatic();
        }
        resize();
        if ("ResizeObserver" in window){
          var ro = new ResizeObserver(function(){ resize(); });
          ro.observe(hero);
        } else {
          window.addEventListener("resize", resize);
        }

        hero.addEventListener("pointermove", function(e){
          var r = hero.getBoundingClientRect();
          pointer.x = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
          pointer.y = Math.min(1, Math.max(0, (e.clientY - r.top) / Math.max(1, r.height)));
          pointer.active = true;
        });
        hero.addEventListener("pointerleave", function(){ pointer.active = false; });

        if ("IntersectionObserver" in window){
          var cio = new IntersectionObserver(function(entries){
            inView = entries[0].isIntersecting;
            if (inView) start(); else stop();
          }, {threshold: 0});
          cio.observe(canvas);
        }
        document.addEventListener("visibilitychange", function(){
          if (document.hidden) stop(); else start();
        });
        document.addEventListener("maestro:theme", function(){
          readScoreColors();
          /* live frames pick the new inks up next tick; a paused or
             reduced-motion score repaints its resolved still now */
          if (reduced() || !raf) drawStatic();
        });
        mqRM.addEventListener ? mqRM.addEventListener("change", function(){
          if (reduced()){ docEl.classList.add("no-motion"); stop(); drawStatic(); }
          else { docEl.classList.remove("no-motion"); start(); }
        }) : null;

        if (reduced()){
          drawStatic();
        } else {
          introStart = performance.now();
          start();
        }
      }
    }

    /* ---------- cue the overture (syncs CSS delays with the canvas bloom) ---------- */
    window.requestAnimationFrame(function(){
      docEl.classList.add("overture");
    });
  })();
