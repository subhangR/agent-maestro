import React, { useMemo, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DocEntry } from "../../app/types/maestro";
import { maestroClient } from "../../utils/MaestroClient";
import { isDiagramDoc } from "../../utils/docHelpers";
import { lazyWithReload } from "../../utils/lazyWithReload";
import { ErrorBoundary } from "../ErrorBoundary";
const LazyMermaidDiagram = lazyWithReload(() =>
  import("./MermaidDiagram").then(m => ({ default: m.MermaidDiagram }))
);
const LazyExcalidrawBoard = lazyWithReload(() =>
  import("../ExcalidrawBoard").then(m => ({ default: m.ExcalidrawBoard }))
);

interface DocViewerProps {
  doc: DocEntry;
  onClose: () => void;
  /** When true, render inline in the workspace instead of as an overlay */
  inline?: boolean;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileExtension(filePath: string): string {
  const parts = filePath.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function isMarkdown(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return ["md", "mdx", "markdown"].includes(ext);
}

const DIAGRAM_LANGUAGES = new Set([
  "mermaid",
  "mermaid-graph",
  "graph",
  "sequenceDiagram",
  "erDiagram",
  "flowchart",
]);

function isDiagramLanguage(lang: string | undefined): boolean {
  if (!lang) return false;
  return DIAGRAM_LANGUAGES.has(lang);
}

/** Renders a referenced diagram doc inline (read-only), fetched by docId. */
function InlineExcalidrawEmbed({ docId, onOpenDoc }: { docId: string; onOpenDoc?: (doc: DocEntry) => void }) {
  const [doc, setDoc] = useState<DocEntry | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // We can't fetch a single doc by ID directly, so we search for it via a
    // session-scoped route. The docId itself encodes the sessionId prefix in
    // most paths, but we use a minimal heuristic: extract sessionId from docId
    // if it matches the pattern doc_<sessionId>_<rest>.
    // As a simpler fallback we just try to surface a placeholder.
    setDoc(null);
    setError(false);
    // docId format is typically "doc_<timestamp>_<random>" — we don't have the
    // sessionId here, so we can only render a placeholder with an open affordance.
    // A full fetch would require knowing the sessionId.
    return () => { cancelled = true; };
  }, [docId]);

