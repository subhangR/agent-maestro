import { useEffect, useRef } from "react";

const FOCUSABLE =
    'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), ' +
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Shared accessibility behavior for Space Window modals:
 * - moves initial focus into the dialog on mount,
 * - closes on Escape,
 * - returns focus to the previously focused element (the trigger) on unmount.
 *
 * Attach the returned ref to the dialog element (give it `tabIndex={-1}` so it
 * can receive fallback focus) alongside `role="dialog"`, `aria-modal="true"`
 * and an `aria-labelledby` pointing at the title.
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
    onClose: () => void,
): React.RefObject<T> {
    // useRef<T>(null) (not useRef<T | null>) — React 18's ref-prop types only
    // accept RefObject<T>.
    const containerRef = useRef<T>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const container = containerRef.current;
        if (container) {
            const first = container.querySelector<HTMLElement>(FOCUSABLE);
            (first ?? container).focus();
        }

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onCloseRef.current();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            if (previouslyFocused && document.contains(previouslyFocused)) {
                previouslyFocused.focus();
            }
        };
    }, []);

    return containerRef;
}
