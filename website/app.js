(function () {
  "use strict";

  var header = document.querySelector("[data-header]");
  var menuButton = document.querySelector("[data-menu-button]");
  var menu = document.querySelector("[data-menu]");
  var copyButton = document.querySelector("[data-copy-command]");
  var command = document.querySelector("[data-command]");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
