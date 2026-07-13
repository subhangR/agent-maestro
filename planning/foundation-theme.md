# Foundation & Theme — planning (Bedrock 🪨)

Scope: the Expo/React Native **app scaffold** and the **`theme/`** layer — the base every
other specialist builds on. Port the Atelier `--pn-*` token system + `.t-*` type scale from
`Maestro Design System - mobile/colors_and_type.css` into a typed JS theme, bundle the three
font families offline, port the inline-SVG `Icon/Glyph/Mark/Gauge` primitives to
`react-native-svg`, and ship `ThemeProvider`/`useTheme` with light + dark.

Connection contract is irrelevant to this layer (no network here) — but the theme is the hard
dependency for Palette (components), Compass (navigation chrome), and Relay (terminal colors),
so the public API must freeze **early and stay stable**. This doc is opinionated; every choice
lists the rejected alternatives.

---

## 1. Recommended architecture

A **pure-data token layer** (no React) → a **theme assembly** (light/dark objects + a `Theme`
type) → a **provider + hook** (runtime light/dark) → **adapters** that re-shape the theme for
consumers that need their own theme format (React Navigation, xterm). The SVG primitives sit
beside the theme because they are foundation, color-driven via `currentColor`, and used
everywhere.

Design principles carried over from Atelier:
- **Tokens are the single source of truth.** Components never hardcode a hex/px — they read
  `theme.color.*` / `theme.space[n]` / `type.body`. This is exactly the `--pn-*` discipline.
- **Light is the default; dark is a token-only swap.** The CSS proves this: `html[data-theme="dark"]`
  overrides *only* the variable values, no rule changes. Our `lightTheme`/`darkTheme` are two
  objects of identical shape; components are theme-agnostic.
- **Status reads by dot + word, never color alone** (a11y). The `Glyph` component encodes shape
  per status; color is secondary. Keep that.
- **No neon, no glow.** Shadows are soft warm drops (iOS) / low elevation (Android). There is no
  glow token to port.

---

## 2. Platform decisions

### 2.1 Expo SDK + React Native version
**Decision: latest stable Expo SDK (target SDK 54 / RN 0.81+), New Architecture ON (the SDK
default), managed workflow with Continuous Native Generation (CNG) via `app.json` + config
plugins — no committed `ios/`/`android/` folders.**

- Lock the exact version at scaffold time with `npx create-expo-app@latest` and commit the
  resolved `package.json` + lockfile. Do **not** float `^` on `expo` / `react-native` / native
  modules — pin exact and let `npx expo install` pick compatible native dep versions.
- New Architecture is required-path now and unblocks the modern `react-native-webview` and
  `react-native-svg` builds Relay/Palette need. Verify `react-native-webview` (Relay's terminal
  host) is New-Arch-clean on the chosen SDK before we commit — it is the one dep most likely to
  lag (open question O-4).

**Rejected:**
- *Bare React Native (no Expo).* We'd hand-manage native font linking, SVG, WebView, secure
  storage, and OTA. Expo gives all of these as first-party (`expo-font`, `expo-secure-store`,
  config plugins) and CNG keeps native folders out of git. No native module here needs ejecting.
- *Expo Router–driven scaffold owned here.* Routing is Compass's call (react-navigation vs
  expo-router). The scaffold I ship is router-agnostic: `App.tsx` mounts providers and renders
  `children`; Compass slots its navigator inside. I do **not** pick the router.

### 2.2 Standalone vs bun workspace
**Decision: standalone npm package, OUTSIDE the agent-maestro bun workspace. Use `npm` (or yarn
classic) — never `bun` — for this package.**

Rationale (this is non-negotiable and matches prior project memory):
- **node-pty / bun incompatibility is a known landmine in this repo** — bun strips the
  spawn-helper exec bit and `onData` doesn't fire. Keeping the RN app entirely off bun avoids
  any chance of the Metro/native toolchain inheriting bun resolution.
- Metro's module resolution + the React Native dependency graph fight workspace hoisting; Expo
  officially recommends the project own its `node_modules` and lockfile. A monorepo RN setup is
  possible but adds `metro.config.js` `watchFolders`/`nodeModulesPaths` complexity for zero gain
  here — the app shares **no code** with the bun packages (it talks to the server over the wire).