  return (
    <div className="excalidrawEmbed" style={{ border: '1px solid var(--pn-line)', borderRadius: 6, padding: 8, margin: '8px 0', background: 'var(--pn-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.7 }}>
        <span>⬡ Diagram</span>
        <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{docId}</span>
        {onOpenDoc && doc && (
          <button type="button" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => onOpenDoc(doc)}>
            Open
          </button>
        )}
      </div>
    </div>
  );
}

function makeMarkdownComponents(onOpenDiagramDoc?: (doc: DocEntry) => void) {
  return {
    code({ className, children, ...props }: any) {
      const match = /language-(\S+)/.exec(className || "");
      const lang = match?.[1];
      const codeString = String(children).replace(/\n$/, "");

      // Inline Excalidraw diagram embed: ```excalidraw\n<docId>\n```
      if (lang === "excalidraw") {
        const docId = codeString.trim();
        return <InlineExcalidrawEmbed docId={docId} onOpenDoc={onOpenDiagramDoc} />;
      }

      // Render mermaid/diagram code blocks as visual diagrams
      if (isDiagramLanguage(lang)) {
        return (
          <React.Suspense fallback={<pre><code>{codeString}</code></pre>}>
            <LazyMermaidDiagram chart={codeString} />
          </React.Suspense>
        );
      }

      // Also auto-detect mermaid-like content in unlabeled code blocks
      const firstLine = codeString.split("\n")[0].trim();
      const mermaidKeywords = [
        "graph ", "graph\n", "flowchart ", "sequenceDiagram", "classDiagram",
        "stateDiagram", "erDiagram", "gantt", "pie ", "pie\n", "gitGraph",
        "mindmap", "timeline", "sankey", "xychart", "block-beta",
        "journey", "quadrantChart", "requirementDiagram", "C4Context",
        "C4Container", "C4Component", "C4Deployment",
      ];
      if (match === null && mermaidKeywords.some((kw) => firstLine.startsWith(kw))) {
        return (
          <React.Suspense fallback={<pre><code>{codeString}</code></pre>}>
            <LazyMermaidDiagram chart={codeString} />
          </React.Suspense>
        );
      }

      // For inline code, render as-is
      if (!className) {
        return <code {...props}>{children}</code>;
      }

      // Block code - render normally
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };
}

export function DocViewer({ doc, onClose, inline }: DocViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [diagramEditMode, setDiagramEditMode] = useState(false);
  const fileExt = useMemo(() => getFileExtension(doc.filePath), [doc.filePath]);
  const shouldRenderMarkdown = useMemo(() => isMarkdown(doc.filePath), [doc.filePath]);
  const isDiagram = isDiagramDoc(doc);
  const fileName = useMemo(() => {
    const parts = doc.filePath.split("/");
    return parts[parts.length - 1];
  }, [doc.filePath]);
  const markdownComponents = useMemo(() => makeMarkdownComponents(), []);

  // Escape-to-close only for overlay mode
  useEffect(() => {
    if (inline) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, onClose, inline]);

  const panel = (
    <div className={`docViewerPanel ${inline ? 'docViewerPanel--inline' : ''} ${isFullscreen ? 'docViewerPanel--fullscreen' : ''}`} onClick={(e) => e.stopPropagation()}>
      {/* Header bar */}
      <div className="docViewerHeader">
        <div className="docViewerHeaderLeft">
          <span className="docViewerIcon">
            {isDiagram ? "⬡" : shouldRenderMarkdown ? "M↓" : "{ }"}
          </span>
          <div className="docViewerHeaderInfo">
            <h3 className="docViewerTitle">{doc.title}</h3>
            <div className="docViewerPathRow">
              <span className="docViewerFileName">{fileName}</span>
              {fileExt && (
                <span className="docViewerExtBadge">.{fileExt}</span>
              )}
            </div>
          </div>
        </div>
        <div className="docViewerHeaderActions">
          {isDiagram && (
            <button
              type="button"
              className="themedBtn"
              style={{ padding: '3px 10px', fontSize: '11px' }}
              onClick={() => setDiagramEditMode((v) => !v)}
              title={diagramEditMode ? "Switch to view mode" : "Edit diagram"}
            >
              {diagramEditMode ? "View" : "Edit"}
            </button>
          )}
          {!inline && (
            <button type="button"
              className="docViewerFullscreenBtn"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            >
              {isFullscreen ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 1v3H1" /><path d="M12 1v3h3" /><path d="M4 15v-3H1" /><path d="M12 15v-3h3" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 1h4v4" /><path d="M15 1h-4v4" /><path d="M1 15h4v-4" /><path d="M15 15h-4v-4" />
                </svg>
              )}
            </button>
          )}
          {!inline && (
            <button type="button" className="docViewerCloseBtn" onClick={onClose} title="Close (Esc)">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Metadata bar */}
      <div className="docViewerMeta">
        <span className="docViewerMetaItem">
          <span className="docViewerMetaLabel">Path</span>
          <span className="docViewerMetaValue" title={doc.filePath}>{doc.filePath}</span>
        </span>
        <span className="docViewerMetaItem">
          <span className="docViewerMetaLabel">Added</span>
          <span className="docViewerMetaValue">{formatDate(doc.addedAt)}</span>
        </span>
        {doc.addedBy && (
          <span className="docViewerMetaItem">
            <span className="docViewerMetaLabel">By</span>
            <span className="docViewerMetaValue">{doc.addedBy}</span>
          </span>
        )}
        {doc.sessionName && (
          <span className="docViewerMetaItem">
            <span className="docViewerMetaLabel">Session</span>
            <span className="docViewerMetaSessionBadge">{doc.sessionName}</span>
          </span>
        )}
      </div>

      {/* Content body */}
      <div className={`docViewerBody ${isDiagram ? 'docViewerBody--diagram' : ''}`}>
        {isDiagram ? (
          <ErrorBoundary name="Diagram">
            <React.Suspense fallback={<div style={{ padding: 20, opacity: 0.5 }}>Loading diagram...</div>}>
              <LazyExcalidrawBoard
                key={`${doc.id}-${diagramEditMode ? 'edit' : 'view'}`}
                inline
                mode={diagramEditMode ? 'edit' : 'view'}
                docId={doc.id}
                docSessionId={doc.sessionId ?? doc.addedBy}
                initialSceneJson={doc.content}
                name={doc.title}
                onClose={() => {}}
              />
            </React.Suspense>
          </ErrorBoundary>
        ) : doc.content ? (
          shouldRenderMarkdown ? (
            <div className="docViewerMarkdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {doc.content}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="docViewerCode"><code>{doc.content}</code></pre>
          )
        ) : (
          <div className="docViewerEmpty">
            <span className="docViewerEmptyIcon">○</span>
            <span>No content available</span>
            <span className="docViewerEmptyPath">{doc.filePath}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (inline) {
    return <div className="docViewerInline">{panel}</div>;
  }

  return (
    <div className={`docViewerOverlay ${isFullscreen ? 'docViewerOverlay--fullscreen' : ''}`} onClick={onClose}>
      {panel}
    </div>
  );
}
