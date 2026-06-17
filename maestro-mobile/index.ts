// Expo entry. Router-agnostic Phase-0 scaffold: registers a minimal root so the
// native dev client boots. Compass wires expo-router later (flips this to
// `import 'expo-router/entry'` once the app/ route tree exists).
import { registerRootComponent } from 'expo';

import { RootScaffold } from './src/RootScaffold';

registerRootComponent(RootScaffold);
