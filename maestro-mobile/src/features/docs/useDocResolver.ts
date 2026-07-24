// Resolves a single doc for the full-screen viewer. The viewer is reached by a
// deep-linkable route (/docs/[docId]?source=&sourceId=), so it can't rely on the
// caller having the DocEntry in memory — it re-hydrates the owning entity's docs
// list (content is hydrated server-side by the /docs endpoints) and finds `docId`.
import { useEffect, useState } from 'react';

import { getMaestroClient, hasMaestroClient } from '@/state';
import type { DocEntry } from '@/domain';

import type { DocSource } from '../../../navigation/routes';

export interface DocResolverState {
  doc: DocEntry | null;
  loading: boolean;
  error: string | null;
}

function fetchDocs(source: DocSource, sourceId: string): Promise<DocEntry[]> {
  const client = getMaestroClient();
  switch (source) {
    case 'task':
      return client.getTaskDocs(sourceId);
    case 'project':
      return client.getProjectDocs(sourceId);
    case 'session':
    default:
      return client.getSessionDocs(sourceId);
  }
}

export function useDocResolver(source: DocSource, sourceId: string, docId: string): DocResolverState {
  const [state, setState] = useState<DocResolverState>({ doc: null, loading: true, error: null });

  useEffect(() => {
    if (!sourceId || !docId || !hasMaestroClient()) {
      setState({ doc: null, loading: false, error: 'Missing document reference.' });
      return;
    }
    let cancelled = false;
    setState({ doc: null, loading: true, error: null });
    fetchDocs(source, sourceId)
      .then((docs) => {
        if (cancelled) return;
        const found = docs.find((d) => d.id === docId) ?? null;
        setState({
          doc: found,
          loading: false,
          error: found ? null : 'Document not found.',
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ doc: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [source, sourceId, docId]);

  return state;
}
