import { useCallback, useLayoutEffect } from "react";
import * as DEFAULTS from "../app/constants/defaults";
import { useUIStore } from "../stores/useUIStore";

const MAESTRO_WIDTH_VAR = "--maestro-sidebar-width";
const RIGHT_WIDTH_VAR = "--right-panel-width";

/** Read a px-valued CSS variable off :root, falling back to a number. */
function readWidthVar(name: string, fallback: number): number {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Run a callback on the next animation frame (next tick as a fallback). Used to
 * commit the resting width to the React store right after a drag ends. We
 * deliberately avoid requestIdleCallback: under terminal-streaming load the main
 * thread rarely goes idle, so an idle-scheduled commit could be delayed hundreds
 * of ms to seconds — that was the visible "settle lag" after releasing a handle.
 * A single rAF lands the commit (and the terminal reflow that follows) on the
 * very next frame (~16ms) instead.
 */
function nextFrame(cb: () => void) {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => cb());
    else window.setTimeout(cb, 0);
}

/**
 * Provides stable resize-start handlers for the maestro sidebar and right panel.
 *
 * Panel width is driven entirely by CSS variables (--maestro-sidebar-width /
 * --right-panel-width) on :root, NOT by React state. Both the live drag and the
 * resting width read from these vars, so releasing the handle is just a CSS-var
 * write + localStorage persist — it never triggers a React re-render of the
 * (heavy) sidebar panels. The Zustand store is committed on the next frame after
 * release purely so other readers stay coherent; it is no longer on the resize
 * critical path.
 */
export function useAppLayoutResizing() {

    // Keep the CSS vars in sync with the store (initial hydrate + any
    // programmatic width changes). Writes only when a width actually changes so
    // unrelated UI-store updates don't thrash style recalc.
    useLayoutEffect(() => {
        const root = document.documentElement;
        let lastMaestro = Number.NaN;
        let lastRight = Number.NaN;
        const apply = () => {
            const { maestroSidebarWidth, rightPanelWidth } = useUIStore.getState();
            if (maestroSidebarWidth !== lastMaestro) {
                lastMaestro = maestroSidebarWidth;
                root.style.setProperty(MAESTRO_WIDTH_VAR, `${maestroSidebarWidth}px`);
            }
            if (rightPanelWidth !== lastRight) {
                lastRight = rightPanelWidth;
                root.style.setProperty(RIGHT_WIDTH_VAR, `${rightPanelWidth}px`);
            }
        };
        apply();
        return useUIStore.subscribe(apply);
    }, []);

    const handleMaestroSidebarResizePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) return;
            event.preventDefault();

            const pointerId = event.pointerId;
            const target = event.currentTarget;
            const startX = event.clientX;
            // Current width is the live CSS var (the store may lag behind it).
            const startWidth = readWidthVar(MAESTRO_WIDTH_VAR, useUIStore.getState().maestroSidebarWidth);

            const clamp = (value: number) =>
                Math.min(DEFAULTS.MAX_MAESTRO_SIDEBAR_WIDTH, Math.max(DEFAULTS.MIN_MAESTRO_SIDEBAR_WIDTH, value));

            let current = startWidth;
            const prevCursor = document.body.style.cursor;
            const prevUserSelect = document.body.style.userSelect;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";

            document.documentElement.classList.add("maestro-sidebar-resizing");

            try {
                target.setPointerCapture(pointerId);
            } catch {
                // ignore
            }

            const handlePointerMove = (e: PointerEvent) => {
                if (e.pointerId !== pointerId) return;
                current = clamp(startWidth + (e.clientX - startX));
                document.documentElement.style.setProperty(MAESTRO_WIDTH_VAR, `${current}px`);
            };

            const handlePointerUp = (e: PointerEvent) => {
                if (e.pointerId !== pointerId) return;
                document.removeEventListener("pointermove", handlePointerMove);
                document.removeEventListener("pointerup", handlePointerUp);
                document.removeEventListener("pointercancel", handlePointerUp);

                document.body.style.cursor = prevCursor;
                document.body.style.userSelect = prevUserSelect;
                document.documentElement.classList.remove("maestro-sidebar-resizing");
                // Keep --maestro-sidebar-width — it is now the resting width too.

                try {
                    target.releasePointerCapture(pointerId);
                } catch {
                    // ignore
                }

                // Persist immediately (cheap), but commit to the React store on
                // the next frame so releasing the handle never blocks on a
                // re-render. The width itself is already applied via the CSS var.
                useUIStore.getState().persistMaestroSidebarWidth(current);
                nextFrame(() => useUIStore.getState().setMaestroSidebarWidth(current));

                // Terminals skip fit() during the drag; tell them to reflow once now.
                window.dispatchEvent(new Event("maestro:panel-resize-end"));
            };

            document.addEventListener("pointermove", handlePointerMove);
            document.addEventListener("pointerup", handlePointerUp);
            document.addEventListener("pointercancel", handlePointerUp);
        },
        [], // stable — no deps, reads from CSS var / store at call time
    );

    const handleRightPanelResizePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) return;
            event.preventDefault();

            const pointerId = event.pointerId;
            const target = event.currentTarget;
            const startX = event.clientX;
            // Current width is the live CSS var (the store may lag behind it).
            const startWidth = readWidthVar(RIGHT_WIDTH_VAR, useUIStore.getState().rightPanelWidth);

            const clamp = (value: number) =>
                Math.min(DEFAULTS.MAX_RIGHT_PANEL_WIDTH, Math.max(DEFAULTS.MIN_RIGHT_PANEL_WIDTH, value));

            let current = startWidth;
            const prevCursor = document.body.style.cursor;
            const prevUserSelect = document.body.style.userSelect;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";

            document.documentElement.classList.add("right-panel-resizing");

            try {
                target.setPointerCapture(pointerId);
            } catch {
                // ignore
            }

            const handlePointerMove = (e: PointerEvent) => {
                if (e.pointerId !== pointerId) return;
                current = clamp(startWidth + (startX - e.clientX));
                document.documentElement.style.setProperty(RIGHT_WIDTH_VAR, `${current}px`);
            };

            const handlePointerUp = (e: PointerEvent) => {
                if (e.pointerId !== pointerId) return;
                document.removeEventListener("pointermove", handlePointerMove);
                document.removeEventListener("pointerup", handlePointerUp);
                document.removeEventListener("pointercancel", handlePointerUp);

                document.body.style.cursor = prevCursor;
                document.body.style.userSelect = prevUserSelect;
                document.documentElement.classList.remove("right-panel-resizing");
                // Keep --right-panel-width — it is now the resting width too.

                try {
                    target.releasePointerCapture(pointerId);
                } catch {
                    // ignore
                }

                useUIStore.getState().persistRightPanelWidth(current);
                nextFrame(() => useUIStore.getState().setRightPanelWidth(current));

                // Terminals skip fit() during the drag; tell them to reflow once now.
                window.dispatchEvent(new Event("maestro:panel-resize-end"));
            };

            document.addEventListener("pointermove", handlePointerMove);
            document.addEventListener("pointerup", handlePointerUp);
            document.addEventListener("pointercancel", handlePointerUp);
        },
        [], // stable — no deps, reads from CSS var / store at call time
    );

    return {
        handleMaestroSidebarResizePointerDown,
        handleRightPanelResizePointerDown,
    };
}