- The worktree at `/Users/subhang/Desktop/Projects/maestro/mobile-wt/app` is the package root; it
  has its own `package.json`, lockfile, `.gitignore`. It is not referenced by the root
  `package.json` `workspaces`.

**Rejected:** *Add `app` to the bun `workspaces` array.* Saves nothing (no shared deps), inherits
the bun PTY risk, complicates Metro. Hard no.

### 2.3 TypeScript config
**Decision: `tsconfig.json` extends `expo/tsconfig.base`, `strict: true`, with path alias
`@/*` → `src/*`.**

```jsonc
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "noUncheckedIndexedAccess": true,   // catches token map[key] misses
    "verbatimModuleSyntax": true
  },
  "include": ["src", "App.tsx", "expo-env.d.ts"]
}
```
- Alias resolution at runtime via `babel-plugin-module-resolver` (or Expo SDK 50+ Metro
  `unstable_enablePackageExports` + tsconfig paths — confirm which the chosen SDK honors; the
  Babel plugin is the safe, universal choice).
- `strict` is mandatory — Lexicon's domain types and the theme types both lean on it.

---

## 3. Theme architecture — `--pn-*` → typed JS

### 3.1 Token shape
Two theme objects of identical shape (`lightTheme`, `darkTheme`); a `Theme` type derived from
`lightTheme` so consumers get full autocomplete. Color values that differ light/dark live in the
theme; geometry (space/radii/typescale/motion) is **mode-invariant** and shared.

```ts
// src/theme/tokens/palette.ts  — the only place light/dark diverge
export const lightColors = {
  paper:'#F4F2EC', surface:'#FBFAF6', card:'#FFFFFF', hover:'#F2EFE8', active:'#ECE8DF',
  line:'#E7E3D9', line2:'#D8D3C6',
  ink:'#23201B', ink2:'#5B564C', ink3:'#8E897B', ink4:'#B7B2A4',
  brand:'#B26A2B', brand2:'#9A581F', brandSoft:'rgba(178,106,43,0.11)',
  run:'#3E8E5A', runSoft:'rgba(62,142,90,0.12)',
  wait:'#BD8A2A', waitSoft:'rgba(189,138,42,0.14)',
  block:'#BB4D3D', blockSoft:'rgba(187,77,61,0.12)',
  info:'#3F6C90', infoSoft:'rgba(63,108,144,0.12)',
  idle:'#A29C8E', idleSoft:'rgba(162,156,142,0.16)',
} as const;
export const darkColors: typeof lightColors = { /* the html[data-theme=dark] block, verbatim */ };
```

```ts
// src/theme/tokens/space.ts   — 4px grid, index by step number
export const space = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40, 12:48, 16:64 } as const;
// src/theme/tokens/radii.ts
export const radii = { xs:5, sm:7, md:10, lg:14, pill:999 } as const;
// src/theme/tokens/motion.ts  — durations(ms) + easings as Reanimated/Easing bezier args
export const motion = {
  dur:{ fast:120, base:180, slow:280 },
  ease:{ out:[0.16,1,0.3,1], standard:[0.4,0,0.2,1] },   // -> Easing.bezier(...) at call site
} as const;
```

```ts
// src/theme/theme.ts  — LOCKED canonical token shape (matches Palette's §7.1 enumeration)
export interface Theme {
  colors: typeof lightColors;            // plural — theme.colors.ink2, theme.colors.run, ...
  space: typeof space;                   // theme.space[1..16]
  radii: typeof radii;                   // theme.radii.{xs,sm,md,lg,pill}
  shadows: ShadowTokens;                 // plural — theme.shadows.{sm,md,pop}
  fonts: FontFamilies;                   // plural — theme.fonts.{serif,ui,mono}
  type: typeof typePresets;              // .t-* presets
  motion: { easeOut:number[]; easeStd:number[]; durFast:number; durBase:number; durSlow:number }; // FLAT
}
export const lightTheme: Theme = { colors: lightColors, space, radii, shadows: lightShadow, fonts, type: typePresets, motion };
export const darkTheme:  Theme = { ...lightTheme, colors: darkColors, shadows: darkShadow };
```

