import type { SessionViewMode } from "../../hooks/useSessionViewMode";

const OPTIONS: ReadonlyArray<{ mode: SessionViewMode; label: string; title: string }> = [
  { mode: "chat", label: "Chat", title: "Plain-language conversation view" },
  { mode: "split", label: "Together", title: "See conversation and terminal together" },
  { mode: "terminal", label: "Terminal", title: "Raw terminal output" },
];

export function SessionViewSelector({
  mode,
  onChange,
}: {
  mode: SessionViewMode;
  onChange: (mode: SessionViewMode) => void;
}) {
  return (
    <div className="pn-viewseg" role="tablist" aria-label="Session view">
      {OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="tab"
          aria-selected={mode === option.mode}
          className={`pn-viewseg__btn${option.mode === "split" ? " pn-viewseg__btn--split" : ""}${mode === option.mode ? " pn-viewseg__btn--on" : ""}`}
          onClick={() => onChange(option.mode)}
          title={option.title}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
