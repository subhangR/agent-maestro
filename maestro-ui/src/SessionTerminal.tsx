import React, { useEffect, useRef } from "react";
import { platform } from "./platform";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import type { PendingDataBuffer } from "./app/types/app-state";
import { useTerminalSettingsStore, buildITheme } from "./stores/useTerminalSettingsStore";
import { serverPtySizes, clientFittedSessions, setLastFittedSize } from "./stores/useSessionStore";
import { measureSpawnTerminalSize } from "./utils/terminalSize";

export type TerminalRegistry = Map<string, { term: Terminal; fit: FitAddon }>;

/* ---------------------------------------------------------------------------
   Terminal background follows the app light/dark toggle: it stays DARK in both
   modes, flipping between two dark values to match the --pn-term-bg chrome
   gutter — UNLESS the user pins an explicit background in Terminal settings
   (see buildITheme + useTerminalSettingsStore). All other colors, font, cursor
   and spacing come from the terminal-settings store.
--------------------------------------------------------------------------- */
const MAESTRO_TERMINAL_BG_LIGHT = "#1B1812";
const MAESTRO_TERMINAL_BG_DARK = "#100E0A";

function currentTerminalBg(): string {
  return typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "dark"
    ? MAESTRO_TERMINAL_BG_DARK
    : MAESTRO_TERMINAL_BG_LIGHT;
}

type RenderDimension = { width: number; height: number };
type RenderDimensionsFallback = {
  css: { canvas: RenderDimension; cell: RenderDimension };
  device: {
    canvas: RenderDimension;
    cell: RenderDimension;
    char: { width: number; height: number; left: number; top: number };
  };
};

function createEmptyRenderDimensions(): RenderDimensionsFallback {
  const dim = (): RenderDimension => ({ width: 0, height: 0 });
  return {
    css: { canvas: dim(), cell: dim() },
    device: { canvas: dim(), cell: dim(), char: { width: 0, height: 0, left: 0, top: 0 } },
  };
}

function patchXtermRenderServiceDimensions(term: Terminal): void {
  try {
    const core = (term as unknown as { _core?: any })._core;
    const renderService = core?._renderService;
    if (!renderService) return;
    if (renderService.__agentsUiSafeDimensions) return;

    const fallback = createEmptyRenderDimensions();
    Object.defineProperty(renderService, "dimensions", {
      configurable: true,
      enumerable: true,
      get: () => {
        const rendererRef = renderService?._renderer;
        const renderer = rendererRef?.value ?? rendererRef?._value ?? null;
        return renderer?.dimensions ?? fallback;
      },
    });

    renderService.__agentsUiSafeDimensions = true;
  } catch {
    // ignore
  }
}

function isXtermRendererReady(term: Terminal): boolean {
  const core = (term as unknown as { _core?: any })._core;
  const renderService = core?._renderService;
  const rendererRef = renderService?._renderer;
  const renderer = rendererRef?.value ?? rendererRef?._value ?? null;
  // The DomRenderer publishes a zero-filled `dimensions` object in its ctor,
  // before the first glyph measurement runs — so an existence check alone leaks
  // past pre-measure dims and lets fit() ship a column count computed from a
  // zero/fallback cell. Require a real, non-zero cell width.
  const cellWidth = renderer?.dimensions?.css?.cell?.width ?? 0;
  return Boolean(renderer && cellWidth > 0);
}