> **Token key-names are LOCKED to this shape** (plural `colors`/`shadows`/`fonts`, flat `motion`,
> `space[n]`, `radii.*`) — Palette enumerated exactly these and every consumer keys off them.
> This is the frozen `@/theme` contract; I will not rename after the first deliverable.

### 3.2 Shadows (the one token that doesn't port 1:1)
CSS `box-shadow` has no single RN equivalent. Ship a `shadow` token that resolves per platform:

```ts
// iOS uses shadowColor/Offset/Opacity/Radius; Android uses elevation; web uses boxShadow.
export const lightShadow = {
  sm:  Platform.select({ ios:{shadowColor:'#282218',shadowOpacity:0.05,shadowRadius:2,shadowOffset:{width:0,height:1}}, android:{elevation:1}, default:{boxShadow:'0 1px 2px rgba(40,34,24,0.05)'} }),
  md:  /* ... two-layer drop → approximate with the larger layer on iOS, elevation:4 on Android */,
  pop: /* ... elevation:12 */,
};
```
- The CSS `--pn-sh-md` is a **two-layer** shadow; RN iOS supports one. Approximate with the
  larger/softer layer. Document the fidelity gap — it is acceptable (these are subtle warm drops).
- Android elevation also tints; keep elevations low (1/4/12) to avoid heavy material shadows.

### 3.3 Typography — `.t-*` → RN `TextStyle` presets
The single highest-risk conversion. Three RN-specific gotchas, all handled in `typePresets.ts`:

1. **Custom-font weights need explicit family names, not `fontWeight`.** RN (esp. Android) does
   **not** synthesize weights for custom fonts. With `@expo-google-fonts/*`, each weight is its
   own family constant (`HankenGrotesk_600SemiBold`). So presets set `fontFamily` per weight and
   omit `fontWeight` (or set it only as a web hint).
2. **`letterSpacing` is px in RN, `em` in CSS.** Convert at preset build time:
   `track-mega 0.12em @ 11px = 1.32px`, `track-label 0.06em`, `track-tight -0.01em`.
3. **`lineHeight` is absolute px in RN, a multiplier in CSS.** Convert: `lineHeight = round(fs * lh)`
   (e.g. body 14 × 1.5 = 21).

```ts
// src/theme/typePresets.ts
import { TextStyle } from 'react-native';
export const type = {
  display:   { fontFamily:'Newsreader_500Medium',     fontSize:40, lineHeight:47, letterSpacing:0 },
  h1:        { fontFamily:'Newsreader_500Medium',     fontSize:28, lineHeight:33 },
  h2:        { fontFamily:'HankenGrotesk_600SemiBold',fontSize:22, lineHeight:30, letterSpacing:-0.22 },
  h3:        { fontFamily:'HankenGrotesk_600SemiBold',fontSize:18, lineHeight:24, letterSpacing:-0.18 },
  title:     { fontFamily:'HankenGrotesk_600SemiBold',fontSize:15, lineHeight:20, letterSpacing:-0.15 },
  body:      { fontFamily:'HankenGrotesk_400Regular', fontSize:14, lineHeight:21 },
  secondary: { fontFamily:'HankenGrotesk_400Regular', fontSize:13, lineHeight:20 },
  label:     { fontFamily:'HankenGrotesk_500Medium',  fontSize:12, lineHeight:16 },
  eyebrow:   { fontFamily:'JetBrainsMono_600SemiBold',fontSize:11, lineHeight:14, letterSpacing:1.32, textTransform:'uppercase' },
  quote:     { fontFamily:'Newsreader_400Regular_Italic', fontStyle:'italic', fontSize:18, lineHeight:26 },
  mono:      { fontFamily:'JetBrainsMono_400Regular', fontSize:12.5, lineHeight:19 },
  code:      { fontFamily:'JetBrainsMono_500Medium',  fontSize:12.5 },
} satisfies Record<string, TextStyle>;
```
- **Color is NOT baked into presets** (CSS bakes `color: var(--pn-ink-2)` into `.t-body`). In RN,
  color comes from the theme at render so presets stay mode-invariant. Convention: presets carry
  *geometry + family*; the component (or a `<Text variant>` from Palette) applies `color` from
  `theme.color.*`. I will publish the **default color per variant** as a lookup
  (`typeColor.body = 'ink2'`) so Palette wires the right default. (Boundary item with Palette.)

