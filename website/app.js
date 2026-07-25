(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var header = document.querySelector("[data-header]");
  var menuButton = document.querySelector("[data-menu-button]");
  var menu = document.querySelector("[data-menu]");
  var copyButton = document.querySelector("[data-copy-command]");
  var command = document.querySelector("[data-command]");
  var brandIntro = document.querySelector("[data-brand-intro]");
  var brandTriggers = document.querySelectorAll("[data-brand-trigger]");
  var contactForm = document.querySelector("[data-contact-form]");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var introTimer;

  function endBrandIntro() {
    if (!brandIntro) return;
    window.clearTimeout(introTimer);
    brandIntro.classList.remove("is-active");
    brandIntro.classList.add("is-dismissing");
    document.body.classList.remove("intro-active");
    stopIntroFx();
    window.setTimeout(function () { brandIntro.classList.remove("is-dismissing"); }, 650);
  }

  function playBrandIntro() {
    if (!brandIntro || reduceMotion) return;
    window.clearTimeout(introTimer);
    brandIntro.classList.remove("is-dismissing");
    brandIntro.classList.remove("is-active");
    void brandIntro.offsetWidth;
    brandIntro.classList.add("is-active");
    document.body.classList.add("intro-active");
    startIntroFx();
    introTimer = window.setTimeout(endBrandIntro, 3900);
  }

  if (!reduceMotion && !window.sessionStorage.getItem("maestroBrandSeen")) {
    window.sessionStorage.setItem("maestroBrandSeen", "true");
    playBrandIntro();
  }

  brandTriggers.forEach(function (trigger) {
    trigger.addEventListener("click", function () { playBrandIntro(); });
  });

  // Click anywhere on the intro (or press a key) to skip it.
  if (brandIntro) {
    brandIntro.addEventListener("click", endBrandIntro);
    window.addEventListener("keydown", function (event) {
      if (brandIntro.classList.contains("is-active") &&
          (event.key === "Escape" || event.key === "Enter" || event.key === " ")) {
        endBrandIntro();
      }
    });
  }

  function isString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function applyPublicContent(content) {
    if (!content || typeof content !== "object" || content.schemaVersion !== 1) return;
    document.querySelectorAll("[data-content]").forEach(function (element) {
      var key = element.getAttribute("data-content");
      if (key && isString(content[key])) element.textContent = content[key];
    });
    document.querySelectorAll("[data-command-source]").forEach(function (element) {
      var key = element.getAttribute("data-command-source");
      if (key && isString(content[key])) element.setAttribute("data-command", content[key]);
    });
  }

  fetch("content/site.json", { headers: { "Accept": "application/json" }, cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) throw new Error("Public content unavailable");
      return response.json();
    })
    .then(applyPublicContent)
    .catch(function () {
      // The semantic HTML is the complete, production-safe fallback.
    });

  function updateHeader() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 12);
  }

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  if (menuButton && menu) {
    menuButton.addEventListener("click", function () {
      var open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      menu.classList.toggle("open", !open);
      menuButton.querySelector(".sr-only").textContent = open ? "Open navigation" : "Close navigation";
    });

    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        menuButton.setAttribute("aria-expanded", "false");
        menu.classList.remove("open");
      }
    });
  }

  if (copyButton && command) {
    copyButton.addEventListener("click", function () {
      var value = command.getAttribute("data-command") || "";
      if (!navigator.clipboard) {
        copyButton.textContent = "Select text";
        return;
      }
      navigator.clipboard.writeText(value).then(function () {
        copyButton.textContent = "Copied";
        window.setTimeout(function () { copyButton.textContent = "Copy"; }, 1600);
      }).catch(function () {
        copyButton.textContent = "Select text";
      });
    });
  }

  if (contactForm) {
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!contactForm.reportValidity()) return;

      var submitButton = contactForm.querySelector("[data-contact-submit]");
      var status = contactForm.querySelector("[data-contact-status]");
      var formData = new FormData(contactForm);
      var payload = {
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        company: formData.get("company"),
        type: formData.get("type"),
        message: formData.get("message"),
        website: formData.get("website"),
        consent: formData.get("consent") === "on"
      };

      contactForm.classList.add("is-sending");
      submitButton.disabled = true;
      submitButton.textContent = "Sending…";
      status.className = "form-status";
      status.textContent = "Sending your enquiry securely.";

      function mailtoHref() {
        var lines = [
          "Name: " + (payload.name || ""),
          "Email: " + (payload.email || ""),
          payload.phone ? "Phone: " + payload.phone : "",
          payload.company ? "Company: " + payload.company : "",
          "Reach-out type: " + (payload.type || "general"),
          "",
          payload.message || ""
        ].filter(function (line) { return line !== ""; });
        return "mailto:manzilshaik95@gmail.com?subject=" +
          encodeURIComponent("Maestro enquiry — " + (payload.type || "general") + " — " + (payload.name || "")) +
          "&body=" + encodeURIComponent(lines.join("\n"));
      }

      // When the API endpoint is not reachable, fall back to a fully prefilled
      // email draft so the form is never a dead end.
      function offerEmailFallback() {
        contactForm.reset();
        status.className = "form-status";
        status.textContent = "Ready to send — we'll open a prefilled email for you.";
        var send = document.createElement("a");
        send.className = "form-status-link";
        send.href = mailtoHref();
        send.textContent = "Open email to send →";
        status.appendChild(document.createTextNode(" "));
        status.appendChild(send);
        try { window.location.href = send.href; } catch (e) {}
      }

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          // 400/429 are genuine validation/rate-limit answers from a live endpoint.
          if (response.status === 400 || response.status === 429) {
            var validationError = new Error(body.error || "Please review your enquiry and try again.");
            validationError.handled = true;
            throw validationError;
          }
          if (!response.ok) throw new Error(body.error || "endpoint-unavailable");
          return body;
        });
      }).then(function (body) {
        contactForm.reset();
        status.className = "form-status success";
        status.textContent = "Message received. Reference " + (body && body.reference ? body.reference : "sent") + ".";
      }).catch(function (error) {
        if (error && error.handled) {
          status.className = "form-status error";
          status.textContent = error.message;
        } else {
          offerEmailFallback();
        }
      }).finally(function () {
        contactForm.classList.remove("is-sending");
        submitButton.disabled = false;
        submitButton.textContent = "Send enquiry";
      });
    });
  }

  var tourTabs = document.querySelectorAll("[data-shot-tab]");
  var tourShots = document.querySelectorAll("[data-shot]");
  var tourCaption = document.querySelector("[data-tour-caption]");
  if (tourTabs.length && tourShots.length) {
    tourTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var key = tab.getAttribute("data-shot-tab");
        tourTabs.forEach(function (other) {
          other.setAttribute("aria-selected", String(other === tab));
        });
        tourShots.forEach(function (img) {
          img.hidden = img.getAttribute("data-shot") !== key;
        });
        if (tourCaption) {
          var num = tourCaption.querySelector("[data-tour-num]");
          var title = tourCaption.querySelector("[data-tour-title]");
          var textEl = tourCaption.querySelector("[data-tour-text]");
          if (num) num.textContent = tab.getAttribute("data-num") || "";
          if (title) title.textContent = tab.getAttribute("data-title") || "";
          if (textEl) textEl.textContent = tab.getAttribute("data-caption") || "";
        }
      });
    });
  }

  document.querySelectorAll("[data-year]").forEach(function (element) {
    element.textContent = String(new Date().getFullYear());
  });

  // --- Scroll reveals, with staggered groups ---
  var revealItems = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  var staggerGroups = Array.prototype.slice.call(document.querySelectorAll("[data-stagger]"));
  var staggerChildren = [];
  staggerGroups.forEach(function (group) {
    Array.prototype.forEach.call(group.querySelectorAll(".reveal"), function (child) {
      staggerChildren.push(child);
    });
  });

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach(function (item) { item.classList.add("is-visible"); });
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

    var groupObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var kids = entry.target.querySelectorAll(".reveal");
        Array.prototype.forEach.call(kids, function (child, i) {
          child.style.transitionDelay = (i * 0.07).toFixed(2) + "s";
          child.classList.add("is-visible");
        });
        groupObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.06 });

    // Individually observe reveals that are not inside a stagger group.
    revealItems.forEach(function (item) {
      if (staggerChildren.indexOf(item) === -1) observer.observe(item);
    });
    staggerGroups.forEach(function (group) { groupObserver.observe(group); });
  }

  // --- Scroll progress bar ---
  var progress = document.querySelector("[data-scroll-progress]");
  function updateProgress() {
    if (!progress) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    progress.style.transform = "scaleX(" + ratio.toFixed(4) + ")";
  }

  // --- Subtle hero parallax ---
  var heroFrame = document.querySelector(".hero .product-frame");
  function updateParallax() {
    if (!heroFrame || reduceMotion) return;
    var offset = Math.min(window.scrollY, 620);
    heroFrame.style.transform = "translateY(" + (offset * -0.05).toFixed(1) + "px)";
  }

  var scrollRaf = 0;
  function onScrollFx() {
    if (scrollRaf) return;
    scrollRaf = window.requestAnimationFrame(function () {
      scrollRaf = 0;
      updateProgress();
      updateParallax();
    });
  }
  window.addEventListener("scroll", onScrollFx, { passive: true });
  window.addEventListener("resize", onScrollFx, { passive: true });
  updateProgress();

  // --- Momentum smooth scrolling (fine pointer, motion allowed) ---
  var finePointer = window.matchMedia("(pointer: fine)").matches;
  if (!reduceMotion && finePointer && "requestAnimationFrame" in window) {
    var targetY = window.scrollY;
    var currentY = window.scrollY;
    var ticking = false;

    function maxScroll() {
      return document.documentElement.scrollHeight - window.innerHeight;
    }
    function scrollsInternally(node) {
      while (node && node !== document.body && node.nodeType === 1) {
        if (node.scrollHeight > node.clientHeight + 2) {
          var oy = window.getComputedStyle(node).overflowY;
          if (oy === "auto" || oy === "scroll") return true;
        }
        node = node.parentNode;
      }
      return false;
    }
    var root = document.documentElement;
    function loop() {
      currentY += (targetY - currentY) * 0.16;
      if (Math.abs(targetY - currentY) < 0.4) {
        currentY = targetY;
        window.scrollTo(0, Math.round(currentY));
        root.style.scrollBehavior = "";
        ticking = false;
        return;
      }
      window.scrollTo(0, Math.round(currentY));
      window.requestAnimationFrame(loop);
    }
    window.addEventListener("wheel", function (event) {
      if (event.ctrlKey || event.defaultPrevented) return;
      if (document.body.classList.contains("intro-active")) return;
      if (scrollsInternally(event.target)) return;
      var delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      targetY = Math.max(0, Math.min(maxScroll(), targetY + delta));
      event.preventDefault();
      if (!ticking) {
        ticking = true;
        // Bypass CSS smooth scrolling for our own per-frame updates.
        root.style.scrollBehavior = "auto";
        window.requestAnimationFrame(loop);
      }
    }, { passive: false });
    // Keep the target in sync with keyboard, anchor, and scrollbar scrolling.
    window.addEventListener("scroll", function () {
      if (!ticking) { targetY = window.scrollY; currentY = window.scrollY; }
    }, { passive: true });
    window.addEventListener("resize", function () {
      targetY = Math.min(targetY, maxScroll());
    }, { passive: true });
  }

  // ============================================================
  // Intensity layer: intro particle vortex, constellation field,
  // and 3D magnetic tilt. All disabled under reduced motion.
  // ============================================================

  var introFxRaf = 0;
  var introFxStop = false;
  var introFxSized = false;

  function startIntroFx() {
    var canvas = document.querySelector("[data-intro-canvas]");
    if (!canvas || reduceMotion) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    introFxStop = false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var TAU = Math.PI * 2;
    var W, H, cx, cy, R;

    function size() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2 - Math.min(58, H * 0.06);
      R = Math.min(108, Math.min(W, H) * 0.15);
    }
    size();
    if (!introFxSized) { window.addEventListener("resize", size); introFxSized = true; }

    var N = Math.round(Math.min(240, W * 0.16));
    var ps = [];
    for (var i = 0; i < N; i++) {
      ps.push({
        ang: Math.random() * TAU,
        spin: 0.5 + Math.random() * 1.3,
        r0: R * (2.6 + Math.random() * 3.6),
        size: 0.8 + Math.random() * 2.4,
        ember: Math.random() < 0.3
      });
    }

    var t0 = null;
    function frame(now) {
      if (introFxStop) return;
      if (t0 === null) t0 = now;
      var t = (now - t0) / 1000;
      ctx.fillStyle = "rgba(244,241,234,0.20)";
      ctx.fillRect(0, 0, W, H);

      var conv = Math.min(1, t / 1.25);
      var convE = 1 - Math.pow(1 - conv, 3);
      var burst = t > 1.35 ? Math.min(1, (t - 1.35) / 0.85) : 0;

      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        p.ang += p.spin * (0.02 + convE * 0.06);
        var rad, a;
        if (burst > 0) {
          var be = burst * burst;
          rad = R * 0.5 + be * (R * 8 + p.r0 * 0.4);
          a = (1 - burst) * (p.ember ? 0.9 : 0.5);
        } else {
          rad = p.r0 * (1 - convE) + R * 0.5;
          a = (0.15 + convE * 0.6) * (p.ember ? 1 : 0.75);
        }
        var x = cx + Math.cos(p.ang) * rad;
        var y = cy + Math.sin(p.ang) * rad;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, TAU);
        ctx.fillStyle = p.ember
          ? "rgba(224,96,32," + a.toFixed(3) + ")"
          : "rgba(23,25,20," + (a * 0.8).toFixed(3) + ")";
        ctx.fill();
      }

      if (t > 1.3 && t < 2.7) {
        var ct = (t - 1.3) / 1.4;
        var ca = -Math.PI / 2 + ct * TAU * 1.5;
        var camp = Math.min(1, ct * 3) * (1 - Math.max(0, (ct - 0.7) / 0.3));
        var orbit = R * 1.18;
        var gx = cx + Math.cos(ca) * orbit;
        var gy = cy + Math.sin(ca) * orbit;
        ctx.beginPath();
        ctx.arc(gx, gy, 3.4, 0, TAU);
        ctx.fillStyle = "rgba(224,96,32," + (0.9 * camp).toFixed(3) + ")";
        ctx.fill();
      }

      if (t < 2.95) { introFxRaf = window.requestAnimationFrame(frame); }
      else { introFxRaf = 0; }
    }
    introFxRaf = window.requestAnimationFrame(frame);
  }

  function stopIntroFx() {
    introFxStop = true;
    if (introFxRaf) { window.cancelAnimationFrame(introFxRaf); introFxRaf = 0; }
    var canvas = document.querySelector("[data-intro-canvas]");
    if (canvas) {
      var ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Live constellation field in the capabilities section.
  (function initConstellation() {
    var canvas = document.querySelector("[data-cap-canvas]");
    if (!canvas || reduceMotion) return;
    var section = canvas.closest("section");
    if (!section) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, pts = [], running = false, rafId = 0;

    function build() {
      var count = Math.max(24, Math.min(72, Math.round(W * H / 22000)));
      pts = [];
      for (var i = 0; i < count; i++) {
        pts.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
          r: 0.8 + Math.random() * 1.6, warm: Math.random() < 0.25
        });
      }
    }
    function size() {
      W = section.clientWidth; H = section.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }
    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      var i, j;
      for (i = 0; i < pts.length; i++) {
        var p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x += W; else if (p.x > W) p.x -= W;
        if (p.y < 0) p.y += H; else if (p.y > H) p.y -= H;
      }
      for (i = 0; i < pts.length; i++) {
        for (j = i + 1; j < pts.length; j++) {
          var a = pts[i], b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy;
          if (d < 15000) {
            ctx.strokeStyle = "rgba(120,158,168," + ((1 - d / 15000) * 0.16).toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (i = 0; i < pts.length; i++) {
        var q = pts[i];
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        ctx.fillStyle = q.warm ? "rgba(240,129,63,0.55)" : "rgba(53,201,230,0.42)";
        ctx.fill();
      }
      rafId = window.requestAnimationFrame(frame);
    }
    size();
    window.addEventListener("resize", size);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && !running) { running = true; rafId = window.requestAnimationFrame(frame); }
          else if (!e.isIntersecting && running) { running = false; if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; } }
        });
      }, { threshold: 0 }).observe(section);
    } else { running = true; rafId = window.requestAnimationFrame(frame); }
  })();

  // 3D magnetic tilt on cards and the tour frame.
  (function initTilt() {
    if (reduceMotion || !window.matchMedia("(pointer: fine)").matches) return;
    document.querySelectorAll("[data-tilt]").forEach(function (el) {
      var rect = null;
      el.addEventListener("mouseenter", function () { rect = el.getBoundingClientRect(); el.style.transition = "transform .1s ease-out"; });
      el.addEventListener("mousemove", function (e) {
        if (!rect) rect = el.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width - 0.5;
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = "perspective(820px) rotateX(" + (-py * 7).toFixed(2) + "deg) rotateY(" + (px * 9).toFixed(2) + "deg) translateY(-5px)";
      });
      el.addEventListener("mouseleave", function () { el.style.transition = "transform .55s cubic-bezier(.16,1,.3,1)"; el.style.transform = ""; rect = null; });
    });
  })();

  // Hero reveals: split the headline into words and the wordmark into letters.
  (function initHeroReveals() {
    if (reduceMotion) return;
    var wordEl = document.querySelector("[data-reveal-words]");
    if (wordEl) {
      var parts = wordEl.innerHTML.split(/(\s+|<br\s*\/?>)/i);
      wordEl.innerHTML = "";
      var wi = 0;
      parts.forEach(function (part) {
        if (/^<br/i.test(part)) { wordEl.appendChild(document.createElement("br")); return; }
        if (part.trim() === "") { wordEl.appendChild(document.createTextNode(" ")); return; }
        var wrap = document.createElement("span"); wrap.className = "reveal-word-wrap";
        var inner = document.createElement("span"); inner.className = "reveal-word";
        inner.textContent = part; inner.style.animationDelay = (wi * 0.1).toFixed(2) + "s"; wi++;
        wrap.appendChild(inner); wordEl.appendChild(wrap);
      });
    }
    var letterEl = document.querySelector("[data-reveal-letters]");
    if (letterEl) {
      var text = letterEl.textContent.trim();
      letterEl.innerHTML = "";
      Array.prototype.forEach.call(text, function (ch, i) {
        var wrap = document.createElement("span"); wrap.className = "reveal-letter-wrap";
        var inner = document.createElement("span"); inner.className = "reveal-letter";
        inner.textContent = ch === " " ? " " : ch;
        inner.style.animationDelay = (0.6 + i * 0.09).toFixed(2) + "s";
        wrap.appendChild(inner); letterEl.appendChild(wrap);
      });
    }
  })();

  // Custom double cursor: instant ring + lagging glass pill.
  (function initCursor() {
    var ring = document.querySelector("[data-cursor-ring]");
    var pill = document.querySelector("[data-cursor-pill]");
    if (!ring || !pill || reduceMotion || !window.matchMedia("(pointer: fine)").matches) return;
    document.documentElement.classList.add("has-cursor");
    document.body.classList.add("has-cursor-on");
    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var px = mx, py = my, first = true, scale = 0, target = 0, onEl = false;

    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      if (first) { px = mx; py = my; first = false; ring.classList.add("active"); pill.classList.add("active"); }
      if (!onEl) target = 1;
    });
    document.addEventListener("mouseleave", function () { target = 0; });
    document.addEventListener("mouseenter", function () { if (!onEl) target = 1; });

    document.querySelectorAll("a, button, input, textarea, select, [data-tilt], .tour-tab").forEach(function (el) {
      el.addEventListener("mouseenter", function () { onEl = true; target = 0; ring.classList.add("expanded"); });
      el.addEventListener("mouseleave", function () { onEl = false; target = 1; ring.classList.remove("expanded"); });
    });

    function loop() {
      px += (mx - px) * 0.12; py += (my - py) * 0.12;
      scale += (target - scale) * 0.15;
      var ringScale = ring.classList.contains("expanded") ? 1.7 * scale : scale;
      ring.style.transform = "translate3d(" + mx + "px," + my + "px,0) translate(-50%,-50%) scale(" + ringScale.toFixed(3) + ")";
      pill.style.transform = "translate3d(" + px + "px," + py + "px,0) translate(-50%,-50%) scale(" + scale.toFixed(3) + ")";
      window.requestAnimationFrame(loop);
    }
    window.requestAnimationFrame(loop);
  })();
})();
