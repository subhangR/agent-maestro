import { useEffect } from 'react';
import { useFirebaseAuthStore } from '../stores/useFirebaseAuthStore';
import { useGatewayPresence } from '../firebase/gatewayPresence';
import { GatewayLoginGate } from './GatewayLoginGate';
import { GatewayDashboard } from './GatewayDashboard';
import { DeploymentVersion } from './DeploymentVersion';

/**
 * A deliberately small route shell for `/gateway`. Keeping it outside the main
 * Maestro App prevents the team dashboard from bootstrapping a private Maestro
 * workspace just to display gateway-level information.
 */
export function GatewayPage() {
  const initAuth = useFirebaseAuthStore((state) => state.initAuth);
  const user = useFirebaseAuthStore((state) => state.user);
  const initialized = useFirebaseAuthStore((state) => state.initialized);
  useEffect(() => {
    initAuth();
  }, [initAuth]);
  useGatewayPresence(user);

  if (!initialized) return <div className="app" />;
  return <>
    {user ? <GatewayDashboard /> : <GatewayLoginGate />}
    <DeploymentVersion />
  </>;
}
