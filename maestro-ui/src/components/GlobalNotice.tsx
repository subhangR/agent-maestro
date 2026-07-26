import React, { useEffect } from 'react';
import { useUIStore } from '../stores/useUIStore';

/**
 * App-wide error / notice toasts.
 *
 * Before this existed, useUIStore.error and .notice were SET by reportError()
 * and showNotice() (124+ call sites, including the session-spawn failure catch
 * in useSessionStore) but NOTHING rendered them — so real failures, e.g. an
 * out-of-memory spawn on a low-RAM machine, were completely invisible to the
 * user. This component closes that gap: it is the single renderer for those.
 */
export function GlobalNotice() {
  const error = useUIStore((s) => s.error);
  const notice = useUIStore((s) => s.notice);
  const setError = useUIStore((s) => s.setError);
  const dismissNotice = useUIStore((s) => s.dismissNotice);

  // Errors otherwise persist forever (reportError never clears them); auto-clear
  // after a while so stale errors don't linger, but leave enough time to read.
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 12000);
    return () => window.clearTimeout(t);
  }, [error, setError]);

  if (!error && !notice) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 'min(560px, 92vw)',
        pointerEvents: 'none',
      }}
    >
      {error && (
        <div
          role="alert"
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--pn-card, #201a1a)',
            border: '1px solid var(--pn-block, #d9534f)',
            color: 'var(--pn-ink, #f0f4f8)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <span style={{ color: 'var(--pn-block, #ff6464)', fontWeight: 700, flex: '0 0 auto' }}>!</span>
          <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6, flex: '0 0 auto', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--pn-card, #1a1e24)',
            border: '1px solid var(--pn-line-2, #333)',
            color: 'var(--pn-ink, #f0f4f8)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{notice}</span>
          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6, flex: '0 0 auto', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
