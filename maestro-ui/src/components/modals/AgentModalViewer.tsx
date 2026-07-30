import React, { useEffect, useCallback } from 'react';
import type { AgentModal } from '../../stores/useMaestroStore';
import { API_BASE_URL } from '../../utils/serverConfig';
import { Icon } from '../maestro/redesign/kit';

interface AgentModalViewerProps {
  modal: AgentModal;
  onClose: () => void;
}

export function AgentModalViewer({ modal, onClose }: AgentModalViewerProps) {

  // Forward modal action to server
  const sendActionToServer = useCallback(async (action: string, data: Record<string, any>) => {
    try {
      await fetch(`${API_BASE_URL}/sessions/${modal.sessionId}/modal/${modal.modalId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data }),
      });
    } catch (err) {
    }
  }, [modal.sessionId, modal.modalId]);

  // Notify server when modal is closed
  const notifyModalClosed = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/sessions/${modal.sessionId}/modal/${modal.modalId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (err) {
    }
  }, [modal.sessionId, modal.modalId]);

  const handleClose = useCallback(() => {
    notifyModalClosed();
    onClose();
  }, [notifyModalClosed, onClose]);

  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  // Listen for postMessage from the iframe (bridge communication)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      // Modal action from bridge: maestro.sendAction(action, data)
      if (msg.type === 'maestro:modal_action' && msg.modalId === modal.modalId) {
        sendActionToServer(msg.action, msg.data || {});
      }

      // Modal close from bridge: maestro.close()
      if (msg.type === 'maestro:modal_close' && msg.modalId === modal.modalId) {
        handleClose();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [modal.modalId, sendActionToServer, handleClose]);

  return (
    <div
      className="agent-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(40, 34, 24, 0.45)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '80vw',
          maxWidth: '900px',
          height: '70vh',
          maxHeight: '700px',
          borderRadius: 'var(--pn-r-lg, 12px)',
          overflow: 'hidden',
          backgroundColor: 'var(--color-bg-primary, #1a1a2e)',
          border: '1px solid var(--color-border, #333)',
          boxShadow: 'var(--pn-sh-pop, 0 24px 48px rgba(0, 0, 0, 0.4))',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--pn-ui, inherit)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border, #333)',
            backgroundColor: 'var(--color-bg-secondary, #16213e)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="doc" size={14} style={{ color: 'var(--color-text-tertiary, #888)' }} />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text-primary, #e0e0e0)',
              }}
            >
              {modal.title}
            </span>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--color-text-tertiary, #888)',
                fontFamily: 'var(--pn-mono, monospace)',
              }}
            >
              {modal.modalId}
            </span>
          </div>
          <button type="button"
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary, #aaa)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
              borderRadius: 'var(--pn-r-sm, 4px)',
              lineHeight: 1,
            }}
            title="Close modal (Esc)"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Content iframe — use srcdoc for reliable inline script execution */}
        <iframe
          title={modal.title}
          srcDoc={modal.html}
          sandbox="allow-scripts allow-same-origin"
          style={{
            flex: 1,
            width: '100%',
            border: 'none',
            backgroundColor: '#fff',
          }}
        />

        {/* Footer */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--color-border, #333)',
            backgroundColor: 'var(--color-bg-secondary, #16213e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary, #888)',
            }}
          >
            Session: {modal.sessionId.slice(0, 24)}...
          </span>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary, #888)',
            }}
          >
            {new Date(modal.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
}
