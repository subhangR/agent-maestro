# Maestro — Design System

> **Run multiple Claudes across your projects. Coordinate all of them from one place.**

This is a design system for **Maestro**, a multi-agent orchestration platform for Claude (and other) coding agents. It gives design agents the colors, type, assets, voice, and UI components needed to build on-brand interfaces, marketing material, decks, and prototypes for Maestro.

> **Note on this system — "Atelier":** the brief was a *fresh look*, and this is a redesign, not a 1:1 copy of the shipping app. It keeps Maestro's authentic DNA — a developer tool with a `>···+` command motif and monospace micro-labels — but reframes it as a **warm-paper, editorial workspace**: warm ink on warm paper, hairline dividers, and one restrained **brass "baton"** accent. It is the deliberate opposite of dark-neon AI-slop. The system is **light by default with a first-class dark variant** (warm graphite, never neon) — flip it by setting `data-theme="dark"` on `<html>`.

---

## What is Maestro?

If you've ever had four Claude sessions running on one project and three more on another — all in separate terminals with no idea what the others are doing — Maestro is for you. It's a **project manager for your Claude agents**: you define the work, Maestro coordinates who does what.

Maestro is **three programs that talk to each other**:

| Surface | What it is | Stack |
|---|---|---|
| **Desktop app** (`maestro-ui`) | A full agent workspace: terminals, file explorer, Monaco code editor, task panel, session recording, command palette. The primary product surface. | Tauri 2 · React 18 · Zustand · xterm.js · Monaco |
| **Server** (`maestro-server`) | The brain. Stores tasks, sessions, and projects as plain JSON on disk. REST + WebSocket. | Express · WebSocket · file-based persistence |
| **CLI** (`maestro-cli`) | What agents run *inside* their sessions to read tasks, report progress, and spawn other agents. | Commander.js |

### Core concepts

| Concept | Meaning |
|---|---|
| **Task** | A unit of work. Hierarchical (subtasks, dependencies), has status + priority. |
| **Session** | A running Claude instance working on tasks. Tracks a timeline, docs, status. |
| **Project** | A container for related tasks and sessions, with a working directory. |
| **Team Member** | An agent persona — a `mode` (worker / coordinator), model, tools, permissions, identity prompt. |
| **Team** | A group of team members with a leader coordinator; supports teams-of-teams. |
| **Worker / Orchestrator** | Workers do the coding. Orchestrators plan work and spawn workers. |
| **Skill / Spell** | Markdown plugins and contextual prompts that give agents extra instructions. |
| **Manifest** | A config file telling an agent what to do at startup — tasks, role, strategy. |

The product metaphor is an **orchestra conductor**: you (the maestro) raise the baton, and many agents play in coordination. That metaphor drives the visual language — the brass baton accent, the precise/mechanical motion, the "now playing" status system.

---

## Products / surfaces represented in this system

1. **Desktop app (`maestro-ui`)** — the orchestration workspace, rebuilt in Atelier. → `panel-redesign/` (app shell, panels, boards, tiles, modals, team/files/skills views, buttons, terminal strip).
2. **Mobile app** — Maestro on a phone: bottom-nav, push-detail screens, bottom-sheet modals, live terminal sheet. → `mobile-app/`.

The CLI and server have no visual surface of their own beyond terminal text, so they're represented through the (dark) terminal styling embedded in the desktop and mobile kits.

---

## Sources

This system was built by reading the open-source Maestro repository. The reader is encouraged to explore it further to build higher-fidelity designs:

