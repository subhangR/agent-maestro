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
        status.textContent = error.message || "We could not send your enquiry. Please try again.";
      }).finally(function () {
        contactForm.classList.remove("is-sending");
        submitButton.disabled = false;
        submitButton.textContent = "Send enquiry";
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