### 3.4 Light/dark strategy (UPDATED — Unistyles v3 is the theme registry)
**Decision: with Unistyles v3 ratified, `StyleSheet.configure` IS the theme registry — not a
bespoke Context. I register `light`/`dark` themes once and let Unistyles inject the theme into
`StyleSheet.create((theme)=>…)` natively (no React re-render on swap). `ThemeProvider` collapses
to a thin boot wrapper; `useTheme()` becomes a thin reactive read over `useUnistyles()`.**

```ts
// src/theme/configure.ts — called once at app boot, before first render
StyleSheet.configure({
  themes: { light: lightTheme, dark: darkTheme },
  settings: { adaptiveThemes: true },   // follow OS via useColorScheme equivalent
});
// src/theme/useTheme.ts
export const useTheme = () => useUnistyles().theme;          // reactive imperative read (SVG color, adapters)
export const setThemeMode = (m: 'light'|'dark'|'system') => {
  if (m === 'system') UnistylesRuntime.setAdaptiveThemes(true);
  else { UnistylesRuntime.setAdaptiveThemes(false); UnistylesRuntime.setTheme(m); }
};
```
- **Mode persistence is Ledger's `prefsStore.theme`** (sync MMKV). On boot Ledger reads the pref
  *synchronously before first paint* and calls `setThemeMode(pref)`; I own `configure()` +
  `setThemeMode()`, Ledger owns the stored value. (Resolves O-5 — matches state.md §2.3.)
- A tiny `<ThemeBoot>` wrapper still owns `<StatusBar>` style + root background color and exposes
  the `navigationTheme`/`terminalTheme` adapters (3.6); it sits above Compass's navigator
  (resolves O-1, matches navigation.md D-Bedrock-1).
- `useTheme()` (imperative read) is still needed for non-StyleSheet consumers: SVG `color` props,
  the nav/terminal adapters, anything outside a `create()` callback.

### 3.5 Styling system (RATIFIED: `react-native-unistyles` v3)
How components *consume* the theme. **Ratified by Atlas** — Unistyles v3 with a custom dev client
(no Expo Go; webview + mmkv + svg + gorhom already force the dev client, so the constraint is
free). Vanilla `StyleSheet + useTheme` remains the documented fallback (identical token API → no
rework if we ever fall back).

**Ratified: `react-native-unistyles` v3.**
- Theme-aware `StyleSheet.create` API (familiar), light/dark + breakpoints first-class, and on v3
  it updates styles **without React re-renders** (C++/Shadow-tree) — ideal for a token-driven DS
  with frequent theme reads. Plays well with New Architecture.
- Our `lightTheme`/`darkTheme` register directly as Unistyles themes — near-zero glue.

**Conservative fallback: vanilla `StyleSheet.create` + `useTheme()`** (compute styles in-component
from `theme`). Zero deps, zero risk, but more boilerplate and theme-change causes re-renders.

**Rejected:**
- *Tamagui* — ships its own token/theme system; we'd be fighting it to honor `--pn-*` exactly.
  Heavy compiler setup. Conflicts with "tokens are the single source of truth."
- *NativeWind (Tailwind-in-RN)* — our scale is exact px tokens, not Tailwind's; mapping is lossy,
  and it adds Babel/Metro/tailwind.config surface. (The `tailwind-design-system` skill informs my
  thinking but Tailwind-the-runtime is the wrong fit here.)
- *Shopify Restyle* — genuinely good and theme-object-shaped, but prop-based `<Box>/<Text>` and
  per-render style resolution; Unistyles wins on performance and ergonomics for our case.

