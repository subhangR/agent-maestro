import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";
import "./styles-responsive.css";
import "./task-lists.css";
import "./styles-startup.css";
import "./styles-login.css";
import "xterm/css/xterm.css";
// Self-hosted redesign fonts (Google Fonts @import is blocked by the Tauri CSP
// font-src 'self'; these are bundled by Vite and served locally). --pn-mono
// (JetBrains Mono) is already self-hosted in styles.css.
import "@fontsource/hanken-grotesk/400.css"; // --pn-ui
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/newsreader/400.css"; // --pn-serif
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/400-italic.css";
import "./components/maestro/redesign/redesign-tokens.css";
import "./components/maestro/redesign/redesign-tiles.css";
import "./components/maestro/redesign/redesign-boards.css";
// redesign-views.css imported BEFORE redesign-modals.css on purpose: views.css and
// modals.css both define `.pn-frow` (file-row vs form-row collision). Loading modals
// last keeps the active modal form-row styling authoritative until the coordinator
// rules on the rename. See FOUNDATION-DONE §10.
import "./components/maestro/redesign/redesign-views.css";
import "./components/maestro/redesign/redesign-modals.css";
import "./components/maestro/redesign/redesign-buttons.css";
import "./styles-panel-leak-fix.css";
import { setRedesignActive } from "./components/maestro/redesign/useRedesignTheme";

// Redesign is default-on for the maestro-redesign branch. The scoped tokens in
// redesign-tokens.css only apply under html[data-redesign], so existing
// (un-ported) components render unchanged until they adopt pn-* classes.
setRedesignActive(true);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary name="App">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
