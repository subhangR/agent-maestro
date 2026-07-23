import { useEffect, useState } from 'react';
import { SERVER_URL } from '../utils/serverConfig';

type DeploymentHealth = {
  commit?: string;
  mode?: string;
};

type DeploymentVersionState = {
  service: 'Gateway' | 'Maestro';
  commit: string;
} | null;

function shortCommit(commit: string): string {
  return commit === 'unknown' ? commit : commit.slice(0, 12);
}

/** A small, non-intrusive indicator of the backend revision serving this UI. */
export function DeploymentVersion() {
  const [deployment, setDeployment] = useState<DeploymentVersionState>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadVersion() {
      for (const candidate of [
        { service: 'Gateway' as const, path: '/gateway/health' },
        { service: 'Maestro' as const, path: '/health' },
      ]) {
        try {
          const response = await fetch(`${SERVER_URL}${candidate.path}`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          const contentType = response.headers.get('content-type') || '';
          if (!response.ok || !contentType.includes('application/json')) continue;
          const health = await response.json() as DeploymentHealth;
          if (health.commit) {
            setDeployment({ service: candidate.service, commit: health.commit });
            return;
          }
        } catch (error) {
          if ((error as DOMException).name === 'AbortError') return;
        }
      }
    }

    void loadVersion();
    return () => controller.abort();
  }, []);

  if (!deployment) return null;

  return (
    <output className="deploymentVersion" title={`${deployment.service} commit ${deployment.commit}`}>
      {deployment.service} · {shortCommit(deployment.commit)}
    </output>
  );
}
