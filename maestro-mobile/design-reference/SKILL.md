---
name: maestro-design
description: Use this skill to generate well-branded interfaces and assets for Maestro (the multi-agent orchestrator for Claude agents), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick map
- `README.md` — full context: product, voice/tone, visual foundations, iconography, file index. **Start here.**
- `colors_and_type.css` — the single source of truth for all tokens (paper/ink, brass, status, type, spacing, radii, shadow, motion). Link this first; use the `--pn-*` vars (`--pn-paper`, `--pn-ink`, `--pn-brand`, `--pn-run`, etc.) and the `.t-*` type classes. Light by default; set `data-theme="dark"` on `<html>` for the warm-graphite variant.
- `assets/` — third-party agent icons (Claude, Codex, Gemini).
- `preview/` — small specimen cards for every foundation + component.
- `panel-redesign/` — the full Atelier UI kit: app shell, panels, boards, tiles, modals, team/files/skills views, buttons, terminal strip. Component styles are scoped under `.pn-*`. Lift components and CSS from here.
- `mobile-app/` — Atelier on a phone (bottom-nav, push-detail, sheets), scoped under `.m-*`.

## The 30-second brand
Warm **paper** canvas (or warm-graphite in dark mode), one restrained **brass** signature used sparingly, **Newsreader + Hanken Grotesk + JetBrains Mono**, soft radii, hairline borders, an **uppercase mono micro-label** motif, status shown by **dot + word** (never colored left-border bars), fast/mechanical motion, **Lucide** stroke icons. Voice: plain, confident, developer-to-developer, sentence case, no emoji. This is "Atelier" — an editorial workspace, the deliberate opposite of dark-neon AI-slop. Keep the paper warm and the brass rare.
