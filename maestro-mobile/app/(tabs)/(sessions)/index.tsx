// Sessions home. FORGE (Stream B): replace the body with <SessionsScreen/> from
// features/sessions. Compass owns this thin route file; the route name stays.
import { TabPlaceholder } from '../../../navigation/TabPlaceholder';

export default function SessionsHome(): React.JSX.Element {
  return <TabPlaceholder title="Sessions" />;
}
