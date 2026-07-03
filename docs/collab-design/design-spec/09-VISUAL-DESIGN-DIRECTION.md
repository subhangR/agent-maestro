# 09 — Visual Design Direction

Guidance, not prescription. This lives **inside an existing desktop app** with an established look; collaboration must feel native to it, not like an embedded third-party chat widget. Design the visuals — but design them *for Maestro*.

## The host aesthetic (match it)
Maestro is a **dark, developer-tool** app — terminal-adjacent, dense, keyboard-friendly, calm. Think a code editor / terminal multiplexer, not a consumer social app.
- **Dark theme first** (a light theme may exist; design dark as primary).
- Restrained accent color; content-forward; generous use of monospace for code/identity/prompt bodies.
- Existing design tokens (colors, spacing, radius, fonts) should be **reused** — pull them from the app's theme rather than inventing a new palette. When you need collaboration-specific accents (presence, unread, agent), derive them from the existing scale.

## Layout system
- **Space Window** is a **3-column** layout at desktop width: `channel list (narrow) | message stream (fluid) | members (narrow)`. Columns collapse progressively as width shrinks.
- **Collab Panel** is a single narrow column (left panel width).
- **Section tabs** (Tasks/Team/Spells/Members) use a **master/detail or list** pattern in the center; Members can be a right column that's always present in the Messages view.
- **Modals** center on desktop, become **full-screen sheets** on mobile.
- Density: **compact** (this is a pro tool) but with enough breathing room in chat to be readable during long sessions.

## Responsive targets
Same React UI ships as **desktop (Tauri, wide)** and a **web app on phones**. Every surface needs:
- **Desktop (primary):** full 3-column Space Window; hover affordances OK.
- **Tablet:** members column collapses to a toggle; channel list may become a drawer.
- **Mobile:** single column; channel list + members behind toggles/drawers; tabs as a scrollable strip or bottom bar; modals as sheets; **no hover-only actions** (message actions need a tap target — e.g. long-press or an inline "···").

## Key visual systems to design
1. **Presence** — online/idle/offline must be distinguishable **without relying on color alone** (shape/position/label too, for accessibility). Include an **agent** presence treatment ("working" vs idle).
2. **Unread & mentions** — a clear hierarchy: read → unread (bold + count) → mention (distinct/red). Consistent across rail avatars, channel list, and tabs.
3. **Human vs. agent** — agents are members but should be instantly recognizable (badge/glyph/frame on avatar, a subtle author treatment). Never confusing about whether a message came from a person or an agent.
4. **Provenance** — a compact, legible badge language for shared/pulled (↑ ↓ ⇅ + count) that reads at a glance on dense rows.
5. **Optimistic/pending** — a calm "in-flight" treatment for the user's own sends/pulls (not alarming), with a clear failed state.
6. **Status & priority** — task status pills and priority indicators need a consistent, colorblind-safe system.

## Motion
- **Realtime arrivals** (messages, members, count ticks) should appear smoothly, not jarringly — subtle enter animations; don't yank scroll while a user reads history.
- **Optimistic → confirmed** — a gentle settle when a pending message confirms.
- **Agent invoke** — give `@mention → invoke` a small, satisfying feedback moment ("Invoking @agent…" → agent "working" → result posts). This is the signature interaction; make it feel alive.
- Keep motion **fast and quiet** — this is a tool people live in for hours.

## Accessibility (required)
- Contrast that holds on the dark theme.
- Status/presence/unread not conveyed by color alone.
- Full keyboard path: Enter/Shift+Enter in composer; Esc closes modals/threads/edit; logical tab order; focus returns after modals; ARIA on menus, modals, and live regions (so new messages are announced).
- Adequate tap targets on mobile; no hover-only critical actions.

## Component priorities (design these first)
1. **Message bubble** (all states) + **composer** — the most-used, highest-leverage.
2. **Modal shell**, **empty-state card**, **error banner**, **section header** — reused everywhere.
3. **Shared-entity row** (the Tasks/Team/Spells master pattern) — one component, three skins.
4. **Avatar system** (user/agent/space + presence).
5. **Space Window frame** (chrome + tabs + 3-column responsive shell).

## What to deliver (suggested)
- The full **Space Window** across its 6 tabs, desktop + mobile.
- The **Collab Panel** (all auth/repo/spaces states).
- All **modals** (create space/channel, invite, push/publish, share-to-space).
- The **full-vision** surfaces: threads, DMs, reactions, presence, unread/badges, search, notifications, member profile, agent-in-chat.
- A **component sheet** with every state from `04` and `05`.
- A short **token/style guide** deriving collaboration accents (presence, unread, agent, provenance) from Maestro's existing theme.

## Reference material shipped with the product (for grounding)
The product's `docs/` contains the source design intent this spec was distilled from — useful if you want deeper context: `COLLAB_SPACE_UI_UX_PLAN.md`, `SPACE_WINDOW_AND_RAIL_PLAN.md`, `MESSAGING_IMPLEMENTATION_PLAN.md`, `ENTITY_PUSH_PULL_PLAN.md`, `COLLABORATION_DESIGN_PLAN.md`, and `slack-research-for-maestro.md` (the agent-first + Slack-parity analysis).
