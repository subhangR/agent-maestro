import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Excalidraw, exportToBlob, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { ExportToTaskPicker } from "./ExportToTaskPicker";
import { ExportToSessionPicker } from "./ExportToSessionPicker";
import { maestroClient } from "../utils/MaestroClient";

const DEFAULT_STORAGE_KEY = "maestro-excalidraw-scene-v1";
const SAVE_DEBOUNCE_MS = 300;

type ExcalidrawBoardProps = {
  onClose: () => void;
  /** When true, render inline inside parent container instead of as a portal overlay */
  inline?: boolean;
  /** Custom localStorage key for multi-whiteboard support */
  storageKey?: string;
  /** Display name for the whiteboard */
  name?: string;
  /** Session to inject the exported drawing back into (enables "Send to session") */
  originSessionId?: string;
  /** Export the current scene (PNG + .excalidraw JSON) and inject it into the origin session */
  onSendToSession?: (originSessionId: string, png: Blob, sceneJson: string) => Promise<void>;
  /** Render mode: edit (default) or view-only */
  mode?: 'edit' | 'view';
  /** Server-persisted diagram doc ID. When set + mode=edit, changes are PUTted to the server. */
  docId?: string;
  /** Session ID that owns the diagram doc. Required when docId is set. */
  docSessionId?: string;
  /** Initial scene JSON from the server (overrides localStorage when provided) */
  initialSceneJson?: string;
};

type ExcalidrawChangeHandler = NonNullable<React.ComponentProps<typeof Excalidraw>["onChange"]>;

/** Reactively follow the app's redesign light/dark axis (<html data-theme>) so
 *  Excalidraw's built-in theme tracks the global toggle. */
function useExcalidrawTheme(): "light" | "dark" {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.dataset.theme === "dark",
  );
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setIsDark(el.dataset.theme === "dark");
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    sync();
    return () => observer.disconnect();
  }, []);
  return isDark ? "dark" : "light";
}

function loadInitialData(key: string): ExcalidrawInitialDataState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as ExcalidrawInitialDataState;
    // collaborators is a Map internally; JSON serialization turns it into a plain
    // object which lacks forEach, causing a runtime error. Drop it on load.
    if (data.appState) {
      delete (data.appState as Record<string, unknown>).collaborators;
    }
    return data;
  } catch {
    return null;
  }
}

