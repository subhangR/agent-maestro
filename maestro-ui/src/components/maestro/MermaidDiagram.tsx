import React, { useCallback, useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import DOMPurify from "dompurify";

function currentRedesignTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function getThemeColors() {
  const isDark = currentRedesignTheme() === "dark";

  // Read the redesign "Atelier" tokens so the diagram matches the surrounding
  // panels in both light (warm paper) and dark (warm graphite) themes. Fallbacks
  // mirror redesign-tokens.css in case the vars aren't resolved yet.
  const surface = cssVar("--pn-surface", isDark ? "#1B1810" : "#FBFAF6");
  const card = cssVar("--pn-card", isDark ? "#221E15" : "#FFFFFF");
  const hover = cssVar("--pn-hover", isDark ? "#262117" : "#F2EFE8");
  const active = cssVar("--pn-active", isDark ? "#302A1D" : "#ECE8DF");
  const line = cssVar("--pn-line", isDark ? "#2C2719" : "#E7E3D9");
  const line2 = cssVar("--pn-line-2", isDark ? "#3B3524" : "#D8D3C6");
  const ink = cssVar("--pn-ink", isDark ? "#EFE9DB" : "#23201B");
  const ink3 = cssVar("--pn-ink-3", isDark ? "#8C8470" : "#8E897B");
  const brand = cssVar("--pn-brand", isDark ? "#E0A45A" : "#B26A2B");

  return {
    darkMode: isDark,
    background: surface,
    primaryColor: card,
    primaryBorderColor: line2,
    primaryTextColor: ink,
    secondaryColor: active,
    secondaryBorderColor: line2,
    secondaryTextColor: ink,
    tertiaryColor: hover,
    tertiaryBorderColor: line,
    tertiaryTextColor: ink,
    lineColor: ink3,
    textColor: ink,
    mainBkg: card,
    nodeBorder: line2,
    nodeTextColor: ink,
    titleColor: ink,
    clusterBkg: hover,
    clusterBorder: line,
    edgeLabelBackground: surface,
    noteBkgColor: brand,
    noteTextColor: isDark ? "#15130E" : "#FFFFFF",
    noteBorderColor: brand,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
  };
}

// Module-level mermaid initialization tracking
let mermaidInitialized = false;
let lastMermaidTheme: string | null = null;

function ensureMermaidInit() {
  const currentTheme = currentRedesignTheme();
  if (mermaidInitialized && currentTheme === lastMermaidTheme) return;

  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    securityLevel: "strict",
    fontFamily: "'JetBrains Mono', monospace",
    // Render labels as native SVG <text>, not HTML inside <foreignObject>.
    // DOMPurify's svg profile strips foreignObject's inner HTML, which would
    // erase every node/edge label and leave the diagram looking blank/broken.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    themeVariables: getThemeColors(),
  });
  mermaidInitialized = true;
  lastMermaidTheme = currentTheme;
}

// SVG cache with LRU eviction
const svgCache = new Map<string, string>();
const MAX_SVG_CACHE = 50;

interface MermaidDiagramProps {
  chart: string;
}

let diagramCounter = 0;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.25;

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayContentRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [themeVersion, setThemeVersion] = useState(0);

  // Re-render the diagram when the light/dark theme flips so colors track the theme.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((v) => v + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Reset zoom when opening overlay
  const openZoom = useCallback(() => {
    setZoomLevel(1);
    setIsZoomed(true);
  }, []);

  const closeZoom = useCallback(() => {
    setIsZoomed(false);
    setZoomLevel(1);
  }, []);

  const zoomIn = useCallback(() => {
    setZoomLevel((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  }, []);

  const zoomReset = useCallback(() => setZoomLevel(1), []);

  // Scroll-wheel zoom inside overlay
  useEffect(() => {
    if (!isZoomed) return;
    const el = overlayContentRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoomLevel((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
      }
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [isZoomed]);

  // Keyboard shortcuts in overlay
  useEffect(() => {
    if (!isZoomed) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { closeZoom(); return; }
      if (e.key === "=" || e.key === "+") { zoomIn(); return; }
      if (e.key === "-") { zoomOut(); return; }
      if (e.key === "0") { zoomReset(); return; }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isZoomed, closeZoom, zoomIn, zoomOut, zoomReset]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = chart.trim();
    // Key the cache by theme so a light/dark switch doesn't serve stale-colored SVGs.
    const cacheKey = `${currentRedesignTheme()}::${trimmed}`;

    // Check SVG cache first
    const cached = svgCache.get(cacheKey);
    if (cached) {
      setSvgContent(cached);
      setError(null);
      return;
    }

    const id = `mermaid-diagram-${++diagramCounter}`;

    async function renderDiagram() {
      try {
        ensureMermaidInit();
        const { svg } = await mermaid.render(id, trimmed);
        if (!cancelled) {
          const sanitized = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
          // Cache the sanitized SVG
          svgCache.set(cacheKey, sanitized);
          if (svgCache.size > MAX_SVG_CACHE) {
            const firstKey = svgCache.keys().next().value;
            if (firstKey !== undefined) svgCache.delete(firstKey);
          }
          setSvgContent(sanitized);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to render diagram");
          setSvgContent(null);
        }
        // Clean up any leftover error container mermaid may have inserted
        const errorEl = document.getElementById("d" + id);
        if (errorEl) errorEl.remove();
      }
    }

    renderDiagram();
    return () => { cancelled = true; };
  }, [chart, themeVersion]);

  if (error) {
    return (
      <div className="mermaidDiagramError">
        <div className="mermaidDiagramErrorHeader">
          <span className="mermaidDiagramErrorIcon">!</span>
          <span>Diagram render failed</span>
        </div>
        <pre className="mermaidDiagramErrorDetail">{error}</pre>
        <pre className="mermaidDiagramFallback"><code>{chart}</code></pre>
      </div>
    );
  }

  if (!svgContent) {
    return (
      <div className="mermaidDiagramLoading">
        <span className="mermaidDiagramSpinner" />
        <span>Rendering diagram...</span>
      </div>
    );
  }

  // svgContent is already sanitized in the effect
  return (
    <>
      <div
        ref={containerRef}
        className={`mermaidDiagram ${isZoomed ? "mermaidDiagram--zoomed" : ""}`}
        onClick={openZoom}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      {isZoomed && (
        <div className="mermaidDiagramOverlay" onClick={closeZoom}>
          <div
            ref={overlayContentRef}
            className="mermaidDiagramOverlayContent"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="mermaidDiagramOverlayClose" onClick={closeZoom}>
              ✕
            </button>

            {/* Zoom controls toolbar */}
            <div className="mermaidZoomControls" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="mermaidZoomBtn" onClick={zoomOut} disabled={zoomLevel <= ZOOM_MIN} title="Zoom out (-)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 8h10" /></svg>
              </button>
              <button type="button" className="mermaidZoomLevel" onClick={zoomReset} title="Reset zoom (0)">
                {Math.round(zoomLevel * 100)}%
              </button>
              <button type="button" className="mermaidZoomBtn" onClick={zoomIn} disabled={zoomLevel >= ZOOM_MAX} title="Zoom in (+)">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10" /><path d="M3 8h10" /></svg>
              </button>
            </div>

            <div
              className="mermaidDiagramOverlaySvg"
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: "center top" }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </div>
        </div>
      )}
    </>
  );
}
