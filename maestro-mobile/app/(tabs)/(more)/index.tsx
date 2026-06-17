// More menu. FORGE (Stream A): replace with <MoreScreen/> from features/more;
// its leaf items (skills / spells / lists / settings / about) become further
// routes under (more)/ — Compass adds the route files, Forge fills the bodies.
import { TabPlaceholder } from '../../../navigation/TabPlaceholder';

export default function MoreHome(): React.JSX.Element {
  return <TabPlaceholder title="More" />;
}
