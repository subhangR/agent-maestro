import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpellActivationStore } from '../../stores/useSpellActivationStore';

const TIMEOUT_MS = 5000;

/** UndoToast — 5s post-cast undo (03 §1.10.1, 02 §2.7). Consumes lastCastReceipt. */
export const UndoToast = React.memo(function UndoToast() {
  const receipt = useSpellActivationStore((s) => s.lastCastReceipt);
  const consumeReceipt = useSpellActivationStore((s) => s.consumeReceipt);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    const timer = window.setTimeout(() => consumeReceipt(), TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [receipt, consumeReceipt]);

  if (!receipt) return null;

  const handleUndo = async () => {
    if (receipt.undoDisabled) return;
    setUndoing(true);
    try {
      await receipt.undoAction();
    } catch { /* announce error via the activation store next iteration */ }
    finally {
      setUndoing(false);
      consumeReceipt();
    }
  };

  const node = (
    <div
      className="spell-undo-toast"
      role="status"
      aria-live="polite"
    >
      <span className="spell-undo-toast__msg">✦ {receipt.summary}</span>
      {receipt.secondaryAction && (
        <button
          type="button"
          className="spell-undo-toast__secondary"
          onClick={() => void receipt.secondaryAction!.action()}
        >{receipt.secondaryAction.label}</button>
      )}
      {receipt.undoDisabled ? (
        <span className="spell-undo-toast__disabled" title={receipt.undoDisabled.reason}>
          Already executed
        </span>
      ) : (
        <button
          type="button"
          className="spell-undo-toast__undo"
          onClick={handleUndo}
          disabled={undoing}
        >{undoing ? 'Undoing…' : 'Undo'}</button>
      )}
      <button
        type="button"
        className="spell-undo-toast__close"
        onClick={consumeReceipt}
        aria-label="Dismiss"
      >×</button>
    </div>
  );

  return createPortal(node, document.body);
});
