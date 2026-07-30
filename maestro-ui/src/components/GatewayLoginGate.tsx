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
    <div className="gatewayLoginGate">
      <div className="gatewayLoginGate__card">
        <div className="gatewayLoginGate__title">Maestro Hub</div>
        <div className="gatewayLoginGate__subtitle">
          Sign in with your Google account to open your private workspace.
        </div>

        {!configured ? (
          <div className="gatewayLoginGate__notice">
            Firebase is not configured in this build. The gateway login cannot start.
          </div>
        ) : (
          <>
            <button
              type="button"
              className={`gatewayLoginGate__button${loading ? ' gatewayLoginGate__button--loading' : ''}`}
              onClick={async () => {
                await signInGoogle();
                // The app's startup effects run once on mount (before sign-in), so
                // reload after a successful sign-in to bootstrap cleanly with the
                // session in place — startup fetches then carry a token.
                if (getFbAuth().currentUser) window.location.reload();
              }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Continue with Google'}
            </button>
            {error && (
              <div className="gatewayLoginGate__error">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