- **GitHub:** [`subhangR/agent-maestro`](https://github.com/subhangR/agent-maestro) (branch `main`) — the full monorepo.
  - `maestro-ui/UI-V2-DESIGN-PLAN.md` — the v2 layout plan (icon rail + spaces panel) this kit follows.
  - `maestro-ui/MAESTRO-UI-SPEC.md` — exhaustive UI spec.
  - `maestro-ui/src/components/` — the shipping component structure and bespoke SVG icons.

> The reader does **not** need access to this repo to use the design system — everything needed is captured in the files below — but if you have access, reading the real component structure will sharpen any recreation. (The original shipped a dark, swappable-neon-theme look; Atelier is a fresh direction, not a recreation of those themes.)

---

## CONTENT FUNDAMENTALS — voice & tone

Maestro's copy is **plain-spoken, confident, and developer-to-developer**. It respects the reader's time and intelligence. It never markets at you; it explains.

**Person & address.** Second person, direct. "**You** define the work, Maestro coordinates who does what." The product refers to itself by name ("Maestro gives you…"), not "we." First-person plural is avoided.

**Tone.** Calm authority with a wink of empathy for the overwhelmed developer. The README opens by *describing the reader's pain* before naming the product. That's the house voice: relatable problem → matter-of-fact solution.

**Casing.**
- **Sentence case** for all headings, buttons, and body. ("Quick start", "Start everything", not "Quick Start" / "Start Everything").
- **UPPERCASE micro-labels** in the UI only — short mono eyebrows like `TASKS`, `RUNNING`, `WORKER`, `2 ACTIVE`. These are a styling device, not prose.
- Product nouns are capitalized as proper terms: **Task, Session, Project, Worker, Orchestrator, Skill, Manifest** — they're the domain vocabulary.

**Sentence style.** Short. Punchy. Often fragments for emphasis. *"That's it — you're running."* / *"No database to set up. No migrations. Just JSON files on disk."* Em-dashes and double-dashes (`--`) for asides. Frequent use of the rule of three.

**Technical register.** Commands are shown, not described. Copy assumes fluency with terminals, ports, and config — it does not over-explain, but it *does* define product-specific concepts in plain language ("**The server** is the brain.").

**Numbers & metrics.** Concrete and unfussy: "v18 or newer", "port 3001". Status counts are terse: "2 active", "5 done".

**Emoji.** Effectively **none** in product or docs. The brand reads as a precise instrument, not a playful consumer app. Do not add emoji.

**Examples of on-brand microcopy:**
- Button: `Spawn session` · `New task` · `Run` · `Report progress`
- Empty state: `No sessions yet. Spawn one to get started.`
- Status: `Finished the login route, starting tests` (agent progress — written as the agent would speak)
- Section eyebrow: `ACTIVE SESSIONS` · `TASK QUEUE` · `TEAM`

**Avoid:** exclamation-heavy hype, "revolutionary / seamless / effortless" marketing adjectives, emoji, Title Case headings, and addressing the user as "we."

---

## VISUAL FOUNDATIONS — "Atelier"

The aesthetic: **a precision instrument that reads like a well-set page.** Warm, calm, editorial, and dense — with a single brass signature so it never feels cold or generic. All tokens live in `colors_and_type.css` and are prefixed `--pn-*`.

### Color & vibe
- **Warm paper canvas.** A low-saturation warm greyscale (`--pn-paper #F4F2EC` → `--pn-surface` → `--pn-card`). Never pure white, never neutral grey. Surfaces *layer* to build depth: app paper → panel surface → raised card, each a step lighter/whiter.
- **One signature accent — the brass "baton"** (`--pn-brand #B26A2B`, `#E0A45A` in dark). The conductor's baton, daylit. It's the *only* warm-saturated color in the system, so it commands attention without shouting — used for the primary button on hover, the prompt glyph, the logo mark, focus, the active rail indicator. Used sparingly. This deliberately avoids the blue/purple gradient cliché of AI tools.
- **Functional status palette** — desaturated for a paper world (anti-neon): run/green `#3E8E5A`, wait/amber `#BD8A2A`, block/terracotta `#BB4D3D`, info/blue `#3F6C90`, idle/stone `#A29C8E`. **Always paired with a word or glyph — never color alone, and never as a colored left-border bar.**
- **Team identity** is a small dot or an avatar ring, not a stripe.
- **Two themes.** Light is the default. `html[data-theme="dark"]` swaps the token values for a warm-graphite variant (`--pn-paper #15130E`) — same components, no rule changes. The center terminal stays dark in both themes (light chrome wrapping a dark terminal).
- **Imagery vibe:** warm, editorial, high-contrast. Treat photography as you would in a print magazine; let the brass be the only loud note.

### Type
- **Newsreader** (serif) for editorial display, empty-state headings, and the agent "now playing" quotes (italic). **Hanken Grotesk** (sans) for all working UI — headings, body, controls. **JetBrains Mono** for code, terminals, data values, and the uppercase micro-labels.
- The **signature typographic move** is the *mono uppercase eyebrow*: 11px JetBrains Mono, 600 weight, `letter-spacing: 0.12em`, muted color (`.t-eyebrow`). It labels every section, metric, and status. Lean on it heavily.
- The **second signature move** is the *serif-italic agent quote* (`.t-quote`) — what a session is "saying" right now, set like a pull-quote.
- Display headings (`.t-display`, `.t-h1`) are Newsreader; UI headings (`.t-h2`/`.t-h3`/`.t-title`) are Hanken with tight tracking. Body is comfortable (1.5). Numbers and IDs are always mono.

### Spacing, radii, borders
- **4px base grid.** Dense but breathable — this is an information-rich tool.
- **Soft radii.** 5px (chips/inputs) → 7px (buttons) → 10px (cards/menus) → 14px (panels/modals). Soft, not bubbly; the product feels crafted, not childish.
- **Hairline borders.** 1px `--pn-line` (`#E7E3D9`) is the workhorse divider. Borders do most of the separation work — more than shadow.

### Backgrounds, surfaces & elevation
- **Flat layered surfaces**, not gradients. Depth comes from stepping up the paper ramp.
- **Soft, warm-toned drop shadows** (`--pn-sh-sm/md/pop`) are reserved for raised cards, popovers, menus, and modals. In-panel rows rely on borders + surface steps, not shadow.
- **There is no neon glow anywhere in Atelier.** Focus is a soft brass ring (`box-shadow: 0 0 0 3px var(--pn-brand-soft)`), not a halo. The live indicator is a quiet green dot with a slow ping, not a glow.
- No repeating patterns or textures in-product.

### Cards
A Maestro card = `--pn-card` fill + 1px `--pn-line` + `--pn-r-md` + `--pn-sh-sm`. On hover the shadow lifts to `--pn-sh-md` and the border brightens to `--pn-line-2`. **No colored left-border accents** — priority is a dot, status is a pill/word, team identity is a dot or avatar ring.

### Interaction states
- **Hover:** surface steps up one paper level (`--pn-hover`); borders brighten; icons go from `--pn-ink-3` to `--pn-ink`. Fast (120–140ms).
- **Press:** a quick darker fill / small scale. Mechanical, no bounce.
- **Focus:** a soft 3px brass ring (`--pn-brand-soft`) — visible and consistent across inputs, buttons, and list items.
- **Selected/active:** `--pn-active` fill, plus a short brass indicator bar on the *rail* (the one place a brass bar is allowed — it's chrome, not a card).
- **Live/running:** a green dot with a slow ping ring.

### Motion
- **Fast, mechanical, confident.** Durations 120/180/280ms. Easing is `--pn-ease-out` (cubic-bezier(0.16,1,0.3,1)) for entrances, standard ease for state changes. No bounce, no playful spring.

### Layout rules
- **Three-column desktop shell:** a ~56px icon rail (far left) → context panel → center terminal/workspace → right "Spaces" panel → ~52px spaces rail. The project tab bar is fixed at the top.
- **Fixed chrome, scrolling content.** Rails, headers, and toolbars stay put; only content regions scroll, with thin custom scrollbars tinted in the paper ramp.

---

## ICONOGRAPHY

**System: outline / stroke icons, 1.5–2px stroke, on a 24px grid.** We standardize on **[Lucide](https://lucide.dev)** (loaded from CDN), which matches the shipping app's stroke weight and geometric, rounded-join feel.

- **Stroke, not fill.** `stroke: currentColor`, `stroke-width: 1.75`, no fill. Icons inherit text color: `--pn-ink-3` at rest, `--pn-ink` on hover, `--pn-brand` when active/selected.
- **Sizes:** 16px (inline / dense lists), 18–19px (buttons, rail), 20px (toolbar), 24px (empty states). Never below 14px.
- **Common icons** map to product nouns: `list-checks` (Tasks), `users` (Members/Teams), `sparkles` (Skills/Spells), `folder-tree` (Files), `terminal` (Terminal/Session), `pen-tool` (Board), `git-branch` (worktrees), `play` (run), `circle-dot` (status).
- **No emoji** as iconography. **No PNG icons** in the UI except third-party brand logos (Claude, Codex, Gemini) which ship as small PNGs — these live in `assets/` and are used at their native size beside agent/session items.
- **Unicode glyphs** appear only as terminal/prompt characters (`>`, `··· `, `+`) — these form the **logo motif**, not general iconography.

### Logo
The Maestro mark is the **command-prompt chevron** `>` trailed by three dots and a `+` (`> ··· +`) — read as *"a command spawns parallel agents."* In Atelier the mark is **brass on paper**. See `preview/brand-logo.html` and the kit headers for the lockup. (We do not redraw the icon as raw SVG in deliverables — reference the CSS lockup in the kits.)

> **Substitution flagged:** the app's in-house SVG icon set is approximated with **Lucide** (CDN). If pixel-exact icons are required, import the original SVGs from `maestro-ui/src/components/` in the repo and swap them in.

---

## Index — what's in this system

| Path | What it is |
|---|---|
| `README.md` | This file — context, voice, visual foundations, iconography, index. |
| `colors_and_type.css` | The single source of truth for all `--pn-*` tokens (paper/ink, brass, status, type, spacing, radii, shadow, motion) + `.t-*` type classes, with the dark variant. **Import this first.** |
| `styles.css` | Thin root entry point — just `@import`s `colors_and_type.css`. Link either. |
| `SKILL.md` | Agent-Skill manifest so this system works as a downloadable Claude skill. |
| `assets/` | Third-party agent icons (Claude, Codex, Gemini). |
| `preview/` | Small HTML specimen cards that populate the Design System tab (Paper & Ink, Brass, Status, Type, Spacing, Components, Brand). |
| `panel-redesign/` | The Atelier desktop UI kit — app shell, panels, boards, tiles, modals, team/files/skills views, buttons, terminal strip. Component CSS scoped under `.pn-*` (`theme.css` + `theme-dark.css`). |
| `mobile-app/` | The Atelier mobile kit — bottom-nav app, push-detail, sheets, live terminal. Scoped under `.m-*`. |

**Getting started in a deliverable:** link `colors_and_type.css` (or `styles.css`), use the `--pn-*` tokens and `.t-*` type classes, set `data-theme="dark"` on `<html>` for dark mode, load Lucide from CDN for icons, and pull components from `panel-redesign/` (desktop) or `mobile-app/` (mobile). Keep the voice plain and confident; keep the paper warm and the brass rare.