async function copyToClipboard(text: string): Promise<boolean> {
  const value = text ?? "";
  if (!value) return false;

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

interface SessionTerminalProps {
  id: string;
  active: boolean;
  readOnly: boolean;
  persistent?: boolean;
  onCwdChange?: (id: string, cwd: string) => void;
  onCommandChange?: (id: string, commandLine: string, source?: "osc" | "input") => void;
  onResize?: (id: string, size: { cols: number; rows: number }) => void;
  onUserEnter?: (id: string) => void;
  registry: React.MutableRefObject<TerminalRegistry>;
  pendingData: React.MutableRefObject<PendingDataBuffer>;
}

const SessionTerminal = React.memo(function SessionTerminal(props: SessionTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const resizeRetryCountRef = useRef(0);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const wheelRemainderRef = useRef<number>(0);
  const commandBufferRef = useRef<string>("");
  // Becomes true once the terminal webfont has actually loaded. Until then we
  // refuse to ship a fit()-derived size to the server PTY: in the browser the
  // first synchronous measure in Terminal.open() runs against the fallback font
  // (JetBrains Mono is woff2 + font-display:swap), so a pre-font fit() computes
  // the wrong column count and the 80-col scrollback ring replays into a grid
  // whose width is still flipping. WKWebView (Tauri) resolves the bundled font
  // before that measure, so this gate is effectively always-true there.
  const fontsReadyRef = useRef(false);

  const onCwdChangeRef = useRef(props.onCwdChange);
  onCwdChangeRef.current = props.onCwdChange;
  const onCommandChangeRef = useRef(props.onCommandChange);
  onCommandChangeRef.current = props.onCommandChange;
  const onResizeRef = useRef(props.onResize);
  onResizeRef.current = props.onResize;
  const onUserEnterRef = useRef(props.onUserEnter);
  onUserEnterRef.current = props.onUserEnter;

  useEffect(() => {
    if (!containerRef.current) return;
    if (termRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const termSettings = useTerminalSettingsStore.getState();
    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: termSettings.cursorBlink,
      cursorStyle: termSettings.cursorStyle,
      cursorInactiveStyle: termSettings.cursorInactiveStyle,
      disableStdin: props.readOnly,
      fontFamily: termSettings.fontStack,
      fontSize: termSettings.fontSize,
      fontWeight: termSettings.fontWeight,
      fontWeightBold: termSettings.fontWeightBold,
      lineHeight: termSettings.lineHeight,
      letterSpacing: termSettings.letterSpacing,
      theme: buildITheme(termSettings.colors, currentTerminalBg()),
      scrollback: termSettings.scrollback,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    patchXtermRenderServiceDimensions(term);

    // Keep the terminal background in sync with the app light/dark toggle.
    // The terminal stays dark in both modes; only the bg flips between two
    // dark values to match the --pn-term-bg chrome gutter. Theme-only update —
    // does not touch the PTY, registry, or fit.
    const themeObserver = new MutationObserver(() => {
      const ts = useTerminalSettingsStore.getState();
      term.options.theme = buildITheme(ts.colors, currentTerminalBg());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // xterm measures glyph metrics at open() and (with the DOM renderer) paints
    // glyphs via CSS font-family. In WKWebView (macOS Tauri) the "JetBrains
    // Mono" webfont usually isn't ready at open(), and — unlike Chromium — the
    // terminal does NOT reflow/repaint when it finishes loading, so it sticks on
    // the system-mono fallback. Force a re-measure + full repaint once the font
    // loads. A fontSize round-trip reliably re-triggers xterm's CharSizeService
    // and a renderer repaint (a same-value fontFamily set does not). Retries
    // cover WKWebView reporting `fonts.ready` a frame or two before paint.
    const forceFontReflow = () => {
      if (!term.element) return; // terminal disposed before the font loaded
      const ts = useTerminalSettingsStore.getState();
      const size = ts.fontSize ?? term.options.fontSize ?? 13;
      // Re-assert the configured font and round-trip fontSize: this forces
      // xterm's CharSizeService/WidthCache to re-measure with the now-loaded
      // font and triggers a full repaint (a same-value fontFamily set alone
      // does not).
      term.options.fontFamily = ts.fontStack;
      term.options.fontSize = size + 1;
      term.options.fontSize = size;
      // Canvas/webgl renderers cache glyphs in a texture atlas keyed on the
      // font measured at open(); clear it so glyphs re-rasterize in the new
      // font. No-op on the DOM renderer.
      try {
        (term as unknown as { clearTextureAtlas?: () => void }).clearTextureAtlas?.();
      } catch {
        /* not applicable to this renderer */
      }
      try {
        fit.fit();
      } catch {
        /* container not measurable yet — next resize will re-fit */
      }
      try {
        term.refresh(0, term.rows - 1);
      } catch {
        /* renderer not ready yet */
      }
      // WKWebView (macOS) paints terminal glyphs with the fallback font before
      // the webfont finishes decoding and does NOT repaint on font-display:swap,
      // so the rows stay system-mono even though their computed font-family is
      // already "JetBrains Mono". Force a hard re-rasterization by toggling the
      // element's display — WKWebView discards the cached glyph layer and
      // repaints with the now-loaded font.
      const el = term.element;
      if (el) {
        const prevDisplay = el.style.display;
        el.style.display = "none";
        void el.offsetHeight; // force synchronous reflow
        el.style.display = prevDisplay;
      }
      // The font is now resolved and the grid re-measured: unblock the resize
      // gate and ship a single authoritative size to the server PTY. Resetting
      // the retry counter makes the next sendResize take the fast rAF path.
      fontsReadyRef.current = true;
      resizeRetryCountRef.current = 0;
      scheduleResize();
    };
    if (typeof document !== "undefined" && document.fonts) {
      // Trigger the actual font fetch, then reflow on ready regardless of
      // whether the explicit load resolved (WKWebView can reject spuriously).
      try {
        document.fonts.load('13px "JetBrains Mono"');
        document.fonts.load('600 13px "JetBrains Mono"');
      } catch {
        /* FontFaceSet.load unsupported — the timed retries below still cover it */
      }
      document.fonts.ready.then(forceFontReflow).catch(() => {});
    }
    // Belt-and-suspenders for WKWebView: re-assert a few times after paint.
    const fontReflowTimers = [120, 360, 900].map((ms) =>
      window.setTimeout(forceFontReflow, ms),
    );

    if (props.persistent) {
      const skipEscapeSequence = (data: string, start: number): number => {
        const next = data[start];
        if (!next) return start;
        if (next === "[") {
          let i = start + 1;
          while (i < data.length) {
            const ch = data[i];
            if (ch >= "@" && ch <= "~") return i + 1;
            i += 1;
          }
          return i;
        }
        if (next === "]") {
          let i = start + 1;
          while (i < data.length) {
            const ch = data[i];
            if (ch === "\u0007") return i + 1;
            if (ch === "\u001b" && data[i + 1] === "\\") return i + 2;
            i += 1;
          }
          return i;
        }
        if (next === "P" || next === "^" || next === "_") {
          let i = start + 1;
          while (i < data.length) {
            if (data[i] === "\u001b" && data[i + 1] === "\\") return i + 2;
            i += 1;
          }
          return i;
        }
        return start + 1;
      };

      const ingestUserInputForCommandDetection = (data: string) => {
        let buffer = commandBufferRef.current;
        const submitted: string[] = [];

        let i = 0;
        while (i < data.length) {
          const ch = data[i];
          if (ch === "\r") {
            if (data[i + 1] === "\n") i += 1;
            submitted.push(buffer);
            buffer = "";
            i += 1;
            continue;
          }
          if (ch === "\n") {
            submitted.push(buffer);
            buffer = "";
            i += 1;
            continue;
          }
          if (ch === "\u007f" || ch === "\b") {
            buffer = buffer.slice(0, -1);
            i += 1;
            continue;
          }
          if (ch === "\u0015") {
            buffer = "";
            i += 1;
            continue;
          }
          if (ch === "\u001b") {
            i = skipEscapeSequence(data, i + 1);
            continue;
          }
          if (ch < " " || ch === "\u007f") {
            i += 1;
            continue;
          }
          buffer += ch;
          i += 1;
        }

        commandBufferRef.current = buffer;

        for (const line of submitted) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          onCommandChangeRef.current?.(props.id, trimmed, "input");
        }
      };

      term.attachCustomKeyEventHandler((event) => {
        // Block Shift+Enter across ALL event types (keydown, keypress, keyup)
        // to prevent keypress from sending \r through onData.
        const isEnter = event.key === "Enter";
        if (event.shiftKey && isEnter && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.type === "keydown") {
            void platform.terminal.write(props.id, "\x1b[13;2u", "user").catch(() => {});
          }
          return false;
        }

        if (event.type !== "keydown") return true;
        const key = event.key;
        const isCopy =
          (event.metaKey || (event.ctrlKey && event.shiftKey)) &&
          !event.altKey &&
          key.toLowerCase() === "c";
        if (isCopy && term.hasSelection()) {
          void copyToClipboard(term.getSelection());
          return false;
        }

        return true;
      });
      term.onData((data) => {
        void platform.terminal.write(props.id, data, "user").catch(() => {});
        if (data.includes("\r") || data.includes("\n")) {
          onUserEnterRef.current?.(props.id);
        }
        ingestUserInputForCommandDetection(data);
      });
    } else {
      term.attachCustomKeyEventHandler((event) => {
        // Block Shift+Enter across ALL event types (keydown, keypress, keyup)
        // to prevent keypress from sending \r through onData.
        const isEnter = event.key === "Enter";
        if (event.shiftKey && isEnter && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.type === "keydown") {
            void platform.terminal.write(props.id, "\x1b[13;2u", "user").catch(() => {});
          }
          return false;
        }

        if (event.type !== "keydown") return true;
        const key = event.key;
        const isCopy =
          (event.metaKey || (event.ctrlKey && event.shiftKey)) &&
          !event.altKey &&
          key.toLowerCase() === "c";
        if (isCopy && term.hasSelection()) {
          void copyToClipboard(term.getSelection());
          return false;
        }

        return true;
      });
      term.onData((data) => {
        void platform.terminal.write(props.id, data, "user").catch(() => {});
        if (data.includes("\r") || data.includes("\n")) {
          onUserEnterRef.current?.(props.id);
        }
      });
    }

	    termRef.current = term;
	    fitRef.current = fit;

    const oscDisposables: Array<{ dispose: () => void }> = [];
    const reportCwd = (cwd: string) => {
      const trimmed = cwd.trim();
      if (!trimmed) return;
      onCwdChangeRef.current?.(props.id, trimmed);
    };
    const reportCommand = (commandLine: string) => {
      onCommandChangeRef.current?.(props.id, commandLine, "osc");
    };

    const parseFileUrlPath = (data: string): string | null => {
      if (!data.startsWith("file://")) return null;
      const rest = data.slice("file://".length);
      const slashIdx = rest.indexOf("/");
      if (slashIdx < 0) return null;
      const rawPath = rest.slice(slashIdx);
      try {
        return decodeURIComponent(rawPath);
      } catch {
        return rawPath;
      }
    };

	    if (term.parser) {
	      oscDisposables.push(
	        term.parser.registerOscHandler(7, (data) => {
	          const path = parseFileUrlPath(data);
	          if (path) reportCwd(path);
	          return true;
	        }),
	      );
      oscDisposables.push(
        term.parser.registerOscHandler(1337, (data) => {
          const cwdPrefix = "CurrentDir=";
          if (data.startsWith(cwdPrefix)) {
            const cwd = data.slice(cwdPrefix.length);
            reportCwd(cwd);
            return true;
          }

          const cmdPrefix = "Command=";
          if (data.startsWith(cmdPrefix)) {
            const cmd = data.slice(cmdPrefix.length);
            reportCommand(cmd);
            return true;
          }

          return false;
        }),
      );

      // Kitty keyboard protocol support – respond to mode queries from programs
      // like Claude Code so they know the terminal supports enhanced key reporting
      // (e.g. distinguishing Shift+Enter from plain Enter via CSI 13;2 u).
      const kittyModeStack: number[] = [];

      // Push mode: CSI > flags u
      oscDisposables.push(
        term.parser.registerCsiHandler({ final: "u", prefix: ">" }, (params) => {
          const flags = params.length > 0 ? (params[0] as number) : 0;
          kittyModeStack.push(flags);
          return true;
        }),
      );

      // Pop mode: CSI < count u
      oscDisposables.push(
        term.parser.registerCsiHandler({ final: "u", prefix: "<" }, (params) => {
          const count = params.length > 0 && (params[0] as number) > 0 ? (params[0] as number) : 1;
          for (let i = 0; i < count && kittyModeStack.length > 0; i++) {
            kittyModeStack.pop();
          }
          return true;
        }),
      );

      // Query: CSI ? u – respond with current flags so the program enables enhanced keys
      oscDisposables.push(
        term.parser.registerCsiHandler({ final: "u", prefix: "?" }, () => {
          const currentFlags = kittyModeStack.length > 0
            ? kittyModeStack[kittyModeStack.length - 1]
            : 0;
          void platform.terminal.write(props.id, `\x1b[?${currentFlags}u`).catch(() => {});
          return true;
        }),
      );

	    }

	    function isPanelResizing() {
	      const cl = document.documentElement.classList;
	      return cl.contains("maestro-sidebar-resizing") || cl.contains("right-panel-resizing");
	    }

	    function scheduleResize() {
	      // While a panel splitter is being dragged the terminal box resizes every
	      // frame. Skip fit()/PTY-resize entirely during the drag (the box just
	      // stretches via CSS) and reflow once on drag-end (maestro:panel-resize-end).
	      if (isPanelResizing()) return;
	      if (resizeRafRef.current !== null) return;
	      if (resizeTimeoutRef.current !== null) return;

	      const attempts = resizeRetryCountRef.current;
	      if (attempts < 5) {
	        resizeRafRef.current = window.requestAnimationFrame(() => {
	          resizeRafRef.current = null;
	          sendResize();
	        });
	        return;
	      }

	      const exp = Math.min(attempts - 5, 6);
	      const delay = Math.min(500, 16 * 2 ** exp);
	      resizeTimeoutRef.current = window.setTimeout(() => {
	        resizeTimeoutRef.current = null;
	        sendResize();
	      }, delay);
	    }

	    function sendResize() {
	      const term = termRef.current;
	      const fit = fitRef.current;
	      if (!term || !fit) return;
	      if (!term.element) return;
	      const rect = container.getBoundingClientRect();
	      if (rect.width === 0 || rect.height === 0) return;

	      // Defer the first fit until the webfont has loaded. Fitting against
	      // fallback-font metrics ships the wrong column count to the server PTY
	      // and makes the 80-col scrollback ring replay at the wrong width.
	      // forceFontReflow() flips fontsReadyRef and re-triggers this once the
	      // font resolves (≤900ms via the belt-and-suspenders timers worst case).
	      if (!fontsReadyRef.current) {
	        resizeRetryCountRef.current += 1;
	        scheduleResize();
	        return;
	      }

	      if (!isXtermRendererReady(term)) {
	        resizeRetryCountRef.current += 1;
	        scheduleResize();
	        return;
	      }

	      try {
	        fit.fit();
	      } catch {
	        resizeRetryCountRef.current += 1;
	        scheduleResize();
	        return;
	      }

	      resizeRetryCountRef.current = 0;
	      const { cols, rows } = term;
	      // The client now owns the size: ignore any late server `size` snapshot
	      // (see clientFittedSessions) and keep serverPtySizes coherent so a
	      // remount adopts the fitted width, not the stale 80x24 spawn snapshot.
	      clientFittedSessions.add(props.id);
	      serverPtySizes.set(props.id, { cols, rows });
	      setLastFittedSize({ cols, rows });
	      const last = lastSizeRef.current;
	      if (last && last.cols === cols && last.rows === rows) return;
	      lastSizeRef.current = { cols, rows };
	      onResizeRef.current?.(props.id, { cols, rows });
	      void platform.terminal.resize(props.id, cols, rows).catch(() => {});
	    }

		    // Register BEFORE flushing to avoid race with incoming events
		    props.registry.current.set(props.id, { term, fit });

	    // Flush any buffered data that arrived before we were ready (but wait for renderer readiness)
	    const flushPending = (attemptsLeft: number) => {
	      const term = termRef.current;
	      if (!term) return;
	      const buffered = props.pendingData.current.get(props.id);
	      if (!buffered || buffered.length === 0) {
	        props.pendingData.current.delete(props.id);
	        return;
	      }
	      if (!isXtermRendererReady(term)) {
	        if (attemptsLeft > 0) {
	          window.requestAnimationFrame(() => flushPending(attemptsLeft - 1));
	        }
	        return;
	      }

	      let index = 0;
	      try {
	        for (; index < buffered.length; index += 1) {
	          term.write(buffered[index]);
	        }
	        props.pendingData.current.delete(props.id);
	      } catch {
	        if (index > 0) {
	          props.pendingData.current.set(props.id, buffered.slice(index));
	        }
	        if (attemptsLeft > 0) {
	          window.requestAnimationFrame(() => flushPending(attemptsLeft - 1));
	        }
	      }
	    };
	    // Web mode: size the grid to the PTY width BEFORE replaying/flushing output,
    // so the agent's first paint renders at the column it was authored at instead
    // of xterm's 80x24 default. Two sources, in order:
    //   1. serverPtySizes — the authoritative size the server reported on attach.
    //   2. measureSpawnTerminalSize() — the same estimate sent in the spawn request
    //      (so the PTY booted at it). On a fresh spawn the server `size` frame
    //      hasn't arrived yet, so without this the grid sits at 80 cols; the agent
    //      draws its TUI wide, it crams into 80 cols (overlapping glyphs), and the
    //      later fit() can land on a no-op PTY resize (no SIGWINCH → no repaint),
    //      leaving the garble frozen until a manual resize. Seeding the width here
    //      keeps xterm and the PTY in agreement from the first byte.
    const serverSize = serverPtySizes.get(props.id);
    const initialSize =
      serverSize && serverSize.cols > 0 && serverSize.rows > 0
        ? serverSize
        : measureSpawnTerminalSize();
    if (initialSize.cols && initialSize.rows && initialSize.cols > 0 && initialSize.rows > 0) {
      try {
        term.resize(initialSize.cols, initialSize.rows);
      } catch {
        // ignore
      }
    }
    serverPtySizes.delete(props.id);
    flushPending(20);

		    // Create ResizeObserver inside useEffect for proper cleanup
		    const resizeObserver = new ResizeObserver(() => scheduleResize());

		    resizeObserver.observe(container);
		    scheduleResize();

		    // After a panel splitter drag ends, run a single fit() to reflow to the
		    // final size (the per-frame fits were skipped during the drag).
		    const handlePanelResizeEnd = () => scheduleResize();
		    window.addEventListener("maestro:panel-resize-end", handlePanelResizeEnd);


	    return () => {
	      themeObserver.disconnect();
	      for (const t of fontReflowTimers) window.clearTimeout(t);
	      resizeObserver.disconnect();
	      window.removeEventListener("maestro:panel-resize-end", handlePanelResizeEnd);
	      if (resizeRafRef.current !== null) {
	        window.cancelAnimationFrame(resizeRafRef.current);
	      }
	      if (resizeTimeoutRef.current !== null) {
	        window.clearTimeout(resizeTimeoutRef.current);
	      }
	      for (const d of oscDisposables) d.dispose();
	      clientFittedSessions.delete(props.id);
	      props.registry.current.delete(props.id);
	      props.pendingData.current.delete(props.id);
	      term.dispose();
	      termRef.current = null;
	      fitRef.current = null;
	      resizeRafRef.current = null;
	      resizeTimeoutRef.current = null;
	      resizeRetryCountRef.current = 0;
	    };
	  }, [props.id, props.persistent, props.registry, props.pendingData]);

  useEffect(() => {
    if (!props.active) return;
    const term = termRef.current;
    const fit = fitRef.current;
    const container = containerRef.current;
    if (!term || !fit || !container) return;

    let cancelled = false;
	    const attemptFit = (attemptsLeft: number) => {
	      if (cancelled) return;
	      const rect = container.getBoundingClientRect();
	      if (rect.width === 0 || rect.height === 0) {
	        if (attemptsLeft > 0) {
	          window.requestAnimationFrame(() => attemptFit(attemptsLeft - 1));
	        }
	        return;
	      }
	      if (!isXtermRendererReady(term)) {
	        if (attemptsLeft > 0) {
	          window.requestAnimationFrame(() => attemptFit(attemptsLeft - 1));
	        }
	        return;
	      }

	      try {
	        term.focus();
	      } catch {
	        if (attemptsLeft > 0) {
	          window.requestAnimationFrame(() => attemptFit(attemptsLeft - 1));
	        }
	        return;
	      }
	      // Don't fit/ship a size before the webfont has loaded (see fontsReadyRef
	      // and sendResize). The mount-effect resize path drives the first
	      // authoritative size once forceFontReflow flips the gate.
	      if (!fontsReadyRef.current) {
	        if (attemptsLeft > 0) {
	          window.requestAnimationFrame(() => attemptFit(attemptsLeft - 1));
	        }
	        return;
	      }
	      try {
	        fit.fit();
	      } catch {
	        if (attemptsLeft > 0) {
	          window.requestAnimationFrame(() => attemptFit(attemptsLeft - 1));
	        }
	        return;
	      }
	      const { cols, rows } = term;
	      clientFittedSessions.add(props.id);
	      serverPtySizes.set(props.id, { cols, rows });
	      setLastFittedSize({ cols, rows });
	      const last = lastSizeRef.current;
	      if (!last || last.cols !== cols || last.rows !== rows) {
	        lastSizeRef.current = { cols, rows };
	        void platform.terminal.resize(props.id, cols, rows).catch(() => {});
      }
    };

    attemptFit(8);
    return () => {
      cancelled = true;
    };
  }, [props.active, props.id]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.disableStdin = props.readOnly;
  }, [props.readOnly]);

  // Apply ALL user-configured terminal settings live to every open terminal
  // when any setting changes. Re-measure + re-fit so the grid reflows, with
  // the same WKWebView hard-repaint used at creation.
  const termFontStack = useTerminalSettingsStore((s) => s.fontStack);
  const termFontSize = useTerminalSettingsStore((s) => s.fontSize);
  const termFontWeight = useTerminalSettingsStore((s) => s.fontWeight);
  const termFontWeightBold = useTerminalSettingsStore((s) => s.fontWeightBold);
  const termLineHeight = useTerminalSettingsStore((s) => s.lineHeight);
  const termLetterSpacing = useTerminalSettingsStore((s) => s.letterSpacing);
  const termCursorStyle = useTerminalSettingsStore((s) => s.cursorStyle);
  const termCursorBlink = useTerminalSettingsStore((s) => s.cursorBlink);
  const termCursorInactiveStyle = useTerminalSettingsStore((s) => s.cursorInactiveStyle);
  const termScrollback = useTerminalSettingsStore((s) => s.scrollback);
  const termColors = useTerminalSettingsStore((s) => s.colors);

  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term) return;

    // Font / layout options — trigger WKWebView reflow for any of these
    const needsReflow =
      term.options.fontFamily !== termFontStack ||
      term.options.fontSize !== termFontSize ||
      term.options.fontWeight !== termFontWeight ||
      term.options.fontWeightBold !== termFontWeightBold ||
      term.options.lineHeight !== termLineHeight ||
      term.options.letterSpacing !== termLetterSpacing;

    term.options.fontFamily = termFontStack;
    term.options.fontSize = termFontSize;
    term.options.fontWeight = termFontWeight;
    term.options.fontWeightBold = termFontWeightBold;
    term.options.lineHeight = termLineHeight;
    term.options.letterSpacing = termLetterSpacing;

    // Cursor options
    term.options.cursorStyle = termCursorStyle;
    term.options.cursorBlink = termCursorBlink;
    term.options.cursorInactiveStyle = termCursorInactiveStyle;

    // Scrollback
    term.options.scrollback = termScrollback;

    // Theme colors
    term.options.theme = buildITheme(termColors, currentTerminalBg());

    if (needsReflow) {
      try {
        fit?.fit();
      } catch {
        /* not measurable yet */
      }
      try {
        term.refresh(0, term.rows - 1);
      } catch {
        /* renderer not ready */
      }
      const el = term.element;
      if (el) {
        const prevDisplay = el.style.display;
        el.style.display = "none";
        void el.offsetHeight;
        el.style.display = prevDisplay;
      }
      // A font/spacing change resizes the cell, so fit() may have changed the
      // grid's cols/rows. The ResizeObserver does NOT fire (the container box is
      // unchanged), so the PTY would never learn the new size and the grid would
      // desync from it (overlapping glyphs) until the next manual resize. Ship
      // the new size to the PTY now and keep the size caches coherent.
      const { cols, rows } = term;
      if (cols > 0 && rows > 0) {
        const last = lastSizeRef.current;
        if (!last || last.cols !== cols || last.rows !== rows) {
          lastSizeRef.current = { cols, rows };
          serverPtySizes.set(props.id, { cols, rows });
          setLastFittedSize({ cols, rows });
          void platform.terminal.resize(props.id, cols, rows).catch(() => {});
        }
      }
    }
  }, [
    termFontStack,
    termFontSize,
    termFontWeight,
    termFontWeightBold,
    termLineHeight,
    termLetterSpacing,
    termCursorStyle,
    termCursorBlink,
    termCursorInactiveStyle,
    termScrollback,
    termColors,
  ]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
});

export default SessionTerminal;
