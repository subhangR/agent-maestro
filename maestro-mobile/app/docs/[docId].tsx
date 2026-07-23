// app/docs/[docId].tsx — full-screen doc viewer route FRAME (Compass owns the
// thin route file; the body is Forge's features/docs DocViewerScreen).
//
// Pushed (not a modal) so the platform back gesture + tab context are preserved.
// `source`/`sourceId` query params tell the screen which /docs list to hydrate
// content from (a session, a task, or the whole project), then it finds `docId`.
import { useLocalSearchParams } from 'expo-router';

import { DocViewerScreen } from '@/features/docs';
import type { DocSource } from '../../navigation/routes';

export default function DocViewerRoute(): React.JSX.Element {
  const { docId, source, sourceId } = useLocalSearchParams<{
    docId: string;
    source?: DocSource;
    sourceId?: string;
  }>();
  return (
    <DocViewerScreen
      docId={docId ?? ''}
      source={(source ?? 'session') as DocSource}
      sourceId={sourceId ?? ''}
    />
  );
}
