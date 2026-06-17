// Expo entry. Compass flipped this to expo-router (the app/ route tree now owns
// the root). The two pre-router side-effect imports MUST stay and run FIRST:
//   1. gesture-handler — RNGH/gorhom must initialise before any navigator mounts.
//   2. URL polyfill — serverConfig uses `new URL()`; Hermes' URL is partial.
//   3. Unistyles theme registration — must run before the first StyleSheet.create.
import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
// Register the Unistyles theme BEFORE the first render / any StyleSheet.create.
import './src/theme/unistyles';

// expo-router entry: mounts the app/ route tree (app/_layout.tsx as root).
import 'expo-router/entry';
