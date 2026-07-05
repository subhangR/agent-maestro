# design-sync notes — Maestro Mobile Design System

Project: `maestro-mobile-v2` (claude.ai/design id `2346606b-866b-406f-b412-fcdc7baf69c6`).

> A first project `Maestro Mobile Design System` (`de304f65-00bd-47e1-b8d7-77fa7445b537`) was created earlier this run but **nothing was ever uploaded to it** — the user asked for a fresh `maestro-mobile-v2` project instead. The de304f65 project is empty and safe to delete from claude.ai/design.

## What this syncs
A **web-renderable mirror** of the `maestro-mobile` React Native design system, living at `maestro-mobile/claude-design/` (package `maestro-mobile-ds`). Claude Design renders web React (DOM), so the RN app components can't be synced directly — this package re-implements the same components as web DOM + CSS, using the identical Maestro brand tokens (ported from `maestro-design-system/colors_and_type.css`). Components are styled mobile-first; `PhoneFrame`/`AppBar`/`TabBar`/`Screen` let the design agent compose whole phone screens.

- Build: `cd maestro-mobile/claude-design && npm run build` (tsup → `dist/index.js` + `dist/index.css` + `dist/index.d.ts`).
- Converter invocation (from repo root):
  `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules maestro-mobile/claude-design/node_modules --entry maestro-mobile/claude-design/dist/index.js --out ./ds-bundle`
- `globalName` = `MaestroMobile` (the `window.MaestroMobile.*` global the cards load from).
- Fonts: `cfg.extraFonts: ["fonts.css"]` (package-relative) → declares Inter + JetBrains Mono `@font-face`, woff2 copied from `maestro-design-system/fonts/` into `maestro-mobile/claude-design/fonts/`.

## Re-sync risks
- The web mirror is hand-maintained and must be kept in step with the RN package (`maestro-mobile/src/`). If RN components change, update both. The two are siblings; neither is generated from the other.
- Tokens are ported from `maestro-design-system/colors_and_type.css`. If the web brand tokens change there, update `maestro-mobile/claude-design/src/tokens.css` to match.