export function ExcalidrawBoard({ onClose, inline, storageKey, name, originSessionId, onSendToSession, mode = 'edit', docId, docSessionId, initialSceneJson }: ExcalidrawBoardProps) {
  const effectiveKey = storageKey || DEFAULT_STORAGE_KEY;
  const saveTimeoutRef = useRef<number | null>(null);
  const isViewMode = mode === 'view';
  const isDocBacked = Boolean(docId && docSessionId);
  const excalidrawTheme = useExcalidrawTheme();

  const initialData = useMemo(() => {
    // Server-provided JSON takes priority over localStorage cache
    if (initialSceneJson) {
      try {
        const data = JSON.parse(initialSceneJson) as ExcalidrawInitialDataState;
        if (data.appState) {
          delete (data.appState as Record<string, unknown>).collaborators;
        }
        return data;
      } catch {
        // fall through to localStorage
      }
    }
    return loadInitialData(effectiveKey);
  }, [initialSceneJson, effectiveKey]);

  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const canSendToSession = Boolean(inline && onSendToSession && originSessionId);

  const handleSendToSession = useCallback(async () => {
    const api = excalidrawAPIRef.current;
    if (!api || !onSendToSession || !originSessionId) return;

    const elements = api.getSceneElements();
    if (elements.length === 0) return;

    setSending(true);
    try {
      const appState = api.getAppState();
      const files = api.getFiles();
      const png = await exportToBlob({
        elements,
        appState: { ...appState, exportWithDarkMode: false },
        files,
        mimeType: "image/png",
      });
      const sceneJson = serializeAsJSON(elements, appState, files, "local");
      await onSendToSession(originSessionId, png, sceneJson);
    } catch {
      // Swallow — caller surfaces errors via the UI store.
    } finally {
      setSending(false);
    }
  }, [onSendToSession, originSessionId]);

  const handleChange = useCallback<ExcalidrawChangeHandler>((elements, appState, files) => {
    if (isViewMode) return;

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      try {
        const { collaborators: _collaborators, ...appStateToSave } = appState as unknown as Record<string, unknown>;
        const sceneJson = JSON.stringify({ elements, appState: appStateToSave, files });
        // Always write to localStorage as a fast cache
        localStorage.setItem(effectiveKey, sceneJson);
        // When doc-backed, also persist to server
        if (isDocBacked && docId && docSessionId) {
          const serverJson = serializeAsJSON(elements, appState, files ?? {}, "local");
          maestroClient.updateDocContent(docSessionId, docId, serverJson).catch(() => {
            // best-effort; local cache still saved
          });
        }
      } catch {
        // Ignore storage failures.
      } finally {
        saveTimeoutRef.current = null;
      }
    }, SAVE_DEBOUNCE_MS);
  }, [effectiveKey, isViewMode, isDocBacked, docId, docSessionId]);

  useEffect(
    () => () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    },
    [],
  );

  // Imperatively load the server scene once the Excalidraw API is ready.
  // Relying on Excalidraw's `initialData` alone left doc-backed boards blank:
  // either the viewport never scrolled to the elements (fatal in view mode,
  // where the user can't pan), or no scene JSON was passed at all (Resources /
  // SpacesPanel via createWhiteboard). updateScene + scrollToContent forces the
  // content onto the canvas and fits the viewport to it.
  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;

    const applyScene = (raw?: string | null) => {
      if (cancelled || !raw) return;
      const api = excalidrawAPIRef.current;
      if (!api) return;
      try {
        const scene = JSON.parse(raw) as ExcalidrawInitialDataState;
        const elements = scene.elements ?? [];
        if (elements.length === 0) return;
        const { collaborators: _collaborators, ...appState } =
          (scene.appState ?? {}) as Record<string, unknown>;
        api.updateScene({
          elements,
          appState: appState as Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["appState"],
        });
        api.scrollToContent(elements, { fitToContent: true });
      } catch {
        // ignore malformed scene JSON
      }
    };

    if (initialSceneJson) {
      applyScene(initialSceneJson);
    } else if (isDocBacked && docId && docSessionId) {
      maestroClient
        .getSessionDocs(docSessionId)
        .then((docs) => applyScene(docs.find((d) => d.id === docId)?.content))
        .catch(() => {
          // best-effort; localStorage cache (if any) remains
        });
    }

    return () => {
      cancelled = true;
    };
  }, [apiReady, isDocBacked, docId, docSessionId, initialSceneJson]);

  // Escape-to-close only for overlay mode
  useEffect(() => {
    if (inline) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, inline]);

  const handleExportToTask = useCallback(async (): Promise<Blob | null> => {
    const api = excalidrawAPIRef.current;
    if (!api) return null;

    const elements = api.getSceneElements();
    if (elements.length === 0) return null;

    setExporting(true);
    try {
      const blob = await exportToBlob({
        elements,
        appState: { ...api.getAppState(), exportWithDarkMode: false },
        files: api.getFiles(),
        mimeType: "image/png",
      });
      return blob;
    } catch {
      return null;
    } finally {
      setExporting(false);
    }
  }, []);

  const handleExportForSession = useCallback(async (): Promise<{ png: Blob; sceneJson: string } | null> => {
    const api = excalidrawAPIRef.current;
    if (!api) return null;

    const elements = api.getSceneElements();
    if (elements.length === 0) return null;

    setExporting(true);
    try {
      const appState = api.getAppState();
      const files = api.getFiles();
      const png = await exportToBlob({
        elements,
        appState: { ...appState, exportWithDarkMode: false },
        files,
        mimeType: "image/png",
      });
      const sceneJson = serializeAsJSON(elements, appState, files, "local");
      return { png, sceneJson };
    } catch {
      return null;
    } finally {
      setExporting(false);
    }
  }, []);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-imported
    e.target.value = "";

    const api = excalidrawAPIRef.current;
    if (!api) return;

    if (file.name.endsWith(".excalidraw")) {
      // Import .excalidraw scene JSON — update the board directly
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          const { collaborators: _c, ...appState } = (json.appState ?? {}) as Record<string, unknown>;
          if (json.files) {
            api.addFiles(Object.values(json.files) as Parameters<typeof api.addFiles>[0]);
          }
          api.updateScene({
            elements: json.elements ?? [],
            appState: appState as Parameters<typeof api.updateScene>[0]["appState"],
          });
        } catch {
          // Silently ignore malformed files
        }
      };
      reader.readAsText(file);
    } else if (file.type.startsWith("image/")) {
      // Import image — place it on the canvas as an image element
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const dataURL = reader.result as string;
          const fileId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const binaryFile = {
            id: fileId as any,
            dataURL: dataURL as any,
            mimeType: file.type as any,
            created: Date.now(),
            lastRetrieved: Date.now(),
          };
          api.addFiles([binaryFile]);

          // Determine image dimensions before creating the element
          const img = new Image();
          img.onload = () => {
            const MAX_DIM = 600;
            let w = img.naturalWidth || 400;
            let h = img.naturalHeight || 300;
            if (w > MAX_DIM || h > MAX_DIM) {
              const ratio = MAX_DIM / Math.max(w, h);
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }
            const imageElement = {
              type: "image" as const,
              id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              x: 0, y: 0,
              width: w, height: h,
              angle: 0 as any,
              strokeColor: "transparent",
              backgroundColor: "transparent",
              fillStyle: "solid" as any,
              strokeWidth: 2,
              strokeStyle: "solid" as any,
              roughness: 0,
              opacity: 100,
              groupIds: [] as string[],
              frameId: null,
              roundness: null,
              seed: Math.floor(Math.random() * 1_000_000),
              version: 1,
              versionNonce: Math.floor(Math.random() * 1_000_000),
              isDeleted: false as const,
              boundElements: null,
              updated: Date.now(),
              link: null,
              locked: false,
              customData: undefined,
              index: null as any,
              fileId: fileId as any,
              scale: [1, 1] as [number, number],
              status: "saved" as const,
              crop: null,
            };
            api.updateScene({
              elements: [...api.getSceneElements(), imageElement as any],
            });
            // Scroll to new element
            setTimeout(() => api.scrollToContent(), 50);
          };
          img.src = dataURL;
        } catch {
          // Silently ignore
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const content = (
    <div className={inline ? "excalidrawInline" : "excalidrawOverlay"}>
      <div className="excalidrawContainer">
        <div className="excalidrawHeader">
          <div className="excalidrawHeaderLeft">
            <span className="taskBoardTitle">{name || "WHITEBOARD"}</span>
            {!inline && (
              <span className="excalidrawShortcutHint">Cmd/Ctrl+Shift+X to toggle</span>
            )}
          </div>
          <div className="excalidrawHeaderActions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {canSendToSession && (
              <button
                type="button"
                className="themedBtn"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={handleSendToSession}
                disabled={sending}
                title="Export drawing and inject it into the origin session"
              >
                {sending ? 'Sending...' : 'Send to session'}
              </button>
            )}
            <button
              type="button"
              className="themedBtn"
              style={{ padding: '4px 10px', fontSize: '11px' }}
              onClick={() => setShowSessionPicker(true)}
              disabled={exporting}
              title="Export diagram and inject it into a running session"
            >
              Export to Session
            </button>
            <button
              ref={exportBtnRef}
              type="button"
              className="themedBtn"
              style={{ padding: '4px 10px', fontSize: '11px' }}
              onClick={() => setShowTaskPicker(true)}
              disabled={exporting}
              title="Export drawing as image to a task"
            >
              {exporting ? 'Exporting...' : 'Export to Task'}
            </button>
            {!isViewMode && (
              <>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".excalidraw,image/*"
                  style={{ display: 'none' }}
                  onChange={handleImportFile}
                />
                <button
                  type="button"
                  className="themedBtn"
                  style={{ padding: '4px 10px', fontSize: '11px' }}
                  onClick={() => importFileRef.current?.click()}
                  title="Import .excalidraw file or image onto canvas"
                >
                  Import
                </button>
              </>
            )}
            {!inline && (
              <button
                type="button"
                className="taskBoardCloseBtn"
                onClick={onClose}
                aria-label="Close whiteboard"
                title="Close whiteboard"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="excalidrawCanvas">
          <Excalidraw
            initialData={initialData}
            onChange={handleChange}
            excalidrawAPI={(api) => { excalidrawAPIRef.current = api; setApiReady(true); }}
            viewModeEnabled={isViewMode}
            theme={excalidrawTheme}
          />
        </div>
      </div>
      {showTaskPicker && (
        <ExportToTaskPicker
          onExport={handleExportToTask}
          onClose={() => setShowTaskPicker(false)}
          whiteboardName={name || "whiteboard"}
        />
      )}
      {showSessionPicker && (
        <ExportToSessionPicker
          onExport={handleExportForSession}
          onClose={() => setShowSessionPicker(false)}
          whiteboardName={name || "whiteboard"}
        />
      )}
    </div>
  );

  if (inline) {
    return content;
  }

  return createPortal(content, document.body);
}