If the team is risk-averse about Unistyles' newness, fall back to vanilla StyleSheet — the theme
object API is identical either way, so **this decision does not block me shipping the tokens.**

### 3.6 Adapters (so consumers don't re-derive colors)
- `navigationTheme.ts` → maps theme to React Navigation's `Theme` (`{dark, colors:{primary:brand,
  background:paper, card:surface, text:ink, border:line, notification:block}}`). For Compass.
- `terminalTheme.ts` → maps tokens to an xterm theme (`background:surface, foreground:ink,
  cursor:brand`, ANSI from status colors). For Relay. A reference already exists at
  `Maestro Design System - mobile/panel-redesign/terminal-theme.ts` — start from it.

---

## 4. Fonts — offline bundling

**Decision: the `@expo-google-fonts/*` packages + the `expo-font` config plugin (static embed).**

Packages (each ships the TTFs as an npm dependency → fully offline, no CDN):
- `@expo-google-fonts/newsreader` → `Newsreader_400Regular`, `Newsreader_500Medium`,
  `Newsreader_400Regular_Italic`
- `@expo-google-fonts/hanken-grotesk` → `HankenGrotesk_400Regular/_500Medium/_600SemiBold/_700Bold`
- `@expo-google-fonts/jetbrains-mono` → `JetBrainsMono_400Regular/_500Medium/_600SemiBold`

Embed natively at build via the config plugin (no async load, no flash-of-unstyled-text):
```jsonc
// app.json → plugins
["expo-font", { "fonts": [
  "node_modules/@expo-google-fonts/hanken-grotesk/...HankenGrotesk_400Regular.ttf",
  /* ...all 10 faces... */
]}]
```
Provide a `useFonts()` gate in `App.tsx` as the dev-time fallback (returns null/splash until
loaded). Production relies on the embed.

**Newsreader is a variable font (opsz 6..72)** — RN variable-font support is inconsistent across
iOS/Android, so we ship **static instances** at the weights we use (400, 500, italic-400). The
`@expo-google-fonts` package already provides static instances — good. We do **not** ship the
full variable axis.

**Weight mapping is by family name, not `fontWeight`** (see 3.3 gotcha #1). The 10 faces above
are exactly the set the `.t-*` presets reference.

**Rejected:**
- *Google Fonts `@import` (the CSS does this)* — network-dependent and not even a thing in RN.
  Hard no; it must be offline.
- *Hand-placing `.ttf` files in `assets/fonts/` + manual `Font.loadAsync`* — works, but the
  `@expo-google-fonts` packages give versioned, correctly-named static instances for free and
  keep the font files out of git. Use the packages.
- *`expo-google-fonts` async `useFonts` only (no embed)* — causes a load flash and a failure mode
  if assets aren't prefetched; the config-plugin embed is strictly better for a shipped app.

Licensing: Newsreader, Hanken Grotesk, JetBrains Mono are all OFL — bundling is fine.

---

## 5. SVG — RATIFIED ownership split

**Ratified split (Atlas):** *Bedrock provides the `react-native-svg` dependency + the `M_ICONS`
path-data registry + the font/asset loading; **Palette authors** the components* (`Icon`,
`StatusGlyph`, `Mark`, `Gauge`, `StatusDot`, `AgentAvatar`, `<Text variant>`). This cleanly
resolves the prior overlap — I own raw data + deps, Palette owns the React Native components.

**My deliverables for this boundary (DATA + ASSETS ONLY — no component files):**
- Install `react-native-svg` ~15 via `npx expo install` (Expo-pinned, New-Arch-clean).
- `src/theme/svg/paths.ts` — the `M_ICONS` registry (the ~50 icon path strings from `m-kit.jsx`)
  as **single multi-subpath `d` strings** (Palette emits one `<Path>`; do NOT split on `'M'`, and
  do NOT rely on `pathLength="100"`), **plus** the status-glyph + `Mark` shape data and the
  **Gauge/arc geometry constants** (precomputed arc lengths, since react-native-svg's `pathLength`
  is unreliable — Palette consumes these constants instead of computing per-render).
- `src/theme/svg/statusColors.ts` — a **status→token-color map** keyed by Lexicon's canonical
  enum union (boundary O-2), so Palette's `StatusGlyph`/`StatusDot` resolve `theme.colors.run`
  etc. without a parallel mapping. Knockout fills (the completed-check cutout) reference
  `theme.colors.card`/`surface` — never CSS-var fills.
- `assets/logos/` — the claude/codex/gemini raster logos (bundled `require()`d images) for
  Palette's `AgentAvatar`.
- **`currentColor` note for Palette:** `react-native-svg`'s `<Svg color={…}>` makes children with
  `stroke/fill="currentColor"` inherit it — pass the explicit `color` prop, don't rely on text
  cascade.

I do **NOT** author any component files — `Icon.tsx`, `StatusGlyph.tsx`, `Mark.tsx`, `Gauge.tsx`,
`StatusDot.tsx`, `AgentAvatar.tsx`, `Avatar.tsx`, `<Text variant>` all live in Palette's
`components/primitives/`, importing my `paths.ts` + `statusColors.ts` + `fonts`. `theme/svg/`
contains zero React components.

---

## 6. Folder structure (my scope)

```
app/                         # package root (= worktree, standalone npm, not in bun workspace)
  App.tsx                    # mounts ThemeProvider + font gate; renders Compass's navigator as child
  app.json                   # expo config: name, plugins (expo-font), newArchEnabled
  babel.config.js            # babel-preset-expo + module-resolver (@/*)
  metro.config.js            # default expo metro (+ svg transformer only if we ever inline .svg)
  tsconfig.json
  package.json / package-lock.json
  src/
    theme/
      tokens/
        palette.ts           # lightColors + darkColors (the --pn-* ramps)
        space.ts radii.ts motion.ts
        typography.ts        # families, raw sizes, lineHeights, tracking primitives
        shadows.ts           # cross-platform shadow tokens (light + dark)
        index.ts
      theme.ts               # Theme type + lightTheme/darkTheme (LOCKED shape)
      typePresets.ts         # .t-* → TextStyle presets (+ default color-per-variant map)
      configure.ts           # StyleSheet.configure({themes,settings}) — Unistyles v3 registry
      ThemeBoot.tsx          # thin wrapper: StatusBar + root bg + adapters above navigator
      useTheme.ts            # useTheme() (read) + setThemeMode() over UnistylesRuntime
      navigationTheme.ts     # adapter → React Navigation / expo-router Theme (Compass)
      terminalTheme.ts       # adapter → xterm theme (Relay)
      fonts.ts               # @expo-google-fonts family-name map + useFonts gate
      svg/                   # DATA + ASSETS ONLY — no React components (those are Palette's)
        paths.ts             # M_ICONS path-data registry + glyph/mark shape data + Gauge/arc geometry constants
        statusColors.ts      # status→token-color map (keyed off Lexicon's canonical status union)
        index.ts             # re-exports the data (Palette imports from @/theme)
      index.ts               # PUBLIC surface — the frozen API everyone imports
  assets/
    logos/                   # claude/codex/gemini raster logos (consumed by Palette's AgentAvatar)
