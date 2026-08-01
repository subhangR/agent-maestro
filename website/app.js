(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Logo reveal: end it after a beat, or on click ----
  (function initIntro() {
    var intro = document.querySelector("[data-intro]");
    if (!intro || !root.classList.contains("intro-play")) return;
    var done = false;
    function end() {
      if (done) return; done = true;
      root.classList.remove("intro-play"); // reverts to base rule -> fades out
    }
    var timer = window.setTimeout(end, 2050);
    intro.addEventListener("click", function () { window.clearTimeout(timer); end(); });
  })();

  // ---- Light / dark theme ----
  (function initTheme() {
    var media = window.matchMedia("(prefers-color-scheme: dark)");
    function isDark() {
      var t = root.getAttribute("data-theme");
      if (t === "dark") return true;
      if (t === "light") return false;
      return media.matches;
    }
    function applyShots() {
      var suffix = isDark() ? "-dark" : "";
      document.querySelectorAll("[data-shot]").forEach(function (img) {
        img.setAttribute("src", "assets/shots/" + img.getAttribute("data-shot") + suffix + ".jpg");
      });
    }
    applyShots();
    var toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var next = isDark() ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("maestro-theme", next); } catch (e) {}
        applyShots();
      });
    }
    var onSystem = function () { if (!root.getAttribute("data-theme")) applyShots(); };
    if (media.addEventListener) media.addEventListener("change", onSystem);
    else if (media.addListener) media.addListener(onSystem);
  })();

  // ---- Sticky header state ----
  var header = document.querySelector("[data-header]");
  function updateHeader() { if (header) header.classList.toggle("scrolled", window.scrollY > 12); }
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  // ---- Public content hydration (optional site.json) ----
  function isString(v) { return typeof v === "string" && v.trim().length > 0; }
  fetch("content/site.json", { headers: { "Accept": "application/json" }, cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("no content"); return r.json(); })
    .then(function (c) {
      if (!c || typeof c !== "object" || c.schemaVersion !== 1) return;
      document.querySelectorAll("[data-content]").forEach(function (el) {
        var k = el.getAttribute("data-content"); if (k && isString(c[k])) el.textContent = c[k];
      });
      document.querySelectorAll("[data-command-source]").forEach(function (el) {
        var k = el.getAttribute("data-command-source"); if (k && isString(c[k])) el.setAttribute("data-command", c[k]);
      });
    })
    .catch(function () {});

  // ---- Mobile menu ----
  var menuButton = document.querySelector("[data-menu-button]");
  var menu = document.querySelector("[data-menu]");
  if (menuButton && menu) {
    menuButton.addEventListener("click", function () {
      var open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      menu.classList.toggle("open", !open);
      var sr = menuButton.querySelector(".sr-only");
      if (sr) sr.textContent = open ? "Open navigation" : "Close navigation";
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) { menuButton.setAttribute("aria-expanded", "false"); menu.classList.remove("open"); }
    });
  }

  // ---- Copy install command ----
  var copyButton = document.querySelector("[data-copy-command]");
  var command = document.querySelector("[data-command]");
  if (copyButton && command) {
    copyButton.addEventListener("click", function () {
      var value = command.getAttribute("data-command") || "";
      if (!navigator.clipboard) { copyButton.textContent = "Select text"; return; }
      navigator.clipboard.writeText(value).then(function () {
        copyButton.textContent = "Copied";
        window.setTimeout(function () { copyButton.textContent = "Copy"; }, 1600);
      }).catch(function () { copyButton.textContent = "Select text"; });
    });
  }

  // ---- Product tour tabs ----
  var tourTabs = document.querySelectorAll("[data-shot-tab]");
  var tourShots = document.querySelectorAll(".tour-shot [data-shot]");
  var tourCaption = document.querySelector("[data-tour-caption]");
  if (tourTabs.length && tourShots.length) {
    tourTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var key = tab.getAttribute("data-shot-tab");
        tourTabs.forEach(function (o) { o.setAttribute("aria-selected", String(o === tab)); });
        tourShots.forEach(function (img) { img.hidden = img.getAttribute("data-shot") !== key; });
        if (tourCaption) {
          var num = tourCaption.querySelector("[data-tour-num]");
          var title = tourCaption.querySelector("[data-tour-title]");
          var text = tourCaption.querySelector("[data-tour-text]");
          if (num) num.textContent = tab.getAttribute("data-num") || "";
          if (title) title.textContent = tab.getAttribute("data-title") || "";
          if (text) text.textContent = tab.getAttribute("data-caption") || "";
        }
      });
    });
  }

  // ---- Contact form (graceful mailto fallback if the endpoint is unavailable) ----
  var contactForm = document.querySelector("[data-contact-form]");
  if (contactForm) {
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!contactForm.reportValidity()) return;
      var submitButton = contactForm.querySelector("[data-contact-submit]");
      var status = contactForm.querySelector("[data-contact-status]");
      var fd = new FormData(contactForm);
      var payload = {
        name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone"),
        company: fd.get("company"), type: fd.get("type"), message: fd.get("message"),
        website: fd.get("website"), consent: fd.get("consent") === "on"
      };
      submitButton.disabled = true; submitButton.textContent = "Sending…";
      status.className = "form-status"; status.textContent = "Sending your enquiry securely.";

      function mailtoHref() {
        var lines = ["Name: " + (payload.name || ""), "Email: " + (payload.email || ""),
          payload.phone ? "Phone: " + payload.phone : "", payload.company ? "Company: " + payload.company : "",
          "Reach-out type: " + (payload.type || "general"), "", payload.message || ""]
          .filter(function (l) { return l !== ""; });
        return "mailto:manzilshaik95@gmail.com?subject=" +
          encodeURIComponent("Maestro enquiry · " + (payload.type || "general") + " · " + (payload.name || "")) +
          "&body=" + encodeURIComponent(lines.join("\n"));
      }
      function offerFallback() {
        contactForm.reset();
        status.className = "form-status"; status.textContent = "Ready to send. We'll open a prefilled email for you. ";
        var a = document.createElement("a");
        a.className = "form-status-link"; a.href = mailtoHref(); a.textContent = "Open email to send →";
        status.appendChild(a);
        try { window.location.href = a.href; } catch (e) {}
      }
      fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.status === 400 || res.status === 429) { var e = new Error(body.error || "Please review your enquiry."); e.handled = true; throw e; }
          if (!res.ok) throw new Error("endpoint-unavailable");
          return body;
        });
      }).then(function (body) {
        contactForm.reset();
        status.className = "form-status success";
        status.textContent = "Message received. Reference " + (body && body.reference ? body.reference : "sent") + ".";
      }).catch(function (err) {
        if (err && err.handled) { status.className = "form-status error"; status.textContent = err.message; }
        else offerFallback();
      }).finally(function () {
        submitButton.disabled = false; submitButton.textContent = "Send enquiry";
      });
    });
  }

  // ---- Footer year ----
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  // ---- One quiet motion: gentle reveal on scroll ----
  var reveals = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  }
})();
