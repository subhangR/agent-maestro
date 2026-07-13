import React, { useState } from 'react';
import { useEnsembleStore } from '../../stores/useEnsembleStore';

export interface EnsembleMessageComposerProps {
  ensembleId: string;
  senderSessionId?: string | null;
  onClose: () => void;
}

/** EnsembleMessageComposer — ✉ Message ensemble (03 §5, 02 §4.5). */
export const EnsembleMessageComposer = React.memo(function EnsembleMessageComposer({
  ensembleId,
  senderSessionId = null,
  onClose,
}: EnsembleMessageComposerProps) {
  const ensemble = useEnsembleStore((s) => s.ensembleById(ensembleId));
  const sendMessage = useEnsembleStore((s) => s.sendEnsembleMessage);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ensemble) return null;

  const trimmed = content.trim();
  const valid = trimmed.length > 0 && trimmed.length <= 4000;

  const handleSend = async () => {
    if (!valid) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(ensembleId, trimmed, senderSessionId);
      setContent('');
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="sp-ensemble-composer" role="dialog" aria-modal="false" aria-label={`Message ${ensemble.name}`}>
      <header>
        <h4>Message {ensemble.name}</h4>
        <button type="button" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={4000}
        placeholder="Write a message to the ensemble…"
        rows={4}
        aria-label="Message body"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void handleSend();
          }
        }}
      />
      {error && <p className="sp-ensemble-composer__error" role="alert">{error}</p>}
      <div className="sp-ensemble-composer__actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" disabled={!valid || sending} onClick={handleSend}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
});
