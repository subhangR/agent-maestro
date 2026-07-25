/* Runs before paint: apply saved theme, and decide if the logo reveal plays. */
(function () {
  var root = document.documentElement;
  try {
    var t = localStorage.getItem("maestro-theme");
    if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
  } catch (e) {}
  try {
    var seen = sessionStorage.getItem("maestro-intro");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!seen && !reduce) {
      root.classList.add("intro-play");
      sessionStorage.setItem("maestro-intro", "1");
    }
  } catch (e) {}
})();
