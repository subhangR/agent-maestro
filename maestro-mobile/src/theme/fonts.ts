// Offline-embedded fonts. The three OFL families ship as @expo-google-fonts npm
// packages (TTFs bundled, no CDN) and are embedded natively at build via the
// expo-font config plugin in app.json. useAppFonts() is the dev-time gate only;
// production relies on the native embed (no flash-of-unstyled-text).
//
// IMPORTANT (Android): custom fonts are NOT synthetically bolded — every weight
// is its OWN family name. Typography presets must reference these exact strings,
// never `fontWeight`. The string === the @expo-google-fonts export name === the
// embedded TTF filename (sans extension).
import { useFonts } from 'expo-font';
import {
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_400Regular_Italic,
} from '@expo-google-fonts/newsreader';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';

// Per-weight family-name constants. Newsreader ships as STATIC instances
// (variable opsz axis dropped — inconsistent in RN); 400/500/italic only.
export const fontFamily = {
  serifRegular: 'Newsreader_400Regular',
  serifMedium: 'Newsreader_500Medium',
  serifItalic: 'Newsreader_400Regular_Italic',
  uiRegular: 'HankenGrotesk_400Regular',
  uiMedium: 'HankenGrotesk_500Medium',
  uiSemiBold: 'HankenGrotesk_600SemiBold',
  uiBold: 'HankenGrotesk_700Bold',
  monoRegular: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemiBold: 'JetBrainsMono_600SemiBold',
} as const;

export type FontFamilyKey = keyof typeof fontFamily;

// All 10 faces, keyed by the family name they register under at runtime.
const fontAssets = {
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_400Regular_Italic,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
};

// Dev-time gate: returns false until the JS-side faces resolve. Production builds
// embed natively, so this resolves synchronously/immediately there.
export function useAppFonts(): { loaded: boolean; error: Error | null } {
  const [loaded, error] = useFonts(fontAssets);
  return { loaded, error };
}
