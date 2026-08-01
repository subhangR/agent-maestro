/* restore the visitor's theme before first paint; explicit choice wins, then system preference, then the lit stage */
    (function(){
      var d = document.documentElement, t = null;
      try { t = localStorage.getItem("maestro-theme"); } catch(_e){}
      if (t !== "light" && t !== "dark"){
        t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
      }
      d.setAttribute("data-theme", t);
    })();
