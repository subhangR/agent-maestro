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
})();