```
Public import convention: everyone imports from `@/theme` (the `index.ts` barrel). That barrel is
the contract I keep stable.

---

## 7. Best practices
- **Freeze the public `@/theme` API in the first deliverable** (token names, `Theme` type, `type`
  preset keys, `useTheme` shape, SVG props). Downstream teams code against it; churning it later
  is the worst thing I can do. Ship a stub-but-complete API early, fill internals after.
- `as const` on every token object so keys/values are literal-typed; derive `Theme` from the light
  object so the two themes can't drift in shape.
- `noUncheckedIndexedAccess` to catch `theme.space[n]` typos at compile time.
- Presets carry geometry + family only; **color is applied at render from the theme** (keeps
  presets mode-invariant — the CSS bakes color in, we deliberately don't).
- One source for px↔em / multiplier↔px conversions, done at preset build time, never ad hoc.
- Keep `motion` as data (ms + bezier arrays); let Reanimated/`Easing.bezier` consume at the call
  site — don't bake Animated values into the theme.

## 8. Risks
| # | Risk | Mitigation |
|---|---|---|
| R-1 | Custom-font weights not synthesized on Android | Reference explicit per-weight family names; never rely on `fontWeight` for custom fonts. |
| R-2 | `letterSpacing` em→px & `lineHeight` mult→px mistakes | Convert once in `typePresets.ts` with documented math; snapshot-test the preset values. |
| R-3 | Newsreader variable font (opsz) inconsistent in RN | Ship static instances (400/500/italic) from `@expo-google-fonts`; no variable axis. |
| R-4 | CSS two-layer / box shadows don't map to RN | Approximate with single iOS layer / low Android elevation; accept documented fidelity gap. |
| R-5 | `react-native-svg` / `react-native-webview` New-Arch lag | Verify both on the chosen SDK before locking; SVG is low-risk, WebView is the one to check (Relay dep). |
| R-6 | Unistyles v3 newness if chosen | Vanilla `StyleSheet + useTheme` fallback; theme object API identical either way → no rework. |
| R-7 | Accidental bun usage breaks toolchain | Standalone npm package, documented in CONVENTIONS; never `bun install` here. |
| R-8 | `currentColor` inheritance quirks in react-native-svg | Pass `color` on `<Svg>`; unit-render each primitive in both themes. |

## 9. Cross-team dependencies — RESOLVED at consensus
- **O-1 (Compass + Ledger): root mount order — RESOLVED.** `ThemeBoot` (StatusBar + root bg +
  adapters) sits above Compass's expo-router navigator; Ledger's stores mount inside. Matches
  navigation.md D-Bedrock-1. I own the scaffold/boot, Compass owns the navigator (router pick is
  theirs).
- **O-2 (Lexicon): status enum union — OPEN INPUT NEEDED.** My `statusColors.ts` + glyph shape
  data key on Lexicon's canonical status union (`run/wait/block/info/idle` + lifecycle
  `spawning/idle/working/in_review/completed/cancelled/blocked/failed/needsInput`). Lexicon to
  publish the exact union + a shared status-derivation mapper (`derive/`); I key `statusColors`
  off it, Palette's `StatusGlyph`/`StatusDot` consume both. The only thing I still need from
  another team.
- **O-3 (Palette): styling + icon boundary — RESOLVED.** (a) Unistyles v3 ratified (§3.5).
  (b) **Icon-ownership ratified by Atlas: `theme/svg/` is DATA + ASSETS only; Palette authors all
  components in `components/primitives/`** (§5). (c) I publish the default color-per-variant map;
  Palette's `<Text variant>` consumes my `type` presets + `fonts`.
- **O-4 (Relay): New-Arch WebView + terminal theme — RESOLVED.** `react-native-webview` 13.12 is
  the ratified terminal host (New-Arch dev client). I hand Relay a `terminalTheme` adapter seeded
  from `panel-redesign/terminal-theme.ts`.
- **O-5 (Ledger): theme-mode persistence — RESOLVED.** Ledger's `prefsStore.theme` (sync MMKV)
  holds the mode; on boot Ledger reads it pre-paint and calls my `setThemeMode()`. I own
  `configure()` + `setThemeMode()`; Ledger owns the stored value (state.md §2.3).
- **O-6 (Atlas): router — RESOLVED.** expo-router v5 ratified; my scaffold is router-agnostic and
  does not bake routing into `App.tsx`.

**No-auth (User Directive 1): zero impact on `theme/`.** The theme layer never had an auth
surface — no token, login, or `?token=` touches tokens, fonts, or SVG data. Nothing to change.

**New Bedrock task accepted (from Palette §4 / risk R-9): WCAG AA contrast audit** of the
desaturated status colors (`run/wait/block/info/idle`) on `paper`/`card` in **both** themes for
*text* uses (status labels, tags). Decorative dots/glyphs paired with text are exempt. If any
text use fails AA, I propose a `*-text` token variant rather than changing the canonical dot color.

---
*Bedrock 🪨 — foundation + theme. I ship the `@/theme` public API first (LOCKED token shape) and
keep it stable; everything else builds on it.*
