/* Runs before paint to apply the saved theme and avoid a flash. */
(function () {
  try {
    var t = localStorage.getItem("maestro-theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
