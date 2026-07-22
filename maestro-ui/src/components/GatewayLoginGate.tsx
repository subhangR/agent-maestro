import { useFirebaseAuthStore } from '../stores/useFirebaseAuthStore';
import { getFbAuth } from '../firebase/auth';

/**
 * Trusted-Team Hub login gate (Design A, Phase 2).
 *
 * Rendered by App ONLY in gateway mode (VITE_MAESTRO_AUTH_MODE=firebase) when no
 * user is signed in. It forces a Firebase Google sign-in before the app makes any
 * API call, so the gateway always has a token to map uid → that user's private
 * maestro-server instance. In every other build this component is never mounted.
 */
export function GatewayLoginGate() {
  const signInGoogle = useFirebaseAuthStore((s) => s.signInGoogle);
  const loading = useFirebaseAuthStore((s) => s.loading);
  const error = useFirebaseAuthStore((s) => s.error);
  const configured = useFirebaseAuthStore((s) => s.configured);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d0d0f',
        color: '#e7e7ea',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: 360,
          maxWidth: '90vw',
          padding: 32,
          borderRadius: 14,
          background: '#161619',
          border: '1px solid #262629',
          textAlign: 'center',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.3 }}>Maestro Hub</div>
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
          Sign in with your Google account to open your private workspace.
        </div>

        {!configured ? (
          <div style={{ marginTop: 24, fontSize: 13, color: '#ff8a8a', lineHeight: 1.5 }}>
            Firebase is not configured in this build. The gateway login cannot start.
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={async () => {
                await signInGoogle();
                // The app's startup effects run once on mount (before sign-in), so
                // reload after a successful sign-in to bootstrap cleanly with the
                // session in place — startup fetches then carry a token.
                if (getFbAuth().currentUser) window.location.reload();
              }}
              disabled={loading}
              style={{
                marginTop: 24,
                width: '100%',
                padding: '11px 16px',
                borderRadius: 9,
                border: '1px solid #34343a',
                background: loading ? '#232327' : '#f5f5f7',
                color: loading ? '#8a8a90' : '#111',
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
              }}
            >
              {loading ? 'Signing in…' : 'Continue with Google'}
            </button>
            {error && (
              <div style={{ marginTop: 14, fontSize: 12.5, color: '#ff8a8a', lineHeight: 1.5 }}>
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
