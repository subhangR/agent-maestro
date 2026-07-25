(function () {
  "use strict";

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

  function playBrandIntro() {
    if (!brandIntro || reduceMotion) return;
    window.clearTimeout(introTimer);
    brandIntro.classList.remove("is-active");
    void brandIntro.offsetWidth;
    brandIntro.classList.add("is-active");
    document.body.classList.add("intro-active");
    introTimer = window.setTimeout(function () {
      brandIntro.classList.remove("is-active");
      document.body.classList.remove("intro-active");
    }, 10000);
  }

  if (!reduceMotion && !window.sessionStorage.getItem("maestroBrandSeen")) {
    window.sessionStorage.setItem("maestroBrandSeen", "true");
    playBrandIntro();
  }

  brandTriggers.forEach(function (trigger) {
    trigger.addEventListener("click", function () { playBrandIntro(); });
  });

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

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (!response.ok) throw new Error(body.error || "We could not send your enquiry.");
          return body;
        });
      }).then(function (body) {
        contactForm.reset();
        status.className = "form-status success";
        status.textContent = "Message received. Reference " + body.reference + ".";
      }).catch(function (error) {
        status.className = "form-status error";
        status.textContent = (error && error.message) ? error.message : "We could not send your enquiry right now.";
        var fallback = document.createElement("a");
        fallback.className = "form-status-link";
        fallback.href = "mailto:manzilshaik95@gmail.com?subject=" +
          encodeURIComponent("Maestro enquiry — " + (payload.type || "general")) +
          "&body=" + encodeURIComponent(payload.message || "");
        fallback.textContent = "Email us directly →";
        status.appendChild(document.createTextNode(" "));
        status.appendChild(fallback);
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

  var revealItems = document.querySelectorAll(".reveal");
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
    revealItems.forEach(function (item) { observer.observe(item); });
  }
})();
