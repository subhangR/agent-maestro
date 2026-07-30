import React, { useEffect, useState } from "react";
import { Mark } from "./maestro/redesign/kit";

interface LogoIntroProps {
  onComplete: () => void;
}

const HOLD_MS = 1500;
const FADE_MS = 400;

export function LogoIntro({ onComplete }: LogoIntroProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const holdTimer = window.setTimeout(() => setLeaving(true), HOLD_MS);
    const doneTimer = window.setTimeout(onComplete, HOLD_MS + FADE_MS);
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`logoIntro${leaving ? " logoIntro--out" : ""}`}
      onClick={onComplete}
      role="presentation"
      aria-hidden="true"
    >
      <span className="logoIntro__ring">
        <Mark size={40} />
      </span>
      <span className="logoIntro__word">Maestro</span>
    </div>
  );
}
